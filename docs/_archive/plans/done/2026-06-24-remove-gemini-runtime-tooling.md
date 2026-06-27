---
title: Retire Gemini From Runtime — Phase A (Make Gemini Unused & Unrequired) — Implementation Plan
date: 2026-06-24
profile: change
spec: docs/registers/llm-models/master.md
sibling: docs/plans/2026-06-24-gemini-runtime-removal-cutover.md
status: draft
---

# Retire Gemini From Runtime — Phase A (Make Gemini Unused & Unrequired)

**Goal:** Make every LLM/OCR role fully servable by the admitted providers (Cerebras, Mistral, OpenAI, Anthropic) so production can boot and run with **no `GEMINI_API_KEY`**, and stop *new* Gemini coupling with a forward-only guard — **without deleting any Gemini code, removing the `LLM_ROUTING_V2_ENABLED` flag, flipping any flag, or touching Doppler.** Reversible by construction.
**Approach:** Gemini-free routing already exists and is tested — it is the `getModelConfigV2`/`getFallbackConfigV2` matrix plus the `FALLBACK_FORBIDDEN = {gemini,vertex}` enforcement (`apps/api/src/services/llm/router.ts:427`), inert behind `LLM_ROUTING_V2_ENABLED` (build-time, default `false` in stg+prod). Phase A does **not** re-derive that in the legacy path. Instead it (1) makes the production boot-key requirement and the OCR provider-selection track the *active* routing path instead of hard-wiring Gemini, (2) ensures the legacy path degrades to approved providers when no Gemini provider is registered, and (3) adds a ratchet guard. After Phase A, the cutover is a single reversible operator action — flip `LLM_ROUTING_V2_ENABLED=true` (see Gate, below) — and `GEMINI_API_KEY` can then be removed from Doppler as defense-in-depth.

## Phasing & Gate (read first)

This replaces the original single-PR plan, which fused a reversible "make Gemini unused" change with an irreversible "delete Gemini and collapse the legacy path" change. They are now two plans:

| | Phase A (this doc) | Cutover (operator) | Phase B (sibling doc) |
|---|---|---|---|
| **What** | Make Gemini un-required; cover all roles on approved providers; add guard | Flip `LLM_ROUTING_V2_ENABLED=true`; optionally remove Gemini Doppler key after soak | Delete adapter + legacy path + flag; purge Gemini names; refresh docs |
| **Reversible?** | Yes (no deletion) | Yes (flip back / re-add key) | No (code deleted) |
| **Gated on** | Nothing — ship now | **H4 Haiku judge live + H5 output moderation live + Cerebras/OpenAI compliance contracts signed** (`docs/registers/llm-models/master.md` open gates) | Cutover live & stable in prod for the agreed soak window |

**Why the gate sits on the cutover, not on Phase A:** the register states "removing Gemini deletes the only configured provider-side classifier" — so Gemini may not leave the *live* lane until the **H4** (Haiku provider-side judge) and **H5** (output-content moderation) replacements are live. Phase A keeps Gemini live (legacy path unchanged when a Gemini key is present), so it is ungated. The flag flip is the moment Gemini leaves the live lane; it inherits the gate. Phase B only deletes code after the flag-flipped state has proven stable.

Sibling plan: `docs/plans/2026-06-24-gemini-runtime-removal-cutover.md`.

## Scope

In scope:
- `apps/api/src/config.ts` — production-required-keys logic + its tests.
- `apps/api/src/config.test.ts`
- `apps/api/src/middleware/llm.ts` — boot provider-readiness gate (registration is already conditional; do not change it).
- `apps/api/src/middleware/llm.test.ts`
- `apps/api/src/services/llm/router.ts` — **only** the no-Gemini-registered degradation branches of `getModelConfig()`/`getFallbackConfig()` (additive; behavior when Gemini IS registered must not change).
- `apps/api/src/services/llm/router.test.ts`
- `apps/api/src/services/ocr.ts` — decouple provider selection from `GEMINI_API_KEY`; thread `llmTier`; fix stale error string.
- `apps/api/src/routes/homework.ts` — stop threading `c.env.GEMINI_API_KEY` into OCR; pass the request's subscription tier.
- `apps/api/src/services/ocr.test.ts`, `apps/api/src/routes/homework.test.ts`
- New: `scripts/check-no-gemini-runtime.ts`, `scripts/no-gemini-runtime-baseline.json`, `package.json` script wiring.

Out of scope (these are Phase B):
- Deleting `apps/api/src/services/llm/providers/gemini.ts` or its registration/import.
- Removing the `LLM_ROUTING_V2_ENABLED` flag or collapsing the legacy↔V2 dual path.
- Removing `'gemini'` from `PreferredLlmProvider` (router.ts:26) or `'gemini_only'` from `LlmProviderPolicy` (router.ts:27).
- Renaming `GeminiOcrProvider` → `RouterVisionOcrProvider`.
- Eval/script Gemini removal (`premium-routing-pass.ts`, `book-generation-pass.ts`, `provider-degradation-pass.ts`, `translate-gemini.ts`).
- Doc/privacy/subprocessor edits; Doppler secret deletion; any flag flip.

