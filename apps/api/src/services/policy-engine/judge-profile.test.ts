// ---------------------------------------------------------------------------
// Suitability-judge profile / sampling — unit tests (MMT-ADR-0016 §3, judge
// framework phase 4 increment 1).
//
// Coverage (post-display T2) is the only age-derivable value here: §3 fixes
// under-18 coverage at 1.0 (never the risk-targeted variable) and samples
// adults. The gating MODE (S/G/F) is deliberately NOT resolved in this
// increment — S-vs-G turns on the per-jurisdiction digital-consent age, which
// is not in scope until phase 5. See the increment plan, Step 2.
// ---------------------------------------------------------------------------

import {
  ADULT_SUITABILITY_SAMPLING,
  resolveSuitabilityProfile,
  shouldJudge,
} from './judge-profile';

describe('resolveSuitabilityProfile', () => {
  it('keeps under-18 coverage at 1.0 — adolescent', () => {
    expect(resolveSuitabilityProfile('adolescent')).toEqual({ sampling: 1.0 });
  });

  it('keeps under-18 coverage at 1.0 — child', () => {
    expect(resolveSuitabilityProfile('child')).toEqual({ sampling: 1.0 });
  });

  it('samples adults at the configured rate', () => {
    expect(resolveSuitabilityProfile('adult')).toEqual({
      sampling: ADULT_SUITABILITY_SAMPLING,
    });
    // Adults are the only sampled bracket — pin the launch rate.
    expect(ADULT_SUITABILITY_SAMPLING).toBe(0.1);
  });

  it('falls back to the conservative minor default (1.0) for null age', () => {
    expect(resolveSuitabilityProfile(null)).toEqual({ sampling: 1.0 });
  });

  it('falls back to the conservative minor default (1.0) for undefined age', () => {
    expect(resolveSuitabilityProfile(undefined)).toEqual({ sampling: 1.0 });
  });
});

describe('shouldJudge', () => {
  it('always judges a minor regardless of rng (coverage 1.0)', () => {
    expect(shouldJudge('adolescent', 0.99)).toBe(true);
    expect(shouldJudge('child', 0.99)).toBe(true);
  });

  it('always judges when age is unknown (conservative minor default)', () => {
    expect(shouldJudge(null, 0.99)).toBe(true);
    expect(shouldJudge(undefined, 0.99)).toBe(true);
  });

  it('skips an adult whose rng is above the sample rate', () => {
    expect(shouldJudge('adult', 0.5)).toBe(false);
  });

  it('judges an adult whose rng falls within the sample rate', () => {
    expect(shouldJudge('adult', 0.05)).toBe(true);
  });

  it('treats the sample rate as a strict lower-exclusive bound (rng === rate → skip)', () => {
    // rng draws from [0, 1); equality with the rate must NOT judge, so a
    // sample of 0.1 judges ~10% of [0,1) draws, not 10%+epsilon.
    expect(shouldJudge('adult', ADULT_SUITABILITY_SAMPLING)).toBe(false);
  });
});
