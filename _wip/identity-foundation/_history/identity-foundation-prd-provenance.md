# `identity-foundation-prd.md` — extracted provenance (Phase J0 scrub, 2026-06-08)

The PRD's **decision-queue machinery** (sign-off model, per-item `[T✓ · P …]` markers, ripple process),
the **counsel-session legal register** (§I + Segments 2–5), the **code-verification log**, and the
**Phase-E fillers** lifted out of `identity-foundation-prd.md` when it was scrubbed for graduation to
`docs/canon/identity/prd.md`. **Not canon.**

**Non-destructive note.** The original 2426-line PRD is preserved verbatim in **git history** (the
pre-scrub commit on this branch). This file is a **navigable condensation** of the moved material, not a
re-paste — it records *where each thing went* so a future reader can trace a graduated rule back to its
deliberation.

**Where the moved material graduated to:**
- **Settled product/UX rulings** (§D D1–D4, §E E0–E13, §F F1) → the graduated PRD **Part 10 (Settled
  product & UX rulings)** + Parts 5–8, as body canon (stripped of sign-off markers + deliberation).
- **The four B-ripples** (§H: durable scheduler, last-guardian/inv-21 amend, child-own-login invite-flow,
  join-my-family v1) → realized in `MMT-ADR-0009`/`0010` + ontology inv 21/24/25 + `data-model.md`.
- **Compliance obligations** (§I counsel register + Segments 2–5 + Phase-E fillers) →
  `identity-compliance-register.md` (graduates to `docs/compliance/`). Full counsel deliberation stays in
  git history.

Terminology note: this file preserves the **original** terms (`mentor`/`mentee`/`mentorship` human
capacity; AI "Mate"); the live rename is `mentor`(human)→`supporter`, `mentorship`→`supportership`,
`mentee`→`supportee`, and the AI takes the name `mentor` (no "Mate" copy sweep).

---

## Preamble status / Doc-2 framing (removed)

> **Status:** DRAFT, 2026-06-02. Built bottom-up from `identity-ontology.md` (RATIFIED v1) + `CONTEXT.md`
> identity glossary. The "anchored spine": Parts 1–9 carry inline anchors; everything from the prior
> reconstructed-PRD (Doc 2) that could not be anchored was held in Part 10 as a candidate awaiting a
> ruling, never laundered into the body. (Doc 2 carried ≥3 errors the ontology corrected: learner-
> universal, "Clerk Orgs for access", mentor-as-a-role.)

Current truth: the graduated PRD's Parts 1–10 are all ratified body canon; the decision-queue framing
served its purpose and is retired.

---

## Sign-off model + ripple rule (decision-queue machinery — retired)

Two-axis sign-off governed Part 10 while it was a live queue: **`T`** (architecture: derivation correct,
foundation accommodates it under current scope) and **`P`** (product: functionally complete + final).
Per-item marker `[T✓ YYYY-MM-DD · P pending]`; an item settled into the body only when every applicable
axis was ✓. The **ripple rule**: a `T✓` certified feasibility *for current scope*; if a later PM pass
added a persona/journey, any `T✓` whose foundation it touched reverted to `T pending`. Architecture /
data-model / invariant-derivation items were `T`-only; personas/journeys/UX were `T+P`; legal/compliance
stayed outside `T/P` as `[ANCHORED-OPEN]`. All items have since settled; the machinery is removed.

---

## §A–§C — Personas, journeys, vision (condensed)

- **§A Personas.** Five derived personas adopted (anchored, not Doc-2-trusted): solo adult; independent
  consent-capable minor; charge (guardian-managed); family operator (admin + guardian×N + Payer ±
  learner); supporter/tutor (any age, edge-only). Plus the managed-adult "grandparent" (UC-1). →
  graduated PRD Part 2 / Part 5.
- **§B Journeys & failure-mode tables.** The R1–R13 *requirements* are anchored in Part 7; the detailed
  walk-throughs (screens, copy, per-state Failure-Modes tables) are spec/plan-layer authoring, not PRD
  altitude — deferred to the spec layer.
