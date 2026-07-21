import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curriculumBooks,
  generateUUIDv7,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { ConflictError, NotFoundError } from '@eduagent/schemas';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';
import {
  closeSession,
  flagContent,
  getSession,
  getSessionTranscript,
  listProfileSessions,
  persistSessionMetadata,
  recordSessionEvent,
  recordSystemPrompt,
  requestSessionLibraryFiling,
  resetFilingForRetry,
  restoreSessionForAutoFiling,
  startFirstCurriculumSession,
} from './session-crud';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let db: Database;
let counter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfileWithSubject(
  subjectName: string,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_session_archive_${RUN_ID}_${idx}`;
  const email = `session-archive-${RUN_ID}-${idx}@test.invalid`;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: 'Session Learner',
    birthYear: 2012,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: subjectName })
    .returning({ id: subjects.id });

  return { profileId, subjectId: subject!.id };
}

async function cleanupSeededAccounts(): Promise<void> {
  await deleteV2IdentitiesForTest(db, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

describeIfDb('listProfileSessions (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededAccounts();
  });

  it('is profile-scoped and cursor-paginates sessions', async () => {
    const owner = await seedProfileWithSubject('Chemistry');
    const other = await seedProfileWithSubject('History');
    await db.insert(learningSessions).values([
      {
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 1,
      },
      {
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 2,
      },
      {
        profileId: other.profileId,
        subjectId: other.subjectId,
        exchangeCount: 1,
      },
    ]);

    const page1 = await listProfileSessions(db, owner.profileId, { limit: 1 });

    expect(page1.sessions).toHaveLength(1);
    expect(page1.sessions[0]!.subjectName).toBe('Chemistry');
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listProfileSessions(db, owner.profileId, {
      limit: 1,
      cursor: page1.nextCursor!,
    });

    expect(page2.sessions).toHaveLength(1);
    expect(page2.sessions[0]!.subjectName).toBe('Chemistry');
    expect(page2.sessions[0]!.sessionId).not.toBe(page1.sessions[0]!.sessionId);
    expect(page2.nextCursor).toBeNull();
  });

  it('ignores zero-exchange sessions in the archive', async () => {
    const owner = await seedProfileWithSubject('Physics');
    await db.insert(learningSessions).values([
      {
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 0,
      },
    ]);

    const result = await listProfileSessions(db, owner.profileId);

    expect(result.sessions).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  // [BUG-102 / BUG-106] BREAK TEST — pre-fix, hydrateChildSessions batched
  // session_summaries, subjects, curriculum_topics, and ai_response drill
  // events purely by sessionId/subjectId/topicId, with no profileId
  // predicate. We simulate the leak by seeding an extra summary AND an
  // ai_response drill row owned by a sibling profile that point at the
  // owner's session row. Without the fix those rows would be returned in
  // the owner's archive view.
  it('[BREAK] [BUG-102/106] hydrateChildSessions filters secondary rows by profileId', async () => {
    const owner = await seedProfileWithSubject('Biology');
    const sibling = await seedProfileWithSubject('Biology-sibling');

    const [ownerSession] = await db
      .insert(learningSessions)
      .values({
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 1,
      })
      .returning({ id: learningSessions.id });

    // Owner-authored summary (correct)
    await db.insert(sessionSummaries).values({
      sessionId: ownerSession!.id,
      profileId: owner.profileId,
      narrative: 'owner-narrative',
      highlight: 'owner-highlight',
      content: 'owner-content',
      status: 'accepted',
    });

    // Simulated leak: sibling-owned summary at the same sessionId. The
    // pre-fix WHERE-only-by-sessionId query would happily return this row.
    await db.insert(sessionSummaries).values({
      sessionId: ownerSession!.id,
      profileId: sibling.profileId,
      narrative: 'LEAK-sibling-narrative',
      highlight: 'LEAK-sibling-highlight',
      content: 'LEAK-sibling-content',
      status: 'accepted',
    });

    // Simulated leak: sibling-owned drill event also pointing at the owner
    // session — same shape of cross-account leak.
    await db.insert(sessionEvents).values({
      sessionId: ownerSession!.id,
      profileId: sibling.profileId,
      subjectId: sibling.subjectId,
      eventType: 'ai_response',
      content: 'LEAK',
      drillCorrect: 9999,
      drillTotal: 9999,
    });

    const result = await listProfileSessions(db, owner.profileId);

    expect(result.sessions).toHaveLength(1);
    const row = result.sessions[0]!;
    // Narrative must be the owner's, never the sibling's.
    expect(row.narrative).toBe('owner-narrative');
    expect(row.highlight).toBe('owner-highlight');
    // Drills must not include the sibling's leak event.
    expect(row.drills).not.toContainEqual(
      expect.objectContaining({ correct: 9999, total: 9999 }),
    );
  });
});

describeIfDb('persistSessionMetadata (integration IDOR breaks)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededAccounts();
  });

  it('merges metadata without clobbering sibling keys and rejects cross-profile writes', async () => {
    const owner = await seedProfileWithSubject('Algebra metadata');
    const other = await seedProfileWithSubject('Biology metadata');
    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        metadata: { inputMode: 'text', continuationDepth: 'low' },
      })
      .returning({ id: learningSessions.id });

    const updated = await persistSessionMetadata(
      db,
      owner.profileId,
      session!.id,
      { continuationDepth: 'mid', continuationOpenerActive: true },
    );

    expect(updated?.metadata).toEqual(
      expect.objectContaining({
        inputMode: 'text',
        continuationDepth: 'mid',
        continuationOpenerActive: true,
      }),
    );

    const denied = await persistSessionMetadata(
      db,
      other.profileId,
      session!.id,
      {
        continuationDepth: 'high',
      },
    );
    expect(denied).toBeNull();

    const afterDenied = await getSession(db, owner.profileId, session!.id);
    expect(afterDenied?.metadata).toEqual(
      expect.objectContaining({
        inputMode: 'text',
        continuationDepth: 'mid',
      }),
    );

    const deletedKey = await persistSessionMetadata(
      db,
      owner.profileId,
      session!.id,
      { continuationOpenerActive: undefined },
    );
    expect(deletedKey?.metadata).not.toHaveProperty('continuationOpenerActive');
  });
});

// ---------------------------------------------------------------------------
// [CCR PR #266 / bug 277] IDOR break tests for the session-crud ownership gate.
//
// Pre-fix risk: any read/update/delete path that trusted session-id alone (or
// emitted an untyped Error from an ownership failure) made it hard for callers
// to distinguish "not yours" from a generic error. These tests pin the
// ownership gate behavior end-to-end against a real DB:
//
//   - Profile B reading Profile A's session via the scoped repo must see null.
//   - Profile B closing / transcript / recording events against Profile A's
//     session must throw (no silent success, no cross-account mutation).
//   - The book-ownership gate inside findFirstAvailableTopicId (line 414,
//     exercised via startFirstCurriculumSession) must throw NotFoundError —
//     the typed error class — when the bookId belongs to a different
//     profile's subject. The pre-fix bare Error tied callers to message
//     string matching; the typed version lets routes branch on instanceof.
// ---------------------------------------------------------------------------

describeIfDb('session-crud ownership gate (integration IDOR breaks)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededAccounts();
  });

  it('[BREAK] getSession returns null when profile B reads profile A’s session', async () => {
    const ownerA = await seedProfileWithSubject('IDOR-A');
    const ownerB = await seedProfileWithSubject('IDOR-B');

    const [sessionA] = await db
      .insert(learningSessions)
      .values({
        profileId: ownerA.profileId,
        subjectId: ownerA.subjectId,
        exchangeCount: 1,
      })
      .returning({ id: learningSessions.id });

    const asOwner = await getSession(db, ownerA.profileId, sessionA!.id);
    expect(asOwner?.id).toBe(sessionA!.id);

    const asAttacker = await getSession(db, ownerB.profileId, sessionA!.id);
    expect(asAttacker).toBeNull();
  });

  it('[BREAK] closeSession throws and does NOT mutate when profile B closes profile A’s session', async () => {
    const ownerA = await seedProfileWithSubject('IDOR-A-close');
    const ownerB = await seedProfileWithSubject('IDOR-B-close');

    const [sessionA] = await db
      .insert(learningSessions)
      .values({
        profileId: ownerA.profileId,
        subjectId: ownerA.subjectId,
        exchangeCount: 1,
        status: 'active',
      })
      .returning({ id: learningSessions.id });

    await expect(
      closeSession(db, ownerB.profileId, sessionA!.id, {
        reason: 'user_initiated',
      }),
    ).rejects.toThrow();

    // The session must remain active — attacker close must not have landed.
    const afterAttack = await db.query.learningSessions.findFirst({
      where: (sessions, helpers) => helpers.eq(sessions.id, sessionA!.id),
    });
    expect(afterAttack?.status).toBe('active');
    expect(afterAttack?.endedAt).toBeNull();
  });

  it('[BREAK] getSessionTranscript returns null when profile B reads profile A’s transcript', async () => {
    const ownerA = await seedProfileWithSubject('IDOR-A-tx');
    const ownerB = await seedProfileWithSubject('IDOR-B-tx');

    const [sessionA] = await db
      .insert(learningSessions)
      .values({
        profileId: ownerA.profileId,
        subjectId: ownerA.subjectId,
        exchangeCount: 1,
      })
      .returning({ id: learningSessions.id });

    const asAttacker = await getSessionTranscript(
      db,
      ownerB.profileId,
      sessionA!.id,
    );
    expect(asAttacker).toBeNull();
  });

  it('[BREAK] recordSystemPrompt / recordSessionEvent / flagContent throw across profiles', async () => {
    const ownerA = await seedProfileWithSubject('IDOR-A-rec');
    const ownerB = await seedProfileWithSubject('IDOR-B-rec');

    const [sessionA] = await db
      .insert(learningSessions)
      .values({
        profileId: ownerA.profileId,
        subjectId: ownerA.subjectId,
        exchangeCount: 1,
      })
      .returning({ id: learningSessions.id });

    await expect(
      recordSystemPrompt(db, ownerB.profileId, sessionA!.id, {
        kind: 'silence_nudge',
      }),
    ).rejects.toThrow();

    await expect(
      recordSessionEvent(db, ownerB.profileId, sessionA!.id, {
        eventType: 'user_message',
        content: 'evil event',
      }),
    ).rejects.toThrow();

    await expect(
      flagContent(db, ownerB.profileId, sessionA!.id, {
        eventId: generateUUIDv7(),
      }),
    ).rejects.toThrow();
  });

  // [WI-237 · DS-148] recordSystemPrompt must own provenance: it stamps
  // metadata.source='server' and the structured intent, and persists the
  // server-resolved content. Callers can no longer smuggle client text into a
  // role:'system' replay because the stored source is always 'server'.
  it('[WI-237] recordSystemPrompt stamps metadata.source=server + intent', async () => {
    const owner = await seedProfileWithSubject('WI-237-source');
    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 1,
      })
      .returning({ id: learningSessions.id });

    await recordSystemPrompt(db, owner.profileId, session!.id, {
      kind: 'message_feedback',
      action: 'helpful',
      eventId: 'evt_abc',
    });

    const rows = await db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, session!.id),
        eq(sessionEvents.eventType, 'system_prompt'),
      ),
    });

    expect(rows).toHaveLength(1);
    const meta = rows[0]!.metadata as Record<string, unknown>;
    // Content is the server-resolved canonical string for the intent — the
    // caller no longer supplies it.
    expect(rows[0]!.content).toBe(
      'The learner marked the previous answer as helpful. Keep the same pace and level of guidance.',
    );
    expect(meta.source).toBe('server');
    expect(meta.intent).toEqual({
      kind: 'message_feedback',
      action: 'helpful',
      eventId: 'evt_abc',
    });
  });

  it('[WI-2103 AC-1/2] rejects a queued silence prompt after session completion wins', async () => {
    const owner = await seedProfileWithSubject('WI-2103-ended-silence');
    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 1,
        status: 'active',
      })
      .returning({ id: learningSessions.id });

    await closeSession(db, owner.profileId, session!.id, {
      reason: 'user_initiated',
    });

    await expect(
      recordSystemPrompt(db, owner.profileId, session!.id, {
        kind: 'silence_nudge',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const silencePrompts = await db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, session!.id),
        eq(sessionEvents.eventType, 'system_prompt'),
      ),
    });
    expect(silencePrompts).toHaveLength(0);
  });

  // [CCR PR #266 / bug 275 verification] The book-ownership gate inside
  // findFirstAvailableTopicId (line 414) must surface a typed NotFoundError
  // when the bookId belongs to a different profile's subject. We drive the
  // private helper through the public startFirstCurriculumSession path —
  // which is the only place that supplies bookId from user input.
  it('[BREAK / bug 275] startFirstCurriculumSession throws NotFoundError when bookId belongs to a different subject', async () => {
    const ownerA = await seedProfileWithSubject('IDOR-A-book');
    const ownerB = await seedProfileWithSubject('IDOR-B-book');

    // Seed a book under owner A's subject.
    const [bookA] = await db
      .insert(curriculumBooks)
      .values({
        subjectId: ownerA.subjectId,
        title: 'Book A — Confidential',
        description: 'Profile A only',
        sortOrder: 0,
      })
      .returning({ id: curriculumBooks.id });

    // Owner B tries to start their first curriculum session pointing at
    // owner A's book. The ownership gate at session-crud.ts:414 must reject
    // it with NotFoundError — not the pre-fix bare Error.
    await expect(
      startFirstCurriculumSession(db, ownerB.profileId, ownerB.subjectId, {
        sessionType: 'learning',
        inputMode: 'text',
        bookId: bookA!.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describeIfDb('session-crud Library filing requests (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededAccounts();
  });

  async function seedSession(input?: {
    effectiveMode?: 'freeform' | 'learning';
    filingStatus?: 'filing_failed' | 'filing_kept_out' | null;
    filingRetryCount?: number;
    exchangeCount?: number;
  }): Promise<{ profileId: string; subjectId: string; sessionId: string }> {
    const owner = await seedProfileWithSubject('Library filing');
    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: input?.exchangeCount ?? 1,
        metadata: { effectiveMode: input?.effectiveMode ?? 'freeform' },
        filingStatus: input?.filingStatus ?? null,
        filingRetryCount: input?.filingRetryCount ?? 0,
      })
      .returning({ id: learningSessions.id });

    return {
      profileId: owner.profileId,
      subjectId: owner.subjectId,
      sessionId: session!.id,
    };
  }

  async function seedTranscript(session: {
    profileId: string;
    subjectId: string;
    sessionId: string;
  }): Promise<void> {
    await db.insert(sessionEvents).values([
      {
        sessionId: session.sessionId,
        profileId: session.profileId,
        subjectId: session.subjectId,
        eventType: 'user_message',
        content: 'Can we talk about photosynthesis?',
      },
      {
        sessionId: session.sessionId,
        profileId: session.profileId,
        subjectId: session.subjectId,
        eventType: 'ai_response',
        content: 'Sure. Plants use light energy to make sugars.',
      },
    ]);
  }

  it('rejects below-threshold unfiled freeform sessions even when transcript-backed', async () => {
    const session = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: null,
      filingRetryCount: 2,
      exchangeCount: 4,
    });
    await seedTranscript(session);

    await expect(
      requestSessionLibraryFiling(db, session.profileId, session.sessionId),
    ).resolves.toBeNull();
  });

  it('allows 5-exchange unfiled freeform sessions with transcript and returns a generated dispatch id', async () => {
    const session = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: null,
      filingRetryCount: 2,
      exchangeCount: 5,
    });
    await seedTranscript(session);

    const result = await requestSessionLibraryFiling(
      db,
      session.profileId,
      session.sessionId,
    );

    expect(result?.session.id).toBe(session.sessionId);
    expect(result?.session.filingStatus).toBeNull();
    expect(result?.session.filingRetryCount).toBe(0);
    expect(result?.dispatchId).toMatch(/^add-/);
    expect(result?.dispatchId).not.toBe('add-0');
  });

  it.each(['filing_failed', 'filing_kept_out'] as const)(
    'allows %s freeform sessions when unfiled and transcript-backed',
    async (filingStatus) => {
      const session = await seedSession({
        effectiveMode: 'freeform',
        filingStatus,
        filingRetryCount: 3,
        exchangeCount: 5,
      });
      await seedTranscript(session);

      const result = await requestSessionLibraryFiling(
        db,
        session.profileId,
        session.sessionId,
      );

      expect(result?.session.filingStatus).toBeNull();
      expect(result?.session.filingRetryCount).toBe(0);
      expect(result?.dispatchId).toMatch(/^add-/);
    },
  );

  it('rejects freeform add when no durable transcript events exist', async () => {
    const session = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: null,
    });

    await expect(
      requestSessionLibraryFiling(db, session.profileId, session.sessionId),
    ).resolves.toBeNull();
  });

  it('rejects non-freeform add even when the session has a transcript', async () => {
    const session = await seedSession({
      effectiveMode: 'learning',
      filingStatus: null,
    });
    await seedTranscript(session);

    await expect(
      requestSessionLibraryFiling(db, session.profileId, session.sessionId),
    ).resolves.toBeNull();
  });

  it('restore clears kept-out exhausted retry count and returns a fresh dispatch id', async () => {
    const session = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: 'filing_kept_out',
      filingRetryCount: 3,
      exchangeCount: 5,
    });

    const result = await restoreSessionForAutoFiling(
      db,
      session.profileId,
      session.sessionId,
    );

    expect(result?.session.filingStatus).toBeNull();
    expect(result?.session.filingRetryCount).toBe(0);
    expect(result?.dispatchId).toMatch(/^restore-/);
    expect(result?.dispatchId).not.toBe('restore-0');
  });

  it('rejects below-threshold kept-out restore requests', async () => {
    const session = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: 'filing_kept_out',
      filingRetryCount: 3,
      exchangeCount: 4,
    });

    await expect(
      restoreSessionForAutoFiling(db, session.profileId, session.sessionId),
    ).resolves.toBeNull();
  });

  it('retry reset clears failed exhausted retry count and generates unique dispatch ids not based on retry count', async () => {
    const first = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: 'filing_failed',
      filingRetryCount: 3,
      exchangeCount: 5,
    });
    const second = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: 'filing_failed',
      filingRetryCount: 3,
      exchangeCount: 5,
    });

    const firstResult = await resetFilingForRetry(
      db,
      first.profileId,
      first.sessionId,
    );
    const secondResult = await resetFilingForRetry(
      db,
      second.profileId,
      second.sessionId,
    );

    expect(firstResult?.session.filingRetryCount).toBe(0);
    expect(secondResult?.session.filingRetryCount).toBe(0);
    expect(firstResult?.dispatchId).toMatch(/^retry-/);
    expect(secondResult?.dispatchId).toMatch(/^retry-/);
    expect(firstResult?.dispatchId).not.toBe(secondResult?.dispatchId);
    expect(firstResult?.dispatchId).not.toBe('retry-0');
  });

  it('rejects below-threshold filing retry requests', async () => {
    const session = await seedSession({
      effectiveMode: 'freeform',
      filingStatus: 'filing_failed',
      filingRetryCount: 3,
      exchangeCount: 4,
    });

    await expect(
      resetFilingForRetry(db, session.profileId, session.sessionId),
    ).resolves.toBeNull();
  });
});
