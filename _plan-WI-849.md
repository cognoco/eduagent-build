# _plan-WI-849 — Fix v2 account-deletion GDPR gaps (executeDeletionV2)

WI-849 (Fix v2 account-deletion GDPR gaps). Founder-ruled SPLIT: build **Gap 2 + Gap 3**; Gap 1
(subscription RESTRICT teardown) routed to **WI-693 / CUT-B3 / billing**, deferred.

> **REVISED DURING BUILD (2026-06-20): Gap 2 PREMISE COLLAPSED — built Gap 3 ONLY.** Running against
> the live staging DB (`ep-fancy-cherry`) showed `relation "accounts" does not exist`: the legacy
> `accounts`/`profiles` tables were dropped by the MMT-ADR-0012 baseline reset and do NOT exist on the
> v2-live environments where `executeDeletionV2` runs. So there is no legacy PII to survive a v2 erasure,
> and the proposed `DELETE FROM accounts` would THROW at runtime. Gap 2 is a stale premise (WI-823
> lesson — the prior GATE-0 verified it in code/schema, not against the live DB). Gap 2 NOT built;
> escalated for a founder ruling. Gap 3 (guardianship/supportership RESTRICT) operates on v2 tables that
> DO exist — premise holds, fix built + verified.

## Premise (re-verified on origin/main @ e6e01c813)

- **Gap 2 — legacy PII survives.** `executeDeletionV2` (`apps/api/src/services/identity-v2/deletion-v2.ts`)
  deletes the new `organization` row (~:448) + each `person` (~:444) but never the legacy `accounts`
  row. `profiles.account_id → accounts.id ON DELETE CASCADE` (`profiles.ts:69-71`); all learning data
  cascades off `profiles.id`; legacy `subscriptions`/`quotaPools` cascade off `accounts.id` (`billing.ts:37-40`).
  `organization.id = accounts.id` only by deterministic-reseed convention (no FK). Result: legacy
  profiles/subjects/sessions PII is NOT cascaded and survives erasure.
- **Gap 3 — guardianship/supportership RESTRICT.** `guardianship.{guardian,charge}_person_id` and
  `supportership.{supporter,supportee}_person_id` are all `onDelete: 'restrict'` (`identity.ts:359,362,416,419`).
  Deleting a `person` who is on either end of an un-revoked OR revoked edge aborts the whole tx with an FK error.
- **Gap 1 — subscription RESTRICT** (`identity.ts:277,287`): DEFERRED to WI-693. After Gaps 2+3, a
  *subscribed* org still hits the subscription RESTRICT FK on the `organization`/`person` delete. Expected
  and documented; NO test papers over it.

## Decision (no migration)

The RESTRICT FKs are load-bearing for the **person-granularity** delete paths (a person with active
consent grants / edges must be re-homed/torn-down first — canon §6.1). We do NOT relax them. Instead the
**whole-org erasure path** (`executeDeletionV2`) explicitly tears down the edges in-transaction, ordered
before the `person` deletes, satisfying RESTRICT. Canon §3.2/§6.1 currently says these edges *survive* a
person-delete; the whole-org path is a *new* path the canon does not yet describe → new ADR + canon edit
(lockstep).

### Cross-org edge semantics (documented, deliberate)

A guardianship/supportership edge may reference a person OUTSIDE the org being erased (e.g. a guardian in
another org, or a supporter who supports a charge in this org). The erasure tears down **only the edges
incident to the erased persons** (any edge where either endpoint ∈ the org's person set), and NEVER
deletes the counterpart person. Deleting the edge is correct: the relationship to an erased person no
longer exists. The counterpart person and their own org are untouched.

## File map

1. `apps/api/src/services/identity-v2/deletion-v2.ts` — in `executeDeletionV2` transaction:
   - **Gap 3:** before the per-person `tx.delete(person)` loop, delete all `guardianship` rows where
     `guardianPersonId IN personIds OR chargePersonId IN personIds`, and all `supportership` rows where
     `supporterPersonId IN personIds OR supporteePersonId IN personIds`. (Both directions; both edges.)
   - **Gap 2:** after `tx.delete(organization)`, add `tx.delete(accounts) WHERE accounts.id = organizationId`
     (organization.id = accounts.id). This cascades legacy `profiles` → learning data and legacy billing.
   - Replace the "Out-of-scope (WI-723)" comment block with a tightened comment: Gap 3 now handled here;
     Gap 1 (subscription RESTRICT) still deferred to WI-693, with the reason.
2. `apps/api/src/services/identity-v2/deletion-v2.integration.test.ts` — NEW. Real staging Neon DB
   (`ep-fancy-cherry`), `(RUN ? describe : describe.skip)` guard on `DATABASE_URL`, full seed/teardown.
   Three red-green-revert regression tests:
   - **Gap 2:** seed a legacy `accounts` + `profiles` row whose `accounts.id` = the org id; run
     `executeDeletionV2`; assert the `accounts` row (and its `profiles` child) are gone. RED without the
     `tx.delete(accounts)` line (rows survive); GREEN with it.
   - **Gap 3a (guardianship):** seed two persons in the org with a guardianship edge between them; run
     `executeDeletionV2`; assert it returns `'deleted'` and the persons + edge are gone. RED without the
     edge teardown (FK RESTRICT aborts the tx → throw); GREEN with it.
   - **Gap 3b (supportership + cross-org):** seed an in-org supporter→supportee edge AND a cross-org edge
     (an in-org person supported-by an out-of-org person); run `executeDeletionV2`; assert success, both
     incident edges gone, and the out-of-org counterpart person SURVIVES. RED without teardown; GREEN with it.
   - NO Gap-1 test (founder ruling — do not paper over the deferred subscription RESTRICT).
3. `docs/adr/MMT-ADR-0026-whole-org-erasure-tears-down-surviving-edges.md` — NEW ADR, Status=Proposed
   (human-Architecture sign-off pending), dedicated `docs(adr)` change-set semantics (lockstep with canon).
4. `docs/canon/identity/data-model.md` — §3.2 + §6.1 lockstep edit: add the whole-org-erasure row/note that
   the otherwise-surviving subscription/guardianship/supportership edges are torn down on a whole-org/whole-
   account erasure (and subscription teardown is deferred to WI-693).

## Acceptance checks (verify, don't assume)

- [ ] Each gap's regression test fails on revert (RED), passes with fix (GREEN). Record red-green-revert.
- [ ] `pnpm exec nx test:integration api` green for the new suite (staging DB).
- [ ] `pnpm exec nx run api:typecheck` green.
- [ ] `pnpm exec nx run api:lint` green (no eslint-disable).
- [ ] `decision-adr-link` ratchet satisfied (canon edit references MMT-ADR-0026; ADR exists).
- [ ] `bash scripts/check-change-class.sh --branch --run` for the docs+api change classes.
- [ ] Gap 1 deferral documented in PR body + WI-693 linked.

## Rollback

No schema migration. Rollback = revert the commit; no data loss, no DB state change.
