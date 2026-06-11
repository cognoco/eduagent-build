# IF Application Cutover Plan — WP-CUT-A → WP-CUT-B → WI-586 convergence

**Date:** 2026-06-11 · **Status:** DRAFT — awaiting ratification (program session + operator)
**Author:** dedicated architecture/planning session (per `cutover-planning-brief.md`)
**Profile:** design (plan only; no code, no migrations, no Cosmo writes)

**Inputs (read in full):**
- `_wip/identity-foundation/cutover-planning-brief.md` — the mandate
- `_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` @ `23d0c01ad` — WP-TAIL-reseed / WP-TAIL-drop-legacy
- `_wip/identity-foundation/CANONICAL-SET.md` + `docs/canon/identity/` (ontology, domain-model, data-model, prd)
- `_wip/identity-foundation/wi586-scope-report.md` @ `763c5b7c7` — the executor's plan-phase report (the inventory seed)
- `_wip/identity-foundation/execution-tracker.md` (read-only) — W0–W4 + WI-585 closed; WI-586 PAUSED
- `.claude/memory/feedback_plan_cutover_ownership.md` — the switch-flip check this plan must pass
- `docs/adr/MMT-ADR-0000` §II.1 — the significance gate
- Repo ground truth: `packages/database/src/schema/{profiles,billing,identity}.ts`,
  `apps/api/drizzle/0108/0109`, `packages/database/scripts/verify-identity-reseed.mjs`,
  the auth/consent/billing/Inngest sources (fresh grep, this session, 2026-06-11)

---

## Open Questions

Collected per the brief; none blocks the plan's internal coherence — each is a
ratification confirmation or a named owner's call. **OQ-1 and OQ-2 are the two with
real design alternatives; the rest are confirmations.**