- **§C Vision & audience framing.** Doc-2 Parts I–II framing; superseded by the ratified model.

---

## §H — Phase-B ripple closure (2026-06-03) → ADRs

All four ripples the B-product pass reopened resolved to `T✓`; Phase B's exit gate met, D-ratify
unblocked. The two net-new mechanisms got ADRs:

1. **Ripple 4 — durable scheduler (inv 24).** Feasible on the existing Inngest rail, zero new infra: a
   cron + per-Person fan-out mirroring `daily-snapshot.ts`, idempotency `personId+day`. Three consumers:
   birthday/age-cross, residence re-eval, inactivity-expiry. → `MMT-ADR-0009`.
2. **Ripple 2 — E5 last-guardian.** inv 21 amended in canon (explicit audited guardian-initiated delete
   ≠ silent cascade); abandonment fallback rides the scheduler + warn/export window; delete-authority
   follows consent-authority. → ontology inv 21 + ROADMAP counsel items.
3. **Ripple 1 — child-own-login provisioning.** The child completes their own Clerk sign-up (JIT
   `findOrCreateAccount`), not parent-creates-credential; attach to the family graph against the existing
   `person_id` via a `migration-pending` interim. → `MMT-ADR-0010`.
4. **Ripple 3 — "join my family" v1.** Ripple-1 join primitive + home-org reassignment (add Membership
   before decommission) + teen-opt-in Supportership (no auto-Guardianship) + billing reconciliation;
   v1 collapses to a single home org (sidesteps multi-org federation). Billing fork = option B
   (join-with-disclaimer; double-charge warning). → `MMT-ADR-0010`.

---

## §I counsel register + Segments 2–5 + §I code-verification log + Phase-E fillers (condensed)

The counsel walkthrough (2026-06-03) and the Phase-E filler walkthrough (2026-06-04) produced the legal/
compliance outcomes now distilled into `identity-compliance-register.md`. Structure of the original
(full text in git history):

- **§I-0 three-bucket model** ("not every user is a child"): adult / consent-capable minor / consent-
  gated charge — the cross-cutting frame counsel applied before per-topic rulings.
- **§I-A — AI/LLM exposure:** all minors pinned to one papered LLM endpoint (guard test); `lawful_basis`/
  `termsAccepted` recorded; AI-training toggle must not render for minor profiles; disclose profiling as
  present & lawful (GDPR Art 13(2)(f)) — never claim ADM engineered-out.
- **§I-C — deletion/retention:** the S1–S8 survivor table + `legal_hold` flag blocks every delete path;
  retain-tier write captured at event-time; eight conditions for lawful guardian-initiated child delete;
  scheduler runs at profile granularity for child profiles; re-point control in place, never fork.
- **§I-E — EU AI Act / OSA / DPIA:** no emotion/intention inferred from biometrics (voice = transcription
  only); internal-state vocabulary functional-only (CI static-analysis guard); two OSA forward-only
  guards (no verbatim learner-quote in guardian schema); DPIA-complete-before-first-real-child launch
  gate + DPO appointment mandatory.
- **§I-P / §I-L — locked product parameters:** signup floor 13+; retention periods; dormancy 24mo /
  30-day notice; moved-country grace; boundary-crossing verification methods; co-guardian one-of/all-of.
- **§I code-verification log** ("verify, don't trust"): every load-bearing premise checked against code,
  not assumed — the live `getFamilyOwnerProfileId` self-fallback bug, the `onDelete:'cascade'` consent
  defect, the write-then-delete defect, the `MINIMUM_AGE=11` floor. These are the drift the clean cut
  fixes; the code cites are pre-cut and rot (see `data-model-provenance.md` code-citation list).
- **Phase-E fillers (2026-06-04):** the policy-engine / router / capability-split amendments realized in
  `MMT-ADR-0013/0014/0015` + `data-model.md` §2A.

The locked product parameters + the binding compliance rules graduate via
`identity-compliance-register.md`; the deliberation, the `basis:` citations, and the per-segment counsel
narrative remain in git history.
