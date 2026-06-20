# Phase A/B Adversarial Review Report

Prepared: 2026-06-17  
Reviewer: Codex / Hex posture  
Source reviewed: `origin/main@50fbca3c5d865cef61897ce36546417430b03cf1`  
Kickoff: `_wip/identity-cutover/phase-ab-adversarial-review-kickoff.md`

## Verdict

**NO-GO for Phase C flip as-is.**

The four-table drop path itself looks mechanically protected in `origin/main`: I did not find a remaining flag-on production path that reads `profiles`, `accounts`, `family_links`, or `consent_states` after the flip. The blocker is a product/runtime regression outside the narrow dropped-table crash class: v2 `POST /v1/profiles` cannot create an additional child profile for an already-resolved account and instead returns the existing owner profile.

## Scope

Reviewed the kickoff scope plus the full Cosmo Identity Cutover workstream relation. The Cosmo workstream query returned 36 work items. Review was read-only: no implementation, no merges, no pushes, no lifecycle changes.

Primary landed commits in scope:

- `WI-586 (WP-TAIL-drop-legacy)` fixed in `ec996441b32f649a66a582d23610c5e5ca133921`
- `WI-809 (Flip-critical consent / dropped-table reader gating sweep)` fixed in `5f8759e8476c2ecb68c83c32b9216f0937ea1344`
- `WI-810 (Flip-critical quota-reset cron v2 gating)` fixed via PR #1213, landed at `50fbca3c5`
- Earlier de-journal / migration guard work included in `e17e393b4`

## Must Fix

### 1. v2 `POST /v1/profiles` prevents child profile creation

Evidence:

- `apps/api/src/routes/profiles.ts:141` enters the `IDENTITY_V2_ENABLED` branch.
- `apps/api/src/routes/profiles.ts:149` checks whether an account is resolved.
- `apps/api/src/routes/profiles.ts:151` loads the owner with `getOwnerProfileV2`.
- `apps/api/src/routes/profiles.ts:152-154` returns that existing owner as `201` before inspecting whether the request is an idempotent owner replay or an additional child-profile create.
- `apps/api/src/routes/profiles.ts:156-163` contains the intended "additional profile creation unavailable" refusal, but it is only reached if no owner exists under the resolved account.
- `packages/schemas/src/profiles.ts:58-72` shows the create payload has no owner/child discriminator, so the route cannot classify intent once an account exists.
- Product flow still expects family setup to open child profile creation: `docs/flows/master-directory/home/HOME-07.md:51-54`.

Impact:

Under flag-on, an adult owner attempting to add a child after the identity graph exists receives the owner profile again. That is not a dropped-table 500, but it is a cutover-visible regression in the family/onboarding path and should block Phase C until behavior is deliberately corrected or product accepts a temporary disabled-child-create state with explicit UX/API semantics.

## Should Fix

### 1. `M-REPOINT` header prose contradicts the executable migration

Evidence:

- `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:7-11` still says the file is an inert `_wip` draft to be promoted later, but it now lives in `apps/api/drizzle/_freeze-only/`.
- `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:23-27` says `accounts` is deliberately unmapped and `subscriptions` drops with legacy tables.
- The executable block is correct and newer: `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:84-90` maps `accounts -> organization`, and `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:92-98` removes `subscriptions` from the drop list.

Impact:

Not a SQL blocker: the actual migration body handles retained `subscriptions.account_id -> accounts.id` safely. But this is operator-run cutover material, and contradictory prose in a freeze migration increases the chance of a bad human decision during Phase C.

## Confirmed Safe

### Four-table drop shape

`M-DROP` drops only the four current legacy identity tables:

- `apps/api/drizzle/_freeze-only/0118_m_drop.sql:7-13` says `subscriptions` is retained.
- `apps/api/drizzle/_freeze-only/0118_m_drop.sql:43` drops `consent_states`, `family_links`, `profiles`, `accounts`.

### Re-point before drop

`M-REPOINT` handles the retained-table FK case:

- `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:88-90` maps `profiles -> person`, `subscriptions -> subscription`, `accounts -> organization`.
- `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:96-98` excludes only `profiles`, `accounts`, `family_links`, `consent_states` from live child re-pointing.
- `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:140-153` fails loudly if any live FK still targets the four dropped parents after re-point.

### Freeze migration guardrails

- `apps/api/drizzle/_freeze-only/0117_m_repoint.sql:1` and `apps/api/drizzle/_freeze-only/0118_m_drop.sql:1` both carry `-- @freeze-only`.
- `apps/api/drizzle/meta/_journal.json:807` shows the journal tail is `0116_dictation_completion_key_unique`; 0117/0118 are not journaled.
- `packages/database/scripts/check-reference-only-migrations.mjs:174-203` blocks journaled freeze-only migrations unless `ALLOW_FREEZE_MIGRATIONS=true`.
- `.github/workflows/deploy.yml:263-265` wires the guard into deploy.
- `packages/database/scripts/check-reference-only-migrations.test.mjs:258-269` asserts the real journal has no freeze-only migrations.

