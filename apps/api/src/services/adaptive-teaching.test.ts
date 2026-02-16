import {
  createStrikeState,
  recordWrongAnswer,
  getDirectInstructionPrompt,
  shouldAddToNeedsDeepening,
  canExitNeedsDeepening,
  checkNeedsDeepeningCapacity,
  getTeachingMethodOptions,
  buildMethodPreferencePrompt,
  type StrikeState,
  type NeedsDeepeningState,
} from './adaptive-teaching';

// ---------------------------------------------------------------------------
// createStrikeState
// ---------------------------------------------------------------------------

describe('createStrikeState', () => {
  it('creates state with 0 wrong count', () => {
    const state = createStrikeState('concept-vars');

    expect(state.conceptId).toBe('concept-vars');
    expect(state.wrongCount).toBe(0);
    expect(state.maxStrikes).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// recordWrongAnswer
// ---------------------------------------------------------------------------

describe('recordWrongAnswer', () => {
  it('returns continue_socratic on strike 1', () => {
    const state = createStrikeState('concept-loops');

    const result = recordWrongAnswer(state);

    expect(result.action).toBe('continue_socratic');
    expect(result.strikesUsed).toBe(1);
  });

  it('returns continue_socratic on strike 2', () => {
    const state: StrikeState = {
      ...createStrikeState('concept-loops'),
      wrongCount: 1,
    };

    const result = recordWrongAnswer(state);

    expect(result.action).toBe('continue_socratic');
    expect(result.strikesUsed).toBe(2);
  });

  it('returns switch_to_direct on strike 3', () => {
    const state: StrikeState = {
      ...createStrikeState('concept-loops'),
      wrongCount: 2,
    };

    const result = recordWrongAnswer(state);

    expect(result.action).toBe('switch_to_direct');
    expect(result.strikesUsed).toBe(3);
  });

  it('returns flag_needs_deepening after direct instruction (strike 4+)', () => {
    const state: StrikeState = {
      ...createStrikeState('concept-loops'),
      wrongCount: 3,
    };

    const result = recordWrongAnswer(state);

    expect(result.action).toBe('flag_needs_deepening');
    expect(result.strikesUsed).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getDirectInstructionPrompt
// ---------------------------------------------------------------------------

describe('getDirectInstructionPrompt', () => {
  it('uses "Not Yet" framing', () => {
    const prompt = getDirectInstructionPrompt('JavaScript', 'closures');

    expect(prompt).toContain('Not Yet');
  });

  it('includes the topic and concept', () => {
    const prompt = getDirectInstructionPrompt(
      'Python Basics',
      'list comprehensions'
    );

    expect(prompt).toContain('Python Basics');
    expect(prompt).toContain('list comprehensions');
  });

  it('mentions direct instruction', () => {
    const prompt = getDirectInstructionPrompt('Math', 'fractions');

    expect(prompt).toContain('direct instruction');
  });
});

// ---------------------------------------------------------------------------
// shouldAddToNeedsDeepening
// ---------------------------------------------------------------------------

describe('shouldAddToNeedsDeepening', () => {
  it('returns false when under max strikes', () => {
    const state: StrikeState = {
      ...createStrikeState('concept-a'),
      wrongCount: 2,
    };

    expect(shouldAddToNeedsDeepening(state)).toBe(false);
  });

  it('returns true when at max strikes', () => {
    const state: StrikeState = {
      ...createStrikeState('concept-a'),
      wrongCount: 3,
    };

    expect(shouldAddToNeedsDeepening(state)).toBe(true);
  });

  it('returns true when past max strikes', () => {
    const state: StrikeState = {
      ...createStrikeState('concept-a'),
      wrongCount: 5,
    };

    expect(shouldAddToNeedsDeepening(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canExitNeedsDeepening
// ---------------------------------------------------------------------------

describe('canExitNeedsDeepening', () => {
  it('returns false with fewer than 3 consecutive successes', () => {
    const state: NeedsDeepeningState = {
      topicId: 'topic-1',
      subjectId: 'subject-1',
      consecutiveSuccessCount: 2,
      status: 'active',
    };

    expect(canExitNeedsDeepening(state)).toBe(false);
  });

  it('returns true with exactly 3 consecutive successes', () => {
    const state: NeedsDeepeningState = {
      topicId: 'topic-1',
      subjectId: 'subject-1',
      consecutiveSuccessCount: 3,
      status: 'active',
    };

    expect(canExitNeedsDeepening(state)).toBe(true);
  });

  it('returns true with more than 3 consecutive successes', () => {
    const state: NeedsDeepeningState = {
      topicId: 'topic-1',
      subjectId: 'subject-1',
      consecutiveSuccessCount: 5,
      status: 'active',
    };

    expect(canExitNeedsDeepening(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkNeedsDeepeningCapacity
// ---------------------------------------------------------------------------

describe('checkNeedsDeepeningCapacity', () => {
  it('returns not at capacity when under 10', () => {
    const result = checkNeedsDeepeningCapacity(5);

    expect(result.atCapacity).toBe(false);
    expect(result.shouldPromote).toBe(false);
  });

  it('returns at capacity and should promote at 10', () => {
    const result = checkNeedsDeepeningCapacity(10);

    expect(result.atCapacity).toBe(true);
    expect(result.shouldPromote).toBe(true);
  });

  it('returns at capacity for counts above 10', () => {
    const result = checkNeedsDeepeningCapacity(12);

    expect(result.atCapacity).toBe(true);
    expect(result.shouldPromote).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTeachingMethodOptions
// ---------------------------------------------------------------------------

describe('getTeachingMethodOptions', () => {
  it('returns all 4 teaching methods', () => {
    const methods = getTeachingMethodOptions();

    expect(methods).toHaveLength(4);
    expect(methods).toContain('visual_diagrams');
    expect(methods).toContain('step_by_step');
    expect(methods).toContain('real_world_examples');
    expect(methods).toContain('practice_problems');
  });

  it('returns a new array each time (no mutation risk)', () => {
    const methods1 = getTeachingMethodOptions();
    const methods2 = getTeachingMethodOptions();

    expect(methods1).not.toBe(methods2);
    expect(methods1).toEqual(methods2);
  });
});

// ---------------------------------------------------------------------------
// buildMethodPreferencePrompt
// ---------------------------------------------------------------------------

describe('buildMethodPreferencePrompt', () => {
  it('includes method name for visual_diagrams', () => {
    const prompt = buildMethodPreferencePrompt('visual_diagrams');

    expect(prompt).toContain('visual_diagrams');
    expect(prompt).toContain('diagrams');
  });

  it('includes method name for step_by_step', () => {
    const prompt = buildMethodPreferencePrompt('step_by_step');

    expect(prompt).toContain('step_by_step');
    expect(prompt).toContain('step');
  });

  it('includes method name for real_world_examples', () => {
    const prompt = buildMethodPreferencePrompt('real_world_examples');

    expect(prompt).toContain('real_world_examples');
    expect(prompt).toContain('real-world');
  });

  it('includes method name for practice_problems', () => {
    const prompt = buildMethodPreferencePrompt('practice_problems');

    expect(prompt).toContain('practice_problems');
    expect(prompt).toContain('practice');
  });

  it('handles unknown methods gracefully', () => {
    const prompt = buildMethodPreferencePrompt('custom_method');

    expect(prompt).toContain('custom_method');
  });
});