## Tasks

- [ ] **T-A1 — Forward-only Gemini ratchet guard.** Add `scripts/check-no-gemini-runtime.ts` scanning `apps/api/src/**` (incl. `*.test.ts`) and `scripts/**` for the tokens `provider: 'gemini'`, `preferredProvider: 'gemini'`, `'gemini_only'`, `gemini-2.5`, `createGeminiProvider`, `GEMINI_API_KEY`, and imports of `providers/gemini`. It records current occurrences in `scripts/no-gemini-runtime-baseline.json` keyed on `{file, token}` (NOT line number — reformatting must not churn it, mirroring `scripts/i18n-jsx-literals-baseline.json`). CI fails only on occurrences **absent from the baseline**. `--accept` refreshes the baseline (Phase B uses it to shrink). **Hard allowlist (never counted, never in baseline):** the `FALLBACK_FORBIDDEN` definition line in `router.ts:427` (the enforcement that *keeps* Gemini out literally contains the token), `docs/registers/llm-models/master.md` (must keep naming Gemini as the excluded vendor), and `docs/_archive/**`. Wire `pnpm check:no-gemini-runtime` in `package.json`. **Done when:** adding a stray `provider: 'gemini'` to any runtime file fails the guard; the current tree passes; `FALLBACK_FORBIDDEN` and the register do not appear in the baseline; `pnpm check:no-gemini-runtime` runs green on HEAD.

- [ ] **T-A2 — Make the production-required key set track the active routing path.** Today `PRODUCTION_REQUIRED_KEYS` (`config.ts:366`) hard-requires `GEMINI_API_KEY`, so prod cannot boot without it even when V2 is on and Gemini is never selected. Replace the static array with a path-aware computation: the LLM key(s) required depend on which routing path is live.
  ```ts
  // config.ts — non-LLM required keys stay static.
  const PRODUCTION_REQUIRED_BASE_KEYS = [
    'VOYAGE_API_KEY',
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'API_ORIGIN',
    'REVENUECAT_WEBHOOK_SECRET',
  ] as const satisfies readonly (keyof Env)[];

  // The LLM provider keys the *active* routing path needs to boot.
  // V2 (Gemini-free matrix): Cerebras = universal text primary, Mistral =
  // free/secondary + free-tier vision, OpenAI = paid vision (GPT-5 mini) + EU branch.
  // Legacy (flag off): Gemini is still the default primary, so it stays required.
  function productionRequiredLlmKeys(env: Env): readonly (keyof Env)[] {
    // Use the existing LLM_ROUTING_V2_ENABLED accessor in this file.
    return isLlmRoutingV2Enabled(env)
      ? ['CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY']
      : ['GEMINI_API_KEY'];
  }
  ```
  Use the exact `keyof Env` identifiers from the config schema for the three V2 keys; if any is not yet in `Env`, add it as `z.string().min(1).optional()` (parse-optional; required-ness is enforced only here, exactly as `GEMINI_API_KEY` is today). The production loop validates `[...PRODUCTION_REQUIRED_BASE_KEYS, ...productionRequiredLlmKeys(env)]`. **Done when:** `config.test.ts` proves (a) with `LLM_ROUTING_V2_ENABLED='true'` + Cerebras+Mistral+OpenAI keys and **no** `GEMINI_API_KEY`, production validation passes; (b) with the flag off and no `GEMINI_API_KEY`, validation still fails (legacy path unchanged); (c) the existing PROD_ENV fixture is updated to satisfy whichever branch each test exercises.

- [ ] **T-A3 — Widen the boot provider-readiness gate to the approved providers.** `middleware/llm.ts:124` gates boot on `geminiKey || openaiKey || anthropicKey`, omitting Cerebras and Mistral — so a Gemini-free deployment whose text primary is Cerebras and vision is Mistral would fail the boot gate even with working providers. Change the gate to count any admitted provider:
  ```ts
  const hasAnyProvider = cerebrasKey || mistralKey || openaiKey || anthropicKey || geminiKey;
  ```
  Provider *registration* (the conditional `if (geminiKey) registerProvider(createGeminiProvider(...))` block at `llm.ts:99-101`) is unchanged — Gemini still registers when present. **Done when:** `llm.test.ts` proves boot succeeds in prod/staging with only Cerebras+Mistral keys registered (no Gemini/OpenAI/Anthropic), and still fails when *no* provider key is present.

