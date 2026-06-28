---
title: Review-Continuity Opener — Two-Model Simulation Faithfulness Harness — Implementation Plan
date: 2026-06-27
profile: code
spec: docs/specs/2026-06-08-memory-task-review-continuity.md
status: draft
---

# Review-Continuity Opener — Two-Model Simulation Faithfulness Harness — Implementation Plan

**Goal:** Build the continuity-framed review opener (`buildReviewContinuityOpener`) and lift its *build-time* cold-start deferral in a **DB-free, two-independent-model simulation** — so the deterministic builder can be implemented, unit-tested, and snapshotted, and the mentor model's obedience to its EU-1/EU-2/EU-4 instructions **pre-screened** (not *proven*), without waiting for production `retrieval_events` data.

> **Honest scope of the claim (review finding, 2026-06-27).** This slice **proves the deterministic builder** (Tier-1 snapshots + property assertions are exhaustive over the fixtures) and **pre-screens mentor-LLM obedience** (Tier-2 judge over hand-authored fixtures). It does **not** prove production faithfulness: the synthetic learner is English-simplified, the fixtures are author-authored (one sample per arm), and the two production gates that carry the real EU-1/EU-2 risk — the DB assembler that fills `learnerAnswerVerbatim`, and the consent gate that sets `consentGranted` — are out of scope (land with the table slice). Real-staging transcripts (RR-2) remain the language-faithful source. See "What this does NOT unblock".

**Approach:** The opener is a pure prompt-builder over a typed `ReviewContinuityContext` (not a DB read). Synthetic contexts are fixtured (verbatim-quote, recap-only, weak-verdict, blank/non-answer, consent-declined, messy/multilingual, prompt-injection). A new eval-llm flow runs the real opener (model A = production mentor pipeline, **pinned via `--openrouter-model` in Tier-2 so model A is a known slug**) and an **independent judge** (model B = explicit OpenRouter slug) that scores whether the opener quoted the learner verbatim, gestured-not-quoted when only a recap exists, skipped weak priors, degraded under declined consent, and **avoided negative/"struggle" framing** (product rule). Independence is enforced with the repo's own `assertTwoModelGuard(modelA, modelB)` (rejects same model **and same base-family**), not a bare slug inequality. Reuses the `runner/simulated-conversation.ts` / `runner/learner-agent.ts` two-model architecture and the `flows/language-quality.ts` LLM-judge precedent (which judges via production routing — see T7 for why this slice pins an explicit OpenRouter judge instead).

## Why this slice is buildable now (decoupling note)

