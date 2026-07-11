import {
  evaluateChallengeReadiness,
  type ChallengeReadinessInput,
} from './trigger';

const baseInput: ChallengeReadinessInput = {
  sessionType: 'learning',
  exchangeCount: 6,
  retentionStatus: 'strong',
  struggleStatus: 'normal',
  recentCorrectStreak: 2,
  currentSessionSolidAnswerCount: 2,
  subscriptionTier: 'plus',
  quotaRemainingTurns: 6,
  quotaFractionRemaining: 0.5,
  challengeRoundState: undefined,
  cooldownLastOfferedAt: null,
  cooldownLastOutcome: null,
  now: new Date('2026-05-19T12:00:00Z'),
};

describe('evaluateChallengeReadiness — hard gates', () => {
  it('eligible when learning + strong + ≥5 exchanges + streak ≥2 + no cooldown', () => {
    expect(evaluateChallengeReadiness(baseInput).eligible).toBe(true);
  });

  it('hard-gates homework sessions', () => {
    expect(
      evaluateChallengeReadiness({ ...baseInput, sessionType: 'homework' })
        .eligible,
    ).toBe(false);
  });

  it('hard-gates interleaved sessions (v1 — not an entry point)', () => {
    expect(
      evaluateChallengeReadiness({ ...baseInput, sessionType: 'interleaved' })
        .eligible,
    ).toBe(false);
  });

  it('hard-gates when struggling', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        struggleStatus: 'needs_deepening',
      }).eligible,
    ).toBe(false);
    expect(
      evaluateChallengeReadiness({ ...baseInput, struggleStatus: 'blocked' })
        .eligible,
    ).toBe(false);
  });

  it('hard-gates under exchange threshold', () => {
    expect(
      evaluateChallengeReadiness({ ...baseInput, exchangeCount: 4 }).eligible,
    ).toBe(false);
  });

  it('hard-gates fading / weak / forgotten retention', () => {
    for (const status of ['fading', 'weak', 'forgotten'] as const) {
      expect(
        evaluateChallengeReadiness({ ...baseInput, retentionStatus: status })
          .eligible,
      ).toBe(false);
    }
  });

  it('hard-gates when streak below 2', () => {
    expect(
      evaluateChallengeReadiness({ ...baseInput, recentCorrectStreak: 1 })
        .eligible,
    ).toBe(false);
  });

  it('returns specific reason codes for each gate', () => {
    expect(
      evaluateChallengeReadiness({ ...baseInput, sessionType: 'homework' })
        .reason,
    ).toBe('session_type');
    expect(
      evaluateChallengeReadiness({ ...baseInput, struggleStatus: 'blocked' })
        .reason,
    ).toBe('struggle');
    expect(
      evaluateChallengeReadiness({ ...baseInput, exchangeCount: 2 }).reason,
    ).toBe('exchanges_below_min');
    expect(
      evaluateChallengeReadiness({ ...baseInput, recentCorrectStreak: 0 })
        .reason,
    ).toBe('streak');
  });
});

describe('evaluateChallengeReadiness — current-session new-topic path (MED-8)', () => {
  it('allows a new topic when current session shows sustained solid answers', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        retentionStatus: 'new',
        exchangeCount: 7,
        recentCorrectStreak: 4,
        currentSessionSolidAnswerCount: 4,
      }).eligible,
    ).toBe(true);
  });

  it('does not allow a new topic on only a short lucky streak', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        retentionStatus: 'new',
        exchangeCount: 5,
        recentCorrectStreak: 2,
        currentSessionSolidAnswerCount: 2,
      }).eligible,
    ).toBe(false);
  });

  it('rejects a new topic when solid-answer count is short of threshold', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        retentionStatus: 'new',
        exchangeCount: 8,
        recentCorrectStreak: 5,
        currentSessionSolidAnswerCount: 3,
      }).eligible,
    ).toBe(false);
  });

  it('rejects a new topic when exchange count is below new-topic threshold', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        retentionStatus: 'new',
        exchangeCount: 6,
        recentCorrectStreak: 5,
        currentSessionSolidAnswerCount: 4,
      }).eligible,
    ).toBe(false);
  });
});

describe('evaluateChallengeReadiness — quota budget (ROUTING-3)', () => {
  it('hard-gates when fewer than 3 turns remain regardless of tier', () => {
    for (const tier of ['free', 'plus', 'family', 'pro'] as const) {
      expect(
        evaluateChallengeReadiness({
          ...baseInput,
          subscriptionTier: tier,
          quotaRemainingTurns: 2,
        }).eligible,
      ).toBe(false);
    }
  });

  it('allows the absolute budget floor when exactly 3 turns remain', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        quotaRemainingTurns: 3,
      }).eligible,
    ).toBe(true);
  });

  it('uses quota fraction only as a secondary free-tier guard', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        subscriptionTier: 'free',
        quotaRemainingTurns: 6,
        quotaFractionRemaining: 0.03,
      }).eligible,
    ).toBe(false);
    // Plus tier with low fraction but plenty of turns left is still eligible
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        subscriptionTier: 'plus',
        quotaRemainingTurns: 6,
        quotaFractionRemaining: 0.03,
      }).eligible,
    ).toBe(true);
  });

  it('returns quota_remaining_turns reason when under absolute turn budget', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        quotaRemainingTurns: 2,
      }).reason,
    ).toBe('quota_remaining_turns');
  });

  it('returns quota_fraction_free_tier reason when free-tier fraction guard fires', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        subscriptionTier: 'free',
        quotaRemainingTurns: 6,
        quotaFractionRemaining: 0.01,
      }).reason,
    ).toBe('quota_fraction_free_tier');
  });
});

