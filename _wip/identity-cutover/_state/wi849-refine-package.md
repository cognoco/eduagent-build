# WI-849 refine package (GATE-0 + draft ACs) — from wi849-refiner 2026-06-20

Source-verified. All 3 gaps LIVE. G1+G3 = runtime FK-RESTRICT crashes; G2 = silent PII residual.

## GATE-0 verdicts
**G1 subscription teardown — CONFIRMED (runtime crash).** `executeDeletionV2` in
`apps/api/src/services/identity-v2/deletion-v2.ts` (realized 375–458) does steps: TOCTOU org claim →
per-person consent re-home/delete → financial_record snapshot (reads subscription, does NOT delete) →
deletion_audit → DELETE person (cascades consent_request/membership/login/learning) → DELETE organization →
DELETE byok_waitlist. **Never touches subscription / subscription_payers.** Lines 437–443 carry a comment
explicitly deferring to WI-723/CUT-B3 ("payer_person_id / organization_id ON DELETE RESTRICT"). Because of
RESTRICT, DELETE person THROWS for any account with a live subscription → runtime crash. Comment contradicts
the ic-orch-208 ownership ruling and must be removed in AC-1.

**G2 legacy accounts row — CONFIRMED (silent residual).** `deletion-v2.ts` never imports/touches `accounts`.
`organization.id == accounts.id` (deterministic reseed, comment line 36). v2 deletion leaves the `accounts`
row (email, clerk_user_id, deletion_scheduled_at) as PII orphan. No FK error — silent.

**G3 guardianship/supportership — CONFIRMED (runtime crash).** Neither table referenced in deletion-v2.ts.
All four person FKs ON DELETE RESTRICT (active AND revoked rows). DELETE person throws for any
guardian/charge/supporter/supportee. `data-model.md §3.2` retain-tier says both tables "survive" — conflicts
with RESTRICT. **Schema-design fork (see DECISION).**

## Schema facts (packages/database/src/schema/identity.ts unless noted)
- `subscription` (269–343): organization_id→organization.id RESTRICT (NN); payer_person_id→person.id RESTRICT (NN); plan_tier/status/stripe/rc/trial_ends_at/cancelled_at.
- `subscription_payers` (749–770): subscription_id→subscription.id **CASCADE** (NN); person_id→person.id RESTRICT (NN); role CHECK in (primary,secondary). → deleting subscription auto-removes payers rows.
- legacy `accounts` (profiles.ts 42–61): standalone, NO FK to organization; id(=org.id), clerk_user_id, email, timezone, deletion_scheduled_at/cancelled_at. `profiles.account_id→accounts.id CASCADE`.
- `guardianship` (351–401): guardian_person_id & charge_person_id → person.id RESTRICT (NN); partial-unique (guardian,charge) WHERE revoked_at IS NULL.
- `supportership` (408–446): supporter_person_id & supportee_person_id → person.id RESTRICT (NN); same partial-unique.

## Draft ACs (Ready-grade; design-doc + per-AC red-green-revert; erasure/migration class, not TDD)
**AC-1 G1 (executeDeletionV2 OWNS, per ic-orch-208):** before per-person DELETE person, within the same tx:
delete subscription_payers (or rely on CASCADE), then DELETE subscription WHERE organization_id=$org, then
proceed. financial_record snapshot already captured (line 384, no change). Remove the 437–443 defer comment.
R-G-R: org+payer+live-sub → currently throws RESTRICT (red); after teardown returns 'deleted', sub+payers gone,
financial_record present (green); revert → throws again.
**AC-2 G2:** after DELETE organization, `DELETE accounts WHERE id=$organizationId` (idempotent). VERIFY profiles
already gone via person cascade before relying on accounts→profiles CASCADE (avoid surprise secondary erasure).
R-G-R: accounts row survives today (red=gap, no throw); after delete it's gone (green); revert → survives.
**AC-3 G3:** **DECISION REQUIRED FIRST (see below).** Option A (FK→SET NULL migration on all 4 cols; rows survive
null-ref'd; matches §3.2 "survives") or Option B (explicit delete/hard-revoke rows in per-person loop before
DELETE person; loses history). R-G-R: guardian person delete throws today (red); after fix returns 'deleted' with
rows null-ref'd (A) or deleted (B) (green); revert → throws.

## DECISION (RULED ic-orch-209) — G3 = Option B
**Option B (hard-delete/revoke guardianship + supportership edges in the per-person loop BEFORE DELETE person).**
Rationale: data-model.md §3.2 "survives" is SCOPED to single-person deletion where the ORG persists (the rows
"continue to live on the organization"). executeDeletionV2 does WHOLE-ACCOUNT erasure (org deleted too) → nothing
survives-on; SET NULL would leave null-ref garbage + dangling cross-account halves. B = GDPR-clean, NO migration,
does NOT contradict §3.2 properly read. Option A REJECTED (4-FK migration = broad blast radius on all delete paths
+ garbage in erasure case). Cross-account: hard-delete the erased party's edge rows (surviving party loses a record
pointing at an erased person — correct for GDPR).
**AC-3 final:** in the per-person loop, before DELETE person: delete guardianship WHERE guardian_person_id=$pid OR
charge_person_id=$pid; delete supportership WHERE supporter_person_id=$pid OR supportee_person_id=$pid. No schema
change. R-G-R as drafted (guardian person delete throws today → returns 'deleted' with edges gone → revert throws).
**CANON HYGIENE (lockstep, SAME build change-set as G3):** add a one-line data-model.md §3.2 clarification scoping
"survives" to person-drop-with-org-survival, and naming deletion-v2 whole-account erasure as the hard-delete-all-edges
case. Full MMT-ADR only if the operator judges it contested (default = the clarification line, no ADR).

## Execution Path: builder-executable (NOT operator). design-doc + per-AC red-green-revert verification.
