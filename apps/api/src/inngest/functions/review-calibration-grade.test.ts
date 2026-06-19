import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { handleReviewCalibrationGrade } from './review-calibration-grade';
import { xpLedger } from '@eduagent/database';

// gc1-allow: step DB boundary — getStepDatabase() calls neon-serverless which
// requires a real DATABASE_URL; not exercisable in Jest's Node env.
const mockGetStepDatabase = jest.fn();
jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

function createMockStepDb() {
  const mock: Record<string, unknown> = {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p = Promise.resolve(undefined);
          (p as unknown as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([{ id: 'row-1' }]);
          return p;
        }),
      }),
    }),
  };
  return mock;
}

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const TOPIC_ID = '00000000-0000-4000-8000-000000000003';
const CARD_ID = '00000000-0000-4000-8000-000000000004';
const EVENT_TS = '2026-01-15T12:00:00.000Z';

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    profileId: PROFILE_ID,
    sessionId: SESSION_ID,
    topicId: TOPIC_ID,
    learnerMessage: 'Plants turn sunlight into food.',
    topicTitle: 'Photosynthesis',
    timestamp: EVENT_TS,
    ...overrides,
  };
}

function makeFreshCard() {
  return {
    id: CARD_ID,
    profileId: PROFILE_ID,
    topicId: TOPIC_ID,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    nextReviewAt: null,
    lastReviewedAt: null,
    masteredAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    evaluateDifficultyRung: null,
  };
}

function executeHandlerWithResults(
  eventData: unknown,
  runResults?: Record<string, unknown>,
) {
  const { step, runCalls } = createInngestStepRunner({ runResults });
  const resultPromise = handleReviewCalibrationGrade({
    event: { data: eventData },
    step: step as unknown as {
      run: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;
    },
  });
  return resultPromise.then((result) => ({ result, runCalls }));
}

describe('reviewCalibrationGrade', () => {
  it('skips invalid payloads before running any steps', async () => {
    const { result, runCalls } = await executeHandlerWithResults({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      learnerMessage: 'Plants turn sunlight into food.',
      topicTitle: 'Photosynthesis',
      // Missing timestamp: every durable app event payload must carry one.
    });

    expect(result).toEqual({ skipped: 'invalid_payload' });
    expect(runCalls).toHaveLength(0);
  });

  it('returns no_retention_card when card lookup yields null', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      { 'load-retention-card': null },
    );

    expect(result).toEqual({
      skipped: 'no_retention_card',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]!.name).toBe('load-retention-card');
  });

  it('returns cooldown_active when last review is within 24 hours', async () => {
    const recentCard = {
      ...makeFreshCard(),
      lastReviewedAt: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour ago
    };

    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      { 'load-retention-card': recentCard },
    );

    expect(result).toEqual({
      skipped: 'cooldown_active',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(1);
  });

  it('grades recall quality and persists retention update (happy path)', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [{ id: CARD_ID }],
        'grade-recall-quality': 4,
        'finalize-retention-update': undefined,
        'stamp-mastery-on-verify': undefined,
      },
    );

    expect(result).toMatchObject({
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      quality: 4,
      passed: true,
    });
    expect(runCalls).toHaveLength(5);
    // F-174: the cooldown claim MUST precede the paid LLM grade step.
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'claim-cooldown-slot',
      'grade-recall-quality',
      'finalize-retention-update',
      'stamp-mastery-on-verify',
    ]);
  });

  it('returns cooldown_claim_lost when CAS update matches 0 rows', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [],
        // Pre-fix step names kept as safety nets so a regression to the old
        // ordering cannot leak a real LLM call out of this unit test.
        'grade-recall-quality': 4,
        'persist-retention-update': [],
      },
    );

    expect(result).toEqual({
      skipped: 'cooldown_claim_lost',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(2);
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'claim-cooldown-slot',
    ]);
  });

  // F-174: the paid LLM grade ran BEFORE the cooldown claim, so a lost claim
  // still burned an LLM call. The claim must precede the grade.
  it('[F-174] does NOT run the paid LLM grade step when the cooldown claim fails', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'claim-cooldown-slot': [], // 0 rows → claim lost
        // Safety net against the pre-fix ordering — must NOT be reached.
        'grade-recall-quality': 4,
        'persist-retention-update': [],
      },
    );

    expect(result).toEqual({
      skipped: 'cooldown_claim_lost',
      sessionId: SESSION_ID,
    });
    expect(runCalls.map((c) => c.name)).not.toContain('grade-recall-quality');
  });

  // [WI-848] finalize-retention-update callback runs inline (not stubbed) so
  // the real syncXpLedgerStatus call can be asserted via db.update.
  it('[WI-848] syncs xp_ledger.status to decayed when calibration grade yields decay', async () => {
    const db = createMockStepDb();
    mockGetStepDatabase.mockReturnValue(db);

    await executeHandlerWithResults(makeValidPayload(), {
      'load-retention-card': makeFreshCard(),
      'claim-cooldown-slot': [{ id: CARD_ID }],
      'grade-recall-quality': 0, // quality 0 → processRecallResult yields xpChange:'decayed'
      // finalize-retention-update: intentionally omitted so the callback runs inline
      'stamp-mastery-on-verify': undefined,
    });

    const updateTables = (db.update as jest.Mock).mock.calls.map(
      ([table]: [unknown]) => table,
    );
    expect(updateTables).toContain(xpLedger);

    const xpLedgerIdx = updateTables.indexOf(xpLedger);
    const xpSetCalls = (db.update as jest.Mock).mock.results[xpLedgerIdx]!.value
      .set.mock.calls;
    expect(xpSetCalls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ status: 'decayed' })],
      ]),
    );
  });

  it('[WI-848] does NOT sync xp_ledger to decayed when calibration grade yields verified', async () => {
    const db = createMockStepDb();
    mockGetStepDatabase.mockReturnValue(db);

    await executeHandlerWithResults(makeValidPayload(), {
      'load-retention-card': makeFreshCard(),
      'claim-cooldown-slot': [{ id: CARD_ID }],
      'grade-recall-quality': 5, // quality 5 → processRecallResult yields xpChange:'verified'
      // finalize-retention-update: intentionally omitted so the callback runs inline
      'stamp-mastery-on-verify': undefined,
    });

    const updateTables = (db.update as jest.Mock).mock.calls.map(
      ([table]: [unknown]) => table,
    );
    // xpLedger must not be updated with 'decayed' on a pass
    const xpLedgerIdx = updateTables.indexOf(xpLedger);
    if (xpLedgerIdx !== -1) {
      const xpSetCalls = (db.update as jest.Mock).mock.results[xpLedgerIdx]!
        .value.set.mock.calls as Array<[Record<string, unknown>]>;
      expect(xpSetCalls).not.toEqual(
        expect.arrayContaining([
          [expect.objectContaining({ status: 'decayed' })],
        ]),
      );
    }
    // If xpLedger is not in the update tables at all, that also satisfies the assertion.
  });
});
