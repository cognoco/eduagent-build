---
title: Suitability Judge — Phase 4 Increment 1 (post-display, calibration-first)
date: 2026-06-24
profile: code
adr: docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md
register: docs/registers/llm-models/master.md
status: draft
branch: llm-judge-framework (based on `ongoing`)
---

# Suitability Judge — Phase 4, Increment 1

**Goal:** Wire the scaffolded judge (`policy-engine/judge.ts`, currently returns
only a constraint shape) into a **running, post-display suitability judge** that
reviews tutor replies to learners and emits a structured verdict, **flag-gated
and migration-free**. This is `MMT-ADR-0016` §7 **phase 4** ("judge framework …
suitability judge runs **post-display first to calibrate flag rates**"), not the
phase-5 pre-display gating. No learner-visible behavior changes in this increment.

## Why post-display first (corrects the earlier "pre-display blocking" framing)

`MMT-ADR-0016` §7 sequences the rollout: **phase 4 = post-display judge to
calibrate**, **phase 5 = pre-display gating modes (S/G/F)** behind a measured
`p95 ≤ 3.5 s` latency criterion. Building post-display first means zero
user-facing latency risk, real flag-rate data before any gating decision, and a
clean fail-open posture (`safeSend`, non-core — a judge failure can never break
the learner's exchange). Pre-display gating is a later increment.

## Canon constraints this increment must honor

- **Vendor-independent of the tutor** (`MMT-ADR-0016` §2): judge routes to a
  different vendor than the tutor it evaluates. Default judge = Anthropic Haiku
  4.5 (`master.md` Judge row). Enforced, not assumed.
- **Non-reasoning** (§2): reasoning mode breaks the JSON envelope.
- **Coverage = judging is cheap** (§3): under-18 suitability sampling **1.0**;
  adults **sampled** (start 0.1). Coverage is never the risk-targeted variable.
- **Data minimization** (§2): judge receives the tutor reply + at most the
  immediately preceding learner message. Verdict stores **scores + category
  flags only — never conversation text**.
- **Over-blocking is a hard failure equal to under-blocking** (§1, §2.0): the
  rubric scores spurious refusal of a legitimate question as a defect.
- **Fail-open with alarm** (§5): judge error/timeout → no verdict, emit a
  `judge.degraded` structured metric; never throw into the exchange.
- **No app-owned denylist** (§1): the judge is an LLM rubric evaluation, not a
  word/keyword match.

## Scope

**In scope (Increment 1):**
- Verdict schema (`@eduagent/schemas`).
- Suitability judge service + model-agnostic rubric prompt.
- Profile resolution (sampling + gating-mode *label* by age; gating not enforced
  yet — stored for phase 5).
- Post-display dispatch (Inngest, `safeSend`, flag-gated) from the exchange
  completion path.
- Inngest handler that runs the judge and emits the verdict as a **structured
  metric/log** (queryable — the calibration signal).
- Config flag `JUDGE_FRAMEWORK_ENABLED` (default `false`).
- Full TDD test coverage.

**Out of scope (later increments — listed so reviewers don't expect them):**
- 1b: persistent `judge_verdicts` table + migration + the §4 **coverage
  reconciliation** job (deferred to avoid a DB migration during the identity /
  baseline-reset schema flux; calibration runs on metrics first).
- Phase 5: pre-display gating modes S/G/F + risk-promotion policy table (§3/§3.0).
- §2.1 T1 rolling classifier and streaming head-pass.
- Judge dashboards / self-tuning loop (§3 phase 6+).
- A dedicated `eval:llm` judge flow (1b — the judge rubric is a new prompt and
  wants its own eval flow; it is NOT in the tutor eval set, so this increment
  does not trip the tutor-prompt eval gate).

## File map

### New files
| File | Single responsibility |
|---|---|
| `packages/schemas/src/judge.ts` | `judgeVerdictSchema` (Zod) + `JudgeVerdict`, `JudgeFlagCategory`, `JUDGE_FLAG_CATEGORIES`. Scores 0–1, per-category boolean flags, `overall` enum. |
| `apps/api/src/services/policy-engine/judge-suitability.ts` | `runSuitabilityJudge(input): Promise<JudgeVerdict \| null>` — build prompt, route Haiku (flow `judge.suitability`, vendor-independent), parse verdict, fail-open. |
| `apps/api/src/services/policy-engine/judge-suitability-prompt.ts` | `buildSuitabilityJudgePrompt(input)` — model-agnostic rubric (categories + over-blocking-is-failure framing), data-minimized inputs only. |
| `apps/api/src/services/policy-engine/judge-profile.ts` | `resolveSuitabilityProfile(ageBracket)` → `{ sampling }` (coverage only; gating mode deferred to phase 5 — see Step 2); `shouldJudge(ageBracket, rng)` → boolean. |
| `apps/api/src/inngest/functions/judge-suitability.ts` | Inngest fn on `app/judge.suitability_requested` → `runSuitabilityJudge` → emit `judge.verdict` structured metric (scores/flags only). Mirror `ask-silent-classify.ts`. |
| co-located `*.test.ts` for each of the above | TDD tests. |

### Modified files
| File | Change |
|---|---|
| `apps/api/src/config.ts` | Add `JUDGE_FRAMEWORK_ENABLED: z.enum(['true','false']).default('false')` + `isJudgeFrameworkEnabled()` helper (mirror `isLlmRoutingV2Enabled` / the `IDENTITY_V2` `=== 'true'` guard at config.ts:154/176). |
| `apps/api/src/services/policy-engine/judge.ts` | Keep `resolveJudgeConfig`; `judge-suitability.ts` consumes its `vendorConstraint` to assert vendor-independence (no behavior change to the scaffold's exports). |
| `apps/api/src/services/session/session-exchange.ts` (and/or `exchanges.ts`) | After the reply is finalized (non-streaming: post-`processExchange` pre-return ~`:3088–3200`; streaming: `onComplete` path), call `dispatchSuitabilityJudge(...)` behind the flag. Mirror `emitCrisisRedirectEvent` (`exchanges.ts:77`). |
| Inngest event registry (the `EventSchemas` in `apps/api/src/inngest/client.ts`) | Type `app/judge.suitability_requested` (payload: reply, precedingLearnerMessage, ageBracket, profileId, sessionId, flow, tutorVendor, tutorModel, conversationLanguage). |
| Inngest functions registry (serve array) | Register `judgeSuitability`. Satisfies `orphan-dispatcher.guard` + `orphan-handler.guard` (this event has BOTH a dispatch and a handler — no `orphan-allow` needed). |

## Mocks (GC1/GC6 compliant)

Only true external boundaries are mocked: **`routeAndCall`** (the LLM boundary —
explicitly an allowed external-boundary mock per AGENTS.md) and the **Inngest
framework send**. All internal code (schema, profile, prompt builder, config,
dispatch gating) runs real. No `jest.mock('./…')` of internal modules.

## TDD sequence (red → green per unit)

> **Label note:** these `Step N` are this plan's own TDD test-steps. They are
> **unrelated** to the identity-foundation migration stages (`T1`–`T6`) and to
> `MMT-ADR-0016` §2.1's judge engine tiers ("T1 classifier" / "T2 deep judge").

**Step 1 — verdict schema** (`packages/schemas/src/judge.ts`)
- RED: valid verdict object parses; out-of-range score (`>1`) rejected; missing
  required category flag rejected; unknown `overall` value rejected.
- GREEN: minimal `z.object({ scores: z.record(z.number().min(0).max(1)),
  flags: z.object({ … per category … }), overall: z.enum(['ok','concern','violation']),
  rationale: z.string().max(N) })`. Export `JudgeVerdict`, `JUDGE_FLAG_CATEGORIES`.
- Barrel: add to `packages/schemas/src/index.ts`.

**Step 2 — profile / sampling** (`judge-profile.ts`)
- **`gatingMode` is deliberately NOT in this increment.** Spec §3 (routing+judge
  architecture) defines mode **S** = adults + minors *above* the digital-consent
  age, **G** = learners *under* the consent age, **F** = flagged/role-play/voice.
  S-vs-G for an adolescent (13–17) turns on the **per-jurisdiction digital-consent
  age (13–16 by country)**, which `resolveSuitabilityProfile(ageBracket)` does not
  receive — so a mode label cannot be faithfully derived from age bracket alone.
  Gating is phase-5 work (and is not enforced in increment 1 regardless), so the
  mode resolver is deferred to phase 5 where jurisdiction is in scope. Increment 1
  resolves only **sampling coverage**, which §3 (line 168) makes purely
  bracket-derivable: under-18 = 1.0 always (coverage is never the risk-targeted
  variable); adults sampled (start 0.1).
- RED: `resolveSuitabilityProfile('adolescent')` → `{ sampling: 1.0 }`;
  `'child'` → `{ sampling: 1.0 }`; `'adult'` → `{ sampling: 0.1 }`; **unknown/absent
  age (`null`/`undefined`) → conservative minor default (`{ sampling: 1.0 }`)**.
  `shouldJudge('adolescent', 0.99)` → true (coverage 1.0); `shouldJudge('adult',
  0.5)` → false (above the 0.1 sample); `shouldJudge('adult', 0.05)` → true;
  `shouldJudge(null, 0.99)` → true (minor default). (rng injected — no
  `Math.random()` in the pure fn so it stays deterministic/testable.)
- GREEN: minimal lookup keyed on the `AgeBracket` union (`@eduagent/schemas`);
  `shouldJudge = rng < resolveSuitabilityProfile(bracket).sampling`.

**Step 3 — rubric prompt** (`judge-suitability-prompt.ts`)
- **Data-min is structural, not a runtime leak test.** `buildSuitabilityJudgePrompt`'s
  typed input accepts ONLY `reply`, `precedingLearnerMessage`, `ageBracket`, and an
  optional `conversationLanguage` — there is physically no extra-history field to
  pass, so a "pass an extra field, assert absent" check would be vacuous. The
  guarantee is enforced by the type, and the builder never receives IDs/metadata
  (those ride in `routeAndCall` options, not the prompt). Output is `ChatMessage[]`
  (system rubric + user payload) to match `routeAndCall(messages, …)`.
- RED (meaningful, non-vacuous):
  - prompt includes the tutor reply text;
  - prompt includes the preceding learner message text;
  - prompt references **every** `JUDGE_FLAG_CATEGORIES` entry (coupling test — a new
    schema category that the rubric forgets fails here);
  - prompt carries the over-blocking-is-a-hard-failure-equal-to-under-blocking framing;
  - prompt instructs the exact verdict JSON (`overall` / `flags` / `rationale`) so
    Step 4 can parse it with `judgeVerdictSchema`;
  - prompt frames the learner's age band;
  - `precedingLearnerMessage: null` still builds (states there is none; no literal
    `"null"`/`"undefined"`);
  - prompt contains **NO** vendor/model token (model-agnostic — asserts none of
    haiku/anthropic/claude/gpt/openai/cerebras/gpt-oss/gemini/google/mistral/deepseek).
- GREEN: minimal template producing those strings.

**Step 4 — judge service** (`judge-suitability.ts`) — mock `routeAndCall` via the
`../llm` barrel (`jest.requireActual` + `routeAndCall: jest.fn()`, the blessed
external-boundary pattern; `/* gc1-allow: pattern-a conversion */`).
- **Vendor-independence is load-bearing, not assumed.** `selectJudgeProvider(tutorVendor)`
  reads `resolveJudgeConfig({ tutorVendor }).vendorConstraint` (`!<vendor>`), then
  prefers Anthropic (Haiku, master.md) but falls to OpenAI when Anthropic is the
  excluded vendor. Never Gemini (under-18 + judge-vendor constraint). This makes the
  scaffold's constraint drive the pick, so the break-test exercises a reachable path.
- **Degraded handling split:** the service LOGS a structured degraded warning and
  returns `null` on any failure (route throw / no JSON / schema miss). The
  `judge.degraded` *metric event* is emitted by the Step-5 handler off the `null`
  return — keeping the service free of Inngest/metric infra and unit-testable with
  only the LLM boundary mocked.
- RED:
  - stub LLM returns a valid verdict JSON (even fence-wrapped / prose-wrapped) →
    returns the parsed `JudgeVerdict`; `routeAndCall` called with
    `flow: 'judge.suitability'`, `responseFormat: 'json'`, and the age bracket.
  - `selectJudgeProvider`: `'anthropic'` tutor → `'openai'`; `'openai'` tutor →
    `'anthropic'`; `'cerebras'`/`'google'` tutor → `'anthropic'` (vendor-independent,
    never the tutor's vendor, never gemini). And `routeAndCall`'s `preferredProvider`
    matches for a cerebras tutor (`'anthropic'`) and an anthropic tutor (`'openai'`).
  - LLM throws → returns `null`, **no throw** (fail-open), degraded logged.
  - LLM returns a body with no JSON object → returns `null`.
  - LLM returns JSON that fails `judgeVerdictSchema` (e.g. `ok` with flags) → `null`.
- GREEN: minimal implementation — `buildSuitabilityJudgePrompt` → `routeAndCall` →
  `extractFirstJsonObject` → `JSON.parse` → `judgeVerdictSchema.safeParse`.

**Step 5 — Inngest handler** (`functions/judge-suitability.ts`) — mock `routeAndCall`
- RED: invoking the handler with a `app/judge.suitability_requested` event runs
  `runSuitabilityJudge` and emits a `judge.verdict` metric carrying scores/flags +
  `{profileId, ageBracket, flow, tutorModel, conversationLanguage}` — and
  **asserts the reply/learner text is NOT in the emitted metric** (data-min).
  Verdict `null` (degraded) → emits `judge.degraded`, no `judge.verdict`.
- GREEN: minimal handler mirroring `ask-silent-classify.ts`.

**Step 6 — dispatch gating** (`dispatchSuitabilityJudge` in session-exchange/exchanges)
  — mock the Inngest `send`
- RED: flag-off → no send (even for under-18). flag-on + under-18 → exactly one
  send; payload carries reply + preceding message only. flag-on + adult + rng
  above sample → no send; adult + rng below sample → send. Dispatch uses
  `safeSend` (a send failure does not throw into the exchange — break-test:
  send rejects, exchange result still returns).
- GREEN: minimal gated dispatch behind `isJudgeFrameworkEnabled()`.

## Verification gates (before "done")

- `pnpm exec nx run api:typecheck` + `nx run api:lint` (worktree).
- `pnpm exec nx run api:test` for the new/touched suites (and the two Inngest
  guard suites — `orphan-dispatcher.guard`, `orphan-handler.guard` — must stay green).
- `packages/schemas` typecheck/test for the new schema.
- No internal `jest.mock`; PostToolUse mock-check clean.
- Flag defaults `false` → zero behavior change proven by an exchange test that
  asserts no dispatch when the flag is unset.

## Rollout

Flag `JUDGE_FRAMEWORK_ENABLED=false` everywhere on merge. Calibration starts by
flipping it `true` in **staging** only, watching `judge.verdict` / `judge.degraded`
metrics to calibrate flag rates, before any phase-5 gating work. Production stays
off until the vendor/DPA gates in `master.md` (Open gates) clear.
