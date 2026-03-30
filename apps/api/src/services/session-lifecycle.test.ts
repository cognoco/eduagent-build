import {
  createTimerConfig,
  checkTimers,
  recordActivity,
} from './session-lifecycle';
import type { SessionTimerState } from './session-lifecycle';

// ---------------------------------------------------------------------------
// createTimerConfig
// ---------------------------------------------------------------------------

describe('createTimerConfig', () => {
  it('sets 3min silence and 30min auto-save timers', () => {
    const learning = createTimerConfig({ sessionType: 'learning' });
    const homework = createTimerConfig({ sessionType: 'homework' });

    expect(learning.silenceThresholdSeconds).toBe(3 * 60);
    expect(learning.autoSaveThresholdSeconds).toBe(30 * 60);
    expect(homework.silenceThresholdSeconds).toBe(3 * 60);
    expect(homework.autoSaveThresholdSeconds).toBe(30 * 60);
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
// checkTimers
// ---------------------------------------------------------------------------

describe('checkTimers', () => {
  /** Helper — creates a timer state starting at a fixed epoch */
  function makeState(
    overrides?: Partial<SessionTimerState>
  ): SessionTimerState {
    const base = 1_000_000_000_000; // fixed epoch ms
    return {
      silenceThresholdSeconds: 3 * 60,
      autoSaveThresholdSeconds: 30 * 60,
      sessionStartedAt: base,
      lastActivityAt: base,
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

  it('returns "silence_prompt" after 3 minutes of inactivity', () => {
    const state = makeState();
    const threeMinLater = state.sessionStartedAt + 3 * 60 * 1000;

    const result = checkTimers(state, threeMinLater);

    expect(result.action).toBe('silence_prompt');
    expect(result.silenceSeconds).toBe(3 * 60);
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
      silenceThresholdSeconds: 3 * 60,
      autoSaveThresholdSeconds: 30 * 60,
      sessionStartedAt: 1_000_000_000_000,
      lastActivityAt: 1_000_000_000_000,
    };

    const newTime = 1_000_000_060_000; // 1 minute later
    const updated = recordActivity(state, newTime);

    expect(updated.lastActivityAt).toBe(newTime);
    expect(updated.sessionStartedAt).toBe(state.sessionStartedAt);
  });

  it('returns a new object (immutable)', () => {
    const state: SessionTimerState = {
      silenceThresholdSeconds: 3 * 60,
      autoSaveThresholdSeconds: 30 * 60,
      sessionStartedAt: 1_000_000_000_000,
      lastActivityAt: 1_000_000_000_000,
    };

    const updated = recordActivity(state, 1_000_000_060_000);

    expect(updated).not.toBe(state);
    expect(state.lastActivityAt).toBe(1_000_000_000_000); // original unchanged
  });
});
