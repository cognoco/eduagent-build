// ---------------------------------------------------------------------------
// Session Lifecycle — Integration Tests [STAB-3.1]
//
// Tests the full session lifecycle against a real test database.
// Only the LLM router is mocked (non-deterministic, external boundary).
// All internal services, repositories, and DB interactions are real.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { createDatabase } from '@eduagent/database';
import {
  accounts,
  profiles,
  subjects,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { eq, and, like } from 'drizzle-orm';
import {
  registerProvider,
  createMockProvider,
  _clearProviders,
  unregisterProvider,
} from './llm';
import {
  startSession,
  SubjectInactiveError,
  SessionExchangeLimitError,
  processMessage,
  persistExchangeResult,
  closeSession,
  closeStaleSessions,
  resetSessionStaticContextCache,
} from './session';

type StaleSessionResult = Awaited<
  ReturnType<typeof closeStaleSessions>
>[number];

// ---------------------------------------------------------------------------
// DB setup — loads DATABASE_URL from .env.development.local in local dev,
// uses the already-set DATABASE_URL in CI.
// ---------------------------------------------------------------------------

// Resolve workspace root: from services/ → src → api → apps → worktree root (4 parents)
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

// ---------------------------------------------------------------------------
// Unique test-run prefix to avoid collisions between concurrent test runs
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7();

// ---------------------------------------------------------------------------
// Seed helpers — direct Drizzle inserts for lightweight per-test data
// ---------------------------------------------------------------------------

// Monotonic counter ensures each seedProfile call within the same run is unique
let seedCounter = 0;

async function seedProfile() {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_integ_sess_${RUN_ID}_${idx}`;
  const email = `integ-sess-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Integration Test Learner',
      birthYear: new Date().getFullYear() - 15,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
}

async function seedSubject(
  profileId: string,
  status: 'active' | 'paused' | 'archived' = 'active',
) {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Mathematics',
      status,
    })
    .returning({ id: subjects.id });

  return subject!.id;
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL is not set — cannot run session lifecycle integration tests.\n' +
        'Copy .env.example → .env.development.local and add a test DATABASE_URL.',
    );
  }
  db = createDatabase(dbUrl);

  // Register mock LLM provider — the ONLY mocked external boundary
  _clearProviders();
  registerProvider(createMockProvider('gemini'));
});

