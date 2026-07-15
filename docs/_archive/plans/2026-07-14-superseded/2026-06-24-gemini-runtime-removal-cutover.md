---
title: Retire Gemini From Runtime — Phase B (Gated Cutover & Code Deletion) — Implementation Plan
date: 2026-06-24
profile: change
spec: docs/registers/llm-models/master.md
sibling: docs/plans/2026-06-24-remove-gemini-runtime-tooling.md
status: draft
---

# Retire Gemini From Runtime — Phase B (Gated Cutover & Code Deletion)

**Goal:** Make the Gemini-free V2 routing matrix the *only* runtime path and delete every importable Gemini/Vertex code path, so no production code can instantiate or select Gemini — then refresh docs/privacy/subprocessor references. **This is irreversible** (code deleted); it lands only after the cutover has proven stable.
**Approach:** Phase A (sibling plan) already made Gemini un-required and added the ratchet. The operator cutover (`LLM_ROUTING_V2_ENABLED=true`) has been live and stable in production for the agreed soak. Phase B removes the now-dead legacy path, the flag, the `gemini_only` policy, and the adapter; keeps `FALLBACK_FORBIDDEN` as cheap defense-in-depth; and shrinks the T-A1 ratchet baseline to the allowlist.

## Precondition Gate (T-B0 — must be satisfied before any T-B task)

