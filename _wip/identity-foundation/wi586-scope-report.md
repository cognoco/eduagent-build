# WI-586 (WP-TAIL-drop-legacy) — plan-phase scope report

**Provenance.** Verbatim transcription of the wi586-executor's mandatory
plan-phase report, delivered to the shepherd 2026-06-11 (fresh-grep ground
truth from that session) immediately before the operator PAUSED WI-586 and
moved the scope ruling to the architecture/planning session. This is the
standing handoff artifact for that ruling. The executor wrote no code; the
claim (`wi586-executor`) was left to lapse. Finer per-file detail than what
appears below exists only in the executor's session transcript
(`tasks/a6344b82c132ef58b.output` under the shepherd session's task directory,
ephemeral) — the counts and named files below are the durable record.

---

## 1. Cutover-scope mapping

**Ground truth confirmed (fresh grep, this session):** zero runtime readers/writers of the new model. Every `person`/`login` etc. hit in `apps/api/src` is prose in comments/prompts. The policy engine (`apps/api/src/services/policy-engine/` — WI-571's spine deliverable) is an explicitly fail-closed **scaffold with no DB reads at all** ("W2/W3 will wire real DB reads once C2-B populates the policy tables" — its own header). The app runs 100% on the legacy tables, including all writes (signup → `services/account.ts:293` inserts `accounts`; `services/profile.ts`, `services/consent.ts`, `services/billing/subscription-core.ts`, `revenuecat.ts` insert the rest).

### Legacy table → readers → new-model equivalent

| Legacy table | Non-test API files reading it | Where | New-model equivalent | Gap |
|---|---|---|---|---|
| `profiles` | **64** | `middleware/consent.ts`, 6 route files (`profiles`, `onboarding`, `learner-profile`, `billing`, `notifications`, `test-seed`), ~35 services, 22 Inngest functions | `person` (+ `membership` for account-link/role) | 8 orphan columns (below); `is_owner` → `membership.roles` |
| `accounts` | **18** | `services/account.ts` (Clerk binding — the auth path), deletion, export, billing, 6 Inngest fns | `organization` + `login` (split) | none structural — `timezone`/`deletion_*` already homed on `organization` |
| `family_links` | **15** | consent, dashboard, family-access, notifications, profile, 5 Inngest fns | `guardianship` (person-keyed, + `revoked_at`, `qualification`) | semantics richer but compatible |
| `consent_states` | **11** | `services/consent.ts`, dashboard, profile, notifications, `consent-reminders` + 3 other Inngest fns | `consent_grant` (append-only, **completed events only**) | **the consent REQUEST workflow has no home**: `PENDING`/`PARENTAL_CONSENT_REQUESTED` states, `parent_email`, `consent_token`, `expires_at`, `resend_count`, `recipient_change_count` (WI-374 caps) don't exist in the new model |
| `subscriptions` | **19** | `routes/stripe-webhook.ts`, `routes/billing.ts`, 11 billing services, quota/trial Inngest fns | `subscription` + `subscription_payers` | **all store correlation/idempotency ids missing**: `stripe_customer_id`, `stripe_subscription_id`, `last_stripe_event_id`(+ts), `revenuecat_original_app_user_id`, `last_revenuecat_event_id`(+ts), `trial_ends_at`, `cancelled_at`. Dropping these re-opens the BUG-116 / CR-M11 webhook races and breaks both webhook handlers outright |

Union of non-test files ≈ **80**. Plus: **188 test files** reference these symbols, **45 of 51 integration suites** touch the legacy table names, and `services/test-seed.ts` (~100 legacy inserts) must be rewritten wholesale.

### Schema fan-in (the drop migration itself)

**57 FK references** across **23 schema files** point at `profiles.id`/`accounts.id` (every learning-data table, quota tables, snapshots, sessions…). The reseed's deterministic-id design (`person.id = profiles.id`, `organization.id = accounts.id`) makes this an ALTER-constraint re-point sweep, not a data rewrite — but it's 57 constraints in the irreversible migration. Three profile-adjacent tables (`withdrawal_archive_preferences`, `family_preferences`, `pending_notices`) are live product features **not** in the legacy-identity set: they are kept and re-pointed, not dropped.

### Verdict on the S estimate

"Remove legacy readers" is not a cleanup — it is **the full identity/billing/consent read-write cutover of the application** (~80 runtime files, 6 route groups, ~22 Inngest functions, the auth middleware path, both payment webhooks), plus model extensions for the gaps, plus the ~190-file test migration. That is **L–XL, multiple PRs**, against a priced S. Absorbing it silently into WI-586 would violate the estimate by an order of magnitude and put the riskiest migration of the program inside a giant mixed PR.

## 2. Recommended scope ruling — SPLIT (option B)

- **WP-CUT-A — model completion (additive, reversible):** migration 0110+ adds the missing homes (store-binding ids on `subscription` or a side table; consent-request table; person preference columns per D2 rulings). Canon lockstep: these touch `docs/canon/identity/data-model.md`, so the canon edit + any ADR delta ship in the same change-set.
- **WP-CUT-B — reader/writer cutover (possibly 2–3 PRs by domain: identity/profile, consent/family, billing/webhooks):** switch runtime code legacy→new, module-by-module, tests green per PR. Legacy tables stay live-but-frozen → every step reversible. New signups write the new model from the first cutover PR (closing the 0109 precondition window).
- **WI-586 shrinks back to its priced S shape:** final convergent reseed re-run + verify exit 0 per env → the single irreversible drop migration (re-point 57 FKs, drop 5 legacy tables + orphaned enums) → delete legacy schema defs/types/keys → full grep clean → tests green. The two bridged children (WI-631/632) can map onto cutover vs drop if you want to reuse them.

Option A (absorb everything into WI-586) is available but I recommend against it for the reasons above.

## 3. Rulings needed (orphans & disposal)

1. **`conversation_language`** — actively read on the LLM path (`services/llm/conversation-language.ts`, router; DB CHECK 0087). Recommend: column moves to `person` (canon edit). Cannot be dropped or deferred.
2. **`pronouns`, `avatar_url`, `default_app_context`** — presentation/preference data; recommend same re-home to `person` (or a `person_preferences` side table if canon wants `person` minimal).
3. **`has_premium_llm`** — billing/routing concern; recommend deriving from `subscription`/`allowed_models` routing per MMT-ADR-0014 register, else a `membership` flag. Needs operator ruling.
4. **`is_owner`** — replaced by `membership.roles ⊇ {admin}` + `subscription.payer_person_id`; derivable, drop at cutover. `birth_year_set_by` → fold into `knowledge_assertions`/`audit_fact` provenance, then drop.
5. **`archived_at`** — brief says semantics move to the consent layer; today it gates visibility in reads. Needs an explicit rule (consent-grant withdrawal + reader-side visibility predicate) before the column can die.
6. **Consent-request workflow state** — needs a new table (recommend `consent_request`, person-keyed, carrying email/token/expiry/caps). The **provisional 0109 vocabulary** (`platform_use` / `coppa_*` / `gdpr_*` lawful-basis) gets finalized when this first reader lands — that finalization belongs to WP-CUT-A, not the drop.
7. **Store correlation/idempotency ids** — must be re-homed additively (WP-CUT-A); not droppable, not deferrable.
8. **Ownerless accounts (223 dev / 6 stg, skipped by reseed — no `login`/`subscription` rows):** recommend dev = bulk-delete pre-drop (test junk); stg = inspect the 6 individually before ruling. Disposal executes in the pre-drop runbook.

## 4. Pre-drop runbook (per env — dev, stg; second mandatory STOP before running)

1. Record Neon point-in-time marker (branch/timestamp) — this **is** the recovery story; the migration's `## Rollback` will state: rollback IMPOSSIBLE post-drop, recovery = Neon PITR restore to this marker.
2. Re-run the committed 0109 block (idempotent + convergent; mirror-deletes first) — final top-up of rows written since cutover/last run.
3. `node packages/database/scripts/verify-identity-reseed.mjs` → **exit 0 required**; exception report must be empty after the D3 disposal ruling is applied.
4. Apply the drop migration (FK re-points + drops, one migration).
5. Post-drop: full test suite + integration suite green, project-wide grep clean (the WI's bar).
Per the executor-protocol hard rule the executor will report the exact commands and stop before touching shared dev/stg.

## 5. Production

Prod is empty, schema-stale (0108/0109 unapplied), and the deploy pipeline is blocked by BUG-12 (IDEMPOTENCY_KV — Cloudflare Worker binding missing, P1 captured during WI-585). Because prod has no data, reseed-on-empty is a no-op that must still verify exit 0. Recommendation: **do not gate WI-586's merge on prod apply** — prod receives the whole chain (0108 → 0109 → cutover migrations → drop) via the existing `workflow_dispatch` + environment-approval path once BUG-12 is fixed; WI-586's completion records that as an explicit caveat/follow-up rather than blocking the clean-cut on an unrelated infra bug.

---

## Executor's closing summary (verbatim)

**[ BOTTOM LINE ]** WI-586 as written hides a full application identity cutover (~80 runtime files, both payment webhooks, the consent workflow, ~190 test files) behind an S estimate — I recommend splitting cutover WPs out and keeping WI-586 as the priced reseed-verify-drop tail; no code written, claim held (`wi586-executor`, Stage=Executing).

**[ FYI ]**
- WI-585 (WP-TAIL-reseed) evidence confirmed via PR #963: dev+stg seeded/verified, deterministic ids make the 57-FK re-point mechanical, reseed reversible until this WI runs.
- Policy engine (WI-571 spine) has no DB reads — the C2-B policy-table population is a separate unstarted dependency for real enforcement, untouched by this WI either way.

**[ DECISIONS ]** (as posed to the shepherd; ruling moved to the architecture/planning session)
1. **Scope ruling (gates everything):** split per §2 (recommended) vs absorb into WI-586 re-estimated to XL.
2. **Orphan re-homes (§3 items 1–7):** approve the recommended re-homes (notably `conversation_language` → `person`, store ids → additive subscription columns, new `consent_request` table) or rule alternatives — these define WP-CUT-A's migration.
3. **Ownerless disposal:** dev bulk-delete + stg case-by-case (recommended), or keep-as-is.
4. **Prod chain:** accept "full chain rides the post-BUG-12 prod deploy, recorded as caveat" (recommended) vs gating WI-586 on prod apply.
