import {
  createTimerConfig,
  checkTimers,
  recordActivity,
  computePaceMultiplier,
  computeSilenceThresholdSeconds,
  normalizeExpectedResponseMinutes,
} from './session-lifecycle';
import type { SessionTimerState } from './session-lifecycle';

// ---------------------------------------------------------------------------
// createTimerConfig
// ---------------------------------------------------------------------------

describe('createTimerConfig', () => {
  it('uses adaptive silence threshold and 30min auto-save timer', () => {
    const learning = createTimerConfig({
      sessionType: 'learning',
      expectedResponseMinutes: 6,
    });

    expect(learning.silenceThresholdSeconds).toBe(6 * 60);
    expect(learning.autoSaveThresholdSeconds).toBe(30 * 60);
  });

  it('initialises sessionStartedAt and lastActivityAt', () => {
    const before = Date.now();
    const state = createTimerConfig({ sessionType: 'learning' });
    const after = Date.now();

    expect(state.sessionStartedAt).toBeGreaterThanOrEqual(before);
    expect(state.sessionStartedAt).toBeLessThanOrEqual(after);
    expect(state.lastActivityAt).toBe(state.sessionStartedAt);
  });
});

// ---------------------------------------------------------------------------
// normalizeExpectedResponseMinutes
// ---------------------------------------------------------------------------

describe('normalizeExpectedResponseMinutes', () => {
  it('returns default 10 when value is null', () => {
    expect(normalizeExpectedResponseMinutes(null)).toBe(10);
  });

  it('returns default 10 when value is undefined', () => {
    expect(normalizeExpectedResponseMinutes(undefined)).toBe(10);
  });

  it('returns default 10 when value is NaN', () => {
    expect(normalizeExpectedResponseMinutes(NaN)).toBe(10);
  });

  it('clamps below-minimum values to 1 (current MIN boundary)', () => {
    // NOTE [4E.7]: The implementation clamps to 1, but the
    // MIN_EXPECTED_RESPONSE_MINUTES constant is 2. The constant is
    // used in computeSilenceThresholdSeconds for the post-multiplication
    // clamp, not here. This means normalizeExpectedResponseMinutes allows
    // 1 minute, even though silence thresholds clamp at 2 minutes.
    expect(normalizeExpectedResponseMinutes(0)).toBe(1);
    expect(normalizeExpectedResponseMinutes(0.4)).toBe(1);
    expect(normalizeExpectedResponseMinutes(-5)).toBe(1);
  });

  it('clamps above-maximum values to 20', () => {
    expect(normalizeExpectedResponseMinutes(25)).toBe(20);
    expect(normalizeExpectedResponseMinutes(100)).toBe(20);
  });

  it('rounds to nearest integer', () => {
    expect(normalizeExpectedResponseMinutes(5.4)).toBe(5);
    expect(normalizeExpectedResponseMinutes(5.6)).toBe(6);
  });

  it('passes through valid integer values unchanged', () => {
    expect(normalizeExpectedResponseMinutes(5)).toBe(5);
    expect(normalizeExpectedResponseMinutes(10)).toBe(10);
    expect(normalizeExpectedResponseMinutes(1)).toBe(1);
    expect(normalizeExpectedResponseMinutes(20)).toBe(20);
  });
});

describe('computePaceMultiplier', () => {
  it('returns 1 when fewer than 3 exchanges exist and no baseline exists', () => {
    expect(
      computePaceMultiplier({
        responseHistory: [
          { actualResponseSeconds: 120, expectedResponseMinutes: 2 },
        ],
      })
    ).toBe(1);
  });

  it('uses historical baseline before 3 exchanges', () => {
    expect(
      computePaceMultiplier({
        responseHistory: [],
        medianResponseSeconds: 180,
        fallbackExpectedMinutes: 2,
      })
    ).toBe(1.5);
  });

  it('uses the median ratio once 3+ exchanges exist', () => {
    expect(
      computePaceMultiplier({
        responseHistory: [
          { actualResponseSeconds: 120, expectedResponseMinutes: 2 },
          { actualResponseSeconds: 240, expectedResponseMinutes: 2 },
          { actualResponseSeconds: 180, expectedResponseMinutes: 2 },
        ],
      })
    ).toBe(1.5);
  });
});

