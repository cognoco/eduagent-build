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
  it('sets 15min nudge / 20min hard cap for TEEN', () => {
    const state = createTimerConfig({
      personaType: 'TEEN',
      sessionType: 'learning',
    });

    expect(state.nudgeThresholdSeconds).toBe(15 * 60);
    expect(state.hardCapSeconds).toBe(20 * 60);
  });

  it('sets 25min nudge / 30min hard cap for LEARNER', () => {
    const state = createTimerConfig({
      personaType: 'LEARNER',
      sessionType: 'learning',
    });

    expect(state.nudgeThresholdSeconds).toBe(25 * 60);
    expect(state.hardCapSeconds).toBe(30 * 60);
  });

  it('sets 25min nudge / 30min hard cap for PARENT', () => {
    const state = createTimerConfig({
      personaType: 'PARENT',
      sessionType: 'homework',
    });

    expect(state.nudgeThresholdSeconds).toBe(25 * 60);
    expect(state.hardCapSeconds).toBe(30 * 60);
  });

  it('sets 3min silence and 30min auto-save for all personas', () => {
    const teen = createTimerConfig({
      personaType: 'TEEN',
      sessionType: 'learning',
    });
    const learner = createTimerConfig({
      personaType: 'LEARNER',
      sessionType: 'learning',
    });

    expect(teen.silenceThresholdSeconds).toBe(3 * 60);
    expect(teen.autoSaveThresholdSeconds).toBe(30 * 60);
    expect(learner.silenceThresholdSeconds).toBe(3 * 60);
    expect(learner.autoSaveThresholdSeconds).toBe(30 * 60);
  });

  it('initialises sessionStartedAt and lastActivityAt', () => {
    const before = Date.now();
    const state = createTimerConfig({
      personaType: 'TEEN',
      sessionType: 'learning',
    });
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
      nudgeThresholdSeconds: 15 * 60,
      hardCapSeconds: 20 * 60,
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

  it('returns "nudge" when session hits nudge threshold', () => {
    const state = makeState();
    // Activity was recent, but session is long
    const nudgeTime = state.sessionStartedAt + 15 * 60 * 1000;
    const activeState = { ...state, lastActivityAt: nudgeTime - 1000 };

    const result = checkTimers(activeState, nudgeTime);

    expect(result.action).toBe('nudge');
    expect(result.elapsedSeconds).toBe(15 * 60);
  });

  it('returns "hard_cap" when session exceeds hard cap', () => {
    const state = makeState();
    const capTime = state.sessionStartedAt + 20 * 60 * 1000;
    const activeState = { ...state, lastActivityAt: capTime - 1000 };

    const result = checkTimers(activeState, capTime);

    expect(result.action).toBe('hard_cap');
  });

  it('hard_cap takes precedence over nudge', () => {
    const state = makeState();
    const capTime = state.sessionStartedAt + 20 * 60 * 1000;

    const result = checkTimers(state, capTime);

    // Both nudge (15min) and hard_cap (20min) are exceeded — hard_cap wins
    expect(result.action).toBe('hard_cap');
  });

  it('hard_cap takes precedence over silence_prompt', () => {
    const state = makeState();
    // Session has been running for 25 minutes with no activity
    const longTime = state.sessionStartedAt + 25 * 60 * 1000;

    const result = checkTimers(state, longTime);

    expect(result.action).toBe('hard_cap');
  });

  it('returns "auto_save" after 30 minutes of silence', () => {
    const state = makeState();
    // Session just started, but somehow no activity for 30 min
    // We set a short session (5 min) but long silence
    const shortSession = {
      ...state,
      hardCapSeconds: 60 * 60, // 1 hour hard cap (won't trigger)
      nudgeThresholdSeconds: 50 * 60, // won't trigger
    };
    const autoSaveTime = state.sessionStartedAt + 30 * 60 * 1000;

    const result = checkTimers(shortSession, autoSaveTime);

    expect(result.action).toBe('auto_save');
    expect(result.silenceSeconds).toBe(30 * 60);
  });

  it('auto_save takes precedence over silence_prompt', () => {
    const state = makeState({
      hardCapSeconds: 60 * 60, // 1 hour
      nudgeThresholdSeconds: 50 * 60, // won't trigger
    });
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
});

// ---------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------

describe('recordActivity', () => {
  it('updates lastActivityAt', () => {
    const state: SessionTimerState = {
      nudgeThresholdSeconds: 15 * 60,
      hardCapSeconds: 20 * 60,
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
      nudgeThresholdSeconds: 15 * 60,
      hardCapSeconds: 20 * 60,
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
