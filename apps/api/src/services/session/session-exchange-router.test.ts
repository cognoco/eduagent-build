// ---------------------------------------------------------------------------
// Unit tests for session-exchange-router.ts (WI-1053)
//
// resolveExchangeLlmRouting is a pure function — no DB, no IO, no mocks.
// GC1 ratchet: no jest.mock('./...') calls in this file.
//
// Red-green-revert evidence is in the WI-1053 commit message.
// MMT-ADR-0016 §10.1: Gemini is banned for under-18 users.
// ---------------------------------------------------------------------------

import {
  resolveExchangeLlmRouting,
  resolveChallengeRoundLlmRoutingRung,
} from './session-exchange-router';

// ---------------------------------------------------------------------------
// resolveExchangeLlmRouting
// ---------------------------------------------------------------------------
describe('resolveExchangeLlmRouting', () => {
  // ── (a) Family plan, any rung, under-18 ─────────────────────────────────
  describe('(a) family plan under-18 — must NOT return gemini_only [MMT-ADR-0016 §10.1]', () => {
    it('does not return gemini_only for family/standard at low rung', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for family/standard at rung 2', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 2,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for family/standard at rung 3 (just below advanced threshold)', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 3,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('returns family_standard_gemini_only routing reason even for under-18 (non-gemini-only result)', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 2,
        isAdultLearner: false,
      });
      expect(result.routingReason).toBe('family_standard_gemini_only');
      expect(result.providerPolicy).toBeUndefined();
      expect(result.llmTier).toBe('standard');
    });
  });

  // ── (b) Plus plan, standard rung, under-18 ──────────────────────────────
  describe('(b) plus plan standard-rung under-18 — must NOT return gemini_only [MMT-ADR-0016 §10.1]', () => {
    it('does not return gemini_only for plus/standard at rung 1', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for plus/standard at rung 3 (last standard rung)', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 3,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('returns standard tier routing without gemini_only for plus under-18', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 2,
        isAdultLearner: false,
      });
      expect(result.llmTier).toBe('standard');
      expect(result.providerPolicy).toBeUndefined();
      expect(result.routingReason).toBe('plus_standard_below_advanced_rung');
    });
  });

  // ── (c) premium-addon, standard rung, under-18 ──────────────────────────
  describe('(c) premium-addon standard-rung under-18 — must NOT return gemini_only [MMT-ADR-0016 §10.1]', () => {
    it('does not return gemini_only for premium requestedLlmTier at rung 1', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 1,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for premium requestedLlmTier at rung 2', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 2,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for premium requestedLlmTier at rung 3', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 3,
        isAdultLearner: false,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('returns standard tier without gemini_only for premium-addon standard rung under-18', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 2,
        isAdultLearner: false,
      });
      expect(result.llmTier).toBe('standard');
      expect(result.providerPolicy).toBeUndefined();
      expect(result.routingReason).toBe(
        'premium_profile_or_addon_standard_below_advanced_rung',
      );
    });
  });

  // ── Fail-closed: undefined/null birthYear → no gemini_only ──────────────
  describe('fail-closed: isAdultLearner omitted (undefined) — same as under-18', () => {
    it('does not return gemini_only for family/standard when isAdultLearner is omitted', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 2,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for plus/standard when isAdultLearner is omitted', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });

    it('does not return gemini_only for premium-addon/standard when isAdultLearner is omitted', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 2,
      });
      expect(result.providerPolicy).not.toBe('gemini_only');
    });
  });

  // ── (d) Adult 18+ — gemini_only MUST be preserved ───────────────────────
  describe('(d) adult 18+ — gemini_only must still be returned', () => {
    it('returns gemini_only for family/standard adult learner at low rung', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 2,
        isAdultLearner: true,
      });
      expect(result.providerPolicy).toBe('gemini_only');
      expect(result.routingReason).toBe('family_standard_gemini_only');
    });

    it('returns gemini_only for plus/standard adult learner at rung 1', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
        isAdultLearner: true,
      });
      expect(result.providerPolicy).toBe('gemini_only');
      expect(result.llmTier).toBe('standard');
      expect(result.routingReason).toBe('plus_standard_below_advanced_rung');
    });

    it('returns gemini_only for plus/standard adult learner at rung 3', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 3,
        isAdultLearner: true,
      });
      expect(result.providerPolicy).toBe('gemini_only');
    });

    it('returns gemini_only for premium-addon standard-rung adult learner', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 2,
        isAdultLearner: true,
      });
      expect(result.providerPolicy).toBe('gemini_only');
      expect(result.llmTier).toBe('standard');
      expect(result.routingReason).toBe(
        'premium_profile_or_addon_standard_below_advanced_rung',
      );
    });
  });

  // ── Advanced rung (≥4) — premium tier, no gemini_only regardless of age ─
  describe('advanced rung (effectiveRung ≥ 4) — routes to premium, never gemini_only', () => {
    it('routes plus at rung 4 to premium regardless of adult status', () => {
      const adult = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 4,
        isAdultLearner: true,
      });
      expect(adult.llmTier).toBe('premium');
      expect(adult.providerPolicy).toBeUndefined();
      expect(adult.routingReason).toBe('plus_included_advanced_rung');

      const minor = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 4,
        isAdultLearner: false,
      });
      expect(minor.llmTier).toBe('premium');
      expect(minor.providerPolicy).toBeUndefined();
    });

    it('routes plus at rung 5 to premium', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 5,
        isAdultLearner: true,
      });
      expect(result.llmTier).toBe('premium');
      expect(result.providerPolicy).toBeUndefined();
    });

    it('routes premium-addon at rung 4 to premium', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 4,
        isAdultLearner: true,
      });
      expect(result.llmTier).toBe('premium');
      expect(result.providerPolicy).toBeUndefined();
      expect(result.routingReason).toBe(
        'premium_profile_or_addon_advanced_rung',
      );
    });

    it('routes premium-addon at rung 4+ to premium for under-18 too', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 4,
        isAdultLearner: false,
      });
      expect(result.llmTier).toBe('premium');
      expect(result.providerPolicy).toBeUndefined();
    });
  });

  // ── Passthrough for unknown/unset tier ───────────────────────────────────
  describe('passthrough for unknown / unset subscription tier', () => {
    it('returns no explicit tier or policy for undefined subscriptionTier', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: undefined,
        requestedLlmTier: 'standard',
        effectiveRung: 2,
        isAdultLearner: true,
      });
      expect(result.providerPolicy).toBeUndefined();
      expect(result.llmTier).toBe('standard');
    });

    it('returns requestedLlmTier as passthrough for free tier', () => {
      const result = resolveExchangeLlmRouting({
        subscriptionTier: 'free',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
        isAdultLearner: true,
      });
      expect(result.providerPolicy).toBeUndefined();
      expect(result.llmTier).toBe('standard');
    });
  });
});

