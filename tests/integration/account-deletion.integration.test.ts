/**
 * Integration: Account Deletion (P0-004)
 *
 * Exercises POST /v1/account/delete, POST /v1/account/cancel-deletion, and
 * GET /v1/account/export via the real app + real database.
 *
 * Mocked boundaries:
 * - JWT verification (Clerk JWKS) — intercepted via global fetch mock in setup.ts
 * - Inngest event HTTP API — intercepted via global fetch mock
 *
 * Validates:
 * 1. POST /account/delete returns 200 with gracePeriodEnds
 * 2. POST /account/delete sets deletionScheduledAt on the account row
 * 3. POST /account/delete emits app/account.deletion-scheduled Inngest event
 * 4. POST /account/cancel-deletion returns 200 and sets deletionCancelledAt
 * 5. GET /account/export returns profile data for the account
 * 6. Both mutation endpoints require authentication (401 without token)
 */

import { eq, sql } from 'drizzle-orm';
import {
  accounts,
  assessments,
  bookmarks,
  byokWaitlist,
  challengeRoundCooldowns,
  consentGrant,
  consentReceipt,
  consentRequest,
  consentStates,
  curricula,
  curriculumAdaptations,
  curriculumBooks,
  curriculumTopics,
  deletionAudit,
  dictationResults,
  familyLinks,
  familyPreferences,
  financialRecord,
  learningSessions,
  login,
  memoryDedupDecisions,
  memoryFacts,
  membership,
  needsDeepeningTopics,
  notificationLog,
  nudges,
  organization,
  parkingLotItems,
  pendingNotices,
  person,
  practiceActivityEvents,
  celebrationEvents,
  progressSnapshots,
  progressSummaries,
  milestones,
  monthlyReports,
  weeklyReports,
  profiles,
  quizMasteryItems,
  quizMissedItems,
  quizRounds,
  retentionCards,
  sessionEmbeddings,
  sessionEvents,
  sessionSummaries,
  streaks,
  subjects,
  supportMessages,
  teachingPreferences,
  topicNotes,
  vocabulary,
  vocabularyRetentionCards,
  withdrawalArchivePreferences,
  xpLedger,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
  isIdentityV2Enabled,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';
import {
  executeDeletion,
  scheduleDeletion,
} from '../../apps/api/src/services/deletion';
import {
  executeDeletionV2,
  scheduleDeletionV2,
} from '../../apps/api/src/services/identity-v2/deletion-v2';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-deletion-user';
const AUTH_EMAIL = 'integration-deletion@integration.test';

async function loadDeletionState(accountId: string): Promise<{
  deletionScheduledAt: Date | null;
  deletionCancelledAt: Date | null;
} | null> {
  const db = createIntegrationDb();
  if (isIdentityV2Enabled()) {
    return (
      (await db.query.organization.findFirst({
        where: eq(organization.id, accountId),
        columns: { deletionScheduledAt: true, deletionCancelledAt: true },
      })) ?? null
    );
  }

  return (
    (await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
      columns: { deletionScheduledAt: true, deletionCancelledAt: true },
    })) ?? null
  );
}

beforeAll(() => {
  mockInngestEvents();
});

async function createOwnerProfile(): Promise<string> {
  const profile = await createOwnerProfileRecord();
  return profile.profileId;
}

async function createOwnerProfileRecord(): Promise<{
  profileId: string;
  accountId: string;
}> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Deletion Test User',
        birthYear: 2000,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  const apiProfile = body.profile as { id: string; accountId?: string };
  const profileId = apiProfile.id;
  if (apiProfile.accountId) {
    return { profileId, accountId: apiProfile.accountId };
  }

  const db = createIntegrationDb();
  if (isIdentityV2Enabled()) {
    const membershipRow = await db.query.membership.findFirst({
      where: eq(membership.personId, profileId),
      columns: { organizationId: true },
    });
    if (!membershipRow) {
      throw new Error(
        `Membership row missing after create for person: ${profileId}`,
      );
    }
    return { profileId, accountId: membershipRow.organizationId };
  }

  const row = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { accountId: true },
  });

  if (!row) {
    throw new Error(`Profile row missing after create: ${profileId}`);
  }

  return { profileId, accountId: row.accountId };
}

