# MMT-ADR-0002 — Payer capacity is store-delegated (not self-adjudicated by age)

**Status:** Accepted (Product-intent review, 2026-06-02) · **Scope:** Identity Foundation — Payer / billing capacity
**Deciders:** PM (technical/architecture reviewer) + Claude · **Amends:** `identity-ontology.md` inv 17 / inv 10 / §2.4 / §3.2 (ontology **v1.1**; §R entry 2026-06-02)

> **Placement note:** Phase C ruled the ADR naming standard (`MMT-ADR-NNNN`) in `MMT-ADR-0003`; this ADR was
> renamed accordingly (`aka ADR 0002` in pre-Phase-C references). It still **lives in
> `_wip/identity-foundation/adr/`** — the *physical* home of the decisions layer is deferred to follow-up
> **F-PLACEMENT**. Naming is settled; placement is not.

## Context

Ontology v1 (RATIFIED 2026-06-01) encoded Payer eligibility as a rung on the age ladder: *"the 18
payer/contract rung and the 13–16 consent rung are the same age ladder, different thresholds"* (§R), with
inv 17 stating a flat **Payer ≥ 18**.

On review during the Phase-B product-intent pass, that self-imposed ≥18 gate proves **impractical on the only
payment channel that exists or is planned for the foreseeable future — the app stores (Apple / Google IAP):**

- We do not hard-verify age; an enforced ≥18 gate would run against **self-declared** age. It would **block
  an honest, legally-capable 16-year-old** (e.g. a Norwegian teen with their own store account and debit
  card) while being **trivially bypassed by a misdeclaration** ("18+").
- It is **redundant** for the case it nominally protects: a genuinely young / child store account already has
  payment routed to the family organizer via Family Sharing / Ask-to-Buy. The store is the **merchant of
  record** and already adjudicates payment capacity, jurisdiction-aware.

This is not a design change but a **rectification** of an impact we did not fully appreciate at v1
ratification. The decision is **safe** because Payer is **access-inert** (no learning-data access, inv 17)
and **orthogonal to consent** (inv 22): relaxing the payment gate does not touch the child-consent floor.

## Decision

**Payer *capacity* is delegated, not adjudicated by us.**

- **For store-mediated payment** (the only channel for the foreseeable future): the **store is merchant of
  record and the sole capacity adjudicator.** We impose **no age gate of our own** — we do not pre-gate the
  subscribe action by age; the store's purchase flow is the adjudicator (it completes → there is a valid
  Payer; it declines → no purchase, the user stays on free/holding).
- **A flat ≥18 worst-case default** (inv 29 pattern) governs **only** a future **non-store** rail (e.g. direct
  / web / Stripe), where no store is merchant of record and capacity adjudication is unavoidably ours. Even
  there it is a **blunt default, not a `jurisdiction × age` derivation engine** — per-jurisdiction relaxation
  remains available as config under inv 29, **unbuilt unless a direct rail justifies it**.

Rationale for the asymmetry (derive precisely for consent, default bluntly for payment): over-restricting
**payment** is harmless — an adult Payer can always be attached (R11) — whereas over-restricting **consent**
would block lawful learning.

## Consequences

- A **consent-capable minor** (≥ consent age, < 18) may **self-pay** where their store account permits;
  otherwise an adult Payer is attached. A **charge** (below the consent floor) never reaches the self-pay
  flow — it cannot self-serve (R2) — so this relaxation cannot leak down to young children.
- **`minor` is no longer a Payer bar** on the store rail; it is the contract threshold only on a future
  non-store rail (CONTEXT: minor, amended v1.1).
- We **own the decline-recovery UX** even though we do not own the gate: an opaque store rejection must route
  to a typed fallback + named holding state (repo UX-resilience), and refund/chargeback must reconcile to
  entitlement state with a metric/event (repo: silent-recovery-banned in billing).
- **Carried open (not closed here):**
  - **E3 — recorded-Payer identity under Family Sharing / Ask-to-Buy.** The store may complete a purchase
    initiated by a teen but *paid by the family organizer*; which Person we **record** as Payer is the active
    downstream question. → Phase D/E (data model). Bounded blast radius: Payer is access-inert, so imperfect
    identity is a billing-attribution issue, **not** a security/privacy boundary.
  - **Under-18 *exposure*** — whether the product *surfaces* self-pay to under-18s at all is a product/brand
    call (PRD, **P-axis**), distinct from the capacity *mechanism* ratified here (**T-axis**).
  - **FLAG-2 / REQ-2** — app-store family policy + app rating, and service-contract capacity, gate paid
    launch (counsel).

## Alternatives considered

1. **Keep ≥18 and enforce it.** Rejected: incoherent on a store-only channel — blocks honest legal payers,
   bypassed by misdeclaration, redundant with the store's own family-payment routing.
2. **Keep ≥18 in canon, do not enforce.** Rejected: canon asserting an unenforced rule is the
   "wired-but-untriggered / false-confidence" failure the repo bans.
3. **Record the decision but defer the body cascade.** Rejected: a §R log saying "store-delegated" while inv
   17's body still says "≥18" is exactly the body/log drift the ontology exists to prevent. Partial is the
   real risk; breadth is tedium.
4. **Delegate to the store; flat ≥18 only on a future non-store rail.** **Chosen.**