// ---------------------------------------------------------------------------
// resolveChallengeRoundLlmRoutingRung
// ---------------------------------------------------------------------------
describe('resolveChallengeRoundLlmRoutingRung', () => {
  it('raises rung to minimum 4 when challenge round is accepted', () => {
    expect(resolveChallengeRoundLlmRoutingRung(1, { state: 'accepted' })).toBe(
      4,
    );
    expect(resolveChallengeRoundLlmRoutingRung(3, { state: 'accepted' })).toBe(
      4,
    );
  });

  it('raises rung to minimum 4 when challenge round is active', () => {
    expect(resolveChallengeRoundLlmRoutingRung(2, { state: 'active' })).toBe(4);
  });

  it('raises rung to minimum 4 when challenge round is drafting', () => {
    expect(resolveChallengeRoundLlmRoutingRung(1, { state: 'drafting' })).toBe(
      4,
    );
  });

  it('preserves a rung already above 4 during active challenge round', () => {
    expect(resolveChallengeRoundLlmRoutingRung(5, { state: 'active' })).toBe(5);
    expect(resolveChallengeRoundLlmRoutingRung(6, { state: 'drafting' })).toBe(
      6,
    );
  });

  it('leaves rung unchanged when challenge round is in offered state', () => {
    expect(resolveChallengeRoundLlmRoutingRung(2, { state: 'offered' })).toBe(
      2,
    );
  });

  it('leaves rung unchanged when challenge round is declined', () => {
    expect(resolveChallengeRoundLlmRoutingRung(2, { state: 'declined' })).toBe(
      2,
    );
  });

  it('leaves rung unchanged when challenge round is complete', () => {
    expect(resolveChallengeRoundLlmRoutingRung(2, { state: 'complete' })).toBe(
      2,
    );
  });

  it('leaves rung unchanged when challenge round is undefined', () => {
    expect(resolveChallengeRoundLlmRoutingRung(3, undefined)).toBe(3);
  });

  it('leaves rung unchanged when challenge round is aborted', () => {
    expect(resolveChallengeRoundLlmRoutingRung(2, { state: 'aborted' })).toBe(
      2,
    );
  });
});