describe('evaluateChallengeReadiness — in-session state + cooldown', () => {
  it('hard-gates when already mid-round (offered/accepted/active/drafting)', () => {
    for (const state of [
      'offered',
      'accepted',
      'active',
      'drafting',
    ] as const) {
      expect(
        evaluateChallengeReadiness({
          ...baseInput,
          challengeRoundState: {
            state,
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
        }).eligible,
      ).toBe(false);
    }
  });

  it("hard-gates 'don't ask again' for this session even when state == declined", () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'declined',
          offerCount: 1,
          declinedDontAskAgain: true,
          evaluations: [],
        },
      }).eligible,
    ).toBe(false);
  });

  it('hard-gates plain decline within session (no re-offer this session)', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'declined',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      }).reason,
    ).toBe('session_decline');
  });

  it('allows offering again after a completed round (state === complete)', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'complete',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      }).eligible,
    ).toBe(true);
  });

  it('gates a completed round within the completion cooldown window', () => {
    const oneHourAgo = new Date('2026-05-19T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'complete',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
        cooldownLastOfferedAt: oneHourAgo,
        cooldownLastOutcome: 2, // verified
      }).eligible,
    ).toBe(false);
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'complete',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
        cooldownLastOfferedAt: oneHourAgo,
        cooldownLastOutcome: 2,
      }).reason,
    ).toBe('cooldown');
  });

  it('allows a completed round again after the completion cooldown elapses', () => {
    const yesterday = new Date('2026-05-18T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'complete',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
        cooldownLastOfferedAt: yesterday,
        cooldownLastOutcome: 2,
      }).eligible,
    ).toBe(true);
  });

  it('allows offering again after an aborted round', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: {
          state: 'aborted',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      }).eligible,
    ).toBe(true);
  });

  it('hard-gates declined within 24h cooldown across sessions', () => {
    const oneHourAgo = new Date('2026-05-19T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        cooldownLastOfferedAt: oneHourAgo,
        cooldownLastOutcome: 0,
      }).eligible,
    ).toBe(false);
  });

  it('allows again after 24h cooldown elapses', () => {
    const yesterday = new Date('2026-05-18T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        cooldownLastOfferedAt: yesterday,
        cooldownLastOutcome: 0,
      }).eligible,
    ).toBe(true);
  });

  it('applies cooldown for a non-decline outcome too (uniform completion cooldown, RR-8)', () => {
    const oneHourAgo = new Date('2026-05-19T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        cooldownLastOfferedAt: oneHourAgo,
        cooldownLastOutcome: 2, // verified — same 24h window as decline
      }).eligible,
    ).toBe(false);
  });

  it('returns cooldown reason when within the window', () => {
    const oneHourAgo = new Date('2026-05-19T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        cooldownLastOfferedAt: oneHourAgo,
        cooldownLastOutcome: 0,
      }).reason,
    ).toBe('cooldown');
  });

  it.each([
    [1, 'accepted_partial'],
    [2, 'verified'],
    [3, 'reteach'],
  ] as const)(
    'gates outcome code %d (%s) within the 24h completion cooldown window',
    (code, _label) => {
      const oneHourAgo = new Date('2026-05-19T11:00:00Z');
      expect(
        evaluateChallengeReadiness({
          ...baseInput,
          cooldownLastOfferedAt: oneHourAgo,
          cooldownLastOutcome: code,
        }).eligible,
      ).toBe(false);
      expect(
        evaluateChallengeReadiness({
          ...baseInput,
          cooldownLastOfferedAt: oneHourAgo,
          cooldownLastOutcome: code,
        }).reason,
      ).toBe('cooldown');
    },
  );

  it.each([
    [1, 'accepted_partial'],
    [2, 'verified'],
    [3, 'reteach'],
  ] as const)(
    'allows outcome code %d (%s) again after the 24h completion cooldown elapses',
    (code, _label) => {
      const yesterday = new Date('2026-05-18T11:00:00Z');
      expect(
        evaluateChallengeReadiness({
          ...baseInput,
          cooldownLastOfferedAt: yesterday,
          cooldownLastOutcome: code,
        }).eligible,
      ).toBe(true);
    },
  );
});
