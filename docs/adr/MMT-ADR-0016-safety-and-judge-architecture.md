# MMT-ADR-0016 — Safety and judge architecture: judgment-based safety (no app-owned denylist) and a vendor-independent judge

**Status:** Accepted · 2026-06-06 · **Scope:** All production LLM safety + evaluation calls · **Deciders:** Architect (jjoerg) + PM (owner) · **Builds on:** MMT-ADR-0014 (router/vetting split), MMT-ADR-0013 (policy-engine spine)

## Context

Two cross-cutting decisions govern every production LLM call and are independent of *which* model fills any slot (that is register data). They were ratified during the Gemini-exit re-pick but are durable beyond it: they constrain the **safety mechanism** and the **evaluation ("judge") architecture** for all models, present and future. Both clear the significance gate — they select an approach, constrain other work, and move a quality attribute (safety) — and are therefore ADR-class, where the model picks are not.

The terms **tutor** (the learner-facing prose-generating call) and **judge** (the post-generation evaluator that emits the structured response envelope) are glossed inline here; until canon defines them formally, these inline glosses govern.

## Decision

### 1. Safety is decided by judgment of handling, not by an app-owned denylist

Safety is decided by **judgment of how a topic is handled**, not by token/keyword matching. There is **no app-owned word denylist**. The danger line runs *through* the word, not around it — "what poppy seeds produce" vs "how to extract opium" share tokens but differ entirely in intent and handling.

**Over-blocking is a hard failure, equal in weight to under-blocking.** Refusing a legitimate question is as much a defect as answering a dangerous one. A denylist is guaranteed wrong in one direction and is the mechanism that produces spurious "I can't answer that" refusals; it is therefore not built.

### 2. The judge is vendor-independent of the tutor, non-reasoning, and age-gated only in mode

