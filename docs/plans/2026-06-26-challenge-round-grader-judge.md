---
title: Challenge Round Grader — judge-emitted mastery signal — Implementation Plan
date: 2026-06-26
profile: code
work_items: []          # create a Cosmo WI before execution (see § Execution note)
spec: docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md   # design canon this realizes
status: draft
---

# Challenge Round Grader — judge-emitted mastery signal — Implementation Plan

**Goal:** Make Challenge Round mastery verification work under the V2 go-forward
tutor (gpt-oss-120b @ Cerebras) by sourcing the `challenge_round_evaluation`
signal from a **separate, single-purpose grader call on the Haiku judge** instead
of from the tutor's inline envelope — which gpt-oss silently drops.

**Approach:** Realize the **judge** role that `MMT-ADR-0016 §2` already ratifies
(the judge, not the tutor, emits the structured evaluation; vendor-independent of
the tutor; non-reasoning). Add a callable judge routing role (advancing open gate
**H4**), a narrow grader service modeled on the existing `runSuitabilityJudge`, and
swap the *source* of the evaluation array in `applyChallengeRoundRuntimeSignals`
from the tutor envelope to the grader. **The grader model is a config-selected,
eval-validated parameter — not a baked-in choice.** We default to the *stronger*
candidate (Sonnet 4.6 non-reasoning) and let the eval demote to a cheaper model
(Haiku) only if it earns it; the role is model-agnostic, so the occupant is a
one-line swap with a vetting record (register data, not architecture).
Everything is behind a dedicated `CHALLENGE_ROUND_GRADER_ENABLED` flag (default
off) so it can be validated on staging against the real V2 tutor before any
cutover. The server keeps owning `answerEventId` (deterministic injection) and the
existing conservative mastery gate (`decideMasteryAndReview`) is untouched.

---

## Background & decision

**The blocker (memory `project_gptoss_drops_challenge_eval_signal`):** in an active
Challenge Round the mastery pipeline reads `signals.challenge_round_evaluation`
inline from the tutor's exchange envelope. gpt-oss-120b returns `[]` on every turn
and just asks the next question. The server fails **safe** (empty → `outcome:
'invalid'`, never marks mastery, no error/Sentry), so on a V2 cutover mastery
silently never verifies for every learner. Today's production rides the legacy path
→ Gemini, which emits the signal — but Gemini is barred for under-18s and is being
excluded for everyone (master register § Excluded), so the gap becomes load-bearing
at cutover. Adding the field to the JSON template + "you MUST include it" guidance
did **not** fix it (gpt-oss returned `[]` 0/3): a genuine model instruction-following
gap, not a prompt-template bug.

**Why not "just force gpt-oss":** Cerebras supports strict `json_schema` constrained
decoding, which *would* force a non-empty field. But the challenge-round turn is a
single call that must produce both the conversational reply **and** the grading
array; forcing a strict schema over that whole polymorphic envelope risks
constraining the conversational output (the one thing gpt-oss already does well —
teaching scored 55/55, misconception-repair 3/3 in the eval) and needs a
challenge-round-only envelope variant. We pull the cleaner lever instead.

**The decision (this plan realizes `MMT-ADR-0016 §2`, not a new architecture):**
ADR-0016 already glosses the **judge** as *"the post-generation evaluator that emits
the structured response envelope,"* vendor-independent and non-reasoning. Our tutor
emitting signals inline is the *gap vs. canon*; the fix is to move the
`challenge_round_evaluation` signal's emission from the tutor to a judge call. This:

- **Decouples teach from grade** — gpt-oss keeps converse-only (unconstrained, proven
  quality); a dedicated judge does the narrow structured-grading task.
