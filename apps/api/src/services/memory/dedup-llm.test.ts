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
    });
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