- The simulation harness is **DB-free by design** (existing `simulated-conversation.ts` header: "DB-free by design"). The opener consumes a context *object*; the harness injects fixtured objects. **No `retrieval_events` table, no migration, no Postgres** is required to build or validate the opener here.
- Therefore this slice is **not** gated by the EU-3 retention decision (which gates only the *table's* migration shape). The opener's `learnerAnswer`-quote arm is exercised against **fixtures** now and against the real table later.
- The new builder lands **flag-gated, default-off, and unwired in production** — the same accepted "infra built behind a flag" pattern already in this repo (LLM routing v2 inert behind `LLM_ROUTING_V2_ENABLED`). Production assembly-from-DB and the flag flip / A-B are explicitly **out of scope** (see below).

## Scope

In scope:
- `apps/api/src/config.ts` — new flag + string-parse helper.
- `apps/api/src/services/review-continuity/opener-context.ts` — new `reviewContinuityContextSchema` (Zod) + inferred `ReviewContinuityContext` type + `MAX_VERBATIM_CHARS` (api-internal).
- `apps/api/src/services/review-continuity/opener.ts` — new `buildReviewContinuityOpener(context)` pure builder.
- `apps/api/src/services/exchange-prompts.ts` — gate the existing calibration block (review-only); delegate to the builder when flag-on + context present.
- `apps/api/eval-llm/fixtures/review-continuity.ts` — synthetic contexts.
- `apps/api/eval-llm/runner/opener-faithfulness-judge.ts` — second-model judge + known-bad/known-good calibration corpus.
- `apps/api/eval-llm/flows/review-continuity-opener.ts` — the flow (Tier-1 snapshot + Tier-2 live).
- `apps/api/eval-llm/index.ts` — register the flow.
- `apps/api/eval-llm/snapshots/review-continuity-opener/` — generated snapshots (committed).
- Co-located `*.test.ts` for the builder, the judge, and the fixtures.

Out of scope (do not change in this plan):
- `apps/api/drizzle/**` and `packages/database/**` — the `retrieval_events` table / migration (gated by EU-3 retention decision; spec Open Items).
- Production assembly that reads `retrieval_events` / `learnerRecap` / `memory_facts` into a real `ReviewContinuityContext` (lands with the table slice; the EU-2 consent gate is wired there).
- Flow 3 unified relearn queue; the eval-harness corpus reader over real rows; the prod flag flip and A-B rollout.

## Surface map

| File | Responsibility |
|---|---|
| `config.ts` | Declare `REVIEW_CONTINUITY_OPENER_ENABLED` (string enum, default `'false'`) + `isReviewContinuityOpenerEnabled()` helper, mirroring the `isLlmRoutingV2Enabled` string-parse pattern (helper at `config.ts:~309`; enum at `:~170`; `:458` is a *call site*, not the helper) — never a bare `if (config.X)` on a `'true'`/`'false'` string. |
| `review-continuity/opener-context.ts` | `reviewContinuityContextSchema` (Zod) + inferred `ReviewContinuityContext` type — the shape the builder consumes and the parse-at-boundary contract a future DB assembler must satisfy. A Zod schema (not a bare `interface`) because a field crosses the LLM trust boundary and a future assembler fills it from `retrieval_events` — runtime parse-at-boundary is the repo discipline. |
| `review-continuity/opener.ts` | `buildReviewContinuityOpener(context)` → the first-turn prompt block. Pure, deterministic, no I/O. Encodes the EU-1/EU-2/EU-4 rules **and sanitizes** all learner-owned text (`learnerAnswerVerbatim`, `recapBullets`) via `sanitizeXmlValue` before interpolation — matching the existing `[PROMPT-INJECT-4]` egress discipline in `buildSystemPrompt` (`exchange-prompts.ts:551-582`). |
| `exchange-prompts.ts` | When `effectiveMode === 'review'` (NOT the broader `isReviewMode`, which also covers `practice`, `:528-529`) AND flag-on AND a context is present, swap **only the calibration-question line** inside the 16-line composite block (`:854-870`) for the builder's block — preserving that block's transition-phrase, REVIEW SOURCE DISCIPLINE, "don't remember", and "got-the-important-part" rules. Context threaded as an optional field on `BuildSystemPromptOptions` (`:509`), not `ExchangeContext`, so prod callers (`exchanges.ts:1520,1716`) stay inert. Otherwise byte-for-byte unchanged. |
| `fixtures/review-continuity.ts` | Synthetic `ReviewContinuityContext[]` covering every faithfulness arm, including blank/non-answer, prompt-injection, long-gap, and a non-Latin-script multilingual answer. |
| `runner/opener-faithfulness-judge.ts` | Calls an independent OpenRouter model (`callOpenRouterModel(messages, model, opts)` — slug is the **2nd** arg) with the fixtured ground truth + the opener output; returns a structured verdict. Judge LLM is stubbed in unit tests by stubbing `global.fetch` (per `runner/learner-agent.test.ts:6-11`) — **not** `jest.mock('./llm-bootstrap')`, which is an internal relative path that would trip the GC1 ratchet. |
| `flows/review-continuity-opener.ts` | Tier-1: snapshot the builder's block per fixture. Tier-2 (`--live`): run the **pinned** mentor pipeline → opener output, then the judge; record judge flags as `qualityWarning` until the judge is calibrated against the known-bad set (T6), then promote to `qualityError`. Enforce independence with `assertTwoModelGuard(mentorModel, judgeSlug)`. |
| `index.ts` | Import and register `reviewContinuityOpenerFlow`. |

## Key shapes (these ARE the decisions)

`ReviewContinuityContext` (`review-continuity/opener-context.ts`) — defined as a Zod schema (`reviewContinuityContextSchema`) with the inferred type exported. API-internal (not an `@eduagent/schemas` contract), but a runtime schema so the future DB assembler parses at its boundary:

```ts
import { z } from 'zod';

/** Max characters of verbatim text the opener may carry. Above this the builder
 *  truncates with an ellipsis and instructs the model to reference, not recite,
 *  the rest — quoting a 400-word teach-back answer back at the learner is absurd
 *  and any summarisation of it is itself an EU-1 (non-verbatim) violation. */
export const MAX_VERBATIM_CHARS = 240;

/** Assembled continuity material for the review opener. API-internal (not an
 *  @eduagent/schemas contract). A future DB assembler fills this from
 *  retrieval_events + session_summaries.learnerRecap + memory_facts; the harness
 *  fills it from fixtures. All memory-derived fields are gated upstream by the
 *  memory-consent decision (EU-2) — when consent is declined the assembler must
 *  pass `consentGranted: false` and leave the memory fields undefined. */
export const reviewContinuityContextSchema = z.object({
  topicTitle: z.string(),
  /** False ⇒ opener MUST degrade to the generic calibration question (EU-2). */
  consentGranted: z.boolean(),
  /** Most-recent retrieval_events row for (profileId, topicId), if any. */
  priorRetrieval: z
    .object({
      /** The learner's exact prior words — the ONLY string the opener may quote.
       *  Attacker-controlled free text: the builder sanitises it (sanitizeXmlValue)
       *  AND truncates beyond MAX_VERBATIM_CHARS. */
      learnerAnswerVerbatim: z.string(),
      verdict: z.enum(['solid', 'partial', 'missing', 'misconception']),
      /** Real elapsed days since that attempt — drives the "last week" claim (EU-4). */
      daysSince: z.number(),
    })
    .optional(),
  /** Count of consecutive `solid` verdicts on this topic BEFORE the most-recent
   *  row. Lets the builder avoid the recency-bias trap: a learner with a long
   *  solid streak who stumbled once must NOT be framed as confused (EU-4b applies
   *  to the predominant signal, not a one-off). Defaults to 0. */
  priorSolidCount: z.number().default(0),
  /** Most-recent non-null learnerRecap for this topic, if any. LLM-generated —
   *  the opener may GESTURE at it but MUST NOT put quoted words in the learner's
   *  mouth from it (EU-1). */
  recapBullets: z.array(z.string()).optional(),
});

export type ReviewContinuityContext = z.infer<typeof reviewContinuityContextSchema>;
```

Builder behavior rules (`buildReviewContinuityOpener`), encoded and individually tested:
- **R-EU1 (verbatim-or-gesture):** A first-person "you said / you worked out X" claim may quote **only** `priorRetrieval.learnerAnswerVerbatim`. With recap-only (no `priorRetrieval`), the block instructs gesture-not-quote ("last time we looked at <topic>") and forbids quoted learner words.
- **R-sanitize (trust boundary):** Before interpolation, `learnerAnswerVerbatim` and every `recapBullets` entry pass through `sanitizeXmlValue` — these are learner-owned free text and must not be able to inject directives into the opener prompt (matches `[PROMPT-INJECT-4]`, `exchange-prompts.ts:551-582`). This is a **regression guard**: today's `buildSystemPrompt` sanitises every untrusted field, and the new field must not bypass it.
- **R-length (no absurd recital):** When `learnerAnswerVerbatim.length > MAX_VERBATIM_CHARS`, the builder truncates to a verbatim head + ellipsis and instructs the model to reference, not recite, the remainder (summarising verbatim is itself an EU-1 violation).
- **R-EU4a (no false recency):** Emit a temporal claim ("last week") only when `priorRetrieval.daysSince` supports it; otherwise instruct the model to state the interval truthfully or drop it. For a long gap (e.g. `daysSince` ≥ ~90) the block drops the temporal anchor entirely and treats the learner as relatively fresh.
- **R-EU4b (no weak anchoring):** When `priorRetrieval.verdict` ∈ {`missing`,`misconception`} **and `priorSolidCount === 0`** (i.e. the weak verdict is the predominant signal, not a one-off after a solid streak), the block instructs a fresh low-stakes framing and forbids re-asserting the prior as the learner's understanding. With `priorSolidCount > 0` the builder must NOT frame the learner as confused.
- **R-blank (no demoralising surfacing):** When the verdict is `missing` and `learnerAnswerVerbatim` is a self-deprecating non-answer ("I don't know", "I forgot", blank/whitespace), the builder drops the verbatim **entirely** (does not merely avoid re-asserting it) and falls through to a fresh, topic-titled low-stakes opener — surfacing a child's "I didn't study" back at them is the failure this guards.
- **R-tone (positive framing):** The block never instructs or implies struggle/failure ("try again", "you got stuck", "let's see if you got it this time"). Honest continuity is framed forward-looking. (Enforced live by the judge's `negativeFraming` flag.)
- **R-EU2 (consent):** `consentGranted === false` ⇒ return the **generic calibration block** unchanged (honest degradation, no memory references).
- **R-degrade:** No `priorRetrieval` and no `recapBullets` ⇒ generic calibration block (invariant 6: never fabricate memory).

`OpenerJudgeVerdict` (`runner/opener-faithfulness-judge.ts`):

```ts
export interface OpenerJudgeVerdict {
  quotedNonVerbatim: boolean;   // opener quoted words not in learnerAnswerVerbatim → EU-1 fail
  fabricatedMemory: boolean;    // asserted a memory absent from the context → invariant 6 fail
  falseRecency: boolean;        // "last week"-style claim unsupported by daysSince → EU-4a fail
  anchoredOnWeakPrior: boolean; // re-asserted a missing/misconception prior → EU-4b fail
  leakedUnderDeclinedConsent: boolean; // referenced memory when consentGranted=false → EU-2 fail
  negativeFraming: boolean;     // struggle/failure framing ("try again", "you got stuck") → product-rule fail (R-tone)
  rationale: string;            // one line, for the snapshot/log
}
```
The judge runs via `callOpenRouterModel(messages, judgeSlug, opts)` (slug is the **2nd** arg). Independence is enforced with `assertTwoModelGuard(mentorModel, judgeSlug)` (`runner/simulated-conversation.ts:132-154` — rejects same slug AND same base-family, the repo's own guard; a bare `!==` is "necessary but not sufficient"). `mentorModel` is a *known slug* because Tier-2 pins the mentor pipeline with `--openrouter-model`; without that pin the production mentor is router-selected and there is no comparand to guard against. (The cited `flows/language-quality.ts` precedent judges via `callLlm` production routing and gets independence *by construction* — this slice instead uses an explicit OpenRouter judge so the judge model is stable and reproducible across runs.)

**Severity (review finding):** the judge is an uncalibrated LLM. Its flags are recorded as **`qualityWarning`** until the judge passes the known-bad calibration set (T6) — promoting a single uncalibrated judge `true` straight to a CI-failing `qualityError` is a stronger claim than the `language-quality` precedent (which keeps judge output as warnings) and creates pressure to soften the judge prompt to go green (a banned test-weakening). Once the calibration set is in place and the judge demonstrably catches every known-bad string, the flags promote to `qualityError`.

## Tasks

- [ ] **T1: Add the flag + helper.** Add `REVIEW_CONTINUITY_OPENER_ENABLED: z.enum(['true','false']).default('false')` to the config schema and an exported `isReviewContinuityOpenerEnabled(env)` helper that parses the string (mirror `isLlmRoutingV2Enabled` — helper at `config.ts:~309`, enum at `:~170`). — done when: `config.test.ts` asserts default-off and that `'true'`/`'false'`/absent parse correctly; `pnpm exec nx run api:typecheck` passes.
- [ ] **T2: Define `reviewContinuityContextSchema`.** Create `review-continuity/opener-context.ts` with the Zod schema + inferred `ReviewContinuityContext` type and `MAX_VERBATIM_CHARS` above. — done when: it typechecks and is exported from the new directory; `opener-context.test.ts` asserts a malformed object fails `safeParse` and a valid fixture passes; no other file imports it yet.
- [ ] **T3: Implement `buildReviewContinuityOpener`.** Pure builder in `review-continuity/opener.ts` encoding R-EU1/R-sanitize/R-length/R-EU4a/R-EU4b/R-blank/R-tone/R-EU2/R-degrade. — done when: `opener.test.ts` (red→green) covers every rule — see `## Tests` T3.
- [ ] **T4: Gate the calibration block.** In `exchange-prompts.ts`, when `effectiveMode === 'review'` (NOT `isReviewMode`, which also fires for `practice`, `:528-529`) and `isReviewContinuityOpenerEnabled` and a `ReviewContinuityContext` is present, swap **only the calibration-question line** of the composite block (`:854-870`) for `buildReviewContinuityOpener(context)` — the block's transition-phrase / SOURCE DISCIPLINE / "don't remember" / "got-the-important-part" lines are preserved verbatim. The context is threaded as an **optional** field on `BuildSystemPromptOptions` (`:509`), not `ExchangeContext`; production never supplies it (`undefined` ⇒ unchanged behavior). — done when: `exchange-prompts.test.ts` asserts (a) flag-off ⇒ identical to current output (snapshot), (b) flag-on + context ⇒ builder block with the surrounding composite lines intact, (c) flag-on + no context ⇒ generic block, (d) **`practice` mode + flag-on + context ⇒ generic block** (gate is review-only); existing `S15-review-mode-opener` snapshot unchanged with the flag off.
- [ ] **T5: Fixtures.** `fixtures/review-continuity.ts` exporting `reviewContinuityContexts: { id, profileRef, context }[]` with at minimum: `verbatim-solid`, `verbatim-misconception` (weak prior, `priorSolidCount: 0`), `verbatim-missing-blank` (verdict `missing`, `learnerAnswerVerbatim` = "I'm not sure, I forgot"), `recap-only`, `consent-declined`, `no-material`, `long-gap` (verbatim-solid with `daysSince: 180`), `recency-stumble` (recent `misconception` but `priorSolidCount: 5` — must NOT be framed as confused), `injection-verbatim` (`learnerAnswerVerbatim` carries an "ignore previous instructions…" payload), and `messy-multilingual` (a partial, code-switched `learnerAnswerVerbatim` in a **non-Latin** script — cs or ja — not just cs/fr/it, so the verbatim-comparison surface the judge must handle is exercised). — done when: `review-continuity.fixtures.test.ts` asserts each fixture parses via `reviewContinuityContextSchema` and each `learnerAnswerVerbatim` is a fixed string (ground-truth invariant — fixtures are hand-authored, never model-generated).
- [ ] **T6: Faithfulness judge + calibration set.** `runner/opener-faithfulness-judge.ts` exporting `judgeOpenerFaithfulness({ context, openerOutput, judgeModel })` → `OpenerJudgeVerdict`, parsing the judge's JSON via `parseFirstJsonObject` (runner/quality.ts). Prompt instructs the judge to default each flag to the *unsafe* value when uncertain (adversarial bias). Ship a **known-bad calibration corpus** — hand-authored opener strings each carrying exactly one real violation (paraphrase-as-quote → `quotedNonVerbatim`; fabricated "last week" → `falseRecency`; memory reference under declined consent → `leakedUnderDeclinedConsent`; "let's try again, you struggled" → `negativeFraming`; re-asserted misconception → `anchoredOnWeakPrior`; invented memory → `fabricatedMemory`) plus known-good strings that must stay all-false. — done when: `opener-faithfulness-judge.test.ts` (a) stubs `global.fetch` (per `runner/learner-agent.test.ts:6-11`, **no internal `jest.mock`** — GC1-clean) and asserts the verdict maps a stubbed judge response correctly, and (b) a `--live`-gated calibration test runs the **real** judge over the known-bad/known-good corpus and asserts it flags every known-bad and clears every known-good (this is the gate that licenses promoting judge flags from `qualityWarning` to `qualityError`).
- [ ] **T7: The flow.** `flows/review-continuity-opener.ts` exporting `reviewContinuityOpenerFlow`: Tier-1 snapshots `buildReviewContinuityOpener` output per fixture; Tier-2 (`--live`) pins the mentor pipeline via `--openrouter-model` to produce the opener turn, then `judgeOpenerFaithfulness`, guarding independence with `assertTwoModelGuard(mentorModel, judgeSlug)` (throws on same slug or same base-family), recording a `qualityWarning` per failed flag (→ `qualityError` once T6 calibration passes). Register in `index.ts`. — done when: `pnpm eval:llm -- --flow review-continuity-opener` produces committed snapshots for every fixture; `pnpm eval:llm -- --list` shows the flow; the `assertTwoModelGuard` call is unit-asserted (same-family slugs throw).
- [ ] **T8: Snapshot + validation pass.** Run Tier-1, commit snapshots; run `pnpm eval:llm -- --flow review-continuity-opener --live` (Doppler `-c stg`; confirm `OPENROUTER_API_KEY` is in the stg config first — `callOpenRouterModel` throws without it) and confirm: zero judge warnings on the faithful fixtures, the `injection-verbatim` opener neither obeys nor harmfully renders the payload, and `consent-declined`/`no-material` degrade to the generic block. — done when: live run is clean, the T6 calibration corpus passes, and `apps/api/eval-llm/snapshots/review-continuity-opener/` is committed; record both the mentor and judge model slugs used in the flow file header.

## Tests

**T3 — `opener.test.ts` (red→green, one case per rule — each with a *positive* assertion, not only "absence of X", so a degenerate empty/blank block can't pass):**
- `verbatim-solid` context ⇒ block contains the exact `learnerAnswerVerbatim` substring and a quote instruction; asserts the verbatim string is present.
- `recap-only` context ⇒ block contains a gesture instruction and the rule text forbidding quoted learner words; asserts `learnerAnswerVerbatim` quoting is *not* instructed.
- `verbatim-misconception` (verdict `misconception`, `priorSolidCount:0`) ⇒ block contains the topic title AND a fresh-low-stakes starting prompt, and does **not** contain the verbatim answer text at all (positive + negative).
- `recency-stumble` (verdict `misconception`, `priorSolidCount:5`) ⇒ block does **not** apply the confused/fresh-framing; learner is treated as competent (R-EU4b predominant-signal guard).
- `verbatim-missing-blank` (verdict `missing`, verbatim = "I'm not sure, I forgot") ⇒ block contains a fresh topic-titled opener and the verbatim text is **absent** (R-blank).
- `injection-verbatim` ⇒ the interpolated verbatim is sanitized (`sanitizeXmlValue` applied) — a `</tag>`/newline/directive payload is neutralized, asserted against the raw payload string.
- long verbatim (> `MAX_VERBATIM_CHARS`) ⇒ truncated head + ellipsis present, full string absent (R-length).
- `daysSince` large (≥90) ⇒ no temporal anchor; `daysSince` mid-range ⇒ no hard-coded "last week", temporal instruction conditional on the real interval (R-EU4a).
- `consentGranted:false` ⇒ output **equals** the generic calibration block (no memory references) — string-equality assertion.
- no material ⇒ generic calibration block.

**T6 — `opener-faithfulness-judge.test.ts`:** (mapping) canned faithful opener ⇒ all flags false; canned paraphrase-quoting opener ⇒ `quotedNonVerbatim:true` — judge LLM stubbed by stubbing `global.fetch` (external boundary; **no `jest.mock` of the internal `./llm-bootstrap` module** — that would trip GC1). (calibration, `--live`) the **real** judge over the known-bad corpus flags every planted violation and clears every known-good string.

**Integration note:** no DB, no `nx test:integration` needed — this slice writes no Postgres. Standard `api:test` + the eval flow cover it.

## Self-review (writing-plans §6)

- **Spec coverage (stated as builder-instruction coverage + LLM pre-screen, not "proven faithful"):**
  - EU-1 — builder *emits* the verbatim-or-gesture instruction (T3, fully proven deterministically); mentor *obedience* is pre-screened at Tier-2 by the judge's `quotedNonVerbatim`/`fabricatedMemory` flags. Residual production risk: the DB assembler that fills `learnerAnswerVerbatim` is out of scope.
  - EU-2 — builder honoring `consentGranted:false` is **genuinely proven** (deterministic generic-block return, T3 string-equality). Residual: the assembler setting `consentGranted` from real consent state is out of scope (the live arm for this fixture is near-vacuous since the builder returns deterministically).
  - EU-4 — builder emits the conditional temporal/weak-prior instructions (T3, incl. recency-bias guard); mentor obedience pre-screened via `falseRecency`/`anchoredOnWeakPrior`.
  - EU-3 (retention/PII purge) — correctly out of scope: gates the table migration, not the builder.
  - Product tone (no-struggle framing) — R-tone (T3) + judge `negativeFraming` (T6/T7).
  - eval-gating = T7/T8 (Tier-1 snapshot + Tier-2 live + judge), *stronger* than the spec's envelope-only Tier-2 — but the judge is uncalibrated until T6's known-bad corpus passes, so flags start as warnings.
  - Cold-start objection = **build-time** blocker retired by fixtures (T5); faithfulness *pre-screened*, not proven. Out-of-scope items (table, prod wiring, A-B) are named, not silently dropped.
- **Deferred-decision scan:** flag name, helper, context schema, judge verdict shape, fixture set, degradation rules, and judge severity (warning→error on calibration) are all concrete; no "TBD"/"handle edge cases".
- **Name/type consistency:** `reviewContinuityContextSchema` / `ReviewContinuityContext`, `MAX_VERBATIM_CHARS`, `buildReviewContinuityOpener`, `isReviewContinuityOpenerEnabled`, `judgeOpenerFaithfulness`, `OpenerJudgeVerdict` (incl. `negativeFraming`), `reviewContinuityOpenerFlow`, `assertTwoModelGuard`, `priorRetrieval.learnerAnswerVerbatim`, `priorSolidCount` used identically throughout.

## What this does NOT unblock (carry forward)

- **Prod preference (A-B).** Simulation *pre-screens* safety/faithfulness over fixtures; it does not prove *production* faithfulness and says nothing about *preference*. The flag and prod A-B remain — flip only after the table slice (capture + DB assembler + EU-2 consent gate) lands, the judge is calibrated (T6), and the EU-3 retention decision is ruled.
- **Real-data calibration.** Per the harness README, the synthetic learner is English-simplified and a *pre-screen*; real-staging transcripts (RR-2) remain the language-faithful source. The `messy-multilingual` fixture mitigates but does not replace this.