- **Honors the ratified judge role — but must *enforce*, not assume, vendor-independence.**
  The judge is non-reasoning and must not share a vendor with the tutor (ADR-0016 §2).
  **Correction (code-verified):** `selectJudgeProvider(tutorVendor)` (`policy-engine/judge-suitability.ts:54`)
  is the existing enforcer — it returns `'openai'` when the tutor is anthropic, else
  `'anthropic'`, never gemini. The new grader path in this plan **hardcodes `provider:'anthropic'`**,
  which satisfies §2 *only because the V2 tutor is Cerebras today* — nothing structural
  stops a future anthropic tutor from silently sharing the grader's vendor. T3 therefore
  routes the grader provider **through `selectJudgeProvider(tutorVendor)`** (or, at minimum,
  asserts resolved-grader-vendor ≠ active-tutor-vendor with a break test) so §2 is enforced,
  not coincidental. The *model* within the role is eval-selected (below), not assumed.
- **Advances open gate H4.** Per `master.md:118-120`, gate H4 is *scaffold only*:
  `policy-engine/judge.ts:44` (`resolveJudgeConfig`) returns the constraint shape, not a
  callable model. **Correction (code-verified):** a callable judge *already exists* —
  `runSuitabilityJudge` (`judge-suitability.ts:65`) routes via rung-1 +
  `preferredProvider:'anthropic'`, which resolves to **Sonnet 4.6, not Haiku** (confirmed:
  `getPreferredProviderConfig` → `ANTHROPIC_SONNET_MODEL = 'claude-sonnet-4-6'`,
  router.ts:347; no Haiku model constant exists in the router). So this plan does **not**
  build "the first callable judge" — it builds the first **tier/age-blind judge *capability*
  routing path** (ignores tier/age/region per §2), which the suitability judge can later adopt.

**Do not assume any single grader model — that is the gpt-oss mistake repeated.**
There is **no eval evidence** that Haiku (or any model) reliably emits *this* signal;
the routing canon even flags Haiku-in-reasoning-mode breaking JSON 4/6 (non-reasoning
was chosen to avoid it, but that is a general-judge observation, not a grading-task
measurement). Two quality axes must be measured, not inferred: **(1) format** — emits a
non-empty, schema-valid array at all; **(2) judgment** — grades *correctly* (a clean-JSON
but over-generous "solid" would *falsely* verify mastery, the inverse failure). A
stronger model helps both. Therefore: **default the grader to the stronger candidate
(Sonnet 4.6 non-reasoning), bake-off candidates on both axes (T10), and demote to a
cheaper model (Haiku) only if it passes clean.** What makes this safer than the stuck
gpt-oss path regardless of model: the call is single-purpose (no conversation crowding
out the output), the server injects `answerEventId` and asks only for judgment fields,
and the server fail-safe + degraded-metric (T5) make any wobble visible instead of
silent. Escalation lever if even Sonnet wobbles on format: OpenAI/Cerebras native strict
`json_schema` (structural format-lock) or Anthropic forced tool-calling (Risks).

---

## Scope

In scope:
- `packages/schemas/src/llm-envelope.ts` — grader-output verdict schema (+ barrel export in `packages/schemas/src/index.ts`)
- `apps/api/src/config.ts` — `CHALLENGE_ROUND_GRADER_ENABLED` flag + helper
- `apps/api/src/services/llm/router.ts` — tier/age-blind judge *capability* routing path → default **Sonnet 4.6** non-reasoning (model-swappable via `GRADER_MODEL`; bake-off T10)
- `apps/api/src/services/challenge-round/grader-prompt.ts` — grader rubric prompt (new)
- `apps/api/src/services/challenge-round/grader.ts` — grader service (new)
- `apps/api/src/services/session/session-exchange.ts` — swap evaluation source in the active branch; plumb the asked-question; terminal safeguard
- `apps/api/src/services/exchange-prompts.ts` + `apps/api/src/services/challenge-round/prompts.ts` — suppress tutor inline emission when the flag is on
- `apps/api/eval-llm/` — Tier-2 grader eval flow
- `docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md` + `docs/registers/llm-models/master.md` — amendment + H4 status