### HTTP identity/profile dispatch

- `apps/api/src/middleware/account.ts:141-160` resolves the v2 graph and avoids legacy account JIT creation under flag-on.
- `apps/api/src/middleware/profile-scope.ts:133-158` resolves absent-header owner profile from v2 person/membership under flag-on.
- `apps/api/src/middleware/profile-scope.ts:211-223` resolves explicit `X-Profile-Id` via v2 person scope under flag-on.
- `apps/api/src/routes/profiles.ts:124-126` uses `listProfilesV2` for `GET /v1/profiles` under flag-on.
- `apps/api/src/routes/profiles.ts:244-246` uses `getProfileV2` for `GET /v1/profiles/:id` under flag-on.
- `apps/api/src/routes/profiles.ts:319-321` uses `updateProfileV2` for `PATCH /v1/profiles/:id` under flag-on.
- `apps/api/src/routes/profiles.ts:341-343` uses `getPersonScope` for profile switching under flag-on.

### Consent/export/deletion dispatch

- `apps/api/src/routes/account.ts:73-74`, `164-165`, `249-250`, and `273-274` dispatch deletion/export operations to v2 under flag-on.
- `apps/api/src/services/identity-v2/export-v2.ts:203-205` calls legacy export with `learningOnlyProfileIds`.
- `apps/api/src/services/export.ts:201-224` skips legacy `accounts`, `profiles`, and `consent_states` reads when `learningOnlyProfileIds` is provided.
- `apps/api/src/services/export.ts:367-375` skips legacy `family_links` reads in the same mode.
- `apps/api/src/services/export.test.ts:739-743` asserts all four identity-table reads are skipped.

### Family and guardianship readers

- `apps/api/src/services/family-access.ts:60-73` returns through `validateGuardianChargeRelationshipV2` before legacy `family_links`.
- Route callsites in dashboard, learner-profile, onboarding, settings, nudge, and notification paths thread `identityV2Enabled` into parent-access helpers.
- `apps/api/src/services/family-bridge.ts:114-123` routes `getChildTopicSnapshotForParent` to the v2 child snapshot under flag-on before legacy `assertParentAccess`.

### Billing and quota

- `apps/api/src/routes/billing.ts:135-191` uses v2 subscription/access/quota helpers for billing status under flag-on.
- `apps/api/src/routes/billing.ts:953-970`, `1003-1013`, and `1051-1067` route family pool/member add/remove operations to v2 under flag-on.
- `apps/api/src/services/billing/billing-v2/dispatch.ts:125-130` dispatches Stripe webhooks to v2 handlers under flag-on.
- `apps/api/src/services/billing/billing-v2/dispatch.ts:223-228` dispatches RevenueCat webhooks to v2 handlers under flag-on.
- `apps/api/src/inngest/functions/quota-reset.ts:57-59` uses `resetExpiredQuotaCyclesV2` under flag-on.
- `apps/api/src/inngest/functions/quota-reset.test.ts:278-291` asserts flag-on calls v2 and not legacy quota-cycle reset.

### Inngest scanners and senders

Reviewed the direct dropped-table scanner surfaces. Legacy `profiles` / `accounts` / `family_links` / `consent_states` reads are flag-off branches only in the checked production paths.

Representative evidence:

- `apps/api/src/inngest/functions/daily-reminder-scan.ts:46-94` roots the flag-on query on `person`, `membership`, `organization`.
- `apps/api/src/inngest/functions/recall-nudge.ts:66-139` roots the flag-on query on v2 identity tables and returns before legacy `profiles`.
- `apps/api/src/inngest/functions/review-due-scan.ts:60-132` roots the flag-on query on v2 identity tables and returns before legacy `profiles`.
- `apps/api/src/inngest/functions/weekly-self-reports.ts:146-148` selects v2 eligible-person scanner under flag-on.
- `apps/api/src/inngest/functions/monthly-report-cron.ts:315-327` uses v2 consent and guardianship under flag-on.
- `apps/api/src/inngest/functions/session-completed.ts:1042-1059`, `1111-1124`, `1215-1225`, `1313-1328`, `1466-1468`, and `1823-1861` branch before legacy profile/consent reads.

### Flag parser

- `apps/api/src/config.ts:274-275` treats only exact string `true` as enabled.
- `apps/api/src/inngest/helpers.ts:99-102` uses the same exact check for Inngest.

## Cosmo Workstream Coverage

The Identity Cutover workstream relation currently includes these rows:

