/**
 * Integration: session-summary.ts — concurrent submitSummary dedup
 *
 * [CR-2026-05-19-M3] SITE 1: Two concurrent submitSummary calls for the same
 * session must award XP exactly ONCE. Pre-fix: both passed the existence check,
 * both inserted a summary row, and applyReflectionMultiplier ran twice →
 * doubled XP. Post-fix: advisory lock + transaction gate serialises concurrent
 * calls; the second sees the already-submitted row and returns it idempotently.
 *
 * No mocks of internal services or database — real DB only. The external LLM
 * boundary uses the provider registry fixture so routeAndCall remains real.
 *
 * The test verifies the idempotency invariant by exercising the INSERT+lock
 * path directly through a real DB and relying on the unique-lock behaviour for
 * the second concurrent call.
 * The test verifies that after two concurrent calls, XP is awarded at most
 * once (reflectionMultiplierApplied is true on exactly 1 xp_ledger row).
 */

import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  sessionSummaries,
  subjects,
  topicNotes,
  webhookIdempotencyKeys,
  xpLedger,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { generateUUIDv7 } from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';
import {
  llmStructuredJson,
  registerLlmProviderFixture,
} from '../../test-utils/llm-provider-fixtures';
import { _resetCircuits } from '../llm';
import { NotFoundError } from '@eduagent/schemas';
import { buildNowFeed, buildNowOverflow } from '../now-feed';
import {
  getSessionSummary,
  retrySummaryFeedback,
  submitSummary,
} from './session-summary';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function feedbackRetryCoordinationKey(
  profileId: string,
  sessionId: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${profileId}\0${sessionId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function waitForFeedbackRetryReservation(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const webhookId = await feedbackRetryCoordinationKey(profileId, sessionId);
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [row] = await db
      .select({ receivedAt: webhookIdempotencyKeys.receivedAt })
      .from(webhookIdempotencyKeys)
      .where(
        and(
          eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
          eq(webhookIdempotencyKeys.webhookId, webhookId),
        ),
      );
    if (row) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7().slice(0, 8);
const PREFIX = `integration-session-summary-${RUN_ID}`;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];
const seededFeedbackRetryKeys: string[] = [];

async function seedFullSessionWithXpEntry(): Promise<{
  db: Database;
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
}> {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  // [WI-1128] Key clerkUserId/email off the freshly-generated accountId —
  // this helper is called once per test via beforeEach cleanup; a fixed
  // (RUN_ID-scoped but call-invariant) string collides with legacy
  // `accounts` unique columns across calls (the onConflictDoNothing
  // silently no-ops, leaving profiles.account_id FK dangling for the
  // fresh accountId).
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `${PREFIX}-clerk-${accountId}`,
    email: `${PREFIX}-${accountId}@integration.test`,
    displayName: 'Summary Test User',
    birthYear: 2005,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Mathematics' })
    .returning();

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning();

  const [book] = await db
    .insert(curriculumBooks)
    .values({ subjectId: subject!.id, title: 'Algebra I', sortOrder: 0 })
    .returning();

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Linear Equations',
      description: 'Solve equations with one variable.',
      sortOrder: 0,
      estimatedMinutes: 20,
    })
    .returning();

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      exchangeCount: 3,
    })
    .returning();
  seededFeedbackRetryKeys.push(
    await feedbackRetryCoordinationKey(profileId, session!.id),
    // Transitional cleanup keeps a RED privacy-regression run from leaking
    // the cleartext key produced by the pre-fix implementation.
    `${profileId}:${session!.id}`,
  );

  // Seed an XP ledger entry so applyReflectionMultiplier has something to act on
  await db.insert(xpLedger).values({
    profileId,
    topicId: topic!.id,
    subjectId: subject!.id,
    amount: 100,
    reflectionMultiplierApplied: false,
  });

  return {
    db,
    profileId,
    subjectId: subject!.id,
    topicId: topic!.id,
    sessionId: session!.id,
  };
}

