import {
  setLlmRoutingV2Enabled,
  getModelConfigForTest,
  getOpenAIAdvancedModel,
  registerProvider,
  _clearProviders,
} from './router';
import { createMockProvider } from './providers/mock';

// ---------------------------------------------------------------------------
// T10 + T11 — V2 primary-model matrix (MMT-ADR-0016 §1.5), behind
// LLM_ROUTING_V2_ENABLED. Asserts each §1.5 row resolves to the stated
// { provider, model, reasoningEffort }, plus the two owner-critical exclusions:
//   - free-tier rung-1 → cerebras (NOT mistral) — free does not escalate;
//   - Family rung-4 → cerebras gpt-oss high (NOT gpt-5.4) — owner ruling.
// The flag-off block proves the matrix is inert (legacy Gemini default) so the
// equivalence snapshot is unchanged.
//
// getModelConfigForTest is a pure resolver (no provider registry needed) so
// these tests assert routing intent independent of which providers happen to
// be registered.
// ---------------------------------------------------------------------------

const ADVANCED = getOpenAIAdvancedModel(); // 'gpt-5.4'

afterEach(() => setLlmRoutingV2Enabled(false));

describe('V2 matrix — text primaries', () => {
  beforeEach(() => setLlmRoutingV2Enabled(true));

  it('free (flash) rung 1 → Cerebras gpt-oss-120b @ high (NOT mistral — no free escalation)', () => {
    const c = getModelConfigForTest(1, { llmTier: 'flash' });
    expect(c).toMatchObject({
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      reasoningEffort: 'high',
    });
  });

  it('free (flash) rung 5 → still Cerebras gpt-oss-120b @ high (free never reaches gpt-5.4)', () => {
    const c = getModelConfigForTest(5, { llmTier: 'flash' });
    expect(c.provider).toBe('cerebras');
    expect(c.model).toBe('gpt-oss-120b');
  });

  it('standard (Plus base / Family) rungs 1–3 → Cerebras gpt-oss-120b @ high', () => {
    for (const rung of [1, 2, 3] as const) {
      const c = getModelConfigForTest(rung, { llmTier: 'standard' });
      expect(c).toMatchObject({ provider: 'cerebras', model: 'gpt-oss-120b' });
    }
  });

  it('premium rung 4 → OpenAI gpt-5.4 @ medium (Plus/Pro/AI-Upgrade deep reasoning)', () => {
    const c = getModelConfigForTest(4, { llmTier: 'premium' });
    expect(c).toMatchObject({
      provider: 'openai',
      model: ADVANCED,
      reasoningEffort: 'medium',
    });
  });

  it('premium rung 5 → OpenAI gpt-5.4 @ medium', () => {
    const c = getModelConfigForTest(5, { llmTier: 'premium' });
    expect(c.provider).toBe('openai');
    expect(c.model).toBe(ADVANCED);
  });

  it('[Family exclusion] Family rung 4 (standard tier) → Cerebras gpt-oss high, NEVER gpt-5.4', () => {
    // Family resolves to `standard` upstream (never elevated to `premium`), so
    // at the router it can never satisfy the premium gpt-5.4 gate.
    const c = getModelConfigForTest(4, { llmTier: 'standard' });
    expect(c.provider).toBe('cerebras');
    expect(c.model).toBe('gpt-oss-120b');
    expect(c.model).not.toBe(ADVANCED);
  });

  it('[compliance] gemini_only policy (how Family/Plus-standard arrive) → Cerebras, never Gemini', () => {
    // The legacy gemini_only policy targets Gemini (banned under-18). Under V2
    // it must be remapped to the compliant universal default.
    const c = getModelConfigForTest(1, {
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
    });
    expect(c.provider).toBe('cerebras');
    expect(c.provider).not.toBe('gemini');
  });

  it('[compliance] an explicit preferredProvider:gemini cannot override the matrix under V2', () => {
    const c = getModelConfigForTest(1, {
      llmTier: 'standard',
      preferredProvider: 'gemini',
    });
    expect(c.provider).not.toBe('gemini');
    expect(c.provider).toBe('cerebras');
  });
});

describe('V2 matrix — vision primaries (gpt-oss is text-only)', () => {
  beforeEach(() => setLlmRoutingV2Enabled(true));

  it('paid vision → OpenAI gpt-5-mini @ low', () => {
    const c = getModelConfigForTest(1, {
      llmTier: 'standard',
      capability: 'vision',
    });
    expect(c).toMatchObject({
      provider: 'openai',
      model: 'gpt-5-mini',
      reasoningEffort: 'low',
    });
  });

  it('free vision → Mistral Small', () => {
    const c = getModelConfigForTest(1, {
      llmTier: 'flash',
      capability: 'vision',
    });
    expect(c).toMatchObject({
      provider: 'mistral',
      model: 'mistral-small-2603',
    });
  });

  it('premium vision rung 4 → still GPT-5 mini (vision beats deep-reasoning; gpt-oss/gpt-5.4 not used for vision)', () => {
    const c = getModelConfigForTest(4, {
      llmTier: 'premium',
      capability: 'vision',
    });
    expect(c.provider).toBe('openai');
    expect(c.model).toBe('gpt-5-mini');
  });
});

describe('V2 matrix — flag OFF is inert (no-regress, legacy Gemini default)', () => {
  // Legacy routing keys off the registered provider set — Gemini is the
  // default only when registered, which it always is in production. Register a
  // Gemini mock so this block exercises the real legacy default path.
  beforeEach(() => {
    _clearProviders();
    registerProvider(createMockProvider('gemini'));
    setLlmRoutingV2Enabled(false);
  });
  afterEach(() => _clearProviders());

  it('flag off: standard rung 1 → gemini-2.5-flash (legacy, unchanged)', () => {
    const c = getModelConfigForTest(1, { llmTier: 'standard' });
    expect(c.provider).toBe('gemini');
    expect(c.model).toBe('gemini-2.5-flash');
  });

  it('flag off: standard rung 4 → gemini-2.5-pro (legacy, unchanged)', () => {
    const c = getModelConfigForTest(4, { llmTier: 'standard' });
    expect(c.provider).toBe('gemini');
    expect(c.model).toBe('gemini-2.5-pro');
  });
});
