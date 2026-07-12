---
title: One-Way Door Risk Drain - Implementation Plan
date: 2026-07-12
profile: design
spec: docs/audit/2026-07-12-one-way-door-risk-register.md
status: draft
---

# One-Way Door Risk Drain - Implementation Plan

**Goal:** Convert the first-pass one-way-door audit into explicit owner work, governance records, and verification gates, anchored to the event that would actually turn each risk into lock-in.

**Approach:** Treat the audit as evidence, not as the work queue. The app is pre-launch with zero real users, so data-recovery, OTA-stranding, and billing-migration regret are discounted until their gate events. The real current doors are schema shape that ossifies in code, release mechanics already in use, external/compliance papering, and store/provider contracts once live. Work should create or update the smallest owner-facing artifact for each gate: canon amendment, runbook, release ADR, existing-plan precondition, or Cosmo Work Item.

## Surface Map

Expected files to create or change:

- `docs/audit/2026-07-12-one-way-door-risk-register.md` - source evidence and risk inventory; keep as the audit record.
- `docs/plans/2026-07-12-one-way-door-risk-drain.md` - execution plan and action ledger for the audit drain.
- `docs/adr/` - target home for genuinely new architecture decisions that need formal status, alternatives, and consequences.
- `docs/canon/identity/` - target home for identity/person-scope/deletion amendments; identity already has substantial canon and ADR coverage.
- `docs/deployment-and-secrets.md` or a new release ADR - target home for mobile runtime-version, build-time flag, and OTA/native release gates.
- `docs/registers/llm-models/master.md` and LLM ADRs - target home for provider eligibility and re-admission notes where existing gates are not enough.
- `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md` - target home for V2 shell deletion preconditions at S6 execution time, not do-now work.
- Cosmo Work Items - target home for owner-assigned execution tasks after deduping existing work.

Out of scope:

- Running S6 deletion, production OTA, native release, data migration, billing product change, or provider removal.
- Hand-editing Cosmo lifecycle fields.
- Changing application code before the relevant ADR/canon/runbook owner work is accepted.

## Priority Bands

| Priority | Meaning | Items |
|---|---|---|
| P0-now | Small governance artifact needed before current launch/release work proceeds. | T1, T2, T3, T5, T8, T10 |
| P0-gated | Required before a later irreversible gate event, but not a Ready-queue item today. | T4 |
| P1 | Should be recorded before paid launch, public roadmap commitment, or broad production scaling. | T6, T7 |
| P2 | Governance hygiene or already-gated risk; capture as note/backlog, not launch-blocking work. | T9, T11 |

## Tasks

- [ ] T1: Convert the risk register into gate-anchored owner work - done when each of the 14 Top Risks has one recorded disposition in this plan or Cosmo: `accept as governed`, `needs canon amendment`, `needs runbook`, `needs release ADR`, `needs Work Item`, `gate precondition`, or `retire as duplicate`; each disposition names the owner function, target artifact, and gate event that makes it urgent.

- [ ] T2: Amend identity canon for forward repair - done when existing identity canon states that legacy rollback is no longer the recovery path, names the forward-repair primitives required for `person_id` mistakes, and links recovery verification to a Neon PITR/snapshot runbook plus person merge/reparent/alias follow-up work. Do not draft a new identity ADR unless the amendment conflicts with existing ADRs `MMT-ADR-0007`, `0008`, `0011`, `0015`, or `0020`.

- [ ] T3: Harden account/person deletion recovery and audit proof - done when deletion docs or runbooks name the irreversible boundary between grace-period cancellation, database deletion, retain artifacts, and external Clerk erasure; the artifact also states the export-before-delete UX expectation and the dead-letter procedure for partial external deletion.

- [ ] T4: Anchor S6 refresh as an execution precondition - done when this plan records S6 as already governed by its deferred/irreversible protocol, and the S6 plan has a pre-execution checklist item: before starting T10/T11 deletion work, refresh anchors, confirm `MMT-ADR-0024` status if any deletion depends on scope-chip semantics, keep the T9 flag flip separate from T10/T11 deletion work, and restate that rollback is no longer a flag flip or OTA. This is a pre-S6 gate, not do-now launch work.

- [ ] T5: Formalize the mobile release one-way-door rule - done when a release ADR or deployment canon states the `runtimeVersion` and build-time flag rule, names the fallback channel, lists the native-change review guard, and includes an EAS-profile verification recipe that checks `MODE_NAV` flags and API compatibility before production rollout.

- [ ] T6: Document billing external-contract escape hatches after RevenueCat verification - done when store products are created and sandbox purchase -> RevenueCat webhook -> API entitlement/quota sync has been verified; then the billing runbook states product-ID migration strategy, old-and-new entitlement support rule, webhook/support recovery path, and the boundary where Stripe remains dormant for web/B2B instead of mobile digital goods.

- [ ] T7: Make LLM contract evolution explicit - done when the LLM orchestrator, envelope, Challenge Round, and `app/session.completed` contracts have one linked evolution rule each: how to add fields, when to version or create a new event, which guard or eval proves compatibility, and which owner approves breaking changes.

- [ ] T8: Dedupe and close compliance launch-blocker ownership gaps - done when existing compliance WIs are queried first, then only genuinely uncovered blockers get new work. Adult lawful-basis evidence, processor DPA/transfer papering, 13+ launch floor changes, and consent-withdrawal bearer-token threat posture each have an owner, close artifact, and engineering acceptance criterion; if tracked in Cosmo, the Work Item names both counsel/DPO and engineering deliverables.