async function cleanupByPrefix() {
  const db = createIntegrationDb();
  for (const webhookId of seededFeedbackRetryKeys) {
    await db
      .delete(webhookIdempotencyKeys)
      .where(
        and(
          eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
          eq(webhookIdempotencyKeys.webhookId, webhookId),
        ),
      );
  }
  seededFeedbackRetryKeys.length = 0;
  await deleteV2IdentitiesForTest(db, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

describeIfDb(
  'submitSummary concurrent idempotency [CR-2026-05-19-M3 SITE 1]',
  () => {
    let llmFixture: ReturnType<typeof registerLlmProviderFixture> | undefined;

    beforeAll(() => {
      _resetCircuits();
      llmFixture = registerLlmProviderFixture({
        chatResponse: llmStructuredJson({
          feedback: 'Good work',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      });
    });

    beforeEach(async () => {
      _resetCircuits();
      llmFixture?.clearCalls();
      llmFixture?.clearChatError();
      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'Good work',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );
      await cleanupByPrefix();
    });

    afterAll(async () => {
      llmFixture?.dispose();
      _resetCircuits();
      await cleanupByPrefix();
    });

    // [BREAK] Pre-fix: two concurrent calls both see "no summary", both INSERT,
    // both run applyReflectionMultiplier → reflectionMultiplierApplied flipped
    // to true twice (noop the second time due to the `reflectionMultiplierApplied=false`
    // guard, but the summary row is duplicated — only ONE row should exist).
    // Post-fix: advisory lock serialises the calls; only ONE summary row written.
    it('[BREAK CR-2026-05-19-M3] two concurrent submitSummary calls produce exactly one summary row', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();

      const [first, second] = await Promise.all([
        submitSummary(createIntegrationDb(), profileId, sessionId, {
          content: 'My summary',
        }),
        submitSummary(createIntegrationDb(), profileId, sessionId, {
          content: 'My summary',
        }),
      ]);

      const allSummaries = await db.query.sessionSummaries.findMany({
        where: eq(sessionSummaries.sessionId, sessionId),
      });

      expect(allSummaries).toHaveLength(1);
      expect(first.summary.id).toBe(allSummaries[0]!.id);
      expect(second.summary.id).toBe(allSummaries[0]!.id);
    });

    it('[BREAK CR-2026-05-19-M3] applyReflectionMultiplier applied exactly once even with concurrent summary writes', async () => {
      const { db, profileId, topicId, sessionId } =
        await seedFullSessionWithXpEntry();

      // Simulate two concurrent applyReflectionMultiplier calls (what the race causes).
      // Both start with reflectionMultiplierApplied=false, both try to flip it.
      // The UPDATE has `AND reflectionMultiplierApplied=false` so only ONE succeeds.
      const { applyReflectionMultiplier } = await import('../xp');
      const [result1, result2] = await Promise.all([
        applyReflectionMultiplier(createIntegrationDb(), profileId, sessionId),
        applyReflectionMultiplier(createIntegrationDb(), profileId, sessionId),
      ]);

      // One application returns applied=true, the other returns applied=false
      // (because the guard prevents double-application).
      const appliedCount = [result1.applied, result2.applied].filter(
        Boolean,
      ).length;
      expect(appliedCount).toBe(1);

      // The xpLedger row must show reflectionMultiplierApplied=true exactly once.
      const xpRow = await db.query.xpLedger.findFirst({
        where: eq(xpLedger.topicId, topicId),
      });
      expect(xpRow).not.toBeNull();
      expect(xpRow!.reflectionMultiplierApplied).toBe(true);

      // XP should be multiplied only once (100 * 1.5 = 150, not 100 * 1.5 * 1.5).
      // REFLECTION_XP_MULTIPLIER = 1.5 per xp.ts
      expect(xpRow!.amount).toBeLessThanOrEqual(200); // not double-multiplied
    });

    it('[WI-2183] saves learner content exactly once when the feedback provider fails', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatError(new Error('provider unavailable'));

      const result = await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      const rows = await db.query.sessionSummaries.findMany({
        where: eq(sessionSummaries.sessionId, sessionId),
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]!.content).toBe(
        'I learned how a variable can stand for an unknown value.',
      );
      expect(rows[0]!.aiFeedback).toBeNull();
      expect(result.summary.feedbackStatus).toBe('unavailable');
    });

    it('[WI-2183] successful feedback retry preserves the summary row and XP award', async () => {
      const { db, profileId, topicId, sessionId } =
        await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      const submitted = await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      const xpBefore = await db.query.xpLedger.findFirst({
        where: eq(xpLedger.topicId, topicId),
      });
      const notesBefore = await db.query.topicNotes.findMany({
        where: eq(topicNotes.sessionId, sessionId),
      });

      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'You clearly explained the role of the unknown value.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );
      const retried = await retrySummaryFeedback(db, profileId, sessionId);
      const rows = await db.query.sessionSummaries.findMany({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      const xpAfter = await db.query.xpLedger.findFirst({
        where: eq(xpLedger.topicId, topicId),
      });
      const notesAfter = await db.query.topicNotes.findMany({
        where: eq(topicNotes.sessionId, sessionId),
      });
      const coordinationRows = await db
        .select({ webhookId: webhookIdempotencyKeys.webhookId })
        .from(webhookIdempotencyKeys)
        .where(
          and(
            eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
            eq(
              webhookIdempotencyKeys.webhookId,
              await feedbackRetryCoordinationKey(profileId, sessionId),
            ),
          ),
        );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(submitted.summary.id);
      expect(retried.summary.feedbackStatus).toBe('available');
      expect(retried.summary.aiFeedback).toBe(
        'You clearly explained the role of the unknown value.',
      );
      expect(xpAfter!.amount).toBe(xpBefore!.amount);
      expect(xpAfter!.reflectionMultiplierApplied).toBe(
        xpBefore!.reflectionMultiplierApplied,
      );
      expect(notesBefore).toHaveLength(1);
      expect(notesAfter).toHaveLength(1);
      expect(notesAfter[0]!.id).toBe(notesBefore[0]!.id);
      expect(coordinationRows).toHaveLength(0);

      const providerCallsBeforeRepeatedRetry = llmFixture?.chatCalls.length;
      const repeated = await retrySummaryFeedback(db, profileId, sessionId);
      const rowsAfterRepeatedRetry = await db.query.sessionSummaries.findMany({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      const xpAfterRepeatedRetry = await db.query.xpLedger.findFirst({
        where: eq(xpLedger.topicId, topicId),
      });
      const notesAfterRepeatedRetry = await db.query.topicNotes.findMany({
        where: eq(topicNotes.sessionId, sessionId),
      });
      const coordinationRowsAfterRepeatedRetry = await db
        .select({ webhookId: webhookIdempotencyKeys.webhookId })
        .from(webhookIdempotencyKeys)
        .where(
          and(
            eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
            eq(
              webhookIdempotencyKeys.webhookId,
              await feedbackRetryCoordinationKey(profileId, sessionId),
            ),
          ),
        );

      expect(llmFixture?.chatCalls).toHaveLength(
        providerCallsBeforeRepeatedRetry ?? 0,
      );
      expect(repeated.summary).toMatchObject({
        id: retried.summary.id,
        status: retried.summary.status,
        aiFeedback: retried.summary.aiFeedback,
        feedbackStatus: 'available',
      });
      expect(rowsAfterRepeatedRetry).toHaveLength(1);
      expect(rowsAfterRepeatedRetry[0]!.id).toBe(rows[0]!.id);
      expect(rowsAfterRepeatedRetry[0]!.status).toBe(rows[0]!.status);
      expect(rowsAfterRepeatedRetry[0]!.aiFeedback).toBe(rows[0]!.aiFeedback);
      expect(xpAfterRepeatedRetry!.amount).toBe(xpAfter!.amount);
      expect(xpAfterRepeatedRetry!.reflectionMultiplierApplied).toBe(
        xpAfter!.reflectionMultiplierApplied,
      );
      expect(notesAfterRepeatedRetry).toHaveLength(1);
      expect(notesAfterRepeatedRetry[0]!.id).toBe(notesAfter[0]!.id);
      expect(coordinationRowsAfterRepeatedRetry).toHaveLength(0);
    });

    it('[WI-2183] concurrent feedback retries evaluate at most once and keep one summary row', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      llmFixture?.clearCalls();
      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'Clear explanation.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );

      const results = await Promise.all([
        retrySummaryFeedback(createIntegrationDb(), profileId, sessionId),
        retrySummaryFeedback(createIntegrationDb(), profileId, sessionId),
      ]);
      const rows = await db.query.sessionSummaries.findMany({
        where: eq(sessionSummaries.sessionId, sessionId),
      });

      expect(llmFixture?.chatCalls).toHaveLength(1);
      const feedbackStatuses = results.map(
        (result) => result.summary.feedbackStatus,
      );
      expect(feedbackStatuses).toContain('available');
      expect(
        feedbackStatuses.every(
          (status) => status === 'available' || status === 'unavailable',
        ),
      ).toBe(true);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.aiFeedback).toBe('Clear explanation.');
    });

    it('[WI-2183] concurrent unavailable retries share the winner state without a second evaluation', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      llmFixture?.clearCalls();

      const results = await Promise.all([
        retrySummaryFeedback(createIntegrationDb(), profileId, sessionId),
        retrySummaryFeedback(createIntegrationDb(), profileId, sessionId),
      ]);

      expect(llmFixture?.chatCalls).toHaveLength(1);
      expect(results.map((result) => result.summary.feedbackStatus)).toEqual([
        'unavailable',
        'unavailable',
      ]);
    });

    it('[WI-2183] unavailable retry establishes a cooldown without exposing internal state', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      const beforeRetry = await db.query.sessionSummaries.findFirst({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      llmFixture?.clearCalls();

      const first = await retrySummaryFeedback(db, profileId, sessionId);
      expect(first.summary.feedbackStatus).toBe('unavailable');
      expect(llmFixture?.chatCalls).toHaveLength(1);

      llmFixture?.clearCalls();
      const second = await retrySummaryFeedback(db, profileId, sessionId);
      const publicSummary = await getSessionSummary(db, profileId, sessionId);
      const storedSummary = await db.query.sessionSummaries.findFirst({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      const coordinationKey = await feedbackRetryCoordinationKey(
        profileId,
        sessionId,
      );
      const coordinationRows = await db
        .select({ webhookId: webhookIdempotencyKeys.webhookId })
        .from(webhookIdempotencyKeys)
        .where(
          and(
            eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
            eq(webhookIdempotencyKeys.webhookId, coordinationKey),
          ),
        );

      expect(second.summary.feedbackStatus).toBe('unavailable');
      expect(llmFixture?.chatCalls).toHaveLength(0);
      expect(publicSummary?.feedbackStatus).toBe('unavailable');
      expect(publicSummary?.aiFeedback).toBeNull();
      expect(storedSummary?.aiFeedback).toBeNull();
      expect(storedSummary?.updatedAt.getTime()).toBe(
        beforeRetry?.updatedAt.getTime(),
      );
      expect(coordinationRows).toEqual([{ webhookId: coordinationKey }]);
      expect(coordinationKey).toMatch(/^[a-f0-9]{64}$/);
      expect(coordinationKey).not.toContain(profileId);
      expect(coordinationKey).not.toContain(sessionId);
    });

    it('[WI-2183] a committed coordination claim is visible without changing summary ordering while the LLM call is in flight', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      const beforeRetry = await db.query.sessionSummaries.findFirst({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      llmFixture?.clearCalls();
      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'Clear explanation.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );

      const baseProvider = (
        llmFixture as unknown as {
          provider: { chat: (...args: unknown[]) => Promise<unknown> };
        }
      ).provider;
      const originalChat = baseProvider.chat.bind(baseProvider);
      const enteredLlm = deferred();
      const releaseLlm = deferred();
      baseProvider.chat = async (...args: unknown[]) => {
        enteredLlm.resolve();
        await releaseLlm.promise;
        return originalChat(...args);
      };

      let firstRetry: ReturnType<typeof retrySummaryFeedback> | undefined;
      try {
        firstRetry = retrySummaryFeedback(
          createIntegrationDb(),
          profileId,
          sessionId,
        );
        await enteredLlm.promise;

        expect(
          await waitForFeedbackRetryReservation(db, profileId, sessionId),
        ).toBe(true);
        const heldSummary = await db.query.sessionSummaries.findFirst({
          where: eq(sessionSummaries.sessionId, sessionId),
        });
        expect(heldSummary?.updatedAt.getTime()).toBe(
          beforeRetry?.updatedAt.getTime(),
        );

        const second = await Promise.race([
          retrySummaryFeedback(createIntegrationDb(), profileId, sessionId),
          new Promise<never>((_resolve, reject) => {
            setTimeout(
              () => reject(new Error('concurrent retry blocked on the LLM')),
              500,
            );
          }),
        ]);
        expect(second.summary.feedbackStatus).toBe('unavailable');
      } finally {
        baseProvider.chat = originalChat;
        releaseLlm.resolve();
        await firstRetry?.catch(() => undefined);
      }

      expect(llmFixture?.chatCalls).toHaveLength(1);
    }, 30_000);

    it('[WI-2183] a stale lease holder cannot overwrite a later recovery', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      llmFixture?.clearCalls();

      const baseProvider = (
        llmFixture as unknown as {
          provider: { chat: (...args: unknown[]) => Promise<unknown> };
        }
      ).provider;
      const originalChat = baseProvider.chat.bind(baseProvider);
      const enteredFirstLlm = deferred();
      const releaseFirstLlm = deferred();
      let providerCall = 0;
      baseProvider.chat = async (...args: unknown[]) => {
        providerCall += 1;
        if (providerCall === 1) {
          enteredFirstLlm.resolve();
          await releaseFirstLlm.promise;
          llmFixture?.setChatResponse(
            llmStructuredJson({
              feedback: 'Stale feedback must not win.',
              hasUnderstandingGaps: false,
              gapAreas: [],
              isAccepted: true,
            }),
          );
        } else {
          llmFixture?.setChatResponse(
            llmStructuredJson({
              feedback: 'Fresh recovery wins.',
              hasUnderstandingGaps: false,
              gapAreas: [],
              isAccepted: true,
            }),
          );
        }
        return originalChat(...args);
      };

      let staleRetry: ReturnType<typeof retrySummaryFeedback> | undefined;
      try {
        staleRetry = retrySummaryFeedback(
          createIntegrationDb(),
          profileId,
          sessionId,
        );
        await enteredFirstLlm.promise;
        expect(
          await waitForFeedbackRetryReservation(db, profileId, sessionId),
        ).toBe(true);

        await db
          .update(webhookIdempotencyKeys)
          .set({ receivedAt: new Date(Date.now() - 60_000) })
          .where(
            and(
              eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
              eq(
                webhookIdempotencyKeys.webhookId,
                await feedbackRetryCoordinationKey(profileId, sessionId),
              ),
            ),
          );
        const fresh = await retrySummaryFeedback(
          createIntegrationDb(),
          profileId,
          sessionId,
        );

        expect(fresh.summary.aiFeedback).toBe('Fresh recovery wins.');
        releaseFirstLlm.resolve();
        const stale = await staleRetry;
        expect(stale.summary.aiFeedback).toBe('Fresh recovery wins.');
      } finally {
        baseProvider.chat = originalChat;
        releaseFirstLlm.resolve();
        await staleRetry?.catch(() => undefined);
      }

      const stored = await db.query.sessionSummaries.findFirst({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      expect(llmFixture?.chatCalls).toHaveLength(2);
      expect(stored?.aiFeedback).toBe('Fresh recovery wins.');
    }, 30_000);

    it('[WI-2183] retries again after the unavailable cooldown expires', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      await retrySummaryFeedback(db, profileId, sessionId);

      await db
        .update(webhookIdempotencyKeys)
        .set({ receivedAt: new Date(Date.now() - 10 * 60 * 1000) })
        .where(
          and(
            eq(webhookIdempotencyKeys.source, 'summary-feedback-retry'),
            eq(
              webhookIdempotencyKeys.webhookId,
              await feedbackRetryCoordinationKey(profileId, sessionId),
            ),
          ),
        );
      llmFixture?.clearCalls();
      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'Clear explanation after the cooldown.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );

      const recovered = await retrySummaryFeedback(db, profileId, sessionId);

      expect(llmFixture?.chatCalls).toHaveLength(1);
      expect(recovered.summary.feedbackStatus).toBe('available');
      expect(recovered.summary.aiFeedback).toBe(
        'Clear explanation after the cooldown.',
      );
    });

    it('[WI-2183] preserves an unrelated summary update and status while feedback evaluation is held', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      const submitted = await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      expect(submitted.summary.status).toBe('submitted');
      llmFixture?.clearCalls();
      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'Clear explanation.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );

      const baseProvider = (
        llmFixture as unknown as {
          provider: { chat: (...args: unknown[]) => Promise<unknown> };
        }
      ).provider;
      const originalChat = baseProvider.chat.bind(baseProvider);
      const enteredLlm = deferred();
      const releaseLlm = deferred();
      baseProvider.chat = async (...args: unknown[]) => {
        enteredLlm.resolve();
        await releaseLlm.promise;
        return originalChat(...args);
      };

      let retry: ReturnType<typeof retrySummaryFeedback> | undefined;
      try {
        retry = retrySummaryFeedback(
          createIntegrationDb(),
          profileId,
          sessionId,
        );
        await enteredLlm.promise;
        expect(
          await waitForFeedbackRetryReservation(db, profileId, sessionId),
        ).toBe(true);

        await db
          .update(sessionSummaries)
          .set({
            learnerRecap: 'A recap written by the normal summary pipeline.',
            narrative: 'A parent-facing narrative written concurrently.',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sessionSummaries.sessionId, sessionId),
              eq(sessionSummaries.profileId, profileId),
            ),
          );
        releaseLlm.resolve();

        const result = await retry;
        expect(result.summary.feedbackStatus).toBe('available');
        expect(result.summary.status).toBe('submitted');
      } finally {
        baseProvider.chat = originalChat;
        releaseLlm.resolve();
        await retry?.catch(() => undefined);
      }

      const stored = await db.query.sessionSummaries.findFirst({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      expect(stored?.aiFeedback).toBe('Clear explanation.');
      expect(stored?.status).toBe('submitted');
      expect(stored?.learnerRecap).toBe(
        'A recap written by the normal summary pipeline.',
      );
      expect(stored?.narrative).toBe(
        'A parent-facing narrative written concurrently.',
      );
    }, 30_000);

    it('[WI-2183] feedback retry does not project an old recap back into the Now feed', async () => {
      const { db, profileId, sessionId } = await seedFullSessionWithXpEntry();
      llmFixture?.setChatResponse('provider returned no JSON');
      await submitSummary(db, profileId, sessionId, {
        content: 'I learned how a variable can stand for an unknown value.',
      });
      const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await db
        .update(sessionSummaries)
        .set({
          learnerRecap: 'This recap became visible ten days ago.',
          updatedAt: oldTimestamp,
        })
        .where(
          and(
            eq(sessionSummaries.sessionId, sessionId),
            eq(sessionSummaries.profileId, profileId),
          ),
        );
      llmFixture?.setChatResponse(
        llmStructuredJson({
          feedback: 'Clear explanation.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }),
      );

      await retrySummaryFeedback(db, profileId, sessionId);
      const stored = await db.query.sessionSummaries.findFirst({
        where: eq(sessionSummaries.sessionId, sessionId),
      });
      const feed = await buildNowFeed(db, profileId, 'self');
      const overflow = await buildNowOverflow(db, profileId, 'self');

      expect(stored?.updatedAt.getTime()).toBe(oldTimestamp.getTime());
      expect([...feed.cards, ...overflow.items]).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            params: expect.objectContaining({
              ledgerKind: 'recap_ready',
              sessionId,
            }),
          }),
        ]),
      );
    });

    it('[WI-2183] denies feedback retry for a session owned by another profile', async () => {
      const { db, sessionId } = await seedFullSessionWithXpEntry();

      await expect(
        retrySummaryFeedback(db, generateUUIDv7(), sessionId),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(llmFixture?.chatCalls).toHaveLength(0);
    });
  },
);

describeIfDb('getSessionSummary ownership hardening [WI-80]', () => {
  beforeEach(async () => {
    await cleanupByPrefix();
  });

  afterAll(async () => {
    await cleanupByPrefix();
  });

  it('[WI-80] suppresses nextTopicTitle when nextTopicId is mixed-parent', async () => {
    const { db, profileId, subjectId, sessionId } =
      await seedFullSessionWithXpEntry();

    const foreignAccountId = generateUUIDv7();
    const foreignProfileId = generateUUIDv7();
    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId: foreignAccountId,
      profileId: foreignProfileId,
      clerkUserId: `${PREFIX}-foreign-clerk`,
      email: `${PREFIX}-foreign@integration.test`,
      displayName: 'Foreign Summary User',
      birthYear: 2005,
      isOwner: true,
    });
    seededAccountIds.push(foreignAccountId);
    seededProfileIds.push(foreignProfileId);

    const [foreignSubject] = await db
      .insert(subjects)
      .values({
        profileId: foreignProfileId,
        name: 'Foreign Curriculum Subject',
        status: 'active',
      })
      .returning();
    const [foreignCurriculum] = await db
      .insert(curricula)
      .values({ subjectId: foreignSubject!.id, version: 1 })
      .returning();
    const [ownedBook] = await db
      .insert(curriculumBooks)
      .values({
        subjectId,
        title: 'Owned Mixed Parent Book',
        sortOrder: 1,
      })
      .returning();
    const [mixedParentTopic] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: foreignCurriculum!.id,
        bookId: ownedBook!.id,
        title: 'Mixed Parent Next Topic',
        description: 'Book is owned, curriculum is not the session subject.',
        sortOrder: 1,
        estimatedMinutes: 20,
      })
      .returning();

    await db.insert(sessionSummaries).values({
      sessionId,
      profileId,
      content: 'Learner summary',
      status: 'accepted',
      nextTopicId: mixedParentTopic!.id,
    });

    const summary = await getSessionSummary(db, profileId, sessionId);

    expect(summary).not.toBeNull();
    expect(summary!.nextTopicId).toBe(mixedParentTopic!.id);
    expect(summary!.nextTopicTitle).toBeNull();
  });
});
