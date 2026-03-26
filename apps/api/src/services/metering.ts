// ---------------------------------------------------------------------------
// Quota Metering — Story 5.6 + Dual-Cap (daily + monthly)
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface MeteringState {
  monthlyLimit: number;
  usedThisMonth: number;
  topUpCreditsRemaining: number;
  dailyLimit: number | null;
  usedToday: number;
}

export interface MeteringResult {
  allowed: boolean;
  remaining: number;
  warningLevel: 'none' | 'soft' | 'hard' | 'exceeded';
  dailyRemaining: number | null;
  dailyWarningLevel: 'none' | 'soft' | 'hard' | 'exceeded' | null;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Returns the warning level based on the ratio of used to limit.
 *
 * - <80%: none
 * - 80-95%: soft
 * - 95-100%: hard (but not yet exceeded)
 * - >=100%: exceeded
 */
export function getWarningLevel(
  used: number,
  limit: number
): 'none' | 'soft' | 'hard' | 'exceeded' {
  if (limit <= 0) {
    return 'exceeded';
  }

  const ratio = used / limit;

  if (ratio >= 1) return 'exceeded';
  if (ratio >= 0.95) return 'hard';
  if (ratio >= 0.8) return 'soft';
  return 'none';
}

/**
 * Calculates the total remaining questions available (monthly + top-ups).
 * Combines remaining monthly quota with top-up credits.
 */
export function calculateRemainingQuestions(state: MeteringState): number {
  const monthlyRemaining = Math.max(
    0,
    state.monthlyLimit - state.usedThisMonth
  );
  return monthlyRemaining + state.topUpCreditsRemaining;
}

/**
 * Calculates remaining daily questions.
 * Returns null when there is no daily limit (paid tiers).
 */
export function calculateRemainingDaily(state: MeteringState): number | null {
  if (state.dailyLimit === null) {
    return null;
  }
  return Math.max(0, state.dailyLimit - state.usedToday);
}

/**
 * Checks quota and returns whether the user is allowed to ask a question.
 *
 * Enforces both daily and monthly caps:
 * - Daily cap: if set, user cannot exceed dailyLimit per day
 * - Monthly cap: user cannot exceed monthlyLimit per month (+ top-ups)
 * Both must pass for the question to be allowed.
 */
export function checkQuota(state: MeteringState): MeteringResult {
  const remaining = calculateRemainingQuestions(state);
  const warningLevel = getWarningLevel(state.usedThisMonth, state.monthlyLimit);
  const dailyRemaining = calculateRemainingDaily(state);
  const dailyWarningLevel =
    state.dailyLimit !== null
      ? getWarningLevel(state.usedToday, state.dailyLimit)
      : null;

  // Both caps must pass
  const dailyAllowed = dailyRemaining === null || dailyRemaining > 0;
  const monthlyAllowed = remaining > 0;

  return {
    allowed: dailyAllowed && monthlyAllowed,
    remaining,
    warningLevel,
    dailyRemaining,
    dailyWarningLevel,
  };
}

/**
 * Calculates remaining questions after a mid-cycle upgrade.
 *
 * The new tier's full quota replaces the old one, but usage carries forward.
 * Returns max(0, newTierQuota - usedInCurrentCycle).
 */
export function calculateMidCycleUpgrade(
  usedInCurrentCycle: number,
  newTierQuota: number
): number {
  return Math.max(0, newTierQuota - usedInCurrentCycle);
}

/**
 * Calculates remaining questions after a mid-cycle downgrade.
 *
 * If the user has already used more than the new tier allows,
 * they get 0 remaining questions until the next reset.
 * Otherwise: newQuota - used.
 */
export function calculateMidCycleDowngrade(
  usedInCurrentCycle: number,
  newTierQuota: number
): number {
  if (usedInCurrentCycle > newTierQuota) {
    return 0;
  }
  return newTierQuota - usedInCurrentCycle;
}
