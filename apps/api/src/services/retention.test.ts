import {
  createInitialRetentionState,
  processRecallResult,
  isReviewDue,
  canRetestTopic,
  getRetentionStatus,
  isTopicStable,
  STABILITY_THRESHOLD,
  type RetentionState,
} from './retention';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a retention state with overrides for testing */
function createTestState(
  overrides: Partial<RetentionState> = {}
): RetentionState {
  return {
    ...createInitialRetentionState('topic-1'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createInitialRetentionState
// ---------------------------------------------------------------------------

describe('createInitialRetentionState', () => {
  it('has correct default values', () => {
    const state = createInitialRetentionState('topic-abc');

    expect(state.topicId).toBe('topic-abc');
    expect(state.easeFactor).toBe(2.5);
    expect(state.intervalDays).toBe(1);
    expect(state.repetitions).toBe(0);
    expect(state.failureCount).toBe(0);
    expect(state.consecutiveSuccesses).toBe(0);
    expect(state.xpStatus).toBe('pending');
    expect(state.nextReviewAt).toBeNull();
    expect(state.lastReviewedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processRecallResult
// ---------------------------------------------------------------------------

describe('processRecallResult', () => {
  it('increases interval and reps on successful recall (quality 4)', () => {
    const state = createTestState({ repetitions: 1, intervalDays: 1 });

    const result = processRecallResult(state, 4);

    expect(result.passed).toBe(true);
    expect(result.newState.repetitions).toBe(2);
    expect(result.newState.intervalDays).toBeGreaterThanOrEqual(1);
    expect(result.newState.consecutiveSuccesses).toBe(1);
  });

  it('resets reps and increases failure count on failed recall (quality 1)', () => {
    const state = createTestState({ repetitions: 3, intervalDays: 10 });

    const result = processRecallResult(state, 1);

    expect(result.passed).toBe(false);
    expect(result.newState.repetitions).toBe(0);
    expect(result.newState.failureCount).toBe(1);
    expect(result.newState.consecutiveSuccesses).toBe(0);
  });

  it('returns feedback_only on first failure', () => {
    const state = createTestState({ failureCount: 0 });

    const result = processRecallResult(state, 1);

    expect(result.failureAction).toBe('feedback_only');
  });

  it('returns feedback_only on second failure', () => {
    const state = createTestState({ failureCount: 1 });

    const result = processRecallResult(state, 2);

    expect(result.failureAction).toBe('feedback_only');
  });

  it('returns redirect_to_learning_book on third failure', () => {
    const state = createTestState({ failureCount: 2 });

    const result = processRecallResult(state, 1);

    expect(result.failureAction).toBe('redirect_to_learning_book');
  });

  it('transitions XP to verified on delayed recall success', () => {
    const state = createTestState({
      consecutiveSuccesses: 1,
      xpStatus: 'pending',
    });

    const result = processRecallResult(state, 4);

    expect(result.passed).toBe(true);
    expect(result.newState.xpStatus).toBe('verified');
    expect(result.xpChange).toBe('verified');
  });

  it('resets failureCount to 0 on successful recall (FR52-58)', () => {
    const state = createTestState({ failureCount: 2, repetitions: 1 });

    const result = processRecallResult(state, 4);

    expect(result.passed).toBe(true);
    expect(result.newState.failureCount).toBe(0);
  });

  it('resets failureCount from 3+ to 0 on successful recall', () => {
    const state = createTestState({ failureCount: 5, repetitions: 1 });

    const result = processRecallResult(state, 3);

    expect(result.passed).toBe(true);
    expect(result.newState.failureCount).toBe(0);
  });

  it('keeps XP pending on first success (no delayed recall yet)', () => {
    const state = createTestState({
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
    });

    const result = processRecallResult(state, 4);

    expect(result.passed).toBe(true);
    expect(result.newState.xpStatus).toBe('pending');
    expect(result.xpChange).toBe('none');
  });

  it('decays XP on failure', () => {
    const state = createTestState({ xpStatus: 'verified' });

    const result = processRecallResult(state, 1);

    expect(result.passed).toBe(false);
    expect(result.newState.xpStatus).toBe('decayed');
    expect(result.xpChange).toBe('decayed');
  });

  it('sets nextReviewAt and lastReviewedAt', () => {
    const state = createTestState();

    const result = processRecallResult(state, 4);

    expect(result.newState.nextReviewAt).not.toBeNull();
    expect(result.newState.lastReviewedAt).not.toBeNull();
  });

  it('clamps quality to 0-5 range', () => {
    const state = createTestState();

    // Quality above 5 should be clamped
    const resultHigh = processRecallResult(state, 7);
    expect(resultHigh.passed).toBe(true);

    // Quality below 0 should be clamped
    const resultLow = processRecallResult(state, -2);
    expect(resultLow.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isReviewDue
// ---------------------------------------------------------------------------

describe('isReviewDue', () => {
  it('returns true when past due', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const state = createTestState({
      nextReviewAt: pastDate.toISOString(),
    });

    expect(isReviewDue(state)).toBe(true);
  });

  it('returns false when not yet due', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const state = createTestState({
      nextReviewAt: futureDate.toISOString(),
    });

    expect(isReviewDue(state)).toBe(false);
  });

  it('returns false when nextReviewAt is null', () => {
    const state = createTestState({ nextReviewAt: null });

    expect(isReviewDue(state)).toBe(false);
  });

  it('accepts an explicit now parameter', () => {
    const reviewDate = new Date('2025-06-01T12:00:00Z');
    const state = createTestState({
      nextReviewAt: reviewDate.toISOString(),
    });

    const beforeReview = new Date('2025-05-31T12:00:00Z');
    const afterReview = new Date('2025-06-02T12:00:00Z');

    expect(isReviewDue(state, beforeReview)).toBe(false);
    expect(isReviewDue(state, afterReview)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canRetestTopic
// ---------------------------------------------------------------------------

describe('canRetestTopic', () => {
  it('returns true when never tested', () => {
    const state = createTestState();

    expect(canRetestTopic(state, null)).toBe(true);
  });

  it('returns false within 24h cooldown', () => {
    const state = createTestState();
    const recentTest = new Date().toISOString();

    expect(canRetestTopic(state, recentTest)).toBe(false);
  });

  it('returns true after 24h cooldown has passed', () => {
    const state = createTestState();
    const oldTest = new Date();
    oldTest.setDate(oldTest.getDate() - 2);

    expect(canRetestTopic(state, oldTest.toISOString())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRetentionStatus
// ---------------------------------------------------------------------------

describe('getRetentionStatus', () => {
  it('returns forgotten when never reviewed', () => {
    const state = createTestState({ lastReviewedAt: null });

    expect(getRetentionStatus(state)).toBe('forgotten');
  });

  it('returns strong when recently reviewed within interval', () => {
    const now = new Date();
    const state = createTestState({
      lastReviewedAt: now.toISOString(),
      intervalDays: 7,
    });

    expect(getRetentionStatus(state)).toBe('strong');
  });

  it('returns fading when 1-2x past interval', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    const state = createTestState({
      lastReviewedAt: pastDate.toISOString(),
      intervalDays: 7,
    });

    expect(getRetentionStatus(state)).toBe('fading');
  });

  it('returns weak when 2-4x past interval', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 21);

    const state = createTestState({
      lastReviewedAt: pastDate.toISOString(),
      intervalDays: 7,
    });

    expect(getRetentionStatus(state)).toBe('weak');
  });

  it('returns forgotten when 4x+ past interval', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 35);

    const state = createTestState({
      lastReviewedAt: pastDate.toISOString(),
      intervalDays: 7,
    });

    expect(getRetentionStatus(state)).toBe('forgotten');
  });
});

// ---------------------------------------------------------------------------
// isTopicStable (FR93)
// ---------------------------------------------------------------------------

describe('isTopicStable', () => {
  it('returns false when below threshold', () => {
    expect(isTopicStable(0)).toBe(false);
    expect(isTopicStable(STABILITY_THRESHOLD - 1)).toBe(false);
  });

  it('returns true when at exactly the threshold', () => {
    expect(isTopicStable(STABILITY_THRESHOLD)).toBe(true);
  });

  it('returns true when above threshold', () => {
    expect(isTopicStable(STABILITY_THRESHOLD + 3)).toBe(true);
  });

  it('has threshold of 5', () => {
    expect(STABILITY_THRESHOLD).toBe(5);
  });
});
