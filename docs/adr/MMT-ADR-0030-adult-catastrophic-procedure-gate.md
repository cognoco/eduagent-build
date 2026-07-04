# MMT-ADR-0030 — The dangerous-procedure gate extends to adults for a catastrophic CBRN + explosive-device subset

**Status:** Accepted · 2026-07-04 · **Scope:** All production tutor-reply safety gating (`services/dangerous-procedure-gate.ts` call sites) · **Deciders:** Architect (jjoerg) — operator ruling se-031 (Option A, D3=YES) · **Builds on:** MMT-ADR-0016 (safety & judge architecture)

## Context

The deterministic dangerous-procedure reply gate landed in WI-1154 as a **minor-only** floor: `applyDangerousProcedureGate` neutralizes a tutor reply that carries operational how-to for a controlled/dangerous item (drug synthesis, weapon fabrication, poison recipe, explosive assembly), but only when the learner is a minor. For adults it returned the reply unchanged — an unconditional short-circuit (`if (!opts.isMinor) return … blocked: false`). That reflected the product's deliberate **adult-latitude** posture: adults get frank, uncensored answers, and the app imposes no content constraint on them. There was, until now, **no adult-facing content gate of any kind**.

That posture is correct for the dual-use middle of the distribution — general chemistry, pharmacology, energetics, weapons history, even a candid drug-harm conversation — where MMT-ADR-0016 §1 holds: safety is judgment of *handling*, there is no app-owned denylist, and **over-blocking a legitimate question is a hard failure equal to under-blocking**. But it left one tail uncovered: an adult account could obtain step-by-step **mass-casualty** construction instructions — how to synthesize a nerve agent, weaponize a pathogen, build a radiological or nuclear device, or assemble an IED — with no floor at all. That is the same category of catastrophic, near-zero-legitimate-need harm that MMT-ADR-0016's `safety-tripwire.ts` already treats specially for its two catastrophic categories (self-harm method-seeking, CSAM); it was simply never extended to the CBRN/explosive-construction class, and the dangerous-procedure gate that *does* cover that class was age-scoped to minors.

This is architecturally significant on three of the §II.1 triggers: it **moves a quality attribute** (safety), it **constrains others** (establishes the first adult content invariant future work must respect), and it sits against the documented "no denylist / over-blocking is a hard failure" principle (comply-or-explain). Hence this ADR, in lockstep with the canon line it adds.

## Decision

1. **The gate extends to adults for a narrow catastrophic subset only.** For adult traffic, `applyDangerousProcedureGate` now enforces a deterministic floor over exactly two categories:
   - **CBRN weapons** — chemical (sarin, VX, tabun, soman, nerve agents, mustard gas/agent, phosgene, "chemical weapon"), biological (ricin, anthrax, botulinum toxin, "bioweapon"/"biological weapon"), and radiological/nuclear ("nuclear weapon/device/bomb", "radiological weapon/dispersal", "weapons-grade") agents; and
   - **explosive-device construction** — IEDs and the high explosives used to build them (bomb, IED, C-4, RDX, PETN, HMX, TATP, ANFO, TNT, dynamite, nitroglycerin, thermite, detonators, blasting caps, "explosive device").

2. **The subset boundary is EXACTLY these categories, and nothing else for adults.** All other adult latitude stays open and untouched: general chemistry, pharmacology, energetics education, weapons history, and — deliberately — the non-catastrophic drug/weapon/poison how-to that the minor gate blocks (e.g. an opium→heroin extraction recipe is left unchanged for an adult). Over-blocking an adult on any of this is a failure, per MMT-ADR-0016 §1, which this decision does not weaken.

3. **This is not a denylist and does not reverse MMT-ADR-0016.** The gate is high-precision and intent-shaped, exactly like `safety-tripwire.ts`: a hit requires **both** an in-scope item term **and** an actionable how-to structure (an enumerated step sequence with a production/recipe verb, or an imperative/second-person production action). Naming, describing, or explaining the danger of any of these items never trips it. It is the same sanctioned deterministic-floor exception MMT-ADR-0016 §Consequences already carved for its catastrophic categories, now (a) widened to a third catastrophic class and (b) applied age-agnostically rather than minors-only.

4. **Minor protection remains a superset of adult protection.** Minors keep the full gate (every controlled/dangerous item), with the catastrophic subset unioned in, so a minor can never slip a CBRN/explosive how-to that an adult would be blocked from. The two detectors (`detectDangerousProcedureLeak`, `detectCatastrophicProcedureLeak`) share identical how-to-structure logic and differ only in item vocabulary.

5. **Widening the subset is an operator ruling, not an engineering call.** Any future addition of a category to the adult subset requires a new operator ruling amending this ADR. Engineers may fix precision bugs within the two categories; they may not broaden the boundary.

## Consequences

- Adults now receive the harm-education-preserving refusal (`dangerousProcedureRefusalResponse()`) for an in-scope catastrophic how-to, and a `dangerous_procedure_blocked` structured event fires — identical mechanics to the existing minor path, at the same two call sites (`services/exchanges.ts`, `services/session/session-exchange.ts`).
- This is the **first adult-facing content constraint** in the product. It is deliberately the narrowest possible one; it does not open the door to a general adult content policy, and future work must not treat it as precedent for one.
- The safety-guards register row for this gate (`docs/registers/safety-guards/master.md` #1) is updated to record the adult catastrophic scope, with a new trail record.
- No prompt files changed, so the LLM eval harness is not implicated; no schema or DB change.

## Alternatives considered

1. **Leave the gate minor-only (status quo).** Rejected — leaves adult accounts able to obtain mass-casualty CBRN/IED construction instructions with no floor, the one catastrophic tail the adult-latitude posture never intended to protect.
2. **Extend the full dangerous-procedure gate to adults (drugs, firearms, poisons included).** Rejected — that is exactly the over-blocking MMT-ADR-0016 §1 forbids; it would erode the deliberate adult-latitude posture across the dual-use middle (drug-harm talk, energetics, pharmacology) where frank answers are the product.
3. **A judge-based (LLM) adult catastrophic classifier instead of the deterministic gate.** Rejected for this floor — the deterministic gate is the established backstop precisely because a prompt/judge cannot be defended by a deterministic test and regresses silently on a weak/jailbroken model (the WI-1154 rationale). The judge remains the primary safety mechanism; this is the last-resort floor beneath it.
4. **Broaden the catastrophic vocabulary further (all toxicology, all firearms, cyber-weapons).** Rejected — scope creep. The boundary is fixed at CBRN + explosive-device construction; widening needs a fresh operator ruling (Decision §5).

## Links

- `apps/api/src/services/dangerous-procedure-gate.ts` — the detectors and the age-scoped `applyDangerousProcedureGate`.
- `docs/architecture.md` → "Policy-engine spine, router/vetting, safety & judge" — the canon line this ADR lands in lockstep.
- `docs/registers/safety-guards/master.md` #1 + `trail/2026-07-04-adult-catastrophic-scope.md` — the L3 guard ledger record.
- `MMT-ADR-0016` — judgment-based safety, no denylist, over-blocking is a hard failure, and the catastrophic-category tripwire exception this decision extends.