- [ ] **T-B0 — Confirm cutover prerequisites.** **Done when** all of the following are recorded as evidence in the PR description (this is a decision/evidence gate, not code):
  1. `LLM_ROUTING_V2_ENABLED='true'` has been live in **production** continuously for the agreed soak window (default ≥ 7 days) with no Gemini-fallback or safety regression in observability.
  2. **H4** — the Haiku provider-side judge/provider-safety-net is **live** (not just the constraint shape). The register names this a hard prerequisite to Gemini leaving the live lane.
  3. **H5** — output-content moderation on the displayed reply is **live** (it was deferrable only while Gemini's classifier guarded the main lane).
  4. **H7** — safety-incident observability exists or the absence is explicitly risk-accepted by the owner.
  5. Cutover compliance contracts signed: Cerebras ZDR + no-training + executed DPA; OpenAI ZDR-for-minors; SCCs/TIA per the register's cutover-contracts gate.

  If any item is unmet, **stop** — Phase B does not land. Re-run Phase A's reversible state instead.

## Scope

In scope:
- `apps/api/src/services/llm/router.ts` — delete legacy `getModelConfig()`/`getFallbackConfig()` and the legacy↔V2 switch; promote the V2 functions to unconditional; remove `'gemini'` from `PreferredLlmProvider`; remove `'gemini_only'` from `LlmProviderPolicy`; **keep** `FALLBACK_FORBIDDEN`.
- `apps/api/src/config.ts` — delete the `LLM_ROUTING_V2_ENABLED` flag + accessor; make `productionRequiredLlmKeys()` unconditionally the V2 set; drop `GEMINI_API_KEY` from the schema.
- `apps/api/src/middleware/llm.ts` — remove the `createGeminiProvider` import + registration block.
- `apps/api/src/services/llm/index.ts` — drop the `createGeminiProvider` re-export.
- `apps/api/src/services/llm/providers/gemini.ts`, `gemini.test.ts` — **delete**.
- `apps/api/src/services/session/session-exchange-router.ts` — remove `providerPolicy: 'gemini_only'` and Gemini-named reason strings; encode the standard-tier constraint as `llmTier: 'standard'` (+ explicit fallback decision, T-B4).
- `apps/api/src/services/ocr.ts` — rename `GeminiOcrProvider` → `RouterVisionOcrProvider`; update factory + all importers.
- `apps/api/eval-llm/runner/llm-bootstrap.ts` — bootstrap approved providers only.
- `scripts/premium-routing-pass.ts`, `scripts/book-generation-pass.ts`, `scripts/provider-degradation-pass.ts`, `scripts/translate-gemini.ts` (+ `.test.ts`) — remove Gemini assumptions / `--allow-missing-gemini`; rename or delete Gemini-specific tooling.
- All affected `*.test.ts`; active docs under `docs/`, `apps/api/wrangler.toml`, privacy/store subprocessor worksheets; `scripts/no-gemini-runtime-baseline.json`.

Out of scope:
- Model-register admission changes (uses the already-admitted Mistral Small 4 / GPT-5 mini rows).
- Adding any provider not already admitted.
- `docs/_archive/**` (except a test fixture that explicitly references it).
- The Doppler key deletion itself (operator action; this PR makes the key unreferenced).

## Tasks

- [ ] **T-B1 — Promote V2 to the only path; delete the flag.** In `router.ts`, delete `getModelConfig()`/`getFallbackConfig()` (legacy) and the `LLM_ROUTING_V2_ENABLED` branch that chooses between them; rename `getModelConfigV2`/`getFallbackConfigV2` to the canonical names and call them unconditionally. In `config.ts`, delete the `LLM_ROUTING_V2_ENABLED` schema field + its accessor, and make `productionRequiredLlmKeys()` return the V2 set unconditionally. **Keep** `FALLBACK_FORBIDDEN = {gemini,vertex}` (router.ts:427) as defense-in-depth. **Done when:** no symbol named `getModelConfig`/`getFallbackConfig` (legacy) or `LLM_ROUTING_V2_ENABLED` remains in `apps/api/src`; `router.test.ts` covers default, preferred-provider, fallback, circuit-open, text, and vision paths with no Gemini registered; config tests prove prod boots on Cerebras+Mistral+OpenAI and there is no flag to set.

- [ ] **T-B2 — Remove the Gemini adapter and its registration.** Delete `providers/gemini.ts` + `gemini.test.ts`; remove the `createGeminiProvider` import + `if (geminiKey) registerProvider(...)` block from `middleware/llm.ts` (and the `geminiKey` read if now unused); drop the `createGeminiProvider` re-export from `services/llm/index.ts`. **Done when:** `createGeminiProvider` has zero references in the repo (outside the baseline-shrunk guard); middleware tests prove boot + registration with the approved providers only.

- [ ] **T-B3 — Remove `'gemini'` from the routing type surface.** Delete `'gemini'` from `PreferredLlmProvider` (router.ts:26) and `'gemini_only'` from `LlmProviderPolicy` (router.ts:27), after confirming (grep) no caller passes either literal post-T-B4. **Done when:** both unions compile without the Gemini member and the typecheck is green across `apps/api`.

- [ ] **T-B4 — Replace `gemini_only` in exchange routing, preserving the intended fallback semantics explicitly.** In `session-exchange-router.ts` the Plus/Premium-addon/Family standard-rung branches (lines 66/79/87) set `providerPolicy: 'gemini_only'`, which did two things: pin Gemini *and* suppress fallback (`getFallbackConfig` returned `null` under it). Removing the provider name is mechanical; the fallback behavior is a **decision the plan must make, not defer**:
  > **Decision:** under approved-provider routing the standard-tier constraint is expressed solely as `llmTier: 'standard'`, and standard-rung exchanges **may** fall back within the approved set `{cerebras, mistral, openai, anthropic}`. The prior no-fallback rule existed to prevent Gemini→non-Gemini data-locality drift and is obsolete now that every candidate is an admitted EU/compliant provider. If a no-fallback guarantee is still wanted for cost control, encode it as an explicit boolean option (`suppressFallback: true`) on `routeAndCall` — never as a provider name.
  Replace the `'family_standard_gemini_only'` and Plus/addon reason strings with provider-neutral tier/rung reasons. **Done when:** `session-exchange-router.test.ts` asserts the register-shaped tiers (`llmTier`) and neutral reason strings for Plus/Premium-addon/Family standard-rung, with no `gemini` substring in any output; if `suppressFallback` is adopted, a test pins that standard-rung suppresses fallback and advanced-rung does not.

- [ ] **T-B5 — Rename `GeminiOcrProvider` → `RouterVisionOcrProvider`.** Rename the class (ocr.ts:114), its factory mapping, and all importers; update `ocr.test.ts` so no mock returns `provider: 'gemini'`/`model: 'gemini-2.5-flash'` (use a representative approved provider, e.g. `provider: 'openai'`, `model: OPENAI_MINI_MODEL`). The tier-threading and key-decoupling were done in Phase A T-A4; this is the cosmetic rename only. **Done when:** `GeminiOcrProvider` has zero references; OCR tests pass with provider-neutral mocks.

- [ ] **T-B6 — Purge Gemini from evals and operational scripts.** Remove Gemini bootstrap/registration, `GEMINI_API_KEY` requirements, "Gemini setup status" prints, and `--allow-missing-gemini` from `eval-llm/runner/llm-bootstrap.ts`, `premium-routing-pass.ts`, `book-generation-pass.ts`, `provider-degradation-pass.ts`; rename/delete `translate-gemini.ts` (+ test). **Done when:** these tools run (or dry-run) against the approved-provider key set with no Gemini reference; if live validation needs a missing approved key, stop with explicit evidence of the absent key.

- [ ] **T-B7 — Shrink the ratchet baseline and refresh docs.** Run `pnpm check:no-gemini-runtime --accept` so the baseline shrinks to only the allowlisted survivors (the `FALLBACK_FORBIDDEN` line and the register); confirm the diff removes — never adds — baseline entries. Update active docs (`docs/architecture.md` LLM-routing/OCR sections, deploy/required-key docs, privacy/data-safety subprocessor lists, `apps/api/wrangler.toml`) so Gemini is no longer a required key, default provider, OCR provider, or live subprocessor; `docs/registers/llm-models/master.md` keeps Gemini/Vertex as an **excluded** vendor and adds a line that production code no longer has a Gemini route. **Done when:** the baseline contains only allowlisted entries; no active doc lists Gemini as live; the register's exclusion entry is intact and notes the code removal.

- [ ] **T-B8 — Full verification + deployment-checklist evidence.** **Done when:** targeted Jest passes for config, middleware, router (+ v2-matrix + fallback-compliance + policy-wiring), OCR, session-exchange routing, book-generation, and eval bootstrap; `pnpm test:llm:premium-routing` and `pnpm test:llm:book-generation` run or are explicitly blocked by a named missing live credential; `pnpm exec nx run api:typecheck` + `api:lint` green; `pnpm check:no-gemini-runtime` green. The change summary states code no longer references `GEMINI_API_KEY`, lists the replacement provider keys per environment, names the still-governing safety gates from the register, and confirms Doppler secret removal / flag deletion is an operator follow-up not performed by this PR.

## File Map

- `apps/api/src/services/llm/router.ts` — delete legacy config fns + flag branch; promote V2; trim both provider unions; keep `FALLBACK_FORBIDDEN`.
- `apps/api/src/config.ts` — delete `LLM_ROUTING_V2_ENABLED` + accessor + `GEMINI_API_KEY` schema field; unconditional V2 required keys.
- `apps/api/src/middleware/llm.ts` — remove Gemini import + registration.
- `apps/api/src/services/llm/index.ts` — remove `createGeminiProvider` re-export.
- `apps/api/src/services/llm/providers/gemini.ts` + test — **deleted**.
- `apps/api/src/services/session/session-exchange-router.ts` — neutral tier routing; explicit fallback decision (T-B4).
- `apps/api/src/services/ocr.ts` — class rename only.
- `apps/api/eval-llm/runner/llm-bootstrap.ts`, `scripts/*-pass.ts`, `scripts/translate-gemini.ts` — Gemini purge.
- Active docs + `wrangler.toml` + privacy worksheets; `scripts/no-gemini-runtime-baseline.json` — shrunk.

## Verification

- `pnpm --dir apps/api test -- config.test.ts src/middleware/llm.test.ts`
- `pnpm --dir apps/api test -- src/services/llm/router.test.ts src/services/llm/router.v2-matrix.test.ts src/services/llm/router.fallback-compliance.test.ts src/services/llm/router.policy-wiring.test.ts`
- `pnpm --dir apps/api test -- src/services/ocr.test.ts src/routes/homework.test.ts`
- `pnpm --dir apps/api test -- src/services/session/session-exchange.test.ts src/services/book-generation.test.ts`
- `pnpm --dir apps/api test -- eval-llm/runner/llm-client.test.ts`
- `pnpm test:llm:premium-routing`
- `pnpm test:llm:book-generation`
- `pnpm exec nx run api:typecheck` · `pnpm exec nx run api:lint`
- `pnpm check:no-gemini-runtime`

## Rollback Notes

- Code deletion is **not reversible** by a flag — rollback is `git revert` of the Phase B PR, which restores the adapter, the legacy path, and the `LLM_ROUTING_V2_ENABLED` flag (still defaulting off → legacy Gemini path). For this to be a viable rollback, the Gemini Doppler key must still exist at revert time; do not delete it until Phase B has itself soaked. No data is lost by the revert (routing-only change).
- `FALLBACK_FORBIDDEN` is intentionally retained after deletion: it is the standing prohibition-floor that keeps Gemini/Vertex unselectable even if a future provider row is mis-added.
- **Re-admission (one-way-door drain T9 note, 2026-07-15):** any future re-admission of Gemini/Vertex to runtime requires a new vetting row, a new policy row, and a fresh eval baseline — it is a new-provider onboarding, not a revert.