Out of scope (must not change):
- `apps/api/src/services/challenge-round/evaluation.ts` — `decideMasteryAndReview` / `validateEvaluationEventIds` stay byte-identical (the conservative gate is correct; we only change the *source* of its input)
- The legacy/Gemini routing path and the flags-off behavior — unchanged; grader is off by default
- The challenge-round state schema (`challengeRoundSessionStateSchema`) — no structural concept capture in this plan (deferred hardening, see Risks)
- `MAX_CHALLENGE_QUESTIONS` and the offer/accept/decline flow

---

## File map (surface)

| File | New/Change | Single responsibility |
|---|---|---|
| `packages/schemas/src/llm-envelope.ts` | change | `challengeRoundGraderVerdictSchema` — what the grader model returns (judgment fields only, no `answerEventId`) |
| `packages/schemas/src/index.ts` | change | export the new schema + type |
| `apps/api/src/config.ts` | change | `CHALLENGE_ROUND_GRADER_ENABLED` + `isChallengeRoundGraderEnabled()` |
| `apps/api/src/services/llm/router.ts` | change | `GRADER_MODEL` const (default Sonnet 4.6) + judge routing role, non-reasoning, reachable from `routeAndCall` |
| `apps/api/src/services/challenge-round/grader-prompt.ts` | new | build the grader rubric messages from (asked question, learner answer, language, age) |
| `apps/api/src/services/challenge-round/grader.ts` | new | `runChallengeRoundGrader()` — call judge, parse verdict, inject `answerEventId`, fail-open→empty |
| `apps/api/src/services/session/session-exchange.ts` | change | source evaluation from grader under the flag; plumb asked-question; terminal safeguard |
| `apps/api/src/services/exchange-prompts.ts` | change | omit the `challenge_round_evaluation` field from the tutor envelope when grader is on |
| `apps/api/src/services/challenge-round/prompts.ts` | change | omit the "emit signals.challenge_round_evaluation" prose when grader is on |
| `apps/api/eval-llm/<flow>` | new | Tier-2 live eval: grader emits non-empty across all four results; bake-off across candidate models (T10) |
| `docs/adr/MMT-ADR-0016-...md`, `docs/registers/llm-models/master.md` | change | record the tutor→judge signal migration + H4 progress |

---

## Tasks

- [ ] **T1: Grader-output verdict schema.** In `packages/schemas/src/llm-envelope.ts`,
  add `challengeRoundGraderVerdictSchema` next to `challengeRoundEvaluationItemSchema`.
  Shape: `z.object({ items: z.array(graderItem).min(1).max(10) })` where `graderItem`
  is `challengeRoundEvaluationItemSchema` **omitting `answerEventId`** (the server
  injects it) — i.e. `{ concept, result, evidence, learnerQuote, correction? }`.
  Export the schema + inferred type from `packages/schemas/src/index.ts`.
  **done when:** `packages/schemas` unit test `llm-envelope.test.ts` asserts (a) a
  one-item verdict parses, (b) `items: []` **fails** `.min(1)`, (c) the type has no
  `answerEventId` key (compile-time `// @ts-expect-error` probe). `pnpm exec nx test shared-schemas` green.

- [ ] **T2: Grader feature flag.** In `apps/api/src/config.ts` add
  `CHALLENGE_ROUND_GRADER_ENABLED: z.enum(['true','false']).default('false')` and an
  `isChallengeRoundGraderEnabled(raw?: string): boolean` helper mirroring
  `isLlmRoutingV2Enabled`. The flag is **independent of `LLM_ROUTING_V2_ENABLED`** so
  the grader can be validated on staging against the gpt-oss tutor before the full V2
  cutover.
  **done when:** `config.test.ts` asserts default-false and `'true'`→true; `pnpm exec nx run api:typecheck` green.

