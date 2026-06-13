# MMT-ADR-0020 — Cutover-completion amendments: consent-request workflow table + identity-model re-homes

**Status:** Accepted · 2026-06-13 · **Scope:** Identity Foundation (application cutover — WP-CUT-A) · **Deciders:** PM (owner) + Claude · **Amends:** MMT-ADR-0011 / MMT-ADR-0015 (data-model realization) · **Builds on:** MMT-ADR-0008 (guardianship), MMT-ADR-0002 (store-delegated Payer), MMT-ADR-0014 (router / premium routing)

## Context

The ratified 8-table model holds the identity graph and the append-only consent
*event log* (`consent_grant`), but the application's WI-586 cutover inventory
exposed three live surfaces with no home in it:

1. the consent-**REQUEST** workflow — pre-grant states
   (`PENDING` / `PARENTAL_CONSENT_REQUESTED`), parent-email contact, response
   token + expiry, and the WI-374 abuse caps (`resend_count`,
   `recipient_change_count`) — today carried by legacy `consent_states`;
2. the payment-store correlation / idempotency identifiers (Stripe
   customer/subscription ids, Stripe/RevenueCat last-event fences per BUG-116 /
   CR-2026-05-19-M11) — today on legacy `subscriptions`;
3. person-level presentation/preference/lifecycle columns
   (`conversation_language`, `pronouns`, `avatar_url`, `default_app_context`,
   `archived_at`) — today on legacy `profiles`.

Dropping legacy without homes for these would re-open closed webhook races and
orphan a live COPPA/GDPR workflow. This decision crosses the MMT-ADR-0000
significance gate (trigger 2 — establishes a contract future consent work must
follow; trigger 4 — changes the ratified data model), so it is recorded as an
ADR and lands lockstep with its `data-model.md` §2B canon edit.

## Decision

### 1. New table `consent_request` — the operational consent-request workflow

Keyed `(charge_person_id × purpose × organization_id × requested_basis)`
(UNIQUE; the basis dimension preserves the legacy GDPR/COPPA dual-row
coexistence — legacy uniqueness is `(profile_id, consent_type)` — and
single-row recycling per basis preserves the WI-374 monotonic caps 1:1). States
`pending | requested | approved | denied | expired`; token lifecycle and Bug
#872 audit fields carried 1:1 from legacy. Approval writes a `consent_grant` row
and back-links it (`consent_grant_id`). Requests are operational state; grants
remain the sole audit record. Approval never creates a guardianship edge
(inv 14); withdrawal/restore are grant-layer events, never request states.

**Withdrawal persistence (amends the append-only reading):** withdrawal stamps
`withdrawn_at` (+ `prior_value` / `audit_fact`) on the live grant row — the one
sanctioned in-row transition, already encoded by the ratified schema's
`withdrawn_at` column + partial index; restore and re-grant append new rows.
Append-only = no deletes, no decision rewrites; not "no `withdrawn_at` stamp".

### 2. Additive `subscription` columns for store correlation + idempotency

`stripe_customer_id`, `stripe_subscription_id`, `last_stripe_event_id` (+ ts),
`revenuecat_original_app_user_id`, `last_revenuecat_event_id` (+ ts_ms),
`trial_ends_at`, `cancelled_at` — with the partial-unique event fences re-keyed
`(organization_id, last_*_event_id)`. Semantics identical
(`organization.id = accounts.id` by the deterministic reseed); the unique
store-id fences are partial-unique on the non-null value. The quota satellites
(`quota_pools`, `profile_quota_usage`, `usage_events`, `top_up_credits`,
`webhook_idempotency`) are kept, not replaced.

### 3. `person` re-homes

`conversation_language` (NOT NULL default `'en'`, 10-language CHECK),
`pronouns` (≤32 CHECK), `avatar_url`, `default_app_context` (study|family CHECK),
`archived_at` (operational lifecycle marker; the consent *why* stays in the
grant layer — inv 2 governs consent decisions, which this column is not).
`birth_year_set_by` folds into `knowledge_assertions` provenance (one `'age'`
assertion per person; `parent_reported` when set and ≠ self, else `self_report`
— the `age_method` v1 vocabulary per data-model §2A.2; provisional confidence
1.00 / 0.80 per OQ-9, DB-mastered thereafter). The assertion's `actor_id` is set
to the parent person **only when that person exists** in the reseeded graph
(else NULL — the `parent_reported` provenance is preserved either way; the
parent having left the system does not downgrade the method).
`is_owner` derives from `membership.roles @> '{admin}'`. `has_premium_llm` is
**not** stored — premium routing derives per MMT-ADR-0014 + the model register
(no application writer of the legacy column exists; behavior-neutral).

**`person.age_knowing` cache supersession.** The CUT-A reseed (0115) **supersedes**
the provisional `age_knowing` stub written by the 0109 identity reseed. 0109
wrote `{method: 'self_attested_birth_year', source: 'reseed_0109:profiles.birth_year',
last_updated}` (a provenance-honest stub with no confidence invented); 0115 — which
runs **after** 0109 at the convergence freeze and therefore masters the field —
adopts the canonical cache shape `{method, confidence, last_updated}` (data-model
§2A.2), mirroring the backfilled assertion's `method` (`self_report` /
`parent_reported`) and OQ-9 `confidence` (0.80 / 1.00). The 0109 `source` key is
dropped (the provenance now lives in the `knowledge_assertions` row's `source`
column, not the cache). This is an intentional, recorded supersession — not a
silent overwrite.

## Alternatives considered

1. **Workflow states inside `consent_grant`.** Rejected — pollutes the
   append-only audit log with mutable operational state; violates the
   computed-not-stamped posture (inv 2) and the grant log's regulator-facing
   purity.
2. **Append-per-cycle `consent_request` rows.** Rejected — resets WI-374
   counters per cycle, re-opening the email-bombing vector unless windowed sums
   are added; single-row recycling reproduces the proven legacy cap semantics
   exactly.
3. **Store-correlation side table.** Rejected by operator ruling — additive
   columns; the identifiers are 1:1 with the subscription row and the
   partial-unique fences need the row anyway.
4. **Storing `has_premium_llm` on membership.** Rejected — no writer exists;
   storing would contradict the MMT-ADR-0014 derived-routing posture.

## Consequences

- The legacy drop (WI-586) becomes possible without losing the consent
  workflow, webhook idempotency, or live preference data.
- `consent_request` joins the RLS surface with its isolation policy shipping in
  the same migration (`charge_person_id`-anchored, mirroring
  `consent_states_profile_isolation`) plus named service-role exceptions for the
  public token lookup and the reminder sweeps, and a coverage-manifest
  registration (a new `charge_person_id` predicate class in
  `database-rls-coverage.ts`). The retain-tier is unaffected (requests die with
  the person — no receipt obligation pre-consent).
- **Canon lockstep:** `docs/canon/identity/data-model.md` gains the §2B cutover
  amendments in the same change-set as this ADR.
- The purpose vocabulary (`platform_use`) and lawful-basis values are finalized
  as DB-mastered data; future per-purpose consent (inv 27) extends rows, not
  schema.
- **Additive and reversible:** CUT-A touches no legacy object; the migrations
  are reversible by dropping the added objects. The readers/writers that
  actually use these homes land flag-gated in WP-CUT-B (the `IDENTITY_V2_ENABLED`
  seam), and the legacy tables stay the sole live store until the WI-586
  convergence flip.