| Work Item | Review classification |
| --- | --- |
| `WI-586 (WP-TAIL-drop-legacy)` | Landed, reviewed. |
| `WI-765 (Enumerate full legacy reader/writer set)` | Landed, reviewed as inventory predecessor. |
| `WI-771 (listProfilesV2 / GET /v1/profiles)` | Landed, reviewed. |
| `WI-772 (Consent route + Inngest to consent-v2)` | Landed, reviewed via route/helper dispatch. |
| `WI-773 (Deletion + export v2)` | Landed, reviewed. |
| `WI-774 (Settings + learner-profile ownership v2)` | Landed, reviewed. |
| `WI-775 (Family-domain v2 twins / guards)` | Landed, reviewed. |
| `WI-776 (Billing services / isPersonUnderSubscriptionV2)` | Landed, reviewed. |
| `WI-777 (Inngest scans v2)` | Landed, reviewed. |
| `WI-778 (test-seed-v2)` | Landed; not deeply re-reviewed beyond downstream references. |
| `WI-779 (WP-FLAG remove flag + legacy schema/twins)` | Unfixed; post-cutover cleanup, not Phase C flip blocker. |
| `WI-780 (consent_request service-role RLS exceptions)` | Landed; not identified as a blocker in this pass. |
| `WI-782 (visibility-contract rework)` | Unfixed; residual product/security design risk, not four-table drop blocker. |
| `WI-784 (homework-summary Inngest billing v2 twin)` | Landed, reviewed in `session-completed`. |
| `WI-785 (identity-reseed integration deflake)` | Landed; test-infra enabler. |
| `WI-786 (family-access parent-on-behalf v2 twin)` | Landed, reviewed. |
| `WI-788 (test-seed committed-migration FK parents)` | Landed; test-infra enabler. |
| `WI-789 (flag-on committed-migration integration coverage)` | Landed; test-infra enabler. |
| `WI-790 (restoreConsent v2 twin)` | Landed; route dispatch sampled. |
| `WI-791 (RLS coverage ANY query bug)` | Landed; not a flip-code path in this pass. |
| `WI-792 (trial-expiry v2 seeder)` | Landed; not a flip-code path in this pass. |
| `WI-793 (WP-8 flag-on seeder coverage)` | Landed; scanner tests sampled. |
| `WI-794 (post-WI-586 staging RLS verification)` | Unfixed; residual staging confidence gap. |
| `WI-795 (db:push staging guard)` | Landed; not re-reviewed in detail. |
| `WI-796 (DOPPLER_TOKEN_STG)` | Landed via GitHub Actions run; not code-reviewed. |
| `WI-797 (parent-multi-child profile-load timeout)` | Landed; related smoke stability. |
| `WI-798 (assertParentAccess sweep)` | Landed, reviewed. |
| `WI-799 (sub-13 seed / profile 500)` | Landed; profile list test sampled. |
| `WI-800 (test-infra sub-13 seed assessment)` | Unfixed; residual test-data risk. |
| `WI-801 (E2E auth.setup readiness)` | Unfixed; residual E2E smoke risk. |
| `WI-802 (dashboard family_links readers v2)` | Landed, reviewed via guard/threading checks. |
| `WI-803 (nudge.ts + profile.ts family_links readers)` | Landed, reviewed. |
| `WI-805 (billing fast-follow subscriptions drop)` | Unfixed; not a current four-table-drop blocker because `subscriptions` is retained and `WI-810` carved out quota-reset. Blocks any future `subscriptions` drop. |
| `WI-808 (v2 fixture migration / full flag-on suite)` | Unfixed; residual full-suite confidence gap. |
| `WI-809 (consent / family_links / export gating sweep)` | Landed, reviewed. |
| `WI-810 (quota-reset cron v2 gating)` | Landed, reviewed. |

## Residual Risk

- Seven workstream items still have no `Fixed In`: `WI-779 (WP-FLAG)`, `WI-782 (visibility-contract rework)`, `WI-794 (staging RLS verification)`, `WI-800 (sub-13 seed assessment)`, `WI-801 (E2E auth.setup readiness)`, `WI-805 (billing fast-follow subscriptions drop)`, `WI-808 (v2 fixture migration / full flag-on suite)`.
- `WI-808 (v2 fixture migration / full flag-on suite)` means the full flag-on suite is not proven green from this review alone. I found targeted non-vacuous tests for the critical seams, but not a complete clean-suite signal.
- `WI-805 (billing fast-follow subscriptions drop)` remains a future blocker for dropping `subscriptions`; current `M-DROP` retains it.
- Static caller review cannot prove every dynamic runtime path, especially Inngest replay payloads and uncommon billing/webhook provider payloads. The targeted dispatches checked above reduce but do not eliminate that risk.

## Verification Not Run

I did not run the test suite. The local checkout is dirty and behind `origin/main`, so test results from the working tree would be contaminated:

```text
main...origin/main [behind 3]
dirty tracked files and untracked _wip files present
```

All source evidence above was taken from `origin/main` with `git show` / `git grep`, plus a live Cosmo relation query for the Identity Cutover workstream.