- [ ] **T3: Tier/age-blind judge *capability* routing path (non-reasoning, model-swappable).** In
  `apps/api/src/services/llm/router.ts` define a **single grader-model constant**
  `export const GRADER_MODEL = 'claude-sonnet-4-6';` (default to the stronger
  candidate; demotion to a Haiku model after T10 is a one-line edit — **note: no Haiku
  model constant exists in the router today (verified, router.ts:334-411); adding one is
  part of the demotion edit, not free**).
  **Capability-union change (verified):** `LlmCapability` is currently `'text' | 'vision'`
  and `routeAndCall` has **no public `capability` option** (capability is derived
  internally from message content). This task therefore (a) widens `LlmCapability` to add
  `'judge'`, (b) adds a `capability?: 'judge'` option to `routeAndCall`, and (c) branches
  on it in **both** `getModelConfig` (`router.ts:597`, already takes a `capability` param)
  **and** `getModelConfigV2` (`router.ts:434`) — both resolvers must handle `'judge'` or
  the V2/legacy paths diverge. When set, the resolver returns `{ provider: <see vendor
  guard>, model: GRADER_MODEL, maxTokens: <reuse the light-rung maxTokens>,
  reasoningEffort: undefined }` (no `reasoning_effort` → non-reasoning, per ADR-0016 §2;
  the Anthropic adapter passes `model` verbatim). The judge config must **ignore
  tier/age/region** (age-blind per §2).
  **Vendor-independence guard (ADR-0016 §2):** do **not** hardcode `provider:'anthropic'`
  unconditionally. Resolve the grader provider through `selectJudgeProvider(tutorVendor)`
  (`judge-suitability.ts:54`) — anthropic by default, `'openai'` if the active tutor is
  anthropic — so a future anthropic tutor cannot share the grader's vendor. (`GRADER_MODEL`
  remains the anthropic occupant; if the constraint forces openai, route to the openai
  judge model instead.) Keep Sonnet 4.6 as the rung-4/5 *text fallback* role unchanged
  (this adds a *distinct* judge capability; they share a model today but route independently).
  **done when:** new `router.test.ts` cases assert `routeAndCall(msgs, 1, { capability:
  'judge' })` with a non-anthropic tutor resolves a config with `provider:'anthropic'`,
  `model: GRADER_MODEL`, and **no** `reasoningEffort`; **a break test asserts that with an
  anthropic tutor the grader does NOT resolve to anthropic** (§2 enforced, red→green);
  both `getModelConfig` and `getModelConfigV2` are exercised; existing router tests stay
  green. `pnpm exec nx run api:test` (router suite) green.

- [ ] **T4: Grader prompt builder.** New `apps/api/src/services/challenge-round/grader-prompt.ts`
  exporting `buildChallengeRoundGraderPrompt(input: { askedQuestion: string;
  learnerAnswer: string; conversationLanguage?: ConversationLanguage; ageBracket:
  AgeBracket; }): ChatMessage[]`. The prompt is a tight rubric: it gives the model the
  mentor's question and the learner's verbatim answer, instructs it to **name the one
  concept the question tests**, score it `solid|partial|missing|misconception`, quote a
  short `learnerQuote` from the answer, give one-line `evidence`, and a `correction`
  only when not solid — and to return **exactly** the JSON shape of
  `challengeRoundGraderVerdictSchema` with **at least one item** and nothing else.
  Model-agnostic wording (no Haiku-specifics).
  **done when:** `grader-prompt.test.ts` asserts the built messages contain the asked
  question, the learner answer, all four result labels, and a single-JSON-object
  directive; snapshot stable.

