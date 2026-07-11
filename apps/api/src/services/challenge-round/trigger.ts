import type {
  ChallengeRoundSessionState,
  RetentionStatus,
  SessionType,
  StruggleStatus,
  SubscriptionTier,
} from '@eduagent/schemas';

/**
 * Challenge Round trigger evaluator — pure function. Decides whether the
 * server may offer a Challenge Round at this turn given the learner's state
 * and quota. The server is the source of truth; the LLM only proposes via
 * `signals.challenge_round_offer` and is suppressed when this evaluator
 * returns `eligible: false`.
 *
 * Decisions documented in
 * `docs/plans/2026-05-18-challenge-round-into-note.md` (Task 3) and
 * `docs/plans/2026-05-18-challenge-round-targets.md` (ROUTING-3 — absolute
 * remaining-turn budget replaces percentage-only quota gate).
 */

const CHALLENGE_OFFER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_EXCHANGES = 5;
const MIN_CORRECT_STREAK = 2;
const MIN_NEW_TOPIC_EXCHANGES = 7;
const MIN_NEW_TOPIC_SOLID_ANSWERS = 4;
const MIN_NEW_TOPIC_CORRECT_STREAK = 4;
const MIN_CHALLENGE_REMAINING_TURNS = 3;
const MIN_QUOTA_FRACTION_FREE = 0.05;

/**
 * Virtual retention input used by the trigger. The persisted
 * `retentionStatusSchema` enumerates only the four post-card states
 * (strong/fading/weak/forgotten); `'new'` is the caller's translation of
 * "no retention card row exists for this topic yet" so the trigger can decide
 * whether sustained current-session evidence justifies offering a Challenge
 * Round on a brand-new topic.
 */
export type ChallengeReadinessRetentionInput = RetentionStatus | 'new';

export interface ChallengeReadinessInput {
  sessionType: SessionType;
  exchangeCount: number;
  retentionStatus: ChallengeReadinessRetentionInput;
  struggleStatus: StruggleStatus;
  recentCorrectStreak: number;
  currentSessionSolidAnswerCount: number;
  subscriptionTier?: SubscriptionTier;
  quotaRemainingTurns: number;
  quotaFractionRemaining: number;
  challengeRoundState: ChallengeRoundSessionState | undefined;
  cooldownLastOfferedAt: Date | null;
  cooldownLastOutcome: number | null;
  now: Date;
}

export type ChallengeReadinessReason =
  | 'session_type'
  | 'struggle'
  | 'exchanges_below_min'
  | 'streak'
  | 'retention'
  | 'quota_remaining_turns'
  | 'quota_fraction_free_tier'
  | 'session_decline'
  | 'already_in_round'
  | 'cooldown';

export interface ChallengeReadinessResult {
  eligible: boolean;
  reason?: ChallengeReadinessReason;
}

export function evaluateChallengeReadiness(
  input: ChallengeReadinessInput,
): ChallengeReadinessResult {
  if (input.sessionType !== 'learning') {
    return { eligible: false, reason: 'session_type' };
  }
  if (input.struggleStatus !== 'normal') {
    return { eligible: false, reason: 'struggle' };
  }
  if (input.exchangeCount < MIN_EXCHANGES) {
    return { eligible: false, reason: 'exchanges_below_min' };
  }
  if (input.recentCorrectStreak < MIN_CORRECT_STREAK) {
    return { eligible: false, reason: 'streak' };
  }

  const retentionEligible =
    input.retentionStatus === 'strong' ||
    (input.retentionStatus === 'new' &&
      input.exchangeCount >= MIN_NEW_TOPIC_EXCHANGES &&
      input.recentCorrectStreak >= MIN_NEW_TOPIC_CORRECT_STREAK &&
      input.currentSessionSolidAnswerCount >= MIN_NEW_TOPIC_SOLID_ANSWERS);
  if (!retentionEligible) {
    return { eligible: false, reason: 'retention' };
  }

  if (input.quotaRemainingTurns < MIN_CHALLENGE_REMAINING_TURNS) {
    return { eligible: false, reason: 'quota_remaining_turns' };
  }
  if (
    input.subscriptionTier === 'free' &&
    input.quotaFractionRemaining < MIN_QUOTA_FRACTION_FREE
  ) {
    return { eligible: false, reason: 'quota_fraction_free_tier' };
  }

  const round = input.challengeRoundState;
  if (round) {
    if (round.declinedDontAskAgain) {
      return { eligible: false, reason: 'session_decline' };
    }
    if (
      round.state === 'offered' ||
      round.state === 'accepted' ||
      round.state === 'active' ||
      round.state === 'drafting'
    ) {
      return { eligible: false, reason: 'already_in_round' };
    }
    if (round.state === 'declined') {
      return { eligible: false, reason: 'session_decline' };
    }
  }

  if (input.cooldownLastOfferedAt && input.cooldownLastOutcome !== null) {
    const elapsed = input.now.getTime() - input.cooldownLastOfferedAt.getTime();
    if (elapsed < CHALLENGE_OFFER_COOLDOWN_MS) {
      return { eligible: false, reason: 'cooldown' };
    }
  }

  return { eligible: true };
}
