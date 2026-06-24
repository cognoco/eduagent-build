---
title: Gemini-Exit Interactive Routing Build — Implementation Spec
date: 2026-06-06
profile: code
spec: docs/specs/2026-06-06-llm-routing-and-judge-architecture.md
adr: docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md
status: archived
---

# Gemini-Exit Interactive Routing Build — Implementation Spec

> **ARCHIVED 2026-06-23.** The build it specs has **shipped** behind
> `LLM_ROUTING_V2_ENABLED` (Cerebras/Mistral adapters, GPT-5-mini plumbing,
> fail-closed fallback ban). Operative reference is now the guiding doc
> [`docs/registers/llm-models/master.md`](../../registers/llm-models/master.md).
> Kept for the file-by-file implementation rationale.

**Goal:** Implement the full §1.5 interactive routing matrix and make the fallback path **never** resolve to an under-18-banned vendor (Gemini/Vertex). Concretely: **all tiers (free incl.), teaching rungs 1–3, text → gpt-oss-120b @ Cerebras `high`** (the universal default); each tier's **secondary** — used when the business-rule layer routes away from Cerebras (EU-residency required *or* Cerebras unavailable) **and** for vision — is **free → Mistral Small 4** (EU), **paid → GPT-5 mini @ low**; deep-reasoning rungs 4–5 → **gpt-5.4 @ medium** for **Plus / Pro / AI-Upgrade-entitled only** — the **Family tier has NO access to gpt-5.4** (owner ruling 2026-06-07), Family's rungs 4–5 stay on **gpt-oss-120b @ Cerebras `high`**. Sonnet 4.6 stays the rung-4–5 fallback. The age/residency/plan business-rule layer that selects primary-vs-secondary is **not built in this spec** — here `getModelConfig` pins gpt-oss as the all-tier primary and wires each tier's secondary as the **fallback** target (T12); the residency-driven *primary* substitution is a later rule-table phase. (Adult-only Gemini eligibility is an open legal ruling — see routing-spec §10.1; until ruled, Gemini/Vertex stays unconditionally banned here.)

**Tier facts (verified `apps/api/src/services/subscription.ts:43-119`):** free (100/mo, `flash`), plus (700/mo, `standard`), family (**1500/mo shared-pool**, 4 profiles, `standard`), pro (3000/mo shared-pool, `standard`). Base `llmTier` for plus/family/pro is `standard`; the **advanced (`premium`) model gpt-5.4 is an entitlement** reached via Plus's advanced-rung elevation, the Pro tier, or the **$15/mo AI Upgrade add-on** (`AI_UPGRADE_ADDON`, `subscription.ts:130-135`) — **never the Family tier** (Family was already "standard-only" pre-Gemini-exit; this ruling keeps it so).

**Approach:** Add two direct vendor adapters (Cerebras, Mistral) modeled on `providers/openrouter.ts`; teach the existing **OpenAI adapter** the `gpt-5-mini` model id and `reasoning_effort` plumbing (it has neither today); extend the provider union; replace `getFallbackConfig`'s availability-based Gemini fallback with an allow-list-driven, fail-closed selector; pin the matrix in `getModelConfig` behind a new `LLM_ROUTING_V2_ENABLED` flag so the Gemini-default path is preserved until cutover; register the new providers from Doppler keys.

**Why this spec covers all five interactive models, not just Cerebras:** GPT-5 mini and gpt-5.4 are the *fallback* and the *rung-4–5 target of this same routing change* — they are not separable. The current OpenAI adapter cannot serve them: `MODEL_MAP` (`providers/openai.ts:88-94`) has no `gpt-5-mini`, and the adapter sends only `max_completion_tokens` with **no reasoning-effort param** (`openai.ts:45,132,192`), so "GPT-5 mini @ low" and "gpt-5.4 @ medium" cannot be expressed today. The **Haiku judge + gating modes are deliberately out of scope** — they are a different subsystem (routing-and-judge spec §3/§4) and get their own build spec.

## Background (the decision this implements)

