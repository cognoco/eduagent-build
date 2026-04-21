// ---------------------------------------------------------------------------
// Session Lifecycle Management — adaptive silence + crash-safe inactivity
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { SessionType } from '@eduagent/schemas';

export interface SessionTimerConfig {
  sessionType: SessionType;
  expectedResponseMinutes?: number | null;
  medianResponseSeconds?: number | null;
  responseHistory?: Array<{
    actualResponseSeconds: number;
    expectedResponseMinutes?: number | null;
  }>;
}

export interface SessionTimerState {
  silenceThresholdSeconds: number;
  autoSaveThresholdSeconds: number;
  sessionStartedAt: number;
  lastActivityAt: number;
  paceMultiplier: number;
  expectedResponseMinutes: number;
}

export interface TimerCheck {
  action: 'continue' | 'silence_prompt' | 'auto_save';
  elapsedSeconds: number;
  silenceSeconds: number;
}

const DEFAULT_EXPECTED_RESPONSE_MINUTES = 10;
// Intentionally higher than schema min (1). The schema allows 1-minute sessions for storage, but the silence timer clamps to this minimum for UX reasons.
const MIN_EXPECTED_RESPONSE_MINUTES = 2;
const MAX_EXPECTED_RESPONSE_MINUTES = 20;
const MIN_PACE_MULTIPLIER = 0.5;
const MAX_PACE_MULTIPLIER = 3;
const AUTO_SAVE_THRESHOLD_SECONDS = 30 * 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const lo = sorted[middle - 1];
    const hi = sorted[middle];
    if (lo == null || hi == null)
      throw new Error('Unexpected missing median values');
    return (lo + hi) / 2;
  }
  const mid = sorted[middle];
  if (mid == null) throw new Error('Unexpected missing median value');
  return mid;
}

export function normalizeExpectedResponseMinutes(
  expectedResponseMinutes?: number | null
): number {
  if (
    typeof expectedResponseMinutes !== 'number' ||
    !Number.isFinite(expectedResponseMinutes)
  ) {
    return DEFAULT_EXPECTED_RESPONSE_MINUTES;
  }

  return clamp(
    Math.round(expectedResponseMinutes),
    1,
    MAX_EXPECTED_RESPONSE_MINUTES
  );
}

export function computePaceMultiplier(config: {
  responseHistory?: Array<{
    actualResponseSeconds: number;
    expectedResponseMinutes?: number | null;
  }>;
  medianResponseSeconds?: number | null;
  fallbackExpectedMinutes?: number | null;
}): number {
  const responseHistory = config.responseHistory ?? [];

  if (responseHistory.length >= 3) {
    const ratios = responseHistory
      .map((entry) => {
        const expectedSeconds =
          normalizeExpectedResponseMinutes(
            entry.expectedResponseMinutes ?? config.fallbackExpectedMinutes
          ) * 60;

        if (entry.actualResponseSeconds <= 0 || expectedSeconds <= 0) {
          return null;
        }

        return entry.actualResponseSeconds / expectedSeconds;
      })
      .filter((value): value is number => value !== null);

    if (ratios.length > 0) {
      return clamp(
        Number(median(ratios).toFixed(2)),
        MIN_PACE_MULTIPLIER,
        MAX_PACE_MULTIPLIER
      );
    }
  }

  if (config.medianResponseSeconds && config.medianResponseSeconds > 0) {
    const baselineExpectedSeconds =
      normalizeExpectedResponseMinutes(config.fallbackExpectedMinutes) * 60;
    return clamp(
      Number(
        (
          config.medianResponseSeconds / Math.max(1, baselineExpectedSeconds)
        ).toFixed(2)
      ),
      MIN_PACE_MULTIPLIER,
      MAX_PACE_MULTIPLIER
    );
  }

  return 1;
}

export function computeSilenceThresholdSeconds(config: {
  expectedResponseMinutes?: number | null;
  paceMultiplier?: number | null;
}): number {
  const expectedMinutes = normalizeExpectedResponseMinutes(
    config.expectedResponseMinutes
  );
  const paceMultiplier =
    typeof config.paceMultiplier === 'number' &&
    Number.isFinite(config.paceMultiplier)
      ? config.paceMultiplier
      : 1;

  const minutes = clamp(
    expectedMinutes * paceMultiplier,
    MIN_EXPECTED_RESPONSE_MINUTES,
    MAX_EXPECTED_RESPONSE_MINUTES
  );

  return Math.round(minutes * 60);
}

export function createTimerConfig(
  config: SessionTimerConfig
): SessionTimerState {
  const now = Date.now();
  const expectedResponseMinutes = normalizeExpectedResponseMinutes(
    config.expectedResponseMinutes
  );
  const paceMultiplier = computePaceMultiplier({
    responseHistory: config.responseHistory,
    medianResponseSeconds: config.medianResponseSeconds,
    fallbackExpectedMinutes: expectedResponseMinutes,
  });

  return {
    silenceThresholdSeconds: computeSilenceThresholdSeconds({
      expectedResponseMinutes,
      paceMultiplier,
    }),
    autoSaveThresholdSeconds: AUTO_SAVE_THRESHOLD_SECONDS,
    sessionStartedAt: now,
    lastActivityAt: now,
    paceMultiplier,
    expectedResponseMinutes,
  };
}

export function checkTimers(
  state: SessionTimerState,
  nowMs: number
): TimerCheck {
  const elapsedSeconds = Math.floor((nowMs - state.sessionStartedAt) / 1000);
  const silenceSeconds = Math.floor((nowMs - state.lastActivityAt) / 1000);

  if (silenceSeconds >= state.autoSaveThresholdSeconds) {
    return { action: 'auto_save', elapsedSeconds, silenceSeconds };
  }

  if (silenceSeconds >= state.silenceThresholdSeconds) {
    return { action: 'silence_prompt', elapsedSeconds, silenceSeconds };
  }

  return { action: 'continue', elapsedSeconds, silenceSeconds };
}

export function recordActivity(
  state: SessionTimerState,
  nowMs: number,
  nextExpectedResponseMinutes?: number | null
): SessionTimerState {
  const expectedResponseMinutes =
    nextExpectedResponseMinutes == null
      ? state.expectedResponseMinutes
      : normalizeExpectedResponseMinutes(nextExpectedResponseMinutes);

  return {
    ...state,
    lastActivityAt: nowMs,
    expectedResponseMinutes,
    silenceThresholdSeconds: computeSilenceThresholdSeconds({
      expectedResponseMinutes,
      paceMultiplier: state.paceMultiplier,
    }),
  };
}