afterAll(async () => {
  // Clean up all test data seeded during this run.
  // Foreign key cascades handle child records (sessions, events, etc.)
  // when we delete accounts. We delete by the unique clerk_user_id prefix.
  // Use `like` to match all per-test accounts: clerk_integ_sess_<RUN_ID>_<idx>
  if (db) {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_integ_sess_${RUN_ID}%`));
  }

  // Reset in-process caches to avoid cross-test pollution
  resetSessionStaticContextCache();
  unregisterProvider('gemini');
});

beforeEach(() => {
  // Clear the session static context cache between tests so tests are
  // fully independent (no stale session → subject mappings)
  resetSessionStaticContextCache();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session lifecycle (integration)', () => {
  // -------------------------------------------------------------------------
  // Test 1: starts a session and records a session_start event
  // -------------------------------------------------------------------------

  it('starts a session and records a session_start event', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    // Verify session row persisted
    // (LearningSession schema omits profileId for privacy — check via DB query instead)
    expect(typeof session.id).toBe('string');
    expect(session.subjectId).toBe(subjectId);
    expect(session.status).toBe('active');
    expect(session.exchangeCount).toBe(0);

    // Verify session is scoped to the correct profile via direct DB read
    const [sessionRow] = await db
      .select({ profileId: learningSessions.profileId })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id))
      .limit(1);
    expect(sessionRow!.profileId).toBe(profileId);

    // Verify session_start event was written to DB
    const events = await db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, session.id),
        eq(sessionEvents.profileId, profileId),
      ),
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('session_start');
  });

  // -------------------------------------------------------------------------
  // Test 2: rejects starting a session on an inactive subject
  // -------------------------------------------------------------------------

  it('rejects starting a session on an inactive subject', async () => {
    const { profileId } = await seedProfile();
    const archivedSubjectId = await seedSubject(profileId, 'archived');

    await expect(
      startSession(db, profileId, archivedSubjectId, {
        sessionType: 'learning',
      }),
    ).rejects.toThrow(SubjectInactiveError);
  });

  // -------------------------------------------------------------------------
  // Test 3: processes a message exchange and persists both events
  // -------------------------------------------------------------------------

  it('processes a message exchange and persists both events', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    const result = await processMessage(db, profileId, session.id, {
      message: 'What is 2 + 2?',
    });

    expect(typeof result.response).toBe('string');
    expect(result.exchangeCount).toBe(1);

    // Verify both user_message and ai_response events are in the DB
    const events = await db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, session.id),
        eq(sessionEvents.profileId, profileId),
      ),
    });

    const eventTypes = events.map(
      (e: typeof sessionEvents.$inferSelect) => e.eventType,
    );
    expect(eventTypes).toContain('session_start');
    expect(eventTypes).toContain('user_message');
    expect(eventTypes).toContain('ai_response');

    const userEvent = events.find(
      (e: typeof sessionEvents.$inferSelect) => e.eventType === 'user_message',
    );
    expect(userEvent?.content).toBe('What is 2 + 2?');

    const aiEvent = events.find(
      (e: typeof sessionEvents.$inferSelect) => e.eventType === 'ai_response',
    );
    expect(typeof aiEvent?.content).toBe('string');
    expect(aiEvent?.content.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 4: enforces the 50-exchange limit
  // -------------------------------------------------------------------------

  it('enforces the 50-exchange limit', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    // Start a session, then directly set exchangeCount to 49 in DB
    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    await db
      .update(learningSessions)
      .set({ exchangeCount: 49 })
      .where(eq(learningSessions.id, session.id));

    // Exchange 50 should succeed
    const result = await processMessage(db, profileId, session.id, {
      message: 'Exchange number 50',
    });
    expect(result.exchangeCount).toBe(50);

    // Exchange 51 should throw SessionExchangeLimitError
    await expect(
      processMessage(db, profileId, session.id, {
        message: 'Exchange number 51',
      }),
    ).rejects.toThrow(SessionExchangeLimitError);
  });

  // -------------------------------------------------------------------------
  // [BREAK / S-1 / BUG-626] Concurrent persistExchangeResult must NOT leave
  // orphan events when one call loses the exchange-count race.
  //
  // Pre-fix: events were inserted BEFORE the atomic UPDATE on exchangeCount.
  // Two concurrent calls at exchangeCount=49 both inserted user_message +
  // ai_response, then raced UPDATE; the loser threw SessionExchangeLimitError
  // but its events stayed in the DB — visible as ghost turns in subsequent
  // exchangeHistory loads. Post-fix: events + UPDATE are wrapped in a single
  // transaction so the loser's events roll back.
  // -------------------------------------------------------------------------

  it('[BREAK] concurrent exchanges at the cap do not leave orphan events', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    // Push to one exchange below the 50-cap.
    await db
      .update(learningSessions)
      .set({ exchangeCount: 49 })
      .where(eq(learningSessions.id, session.id));

    // Fire 2 concurrent processMessage calls. Exactly one should succeed.
    const settled = await Promise.allSettled([
      processMessage(db, profileId, session.id, {
        message: 'concurrent A',
      }),
      processMessage(db, profileId, session.id, {
        message: 'concurrent B',
      }),
    ]);

    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    const rejected = settled.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser's rejection must be SessionExchangeLimitError, not a DB error.
    const rejection = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejection).toBeInstanceOf(SessionExchangeLimitError);

    // exchangeCount must be exactly 50 — never 51.
    const [row] = await db
      .select({ exchangeCount: learningSessions.exchangeCount })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id))
      .limit(1);
    expect(row!.exchangeCount).toBe(50);

    // Loser's events must have rolled back. The single winning exchange writes
    // ONE user_message + ONE ai_response. Without the transaction fix, both
    // calls would have persisted user_message events ('concurrent A' AND
    // 'concurrent B') even though only one UPDATE landed → 2 user_message
    // events but exchangeCount=50.
    const userMessages = await db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, session.id),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'user_message'),
      ),
    });
    expect(userMessages).toHaveLength(1);

    const aiResponses = await db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, session.id),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response'),
      ),
    });
    expect(aiResponses).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Drill score persistence — when the LLM envelope's
  // `ui_hints.fluency_drill.score` is set, the score lands on the ai_response
  // row's drill_correct/drill_total columns. When no score is emitted, both
  // columns stay null.
  //
  // Pre-fix: drill score was extracted from the envelope and forwarded over
  // SSE but never persisted. The per-topic dashboard surface had nothing to
  // read. This test fails if the drill_correct/drill_total columns are not
  // wired through behavioral metrics into the ai_response INSERT.
  // -------------------------------------------------------------------------

  it('[BREAK] persists drill_correct/drill_total when behavioral.drill* set', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'How many vocabulary words did I get right?',
      'You got 4 out of 5 — strong session!',
      session.escalationRung,
      {
        isUnderstandingCheck: false,
        timeToAnswerMs: 1234,
        hintCountInSession: 0,
        drillCorrect: 4,
        drillTotal: 5,
      },
    );

    const [row] = await db
      .select({
        drillCorrect: sessionEvents.drillCorrect,
        drillTotal: sessionEvents.drillTotal,
      })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, session.id),
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.eventType, 'ai_response'),
        ),
      )
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.drillCorrect).toBe(4);
    expect(row!.drillTotal).toBe(5);
  });

  it('drill_correct/drill_total stay null when no drill score in behavioral', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'Tell me about photosynthesis',
      'Plants convert sunlight into energy through chlorophyll.',
      session.escalationRung,
      {
        isUnderstandingCheck: false,
        timeToAnswerMs: 2000,
        hintCountInSession: 0,
      },
    );

    const [row] = await db
      .select({
        drillCorrect: sessionEvents.drillCorrect,
        drillTotal: sessionEvents.drillTotal,
      })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, session.id),
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.eventType, 'ai_response'),
        ),
      )
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.drillCorrect).toBeNull();
    expect(row!.drillTotal).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 5: closes a session and creates a summary row
  // -------------------------------------------------------------------------

  it('closes a session and creates a summary row', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      sessionType: 'learning',
    });

    await processMessage(db, profileId, session.id, {
      message: 'Tell me about algebra',
    });

    const closeResult = await closeSession(db, profileId, session.id, {
      reason: 'user_ended',
      summaryStatus: 'pending',
    });

    expect(closeResult.sessionId).toBe(session.id);
    expect(closeResult.summaryStatus).toBe('pending');

    // Verify session status updated to 'completed' in DB
    const [sessionRow] = await db
      .select({ status: learningSessions.status })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id))
      .limit(1);

    expect(sessionRow!.status).toBe('completed');

    // Verify a session summary row was created
    const summaries = await db.query.sessionSummaries.findMany({
      where: and(
        eq(sessionSummaries.sessionId, session.id),
        eq(sessionSummaries.profileId, profileId),
      ),
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.status).toBe('pending');
  });

  // -------------------------------------------------------------------------
  // Test 6: closeStaleSessions batch-closes old sessions
  // -------------------------------------------------------------------------

  it('closeStaleSessions batch-closes old sessions', async () => {
    const { profileId: profileId1 } = await seedProfile();
    const { profileId: profileId2 } = await seedProfile();
    const subjectId1 = await seedSubject(profileId1);
    const subjectId2 = await seedSubject(profileId2);

    // Session with recent activity (should NOT be closed)
    const recentSession = await startSession(db, profileId1, subjectId1, {
      sessionType: 'learning',
    });

    // Session with old activity — backdate lastActivityAt to 3 hours ago
    const staleSession = await startSession(db, profileId2, subjectId2, {
      sessionType: 'learning',
    });

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await db
      .update(learningSessions)
      .set({ lastActivityAt: threeHoursAgo })
      .where(eq(learningSessions.id, staleSession.id));

    // Cutoff: 2 hours ago — only sessions older than this get closed
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const closed = await closeStaleSessions(db, cutoff);

    // The stale session should appear in closed results
    const closedIds = closed.map((r: StaleSessionResult) => r.sessionId);
    expect(closedIds).toContain(staleSession.id);
    expect(closedIds).not.toContain(recentSession.id);

    // Verify stale session is now auto_closed in DB
    const [staleRow] = await db
      .select({ status: learningSessions.status })
      .from(learningSessions)
      .where(eq(learningSessions.id, staleSession.id))
      .limit(1);

    expect(staleRow!.status).toBe('auto_closed');

    // Verify recent session is still active
    const [recentRow] = await db
      .select({ status: learningSessions.status })
      .from(learningSessions)
      .where(eq(learningSessions.id, recentSession.id))
      .limit(1);

    expect(recentRow!.status).toBe('active');
  });
});
