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

import { eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  sessionSummaries,
  subjects,
  topicNotes,
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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7().slice(0, 8);
const PREFIX = `integration-session-summary-${RUN_ID}`;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

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
      expect(results.map((result) => result.summary.feedbackStatus)).toEqual([
        'available',
        'available',
      ]);
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
