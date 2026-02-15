// ---------------------------------------------------------------------------
// Session Lifecycle Management — Story 2.3
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Configuration input for creating a session timer */
export interface SessionTimerConfig {
  personaType: 'TEEN' | 'LEARNER' | 'PARENT';
  sessionType: 'learning' | 'homework';
}

/** Timer state for an active session */
export interface SessionTimerState {
  nudgeThresholdSeconds: number;
  hardCapSeconds: number;
  silenceThresholdSeconds: number;
  autoSaveThresholdSeconds: number;
  sessionStartedAt: number; // epoch ms
  lastActivityAt: number; // epoch ms
}

/** Result of checking session timers */
export interface TimerCheck {
  action: 'continue' | 'nudge' | 'hard_cap' | 'silence_prompt' | 'auto_save';
  elapsedSeconds: number;
  silenceSeconds: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Teen profile thresholds in seconds */
const TEEN_NUDGE_SECONDS = 15 * 60; // 15 minutes
const TEEN_HARD_CAP_SECONDS = 20 * 60; // 20 minutes

/** Learner/Parent profile thresholds in seconds */
const ADULT_NUDGE_SECONDS = 25 * 60; // 25 minutes
const ADULT_HARD_CAP_SECONDS = 30 * 60; // 30 minutes

/** Silence thresholds (all personas) */
const SILENCE_THRESHOLD_SECONDS = 3 * 60; // 3 minutes
const AUTO_SAVE_THRESHOLD_SECONDS = 30 * 60; // 30 minutes

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates timer state based on persona type.
 * - Teen: nudge at 15min, hard cap at 20min
 * - Learner/Parent: nudge at 25min, hard cap at 30min
 * - Silence: 3min gentle prompt, 30min auto-save (all personas)
 */
export function createTimerConfig(
  config: SessionTimerConfig
): SessionTimerState {
  const isTeen = config.personaType === 'TEEN';
  const now = Date.now();

  return {
    nudgeThresholdSeconds: isTeen ? TEEN_NUDGE_SECONDS : ADULT_NUDGE_SECONDS,
    hardCapSeconds: isTeen ? TEEN_HARD_CAP_SECONDS : ADULT_HARD_CAP_SECONDS,
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
 *   1. hard_cap — session must end
 *   2. auto_save — silence exceeds auto-save threshold
 *   3. nudge — session approaching time limit
 *   4. silence_prompt — learner has been quiet
 *   5. continue — everything is fine
 */
export function checkTimers(
  state: SessionTimerState,
  nowMs: number
): TimerCheck {
  const elapsedSeconds = Math.floor((nowMs - state.sessionStartedAt) / 1000);
  const silenceSeconds = Math.floor((nowMs - state.lastActivityAt) / 1000);

  // Priority 1: Hard cap takes precedence over everything
  if (elapsedSeconds >= state.hardCapSeconds) {
    return { action: 'hard_cap', elapsedSeconds, silenceSeconds };
  }

  // Priority 2: Auto-save threshold (very long silence)
  if (silenceSeconds >= state.autoSaveThresholdSeconds) {
    return { action: 'auto_save', elapsedSeconds, silenceSeconds };
  }

  // Priority 3: Session nudge
  if (elapsedSeconds >= state.nudgeThresholdSeconds) {
    return { action: 'nudge', elapsedSeconds, silenceSeconds };
  }

  // Priority 4: Silence prompt
  if (silenceSeconds >= state.silenceThresholdSeconds) {
    return { action: 'silence_prompt', elapsedSeconds, silenceSeconds };
  }

  // Priority 5: All clear
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
