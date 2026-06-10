# MMT-ADR-0010 — The family-join / account-consolidation primitive

**Status:** Accepted · 2026-06-03 · **Scope:** Identity Foundation — v1 "join my family" + the shared invite/consolidation primitive (pre-launch clean cut) · **Deciders:** Architect (jjoerg) + Claude · **Realizes:** PRD Part 10 §H Ripples 1 & 3 (E12/E13, D1-provisioning) · **Builds on:** MMT-ADR-0007 (Person ≠ Login), MMT-ADR-0001 (Clerk = auth only)

> **Placement.** Global L2 from birth; lockstep canon partner is the incubating ontology (§6 E12/E13/entry-point items) + `domain-model.md` §6.

## Context

Two PRD rulings put a net-new mechanism on the v1 critical path:

- **A child needs their own login attached to an existing Person** (D1: parent-adds-child "own device or yours?"; E1 self-takeover at the consent-age crossing — managed → credentialed graduation, same `person_id`, inv 20).
- **A minimal "join my family" must ship in v1** (E12, PM-elevated from Phase-D-deferred). A parent buys Family, invites their **existing-account, self-consenting teen**, the teen accepts and joins the parent's org — *without destroying the teen's learning history*. The only workaround otherwise (re-create the teen as a fresh child profile) destroys their history, the exact dead-end the foundation forbids (inv 20/21).

Both reduce to the same underlying move: **take a self-provisioned Login/Person and attach it to a family graph against an existing `person_id`, never orphaning anyone.** PRD §H Ripples 1 & 3 re-confirmed this is feasible *in the target model* and named the v1 shape; the mechanism ADR was held for the Phase-C doc-strategy call and is placed here.

A constraint from MMT-ADR-0007: the managed child is credential-less, but a child *gaining* a login, or a teen *joining*, must end up bound to a Clerk User — and we own no Clerk admin-write path today (zero `clerkClient.users.create` in the repo).

## Decision

**The join is an invite-flow built on the existing JIT account path, plus a never-orphan home-org reassignment. Provisioning is child-completes-own-login, not parent-creates-credential.**

**1. The invite/provisioning primitive (Ripple 1).** The child/teen completes their **own Clerk sign-up**; the existing JIT provisioning (`findOrCreateAccount`, `apps/api/src/middleware/account.ts`) auto-creates their account on first authenticated request. We then **attach that self-provisioned Login to the family graph against the existing `person_id`** via a named **`migration-pending`** interim state (inv 25). We do **not** call `clerkClient.users.create` (a new admin-write + a password-handoff smell). Decisive reason: the E1 self-takeover (managed → credentialed graduation) *requires* the teen to set up their own credential anyway, so invite-flow is the only mechanism coherent across both D1 and E1. inv 4 holds — an under-age self-signup still hits the consent gate (→ R3 holding until VPC).

**2. The v1 "join my family" journey (Ripple 3), for the consent-capable teen, parent-initiated:**

- **Home-org reassignment, never orphaning:** add the family Membership **before** decommissioning the teen's now-empty org-of-one (`migration-pending`, inv 21/25). The org-of-one is a *container*; the Person + history ride the `person_id` (MMT-ADR-0007).
- **The parent's resulting edge is conditional on consent status:** for a **consent-capable** teen the parent becomes **admin + Payer + an *optional* Supportership the teen grants** (inv 19 opt-in) — **never auto-Guardianship** (the teen self-consents; inv 14/19). (The below-consent-age variant, which needs Guardianship + VPC via R13, stays Phase-D-deferred.)
- **v1 collapses to a single home org** — deliberately **sidestepping multi-org federation (E7).** The cheapest honest join is a *consolidation*, not a federation; genuine multi-org governance stays Phase-D-deferred. (The consent/visibility axis of E7 is separately ruled in MMT-ADR-0008; this ADR settles the billing/quota axis: one home org owns billing + quota, inv 18.)
- **Billing fork → option B (join-with-disclaimer):** a joining teen with an active store subscription **joins immediately** (covered by the family quota seat) and **keeps paying their own store sub until they self-cancel** — store-delegated billing rules out a server-side refund/credit (`revenuecat.ts`, MMT-ADR-0002) — shown with an explicit double-charge warning + a follow-up nudge. Chosen over block-until-cancel to avoid the cross-system dead-end the UX-resilience rules forbid.

**Scope held for Phase D / later:** the below-consent-age teen join (Guardianship + VPC, R13); and **child-initiated** request-to-join (E13) — v1 is **parent-initiated invite** only. The existing child-enters-parent-email consent step is retained and is *not* a family "join". Minor-initiated **Guardianship** (a minor nominating their own consent authority) stays banned (inv 28/30, the F1-BT-a attack surface).

## Consequences

- **No history is ever destroyed to join** — the Person + learning data ride `person_id`; only the org association and an empty container change. This is what makes the PM-required journey shippable without the forbidden re-create-the-teen dead-end.
- **One reusable primitive** serves D1 add-child-own-device, E1 self-takeover, and E12 join — they are the same "attach a self-provisioned Login to an existing Person via `migration-pending`" move, not three features.
- **`migration-pending` is a named valid interim state** (inv 25) with a Failure-Modes table (Clerk sign-up fails mid-attach; the teen abandons mid-join; the membership is added but decommission fails) — no dead-ends, no orphans.
- **We own the decline/double-billing recovery UX** even though we do not own the store gate: the double-charge disclosure + nudge, and any reconciliation, must route to typed fallbacks and emit a metric/event (repo silent-recovery-banned-in-billing rule).
- **New counsel sub-item (REQ-2):** minor double-billing disclosure + grace.
- Net-new (T2+) work: the invite/attach step and the home-org reassignment transaction; physical shape is Phase E.

## Alternatives considered

1. **Parent-creates-credential** (admin-write a Clerk User for the child). Rejected — adds a new Clerk admin-write surface + a password-handoff smell, and is incoherent with the E1 self-takeover (which needs the teen to set up their *own* credential). Invite-flow is the single coherent mechanism.
2. **Defer all consolidation to Phase D / post-v1.** Rejected by the PM — leaves no clean path; the only workaround destroys the teen's history (the dead-end the foundation forbids).
3. **Federate the teen across two orgs (true multi-org) at v1.** Rejected — the cheapest honest v1 join is a *consolidation* to one home org; multi-org governance (E7) is real but not v1, and a single home org sidesteps it entirely.
4. **Block the join until the teen cancels their store sub** (billing option A). Rejected — store-delegated billing can't refund server-side, so blocking creates a cross-system dead-end; option B (join now, disclose the overlap, nudge to cancel) honors UX-resilience.
5. **Allow child-initiated guardianship/consolidation in v1.** Rejected — minor-initiated Guardianship is banned (assurance/consent attack surface); the legitimate "minor reaches out first" path is a *request to join* that an adult accepts with VPC, and it stays Phase-D-deferred (v1 is parent-initiated).