Ratified in **`MMT-ADR-0016`**: the originally-evaluated "gpt-oss confined to async" rationale was a harness artifact (fixed in Thread A — eval-only, already landed). gpt-oss is validated for safety (44/44 + 100× jailbreak + 5/5 multi-turn), teaching (55/55), latency (p50 1.3s), and language (~98% as-is across all 9 locales). The whole §1.5 matrix is target-state — `getModelConfig` today routes every primary to `gemini-2.5-flash`/`pro`; none of the matrix is implemented yet. This spec does **not** touch the eval harness (Thread A) or the optional shared end-of-prompt language directive.

### Hard prerequisites (non-code — gate the flag flip for minor traffic, not implementation)

Build and test against these as `false`/pending until signed:

- **G-P1** Cerebras compliance triplet: ZDR + no-training + executed DPA, with ZDR in the DPA text (not just marketing); SCCs + TIA (Cerebras US-only, not DPF-certified); subprocessor list reviewed. → Doppler `CEREBRAS_API_KEY` present; legal sign-off pending.
- **G-P2** OpenAI ZDR-for-minors configured (covers both the GPT-5 mini fallback and gpt-5.4).
- **G-P3** Teaching-quality A/B: gpt-oss vs the GPT-5 mini incumbent at paid rungs 1–3 (run via the harness now that Thread A is fixed) — no pedagogy regression.

## Scope

In scope:
- `apps/api/src/services/llm/types.ts` — provider union
- `apps/api/src/services/llm/providers/cerebras.ts` (new) + `cerebras.test.ts` (new)
- `apps/api/src/services/llm/providers/mistral.ts` (new) + `mistral.test.ts` (new)
- `apps/api/src/services/llm/providers/refusal-envelope.ts` (new) + test
- `apps/api/src/services/llm/providers/openai.ts` (+ `openai.test.ts`) — `gpt-5-mini` model id + `reasoning_effort` plumbing
- `apps/api/src/services/llm/router.ts` — `PreferredLlmProvider`, `getModelConfig`, `getFallbackConfig`, the gpt-5.4 deep-reasoning gate
- `apps/api/src/services/llm/index.ts` — export new providers
- `apps/api/src/middleware/llm.ts` — register Cerebras/Mistral from env; extend the env-hash
- `apps/api/src/config.ts` — new env var schema + `LLM_ROUTING_V2_ENABLED`
- `apps/api/src/services/llm/router.test.ts` + new `router.fallback-compliance.test.ts`

Out of scope (must not change):
- `apps/api/eval-llm/**` (Thread A complete; OpenRouter adapter stays eval-only)
- **The Haiku judge, suitability/language judges, and gating modes** — separate spec (routing-and-judge §3/§4)
- The routing-rule-table refactor (spec phases 1–2) — this spec edits `getModelConfig` in place; the declarative-table migration is a later, separately-specced refactor
- V0/V1 navigation flags and `app-context.tsx`
- Any prompt file (the shared end-of-prompt directive is a separate optional change)
- Gemini/Vertex provider code (stays registered until phase-6 removal; this spec only stops *fallback* from selecting it)

## Map the surface

