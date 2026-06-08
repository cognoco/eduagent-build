import {
  registerProvider,
  _clearProviders,
  setLlmRoutingV2Enabled,
  getFallbackConfigForTest,
  ANTHROPIC_SONNET_MODEL,
} from './router';
import { createMockProvider } from './providers/mock';
import type { ModelConfig } from './types';

// ---------------------------------------------------------------------------
// T9 + T12 — under-18 fallback-compliance (MMT-ADR-0016 §1.5 / §10.1).
//
// HIGH-severity safety contract: when LLM_ROUTING_V2_ENABLED is on, the
// fallback selector must NEVER return Gemini or Vertex, and must fail closed
// (null → caller raises circuit-open) when the only registered alternative is
// a banned vendor.
//
// RED-GREEN (Fix Development Rules): the "fix" under test is the
// `if (routingV2Enabled) return getFallbackConfigV2(...)` short-circuit at the
// top of getFallbackConfig. Remove that line and getFallbackConfig falls
// through to the LEGACY body, which for an OpenAI primary with Gemini
// registered returns `{ provider: 'gemini' }`. The first test below then FAILS
// (it asserts the fallback is NOT gemini). Restore the line → green. Verified
// by hand 2026-06-08.
// ---------------------------------------------------------------------------

// Minimal primary configs — the selector only reads `.provider` and
// `.responseFormat`, so the model id is illustrative.
function primary(provider: ModelConfig['provider'], model = 'x'): ModelConfig {
  return { provider, model, maxTokens: 8192 };
}

beforeEach(() => {
  _clearProviders();
  setLlmRoutingV2Enabled(true);
});

afterEach(() => {
  _clearProviders();
  setLlmRoutingV2Enabled(false);
});

describe('V2 fallback compliance — Gemini/Vertex are never a fallback target', () => {
  it('[BREAK] an OpenAI primary never falls back to Gemini even when Gemini is registered', () => {
    // Legacy behavior (the bug): openai primary + has(gemini) → returns gemini.
    // V2 fix: openai primary → Anthropic Sonnet (the only compliant candidate).
    registerProvider(createMockProvider('gemini'));
    registerProvider(createMockProvider('anthropic'));

    const fb = getFallbackConfigForTest(primary('openai', 'gpt-5.4'), 4);

    expect(fb?.provider).not.toBe('gemini');
    expect(fb?.provider).not.toBe('vertex');
    expect(fb?.provider).toBe('anthropic');
    expect(fb?.model).toBe(ANTHROPIC_SONNET_MODEL);
  });

  it('a Cerebras primary never falls back to Gemini even when Gemini is the only other provider', () => {
    registerProvider(createMockProvider('gemini'));
    registerProvider(createMockProvider('cerebras'));

    const fb = getFallbackConfigForTest(primary('cerebras', 'gpt-oss-120b'), 1);

    // No compliant alternative is registered (only gemini + the failed
    // cerebras primary) → fail closed.
    expect(fb).toBeNull();
  });

  it('fails closed (null → circuit-open) when only forbidden vendors remain', () => {
    registerProvider(createMockProvider('gemini'));

    const fb = getFallbackConfigForTest(primary('cerebras'), 1);

    expect(fb).toBeNull();
  });
});

describe('V2 fallback pairing (T12) — tier-aware compliant chains', () => {
  it('free Cerebras primary falls back to Mistral first', () => {
    registerProvider(createMockProvider('mistral'));
    registerProvider(createMockProvider('openai'));
    registerProvider(createMockProvider('anthropic'));

    const fb = getFallbackConfigForTest(primary('cerebras'), 1, {
      llmTier: 'flash',
    });

    expect(fb?.provider).toBe('mistral');
    expect(fb?.model).toBe('mistral-small-2603');
  });

  it('free Cerebras primary falls through to Sonnet when Mistral is unregistered', () => {
    registerProvider(createMockProvider('anthropic'));

    const fb = getFallbackConfigForTest(primary('cerebras'), 1, {
      llmTier: 'flash',
    });

    expect(fb?.provider).toBe('anthropic');
    expect(fb?.model).toBe(ANTHROPIC_SONNET_MODEL);
  });

  it('paid Cerebras primary falls back to GPT-5 mini first', () => {
    registerProvider(createMockProvider('mistral'));
    registerProvider(createMockProvider('openai'));
    registerProvider(createMockProvider('anthropic'));

    const fb = getFallbackConfigForTest(primary('cerebras'), 1, {
      llmTier: 'standard',
    });

    expect(fb?.provider).toBe('openai');
    expect(fb?.model).toBe('gpt-5-mini');
    expect(fb?.reasoningEffort).toBe('low');
  });

  it('Mistral primary falls back to GPT-5 mini, then Sonnet', () => {
    registerProvider(createMockProvider('anthropic'));

    // openai unregistered → falls through to Sonnet.
    const fbSonnet = getFallbackConfigForTest(primary('mistral'), 1, {
      llmTier: 'flash',
    });
    expect(fbSonnet?.provider).toBe('anthropic');

    registerProvider(createMockProvider('openai'));
    const fbMini = getFallbackConfigForTest(primary('mistral'), 1, {
      llmTier: 'flash',
    });
    expect(fbMini?.provider).toBe('openai');
    expect(fbMini?.model).toBe('gpt-5-mini');
  });

  it('gpt-5.4 (OpenAI, rungs 4–5) falls back to Sonnet, never Gemini', () => {
    registerProvider(createMockProvider('gemini'));
    registerProvider(createMockProvider('anthropic'));

    const fb = getFallbackConfigForTest(primary('openai', 'gpt-5.4'), 5, {
      llmTier: 'premium',
    });

    expect(fb?.provider).toBe('anthropic');
  });

  it('vision primary keeps a vision-capable fallback (never text-only gpt-oss)', () => {
    // Paid vision primary = gpt-5-mini (openai). On failure the fallback must
    // stay vision-capable → Sonnet, NOT Cerebras gpt-oss.
    registerProvider(createMockProvider('cerebras'));
    registerProvider(createMockProvider('anthropic'));

    const fb = getFallbackConfigForTest(primary('openai', 'gpt-5-mini'), 1, {
      llmTier: 'standard',
      capability: 'vision',
    });

    expect(fb?.provider).toBe('anthropic');
    expect(fb?.provider).not.toBe('cerebras');
  });
});

describe('flag-off: V2 selector is inert (legacy fallback preserved)', () => {
  it('with the flag off, an OpenAI primary still falls back to Gemini (legacy, unchanged)', () => {
    setLlmRoutingV2Enabled(false);
    registerProvider(createMockProvider('gemini'));

    const fb = getFallbackConfigForTest(primary('openai', 'gpt-4o'), 1);

    // Legacy behavior is intentionally preserved while the flag is off — this
    // is the no-regress guarantee. The compliance ban applies only under V2.
    expect(fb?.provider).toBe('gemini');
  });
});
