// ---------------------------------------------------------------------------
// Safety/Judge stub — unit tests (WI-571 WP-W1-spine TDD)
// ---------------------------------------------------------------------------

import { resolveJudgeConfig } from './judge';

describe('resolveJudgeConfig', () => {
  it('exports resolveJudgeConfig as a function', () => {
    expect(typeof resolveJudgeConfig).toBe('function');
  });

  it('returns vendorIndependent: true (MMT-ADR-0016 §2)', () => {
    const result = resolveJudgeConfig({ tutorVendor: 'anthropic' });
    expect(result.vendorIndependent).toBe(true);
  });

  it('returns reasoningMode: "off" (non-reasoning per MMT-ADR-0016 §2)', () => {
    const result = resolveJudgeConfig({ tutorVendor: 'anthropic' });
    expect(result.reasoningMode).toBe('off');
  });

  it('vendorConstraint encodes that judge must differ from tutorVendor', () => {
    const result = resolveJudgeConfig({ tutorVendor: 'anthropic' });
    // vendorConstraint must be exactly the exclusion token, not just contain the vendor
    expect(result.vendorConstraint).toBe('!anthropic');
  });

  it('different tutorVendor → different vendorConstraint', () => {
    const anthropicResult = resolveJudgeConfig({ tutorVendor: 'anthropic' });
    const openaiResult = resolveJudgeConfig({ tutorVendor: 'openai' });
    expect(anthropicResult.vendorConstraint).not.toBe(
      openaiResult.vendorConstraint,
    );
  });
});
