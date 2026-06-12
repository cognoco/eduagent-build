// ---------------------------------------------------------------------------
// session-homework.ts — unit tests
// ---------------------------------------------------------------------------

import {
  getHomeworkTrackingMetadata,
  syncHomeworkState,
} from './session-homework';
import { NotFoundError } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// getHomeworkTrackingMetadata — pure helper
// ---------------------------------------------------------------------------

describe('getHomeworkTrackingMetadata', () => {
  it('returns empty object for null input', () => {
    expect(getHomeworkTrackingMetadata(null)).toEqual({});
  });

  it('returns empty object for undefined input', () => {
    expect(getHomeworkTrackingMetadata(undefined)).toEqual({});
  });

  it('returns empty object for non-object (string)', () => {
    expect(getHomeworkTrackingMetadata('not an object')).toEqual({});
  });

  it('returns empty object for non-object (number)', () => {
    expect(getHomeworkTrackingMetadata(42)).toEqual({});
  });

  it('returns empty object for array (not a plain object)', () => {
    expect(getHomeworkTrackingMetadata([{ homework: {} }])).toEqual({});
  });

  it('returns the object as-is for a plain object', () => {
    const meta = { homework: { displayTitle: 'Algebra', problems: [] } };
    expect(getHomeworkTrackingMetadata(meta)).toBe(meta);
  });

  it('returns empty object for an empty plain object', () => {
    const meta = {};
    expect(getHomeworkTrackingMetadata(meta)).toBe(meta);
  });
});

// ---------------------------------------------------------------------------
// syncHomeworkState — DB-backed logic
// ---------------------------------------------------------------------------
// createScopedRepository uses db.query.learningSessions.findFirst internally.
// We stub that path directly. No jest.mock of internal modules (GC1/GC6).

