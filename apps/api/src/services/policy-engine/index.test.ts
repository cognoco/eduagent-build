// ---------------------------------------------------------------------------
// Policy Engine barrel — unit tests (WI-571 WP-W1-spine TDD)
// ---------------------------------------------------------------------------

import * as policyEngine from './index';

describe('policy-engine barrel exports', () => {
  it('exports evaluatePolicyCell', () => {
    expect(typeof policyEngine.evaluatePolicyCell).toBe('function');
  });

  it('exports resolveExchangeRouter', () => {
    expect(typeof policyEngine.resolveExchangeRouter).toBe('function');
  });

  it('exports resolveJudgeConfig', () => {
    expect(typeof policyEngine.resolveJudgeConfig).toBe('function');
  });

  it('exports NoEligibleModelError', () => {
    expect(typeof policyEngine.NoEligibleModelError).toBe('function');
  });
});