| File | Responsibility (one) |
|---|---|
| `types.ts` | Add `'cerebras' \| 'mistral'` to the `ModelConfig.provider` union (line 13). |
| `providers/cerebras.ts` | OpenAI-compatible adapter → `https://api.cerebras.ai/v1/chat/completions`; `reasoning_effort` param; `{"type":"refusal"}` normalization. |
| `providers/mistral.ts` | OpenAI-compatible adapter → `https://api.mistral.ai/v1/chat/completions` (EU); multimodal (vision) passthrough. |
| `providers/openai.ts` | Add `gpt-5-mini` to `MODEL_MAP`; emit `reasoning_effort` when `config.reasoningEffort` set (today it's dropped). |
| `providers/refusal-envelope.ts` | Pure helper: bare model-refusal object → valid localized safe-envelope string. Shared by Cerebras (reusable by OpenAI). |
| `router.ts` `getModelConfig` | Pin the matrix behind `LLM_ROUTING_V2_ENABLED` (all tiers 1–3 text→Cerebras gpt-oss; vision→GPT-5 mini paid / Mistral free; 4–5→gpt-5.4 @ medium for Plus/Pro, gpt-oss `high` for Family). Per-tier secondary (free→Mistral, paid→GPT-5 mini) wired as the *fallback* target in T12. |
| `router.ts` `getFallbackConfig` | Allow-list-driven, fail-closed fallback that never returns Gemini/Vertex. |
| `middleware/llm.ts` | Register Cerebras/Mistral from Doppler keys; include them in the env-hash. |
| `config.ts` | Schema for `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `LLM_ROUTING_V2_ENABLED`. |

## Tasks

- [ ] **T1: Extend the provider union.** In `types.ts:13` → `provider: 'gemini' | 'openai' | 'anthropic' | 'cerebras' | 'mistral' | 'openrouter' | 'mock';`. — done when: `pnpm exec nx run api:typecheck` passes and every `switch`/`Record<Provider,…>` over the union compiles (fix each surfaced site by routing through the new adapters, not a `default:` swallow).

- [ ] **T2: `{"type":"refusal"}` → safe-envelope helper** (`providers/refusal-envelope.ts`). See `## Tests T2`. The model occasionally returns OpenAI's native structured refusal (`{"type":"refusal", …}`, or a top-level `refusal` string with no `reply`) instead of our envelope (~1% of refusals, observed on gpt-oss). The helper returns a **valid** `llmResponseEnvelopeSchema` JSON string whose `reply` is a localized polite decline + redirect and `signals.crisis_redirect: false`. — done when: `normalizeModelRefusal` returns `null` for a normal envelope and a `parseEnvelope`-valid string for a refusal object, in the learner's `conversationLanguage` (English fallback); unit test green.

- [ ] **T3: Direct Cerebras adapter** (`providers/cerebras.ts`), `id: 'cerebras'`. Mirror `providers/openrouter.ts` except: base URL `https://api.cerebras.ai/v1/chat/completions`; send `reasoning_effort` (top-level, OpenAI-style — **not** OpenRouter's `reasoning: { effort }`); after a successful parse, run the T2 helper on `choice.message.content` and substitute when non-null. See `## Tests T3`. — done when: unit test asserts (a) URL + `Authorization: Bearer <key>`, (b) `reasoning_effort: 'high'` in body when `config.reasoningEffort==='high'`, (c) `{"type":"refusal"}` content rewritten to a parseable safe envelope, (d) `finish_reason: 'content_filter'` → `SafetyFilterError`.

- [ ] **T4: Direct Mistral adapter** (`providers/mistral.ts`), `id: 'mistral'`. Mirror `openrouter.ts`; base URL `https://api.mistral.ai/v1/chat/completions`; model id `mistral-small-2603`; pass `toOpenAIContent` so image parts (vision) serialize; no `reasoning` param. — done when: unit test asserts URL + auth + an image content part serializes to the OpenAI `image_url` shape; `content_filter` → `SafetyFilterError`.

- [ ] **T5: Teach the OpenAI adapter GPT-5 mini + reasoning effort** (`providers/openai.ts`). See `## Tests T5`. Two changes: (1) add `'gpt-5-mini': 'gpt-5-mini'` to `MODEL_MAP` (identity, no warn) — the production id is `gpt-5-mini` (memo §6, `openai/gpt-5-mini` on OpenRouter; direct OpenAI drops the `openai/` prefix); (2) when `config.reasoningEffort` is set, add `reasoning_effort: config.reasoningEffort` to the request body (the GPT-5 family accepts it; today the field is silently dropped). Leave non-reasoning models (`gpt-4o*`) unaffected — only emit the field when the caller sets it. — done when: unit test asserts (a) `model: 'gpt-5-mini'` maps through without the default-fallback warn, (b) `reasoning_effort: 'low'` appears in the body when `config.reasoningEffort==='low'`, (c) absent when `reasoningEffort` is unset.

- [ ] **T6: Export the new adapters** from `services/llm/index.ts` (`createCerebrasProvider`, `createMistralProvider`). — done when: `import { createCerebrasProvider, createMistralProvider } from '../services/llm'` resolves in `middleware/llm.ts`.

- [ ] **T7: Config schema** (`config.ts`): add `CEREBRAS_API_KEY?`, `MISTRAL_API_KEY?` (optional strings) and `LLM_ROUTING_V2_ENABLED` (boolean, default `false`). — done when: typed config exposes all three; G4 eslint (no raw `process.env`) passes; reading them compiles.

- [ ] **T8: Register providers from env** (`middleware/llm.ts`): add `CEREBRAS_API_KEY` + `MISTRAL_API_KEY` to the `Bindings` type AND to `envHash` (so a key change re-registers — the BUG-488 invariant); register `createCerebrasProvider`/`createMistralProvider` when their key is present. — done when: `middleware/llm.test.ts` gains cases proving (a) providers register when keys present, (b) changing `CEREBRAS_API_KEY` re-registers (hash includes it).

- [ ] **T9: Compliance-aware fallback** — rewrite `getFallbackConfig` (`router.ts:485-550`). See `## Tests T9` (HIGH-severity safety fix — red-green break test required per the Fix Development Rules). Replace the "fall back to Gemini when registered" branches with an **allow-list** selector: `const FALLBACK_FORBIDDEN = new Set(['gemini', 'vertex'])` (under-18-banned, unconditional for now), plus a per-rung ordered preference of **compliant** providers; return the first registered, non-forbidden config, else `null` (→ caller raises the existing circuit-open error). Gemini/Vertex must be unreachable as a fallback target regardless of registration. (If the adult-only Gemini ruling lands — routing-spec §10.1 — this set becomes age-conditional; that is a later change, out of scope here. The under-18 ban is unconditional.) — done when: the break test passes with the fix and fails when reverted; no path returns `provider: 'gemini'` or `'vertex'`.

- [ ] **T10: Pin the matrix** in `getModelConfig` behind `LLM_ROUTING_V2_ENABLED`. Flag **off** → byte-identical to today (Gemini default), proven by the existing equivalence snapshot. Flag **on**:
  - capability `vision` → `gpt-5-mini @ low` (paid) / `mistral-small-2603` (free) — **never** gpt-oss (text-only);
  - **all tiers (free, plus, family, pro), rungs 1–3, text → `cerebras` (`gpt-oss-120b`, `reasoningEffort: 'high'`)** — the universal default; free does **not** escalate to a premium model;
  - rungs 4–5, **Plus / Pro / AI-Upgrade-entitled** → `openai` `gpt-5.4` with `reasoningEffort: 'medium'`; Sonnet 4.6 fallback (via T9 allow-list);
  - rungs 4–5, **Family tier** → `cerebras` `gpt-oss-120b` `reasoningEffort: 'high'` — **no gpt-5.4 access** (owner ruling); GPT-5 mini fallback;
  - async deep-job flows → `cerebras` `gpt-oss-120b` (unchanged role).
  The per-tier **secondary** (free→Mistral, paid→GPT-5 mini) is wired as the **fallback** target in T12, **not** as a primary here — the residency-driven primary substitution is the later business-rule-layer phase. Use the **existing** `llmTier`/tier inputs already threaded into `getModelConfig` — do not invent a new tier source. — done when: `router.test.ts` gains an `LLM_ROUTING_V2_ENABLED=true` block asserting each row resolves to the stated `{provider, model, reasoningEffort}`, **including a free-tier rung-1 case asserting `provider:'cerebras'` (NOT `mistral`) and a Family-tier rung-4 case asserting `provider:'cerebras'` (NOT `openai`/`gpt-5.4`)**; the flag-off equivalence snapshot is unchanged.

- [ ] **T11: gpt-5.4 deep-reasoning gate + Family exclusion** (`router.ts` + `resolveExchangeLlmRouting` in `services/session/session-exchange.ts` — the premium-elevation site per the `subscription.ts:66-70` comment). The matrix puts gpt-5.4 @ medium at **rungs 4–5** (today `OPENAI_ADVANCED_MODEL_MIN_RUNG = 5`, `router.ts:337`, premium-only). Under `LLM_ROUTING_V2_ENABLED`: lower the floor so rung-4 reaches gpt-5.4, set `reasoningEffort: 'medium'`, **and gate access so the Family tier never resolves to gpt-5.4** (owner ruling 2026-06-07 — Family has no access to the advanced model, even though it is `standard`-tier paid). Concrete predicate: gpt-5.4 is reachable only when the resolved entitlement is `premium` AND the account tier is `plus` or `pro` (or the AI Upgrade add-on is active on the profile); `family` is excluded from the `premium` elevation. Free tier never reaches it (stays Mistral). — done when: `router.test.ts` asserts (a) a **Plus** rung-4 request → `{provider:'openai', model:'gpt-5.4', reasoningEffort:'medium'}`, (b) a **Family** rung-4 request → `{provider:'cerebras', model:'gpt-oss-120b', reasoningEffort:'high'}` (never gpt-5.4), under the flag; flag-off path unchanged.

- [ ] **T12: Fallback pairing for the new primaries** (with T9's allow-list). Ordered compliant preferences, **tier-aware** (each tier's secondary is its first fallback): **free** Cerebras primary → Mistral → Sonnet; **paid** Cerebras primary → GPT-5 mini → Sonnet; Mistral primary → GPT-5 mini → Sonnet; OpenAI primary → Anthropic (never Gemini for under-18); gpt-5.4 (rungs 4–5) → Sonnet. — done when: `router.fallback-compliance.test.ts` asserts the fallback target for each primary (incl. **free-Cerebras→Mistral** and **paid-Cerebras→GPT-5 mini**) and that the chain terminates at `null` (circuit-open), never an under-18-forbidden vendor.

- [ ] **T13: Integration + no-regress.** Run `pnpm exec nx test:integration api` and the full `api` unit suite. — done when: both green; the flag-off equivalence/routing snapshots unchanged (this spec must not regress current behavior while the flag is off).

## Tests

### Tests T2 — `refusal-envelope.test.ts`
```ts
import { normalizeModelRefusal } from './refusal-envelope';
import { parseEnvelope } from '../envelope';

it('returns null for a normal envelope string (no rewrite)', () => {
  expect(normalizeModelRefusal('{"reply":"Sure!","signals":{}}', 'en')).toBeNull();
});

it('rewrites a bare OpenAI refusal object into a parseable safe envelope', () => {
  const out = normalizeModelRefusal('{"type":"refusal"}', 'pl');
  expect(out).not.toBeNull();
  const env = parseEnvelope(out!);            // must not throw
  expect(typeof env.reply).toBe('string');
  expect(env.reply.length).toBeGreaterThan(0);
  expect(env.signals?.crisis_redirect).toBe(false);
});

it('localizes the decline by conversationLanguage, English fallback', () => {
  const pl = parseEnvelope(normalizeModelRefusal('{"type":"refusal"}', 'pl')!);
  const en = parseEnvelope(normalizeModelRefusal('{"type":"refusal"}', 'en')!);
  expect(pl.reply).not.toBe(en.reply);        // a Polish decline string exists
});
```
Decision baked in: a `DECLINE_BY_LANGUAGE: Record<ConversationLanguage, string>` constant holds a one-line polite decline + "let's get back to your topic" per locale (keys = the 10 `CONVERSATION_LANGUAGE_NAMES` codes), English as fallback for any unmapped code.

### Tests T3 — `cerebras.test.ts` (mock `global.fetch` only — external boundary)
```ts
it('posts to the Cerebras URL with bearer auth and reasoning_effort', async () => {
  mockFetch.mockResolvedValueOnce(okResponse('{"reply":"hi","signals":{}}', 'stop'));
  const p = createCerebrasProvider('test-key');
  await p.chat(MESSAGES, { provider: 'cerebras', model: 'gpt-oss-120b', maxTokens: 8192, reasoningEffort: 'high' });
  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toBe('https://api.cerebras.ai/v1/chat/completions');
  expect(opts.headers.Authorization).toBe('Bearer test-key');
  expect(JSON.parse(opts.body).reasoning_effort).toBe('high');
});

it('normalizes a bare {"type":"refusal"} response into a safe envelope', async () => {
  mockFetch.mockResolvedValueOnce(okResponse('{"type":"refusal"}', 'stop'));
  const r = await createCerebrasProvider('k').chat(MESSAGES,
    { provider: 'cerebras', model: 'gpt-oss-120b', maxTokens: 8192, conversationLanguage: 'pl' });
  expect(() => parseEnvelope(r.content)).not.toThrow();
});

it('maps finish_reason content_filter to SafetyFilterError', async () => {
  mockFetch.mockResolvedValueOnce(okResponse('', 'content_filter'));
  await expect(createCerebrasProvider('k').chat(MESSAGES, CFG)).rejects.toBeInstanceOf(SafetyFilterError);
});
```

### Tests T5 — `openai.test.ts` additions (mock `global.fetch` only)
```ts
it('maps gpt-5-mini through without the default-fallback warn', async () => {
  mockFetch.mockResolvedValueOnce(okResponse('{"reply":"hi"}', 'stop'));
  await createOpenAIProvider('k').chat(MESSAGES,
    { provider: 'openai', model: 'gpt-5-mini', maxTokens: 8192 });
  expect(JSON.parse(mockFetch.mock.calls[0][1].body).model).toBe('gpt-5-mini');
});

it('emits reasoning_effort when set, omits it when not', async () => {
  mockFetch.mockResolvedValue(okResponse('{"reply":"hi"}', 'stop'));
  await createOpenAIProvider('k').chat(MESSAGES,
    { provider: 'openai', model: 'gpt-5-mini', maxTokens: 8192, reasoningEffort: 'low' });
  expect(JSON.parse(mockFetch.mock.calls[0][1].body).reasoning_effort).toBe('low');

  await createOpenAIProvider('k').chat(MESSAGES,
    { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 8192 });
  expect('reasoning_effort' in JSON.parse(mockFetch.mock.calls[1][1].body)).toBe(false);
});
```

### Tests T9 — `router.fallback-compliance.test.ts` (the break test — HIGH severity)
```ts
// RED-GREEN: write this, watch it pass with the fix, revert getFallbackConfig
// to the old Gemini branch, watch it FAIL, restore. (Fix Development Rules.)
it('NEVER falls back to Gemini even when Gemini is the only other registered provider', () => {
  registerProvider(mockProvider('gemini'));
  registerProvider(mockProvider('cerebras'));
  const fb = getFallbackConfigForTest({ provider: 'cerebras', /*…*/ }, 1);
  expect(fb?.provider).not.toBe('gemini');
  expect(fb?.provider).not.toBe('vertex');
});

it('fails closed (null → circuit-open) when only forbidden vendors remain', () => {
  registerProvider(mockProvider('gemini'));        // only Gemini available
  const fb = getFallbackConfigForTest({ provider: 'cerebras', /*…*/ }, 1);
  expect(fb).toBeNull();                            // caller raises circuit-open
});

it('Cerebras primary falls back to GPT-5 mini, then Sonnet', () => {
  registerProvider(mockProvider('openai'));
  const fb = getFallbackConfigForTest({ provider: 'cerebras', /*…*/ }, 1);
  expect(fb?.provider).toBe('openai');
});
```

## Self-review notes

- **Spec coverage:** every §1.5 row maps to a task — all-tier primary gpt-oss (T3, T10), free secondary/vision Mistral (T4, T10, T12), paid secondary/vision GPT-5 mini (T5, T10, T12), gpt-5.4 @ medium rungs 4–5 Plus/Pro (T5 effort plumbing, T10, T11), Family-excluded→gpt-oss (T10, T11), Sonnet fallback (T12), async (T10). Compliance fix = T9. Refusal handler = T2/T3. Vendor wiring = T6–T8. Judge/gating modes explicitly deferred to a separate spec.
- **No deferred decisions:** model IDs (`gpt-oss-120b`, `mistral-small-2603`, `gpt-5-mini`, `gpt-5.4`), endpoints, `reasoning_effort` (Cerebras/OpenAI) vs `reasoning.effort` (OpenRouter), the rung-4 floor + medium effort for gpt-5.4, the **Family-tier exclusion from gpt-5.4** (Family rungs 4–5 → gpt-oss `high`; gpt-5.4 only for Plus/Pro/AI-Upgrade), the free-tier no-escalation rule, fail-closed behavior, and the decline-localization strategy are all pinned.
- **Name consistency:** `createCerebrasProvider`/`createMistralProvider`, `normalizeModelRefusal`, `FALLBACK_FORBIDDEN`, `LLM_ROUTING_V2_ENABLED`, `DECLINE_BY_LANGUAGE`, `gpt-5-mini`, `gpt-5.4` are used identically throughout.
- **Flag discipline:** all routing changes inert until `LLM_ROUTING_V2_ENABLED=true`; the Gemini-default path and its tests stay green throughout (no-regress).
```