- **Vendor-independent of the tutor.** The judge must not share a model vendor with the tutor it evaluates — an evaluator that shares the tutor's blind spots cannot catch them. (The router *capability* that makes roles separately-routable is MMT-ADR-0014 §8; this is the *policy* that requires the separation be maintained.)
- **Non-reasoning.** The judge runs in non-reasoning mode; reasoning mode breaks the JSON response envelope (`llmResponseEnvelopeSchema`), and envelope integrity is load-bearing for the state machine.
- **Age varies only the judge's gating mode, never the default model.** Under-18 and adult share the same everyday tutor model; age changes the judge's *gating mode* (how strictly the envelope is gated) and the residency branch — not which model generates prose. (The one tier-based model carve-out — Family's exclusion from the premium deep-reasoning model — is register data, not an age rule, and lives in the model master.)

## Consequences

- **No denylist component is built.** Safety lives in the prompt-layer safety preamble + the judge's evaluation, plus a deterministic, intent-shaped tripwire (`safety-tripwire.ts`) as a narrow last-resort floor for the two catastrophic categories (self-harm method-seeking, CSAM) — high-precision and explicitly **not** a word list. (v1 ships without a strong post-envelope content classifier — Gap B / Path X is v1.1 per MMT-ADR-0013 §6 + MMT-ADR-0014 §5; the v1 posture is vendor refusal + safety preamble + judge + the tripwire floor.)
- **The judge is a distinct routing role** with its own eligibility set and its own vendor constraint (MMT-ADR-0014 §8). Changing the judge model is a register edit with a vetting record, subject to the vendor-independence rule above.
- **The everyday model is age-blind.** Routing never forks the default tutor model on age; only the judge gating mode and the residency branch fork. This keeps the primary path uniform and avoids an age-split model matrix.
- **The model picks that realise these roles are register data**, not canon: the judge model, the tutor model, and every slot live in `docs/registers/llm-models/master.md` with their vetting trail. This ADR constrains *how* those roles are filled (vendor-independence, non-reasoning, no denylist), never *which model* fills them.

## Alternatives considered

1. **An app-owned keyword/topic denylist for safety.** Rejected — the dual-use line runs through the word, so token matching is guaranteed wrong in one direction and is the mechanism that produces spurious refusals. Over-blocking is a hard failure equal to under-blocking.
2. **A judge that may share the tutor's vendor.** Rejected — an evaluator sharing the tutor's blind spots cannot catch them; vendor-independence is the cheapest structural guard.
3. **A reasoning-mode judge.** Rejected — reasoning mode breaks the JSON envelope the state machine depends on.
4. **Age-split everyday model** (different default tutor models for adults vs minors). Rejected — unnecessary; the everyday model is shared, age drives only the judge gating mode + the residency branch. (Tier carves out one row — Family excluded from the premium deep-reasoning model — but that is register data, not an age rule.)

## What this ADR does not decide

- **Which models fill the tutor, judge, secondary, vision, deep-reasoning, or fallback slots** — register data (`docs/registers/llm-models/master.md`) with its vetting trail, DB-bound. This ADR governs the *shape* of the safety + judge roles, not their occupants.
- **The routing mechanism** (3-param key, vetting/routing split, fail-closed, fallback tiers, separately-routable roles) — MMT-ADR-0014.
- **The Gemini exclusion** — a compliance input recorded in the vetting trail; the routing supersession is MMT-ADR-0014.
- **The judge's gating-mode thresholds per age** — operational tuning (envelope spec), not architecture.
- **Formal canon definitions of `tutor` / `judge`** — deferred canon authorship; the inline glosses above govern meanwhile.

## Amendment (2026-06-26) — Challenge-Round grader: first tutor→judge signal migration

### What changed

`challenge_round_evaluation` is the **first structured signal migrated from tutor-inline emission to judge-emitted**, realizing the §2 judge role stated above. The then-active tutor model proved unreliable at emitting this signal — it returned `[]` on every Challenge Round turn, so mastery silently never verified on that tutor path. Strengthening the JSON template with explicit "you MUST include it" guidance did not fix it: a genuine model instruction-following gap, not a prompt-template bug.

A dedicated grader service (`runChallengeRoundGrader`) calls the judge to produce the evaluation array; the server deterministically injects `answerEventId` for every item in a turn. The downstream mastery gate (`decideMasteryAndReview`) is byte-identical — only the *source* of its input changes. The grader is feature-flag-gated (`CHALLENGE_ROUND_GRADER_ENABLED`).

### The established pattern

Migrating a structured signal from tutor-inline to judge-emitted is the **established remediation pattern** for signals a tutor proves unreliable at. When a structured signal exhibits a silent-drop failure mode that prompt tightening cannot fix, the correct lever is a single-purpose judge call for that signal — not further prompt engineering on the tutor.

### First tier/age-blind judge *capability* routing path

This migration added a **distinct `capability: 'judge'` routing branch that is explicitly tier/age-blind per §2** — it ignores tier, age, and region entirely (`apps/api/src/services/llm/router.ts`; the grader model is register data and model-swappable).

**Correction of record:** this was not the first callable judge — the suitability judge (`runSuitabilityJudge`, `policy-engine/judge-suitability.ts`) predates it, routed via an ad-hoc `preferredProvider`. The capability branch is the durable mechanism; judge callers are expected to converge on it.

### Vendor-independence: enforced, not coincidental

§2 requires the judge to be vendor-independent of the tutor. The grader provider is resolved through `selectJudgeProvider(tutorVendor)` (`policy-engine/judge-suitability.ts`) — it returns a different vendor than the active tutor's — so §2 is **structurally enforced** rather than coincidentally satisfied. A tutor-vendor change cannot silently make tutor and grader share a vendor.

### Standing coupling constraint

Any tutor-routing path on which mastery verification depends **must not serve minor traffic without the grader enabled and validated**. Without the grader, mastery silently never verifies on that path — the flag-off behavior is fail-safe (empty evaluation → no mastery, no error), but it is a silent regression and unacceptable as a live posture.

## Amendment (2026-07-04) — Minor output gate: violation-only enforcement + fail-open-with-alarm

**Operator-ruled 2026-07-04 (verdict-threshold and unavailability forks, coupled)** · **Canon:** `docs/architecture.md` → "Policy-engine spine, router/vetting, safety & judge"

### What changed

The judge's **gating mode** — left open in §2 / "What this ADR does not decide" — is now **decided for minors**. The suitability judge (`runSuitabilityJudge`, previously async / calibration-only / fail-OPEN) gains a **synchronous, fail-CLOSED-on-verdict ENFORCING output gate** for under-18 traffic. It backstops the router content-category refusals (harassment / hate / adult-sexual / civic — `router.ts`) that previously had **no deterministic backstop**: the input tripwire covers only self-harm-method + sexual-minor, and the dangerous-procedure gate (MMT-ADR-0030) covers only operational how-to.

The mechanism reuses the **proven synchronous output-gate seam established by the dangerous-procedure gate** — the parsed reply post-envelope, minor-scoped (`computeAgeBracketFromDate`, fail-closed on unknown age), block-and-replace over the existing `sourceReplacement` retract rail — not a new path. `applySuitabilityGate` / `runSuitabilityEnforcement` (`services/suitability-gate.ts`) are shaped after `applyDangerousProcedureGate`; `emitSuitabilityBlockedEvent` mirrors `emitDangerousProcedureBlockedEvent`.

### The ruled gating mode

- **Block ONLY on `overall === 'violation'`.** A `concern` NEVER blocks — it is observe/telemetry only. (Ruled: violation-only, not also-concern.)
- **Category allowlist — NEVER block `over_blocking` / `topic_drift`.** Over-blocking is a hard failure equal to under-blocking (§1); an enforcing LLM judge would otherwise **become the over-blocker its own `over_blocking` flag detects**. A `violation` whose flags are exclusively allowlisted categories passes.
- **Availability: fail-OPEN-with-alarm.** A judge that cannot render a verdict (route error / no JSON / invalid schema → `runSuitabilityJudge` returns null; or an unknown tutor vendor) **fails OPEN** — the reply passes unchanged — AND raises a structured operator alarm (`emitSuitabilityJudgeUnavailableEvent`; the silent-recovery ban on safety paths forbids a bare `console.warn`). Can't-judge is not evidence the reply is unsafe. **Fail-CLOSED is reserved for a concrete `violation`.** (Ruled: fail-open-with-alarm, rejecting the fail-closed availability-cliff.)
- **Minor-only.** The gate is scoped to under-18; adults are never judged by it.

### Standing activation precondition — no enforcement without calibration

The mechanism is feature-flag-gated (`JUDGE_ENFORCEMENT_ENABLED`) and inert while off: the judge is never called when off or for adults, so first-token latency and per-turn cost are unaffected on non-enforced paths. **Enforcement may only be activated once an enforcement threshold has been calibrated from real minor-traffic `judge.verdict` data** (the async calibration dispatch, `JUDGE_FRAMEWORK_ENABLED`, is the independent mechanism that gathers it). Activating enforcement without that calibration is prohibited — an uncalibrated enforcing judge is exactly the over-blocker §1 bans. This is the async→sync move the §2 judge role always implied, scoped to the minor enforcement mode.

### Latency / cost

Enforcement is **+1 synchronous LLM round-trip per minor turn** when enabled (un-droppable — a blocking gate needs a verdict before it can block). The chosen shape keeps **first-token latency intact** (the judge runs post-stream, over the already-streamed reply, and rides the `sourceReplacement` rail to retract/replace). Rejected shapes: regenerate-once-then-block (2–3× latency/cost) and buffer-before-stream (first-token regression).