- [ ] **T-A4 — Decouple OCR from the Gemini key and make its vision tier real.** Two coupled defects: (i) `routes/homework.ts:127` passes `c.env.GEMINI_API_KEY` as the `useRouter` truthy signal to `getOcrProvider()`, so removing the key would disable OCR; (ii) `ocr.ts:131` calls `routeAndCall(messages, 1, { flow: 'ocr.extract' })` with **no `llmTier`**, so the vision role always resolves at the `'standard'` default and the free-tier mapping never fires.
  - In `getOcrProvider()` base the router-vs-stub decision on whether the LLM provider registry has any approved provider (or simply always return the router-backed provider in non-test paths), not on `GEMINI_API_KEY`. Update `homework.ts:127` to call `getOcrProvider()` without the Gemini key.
  - Thread the request's subscription tier from the homework route into `extractText()` and on into the call: `routeAndCall(messages, 1, { flow: 'ocr.extract', llmTier })`, where `llmTier` is `'flash'` for free and the paid tier otherwise (use the same tier mapping the session/exchange routing already uses for this user).
  - Replace the stale error string at `ocr.ts:185` (`'... set GEMINI_API_KEY or use allowStub ...'`) with provider-neutral wording (`'OCR provider not configured: no approved LLM provider registered; use allowStub for testing'`).
  **Done when:** `ocr.test.ts` / `homework.test.ts` prove OCR succeeds with **no** `GEMINI_API_KEY` when an approved provider is registered; a free-tier homework OCR call routes (via the V2 vision matrix) to `provider: 'mistral'`/`MISTRAL_SECONDARY_MODEL` and a paid-tier call to `provider: 'openai'`/`OPENAI_MINI_MODEL`; no test mock hardcodes `provider: 'gemini'` for OCR.

- [ ] **T-A5 — Make the legacy path degrade to approved providers when no Gemini is registered.** So `GEMINI_API_KEY` can be removed without 500-ing the flag-off path, audit the legacy `getModelConfig()`/`getFallbackConfig()` branches that select Gemini when it *is* registered (e.g. `router.ts:571`, `router.ts:616`). For each, confirm a no-Gemini-registered branch already returns an approved-provider config; where it returns Gemini unconditionally or throws, add an additive fallback to the approved primary (Cerebras text; Mistral/OpenAI vision per the V2 matrix). **Behavior when a Gemini provider IS registered must not change** — this task only adds the absent-provider path. **Done when:** `router.test.ts` proves that with no Gemini provider registered and `LLM_ROUTING_V2_ENABLED` off, `getModelConfig()` (default, preferred-provider, `gemini_only` policy) and `getFallbackConfig()` never return `provider: 'gemini'` and return a registered approved provider; and that with Gemini registered the existing assertions are unchanged.

- [ ] **T-A6 — Local verification.** **Done when:** targeted Jest passes for `config.test.ts`, `middleware/llm.test.ts`, `router.test.ts` (+ `router.v2-matrix.test.ts`, `router.fallback-compliance.test.ts` if affected), `ocr.test.ts`, `routes/homework.test.ts`; `pnpm exec nx run api:typecheck` and `pnpm exec nx run api:lint` are green; `pnpm check:no-gemini-runtime` is green. If a live-LLM check is blocked by a missing approved-provider key, stop with explicit evidence of which key is absent — never weaken the test.

## File Map

- `apps/api/src/config.ts` — replace static `PRODUCTION_REQUIRED_KEYS` with `PRODUCTION_REQUIRED_BASE_KEYS` + `productionRequiredLlmKeys(env)`; no schema field deleted (Gemini stays parse-optional).
- `apps/api/src/middleware/llm.ts` — widen `hasAnyProvider` to include Cerebras/Mistral; registration block untouched.
- `apps/api/src/services/ocr.ts` — provider selection no longer keys on `GEMINI_API_KEY`; `extractText()` forwards `llmTier`; error string neutralized.
- `apps/api/src/routes/homework.ts` — drop `GEMINI_API_KEY` arg; pass subscription tier into OCR.
- `apps/api/src/services/llm/router.ts` — additive no-Gemini-registered degradation branches only; `FALLBACK_FORBIDDEN` and all V2 code untouched.
- `scripts/check-no-gemini-runtime.ts` + `scripts/no-gemini-runtime-baseline.json` — forward-only ratchet with the T-A1 allowlist.

## Verification

- `pnpm --dir apps/api test -- config.test.ts src/middleware/llm.test.ts`
- `pnpm --dir apps/api test -- src/services/llm/router.test.ts`
- `pnpm --dir apps/api test -- src/services/ocr.test.ts src/routes/homework.test.ts`
- `pnpm exec nx run api:typecheck`
- `pnpm exec nx run api:lint`
- `pnpm check:no-gemini-runtime`

## Rollout Notes

- Phase A changes **nothing** observable while a Gemini key is present and `LLM_ROUTING_V2_ENABLED` is off: the legacy path still selects Gemini exactly as today. It only adds the absent-key/approved-provider paths and the ratchet.
- **Do not** flip `LLM_ROUTING_V2_ENABLED` or remove the Gemini Doppler key inside this PR. Those are the operator cutover, gated on the H4/H5 prerequisites in `docs/registers/llm-models/master.md`.
- After Phase A merges and the gate clears: operator flips `LLM_ROUTING_V2_ENABLED=true` (reversible), soaks, then optionally removes `GEMINI_API_KEY` from Doppler (now reversible — re-adding it restores the prior path). Only after that soak does Phase B delete code.
