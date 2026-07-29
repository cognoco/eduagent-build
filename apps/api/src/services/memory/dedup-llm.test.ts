import { resolveJudgeEligibleVendors } from '../llm';
import { runDedupLlm } from './dedup-llm';
import type { DedupPair } from './dedup-prompt';

const PAIR: DedupPair = {
  candidate: { text: 'struggles with fractions', category: 'struggle' },
  neighbour: {
    text: 'has trouble with fraction arithmetic',
    category: 'struggle',
  },
};

describe('runDedupLlm', () => {
  it('parses a valid response', async () => {
    const caller = jest.fn().mockResolvedValue({
      response:
        '{"action":"merge","merged_text":"struggles with fraction arithmetic"}',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      latencyMs: 1,
      stopReason: 'stop',
    });

    await expect(runDedupLlm(PAIR, { caller })).resolves.toEqual({
      ok: true,
      decision: {
        action: 'merge',
        merged_text: 'struggles with fraction arithmetic',
      },
      modelVersion: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    });
  });

  // [WI-2628] The independence property, asserted where it is actually decided.
  // `producerVendor` feeds `resolveJudgeEligibleVendors`, which filters a VENDOR
  // pool. So the discriminating assertion is not "a producer string was returned"
  // but "the producing vendor is absent from the resolved judge pool". The model
  // string satisfies the former and fails the latter, which is exactly how an
  // Anthropic-produced merge came to be judged by Anthropic.
  it('returns a provider that ACTUALLY EXCLUDES itself from the judge pool', async () => {
    const caller = jest.fn().mockResolvedValue({
      response: '{"action":"merge","merged_text":"merged"}',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      latencyMs: 1,
      stopReason: 'stop',
    });

    const result = await runDedupLlm(PAIR, { caller });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The value the gate threads must remove its own vendor from the pool.
    expect(
      resolveJudgeEligibleVendors({
        mode: 'model-output',
        producerVendor: result.provider,
      }),
    ).not.toContain('anthropic');

    // And the control that makes the assertion above non-trivial: the MODEL string
    // — the value that used to be threaded — excludes nothing at all, so Anthropic
    // stays eligible to grade its own output.
    expect(
      resolveJudgeEligibleVendors({
        mode: 'model-output',
        producerVendor: result.modelVersion,
      }),
    ).toContain('anthropic');
  });

  it('returns invalid_response on garbled JSON', async () => {
    const caller = jest.fn().mockResolvedValue({
      response: 'I think they should be merged',
      model: 'test-model',
    });
    const result = await runDedupLlm(PAIR, { caller });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_response');
  });

  it('returns transient on router error', async () => {
    const caller = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const result = await runDedupLlm(PAIR, { caller });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('transient');
  });
});
