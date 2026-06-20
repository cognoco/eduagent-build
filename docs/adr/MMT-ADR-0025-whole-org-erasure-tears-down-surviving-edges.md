# MMT-ADR-0025 — Whole-org erasure tears down the otherwise-surviving relationship edges

**Status:** Proposed · 2026-06-20 · *(pre-live: edited in place; human-Architecture sign-off pending — MMT-ADR-0000 Part II override)* · **Class:** Architecture — data model / GDPR erasure · **Scope:** Identity Foundation — `executeDeletionV2` whole-org/whole-account deletion path · **Deciders:** drafted by Claude (WI-849); **Architecture sign-off PENDING** · **Builds on:** MMT-ADR-0007 (person/edge model), MMT-ADR-0008 (guardianship global edge), MMT-ADR-0011/0020 (data-model realization) · **Relates:** WI-849 (this build), WI-885 (subscription store-cancellation, deferred)

> **Placement.** Global L2 from birth; lockstep canon partner is `docs/canon/identity/data-model.md` §3.2 (the retain-tier split diagram) + §6.1 (deletion failure-modes), edited in the same change-set.

## Context

The ratified retain-tier split (`data-model.md` §3.2, realized in MMT-ADR-0011) defines deletion at **person granularity**: when a single `person` is hard-deleted, its `consent_grant` rows re-home to `consent_receipt`, learning data cascades away, and the audit/financial retain rows are written — while `subscription`, `guardianship`, and `supportership` are drawn as **surviving** the delete. The `*_person_id ON DELETE RESTRICT` FKs on those three edges are **load-bearing**: they make "delete a person still anchoring a live edge" fail by design, forcing the caller to re-home/tear-down first. §6.1's failure-mode table encodes the same person-granularity rule ("the RESTRICT is the schema's way of saying you forgot to move the records first").

But there is a **second deletion granularity the canon never described**: the **whole-org / whole-account erasure** — the GDPR Art-17 right-to-erasure path `executeDeletionV2` implements. It deletes the `organization` and **every** `person` in it. For that path the §3.2 "survives" column is wrong: a guardianship or supportership edge anchored on a person who is being erased cannot survive — the person on (at least) one end is gone. With the RESTRICT FKs in place and no edge teardown, `executeDeletionV2` **aborts the whole transaction** the moment it tries to drop a person who sits on either end of any guardianship/supportership edge (active *or* revoked) — a GDPR erasure that simply *fails* for any account in a family/supporter relationship (WI-825 audit, WI-849 Gap 3).

A subtlety the whole-org path must get right: an edge can be **cross-org** — a guardian or supporter who lives in a *different* org may anchor an edge onto a person in the org being erased. Erasing the org must not reach across and delete that outside human.

## Decision

**A whole-org/whole-account erasure (`executeDeletionV2`) tears down every guardianship and supportership edge *incident to the erased org's persons*, in the same transaction, before the person rows drop. The person-granularity delete paths are unchanged: there, the edges still survive and the RESTRICT FKs remain load-bearing.**

- **Edge teardown is incident-scoped and bidirectional.** For the set `P` of persons in the org being erased, delete every `guardianship` row where `guardian_person_id ∈ P OR charge_person_id ∈ P`, and every `supportership` row where `supporter_person_id ∈ P OR supportee_person_id ∈ P`. Active and revoked rows alike (a revoked row still carries a RESTRICT FK).
- **Cross-org edges drop the edge, never the counterpart person.** When only one endpoint is in `P`, only the **edge row** is deleted; the out-of-org counterpart `person` and their own org are untouched. The relationship to an erased person ceases to exist; the other human does not.
- **The RESTRICT FKs stay.** No schema migration, no relaxation of `onDelete`. The constraints remain the correct guard for the person-granularity paths; the whole-org path simply satisfies them by removing the incident edges first (the same pattern the consent-grant re-home already uses to satisfy the consent_grant RESTRICT).

**Out of scope of this decision (recorded so the boundary is explicit):**

- **Subscription DB-row teardown (WI-849 Gap 1) is solved** in `executeDeletionV2` (Step G1): the subscription row(s) for the org are deleted before the person/org drops, satisfying both RESTRICT FKs; `subscription_payers` cascade off automatically. The Stripe/RC **store-cancellation** (billing-domain API call) is still deferred to WI-885.
- **Legacy `accounts` erasure (WI-849 Gap 2 — ruled MOOT 2026-06-20 (operator)).** The audit posited that `executeDeletionV2` leaves the pre-cutover legacy `accounts` row (and its cascaded `profiles`/learning-data PII) behind. On the environments where `executeDeletionV2` actually runs — staging (`ep-fancy-cherry`) and prod, both rebuilt by the MMT-ADR-0012 one-time baseline reset — the legacy `accounts`/`profiles` tables **do not physically exist** (verified against staging 2026-06-20), so there is no legacy PII to survive and a `DELETE FROM accounts` would raise `relation "accounts" does not exist`. No v2-live environment retains the legacy accounts/profiles tables; Gap 2 CLOSED not deferred.

## Consequences

- **GDPR Art-17 erasure succeeds for family/supporter accounts** (the common real case) instead of aborting on a RESTRICT FK. This is the WI-849 Gap-3 fix.
- **The edge rows do not leak into the retain tier.** Unlike `consent_grant` (which re-homes to `consent_receipt` because the consent receipt must outlive the person for audit), guardianship/supportership carry no retain-tier obligation — the relationship is extinguished by the erasure, so a hard delete is correct. (If a future legal/audit requirement names a retain duty for relationship history, that is a new additive decision, not a change here.)
- **Two deletion granularities now coexist explicitly** in canon: person-granularity (edges survive; RESTRICT load-bearing) and whole-org erasure (incident edges torn down). §3.2 / §6.1 are updated to name both.
- **No schema change**, so no migration, no rollback surface, and the person-granularity guarantees are untouched.
- **A subscribed-account erasure now succeeds** (DB-row teardown in Step G1). The remaining open item is the Stripe/RC store-cancellation API call, deferred to WI-885.

## Alternatives considered

1. **Relax the edge FKs to `ON DELETE CASCADE` (schema migration).** Rejected — cascade is indiscriminate: a person-granularity delete would then silently destroy a still-valid relationship to a *surviving* person, and a cross-org cascade could delete an edge the other org still relies on without that org's path knowing. The RESTRICT-plus-explicit-teardown pattern keeps the person-granularity guard intact and makes the whole-org teardown auditable and intentional.
2. **Re-home guardianship/supportership to a retain-tier table (mirror the consent_grant pattern).** Rejected — there is no audit/legal duty to preserve a relationship edge past the erasure of one of its humans (unlike the consent receipt, which is a named GDPR-accountability artifact). Adding a retain table would be speculative machinery (Simplicity First).
3. **Delete the counterpart person on a cross-org edge.** Rejected — it would erase an unrelated human (and their org) as a side effect of another org's deletion; a gross over-reach and a data-loss bug. Only the incident edge is severed.
4. **Solve full subscription teardown here (Gap 1).** The DB-row teardown IS solved here (Step G1). The store-cancellation API call (Stripe/RC) remains deferred to WI-885 because it carries billing-domain side effects (chargeback retain, store entitlement revocation) outside the scope of this erasure transaction.
