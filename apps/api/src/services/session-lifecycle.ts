// ---------------------------------------------------------------------------
// Session Lifecycle Management — Story 2.3
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Configuration input for creating a session timer */
export interface SessionTimerConfig {
  sessionType: 'learning' | 'homework' | 'interleaved';
}

/** Timer state for an active session */
export interface SessionTimerState {
  silenceThresholdSeconds: number;
  autoSaveThresholdSeconds: number;
  sessionStartedAt: number; // epoch ms
  lastActivityAt: number; // epoch ms
}

/** Result of checking session timers */
export interface TimerCheck {
  action: 'continue' | 'silence_prompt' | 'auto_save';
  elapsedSeconds: number;
  silenceSeconds: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Silence thresholds (all sessions) */
const SILENCE_THRESHOLD_SECONDS = 3 * 60; // 3 minutes
const AUTO_SAVE_THRESHOLD_SECONDS = 30 * 60; // 30 minutes

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates timer state.
 * - No hard caps or nudges.
 * - Silence: 3min gentle prompt, 30min auto-save.
 */
export function createTimerConfig(
  _config: SessionTimerConfig
): SessionTimerState {
  const now = Date.now();

  return {
    silenceThresholdSeconds: SILENCE_THRESHOLD_SECONDS,
    autoSaveThresholdSeconds: AUTO_SAVE_THRESHOLD_SECONDS,
    sessionStartedAt: now,
    lastActivityAt: now,
  };
}

// ---------------------------------------------------------------------------
// Timer check
// ---------------------------------------------------------------------------

/**
 * Checks all timers and returns the highest-priority action needed.
 *
 * Priority order (highest first):
 *   1. auto_save — silence exceeds auto-save threshold
 *   2. silence_prompt — learner has been quiet
 *   3. continue — everything is fine
 */
export function checkTimers(
  state: SessionTimerState,
  nowMs: number
): TimerCheck {
  const elapsedSeconds = Math.floor((nowMs - state.sessionStartedAt) / 1000);
  const silenceSeconds = Math.floor((nowMs - state.lastActivityAt) / 1000);

  // Priority 1: Auto-save threshold (very long silence)
  if (silenceSeconds >= state.autoSaveThresholdSeconds) {
    return { action: 'auto_save', elapsedSeconds, silenceSeconds };
  }

  // Priority 2: Silence prompt
  if (silenceSeconds >= state.silenceThresholdSeconds) {
    return { action: 'silence_prompt', elapsedSeconds, silenceSeconds };
  }

  // Priority 3: All clear
  return { action: 'continue', elapsedSeconds, silenceSeconds };
}

// ---------------------------------------------------------------------------
// Activity recording
// ---------------------------------------------------------------------------

/** Updates lastActivityAt, returning a new state (immutable) */
export function recordActivity(
  state: SessionTimerState,
  nowMs: number
): SessionTimerState {
  return { ...state, lastActivityAt: nowMs };
}
