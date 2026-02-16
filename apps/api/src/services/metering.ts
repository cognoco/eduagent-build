// ---------------------------------------------------------------------------
// Quota Metering — Story 5.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface MeteringState {
  monthlyLimit: number;
  usedThisMonth: number;
  topUpCreditsRemaining: number;
}

export interface MeteringResult {
  allowed: boolean;
  remaining: number;
  warningLevel: 'none' | 'soft' | 'hard' | 'exceeded';
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
 * Calculates the total remaining questions available.
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
 * Checks quota and returns whether the user is allowed to ask a question.
 *
 * When the monthly quota is exhausted, draws from top-up credits.
 * Warning levels are based on the monthly limit usage ratio.
 */
export function checkQuota(state: MeteringState): MeteringResult {
  const remaining = calculateRemainingQuestions(state);
  const warningLevel = getWarningLevel(state.usedThisMonth, state.monthlyLimit);

  return {
    allowed: remaining > 0,
    remaining,
    warningLevel,
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