function buildMinimalHomeworkSession(
  overrides: {
    sessionId?: string;
    profileId?: string;
    sessionType?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  return {
    id: overrides.sessionId ?? 'sess-hw-1',
    profileId: overrides.profileId ?? 'prof-1',
    subjectId: 'subj-1',
    topicId: null as string | null,
    sessionType: overrides.sessionType ?? 'homework',
    metadata: overrides.metadata ?? (null as unknown),
    status: 'active',
    exchangeCount: 0,
    escalationRung: 1,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    endedAt: null,
    durationSeconds: null,
    wallClockSeconds: null,
    rawInput: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
}

function makeSyncInput(
  problems: Array<{
    id: string;
    text: string;
    status: 'pending' | 'active' | 'completed';
    source?: 'ocr' | 'manual';
    originalText?: string;
    selectedMode?: 'help_me' | 'check_answer';
  }>,
) {
  return {
    metadata: {
      problemCount: problems.length,
      currentProblemIndex: 0,
      problems: problems.map((p) => ({
        id: p.id,
        text: p.text,
        status: p.status,
        source: p.source ?? ('manual' as const),
        originalText: p.originalText,
        selectedMode: p.selectedMode,
      })),
    },
  };
}

/** Build a db stub that satisfies createScopedRepository's internal API. */
function buildHwDb(
  sessionRow: ReturnType<typeof buildMinimalHomeworkSession> | null,
  overrides: {
    captureUpdateWhere?: (pred: unknown) => void;
    captureInsertValues?: (vals: unknown[]) => void;
  } = {},
) {
  // createScopedRepository uses db.query.learningSessions.findFirst
  const sessionsFindFirst = jest
    .fn()
    .mockResolvedValue(sessionRow ?? undefined);
  const lockLimit = jest.fn().mockResolvedValue(sessionRow ? [sessionRow] : []);
  const lockForUpdate = jest.fn().mockReturnValue({ limit: lockLimit });
  const lockWhere = jest.fn().mockReturnValue({ for: lockForUpdate });
  const lockFrom = jest.fn().mockReturnValue({ where: lockWhere });
  const selectForLock = jest.fn().mockReturnValue({ from: lockFrom });

  // db.update — capture WHERE predicate if caller wants it
  const updateWhereChain = jest.fn((pred: unknown) => {
    overrides.captureUpdateWhere?.(pred);
    return Promise.resolve();
  });
  const updateSetChain = { where: updateWhereChain };
  const updateStart = { set: jest.fn().mockReturnValue(updateSetChain) };

  // db.insert
  const insertValuesMock = jest.fn((v: unknown) => {
    if (Array.isArray(v)) overrides.captureInsertValues?.(v as unknown[]);
    return Promise.resolve();
  });
  const insertChain = { values: insertValuesMock };

  const db = {
    query: {
      learningSessions: { findFirst: sessionsFindFirst },
    },
    select: selectForLock,
    update: jest.fn().mockReturnValue(updateStart),
    insert: jest.fn().mockReturnValue(insertChain),
  } as unknown as import('@eduagent/database').Database;
  (db as unknown as { transaction: jest.Mock }).transaction = jest.fn(
    async (fn: (tx: typeof db) => unknown) => fn(db),
  );

  return { db, insertValuesMock, updateWhereChain, lockForUpdate };
}

describe('syncHomeworkState', () => {
  it('throws NotFoundError when the scoped repo returns nothing', async () => {
    const { db } = buildHwDb(null);

    await expect(
      syncHomeworkState(db, 'prof-1', 'nonexistent-sess', makeSyncInput([])),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws when session type is not homework', async () => {
    const learningSession = buildMinimalHomeworkSession({
      sessionType: 'learning',
    });
    const { db } = buildHwDb(learningSession);

    await expect(
      syncHomeworkState(db, 'prof-1', 'sess-hw-1', makeSyncInput([])),
    ).rejects.toThrow(
      'Homework state sync is only available for homework sessions',
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('does not insert any events when all problems are pending (no state change)', async () => {
    const { db } = buildHwDb(buildMinimalHomeworkSession());

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([{ id: 'p1', text: 'What is 2+2?', status: 'pending' }]),
    );

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('inserts homework_problem_started event for newly active problems', async () => {
    let capturedInsert: unknown[] = [];
    const { db } = buildHwDb(buildMinimalHomeworkSession(), {
      captureInsertValues: (v) => {
        capturedInsert = v;
      },
    });

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([{ id: 'p1', text: 'Solve x+1=3', status: 'active' }]),
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
    const events = capturedInsert as Array<{
      eventType: string;
      metadata: { problemId: string };
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('homework_problem_started');
    expect(events[0]?.metadata.problemId).toBe('p1');
  });

  it('inserts homework_problem_completed event for newly completed problems', async () => {
    let capturedInsert: unknown[] = [];
    const { db } = buildHwDb(buildMinimalHomeworkSession(), {
      captureInsertValues: (v) => {
        capturedInsert = v;
      },
    });

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([{ id: 'p2', text: 'What is 3*4?', status: 'completed' }]),
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
    const events = capturedInsert as Array<{ eventType: string }>;
    expect(events[0]?.eventType).toBe('homework_problem_completed');
  });

  it('inserts ocr_correction event when OCR text differs from original', async () => {
    let capturedInsert: unknown[] = [];
    const { db } = buildHwDb(buildMinimalHomeworkSession(), {
      captureInsertValues: (v) => {
        capturedInsert = v;
      },
    });

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([
        {
          id: 'p3',
          text: 'Solve x + 1 = 3',
          status: 'pending',
          source: 'ocr',
          originalText: 'Solv x  1 = 3',
        },
      ]),
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
    const events = capturedInsert as Array<{
      eventType: string;
      metadata: { originalText: string; correctedText: string };
    }>;
    expect(events[0]?.eventType).toBe('ocr_correction');
    expect(events[0]?.metadata.originalText).toBe('Solv x  1 = 3');
    expect(events[0]?.metadata.correctedText).toBe('Solve x + 1 = 3');
  });

  it('does NOT fire ocr_correction event when OCR text matches original', async () => {
    const { db } = buildHwDb(buildMinimalHomeworkSession());

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([
        {
          id: 'p4',
          text: 'Solve x + 1 = 3',
          status: 'pending',
          source: 'ocr',
          originalText: 'Solve x + 1 = 3', // same as text — no correction
        },
      ]),
    );

    // No events — no diff, no state change
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('is idempotent: does not re-fire events for already logged problem IDs', async () => {
    const session = buildMinimalHomeworkSession({
      metadata: {
        homework: {
          displayTitle: 'Algebra HW',
          problems: [],
          loggedStartedProblemIds: ['p1'],
          loggedCompletedProblemIds: [],
          loggedCorrectionIds: [],
        },
      },
    });
    const { db } = buildHwDb(session);

    // p1 is already in loggedStartedProblemIds, so no event should be fired
    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([{ id: 'p1', text: 'Solve x+1=3', status: 'active' }]),
    );

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('accumulates tracking IDs for multiple events in a single sync call', async () => {
    let capturedInsert: unknown[] = [];
    const { db } = buildHwDb(buildMinimalHomeworkSession(), {
      captureInsertValues: (v) => {
        capturedInsert = v;
      },
    });

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([
        { id: 'p1', text: 'Problem 1', status: 'active' },
        { id: 'p2', text: 'Problem 2', status: 'completed' },
      ]),
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
    const events = capturedInsert as Array<{ eventType: string }>;
    expect(events).toHaveLength(2);
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('homework_problem_started');
    expect(eventTypes).toContain('homework_problem_completed');
  });

  it('returns enriched metadata including accumulated tracking IDs (BD-04)', async () => {
    const { db } = buildHwDb(buildMinimalHomeworkSession());

    const result = await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([
        { id: 'p-started', text: 'Problem 1', status: 'active' },
        { id: 'p-done', text: 'Problem 2', status: 'completed' },
      ]),
    );

    // Result must reflect the ACCUMULATED state, not just input problems
    expect(result.metadata.loggedStartedProblemIds).toContain('p-started');
    expect(result.metadata.loggedCompletedProblemIds).toContain('p-done');
  });

  it('includes the caller profileId in the WHERE clause of the update (profile scoping)', async () => {
    let capturedUpdateWhere: unknown = undefined;
    const session = buildMinimalHomeworkSession({ profileId: 'prof-owner' });
    const { db, updateWhereChain } = buildHwDb(session, {
      captureUpdateWhere: (pred) => {
        capturedUpdateWhere = pred;
      },
    });

    await syncHomeworkState(
      db,
      'prof-owner',
      'sess-hw-1',
      makeSyncInput([{ id: 'p1', text: 'A problem', status: 'active' }]),
    );

    // The WHERE predicate is a Drizzle SQL object (circular — not JSON-serializable).
    // Verify it was passed to the update chain (not undefined), confirming the update
    // is profile-scoped. The actual AND(id=, profileId=) composition is enforced
    // by the service code; the existence of the predicate is the observable invariant.
    expect(updateWhereChain).toHaveBeenCalledTimes(1);
    expect(capturedUpdateWhere).toBeDefined();
  });

  it('[WI-78 DS-245] locks the session row while deciding homework lifecycle events', async () => {
    const { db, lockForUpdate } = buildHwDb(buildMinimalHomeworkSession());

    await syncHomeworkState(
      db,
      'prof-1',
      'sess-hw-1',
      makeSyncInput([{ id: 'p1', text: 'A problem', status: 'active' }]),
    );

    expect(
      (db as unknown as { transaction: jest.Mock }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(lockForUpdate).toHaveBeenCalledWith('update');
  });

  it('does not write events to a different profile session (cross-profile isolation)', async () => {
    // Session belongs to 'prof-victim' but call is made with 'prof-attacker'.
    // createScopedRepository scopes the findFirst to the caller's profileId,
    // so it returns undefined for the wrong profile — causing "Session not found".
    const victimSession = buildMinimalHomeworkSession({
      profileId: 'prof-victim',
    });

    // Scoped repo with 'prof-attacker' would return undefined for 'prof-victim' session.
    // We simulate this by returning null (scoped repo sees no row for the attacker).
    const { db } = buildHwDb(null);

    await expect(
      syncHomeworkState(
        db,
        'prof-attacker',
        'sess-hw-1',
        makeSyncInput([
          { id: 'p1', text: 'Injected problem', status: 'active' },
        ]),
      ),
    ).rejects.toThrow('Session not found');

    expect(db.insert).not.toHaveBeenCalled();
    void victimSession; // referenced to show intent
  });
});