| # | Question | Plan's recommended answer | Decider |
|---|---|---|---|
| **OQ-1** | **v2 signup bootstrap timing.** `login.person_id` is NOT NULL, but today's JIT bootstrap (`findOrCreateAccount` at first authed request) runs *before* birth-date capture — `person.birth_date NOT NULL` cannot be satisfied at signup. Option (c): defer the whole graph (organization + person + login + membership + subscription) to **onboarding completion**, when birth date is known — matches `inv 26` (age-gate precedes collection) and eliminates the ownerless-account class by construction, but moves the trial-clock start from signup to onboarding completion. Option (d): make `login.person_id` nullable (canon amendment) and keep signup-time creation. | **(c)** — design in §2.2; trial-clock shift called out | Operator (product) |
| **OQ-2** | **Re-homes beyond the accepted sub-rulings.** The brief's accepted set covers `conversation_language` → person, store IDs, `consent_request`, `has_premium_llm` derived, ownerless accounts. This plan additionally re-homes `pronouns`, `avatar_url`, `default_app_context`, `archived_at` to `person` and folds `birth_year_set_by` into `knowledge_assertions` (§1.3). | as designed §1.3 | Ratification |
| **OQ-3** | **Staging ownerless accounts (6)** — case-by-case list produced (Appendix D): all six are test artifacts (`@test.local` ×3, `@test.test` ×1, `@integration.test` ×2; created 2026-05-31/06-10). | bulk-delete pre-drop, same as dev | Operator |
| **OQ-4** | **Freeze mechanics + soak length** at convergence: proposal = pause Inngest app + deploy with `MAINTENANCE_READONLY` rejection of writes; 24 h staging soak between flip and drop. | as proposed §4 | Operator |
| **OQ-5** | **`consent_request` single-row recycling** (one row per charge × purpose × org, counters monotonic — preserves WI-374 exactly) vs append-per-cycle rows (counters reset per cycle — weakens WI-374 unless windowed sums added). | single-row (§1.2 design rationale) | Ratification |
| **OQ-6** | **Deviation from the executor's sketch:** the scope report suggested "new signups write the new model from the first cutover PR". This plan **rejects** that — it is a partial dual-write and violates the single-live-store invariant. The 0109 precondition window is closed by the convergent final reseed at freeze instead (§4 step 4). | reject early dual-writes | Ratification |
| **OQ-7** | **`profileId` symbol / `profile_id` column rename** to `personId`/`person_id` across learning tables: out of grep-clean scope (FK constraints re-point; names stay — `person.id = profiles.id` by construction). Rename = a separate post-cutover hygiene item if ever wanted. | out of scope | Ratification |
| **OQ-8** | **Purpose vocabulary finalization** (owned by CUT-A per the scope report): finalize `'platform_use'` as the v1 purpose; do **not** mint `'llm_disclosure'` etc. now (no current reader implements per-purpose consent; `inv 27`'s split lands when a feature needs it). `lawful_basis` values stay `coppa_parental_consent` / `gdpr_parental_consent` as seeded by 0109. | finalize as-is | Ratification |
| **OQ-9** | **`knowledge_assertions` confidence seed values** for the backfill (§1.3): provisional `1.00` for `parent_reported`, `0.80` for `self_report` — same "provisional, DB-mastered thereafter" posture as the 0109 vocabulary. | provisional values; final = compliance-population workstream (PM-owned) | PM workstream |
| **OQ-10** | **Cosmo graduation shape:** WP-CUT-A + WP-CUT-B1/B2/B3 as new WPs; WI-586's bridged children WI-631/632 remap onto (cutover vs drop) or get superseded. Happens at ratification in the program session, not here. | program session's call | Program session |

---

## 0. Context, scope evidence, and the switch-flip check

### 0.1 What this plan closes

The Phase-O master plan built the new model (W0–W4, 34 units closed) and scheduled a
tail of `reseed → drop`, but no wave owned **making the application use the new
model**: ~80 runtime files still read the five legacy identity tables, and that
migration hid inside WI-586 (WP-TAIL-drop-legacy: drop legacy identity tables/readers)'s
S-sized "remove legacy readers". The operator ruled a SPLIT (2026-06-11):

- **WP-CUT-A** — additive model completion (schema homes for everything the new model
  is missing) — §1.
- **WP-CUT-B** — domain-wise reader/writer cutover, 2–3 PRs, legacy frozen-but-live,
  new paths inert — §2 + §3.
- **WI-586 (shrunk)** — final convergence: freeze → final reseed → verify → atomic
  flip → drop → grep-clean — §4.

### 0.2 Scope-evidence reconciliation (brief instruction 3)

`wi586-scope-report.md` exists and is the seed. Independent re-derivation this session
(fresh `rg`, 2026-06-11) against the brief's summary counts:

| Quantity | Brief | Executor report | This session | Verdict |
|---|---|---|---|---|
| Non-test runtime files reading legacy identity symbols | ~80 | ≈80 (64 profiles ∪ 18 accounts ∪ 15 family_links ∪ 11 consent_states ∪ 19 subscriptions) | **78** by symbol-grep union (Appendix B) + `routes/revenuecat-webhook.ts` and `middleware/metering.ts`, which reach legacy tables only through service imports → **~80** | consistent |
| Payment webhooks | both | both | `routes/stripe-webhook.ts` + `routes/revenuecat-webhook.ts` (handlers in `services/billing/`) | consistent |
| Inngest functions | 22 | ~22 | **24 files** under `inngest/functions/` match; 2 of them (`quota-reset`, `filing-stranded-backfill`) touch only billing satellites / learning tables, not identity tables → **22** identity readers | consistent |
| FK re-points | 57 | 57 across 23 schema files | 61 raw `references(() => profiles\|accounts\|subscriptions...)` declarations; minus 4 intra-legacy FKs that **drop** rather than re-point (`profiles.account_id`, `subscriptions.account_id`, `family_links.parent/child_profile_id`) → **57** | consistent |
| Test files referencing legacy symbols | ~190 | 188 (+ 45/51 integration suites) | **194** (symbol grep over `*.test.*`) | consistent |

No material divergence. The executor's per-table figures are adopted as authoritative;
Appendix B carries the per-file inventory.

### 0.3 The switch-flip check (explicit, per `feedback_plan_cutover_ownership.md`)

- **Which unit makes the system USE the new model?** The **flip step of the WI-586
  convergence runbook** (§4 step 6): one config flag (`IDENTITY_V2_ENABLED`, §2.1)
  set true after freeze + final reseed + verify. CUT-B builds the inert v2 paths the
  flip activates; CUT-B itself activates nothing.
- **Which unit owns data/state convergence at the flip?** **WI-586 steps 4–5** (§4):
  the final convergent reseed run (0109 block + the CUT-A extension block) plus
  `verify-identity-reseed.mjs` exit 0 with an empty exception report, executed inside
  the freeze immediately before the flip.

Single-live-store invariant: legacy remains the sole live store at every CUT-A/CUT-B
merge point (all new-model paths are flag-off inert); there is exactly ONE atomic
convergence step (freeze → final reseed → verify → flip → drop). No dual-model sync
layer exists anywhere in this plan. Per-PR arguments in §3.

### 0.4 What this plan is NOT

- It does **not** activate the policy engine. The W1 spine scaffolds
  (`services/policy-engine/`) stay fail-closed-hardcoded; populating
  `regimes`/`policy_cells`/`policy_rules`/`allowed_models` and wiring real policy
  reads is the separate C2-B compliance-population workstream. The cutover re-platforms
  the *readers of identity data*; consent-requirement logic keeps today's semantics
  (`checkConsentRequired` on age, strictest-default) against new-table inputs.
- It does **not** change the mobile contract. All API response shapes (the `Profile`
  Zod schema incl. the 4-value `consentStatusSchema`, billing/quota shapes) are
  preserved by the v2 implementations; the V0 5-tab nav hard constraint is untouched
  because nothing the mobile app consumes changes shape or semantics.
- It does **not** reopen ratified canon. CUT-A *extends* the data model additively;
  the one decision that crosses the MMT-ADR-0000 significance gate ships as a new ADR
  (Appendix A) + lockstep `data-model.md` edit, landing **with CUT-A implementation**.

---

## 1. WP-CUT-A — schema-extension design (additive, reversible)

One migration (`0110_identity_cutover_homes.sql`) + matching Drizzle definitions in
`packages/database/src/schema/identity.ts`, + an extension of the reseed block and the
verify script. Everything here is **additive**: no legacy object is touched; the
migration is reversible by dropping the added objects. CUT-A also performs the canon
lockstep: `docs/canon/identity/data-model.md` gains §2B (cutover amendments) and the
ADR (Appendix A) lands in `docs/adr/` in the same change-set.

### 1.1 Design ground rules

- **ID convention:** uuid v7, app-generated (`$defaultFn`), matching the graph.
- **Value sets:** TEXT + CHECK (the identity-table convention — `roles`,
  `qualification` — reserving pgEnums for the two ratified ones). A status change is
  an app deploy, not a migration.
- **Vocabulary:** `purpose = 'platform_use'`, `lawful_basis ∈
  {coppa_parental_consent, gdpr_parental_consent}` — finalizing the 0109 provisional
  vocabulary (OQ-8).

### 1.2 `consent_request` — the consent-request workflow table

**Why it exists.** `consent_grant` is the ratified append-only **event log** of
completed consent events. The legacy `consent_states` table conflated that log with a
**pre-grant workflow**: PENDING / PARENTAL_CONSENT_REQUESTED states, the parent-email
contact, the response token, expiry, and the WI-374 abuse caps. That workflow has no
home in the ratified model — `consent_request` is that home. Requests are
**operational state**; grants remain the **audit record**. The two never merge.

**How it attaches to the authority graph.** A request is keyed by the ratified consent
key — `(charge_person_id × purpose × organization_id)` — the same key as
`consent_grant`. `guardian_person_id` is nullable because in the child-self-signup
flow the responding parent exists only as an email address, not as a Person; when the
flow is in-family (guardian already a Person), the column binds the request to the
guardianship edge's guardian end. **Approval never creates a guardianship edge**
(`inv 14`: never auto-conferred — edge creation stays with the add-child / family-join
flows); approval writes a `consent_grant` row and back-links it via
`consent_grant_id`. The request carries the *evidence trail* (token, IP/UA, policy
version — the Bug #872 regulator fields); the grant carries the *decision*.

**DDL (actual, lands in 0110):**

```sql
CREATE TABLE consent_request (
  id                       UUID PRIMARY KEY,            -- app-generated uuid v7
  charge_person_id         UUID NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  organization_id          UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  purpose                  TEXT NOT NULL DEFAULT 'platform_use',
  requested_basis          TEXT NOT NULL
    CHECK (requested_basis IN ('coppa_parental_consent','gdpr_parental_consent')),
  guardian_person_id       UUID REFERENCES person(id) ON DELETE SET NULL,
  guardian_email           TEXT,                        -- NULL in 'pending' (recipient not yet named)
  status                   TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','requested','approved','denied','expired')),
  token                    TEXT,                        -- crypto.randomUUID(); NULL outside an open cycle
  token_expires_at         TIMESTAMPTZ,
  resend_count             INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  recipient_change_count   INTEGER NOT NULL DEFAULT 0 CHECK (recipient_change_count >= 0),
  policy_version           TEXT,                        -- Bug #872 audit metadata, carried over 1:1
  request_ip               TEXT,
  user_agent               TEXT,
  requested_at             TIMESTAMPTZ,
  responded_at             TIMESTAMPTZ,
  consent_grant_id         UUID REFERENCES consent_grant(id),  -- set on approval
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consent_request_charge_purpose_org_unique
    UNIQUE (charge_person_id, purpose, organization_id)
);
-- token-lookup hot path (mirrors legacy consent_states_token_idx)
CREATE INDEX consent_request_token_idx ON consent_request (token) WHERE token IS NOT NULL;
-- reminder/expiry sweep path (consent-reminders Inngest fn)
CREATE INDEX consent_request_status_requested_idx ON consent_request (status, requested_at);
ALTER TABLE consent_request ENABLE ROW LEVEL SECURITY;
```

**State machine (legacy → new, with transitions):**

```
pending ──requestConsent()──▶ requested ──approve──▶ approved   (writes consent_grant,
   ▲                            │  ▲ resend/recipient-change       sets consent_grant_id,
   │ re-request after expiry    │  │ (counters++, never reset)     clears nothing — terminal)
   └────────────────────────────┤  │
                                │  ├──deny──▶ denied             (terminal; child-deletion flow)
                                └──day-30 sweep──▶ expired       (recyclable; profile auto-delete fires)
```

| Legacy `consent_states.status` | New | Notes |
|---|---|---|
| `PENDING` | `consent_request.status = 'pending'` | created at child-profile creation, no email yet |
| `PARENTAL_CONSENT_REQUESTED` | `'requested'` | open email cycle, token live |
| `CONSENTED` | `'approved'` **+ `consent_grant` row** (granted=true) | grant is the record; request is the trail |
| `WITHDRAWN` | request `'approved'` + grant `withdrawn_at` set | see mapping rationale below |
| *(parent-created child — legacy `createGrantedConsentState`)* | **no request row at all** — direct `consent_grant` write | the in-app guardian consent needs no email workflow |

*`WITHDRAWN` mapping rationale:* legacy `WITHDRAWN` covers both deny-at-response and
post-consent revocation, but deny-at-response cascade-deletes the child profile (the
`consent_states` row dies with it), so surviving `WITHDRAWN` rows are
post-consent revocations — i.e. *was approved, then withdrawn*, which is exactly
request `'approved'` + grant `withdrawn_at` (matching how 0109 already maps them into
`consent_grant`). Withdrawal and the 7-day restore are **grant-layer events** (a
restore = a new `consent_grant` row with `prior_value = false`), not request states.

**Single-row recycling (WI-374 preservation — OQ-5).** The full UNIQUE on
`(charge, purpose, org)` mirrors legacy `unique(profileId, consentType)`: one workflow
row per consent target, recycled by the same atomic-upsert pattern, **counters
monotonic for the row's lifetime**. The caps therefore carry over with identical
semantics:

| WI-374 cap | Legacy | New | Enforcement (unchanged pattern) |
|---|---|---|---|
| Resend cap | `resend_count < 3` (`MAX_CONSENT_RESENDS`) | same column, same cap | in the SQL `setWhere`/`WHERE` of the upsert — atomic, TOCTOU-free; `ConsentResendLimitError` → 429 |
| Recipient-change cap | `recipient_change_count < 3` (`MAX_RECIPIENT_CHANGES`) | same | same; `ConsentRecipientChangeLimitError` → 429 |
| Terminal-status guard (BUG-791) | `status NOT IN ('CONSENTED','WITHDRAWN')` in `setWhere` | `status NOT IN ('approved','denied')` | a terminal row cannot be revived by the upsert |
| Email-failure counter rollback | `GREATEST(count - 1, 0)` decrement | identical | |
| Respond rate limit | 30 req/IP/h on the public endpoints | unchanged (route-level, not schema) | |

**Token lifecycle (carried 1:1):** `crypto.randomUUID()`; `requestConsent`/`resend` →
`token_expires_at = now() + 7d`; the Inngest day-7/day-14 reminder refresh →
`now() + 16d`; expiry checked at response time (→ 410 GONE); token not cleared on
response (replay blocked by the terminal-status guard). Public endpoints
(`/v1/consent-page*`, `/v1/consent/respond`) are unchanged — they re-target
`consent_request` in CUT-B2.

**Parent-email flow:** unchanged (Resend API, same templates, same
`${API_ORIGIN}/v1/consent-page?token=` link, same Inngest `consent-reminders`
day-3/7/14/25/30 cadence) — only the storage row the workflow reads/writes changes.

### 1.3 `person` re-homes (presentation/preference/lifecycle columns)

Accepted ruling: `conversation_language` → person. This plan extends the same
treatment to the remaining live `profiles` columns with no other home (OQ-2):

```sql
ALTER TABLE person
  ADD COLUMN conversation_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN pronouns              TEXT,
  ADD COLUMN avatar_url            TEXT,
  ADD COLUMN default_app_context   TEXT,
  ADD COLUMN archived_at           TIMESTAMPTZ;

-- mirrors profiles_conversation_language_check (migration 0087) — the 10-language
-- conversationLanguageSchema set, deliberately a superset of the 7 UI locales:
ALTER TABLE person ADD CONSTRAINT person_conversation_language_check
  CHECK (conversation_language IN ('en','cs','es','fr','de','it','pt','pl','ja','nb'));
-- mirrors profiles_pronouns_length_check (BUG-978):
ALTER TABLE person ADD CONSTRAINT person_pronouns_length_check
  CHECK (pronouns IS NULL OR char_length(pronouns) <= 32);
-- mirrors profiles_default_app_context_check:
ALTER TABLE person ADD CONSTRAINT person_default_app_context_check
  CHECK (default_app_context IS NULL OR default_app_context IN ('study','family'));
CREATE INDEX person_archived_at_idx ON person (archived_at) WHERE archived_at IS NOT NULL;
```

- **`archived_at`** is kept as an **operational lifecycle marker**, not consent state:
  every Inngest send-path does a cheap indexed liveness check on it, and the
  archived-vs-deleted distinction (the withdrawal-archive-preference feature) is a
  person lifecycle, not a consent decision. The *why* of an archive remains in the
  consent layer (`consent_grant.withdrawn_at` + the revocation flow); `inv 2`
  ("computed, never stamped") governs consent decisions, which this column is not.
- **`birth_year_set_by` is NOT re-homed** — it folds into `knowledge_assertions`
  provenance (the reseed extension writes one age assertion per person:
  `method = 'parent_reported'` when `birth_year_set_by` is set and ≠ self, else
  `'self_report'`; `actor_id = birth_year_set_by`; `id = person.id` for deterministic
  idempotency — the table is empty pre-cutover and gets exactly one backfill row per
  person; confidence values per OQ-9). `person.age_knowing` is set to the matching
  `{method, confidence, last_updated}` cache.
- **`is_owner` is NOT re-homed** — derived: `membership.roles @> '{admin}'` (the
  reseed already maps owner profiles to `{admin, learner}` memberships).
- **`has_premium_llm` is NOT re-homed** — per the accepted ruling it is derived
  (MMT-ADR-0014 + `docs/registers/llm-models/master.md`). Repo finding that makes
  this **behavior-neutral**: no application code ever *writes*
  `profiles.has_premium_llm` (schema default `false` + read sites only — verified
  this session), and `middleware/metering.ts:849` already derives the base LLM tier
  from the subscription tier (`getTierConfig(effectiveAccessTier).llmTier`). The v2
  `profileMeta` drops the field; `metering.ts:850`'s dead override is deleted in
  CUT-B3; the `Profile` Zod field is served as the derived value until the mobile
  contract is revised (out of scope).

### 1.4 `subscription` store-correlation / idempotency columns

Accepted ruling: additive columns (not a side table). These close the gap the scope
report flagged: dropping the legacy columns would re-open the BUG-116 / CR-2026-05-19-M11
webhook races and break both webhook handlers outright.

```sql
ALTER TABLE subscription
  ADD COLUMN stripe_customer_id                TEXT,
  ADD COLUMN stripe_subscription_id            TEXT,
  ADD COLUMN last_stripe_event_id              TEXT,
  ADD COLUMN last_stripe_event_timestamp       TIMESTAMPTZ,
  ADD COLUMN revenuecat_original_app_user_id   TEXT,
  ADD COLUMN last_revenuecat_event_id          TEXT,
  ADD COLUMN last_revenuecat_event_timestamp_ms TEXT,
  ADD COLUMN trial_ends_at                     TIMESTAMPTZ,
  ADD COLUMN cancelled_at                      TIMESTAMPTZ;

-- store-correlation uniqueness (legacy: UNIQUE columns; new convention: partial unique)
CREATE UNIQUE INDEX subscription_stripe_customer_id_idx
  ON subscription (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX subscription_stripe_subscription_id_idx
  ON subscription (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- BUG-116: DB-level idempotency for RevenueCat webhook events (storage-layer race fence).
-- Legacy fenced on (account_id, event_id); organization.id = accounts.id by reseed,
-- so the fence is semantically identical re-keyed to the org:
CREATE UNIQUE INDEX subscription_org_revenuecat_event_id_idx
  ON subscription (organization_id, last_revenuecat_event_id)
  WHERE last_revenuecat_event_id IS NOT NULL;
-- CR-2026-05-19-M11: same fence for Stripe subscription events:
CREATE UNIQUE INDEX subscription_org_stripe_event_id_idx
  ON subscription (organization_id, last_stripe_event_id)
  WHERE last_stripe_event_id IS NOT NULL;
```

`trial_ends_at` / `cancelled_at` come along because the trial-expiry pipeline
(IT-W0-patch-billing's F-121 fix included) and cancellation flows read them; the new
table's `period_start_at`/`period_end_at` already cover the period columns. The legacy
`tier`/`status` pgEnums map onto the new TEXT `plan_tier`/`status` (value sets
unchanged: `free|plus|family|pro`, `trial|active|past_due|cancelled|expired`; CHECKs
added in the same migration):

```sql
ALTER TABLE subscription ADD CONSTRAINT subscription_plan_tier_check
  CHECK (plan_tier IN ('free','plus','family','pro'));
ALTER TABLE subscription ADD CONSTRAINT subscription_status_check
  CHECK (status IN ('trial','active','past_due','cancelled','expired'));
```

**Quota satellites are kept, not replaced:** `quota_pools`, `profile_quota_usage`,
`usage_events`, `top_up_credits`, `webhook_idempotency` remain the quota/idempotency
substrate; their FKs re-point at drop time (§4 step 8) and their row keys never change
(`subscription.id = subscriptions.id`, `person.id = profiles.id`).

### 1.5 Reseed-extension block + verify-script extension (land in CUT-A, run at convergence)

The 0109 DO-block pattern extends to the new homes — same idempotent, convergent
design (mirror-deletes first, then `ON CONFLICT (id) DO UPDATE … WHERE … IS DISTINCT
FROM …`). Committed in CUT-A as `0111_identity_cutover_reseed.sql` (it runs once as a
migration on dev/stg; the runbook re-executes its DO block at the freeze for final
convergence, exactly as it re-runs 0109's):

```sql
-- (a) consent_states → consent_request (id reuse; ALL statuses, incl. the
--     PENDING/PARENTAL_CONSENT_REQUESTED rows 0109 deliberately skips)
INSERT INTO consent_request (
  id, charge_person_id, organization_id, purpose, requested_basis,
  guardian_email, status, token, token_expires_at,
  resend_count, recipient_change_count, policy_version, request_ip, user_agent,
  requested_at, responded_at, consent_grant_id, created_at, updated_at)
SELECT
  cs.id, cs.profile_id, p.account_id, 'platform_use',
  CASE cs.consent_type::text WHEN 'COPPA' THEN 'coppa_parental_consent'
                             ELSE 'gdpr_parental_consent' END,
  cs.parent_email,
  CASE cs.status::text
    WHEN 'PENDING'                     THEN 'pending'
    WHEN 'PARENTAL_CONSENT_REQUESTED'  THEN 'requested'
    ELSE 'approved'                    -- CONSENTED and WITHDRAWN (see §1.2 rationale)
  END,
  CASE WHEN cs.status = 'PARENTAL_CONSENT_REQUESTED' THEN cs.consent_token END,
  CASE WHEN cs.status = 'PARENTAL_CONSENT_REQUESTED' THEN cs.expires_at END,
  cs.resend_count, cs.recipient_change_count,
  cs.policy_version, cs.request_ip, cs.user_agent,
  CASE WHEN cs.status <> 'PENDING' THEN cs.requested_at END,
  cs.responded_at,
  CASE WHEN cs.status IN ('CONSENTED','WITHDRAWN') THEN cs.id END,  -- grant id = cs.id (0109)
  cs.created_at, cs.updated_at
FROM consent_states cs
JOIN profiles p ON p.id = cs.profile_id
ON CONFLICT (id) DO UPDATE SET /* convergent field-update, 0109 pattern */ ...;

-- (b) person preference/lifecycle re-homes (converges with the legacy values)
UPDATE person per SET
  conversation_language = p.conversation_language,
  pronouns              = p.pronouns,
  avatar_url            = p.avatar_url,
  default_app_context   = p.default_app_context,
  archived_at           = p.archived_at
FROM profiles p WHERE p.id = per.id
  AND (per.conversation_language, per.pronouns, per.avatar_url,
       per.default_app_context, per.archived_at)
      IS DISTINCT FROM
      (p.conversation_language, p.pronouns, p.avatar_url,
       p.default_app_context, p.archived_at);

-- (c) subscription store-correlation columns (converges; owned accounts only, as 0109)
UPDATE subscription sn SET
  stripe_customer_id = s.stripe_customer_id, stripe_subscription_id = s.stripe_subscription_id,
  last_stripe_event_id = s.last_stripe_event_id, last_stripe_event_timestamp = s.last_stripe_event_timestamp,
  revenuecat_original_app_user_id = s.revenuecat_original_app_user_id,
  last_revenuecat_event_id = s.last_revenuecat_event_id,
  last_revenuecat_event_timestamp_ms = s.last_revenuecat_event_timestamp_ms,
  trial_ends_at = s.trial_ends_at, cancelled_at = s.cancelled_at
FROM subscriptions s WHERE s.id = sn.id AND (...) IS DISTINCT FROM (...);

-- (d) birth_year_set_by → knowledge_assertions (deterministic id = person.id; one row each)
INSERT INTO knowledge_assertions (id, person_id, axis, method, confidence, source, asserted_at, actor_id)
SELECT p.id, p.id, 'age',
  CASE WHEN p.birth_year_set_by IS NOT NULL AND p.birth_year_set_by <> p.id
       THEN 'parent_reported' ELSE 'self_report' END,
  CASE WHEN p.birth_year_set_by IS NOT NULL AND p.birth_year_set_by <> p.id
       THEN 1.00 ELSE 0.80 END,          -- provisional (OQ-9)
  'reseed_0111_backfill', p.created_at, p.birth_year_set_by
FROM profiles p
ON CONFLICT (id) DO NOTHING;
-- + matching person.age_knowing cache update
```

**Verify-script extension** (same PR): `verify-identity-reseed.mjs` gains
forward/reverse checks for `consent_request` (every `consent_states` row has its
request, status-mapped, caps equal; no orphans), the §1.3/§1.4 field-convergence
checks, and the knowledge-assertion backfill check; the
`PENDING/PARENTAL_CONSENT_REQUESTED … not seeded` **exception is deleted** (it becomes
a hard check). Sample added check (runbook §4 uses these):

```sql
-- every consent_states row has its consent_request (id reuse + status mapping)
SELECT count(*)::int AS n FROM consent_states cs
LEFT JOIN consent_request cr ON cr.id = cs.id
WHERE cr.id IS NULL
   OR cr.status IS DISTINCT FROM (CASE cs.status::text
        WHEN 'PENDING' THEN 'pending'
        WHEN 'PARENTAL_CONSENT_REQUESTED' THEN 'requested'
        ELSE 'approved' END)
   OR (cr.resend_count, cr.recipient_change_count)
      IS DISTINCT FROM (cs.resend_count, cs.recipient_change_count);
```

### 1.6 Significance gate (MMT-ADR-0000 §II.1)

`consent_request` **crosses the gate** — trigger 2 (establishes a contract future
consent work must follow) and trigger 4 (changes the ratified data model). The §1.3/
§1.4 additive columns ride the same decision (they amend ratified canon). **One ADR**
covers the CUT-A amendment set: draft text in **Appendix A** (proposed number
MMT-ADR-0020 — next free after 0019; assigned at landing). The formal `docs/adr/` file
+ the `data-model.md` lockstep edit land **with CUT-A implementation**, per the brief.

---

## 2. Read-path cutover map (WP-CUT-B mechanics)

### 2.1 The cutover mechanism — one flag, domain seams, inert twins

- **One flag:** `IDENTITY_V2_ENABLED` (boolean, default **false**), read through the
  typed config object (`apps/api/src/config.ts` — eslint G4; value set in Doppler).
  ONE flag for the whole identity surface — never per-domain flags (partial
  activation = split-brain, banned).
- **Twin modules at domain seams, not per-call-site branches.** Each domain gets a v2
  implementation module; a thin dispatcher reads the flag once per request/job. The
  ~80 files do not each grow an `if` — they call through their existing service
  seams, and the seam dispatches. Concrete seam example (auth chain):

```ts
// middleware/account.ts (seam — the only place that picks an implementation)
const identity = c.env.IDENTITY_V2_ENABLED
  ? await resolveIdentityV2(db, userId, email)   // login→person→membership→organization
  : await findOrCreateAccount(db, userId, email); // legacy, untouched
c.set('account', identity.accountShape);          // same context shape either way
```

- **Writes are flag-gated too.** Until the flip, v2 write paths are unreachable
  (except in tests, which set the flag explicitly). Zero production writes hit the
  new tables before the convergence step — the final reseed owns new-model state
  (OQ-6: no early dual-writes).
- **`person.id = profiles.id`** (0109 deterministic IDs) is the load-bearing fact:
  `profileId` keeps its value everywhere — JWTs, `X-Profile-Id` headers, learning-data
  FKs, scoped-repo keys, caches. The cutover swaps *which table a symbol reads*, never
  *which id a row has*. `createScopedRepository(profileId)` keeps working unchanged
  across the flip (OQ-7: no symbol rename).

### 2.2 Sensitive surface 1 — the auth/account bootstrap chain (full detail)

Today: `authMiddleware` (Clerk JWT only, no DB) → `accountMiddleware` →
`findOrCreateAccount` (`services/account.ts`: SELECT/INSERT `accounts`, + initial
`subscriptions` + `quota_pools` rows) → `profileScopeMiddleware` (`profiles` read →
`profileMeta {profileId, birthYear, location, consentStatus, hasPremiumLlm,
conversationLanguage, isOwner}`) → `consentMiddleware` (pure, context-only).

| Step | Legacy read/write | v2 equivalent |
|---|---|---|
| JWT verify | none | unchanged |
| Account resolve | `accounts` by `clerk_user_id` | `login` by `clerk_user_id` → `person` (via `login.person_id`) → `membership` → `organization` |
| JIT create | INSERT `accounts` + `subscriptions` + `quota_pools` at first authed request | **deferred to onboarding completion** (OQ-1 option c): pre-graph requests run on Clerk identity alone; onboarding completion creates `organization` + `person` + `login` + `membership{admin,learner}` + `subscription` (+ `subscription_payers` primary row + `quota_pools`) in one transaction |
| Profile scope | `profiles` by id / `is_owner` | `person` by id; `isOwner` := `membership.roles @> '{admin}'`; `birthYear` := `extract(year from birth_date)`; `location` := jurisdiction mapping reversed (`US→US`, `EU→EU`, `ROW→OTHER`); `conversationLanguage` from `person` (§1.3); `hasPremiumLlm` → derived (§1.3) |
| Consent gate | `profileMeta.consentStatus` from `getConsentStatus` (latest `consent_states` row) | same 4-value status from the **compatibility resolver** (§2.3) |

The `profileMeta` context shape is **unchanged** — every downstream route/service is
insulated. Pre-graph ("no person yet") resolves to the same context state as today's
"no profile yet", so mobile sees identical responses during onboarding. Consequences
of the deferred JIT (flagged in OQ-1): the trial clock starts at onboarding
completion, and the ownerless-account class (signup abandoned pre-onboarding) can no
longer exist.

### 2.3 Sensitive surface 2 — consent (full detail)

The whole of `services/consent.ts` gets a v2 twin (`consent-v2.ts`) writing
`consent_request` + `consent_grant`:

| Legacy function | v2 behavior |
|---|---|
| `createPendingConsentState` | INSERT `consent_request(status='pending')` |
| `createGrantedConsentState` (parent-created child) | INSERT `consent_grant(granted=true, lawful_basis per regime, snapshot_*)` directly — **no request row** |
| `requestConsent` | atomic upsert on the unique key: `'pending'→'requested'`, token+expiry, caps in `setWhere` (§1.2) |
| `resendConsent` | same row, `resend_count++` under cap, fresh token |
| `processConsentResponse(approve)` | tx: request → `'approved'` + INSERT `consent_grant` + set `consent_grant_id` |
| `processConsentResponse(deny)` | tx: request → `'denied'` + the existing child-deletion cascade (`deletion.ts` v2) |
| `revokeConsent` | INSERT `consent_grant(granted=false… )` — implemented as `withdrawn_at` on the live grant + `prior_value`/`audit_fact` per the ratified direction-aware gate; nudge-clearing unchanged |
| `restoreConsent` (7-day grace) | new `consent_grant` row (granted=true, `prior_value=false`); grace check against the withdrawal timestamp |
| `getConsentStatus` | **compatibility resolver**: open request `'pending'`→`PENDING`, `'requested'`→`PARENTAL_CONSENT_REQUESTED`; else latest grant per `(charge,purpose,org)`: granted & not withdrawn → `CONSENTED`, withdrawn → `WITHDRAWN`; no rows → `null`. Mobile's `consentStatusSchema` is served unchanged. |
| `getChildNameByToken` | token lookup on `consent_request_token_idx`, expiry check identical |
| `isGdprProcessingAllowed` | resolver above ≠ `CONSENTED` → false (same semantics; shared helper — single re-point covers its 7+ Inngest callers) |

`middleware/consent.ts` is already pure (reads `profileMeta`) — no change beyond the
resolver feeding `profileMeta.consentStatus`. The Inngest `consent-reminders` /
`consent-revocation` functions re-target `consent_request` / the resolver in CUT-B2;
cadence, caps, token refresh (+16 d), and the day-30 auto-delete are unchanged.

### 2.4 Sensitive surface 3 — both payment webhooks (full detail)

| Surface | Legacy | v2 |
|---|---|---|
| `routes/stripe-webhook.ts` | signature verify; `webhook_idempotency` claim (KV + table — **unchanged**, not a legacy-identity table); dispatch | unchanged route; handler seam dispatches |
| `services/billing/stripe-webhook-handler.ts` | `subscriptions` R/W by `stripe_customer_id`/`stripe_subscription_id`; `quota_pools` R/W; event fence `(account_id, last_stripe_event_id)` partial unique | `subscription` R/W by the same correlation columns (§1.4); `quota_pools` unchanged (FK id identical); fence `(organization_id, last_stripe_event_id)` — same row, same semantics (`organization.id = accounts.id`) |
| `routes/revenuecat-webhook.ts` | bearer auth; `app_user_id` (Clerk id) → `findAccountByClerkId` (`accounts`); `isRevenuecatEventProcessed` (BD-01 ordering on `last_revenuecat_event_*`) | `app_user_id` → `login.clerk_user_id` → `membership` → `organization` → `subscription`; same BD-01 ordering on the §1.4 columns |
| `services/billing/revenuecat{,-webhook-handler}.ts` | `subscriptions`/`quota_pools`/`top_up_credits` writes per event type | identical writes against `subscription` + unchanged satellites; `top_up_credits.revenuecat_transaction_id` idempotency untouched |

The BUG-116 and CR-2026-05-19-M11 storage-layer race fences are preserved
**by construction** (same partial-unique pattern, §1.4) — the negative-path break
tests for both races are re-run against the v2 handler in CUT-B3 (red-green per the
security-fix rule).

### 2.5 Sensitive surface 4 — the 22 Inngest identity readers (full detail)

Common re-points (cover most functions via shared helpers, single edit each):
**(i)** `isGdprProcessingAllowed` → consent resolver (§2.3); **(ii)** `findOwnerProfile(accountId)`
→ `membership.roles @> '{admin}'` person lookup; **(iii)** profile context loads
(`birthYear`/`conversationLanguage` for LLM prompts) → `person` columns;
**(iv)** `profiles.archived_at` liveness → `person.archived_at`; **(v)** scan joins
`profiles × accounts` (timezone) → `person × membership × organization`.

| Inngest fn | Legacy identity reads | v2 re-point | PR |
|---|---|---|---|
| `consent-reminders` | `consent_states` sweep + token refresh + day-30 delete | `consent_request` sweep (§2.3) | B2 |
| `consent-revocation` | `consent_states`, `profiles`, `family_links`, `nudges` | resolver + `person.archived_at` + `guardianship` | B2 |
| `daily-reminder-scan` | `profiles×accounts×consent_states` scan + prefs | (v) + CONSENTED filter via resolver | B2 |
| `daily-reminder-send` | `profiles` liveness | (iv) | B2 |
| `daily-snapshot` | `profiles` liveness fan-out | (iv) | B1 |
| `memory-facts-embed-backfill` | `profiles` liveness | (iv) | B1 |
| `memory-facts-backfill` | `learning_profiles` only — satellite | re-point only if symbols imported | B1 |
| `monthly-report-cron` | `accounts×family_links×profiles` + GDPR gate | (v) + `guardianship` + (i) | B2 |
| `post-session-suggestions` | `profiles` + GDPR gate | (iii) + (i) | B1 |
| `progress-summary` | `family_links`, `profiles` + GDPR gate | `guardianship` + (i) | B2 |
| `recall-nudge` / `recall-nudge-send` | scan/liveness + `family_links` + consent filter | (iv)+(v) + `guardianship` + (i) | B2 |
| `review-due-scan` / `review-due-send` | same shape | same | B2 |
| `session-completed` | `profiles` (birthYear, conversationLanguage ×4 reads) + GDPR gate | (iii) + (i) | B1 |
| `subject-prewarm-curriculum` / `subject-retry-curriculum` | `profiles` (LLM context) + GDPR gate | (iii) + (i) | B1 |
| `summary-regenerate` | `profiles.conversation_language` (multiple reads) | (iii) | B1 |
| `book-pre-generation` | `profiles` (ownership chain + LLM context) | (iii) | B1 |
| `trial-expiry` | `subscriptions`/`quota_pools` R/W + `findOwnerProfile` push recipient | `subscription` (§1.4 `trial_ends_at`) + (ii) | B3 |
| `weekly-progress-push` | `accounts×family_links×profiles` + GDPR gate | (v) + `guardianship` + (i) | B2 |
| `weekly-self-reports` | `profiles`+`family_links` (notExists) + GDPR gate | `person` + `guardianship` notExists + (i) | B2 |
| *(not identity readers: `quota-reset` — billing satellites only; `filing-stranded-backfill` — learning tables only)* | | satellites unchanged | — |

Inngest **event payloads carry ids only** (the W3 PII work guaranteed this), so no
event schema changes; functions branch on the flag at their step boundaries via the
shared helpers.

### 2.6 Pattern-level map for the remaining readers

Every remaining file falls into one of six mechanical patterns (per-file assignment
in Appendix B):

| Pattern | Legacy → v2 | Files (examples) |
|---|---|---|
| P1 person-scope read | `profiles` by id → `person` (cols per §2.2) | snapshot-aggregation, coaching-cards, session-cache, exchanges, learner-profile, onboarding |
| P2 owner/role gate | `profiles.is_owner` → `membership.roles @> '{admin}'` | profile, settings, routes/profiles, child-cap-notifications |
| P3 family edge | `family_links` → `guardianship (revoked_at IS NULL)` | family-access, family-bridge, dashboard, nudge, notifications, solo-progress-reports |
| P4 consent status | `getConsentStatus`/`isGdprProcessingAllowed` → resolver (§2.3) | dashboard, export, nudge, notifications, weekly-digest |
| P5 billing read | `subscriptions(account_id)` → `subscription(organization_id)` (+§1.4 cols) | billing services, routes/billing, metering, session-exchange-router (tier) |
| P6 account root | `accounts` → `organization` (timezone, deletion stamps) / `login` (email, clerk id) | account, deletion, export, nudge |

`services/test-seed.ts` (~100 legacy inserts) gets a v2 twin seeding the new model
(same scenario API, flag-selected) — it is the single biggest test-enabling lever.
`services/export.ts` (GDPR export) maps all six patterns; its v2 output enumerates the
new tables (person, login, organization, membership, guardianship, consent_request,
consent_grant, subscription) — an explicit reviewer checkpoint in CUT-B2 because
export completeness is a compliance surface.

### 2.7 The 57-FK re-point list

57 FK constraints across 23 schema files re-point in the drop migration (§4 step 8) —
**constraint re-point only; columns, values, and names stay** (OQ-7). Targets:
`profiles.id → person.id` (47), `accounts.id → organization.id` (4: deletion-feedback
/ export-adjacent tables keyed by account), `subscriptions.id → subscription.id` (6:
quota satellites). The 4 intra-legacy FKs drop with their tables. Per-file counts in
Appendix C; the authoritative enumeration at execution time is:

```sql
SELECT conrelid::regclass AS child_table, conname
FROM pg_constraint
WHERE confrelid IN ('profiles'::regclass, 'accounts'::regclass, 'subscriptions'::regclass)
ORDER BY 1;
```

Re-point pattern (per constraint, one transaction; pre-launch data sizes make
`NOT VALID`+`VALIDATE` staging unnecessary):

```sql
ALTER TABLE learning_sessions
  DROP CONSTRAINT learning_sessions_profile_id_profiles_id_fk,
  ADD CONSTRAINT learning_sessions_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;
```

The kept profile-adjacent feature tables (`withdrawal_archive_preferences`,
`family_preferences`, `pending_notices`, `child_cap_notifications`, `nudges`) re-point
the same way — they are live product features, **not** legacy identity.

### 2.8 Test-file transition (~194 files)

- **During CUT-B (per domain PR):** legacy tests stay untouched and green (legacy is
  the live store — they are the regression net). Each PR adds **v2 tests** for its
  twin (unit + integration), running with the flag set true in the test setup;
  integration tests exercise the real new tables (0108/0109/0110 applied to the test
  DB). The GC1/GC6 internal-mock rules apply to all new tests.
- **The ~194 files split two ways:** (a) ~dozens that *test identity behavior* —
  these get v2 twins in their domain's PR; (b) the long tail that merely *seeds*
  identity to test learning features — these flip mechanically when `test-seed` v2
  becomes the default at the flip, mostly without edits (ids and API shapes are
  unchanged).
- **At WI-586 grep-clean (§4 step 9):** legacy-twin tests and the legacy seeding path
  are deleted; v2 tests become THE tests; the flag is removed from test setups. The
  45/51 integration suites that touch legacy table names are re-run green against the
  post-drop schema as the WI-586 acceptance bar.

---

## 3. WP-CUT-B PR partition

Three PRs, sequenced. Each lands twins + dispatchers + tests; **flag stays false in
every environment until §4 step 6**. CUT-A precedes all of them (the twins read/write
§1 objects).

| PR | Domain | Contents | Depends on |
|---|---|---|---|
| **CUT-B1 — identity spine** | auth/account/person | config flag plumbing; `resolveIdentityV2` + deferred-JIT bootstrap (§2.2, OQ-1); `profileMeta` v2; person-scope twins (profile, settings, onboarding, learner-profile, session-cache/exchanges context, snapshot-aggregation, coaching-cards); shared helpers (ii)–(v); `test-seed` v2 core; the P1/P2 Inngest functions (B1 rows, §2.5) | CUT-A |
| **CUT-B2 — consent + family** | consent/guardianship/deletion | `consent-v2.ts` + compatibility resolver; consent routes/web re-target; `deletion.ts`/`export.ts`/`notices` v2; `guardianship` reads (family-access, family-bridge, dashboard, nudge, notifications, solo-progress-reports, weekly-digest); the B2 Inngest functions | CUT-B1 (helpers, profileMeta) |
| **CUT-B3 — billing + webhooks** | subscriptions/quota | `subscription-core` v2; both webhook handler twins (+ re-run BUG-116/CR-M11 break tests); metering/tier/trial/top-up/quota-provision/reconcile/family v2; routes/billing; `trial-expiry` Inngest; `session-exchange-router` tier source; drop the dead `hasPremiumLlm` override | CUT-B1 |

CUT-B2 ∥ CUT-B3 may run in parallel after B1 merges (disjoint service surfaces; both
touch only their own twins).

**Single-live-store argument at each merge point** (the invariant, per PR):

1. **CUT-B1:** every v2 module is reachable only behind `IDENTITY_V2_ENABLED=false`
   ⇒ unreachable in every deploy. Legacy paths are byte-identical except the seam
   indirection (dispatcher defaults to legacy). No write to any new table can occur
   (v2 writes live inside v2 modules). Legacy = sole live store. ✓
2. **CUT-B2:** same argument; additionally the consent resolver is only constructed
   inside v2 modules, and `consent_request` has no flag-off writer. ✓
3. **CUT-B3:** same; the §1.4 columns are written only by v2 handlers; webhooks
   continue to hit legacy handlers verbatim. ✓

In all three: tests that exercise v2 set the flag explicitly in-process; no deployed
environment carries the flag until the convergence step. Partial per-domain
activation is impossible by construction — there is no per-domain flag to set.

**Estimated shape:** B1 ≈ L (the auth chain + ~30 files), B2 ≈ L (consent machine +
~25 files), B3 ≈ M–L (billing ~20 files). Each is a reviewable single PR because the
legacy side is untouched (pure addition + seam indirection).

---

## 4. Convergence runbook — the shrunk WI-586

**Roles.** *Flip owner:* **Jorn (operator/shepherd)** — personally executes steps 2,
6, and 8's go decision (Doppler flip + migration go) per env. *Executor:* the WI-586
executor performs the mechanical steps under the executor-protocol hard rule — at the
two STOP points (before step 3 and before step 8) it reports exact planned commands
and waits for shepherd go.

**Preconditions (gate, verified before step 1):** CUT-A + CUT-B1/B2/B3 merged; CI
green on `main`; OQ-1…OQ-9 ruled at ratification; ownerless disposal ruled (OQ-3);
dev rehearsal of this entire runbook completed once before staging.

Per environment — **dev first (full rehearsal), then staging**; production §4.1.

1. **Freeze.** Announce; pause the Inngest app (no crons/fan-outs mid-reseed); deploy
   with `MAINTENANCE_READONLY=true` (typed-config flag added in CUT-B1) so the API
   rejects writes with 503 + `Retry-After`. Pre-launch, the window is minutes and
   user-invisible.
2. **Recovery posture (binding constraint).** Record the Neon PITR marker and create
   the pre-drop branch — this **is** the rollback story for everything after step 5:
   ```bash
   neonctl branches create --project-id <env-project> \
     --name pre-drop-2026-MM-DD --parent main   # + record timestamp in the WI evidence
   ```
3. **Ownerless disposal** *(STOP → shepherd go)*. Dev: bulk-delete the 223 ownerless
   accounts (cascade removes their orphan rows):
   ```sql
   DELETE FROM accounts a
   WHERE NOT EXISTS (SELECT 1 FROM profiles p
                     WHERE p.account_id = a.id AND p.is_owner = true);
   ```
   Staging: the same statement — the case-by-case review is done (Appendix D: all 6
   are test artifacts; OQ-3).
4. **Final convergent reseed.** Re-execute the committed 0109 DO-block, then the 0111
   extension block (§1.5), via SQL console/psql (both are idempotent + convergent;
   mirror-deletes reconcile rows deleted since the last run; upserts converge drift).
5. **Parity verification.** `DATABASE_URL=… node
   packages/database/scripts/verify-identity-reseed.mjs` → **exit 0 required**, with
   the §1.5 extensions active and the exception report **empty** (post-disposal,
   ownerless exceptions = 0; the consent-request exception is now a hard check).
   The check set is the legacy-vs-new query battery — e.g. (existing)
   `every profile has its person (id reuse)`, `person fields converged`,
   `every subscription of an owned account is re-anchored (tier/status/org/payer/periods)`,
   plus (new) the §1.5 consent-request and store-column convergence checks. Spot-audit
   minimum, run manually and recorded in the WI evidence:
   ```sql
   SELECT (SELECT count(*) FROM profiles)        = (SELECT count(*) FROM person)        AS persons_ok,
          (SELECT count(*) FROM accounts)        = (SELECT count(*) FROM organization)  AS orgs_ok,
          (SELECT count(*) FROM family_links)    = (SELECT count(*) FROM guardianship
                                                    WHERE revoked_at IS NULL)           AS guardianships_ok,
          (SELECT count(*) FROM consent_states)  = (SELECT count(*) FROM consent_request) AS requests_ok,
          (SELECT count(*) FROM subscriptions)   = (SELECT count(*) FROM subscription)  AS subs_ok;
   ```
6. **Flip (atomic).** Set `IDENTITY_V2_ENABLED=true` in Doppler for the env; deploy
   the worker; unset `MAINTENANCE_READONLY`; resume Inngest. From this deploy, all
   reads AND writes go to the new model; **legacy is frozen** (no code path writes it
   — every write site branched on the same flag).
7. **Soak + smoke.** Staging: 24 h (OQ-4) with the e2e smoke + web suite green; smoke
   checklist: sign-in → profileMeta resolves; onboarding creates the v2 graph; consent
   request→approve round-trip (email link); Stripe + RevenueCat webhook replay
   (duplicate-event fence holds); quota metering decrements; one Inngest cron cycle
   (reminder scan) clean. Legacy tables remain queryable for ad-hoc diffing during the
   soak. **Abort path:** see Rollback below.
8. **Drop migration** (`0112_drop_legacy_identity.sql`) *(STOP → shepherd go)*. One
   transaction: re-point the 57 FKs (§2.7 pattern; enumerated by the §2.7 catalog
   query), then:
   ```sql
   DROP TABLE consent_states, family_links, profiles, subscriptions, accounts;
   DROP TYPE consent_status, consent_type, location_type,
             subscription_status, subscription_tier;
   ```
   (children before parents; kept satellites already re-pointed; `webhook_idempotency`,
   `withdrawal_archive_preference` + `pending_notice_type` enums stay — their tables
   live on). The migration file carries the §4.2 `## Rollback` section verbatim.
9. **Grep-clean — full legacy retirement** (same PR as 8 or an immediately following
   one, merged together with it):
   - **Schema/code:** delete legacy table defs (`schema/profiles.ts` legacy exports,
     `billing.ts` `subscriptions`), `account-repository.ts`, every legacy twin module
     and seam dispatcher, the `IDENTITY_V2_ENABLED` flag itself (v2 becomes the only
     path), legacy Drizzle types/keys, `repository.ts` legacy imports.
   - **Obsolete W-wave scaffolds/guards:** `packages/database/src/migrations/identity-t1-backfill.sql`
     + its embedded-guard test (0106 archaeology); the reseed exception-report branches
     that reference legacy states; `deploy-baseline-guard`'s legacy-content pins
     reviewed (keep the guard, retire dead assertions).
   - **Guards that transfer (update, not delete):** `cascade-fk-guard.test.ts` →
     scans `person_id` columns/identity schema; `rls-coverage.test.ts` scanner →
     covers `person_id`-keyed tables; `withProfileScope` RLS GUC unchanged
     (`person.id = profiles.id`).
   - **Tests:** delete legacy-twin tests + legacy seeding; flag removed from setups;
     full suite + 51 integration suites green post-drop.
   - **Docs:** update `docs/architecture.md`, `docs/project_context.md`,
     `docs/audience-matrix.md`, `AGENTS.md` references to legacy tables;
     `docs/canon/identity/data-model.md` "Replaces (legacy)" column annotated as
     historical; stale `.claude/memory/` entries archived per the memory schema.
   - **Acceptance:** repo-wide `rg -i "consent_states|family_links|\bprofiles\b|\baccounts\b|\bsubscriptions\b"`
     over source (schema/services/tests) returns only historical docs/ADR/migration
     archaeology; tests green; `pnpm exec nx run-many -t lint typecheck test` green.

### 4.1 Production

Prod is empty, schema-stale (0108/0109 unapplied), and its deploy pipeline is blocked
by **BUG-12 — IDEMPOTENCY_KV Cloudflare Worker binding missing, P1, captured during
WI-585**. Per the accepted ruling: prod receives the whole chain — 0108 → 0109 → 0110
→ 0111 → flip → 0112 — via the existing `workflow_dispatch` + environment-approval
path once BUG-12 is fixed; reseed-on-empty is a no-op that must still verify exit 0;
**prod apply does not gate WI-586's close** (recorded as an explicit caveat/follow-up
in the WI-586 completion summary).

### 4.2 `## Rollback` (verbatim section for the 0112 migration; per-step truth table)

| Through step | Rollback possibility | Procedure | Data lost |
|---|---|---|---|
| 1–2 (freeze, marker) | trivial | unfreeze (unset flag, resume Inngest) | none |
| 3 (ownerless disposal) | PITR only | restore from the step-2 branch/marker | none of value (deleted rows are verified test junk) |
| 4–5 (reseed + verify) | trivial | nothing to undo — legacy untouched; new tables can be re-converged or truncated and re-seeded at will | none |
| 6–7 (flip, soak) | **conditional** | flip `IDENTITY_V2_ENABLED=false` + redeploy. Writes made while flipped exist **only in the new model**; flipping back orphans them. Zero-write window → lossless. Otherwise: restore the whole DB from the step-2 marker (pre-launch-acceptable), or accept the loss of post-flip writes. **No reverse-sync will ever be built** (clean-cut doctrine). | post-flip writes (if any) |
| 8 (drop) | **IMPOSSIBLE forward** | the five legacy tables and their enums are gone; no migration can recreate their data. Recovery = Neon PITR restore / promote the step-2 `pre-drop-*` branch — which rewinds the **entire database**, losing **all writes made after the marker** (including post-flip new-model writes). | everything after the marker, on a recovery event |
| 9 (grep-clean) | normal git revert | code-only | none |

**Stated explicitly per the repo schema-safety rule: rollback of the drop migration is
impossible. Recovery is PITR-restore-to-marker with the data loss named above.**

---

## Appendix A — draft ADR text (lands with CUT-A as `docs/adr/MMT-ADR-0020-*.md`; number assigned at landing)

> # MMT-ADR-0020 — Cutover-completion amendments: consent-request workflow table + identity-model re-homes
>
> **Status:** Proposed (drafted in the 2026-06-11 cutover plan; Accepted at CUT-A landing)
> **Scope:** Identity Foundation. **Amends:** `MMT-ADR-0011`/`0015` (data-model realization). **Builds on:** `MMT-ADR-0008` (guardianship), `0002` (store-delegated Payer), `0014` (router/premium routing).
>
> ## Context
> The ratified 8-table model holds the identity graph and the append-only consent
> *event log* (`consent_grant`), but the application's WI-586 cutover inventory
> exposed three live surfaces with no home in it: (1) the consent-REQUEST workflow —
> pre-grant states (`PENDING`/`PARENTAL_CONSENT_REQUESTED`), parent-email contact,
> response token + expiry, and the WI-374 abuse caps (`resend_count`,
> `recipient_change_count`) — today carried by legacy `consent_states`; (2) the
> payment-store correlation/idempotency identifiers (Stripe customer/subscription
> ids, Stripe/RevenueCat last-event fences per BUG-116 / CR-2026-05-19-M11) — today on
> legacy `subscriptions`; (3) person-level presentation/preference/lifecycle columns
> (`conversation_language`, `pronouns`, `avatar_url`, `default_app_context`,
> `archived_at`) — today on legacy `profiles`. Dropping legacy without homes for these
> would re-open closed webhook races and orphan a live COPPA/GDPR workflow.
>
> ## Decision
> 1. **New table `consent_request`** — the operational consent-request workflow,
>    keyed `(charge_person_id × purpose × organization_id)` (UNIQUE; single-row
>    recycling preserves the WI-374 monotonic caps). States
>    `pending|requested|approved|denied|expired`; token lifecycle and Bug #872 audit
>    fields carried 1:1 from legacy. Approval writes a `consent_grant` row and
>    back-links it (`consent_grant_id`). Requests are operational state; grants
>    remain the sole audit record. Approval never creates a guardianship edge
>    (inv 14); withdrawal/restore are grant-layer events, never request states.
> 2. **Additive `subscription` columns** for store correlation + idempotency
>    (`stripe_customer_id`, `stripe_subscription_id`, `last_stripe_event_id`(+ts),
>    `revenuecat_original_app_user_id`, `last_revenuecat_event_id`(+ts_ms),
>    `trial_ends_at`, `cancelled_at`) with the partial-unique event fences re-keyed
>    `(organization_id, last_*_event_id)` — semantics identical
>    (`organization.id = accounts.id` by the deterministic reseed).
> 3. **`person` re-homes:** `conversation_language` (NOT NULL default 'en', 10-language
>    CHECK), `pronouns` (≤32 CHECK), `avatar_url`, `default_app_context`
>    (study|family CHECK), `archived_at` (operational lifecycle marker; consent *why*
>    stays in the grant layer). `birth_year_set_by` folds into `knowledge_assertions`
>    provenance; `is_owner` derives from `membership.roles`; `has_premium_llm` is
>    **not** stored — premium routing derives per `MMT-ADR-0014` + the model register
>    (no application writer of the legacy column exists; behavior-neutral).
>
> ## Alternatives considered
> - *Workflow states inside `consent_grant`:* rejected — pollutes the append-only
>   audit log with mutable operational state; violates the computed-not-stamped
>   posture (inv 2) and the grant log's regulator-facing purity.
> - *Append-per-cycle `consent_request` rows:* rejected — resets WI-374 counters per
>   cycle, re-opening the email-bombing vector unless windowed sums are added;
>   single-row recycling reproduces the proven legacy cap semantics exactly.
> - *Store-correlation side table:* rejected by operator ruling — additive columns;
>   the identifiers are 1:1 with the subscription row and the partial-unique fences
>   need the row anyway.
> - *Storing `has_premium_llm` on membership:* rejected — no writer exists; storing
>   would contradict the `MMT-ADR-0014` derived-routing posture.
>
> ## Consequences
> - The legacy drop (WI-586) becomes possible without losing the consent workflow,
>   webhook idempotency, or live preference data.
> - `consent_request` joins the RLS surface (person-scoped); the retain-tier is
>   unaffected (requests die with the person — no receipt obligation pre-consent).
> - Canon lockstep: `docs/canon/identity/data-model.md` gains the §2B cutover
>   amendments in the same change-set as this ADR.
> - The purpose vocabulary (`platform_use`) and lawful-basis values are finalized as
>   DB-mastered data; future per-purpose consent (inv 27) extends rows, not schema.

---

## Appendix B — full reader inventory (78 symbol-grep files + 2 service-reached)

Legend: tables column lists legacy identity tables only (satellites in parentheses);
Pattern per §2.6; PR per §3. Detail rows for sensitive surfaces are in §2.2–§2.5.

| File | Legacy tables | Purpose | Pattern | PR |
|---|---|---|---|---|
| `middleware/account.ts`† | accounts (W), subscriptions/quota_pools (W) | JIT account bootstrap | P6/P5 | B1 |
| `middleware/profile-scope.ts`† | profiles | profileMeta resolution | P1/P2 | B1 |
| `middleware/consent.ts` | (context only) | consent gate | P4 | B2 |
| `middleware/metering.ts`† | (subscriptions via services; quota satellites) | quota + llmTier | P5 | B3 |
| `services/account.ts` | accounts (R/W) | find/create account; deletion support | P6 | B1 |
| `services/profile.ts` | profiles, family_links, consent_states (R/W) | profile CRUD + consent-state creation | P1/P2/P3/P4 | B1 (consent calls → B2) |
| `services/settings.ts` | profiles (+prefs satellites) | prefs, learning modes | P1/P2 | B1 |
| `services/onboarding/index.ts` | profiles (W) | language/pronouns/interests | P1 | B1 |
| `services/learner-profile.ts` | profiles | learning profile + memory consent | P1/P4 | B1 |
| `services/session/session-cache.ts` | profiles | per-session profile context cache | P1 | B1 |
| `services/exchanges.ts` | profiles (via cache) | LLM exchange context | P1 | B1 |
| `services/exchange-prompts.ts` | (in-memory meta) | prompt builders | P1 | B1 |
| `services/llm/conversation-language.ts` | (validator) | language clamp at read boundary | P1 | B1 |
| `services/session/session-crud.ts` | (learning tables; profiles FK) | session lifecycle | P1 | B1 |
| `services/session/session-exchange-router.ts` | (tier via context) | premium/standard routing | P5 | B3 |
| `services/coaching-cards.ts` | profiles (scoped repo) | coaching card precompute | P1 | B1 |
| `services/memory/projection.ts` | (learning_profiles, memory_facts) | memory projection | P1 | B1 |
| `services/snapshot-aggregation.ts` | profiles | snapshots + inventory | P1 | B1 |
| `services/progress.ts` | (learning tables) | progress/resume | P1 | B1 |
| `services/practice-activity-summary.ts` | (satellites) | report aggregation | P1 | B1 |
| `services/quiz/queries.ts` | (scoped repo) | quiz reads | P1 | B1 |
| `services/consent.ts` | consent_states (R/W), profiles, family_links | the consent machine | §2.3 | B2 |
| `services/deletion.ts` | accounts, profiles, consent_states | scheduled + consent-gated deletion | P4/P6 | B2 |
| `services/export.ts` | all five + satellites | GDPR export | all | B2 |
| `services/notices.ts` | (pending_notices) | revocation notices | P3 | B2 |
| `services/family-access.ts` | family_links | parent→child authority check | P3 | B2 |
| `services/family-bridge.ts` | profiles (+learning) | child-topic clone | P1/P3 | B2 |
| `services/dashboard.ts` | family_links, profiles, consent_states | parent dashboard | P1/P3/P4 | B2 |
| `services/nudge.ts` | accounts, family_links, profiles, consent_states (+nudges) | parent nudges | P3/P4/P6 | B2 |
| `services/notifications.ts` | family_links, profiles, consent_states | push + GDPR gate | P3/P4 | B2 |
| `services/solo-progress-reports.ts` | accounts, consent_states, family_links, profiles | solo-report eligibility | P3/P4 | B2 |
| `services/weekly-digest.ts` | profiles, consent_states | weekly digest | P1/P4 | B2 |
| `services/child-cap-notifications.ts` | profiles, subscriptions (+satellite) | child cap notices | P2/P5 | B3 |
| `services/billing.ts` + `services/billing/{subscription-core,metering,quota-provision,quota-reconcile,revenuecat,stripe-webhook-handler,family,tier,top-up,trial,types}.ts` | subscriptions (R/W), profiles, family_links (+quota satellites) | the billing subsystem | P5 (+P2/P3) | B3 |
| `routes/stripe-webhook.ts`, `routes/revenuecat-webhook.ts`† | (webhook_idempotency; via handlers) | both payment webhooks | §2.4 | B3 |
| `routes/billing.ts` | subscriptions, profiles, family_links (+satellites) | billing REST | P5 | B3 |
| `routes/profiles.ts` | profiles, family_links, consent_states, subscriptions | profile REST | P1–P5 | B1/B2 |
| `routes/learner-profile.ts` | profiles (+learning) | learner-profile REST | P1 | B1 |
| `routes/onboarding.ts` | profiles (W) | onboarding REST | P1 | B1 |
| `routes/dashboard.ts` | (via dashboard service) | dashboard REST | P3/P4 | B2 |
| `routes/notifications.ts` | profiles, subscriptions (+satellite) | cap-notice REST | P2/P5 | B3 |
| `routes/test-seed.ts` + `services/test-seed.ts` | all five (W) + satellites | e2e seeding | twin | B1 core, B2/B3 domains |
| `apps/api/src/index.ts` | (mounting only) | entry point | — | B1 (flag plumbing) |
| `test-utils/{database-module,route-metering-fixture}.ts` | (test infra) | jest fixtures | — | with their suites |
| 24 × `inngest/functions/*` | per §2.5 table | background jobs | §2.5 | B1/B2/B3 per table |

† reaches legacy tables through service imports only (not in the 78 symbol-grep list);
included for completeness — the brief's ~80 ≈ 78 + these.

## Appendix C — FK re-point counts per schema file (57 total after excluding 4 intra-legacy)

`assessments` 4 · `billing` 8 (6 re-point to subscription/person; 2 intra-legacy drop) ·
`bookmarks` 1 · `challenge-round-cooldowns` 1 · `concept-mastery` 2 · `dictation` 1 ·
`embeddings` 1 · `language` 2 · `learning-profiles` 1 · `memory-dedup-decisions` 1 ·
`memory-facts` 1 · `notes` 1 · `notifications` 2 · `nudges` 2 · `practice-activity` 2 ·
`profiles` 7 (4 re-point — prefs/notices satellites; 3 intra-legacy drop) · `progress` 6 ·
`quiz-mastery` 1 · `quiz` 2 · `sessions` 5 · `snapshots` 7 · `subjects` 2 · `support` 1.
Authoritative enumeration at execution: the `pg_constraint` query in §2.7.

## Appendix D — staging ownerless accounts (the OQ-3 case-by-case list)

Read-only query run 2026-06-11 against staging (`accounts` with no `is_owner`
profile — the reseed-skipped class). All six are test artifacts; recommendation:
bulk-delete pre-drop (same as dev).

| account id | email (masked) | created | profiles | has subscription |
|---|---|---|---|---|
| `019e7f3a-58fd-7eae-a6af-de1c420b701e` | `sp***@test.local` | 2026-05-31 | 0 | no |
| `019e7f3a-5a33-78f4-9462-e3b9e253f084` | `sp***@test.local` | 2026-05-31 | 0 | no |
| `019e7f3a-5ad8-75d3-b3ce-9d8f469f0d10` | `sp***@test.local` | 2026-05-31 | 0 | no |
| `019e7f93-0fad-7d75-ba46-3bcf28e36478` | `st***@test.test` | 2026-05-31 | 0 | yes (orphan trial) |
| `019eb140-1e82-7a26-835a-348bff01022c` | `me***@integration.test` | 2026-06-10 | 1 (non-owner) | no |
| `019eb140-51e5-70f4-a494-0866e582ecb6` | `me***@integration.test` | 2026-06-10 | 1 (non-owner) | no |

*(The three `sp***@test.local` rows match the WI-569 "spillover-test artifacts"
finding; the two `integration.test` rows are 2026-06-10 integration-suite residue.)*