- [ ] **T5: Grader service.** New `apps/api/src/services/challenge-round/grader.ts`
  exporting `runChallengeRoundGrader(input: { askedQuestion: string; learnerAnswer:
  string; answerEventId: string; conversationLanguage?: ConversationLanguage;
  ageBracket: AgeBracket; sessionId?: string; }): Promise<ChallengeRoundEvaluationItem[]>`.
  Modeled on `runSuitabilityJudge` (`policy-engine/judge-suitability.ts`): build
  messages via T4, `routeAndCall(messages, 1, { capability:'judge', flow:
  'challenge.grader', responseFormat:'json', conversationLanguage, ageBracket,
  sessionId })`, `extractFirstJsonObject` → `JSON.parse` → `challengeRoundGraderVerdictSchema.safeParse`.
  On the parsed verdict, map each item to a full `ChallengeRoundEvaluationItem` by
  **injecting the server-owned `answerEventId`** (all items in one turn share the
  current answer's event id). **Fail-open returns `[]`** on any route error / no-JSON /
  parse fail / schema fail, **and emits a `challenge_round.grader_degraded` structured
  log + a `safeSend`-wrapped Inngest observability event named `app/challenge-round.grader_degraded`**
  (follows the verified `app/<domain>.<action>` convention — a bare
  `challenge_round.grader_degraded` is not a valid event name; per AGENTS.md "silent
  recovery without escalation is banned" — a degraded grader must be visible, never just
  a warn). The event payload schema (opaque ids + reason only, **no learner text**) must
  be defined in `@eduagent/schemas` (no centralized event registry exists; events are
  zod-validated at dispatch); a consumer handler is optional for pure observability.
  Never throws into the exchange.
  **done when:** `grader.test.ts` (external-boundary mock of `routeAndCall` only —
  GC1-compliant, the LLM is a true external boundary): (a) a solid-answer fixture →
  one item, `result:'solid'`, `answerEventId` == the injected id, **non-empty** (the
  exact regression for the gpt-oss bug); (b) partial/missing/misconception fixtures map
  through; (c) a thrown route error → `[]` **and** the degraded event fired; (d) an
  empty-`items` model response → schema-fail → `[]` + degraded event. RED→GREEN on (a).

- [ ] **T6: Plumb the asked-question into the active turn.** In
  `apps/api/src/services/session/session-exchange.ts`, thread the **most recent mentor
  question** (the last `assistant`-role message in the `messages` array already
  assembled for the tutor call) into `applyChallengeRoundRuntimeSignals` via a new
  `payload.askedQuestion?: string`. Source it where `applyChallengeRoundRuntimeSignals`
  is invoked in `processExchange`/`streamExchange` (the same `messages` built for the
  tutor call — no new DB read). The learner answer + its event id are already present
  as `payload.currentUserMessage` (`{ id, content }`, set at session-exchange.ts:3165).
  **done when:** type-checks; `session-exchange.test.ts` asserts `askedQuestion` is
  populated from the last assistant message on an active challenge turn.

- [ ] **T7: Swap the evaluation source under the flag.** In
  `applyChallengeRoundRuntimeSignals` (session-exchange.ts:**1059**, NOT 1088 — verified;
  the active branch is at **1090**), when
  `isChallengeRoundGraderEnabled(...)` **and** `current?.state === 'active'` **and** a
  `currentUserMessage` is present, replace the tutor-sourced
  `payload.challengeRoundEvaluation` with `await runChallengeRoundGrader({
  askedQuestion: payload.askedQuestion, learnerAnswer: payload.currentUserMessage.content,
  answerEventId: payload.currentUserMessage.id, conversationLanguage, ageBracket,
  sessionId })`. Feed that array into the **unchanged** downstream
  (`validateChallengeRoundEvaluationItems` → `resolveChallengeRoundRuntimeSignalState`
  → `decideMasteryAndReview`). When the flag is off, behavior is byte-identical to
  today (tutor-sourced). Note: `validateEvaluationEventIds` already overwrites
  `learnerQuote` with the verified DB event content (evaluation.ts:112-124), so a grader
  hallucinated quote cannot leak past the existing guard.
  **CRITICAL guard-relaxation (verified — else grader is dead code):** the existing active
  branch at session-exchange.ts:1090 is gated on `payload.challengeRoundEvaluation?.length`
  being **truthy**. Under the grader flag, T8 stops the tutor emitting the signal, so
  `payload.challengeRoundEvaluation` arrives **empty `[]`** and that branch is skipped —
  the grader would never run. T7 must **rewrite the branch entry condition** for the
  grader-on path so it is gated on `current?.state === 'active' && currentUserMessage`
  (the grader *produces* the array), not on a pre-existing non-empty tutor array. The
  flag-off path keeps the original `.length` precondition unchanged.
  **done when:** integration test (no internal mocks) `session-exchange.integration.test.ts`
  with the flag on: a solid-answer turn yields a persisted evaluation and, across a full
  round, `markMasteryVerified: true`; with the flag off, the existing inline path is
  exercised unchanged (existing tests stay green).

- [ ] **T8: Suppress tutor inline emission when grader is on.** Make the
  `isChallengeRoundActive` JSON-shape branch in
  `apps/api/src/services/exchange-prompts.ts:237` and the
  `challengeRoundActivePrompt` "emit signals.challenge_round_evaluation" prose in
  `apps/api/src/services/challenge-round/prompts.ts:13` **conditional on the grader flag
  being off** — when the grader owns the signal, the tutor must not also emit it (avoid
  double-grading and free the tutor to converse-only). Thread the flag state into the
  prompt-build context.
  **done when:** `exchange-prompts.test.ts` asserts: grader-off → the field is present
  in the active envelope template (today's behavior, preserves legacy/Gemini); grader-on
  → the field is absent. The existing RED→GREEN inline-field test stays valid for the
  grader-off case.

- [ ] **T9: Terminal safeguard against grader stalls.** The active→drafting transition
  only fires inside the `answer_complete` event (state.ts:`nextIndex = currentIndex + 1; if
  (nextIndex >= total) → drafting`), and **`resolveChallengeRoundRuntimeSignalState` only
  dispatches `answer_complete` when `challengeRoundEvaluation.length > 0`** (verified,
  evaluation/state path). So if the grader fail-opens to `[]`, no `answer_complete` fires,
  `questionIndex` does **not** advance, and the round stays `active` indefinitely.
  **Correction (the original trigger was structurally impossible):** keying the guard on
  "`questionIndex` reaches `totalQuestions` but `evaluations.length < totalQuestions`"
  can never be true — `questionIndex` only advances *on* a recorded evaluation, so it
  cannot reach the cap while evaluations are short. The guard must instead anchor on the
  number of challenge questions **actually asked** (advances every active turn the tutor
  poses a question, independent of whether grading succeeded), not on `questionIndex`.
  Add a server-side terminal guard: when **questions-asked** reaches
  `MAX_CHALLENGE_QUESTIONS` while `evaluations.length < questions-asked`, transition the
  round to a terminal state with **no mastery** (route to `drafting` if there is ≥1 solid
  item, else `complete`/abort) rather than re-asking. **Schema note:** if "questions-asked"
  is not already represented in `challengeRoundSessionStateSchema`, this pulls a minimal
  counter field into scope (the broader structural concept-capture stays deferred per
  Risks); alternatively derive it from the active round's assistant-question turns in
  exchange history (no schema change). Pick one in execution and state it. This applies
  the AGENTS.md rule "every envelope signal must have a server-side hard cap so the flow
  terminates."
  **done when:** unit test in the state module: with `MAX_CHALLENGE_QUESTIONS=3`,
  **three questions asked** but only 1 recorded evaluation, the resolver returns a terminal
  (non-active) state and `markMasteryVerified` is never true. (The test must drive
  questions-asked to the cap **without** three evaluations — exactly the fail-open stall.)

- [ ] **T10: Tier-2 live grader bake-off (model selection gate).** Add an `eval-llm`
  flow that drives `runChallengeRoundGrader` against a **fixture battery** designed to
  separate the two axes, run across **each candidate model** (Sonnet 4.6, Haiku 4.5,
  and optionally GPT-5-mini).
  **Mechanism correction (verified):** the harness swaps models via the
  `--openrouter-model <slug>` CLI override (`eval-llm/runner/llm-client.ts:37-66`), which
  applies **globally to every flow in a run** and routes through the eval-only OpenRouter
  adapter — it does **not** read a per-flow `GRADER_MODEL`, and OpenRouter slugs differ
  from the production `claude-*` IDs (e.g. `anthropic/claude-sonnet-4-6`, not
  `claude-sonnet-4-6`). So the bake-off runs the grader flow **in isolation**
  (`--flow challenge-grader`) once per candidate, passing the candidate's OpenRouter slug
  via `--openrouter-model`; map each candidate to its slug in the flow doc. (`GRADER_MODEL`
  in T3 is the *production* default the winner sets; it is not the eval's swap lever.)
  Both axes:
  - **Format axis** — every fixture must return a non-empty, schema-valid verdict
    (`items.length ≥ 1`). A single empty/invalid response fails the candidate (this is
    the exact gpt-oss failure mode).
  - **Judgment axis** — fixtures carry a known-good label: clearly-solid answers must
    grade `solid`; a deliberately-shaky/over-confident answer must **not** grade `solid`
    (guards the false-mastery inverse); a planted misconception must grade
    `misconception`; a non-answer must grade `missing`.
  Score each candidate on both axes; **select the cheapest model that is ~100% clean on
  both**, and record the pick in a `vetting/` entry (master register governance). Update
  `GRADER_MODEL` (T3) to the winner.
  **done when:** `pnpm eval:llm --live` includes the bake-off and the **selected** model
  passes both axes across the battery; the chosen model is recorded in `vetting/` and set
  as `GRADER_MODEL`; restore candidate snapshots after the run
  (`git checkout -- apps/api/eval-llm/snapshots`). **This task gates the model decision —
  no grader model is trusted in production without passing it.**

- [ ] **T11: Canon — ADR amendment + register (incl. register-conflict reconciliation).**
  Add a dated **Amendment (2026-06-26)** subsection to
  `docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md` recording: the
  `challenge_round_evaluation` signal is the **first signal migrated from tutor-inline to
  judge-emitted**, realizing the §2 judge role; the migration is the established pattern
  for structured signals the tutor proves unreliable at; and it advances open gate **H4**
  by adding the **first tier/age-blind judge *capability* routing path** (NOT "first
  callable judge" — `runSuitabilityJudge` is already callable and routes to Sonnet 4.6).
  **Register-conflict reconciliation (verified, must not be skipped):**
  `docs/registers/llm-models/master.md:49` currently pins the **Judge role to "Haiku 4.5"**,
  but this plan defaults `GRADER_MODEL` to **Sonnet 4.6** pending the T10 bake-off. T11
  must update that register row (and the **H4** row at :118-120, which still says the judge
  is "scaffold only") to reflect: the judge capability is now callable for the grader flow;
  the occupant model is **eval-selected (T10), defaulting Sonnet 4.6**, with Haiku a
  demotion candidate **only if it passes T10** — so the register no longer asserts an
  unvetted "Haiku 4.5" as the judge model. Suitability judge to adopt the same capability
  next. Do **not** rewrite existing ADR text — append only (ADR lifecycle, MMT-ADR-0000).
  **done when:** `docs-checks.yml` `decision-adr-link` job passes (the plan/spec decision
  links MMT-ADR-0016); the master.md Judge + H4 rows no longer contradict `GRADER_MODEL`;
  `pnpm` docs checks green.

---

## Tests (substantial bodies)

**T5(a) — the regression that proves the fix.** Fixture: `askedQuestion = "Why does
increasing temperature speed up most reactions?"`, `learnerAnswer = "Because the
particles move faster and collide more often with enough energy."`, `answerEventId =
'<uuid>'`. Mock `routeAndCall` to return a realistic grader JSON verdict
(`{"items":[{"concept":"collision theory / activation energy","result":"solid",
"evidence":"links speed to collision frequency and energy","learnerQuote":"particles
move faster and collide more often"}]}`). Assert the returned
`ChallengeRoundEvaluationItem[]` has length 1, `result==='solid'`, `answerEventId`
equals the injected id, and is **non-empty**. Then the inverse: mock `routeAndCall` to
throw → assert `[]` returned and the `challenge_round.grader_degraded` event fired.
This pair is the red-green guard for the exact failure mode (empty array → silent
no-mastery) the plan exists to eliminate.

---

## Rollout / flag

`CHALLENGE_ROUND_GRADER_ENABLED` (default `false`). Sequence:
1. Land behind the flag (off everywhere) — no behavior change in any environment.
2. Add the flag `=true` in **staging** Doppler; run T10 live eval + a manual challenge
   round against the **gpt-oss tutor** (set `LLM_ROUTING_V2_ENABLED=true` in staging too,
   or test grader-on with the legacy tutor — the grader runs on its own judge model
   regardless of the tutor). Confirm mastery verifies and the degraded metric stays at zero.
3. Promote to production at/with the V2 cutover. The grader requires `ANTHROPIC_API_KEY`
   in Doppler — already present (it backs the Sonnet 4.6 rung-4/5 fallback).

The flag composes with the V2 cutover but does not depend on it; the V2 cutover should
**not** flip on for minor traffic until the grader is on (else mastery silently never
verifies — the blocker). Note this dependency in the cutover checklist (master register).

---

## Risks & mitigations

- **The grader model under-emits or mis-grades.** Not assumed away — T10's bake-off is the
  gate, scoring both format and judgment, and we default to the stronger model (Sonnet)
  rather than the cheap one. Format-escalation lever if even Sonnet wobbles: OpenAI or
  Cerebras native strict `json_schema` (structural format-lock) or Anthropic forced
  tool-calling (`tools` + `tool_choice`) — a localized adapter/grader change, not a
  redesign. Judgment-escalation lever: tighten the rubric prompt / add a second-opinion
  vote on borderline `solid` calls. Cost-optimization lever: demote `GRADER_MODEL` to
  Haiku once (and only if) T10 proves it clean.
- **Concept not in structured state.** The grader infers the concept from the asked
  question (Option A). Deferred hardening: capture the concept structurally at
  question-generation time (extend `challengeRoundSessionStateSchema`) so grading is
  against a known concept — out of scope here; note as a follow-up.
- **Extra latency/cost per answer.** ≤`MAX_CHALLENGE_QUESTIONS` small judge calls per
  round. **Correction (verified call path):** as designed, `applyChallengeRoundRuntimeSignals`
  — and thus the grader — runs **after** the tutor call completes (post-`onComplete`, both
  call sites at session-exchange.ts:3155/3529), so the grader adds **sequential** latency
  to the answer-submission turn; it does **not** "run concurrently with the tutor generating
  the next question" as originally claimed (the next question is already produced by the time
  the grader is invoked). To actually parallelize, the grader for answer N would have to be
  dispatched *before/alongside* the tutor call rather than after it — a call-path change, not
  free. Decide in execution: accept the sequential cost (one small judge call, likely fine),
  or restructure to fire the grader concurrently. Revisit if the latency metric says otherwise.
- **Double-grading if T8 is missed.** T8 makes the tutor stop emitting the signal when the
  grader owns it; the integration test (T7) guards that only the grader's evaluation is
  persisted under the flag.

## Execution note

This is implementation of ratified canon (MMT-ADR-0016 §2), but it is real product code
touching the mastery path — **create and claim a Cosmo Work Item before executing**
(`/cosmo:execute claim`), and finalize via `/cosmo:execute complete`. The work is
flag-gated and order-independent across T1–T6; T7/T8 depend on T2–T6; T9–T11 follow.
