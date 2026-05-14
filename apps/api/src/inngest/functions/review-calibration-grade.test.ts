import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { handleReviewCalibrationGrade } from './review-calibration-grade';

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
        'grade-recall-quality': 4,
        'persist-retention-update': [{ id: CARD_ID }],
        'sync-xp-ledger': undefined,
      },
    );

    expect(result).toMatchObject({
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      quality: 4,
      passed: true,
    });
    expect(runCalls).toHaveLength(4);
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'grade-recall-quality',
      'persist-retention-update',
      'sync-xp-ledger',
    ]);
  });

  it('returns cooldown_claim_lost when CAS update matches 0 rows', async () => {
    const { result, runCalls } = await executeHandlerWithResults(
      makeValidPayload(),
      {
        'load-retention-card': makeFreshCard(),
        'grade-recall-quality': 4,
        'persist-retention-update': [],
      },
    );

    expect(result).toEqual({
      skipped: 'cooldown_claim_lost',
      sessionId: SESSION_ID,
    });
    expect(runCalls).toHaveLength(3);
    expect(runCalls.map((c) => c.name)).toEqual([
      'load-retention-card',
      'grade-recall-quality',
      'persist-retention-update',
    ]);
  });
});