- [ ] T9: Add a Gemini/Vertex re-admission note only if still absent - done when the model register or Gemini cutover plan contains one sentence that re-admission requires a new vetting row, policy row, and eval baseline. Do not block runtime removal on this unless the existing soak, key-retention, rollback, and `FALLBACK_FORBIDDEN` gates have regressed.

- [ ] T10: Drain under-recorded decision gaps with ceremony scaled to risk - done when mobile runtime/flags has a release ADR or deployment-canon rule, `MMT-ADR-0024` scope-chip status is resolved before S5/S6 relies on it, adult compliance blocker ownership is covered by T8, and the remaining three gaps are explicitly accepted as already governed unless they recur: global `@tanstack/query-core` override and `analogyDomain` tri-state PATCH carve-out live in checked-in `AGENTS.md` Known Exceptions, and adult catastrophic procedure widening is already an operator-ruling requirement in `MMT-ADR-0030`.

- [ ] T11: Run the stricter second-pass decision audit - done when the grandfathered decision-block baseline is reviewed file by file, each live block is classified as covered by ADR/canon, obsolete, duplicate, or needing owner work, and the output is a small backlog of ADR/canon drains rather than another broad risk register.

## Action Ledger

| Source risk / gap | Next action | Owner function | Gate event | Target artifact | Priority | Verification |
|---|---|---|---|---|---|---|
| Identity-v2 cutover; `person_id` permanent scope key | Amend existing canon for forward repair; add PITR/recovery runbook. | Architecture + backend platform | Before further schema/code work ossifies person scope. | Identity canon amendment; recovery runbook | P0-now | Canon links to PITR/snapshot runbook and names merge/reparent/alias follow-up Work Items. |
| Account/person deletion | Record grace, export, retain-artifact, Clerk-erasure, and dead-letter procedure. | Counsel/DPO + backend platform | Before first real user deletion or consent-withdrawal deletion. | Deletion runbook or compliance canon | P0-now | Runbook distinguishes reversible and irreversible stages with close artifacts. |
| S6 V2 shell cutover/deletion | Treat as already governed; add/confirm pre-T10/T11 refresh checklist only. | Product + mobile architecture | Immediately before S6 destructive deletion work, not now. | S6 plan | P0-gated | S6 plan contains separate flag-flip and deletion gates plus human confirmation text. |
| Mobile release mechanics | Add release one-way-door rule. | Mobile release | Before production OTA/native release that depends on build-time flags or native API compatibility. | Release ADR or deployment canon | P0-now | EAS profile verification recipe exists and names runtime-version review guard. |
| RevenueCat/IAP-first billing | Wait for RC/store verification, then record product-ID and entitlement migration escape hatches. | Product + billing platform | After first store products + sandbox purchase/webhook sync are real; before paid launch. | Billing runbook | P1 | Runbook covers old/new IDs, webhook recovery, and Stripe dormant boundary. |
| LLM orchestrator, envelope, Challenge Round, `app/session.completed` | Record contract evolution rules and compatibility checks. | AI platform + schemas + backend platform | Before broad production scaling or breaking/field-removal changes. | LLM ADRs/registers and event docs | P1 | Each contract has add/version/breaking-change rule plus guard/eval. |
| 13+ launch floor, adult legal basis, DPAs/transfers, consent token | Query existing compliance WIs, then assign owners only for uncovered blockers. | Counsel/DPO + product + backend platform | Before first real consent-gated child / store submission final gate. | Compliance register and deduped Cosmo WIs | P0-now | Each uncovered blocker has owner, acceptance criterion, and completion evidence path. |
| Gemini/Vertex exclusion | Add one re-admission sentence if absent; otherwise accept as governed. | AI platform + counsel/DPO | Before any future re-admission; not a blocker for current removal if existing gates hold. | Model register or Gemini cutover plan | P2 | Existing soak/key-retention/rollback/`FALLBACK_FORBIDDEN` gates remain intact; note says re-admission requires new vetting + policy + eval baseline. |
| Web parent-control-center strategy | Record product checkpoint before full web learning commitment. | Product + platform | Before committing to web learning, web payment rail, or web session UI. | Strategy doc or web ADR | P1 | Artifact states trigger for web learning investment and current mobile-first boundary. |
| Under-recorded decisions | Promote only release flags and `MMT-ADR-0024`; accept AGENTS-known exceptions unless they recur. | Architecture + owning platform areas | Before mobile release/S5/S6 reliance; otherwise on recurrence. | Release ADR; ADR-0024 acceptance or non-reliance note; checked-in exception notes | P0-now | Each gap has a linked artifact or a written duplicate/not-needed ruling. |
| Decision-block baseline | Run stricter second-pass audit. | Architecture | After P0-now drains, before broad governance cleanup. | Audit follow-up + ADR/canon backlog | P2 | Output classifies every live grandfathered decision block. |

## Execution Notes

- Start with T1 so owner routing is explicit before creating Work Items.
- Before creating any Cosmo Work Item, query existing WIs and attach to the existing one if it already owns the gate.
- Do T2, T3, T5, T8, and the release/scope-chip parts of T10 before current launch/release work that depends on them.
- Keep T4 Parked/Backlog until S6 execution is actually being prepared; do not let it compete with launch work today.
- Keep T9 as a note/backlog item unless the Gemini cutover gates regress.
- Do T6 only after RevenueCat/store product setup and sandbox purchase/webhook verification are real.
- Keep the audit register stable except for links to accepted follow-up artifacts; the plan is the mutable action ledger.
- When creating Cosmo Work Items, cut them per target artifact, not per broad risk area. A reviewable WI should look like "write PITR recovery runbook + link identity canon," not "identity governance."

