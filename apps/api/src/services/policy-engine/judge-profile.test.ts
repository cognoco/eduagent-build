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

// ---------------------------------------------------------------------------
// [WI-1900] Config-valued adult coverage (operator ruling 2026-08-04): the
// adult rate must be tunable by configuration so coverage can ratchet toward
// full-async WITHOUT a redesign. The minor path is untouched — these tests are
// the guard that a future rate change can never reach minors.
// ---------------------------------------------------------------------------
describe('[WI-1900] config-valued adult sampling', () => {
  it('honours an explicit adult rate over the launch default', () => {
    expect(resolveSuitabilityProfile('adult', 0.5)).toEqual({ sampling: 0.5 });
    // A draw that the 0.1 launch rate would SKIP is judged at 0.5.
    expect(shouldJudge('adult', 0.3, 0.5)).toBe(true);
    expect(shouldJudge('adult', 0.3)).toBe(false);
  });

  it('supports ratcheting adult coverage to full (1.0) by config alone', () => {
    // The ruling's stated purpose: reach full adult coverage by configuration.
    expect(shouldJudge('adult', 0.99, 1.0)).toBe(true);
  });

  it('supports switching adult coverage fully off (0) by config alone', () => {
    expect(shouldJudge('adult', 0, 0)).toBe(false);
    expect(shouldJudge('adult', 0.99, 0)).toBe(false);
  });

  it('NEVER lets the adult rate reduce minor coverage', () => {
    // The load-bearing guarantee. Even an adult rate of 0 leaves every minor
    // and every unknown-age learner at full coverage.
    expect(resolveSuitabilityProfile('child', 0)).toEqual({ sampling: 1.0 });
    expect(resolveSuitabilityProfile('adolescent', 0)).toEqual({
      sampling: 1.0,
    });
    expect(resolveSuitabilityProfile(null, 0)).toEqual({ sampling: 1.0 });
    expect(resolveSuitabilityProfile(undefined, 0)).toEqual({ sampling: 1.0 });
    expect(shouldJudge('child', 0.99, 0)).toBe(true);
    expect(shouldJudge('adolescent', 0.99, 0)).toBe(true);
    expect(shouldJudge(null, 0.99, 0)).toBe(true);
  });

  it('falls back to the launch default when no rate is supplied', () => {
    // Omitting the override must not change shipped behaviour — this is what
    // makes landing the config key a zero-behaviour-change refactor.
    expect(resolveSuitabilityProfile('adult', undefined)).toEqual({
      sampling: ADULT_SUITABILITY_SAMPLING,
    });
    expect(shouldJudge('adult', 0.05, undefined)).toBe(true);
  });
});