describe('computeSilenceThresholdSeconds', () => {
  it('falls back to 10 minutes when estimate is missing', () => {
    expect(computeSilenceThresholdSeconds({})).toBe(10 * 60);
  });

  it('clamps quick prompts to at least 2 minutes', () => {
    expect(
      computeSilenceThresholdSeconds({
        expectedResponseMinutes: 1,
        paceMultiplier: 0.5,
      })
    ).toBe(2 * 60);
  });

  it('clamps long prompts to at most 20 minutes', () => {
    expect(
      computeSilenceThresholdSeconds({
        expectedResponseMinutes: 20,
        paceMultiplier: 2,
      })
    ).toBe(20 * 60);
  });
});

// ---------------------------------------------------------------------------
// checkTimers
// ---------------------------------------------------------------------------

describe('checkTimers', () => {
  /** Helper — creates a timer state starting at a fixed epoch */
  function makeState(
    overrides?: Partial<SessionTimerState>
  ): SessionTimerState {
    const base = 1_000_000_000_000; // fixed epoch ms
    return {
      silenceThresholdSeconds: 6 * 60,
      autoSaveThresholdSeconds: 30 * 60,
      sessionStartedAt: base,
      lastActivityAt: base,
      paceMultiplier: 1,
      expectedResponseMinutes: 6,
      ...overrides,
    };
  }

  it('returns "continue" when session just started', () => {
    const state = makeState();
    const result = checkTimers(state, state.sessionStartedAt + 1000);

    expect(result.action).toBe('continue');
    expect(result.elapsedSeconds).toBe(1);
    expect(result.silenceSeconds).toBe(1);
  });

  it('returns "silence_prompt" after the adaptive inactivity threshold', () => {
    const state = makeState();
    const thresholdLater = state.sessionStartedAt + 6 * 60 * 1000;

    const result = checkTimers(state, thresholdLater);

    expect(result.action).toBe('silence_prompt');
    expect(result.silenceSeconds).toBe(6 * 60);
  });

  it('returns "auto_save" after 30 minutes of silence', () => {
    const state = makeState();
    const autoSaveTime = state.sessionStartedAt + 30 * 60 * 1000;

    const result = checkTimers(state, autoSaveTime);

    expect(result.action).toBe('auto_save');
    expect(result.silenceSeconds).toBe(30 * 60);
  });

  it('auto_save takes precedence over silence_prompt', () => {
    const state = makeState();
    const autoSaveTime = state.sessionStartedAt + 30 * 60 * 1000;

    const result = checkTimers(state, autoSaveTime);

    // Both silence_prompt (3min) and auto_save (30min) exceeded — auto_save wins
    expect(result.action).toBe('auto_save');
  });

  it('reports correct elapsed and silence seconds', () => {
    const state = makeState();
    const fiveMinLater = state.sessionStartedAt + 5 * 60 * 1000;
    const activeState = { ...state, lastActivityAt: fiveMinLater - 60_000 };

    const result = checkTimers(activeState, fiveMinLater);

    expect(result.elapsedSeconds).toBe(5 * 60);
    expect(result.silenceSeconds).toBe(60);
  });

  it('does not trigger hard cap or nudge for long sessions with recent activity', () => {
    const state = makeState();
    const twoHoursLater = state.sessionStartedAt + 2 * 60 * 60 * 1000;
    const activeState = { ...state, lastActivityAt: twoHoursLater - 1000 };
    const result = checkTimers(activeState, twoHoursLater);

    expect(result.action).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------

describe('recordActivity', () => {
  it('updates lastActivityAt', () => {
    const state: SessionTimerState = {
      silenceThresholdSeconds: 6 * 60,
      autoSaveThresholdSeconds: 30 * 60,
      sessionStartedAt: 1_000_000_000_000,
      lastActivityAt: 1_000_000_000_000,
      paceMultiplier: 1,
      expectedResponseMinutes: 6,
    };

    const newTime = 1_000_000_060_000; // 1 minute later
    const updated = recordActivity(state, newTime);

    expect(updated.lastActivityAt).toBe(newTime);
    expect(updated.sessionStartedAt).toBe(state.sessionStartedAt);
    expect(updated.silenceThresholdSeconds).toBe(6 * 60);
  });

  it('returns a new object (immutable)', () => {
    const state: SessionTimerState = {
      silenceThresholdSeconds: 6 * 60,
      autoSaveThresholdSeconds: 30 * 60,
      sessionStartedAt: 1_000_000_000_000,
      lastActivityAt: 1_000_000_000_000,
      paceMultiplier: 1,
      expectedResponseMinutes: 6,
    };

    const updated = recordActivity(state, 1_000_000_060_000);

    expect(updated).not.toBe(state);
    expect(state.lastActivityAt).toBe(1_000_000_000_000); // original unchanged
  });
});