beforeEach(async () => {
  jest.clearAllMocks();
  clearFetchCalls();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

// ---------------------------------------------------------------------------
// Schedule deletion
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/account/delete (P0-004)', () => {
  it('returns 200 with gracePeriodEnds', async () => {
    await createOwnerProfile();

    const res = await app.request(
      '/v1/account/delete',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Deletion scheduled');
    expect(typeof body.gracePeriodEnds).toBe('string');

    // Grace period should be ~7 days from now
    const grace = new Date(body.gracePeriodEnds);
    const now = new Date();
    const diffDays = (grace.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('sets deletionScheduledAt on the account row', async () => {
    const { accountId } = await createOwnerProfileRecord();

    // Before deletion: no scheduledAt
    const before = await loadDeletionState(accountId);
    expect(before).not.toBeUndefined();
    expect(before!.deletionScheduledAt).toBeNull();

    await app.request(
      '/v1/account/delete',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    // After deletion: scheduledAt is set
    const after = await loadDeletionState(accountId);
    expect(after!.deletionScheduledAt).not.toBeNull();
  });

  it('emits app/account.deletion-scheduled Inngest event with profileIds', async () => {
    const profileId = await createOwnerProfile();

    await app.request(
      '/v1/account/delete',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(getCapturedInngestEvents()).toEqual([
      expect.objectContaining({
        name: 'app/account.deletion-scheduled',
        data: expect.objectContaining({
          profileIds: expect.arrayContaining([profileId]),
          timestamp: expect.any(String),
        }),
      }),
    ]);
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/account/delete',
      { method: 'POST' },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    expect(getCapturedInngestEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cancel deletion
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/account/cancel-deletion (P0-004)', () => {
  it('returns 200 with cancellation message', async () => {
    const { accountId } = await createOwnerProfileRecord();

    // Schedule first, then cancel
    await app.request(
      '/v1/account/delete',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    const res = await app.request(
      '/v1/account/cancel-deletion',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Deletion cancelled');
  });

  it('sets deletionCancelledAt on the account row', async () => {
    const { accountId } = await createOwnerProfileRecord();

    // Schedule then cancel
    await app.request(
      '/v1/account/delete',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );
    await app.request(
      '/v1/account/cancel-deletion',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    const row = await loadDeletionState(accountId);
    expect(row!.deletionScheduledAt).not.toBeNull();
    expect(row!.deletionCancelledAt).not.toBeNull();
    // Cancelled timestamp should be after scheduled timestamp
    expect(row!.deletionCancelledAt!.getTime()).toBeGreaterThan(
      row!.deletionScheduledAt!.getTime(),
    );
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST' },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/account/export', () => {
  it('returns exported data including profiles', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/account/export',
      {
        method: 'GET',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account).not.toBeNull();
    expect(Array.isArray(body.profiles)).toBe(true);
    expect(body.profiles.length).toBeGreaterThanOrEqual(1);
    expect(body.profiles.some((p: { id: string }) => p.id === profileId)).toBe(
      true,
    );
  });
});

const legacyAccountDeletionCascadeDescribe = isIdentityV2Enabled()
  ? describe.skip
  : describe;

legacyAccountDeletionCascadeDescribe(
  'Integration: account deletion cascade',
  () => {
    it('cascade-deletes all retention-pipeline rows for the deleted account', async () => {
      const { profileId, accountId } = await createOwnerProfileRecord();
      const db = createIntegrationDb();

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'Mathematics',
          status: 'active',
          pedagogyMode: 'socratic',
        })
        .returning({ id: subjects.id });

      const [session] = await db
        .insert(learningSessions)
        .values({
          profileId,
          subjectId: subject!.id,
          sessionType: 'learning',
          inputMode: 'text',
          status: 'completed',
          escalationRung: 1,
          exchangeCount: 1,
          endedAt: new Date(),
        })
        .returning({ id: learningSessions.id });

      await db.insert(sessionSummaries).values({
        sessionId: session!.id,
        profileId,
        topicId: null,
        status: 'accepted',
        learnerRecap: 'You connected the example back to the rule.',
        llmSummary: {
          narrative:
            'Worked through algebra and balanced a one-step equation while naming each inverse operation.',
          topicsCovered: ['algebra', 'inverse operations'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Resume with one more one-step equation and ask for the inverse-operation rule aloud.',
        },
        summaryGeneratedAt: new Date(),
      });

      await db.insert(sessionEvents).values({
        sessionId: session!.id,
        profileId,
        subjectId: subject!.id,
        eventType: 'user_message',
        content: 'Can we do algebra?',
      });

      await db.insert(sessionEmbeddings).values({
        sessionId: session!.id,
        profileId,
        topicId: null,
        content: 'Algebra session summary',
        embedding: Array.from({ length: 1024 }, () => 0.01),
      });

      await scheduleDeletion(db, accountId);
      await executeDeletion(db, accountId);

      const summaries = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_summaries WHERE profile_id = ${profileId}`,
      );
      expect((summaries.rows as Array<{ c: number }>)[0].c).toBe(0);

      const embeddings = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_embeddings WHERE profile_id = ${profileId}`,
      );
      expect((embeddings.rows as Array<{ c: number }>)[0].c).toBe(0);

      const events = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_events WHERE profile_id = ${profileId}`,
      );
      expect((events.rows as Array<{ c: number }>)[0].c).toBe(0);
    });

    // ---------------------------------------------------------------------------
    // [BUG-368] Comprehensive PII cascade audit.
    //
    // The scheduled deletion path ultimately deletes the account row and relies
    // entirely on FK `ON DELETE CASCADE` to wipe derived PII. If even one
    // PII-bearing table lacks cascade, account deletion silently leaves orphan
    // PII — a GDPR violation. This test seeds every PII-bearing table reachable
    // from `accounts` (directly or transitively via profiles) and asserts that
    // after executeDeletion the row count is 0 in each.
    //
    // The test IS the audit. A new PII table without cascade will fail here.
    // ---------------------------------------------------------------------------
    it('cascade-deletes every PII-bearing table for the deleted account (BUG-368)', async () => {
      const { profileId, accountId } = await createOwnerProfileRecord();
      const db = createIntegrationDb();

      // Seed a SECOND account + profile so we can also assert the foreign
      // account's PII (nudges, family_links etc.) is untouched by the target
      // deletion. This is the cross-account break test.
      const OTHER_USER = 'integration-deletion-other-user';
      const OTHER_EMAIL = 'integration-deletion-other@integration.test';
      await cleanupAccounts({
        emails: [OTHER_EMAIL],
        clerkUserIds: [OTHER_USER],
      });
      const otherRes = await app.request(
        '/v1/profiles',
        {
          method: 'POST',
          headers: buildAuthHeaders({ sub: OTHER_USER, email: OTHER_EMAIL }),
          body: JSON.stringify({
            displayName: 'Other Owner',
            birthYear: 2000,
          }),
        },
        TEST_ENV,
      );
      expect(otherRes.status).toBe(201);
      const otherBody = await otherRes.json();
      const otherProfileId = otherBody.profile.id as string;

      try {
        // ---- Curriculum chain (subjects → curricula → books → topics) ----
        const [subject] = await db
          .insert(subjects)
          .values({
            profileId,
            name: 'Mathematics',
            status: 'active',
            pedagogyMode: 'socratic',
          })
          .returning({ id: subjects.id });

        const [curriculum] = await db
          .insert(curricula)
          .values({ subjectId: subject!.id, version: 1 })
          .returning({ id: curricula.id });

        const [book] = await db
          .insert(curriculumBooks)
          .values({ subjectId: subject!.id, title: 'Algebra', sortOrder: 1 })
          .returning({ id: curriculumBooks.id });

        const [topic] = await db
          .insert(curriculumTopics)
          .values({
            curriculumId: curriculum!.id,
            bookId: book!.id,
            title: 'Linear Equations',
            description: 'Solving for x',
            sortOrder: 1,
            estimatedMinutes: 15,
          })
          .returning({ id: curriculumTopics.id });

        await db.insert(curriculumAdaptations).values({
          profileId,
          subjectId: subject!.id,
          topicId: topic!.id,
          sortOrder: 1,
          skipReason: 'mastered',
        });

        // ---- Session chain ----
        const [session] = await db
          .insert(learningSessions)
          .values({
            profileId,
            subjectId: subject!.id,
            topicId: topic!.id,
            sessionType: 'learning',
            inputMode: 'text',
            status: 'completed',
            escalationRung: 1,
            exchangeCount: 1,
            endedAt: new Date(),
          })
          .returning({ id: learningSessions.id });

        await db.insert(sessionSummaries).values({
          sessionId: session!.id,
          profileId,
          topicId: topic!.id,
          status: 'accepted',
          learnerRecap: 'You explained inverse operations.',
          summaryGeneratedAt: new Date(),
        });

        await db.insert(sessionEvents).values({
          sessionId: session!.id,
          profileId,
          subjectId: subject!.id,
          topicId: topic!.id,
          eventType: 'user_message',
          content: 'PII: my name is integration-test',
        });

        await db.insert(sessionEmbeddings).values({
          sessionId: session!.id,
          profileId,
          topicId: topic!.id,
          content: 'Embedded PII content',
          embedding: Array.from({ length: 1024 }, () => 0.01),
        });

        await db.insert(parkingLotItems).values({
          sessionId: session!.id,
          profileId,
          topicId: topic!.id,
          question: 'What is x squared?',
        });

        // ---- Assessments / mastery ----
        await db.insert(assessments).values({
          profileId,
          subjectId: subject!.id,
          topicId: topic!.id,
          sessionId: session!.id,
          verificationDepth: 'recall',
          status: 'passed',
        });

        await db.insert(retentionCards).values({
          profileId,
          topicId: topic!.id,
          easeFactor: '2.50',
          intervalDays: 1,
          nextReviewAt: new Date(),
        });

        await db.insert(needsDeepeningTopics).values({
          profileId,
          subjectId: subject!.id,
          topicId: topic!.id,
          source: 'challenge_round',
        });

        await db.insert(teachingPreferences).values({
          profileId,
          subjectId: subject!.id,
          method: 'step_by_step',
        });

        // ---- Notes / bookmarks ----
        await db.insert(topicNotes).values({
          topicId: topic!.id,
          profileId,
          sessionId: session!.id,
          content: 'Note PII content',
        });

        await db.insert(bookmarks).values({
          profileId,
          sessionId: session!.id,
          eventId: session!.id, // raw uuid, not FK-enforced
          subjectId: subject!.id,
          topicId: topic!.id,
          content: 'Bookmarked PII content',
        });

        // ---- Memory facts + dedup ----
        await db.insert(memoryFacts).values({
          profileId,
          category: 'interest',
          text: 'Loves astronomy',
          textNormalized: 'loves astronomy',
          observedAt: new Date(),
        });

        await db.insert(memoryDedupDecisions).values({
          profileId,
          pairKey: 'pair-1',
          decision: 'merge',
          modelVersion: 'test-v1',
        });

        // ---- Learning profile (1:1 with profile) ----
        // Use raw SQL: in some dev DBs the learning_profiles table is missing
        // memoryFactsAnalysedAt (schema drift trap). Drizzle's typed INSERT
        // references every schema column. The cascade test only cares that a
        // learning_profiles row exists for the profile and is wiped on delete.
        await db.execute(
          sql`INSERT INTO learning_profiles (id, profile_id, interests, memory_consent_status, memory_collection_enabled)
            VALUES (gen_random_uuid(), ${profileId}, ${JSON.stringify(['astronomy'])}::jsonb, 'granted', true)
            ON CONFLICT DO NOTHING`,
        );

        // ---- Language ----
        const [vocab] = await db
          .insert(vocabulary)
          .values({
            profileId,
            subjectId: subject!.id,
            term: 'casa',
            termNormalized: 'casa',
            translation: 'house',
            type: 'word',
          })
          .returning({ id: vocabulary.id });

        await db.insert(vocabularyRetentionCards).values({
          profileId,
          vocabularyId: vocab!.id,
          easeFactor: '2.50',
          intervalDays: 1,
        });

        // ---- Dictation ----
        await db.insert(dictationResults).values({
          profileId,
          completionKey: 'a0000000-0000-5000-8000-000000000001',
          date: '2026-05-20',
          sentenceCount: 5,
          mode: 'homework',
        });

        // ---- Quiz ----
        const [round] = await db
          .insert(quizRounds)
          .values({
            profileId,
            subjectId: subject!.id,
            activityType: 'vocabulary',
            theme: 'animals',
            total: 5,
          })
          .returning({ id: quizRounds.id });

        await db.insert(quizMissedItems).values({
          profileId,
          activityType: 'vocabulary',
          questionText: 'What is dog?',
          correctAnswer: 'perro',
          sourceRoundId: round!.id,
        });

        await db.insert(quizMasteryItems).values({
          profileId,
          activityType: 'vocabulary',
          itemKey: 'dog',
          itemAnswer: 'perro',
          nextReviewAt: new Date(),
        });

        // ---- Progress + reporting ----
        await db.insert(xpLedger).values({
          profileId,
          topicId: topic!.id,
          subjectId: subject!.id,
          amount: 10,
        });

        await db.insert(streaks).values({
          profileId,
          currentStreak: 3,
          longestStreak: 5,
        });

        await db.insert(notificationLog).values({
          profileId,
          type: 'daily_reminder',
        });

        await db.insert(progressSnapshots).values({
          profileId,
          snapshotDate: '2026-05-20',
          metrics: { sessions: 3 },
        });

        await db.insert(progressSummaries).values({
          profileId,
          summary: 'Made progress this week.',
          latestSessionId: session!.id,
        });

        await db.insert(milestones).values({
          profileId,
          milestoneType: 'sessions_completed',
          threshold: 1,
          subjectId: subject!.id,
          bookId: book!.id,
        });

        // ---- Practice + celebrations ----
        await db.insert(practiceActivityEvents).values({
          profileId,
          subjectId: subject!.id,
          activityType: 'quiz',
          sourceType: 'quiz_round',
          sourceId: round!.id,
          dedupeKey: `quiz_round:${round!.id}`,
          pointsEarned: 10,
        });

        await db.insert(celebrationEvents).values({
          profileId,
          celebrationType: 'streak',
          reason: 'three_day_streak',
          sourceType: 'session_event',
          dedupeKey: `streak:${profileId}:3`,
        });

        // ---- Challenge round cooldowns ----
        await db.insert(challengeRoundCooldowns).values({
          profileId,
          topicId: topic!.id,
          lastOutcome: 0,
        });

        // ---- Support messages ----
        await db.insert(supportMessages).values({
          profileId,
          clientId: 'client-1',
          flow: 'session_complete',
          surfaceKey: 'home',
          content: 'Help me with PII',
          attempts: 1,
          firstAttemptedAt: new Date(),
        });

        // ---- Consent + family preference rows ----
        await db.insert(consentStates).values({
          profileId,
          consentType: 'GDPR',
          status: 'CONSENTED',
        });

        await db.insert(withdrawalArchivePreferences).values({
          ownerProfileId: profileId,
          preference: 'auto',
        });

        await db.insert(familyPreferences).values({
          ownerProfileId: profileId,
          poolBreakdownShared: false,
        });

        await db.insert(pendingNotices).values({
          ownerProfileId: profileId,
          type: 'consent_archived',
          payloadJson: { note: 'PII' },
        });

        // ---- Cross-account-shaped rows (the deleted user is parent of the other) ----
        await db.insert(familyLinks).values({
          parentProfileId: profileId,
          childProfileId: otherProfileId,
        });

        await db.insert(nudges).values({
          fromProfileId: profileId,
          toProfileId: otherProfileId,
          template: 'you_got_this',
        });

        await db.insert(nudges).values({
          fromProfileId: otherProfileId,
          toProfileId: profileId,
          template: 'proud_of_you',
        });

        await db.insert(weeklyReports).values({
          profileId,
          childProfileId: otherProfileId,
          reportWeek: '2026-05-18',
          reportData: { sessions: 1 },
        });

        await db.insert(monthlyReports).values({
          profileId,
          childProfileId: otherProfileId,
          reportMonth: '2026-05-01',
          reportData: { sessions: 1 },
        });

        // -----------------------------------------------------------------------
        // Pre-condition: every seed actually landed.
        // -----------------------------------------------------------------------
        const pii = [
          { table: 'subjects', col: 'profile_id' },
          { table: 'curricula', col: 'subject_id' },
          { table: 'curriculum_books', col: 'subject_id' },
          { table: 'curriculum_topics', col: 'book_id' },
          { table: 'curriculum_adaptations', col: 'profile_id' },
          { table: 'learning_sessions', col: 'profile_id' },
          { table: 'session_summaries', col: 'profile_id' },
          { table: 'session_events', col: 'profile_id' },
          { table: 'session_embeddings', col: 'profile_id' },
          { table: 'parking_lot_items', col: 'profile_id' },
          { table: 'assessments', col: 'profile_id' },
          { table: 'retention_cards', col: 'profile_id' },
          { table: 'needs_deepening_topics', col: 'profile_id' },
          { table: 'teaching_preferences', col: 'profile_id' },
          { table: 'topic_notes', col: 'profile_id' },
          { table: 'bookmarks', col: 'profile_id' },
          { table: 'memory_facts', col: 'profile_id' },
          { table: 'memory_dedup_decisions', col: 'profile_id' },
          { table: 'learning_profiles', col: 'profile_id' },
          { table: 'vocabulary', col: 'profile_id' },
          { table: 'vocabulary_retention_cards', col: 'profile_id' },
          { table: 'dictation_results', col: 'profile_id' },
          { table: 'quiz_rounds', col: 'profile_id' },
          { table: 'quiz_missed_items', col: 'profile_id' },
          { table: 'quiz_mastery_items', col: 'profile_id' },
          { table: 'xp_ledger', col: 'profile_id' },
          { table: 'streaks', col: 'profile_id' },
          { table: 'notification_log', col: 'profile_id' },
          { table: 'progress_snapshots', col: 'profile_id' },
          { table: 'progress_summaries', col: 'profile_id' },
          { table: 'milestones', col: 'profile_id' },
          { table: 'practice_activity_events', col: 'profile_id' },
          { table: 'celebration_events', col: 'profile_id' },
          { table: 'challenge_round_cooldowns', col: 'profile_id' },
          { table: 'support_messages', col: 'profile_id' },
          { table: 'consent_states', col: 'profile_id' },
          { table: 'withdrawal_archive_preferences', col: 'owner_profile_id' },
          { table: 'family_preferences', col: 'owner_profile_id' },
          { table: 'pending_notices', col: 'owner_profile_id' },
          { table: 'family_links', col: 'parent_profile_id' },
          { table: 'weekly_reports', col: 'profile_id' },
          { table: 'monthly_reports', col: 'profile_id' },
        ];

        // Subjects/curricula seed sanity — confirm cascade chain is set up
        const beforeProfile = await db.execute(
          sql`SELECT count(*)::int AS c FROM profiles WHERE account_id = ${accountId}`,
        );
        expect(
          (beforeProfile.rows as Array<{ c: number }>)[0].c,
        ).toBeGreaterThan(0);

        // -----------------------------------------------------------------------
        // Act: delete the account. Cascade FKs do the work.
        // -----------------------------------------------------------------------
        await scheduleDeletion(db, accountId);
        await executeDeletion(db, accountId);

        // -----------------------------------------------------------------------
        // Assert: the account row is gone …
        // -----------------------------------------------------------------------
        const remaining = await db.execute(
          sql`SELECT count(*)::int AS c FROM accounts WHERE id = ${accountId}`,
        );
        expect((remaining.rows as Array<{ c: number }>)[0].c).toBe(0);

        const remainingProfile = await db.execute(
          sql`SELECT count(*)::int AS c FROM profiles WHERE account_id = ${accountId}`,
        );
        expect((remainingProfile.rows as Array<{ c: number }>)[0].c).toBe(0);

        // -----------------------------------------------------------------------
        // … and every PII-bearing table is empty for the deleted profile.
        // A failure here means a derived table is missing ON DELETE CASCADE,
        // which would leave orphan PII after a GDPR account-deletion request.
        // -----------------------------------------------------------------------
        for (const { table, col } of pii) {
          const row = await db.execute(
            sql`SELECT count(*)::int AS c FROM ${sql.identifier(table)} WHERE ${sql.identifier(col)} = ${profileId}`,
          );
          const count = (row.rows as Array<{ c: number }>)[0].c;
          expect({ table, count }).toEqual({ table, count: 0 });
        }

        // Nudges go in either direction — both sides referencing the deleted
        // profile must be wiped.
        const nudgesFrom = await db.execute(
          sql`SELECT count(*)::int AS c FROM nudges WHERE from_profile_id = ${profileId}`,
        );
        expect((nudgesFrom.rows as Array<{ c: number }>)[0].c).toBe(0);
        const nudgesTo = await db.execute(
          sql`SELECT count(*)::int AS c FROM nudges WHERE to_profile_id = ${profileId}`,
        );
        expect((nudgesTo.rows as Array<{ c: number }>)[0].c).toBe(0);

        // family_links cascades from BOTH sides (parent_profile_id and
        // child_profile_id both have onDelete: 'cascade'). Assert the
        // child_profile_id side is also wiped after the deletion.
        // (The parent_profile_id side is covered by the pii loop above.)
        const familyLinksAsChild = await db.execute(
          sql`SELECT count(*)::int AS c FROM family_links WHERE child_profile_id = ${profileId}`,
        );
        expect((familyLinksAsChild.rows as Array<{ c: number }>)[0].c).toBe(0);

        // -----------------------------------------------------------------------
        // Cross-account break test: the OTHER account's own profile still
        // exists. (Its inbound nudges/family_links cascade away because they
        // referenced the deleted profile, but the account row and its own
        // profile must survive.)
        // -----------------------------------------------------------------------
        const otherStillThere = await db.query.profiles.findFirst({
          where: eq(profiles.id, otherProfileId),
        });
        expect(otherStillThere).not.toBeUndefined();
      } finally {
        await cleanupAccounts({
          emails: [OTHER_EMAIL],
          clerkUserIds: [OTHER_USER],
        });
      }
    });
  },
);

// ---------------------------------------------------------------------------
// [WI-825] v2 PII cascade-deletion audit.
//
// The v2 deletion path (executeDeletionV2) operates on person/organization,
// NOT on accounts/profiles. This suite verifies that every v2 identity table
// that holds PII is cleaned up after executeDeletionV2 runs.
//
// Cascade graph (FK ON DELETE CASCADE from deletion-v2.ts + identity.ts):
//   person → login (CASCADE)
//   person → membership (CASCADE)
//   person → consent_request (CASCADE via charge_person_id)
//   organization → membership (CASCADE)
//   organization → consent_request (CASCADE via organization_id)
//   consent_grant is NOT a CASCADE — executeDeletionV2 re-homes it to
//     consent_receipt (retain-tier) and deletes the live row explicitly.
//   byok_waitlist is NOT a CASCADE — deleted by email in step 6.
//
// Retain-tier (must EXIST, not be empty, after deletion):
//   consent_receipt — the re-homed grant
//   deletion_audit — the audit trail
//   financial_record — tax/chargeback (2 rows per person per §6.1)
//
// Subscription gap (CUT-B3, out of scope):
//   subscription.payer_person_id → person.id (RESTRICT)
//   subscription.organization_id → organization.id (RESTRICT)
//   executeDeletionV2 does NOT tear down subscriptions (deletion-v2.ts L438-443).
//   A real account bootstrapped via POST /v1/profiles has a subscription row
//   that blocks the person + org delete. The audit therefore seeds the v2
//   identity graph directly (no POST /v1/profiles) to test the deletion service
//   in isolation, without a subscription in the way. CUT-B3 must be resolved
//   separately before executeDeletionV2 can handle real bootstrapped accounts.
//
// Guardianship / supportership gap (out of scope, same class as CUT-B3):
//   guardianship.guardian_person_id → person.id (RESTRICT)
//   guardianship.charge_person_id → person.id (RESTRICT)
//   supportership.supporter_person_id → person.id (RESTRICT)
//   supportership.supportee_person_id → person.id (RESTRICT)
//   executeDeletionV2 does NOT pre-clear guardianship or supportership edges
//   before deleting person rows. A family account (guardian → charge child)
//   would hit a RESTRICT violation on DELETE person. This audit intentionally
//   seeds a solo-owner graph (no guardianship/supportership) to test the service
//   in the only case it currently handles. Family-account deletion requires a
//   dedicated pre-clearing step in executeDeletionV2 (similar to CUT-B3) and
//   is out of scope for this WI.
//   TODO(CUT-B3 follow-up): add pre-clearing of guardianship + supportership
//   edges before DELETE person in executeDeletionV2, then extend this audit.
//
// Learning-data gap (CUT-B3 / WI-723, out of scope):
//   profiles.account_id → accounts.id (CASCADE), but executeDeletionV2 deletes
//   organization, NOT accounts. There is NO DB-level FK linking organization to
//   accounts. The legacy learning-data tables (subjects, sessions, etc.) are
//   therefore NOT deleted by the v2 deletion path. person.id = profiles.id is
//   a value equality from the deterministic reseed, NOT a FK.
//   TODO(CUT-B3): wire executeDeletionV2 to also erase the legacy accounts row
//   (accounts.id = organization.id) so the profiles + learning-data cascade fires.
//
// This suite runs only when IDENTITY_V2_ENABLED=true (the CI flag-on lane).
// The legacyAccountDeletionCascadeDescribe block above covers the flag-off path.
// ---------------------------------------------------------------------------
if (isIdentityV2Enabled()) {
  // Unique stable IDs for the v2 audit — isolated from the main AUTH_USER_ID.
  const V2_CLERK_ID = 'integration-deletion-v2-clerk';
  const V2_EMAIL = 'integration-deletion-v2@integration.test';

  describe('Integration: v2 account deletion cascade (WI-825)', () => {
    // Seed helpers: insert a minimal v2 identity graph (org + person + login +
    // membership) directly, bypassing the route layer. This avoids the
    // subscription bootstrap that POST /v1/profiles triggers, which would hit
    // the CUT-B3 RESTRICT FKs and block executeDeletionV2.
    async function seedV2IdentityGraph(
      db: ReturnType<typeof createIntegrationDb>,
    ): Promise<{
      personId: string;
      organizationId: string;
      ownerEmail: string;
    }> {
      const [org] = await db
        .insert(organization)
        .values({ name: 'v2-audit-org' })
        .returning({ id: organization.id });
      const orgId = org!.id;

      const [p] = await db
        .insert(person)
        .values({
          displayName: 'V2 Audit Person',
          birthDate: '2000-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      const personId = p!.id;

      const [l] = await db
        .insert(login)
        .values({
          personId,
          clerkUserId: V2_CLERK_ID,
          email: V2_EMAIL,
        })
        .returning({ id: login.id });
      // Wire person.login_id back (the circular FK that Drizzle TS skips).
      await db.execute(
        sql`UPDATE person SET login_id = ${l!.id} WHERE id = ${personId}`,
      );

      await db.insert(membership).values({
        personId,
        organizationId: orgId,
        roles: ['admin'],
      });

      return { personId, organizationId: orgId, ownerEmail: V2_EMAIL };
    }

    async function teardownV2Graph(
      db: ReturnType<typeof createIntegrationDb>,
      personId: string,
      organizationId: string,
    ): Promise<void> {
      // FK-safe teardown for test cleanup (mirrors cleanupAccounts order).
      await db
        .delete(consentGrant)
        .where(eq(consentGrant.chargePersonId, personId));
      await db
        .delete(consentRequest)
        .where(eq(consentRequest.chargePersonId, personId));
      await db.delete(person).where(eq(person.id, personId));
      await db.delete(organization).where(eq(organization.id, organizationId));
      await db.delete(byokWaitlist).where(eq(byokWaitlist.email, V2_EMAIL));
    }

    // -------------------------------------------------------------------------
    // [BUG-368-v2] Comprehensive v2 PII cascade audit.
    //
    // Seeds every v2 identity table that executeDeletionV2 is responsible for
    // cleaning up. Asserts that after the deletion:
    //   - All PII-bearing v2 identity rows are gone.
    //   - All retain-tier rows exist (consent_receipt, deletion_audit,
    //     financial_record).
    //   - A cross-account break test: a second org's data is untouched.
    //
    // The test IS the audit. A new v2 PII table missing a cascade or explicit
    // delete will fail here.
    // -------------------------------------------------------------------------
    it('cascade-deletes all v2 identity PII rows and retains the retain-tier (BUG-368-v2)', async () => {
      const db = createIntegrationDb();

      // Seed TARGET identity graph directly (no subscription, avoids CUT-B3 RESTRICT).
      const { personId, organizationId, ownerEmail } =
        await seedV2IdentityGraph(db);

      try {
        // ---- consent_grant (RESTRICT on person + org; re-homed by executeDeletionV2) ----
        await db.insert(consentGrant).values({
          chargePersonId: personId,
          organizationId,
          purpose: 'platform_use',
          lawfulBasis: 'gdpr_parental_consent',
          granted: true,
        });

        // ---- consent_request (CASCADE from person + org) ----
        await db.insert(consentRequest).values({
          chargePersonId: personId,
          organizationId,
          requestedBasis: 'gdpr_parental_consent',
          status: 'pending',
          requestedAt: new Date(),
        });

        // ---- byok_waitlist (no FK, erased by owner email in step 6) ----
        await db
          .insert(byokWaitlist)
          .values({ email: ownerEmail })
          .onConflictDoNothing();

        // ---- Pre-condition: every seed actually landed ----
        const beforePerson = await db.query.person.findFirst({
          where: eq(person.id, personId),
          columns: { id: true },
        });
        expect(beforePerson).toBeDefined();

        const beforeGrant = await db.query.consentGrant.findFirst({
          where: eq(consentGrant.chargePersonId, personId),
          columns: { id: true },
        });
        expect(beforeGrant).toBeDefined();

        const beforeRequest = await db.query.consentRequest.findFirst({
          where: eq(consentRequest.chargePersonId, personId),
          columns: { id: true },
        });
        expect(beforeRequest).toBeDefined();

        const beforeByok = await db.query.byokWaitlist.findFirst({
          where: eq(byokWaitlist.email, ownerEmail),
          columns: { id: true },
        });
        expect(beforeByok).toBeDefined();

        // ---- Cross-account seed: a second org + person with NO overlapping IDs ----
        const [otherOrg] = await db
          .insert(organization)
          .values({ name: 'v2-audit-other-org' })
          .returning({ id: organization.id });
        const [otherPerson] = await db
          .insert(person)
          .values({
            displayName: 'V2 Audit Other',
            birthDate: '2001-01-01',
            residenceJurisdiction: 'EU',
          })
          .returning({ id: person.id });
        await db.insert(membership).values({
          personId: otherPerson!.id,
          organizationId: otherOrg!.id,
          roles: ['admin'],
        });
        const otherPersonId = otherPerson!.id;
        const otherOrgId = otherOrg!.id;

        try {
          // ---- Act: schedule + execute deletion on the TARGET org only ----
          await scheduleDeletionV2(db, organizationId);
          const result = await executeDeletionV2(db, {
            organizationId,
            ownerEmail,
            reason: 'user_initiated',
            deletedBy: null,
          });
          expect(result).toBe('deleted');

          // -------------------------------------------------------------------
          // Assert: v2 PII rows are gone.
          // -------------------------------------------------------------------

          // person row (the root of the cascade)
          const remainingPerson = await db.query.person.findFirst({
            where: eq(person.id, personId),
            columns: { id: true },
          });
          expect(remainingPerson).toBeUndefined();

          // organization row
          const remainingOrg = await db.query.organization.findFirst({
            where: eq(organization.id, organizationId),
            columns: { id: true },
          });
          expect(remainingOrg).toBeUndefined();

          // login (CASCADE from person)
          const remainingLogin = await db.query.login.findFirst({
            where: eq(login.clerkUserId, V2_CLERK_ID),
            columns: { id: true },
          });
          expect(remainingLogin).toBeUndefined();

          // membership (CASCADE from person + org)
          const remainingMembership = await db.query.membership.findFirst({
            where: eq(membership.personId, personId),
            columns: { id: true },
          });
          expect(remainingMembership).toBeUndefined();

          // consent_request (CASCADE from person)
          const remainingRequest = await db.query.consentRequest.findFirst({
            where: eq(consentRequest.chargePersonId, personId),
            columns: { id: true },
          });
          expect(remainingRequest).toBeUndefined();

          // consent_grant (re-homed then deleted by executeDeletionV2)
          const remainingGrant = await db.query.consentGrant.findFirst({
            where: eq(consentGrant.chargePersonId, personId),
            columns: { id: true },
          });
          expect(remainingGrant).toBeUndefined();

          // byok_waitlist (deleted by email in step 6 of executeDeletionV2)
          const remainingByok = await db.query.byokWaitlist.findFirst({
            where: eq(byokWaitlist.email, ownerEmail),
            columns: { id: true },
          });
          expect(remainingByok).toBeUndefined();

          // -------------------------------------------------------------------
          // Assert: retain-tier rows EXIST (they must outlive the person).
          // A failure here means executeDeletionV2 is failing to write its
          // audit trail / consent re-home before deleting the person.
          // -------------------------------------------------------------------

          // consent_receipt — the re-homed grant (1 per seeded grant)
          const receiptRow = await db.execute(
            sql`SELECT count(*)::int AS c FROM consent_receipt WHERE person_id = ${personId}`,
          );
          expect(
            (receiptRow.rows as Array<{ c: number }>)[0].c,
          ).toBeGreaterThanOrEqual(1);

          // deletion_audit — 1 row per person (§6.1)
          const auditRow = await db.execute(
            sql`SELECT count(*)::int AS c FROM deletion_audit WHERE person_id = ${personId}`,
          );
          expect((auditRow.rows as Array<{ c: number }>)[0].c).toBe(1);

          // financial_record — 2 rows per person (§6.1: tax + chargeback retain)
          const financialRow = await db.execute(
            sql`SELECT count(*)::int AS c FROM financial_record WHERE person_id = ${personId}`,
          );
          expect((financialRow.rows as Array<{ c: number }>)[0].c).toBe(2);

          // -------------------------------------------------------------------
          // Cross-account break test: the OTHER org's identity graph is untouched.
          // -------------------------------------------------------------------
          const otherPersonStillThere = await db.query.person.findFirst({
            where: eq(person.id, otherPersonId),
            columns: { id: true },
          });
          expect(otherPersonStillThere).toBeDefined();

          const otherOrgStillThere = await db.query.organization.findFirst({
            where: eq(organization.id, otherOrgId),
            columns: { id: true },
          });
          expect(otherOrgStillThere).toBeDefined();
        } finally {
          // Clean up the cross-account seed.
          await db
            .delete(membership)
            .where(eq(membership.personId, otherPersonId))
            .catch(() => undefined);
          await db
            .delete(person)
            .where(eq(person.id, otherPersonId))
            .catch(() => undefined);
          await db
            .delete(organization)
            .where(eq(organization.id, otherOrgId))
            .catch(() => undefined);
        }
      } finally {
        // Best-effort cleanup of any seed rows not deleted by the act step.
        await teardownV2Graph(db, personId, organizationId).catch(
          () => undefined,
        );
      }
    });
  });
}
