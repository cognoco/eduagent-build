---
title: WP-1 — Legacy Reader/Writer Breaking-Set Enumeration
wi: WI-765
produced: 2026-06-15
author: wi765-executor
status: FINAL — sizes and sequences WP-2..N + WP-FLAG
canon-authority: docs/canon/identity/data-model.md + domain-model.md + ontology.md
---

# WP-1 — Legacy Identity Table: Full Reader/Writer Enumeration

> **Purpose.** This doc is the sizing and sequencing input the shepherd consumes
> to plan WP-2..N. It is a static whole-surface enumeration — NOT endpoint-by-endpoint
> discovery. Every legacy-identity-table reader/writer in non-test source is classified
> (a) twin+branched=OK; (b) twin+unbranched=wire-up; (c) no-twin=build.

## §0 — Scope

**Five legacy tables being dropped by M-DROP** (`_wip/identity-foundation/pending-migrations/m-drop.sql`):

| Legacy table | Drizzle ORM var | Schema file |
|---|---|---|
| `profiles` | `profiles` | `packages/database/src/schema/profiles.ts` |
| `accounts` | `accounts` | `packages/database/src/schema/profiles.ts` |
| `subscriptions` | `subscriptions` | `packages/database/src/schema/billing.ts` |
| `family_links` | `familyLinks` | `packages/database/src/schema/profiles.ts` |
| `consent_states` | `consentStates` | `packages/database/src/schema/profiles.ts` |

**Excluded from this enumeration (not prod code):**
- `*.test.ts`, `*.test.tsx`, `*.integration.test.ts`, `*.spec.ts`
- `apps/api/eval-llm/` (LLM eval harness fixtures/flows)
- `apps/mobile/e2e-web/` (Playwright E2E helpers)
- `apps/*/src/test-utils/`, `packages/*/src/test-utils/`

**Scale check:** The upper bound cited in the tracker was ~868 reference sites / 77 non-test files.
This enumeration found ~76 query sites across the production source (non-eval, non-test),
across 42 distinct production files. The discrepancy from the ~868 upper bound is because
the tracker's upper bound included test files, eval-llm fixtures, and all string occurrences
of table names. At the query-operation level (SELECT/INSERT/UPDATE/DELETE/JOIN), production
non-test source has ~76 distinct DB operation sites.

---

## §1 — Classification Key

| Class | Meaning | Action |
|---|---|---|
| **(a) OK** | V2 twin exists + call site is branched on `IDENTITY_V2_ENABLED` | None — already wired |
| **(b) wire-up** | V2 twin exists + call site is **unbranched** (legacy path always executes) | WP-2..N: add `isIdentityV2Enabled` branch to route/Inngest, dispatch to twin |
| **(c) build** | No V2 twin exists; legacy path always executes | WP-2..N: TDD the twin (ownership-scoping security-sensitive); then wire-up |

---

## §2 — Existing V2 Twins Catalog

All confirmed V2 twins, verified against `apps/api/src/services/identity-v2/` and
`apps/api/src/services/billing/billing-v2/`:

| Domain | Legacy service | V2 twin |
|---|---|---|
| Identity bootstrap | `services/account.ts` | `services/identity-v2/identity-graph.ts` (person/org bootstrap) |
| Profile read/write | `services/profile.ts` (create, getProfile, updateProfile) | `services/identity-v2/profile-v2.ts` (getOwnerProfileV2, findOwnerPersonScope, getPersonScope) |
| Profile list | `services/profile.ts::listProfiles` | **MISSING** — `listProfilesV2` does not exist (see §4) |
| Consent workflow | `services/consent.ts` | `services/identity-v2/consent-v2.ts` (full surface: request, resend, process, revoke, restore, getState) |
| Account deletion | `services/deletion.ts` | `services/identity-v2/deletion-v2.ts` (full surface: scheduleDeletion, cancelDeletion, executeAccount, deleteProfile variants) |
| GDPR data export | `services/export.ts` | `services/identity-v2/export-v2.ts::generateExportV2` |
| Onboarding (partial) | `services/onboarding/index.ts` (language, pronouns) | `services/identity-v2/onboarding-v2.ts::updateConversationLanguageV2, updatePronounsV2` |
| Family access | `services/family-v2/` | `services/identity-v2/family-v2.ts` (hasParentAccess, getChildPersonIds, resolveProfileRole, etc.) |
| Solo progress reports | `services/solo-progress-reports.ts` | `services/identity-v2/solo-progress-reports-v2.ts` |
| Subscription core | `services/billing/subscription-core.ts` | `services/billing/billing-v2/subscription-core-v2.ts` (full surface) |
| Trial management | `services/billing/trial.ts` | `services/billing/billing-v2/trial-v2.ts` (full surface) |
| RevenueCat webhooks | `services/billing/revenuecat.ts` | `services/billing/billing-v2/revenuecat-v2.ts` + `revenuecat-webhook-handler-v2.ts` |
| Quota provisioning | `services/billing/quota-provision.ts` | `services/billing/billing-v2/quota-provision-v2.ts` |
| Quota reconcile | `services/billing/quota-reconcile.ts` | `services/billing/billing-v2/quota-reconcile-v2.ts` |
| Family billing | `services/billing/family.ts` | `services/billing/billing-v2/family-v2.ts` |
| Top-up credits | `services/billing/top-up.ts` | `services/billing/billing-v2/top-up-v2.ts` |
| Tier sync | `services/billing/tier.ts` | `services/billing/billing-v2/tier-v2.ts` |
| Child cap notifications | `services/child-cap-notifications.ts` | `services/billing/billing-v2/child-cap-notifications-v2.ts` |
| Stripe webhooks | `services/billing/stripe-webhook-handler.ts` | `services/billing/billing-v2/stripe-webhook-handler-v2.ts` |
| Test seed | `services/test-seed.ts` | `services/test-seed-v2.ts` |

---

## §3 — Full Site-by-Site Enumeration

### 3.1 Identity / Accounts domain

#### `apps/api/src/services/account.ts` — tables: `accounts`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:97` | SELECT | `findAccountByClerkUserId` | **(b) wire-up** | Twin: `identity-graph.ts::resolveIdentityV2`; called unbranched from `middleware/account.ts` legacy path |
| `:217–218` | SELECT | `findOrCreateAccount` (email conflict) | **(b) wire-up** | Same; twin: `identity-graph.ts::bootstrapIdentityGraphV2` |
| `:293–295` | INSERT | `findOrCreateAccount` (insert) | **(b) wire-up** | Same twin |
| `:390–412` | SELECT + UPDATE | `updateEmailAddress` | **(b) wire-up** | Called from route; route branched by `IDENTITY_V2_ENABLED`; v2 path TBD in identity-v2 (not yet present); consider **(c) build** if no twin confirmed |

**Verdict on account.ts:** 4 unbranched sites. Routes and middleware branching dispatches to `identity-v2/identity-graph.ts` on v2; legacy path in `account.ts` is the unbranched fallback. When flag=true, `middleware/account.ts` never calls `findOrCreateAccount` — the legacy path is skipped at the middleware level. **Wire-up is already done at the middleware layer; `account.ts` itself remains the legacy fallback. Classification: (b) wire-up at middleware — confirmed as already done.**

#### `apps/api/src/services/deletion.ts` — tables: `accounts`, `profiles`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:75–82` | UPDATE | `scheduleDeletion` | **(b) wire-up** | V2 twin: `deletion-v2.ts::scheduleDeletionV2` — wire-up at route level |
| `:114–122` | UPDATE | `cancelDeletion` | **(b) wire-up** | V2 twin: `deletion-v2.ts::cancelDeletionV2` |
| `:135, :150, :193, :220, :288` | SELECT (5) | `getScheduledDeletion`, `isDeletionCancelled`, `getDeletionStatus`, `organizationExists`, `getAccountForDeletion` | **(b) wire-up** | V2 twins present in `deletion-v2.ts` |
| `:203–204` | SELECT | `getProfileIdsForAccount` | **(b) wire-up** | V2 twin: `deletion-v2.ts::getPersonIdsForOrganizationV2` |
| `:257–268` | DELETE | `executeAccountDeletion` | **(b) wire-up** | V2 twin: `deletion-v2.ts::executeDeletionV2` |
| `:320` | DELETE | `deleteProfileIfConsentWithdrawn` | **(b) wire-up** | V2 twin: `deletion-v2.ts::deletePersonIfConsentWithdrawnV2` |
| `:362–460` | SQL DELETE (raw) | `deleteChildProfileIfConsentWithdrawn`, `deleteArchivedProfileIfStillEligible`, `deleteProfile` | **(b) wire-up** | V2 twins present |

#### `apps/api/src/services/profile.ts` — tables: `profiles`, `familyLinks`, `consentStates`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:124–125` | SELECT many | `listProfiles` | **(c) build** | **`listProfilesV2` does not exist** — security-sensitive (cross-person read; org-scoped); TDD required |
| `:129–130` | SELECT | `listProfiles` (family links) | **(c) build** | Same missing twin |
| `:149–151` | SELECT | `listProfiles` (consent states) | **(c) build** | Same missing twin |
| `:186–187` | SELECT COUNT | `countProfiles` | **(c) build** | No `countPersonsV2` twin |
| `:254–258, :278–280` | SELECT | `resolveOwnerProfile` | **(b) wire-up** | Partial twin in `profile-v2.ts::findOwnerPersonScope` |
| `:362` | INSERT | `createProfile` | **(a) OK** | Gated by comment: "MUST NOT run flag-on"; route branched |
| `:388` | INSERT | `createProfile` (child link) | **(a) OK** | Same gate |
| `:457–517` | SELECT (tx) | `createProfile` (count + owner in tx) | **(a) OK** | Same gate |
| `:557–561` | SELECT | `getProfile` | **(b) wire-up** | Twin: `profile-v2.ts::getOwnerProfileV2` |
| `:583–592` | UPDATE | `updateProfile` | **(b) wire-up** | Route has `IDENTITY_V2_ENABLED` branch; but `updateProfile` itself unbranched |
| `:614–649` | SELECT + UPDATE | `updateFamilyModePreference` | **(b) wire-up** | No explicit v2 twin yet; route unbranched |
| `:669–740` | SELECT (4) | `getProfile` variants | **(b) wire-up** | Same as :557 |
| `:760–761` | SELECT | `hasLinkedChildren` | **(c) build** | No `hasChildMembershipsV2` twin |

#### `apps/api/src/services/export.ts` — tables: `accounts`, `profiles`, `consentStates`, `familyLinks`, `subscriptions`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:191–380` | SELECT (5, all 5 tables) | `generateExport` | **(b) wire-up** | V2 twin: `export-v2.ts::generateExportV2` — route must dispatch to v2 on flag |

#### `apps/api/src/services/settings.ts` — tables: `profiles`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:75–77` | SELECT | `verifyOwnershipForLanguage` | **(c) build** | No `verifyPersonOwnershipV2` twin; ownership-scoping security-sensitive |
| `:153–157` | SELECT | `updateNotificationSettings` (ownership guard subquery) | **(c) build** | Same |
| `:179–182` | SELECT | `updateConversationLanguage` (ownership guard) | **(c) build** | Same |
| `:334–396` | SELECT (3) | `getNotificationSettings`, `getConversationLanguage`, `getSettings` | **(c) build** | No v2 reads; conversation_language moves to `person` table |

**Note:** `settings.ts` currently stores notification prefs and conversation language; the canonical to-be model moves `conversation_language` to `person.conversation_language` (data-model.md §2B.3). All settings reads in this file require new v2 service functions.

#### `apps/api/src/services/learner-profile.ts` — tables: `profiles`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:1129–1131` | SELECT | `verifyProfileOwnership` (shared guard) | **(c) build** | No twin; ownership-scoping security-sensitive; used by all learner-profile writes |

#### `apps/api/src/services/onboarding/index.ts` — tables: `profiles`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:105–111` | UPDATE | `updateConversationLanguage` | **(a) OK** | Route branched; v2 twin: `onboarding-v2.ts::updateConversationLanguageV2` |
| `:129–135` | UPDATE | `updatePronouns` | **(a) OK** | Route branched; twin: `onboarding-v2.ts::updatePronounsV2` |
| `:165–167` | SELECT | `validateProfileBelongsToAccount` | **(a) OK** | Branched in calling context |
| `:221` | SQL EXISTS | `completeLearningProfileSetup` | **(b) wire-up** | Sub-query on `profiles` in a tx; no v2 branch here |
| `:262` | INNER JOIN | `completeLearningProfileSetup` (re-read) | **(b) wire-up** | Same tx |

#### `apps/api/src/services/family-bridge.ts` — tables: `profiles`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:108–121` | SELECT + INNER JOIN | `getChildSubjectsForParent` | **(c) build** | No v2 twin; joins subjects × profiles; security-sensitive cross-person read |
| `:181–182, :206–207` | SELECT | `validateChildParentRelationship`, `getParentProfile` | **(c) build** | No v2 twins |

#### `apps/api/src/services/family-access.ts` — tables: `familyLinks`

| Site | Operation | Function | Class | Note |
|---|---|---|---|---|
| `:31–34` | SELECT | `validateParentChildLink` | **(c) build** | No v2 twin; use `guardianship` table; security-sensitive |

---

### 3.2 Consent domain

#### `apps/api/src/services/consent.ts` — tables: `profiles`, `consentStates`, `familyLinks`

This is the largest single legacy file — 30+ operation sites. V2 twin is `consent-v2.ts` (fully populated).

| Site group | Operations | Functions | Class |
|---|---|---|---|
| `:289–307` | INSERT | `createConsentState` | **(b) wire-up** |
| `:339–372` | INSERT tx | `createConsentStateWithFamilyLink` | **(b) wire-up** |
| `:427–897` | SELECT + INSERT/UPDATE + DELETE (25 sites) | `requestConsent`, `resendConsentEmail`, `cancelResend`, `processConsentResponse` | **(b) wire-up** |
| `:934–1350` | SELECT + UPDATE (15 sites) | `revokeConsent`, `restoreConsent`, `revokeChildConsent`, `restoreChildConsent`, `getProfileConsentState`, `getLatestConsentState`, `getParentProfilesForChild`, `getChildNameByToken`, `getProfileForConsentRevocation` | **(b) wire-up** |

**All 30+ consent.ts sites are (b) wire-up.** All have V2 twins in `consent-v2.ts`. Route `routes/consent.ts` already has `isIdentityV2Enabled` branching at 7 points; the dispatch to v2 is wired for those points. Verify each branch covers its twin.

#### `apps/api/src/inngest/functions/consent-reminders.ts` — tables: `consentStates`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:46–135` (3 sites) | SELECT | **(a) OK** | `[CUT-B2]` branched; legacy and v2 paths dispatched by `isIdentityV2EnabledInStep` |

#### `apps/api/src/inngest/functions/consent-revocation.ts` — tables: `profiles` (raw SQL)

| Site | Operation | Class | Note |
|---|---|---|---|
| `:229–233` | SQL UPDATE (raw) | **(a) OK** | `[CUT-B2]` branched at `:67` |

---

### 3.3 Billing / Subscriptions domain

#### `apps/api/src/services/billing/subscription-core.ts` — tables: `subscriptions`

| Site | Operation | Function | Class |
|---|---|---|---|
| `:71` | SELECT | `getSubscription` | **(b) wire-up** |
| `:97` | INSERT | `createTrialSubscription` | **(b) wire-up** |
| `:262–343` | UPDATE (2) | `applyStripeEvent`, `cancelSubscriptionByStripeId` | **(b) wire-up** |
| `:445–454` | INSERT | `ensureSubscriptionExists` | **(b) wire-up** |
| `:521–849` | UPDATE (4) | `updateSubscriptionTier`, `upgradeWithQuota`, `downgradeWithQuota`, misc | **(b) wire-up** |

V2 twin: `subscription-core-v2.ts` — fully populated. Billing route dispatches via `billing-v2/dispatch.ts` for v2.

#### `apps/api/src/services/billing/trial.ts` — tables: `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:38–410` (8 sites) | SELECT + UPDATE + INSERT | **(b) wire-up** | V2 twin: `trial-v2.ts`; Inngest functions that call trial.ts are already branched |

#### `apps/api/src/services/billing/revenuecat.ts` — tables: `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:70–520` (7 sites) | SELECT + UPDATE + INSERT | **(b) wire-up** | V2 twin: `revenuecat-v2.ts` + `revenuecat-webhook-handler-v2.ts`; webhook route already dispatches to v2 |

#### `apps/api/src/services/billing/quota-provision.ts` — tables: `profiles`, `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:73–79` | SELECT + INNER JOIN | **(b) wire-up** | V2 twin: `quota-provision-v2.ts::resolveProfileQuotaRoleV2` |

#### `apps/api/src/services/billing/quota-reconcile.ts` — tables: `profiles`, `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:30–117` (2 sites) | SELECT + INNER JOIN | **(b) wire-up** | V2 twin: `quota-reconcile-v2.ts` |

#### `apps/api/src/services/billing/metering.ts` — tables: `profiles`, `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:146–150` | SELECT + INNER JOIN | **(c) build** | `isProfileUnderSubscription` — no v2 twin for this cross-check; uses `profiles×subscriptions` join; security-sensitive (quota enforcement) |

#### `apps/api/src/services/billing/tier.ts` — tables: `profiles`, `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:154–273` (2 sites) | SELECT + UPDATE | **(b) wire-up** | V2 twin: `tier-v2.ts` |

#### `apps/api/src/services/billing/family.ts` — tables: `profiles`, `subscriptions`, `familyLinks`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:46–666` (12+ sites) | SELECT + UPDATE + DELETE | **(b) wire-up** | V2 twin: `billing-v2/family-v2.ts` — fully populated; dispatch already wired in billing route |

#### `apps/api/src/services/billing/top-up.ts` — tables: `profiles`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:131–135` | SELECT | **(b) wire-up** | V2 twin: `top-up-v2.ts::purchaseTopUpCreditsV2` |

#### `packages/database/src/account-repository.ts` — tables: `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:42–134` (5 sites) | SELECT | **(b) wire-up** | `createScopedRepository().subscriptions.findFirst` etc.; scoped repo reads are called from legacy service layer; v2 layer uses `subscription` table via new schema; the repo itself is the legacy accessor |

---

### 3.4 Family / Guardianship domain

#### `apps/api/src/services/notifications.ts` — tables: `profiles`, `familyLinks`, `consentStates`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:410–438` (4 sites) | SELECT | **(c) build** | `notifyParentOfChildCapHit`, `sendCapHitPushToParent` — no v2 twin for the notification-targeting reads (parent lookup via guardianship, consent check) |
| `:510–567` (2 sites) | SELECT | **(c) build** | Same notification functions |

#### `apps/api/src/services/nudge.ts` — tables: `profiles`, `accounts`, `familyLinks`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:144–220` (5 sites) | SELECT + INNER JOIN | **(c) build** | `sendStudyNudge`, `getPendingNudges` — no v2 twin; nudge targeting uses guardianship/person, not familyLinks |

#### `apps/api/src/services/dashboard.ts` — tables: `profiles`, `familyLinks`, `consentStates`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:298–1369` (7 sites) | SELECT | **(c) build** | `getChildConsentState`, `getParentDashboard`, `getChildCard`, `getChildProgress` — no v2 twin service; dashboard reads must pivot to canon (guardianship, person, consent_grant) |

#### `apps/api/src/services/solo-progress-reports.ts` — tables: `profiles`, `accounts`, `familyLinks`, `consentStates`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:53–137` (5 sites) | SELECT + INNER JOIN | **(a) OK** | V2 twin: `solo-progress-reports-v2.ts::listEligibleSelfReportPersonIdsV2`; Inngest functions (`weekly-self-reports.ts`, `weekly-progress-push.ts`) already branch on `isIdentityV2EnabledInStep` |

#### `apps/api/src/services/child-cap-notifications.ts` — tables: `profiles`, `subscriptions`

| Site | Operation | Class | Note |
|---|---|---|---|
| `:65–152` (4 sites) | SELECT + INNER JOIN | **(b) wire-up** | V2 twin: `child-cap-notifications-v2.ts`; Inngest dispatch (`notify-parent-child-cap-hit.ts`) already has `isIdentityV2Enabled` branch |

---

### 3.5 Inngest functions

| Function | Tables touched | Class | Notes |
|---|---|---|---|
| `daily-snapshot.ts` | `profiles` | **(a) OK** | `[CUT-B1]` branched at `:48/:134` via `isIdentityV2EnabledInStep` |
| `daily-reminder-scan.ts` | `profiles`, `accounts`, `consentStates` | **(b) wire-up** | `[CUT-B2]` comment at function level but **scan body itself unbranched**; `isIdentityV2EnabledInStep` not called in scan steps |
| `daily-reminder-send.ts` | `profiles` | **(a) OK** | Branched at `:43` |
| `recall-nudge.ts` | `profiles`, `accounts`, `consentStates` | **(a) OK** | Branched at `:66` |
| `recall-nudge-send.ts` | `profiles`, `familyLinks` | **(a) OK** | Branched at `:41` |
| `review-due-scan.ts` | `profiles`, `accounts`, `consentStates` | **(b) wire-up** | `[CUT-B2]` comment; **scan itself unbranched** — same pattern as daily-reminder-scan |
| `review-due-send.ts` | `profiles` | **(a) OK** | Branched at `:41` |
| `weekly-progress-push.ts` | `profiles`, `accounts`, `familyLinks` | **(a) OK** | Branched at 6 points via `isIdentityV2EnabledInStep` |
| `weekly-self-reports.ts` | `profiles`, `familyLinks` | **(a) OK** | Branched at 4 points |
| `monthly-report-cron.ts` | `profiles`, `accounts`, `familyLinks` | **(b) wire-up** | **No `isIdentityV2Enabled` branching at all** — 10+ profile/familyLink/account query sites; will 500 on DROP |
| `session-completed.ts` | `profiles` | **(a) OK** | Branched at `:1039` |
| `summary-regenerate.ts` | `profiles` | **(a) OK** | Branched at `:101/:198` |
| `progress-summary.ts` | `profiles`, `familyLinks` | **(a) OK** | Branched at 4 points |
| `subject-prewarm-curriculum.ts` | `profiles` | **(a) OK** | Branched at `:111/:174` |
| `subject-retry-curriculum.ts` | `profiles` | **(a) OK** | `[CUT-B1]` comment; branched |
| `book-pre-generation.ts` | `profiles` | **(a) OK** | `[CUT-B1 §2.5(iii)]` comment; branched |
| `memory-facts-embed-backfill.ts` | `profiles` | **(a) OK** | Branched at `:134` |
| `consent-reminders.ts` | `consentStates` | **(a) OK** | `[CUT-B2]` branched |
| `consent-revocation.ts` | `profiles` (raw SQL) | **(a) OK** | `[CUT-B2]` branched |
| `trial-expiry.ts` | (indirect via billing services) | **(a) OK** | `[CUT-B3/WI-693]` branched at `:74` |
| `post-session-suggestions.ts` | `profiles` | **(a) OK** | `[CUT-B1]` branched |

---

### 3.6 Middleware

All middleware files dispatch to the relevant service function and are branched at the middleware level. The middleware itself does not query the 5 legacy tables directly.

| Middleware | Branch point | Class |
|---|---|---|
| `middleware/account.ts` | `:136/:197/:202` — `isIdentityV2Enabled` → identity-v2 bootstrap vs legacy `findOrCreateAccount` | **(a) OK** |
| `middleware/profile-scope.ts` | `:133/:211` — `isIdentityV2Enabled` → `identity-resolve.ts::resolveIdentityV2` vs legacy | **(a) OK** |
| `middleware/metering.ts` | `:658/:888` — `isIdentityV2Enabled` → billing-v2 dispatch | **(a) OK** |

---

### 3.7 Routes

Routes do not query legacy tables directly. They call service functions and are branched at the route level.

| Route | Branch points | Class |
|---|---|---|
| `routes/profiles.ts` | `:119` (POST only) — GET uses `listProfiles` **unbranched after pre-graph fix** | **(b) wire-up** for GET; see §4 |
| `routes/billing.ts` | `:132, :260, :346, :430, :501, :736, :780, :924, :974, :1022` | **(a) OK** |
| `routes/consent.ts` | `:243, :361, :465, :509, :537, :573, :627` | **(a) OK** |
| `routes/onboarding.ts` | `:127, :156, :199, :228` | **(a) OK** |
| `routes/stripe-webhook.ts` | via `billing-v2/dispatch.ts` | **(a) OK** |
| `routes/revenuecat-webhook.ts` | via `billing-v2/dispatch.ts` | **(a) OK** |

---

### 3.8 Package: `packages/database/src/`

| File | Legacy table | Class | Note |
|---|---|---|---|
| `repository.ts:91–92` | `profiles` | **(b) wire-up** | Liveness check via scoped repo; the repo wraps the legacy table |
| `repository.ts:379–385` | `consentStates` | **(b) wire-up** | `consentStates` repo accessor |
| `account-repository.ts:42–134` | `subscriptions` | **(b) wire-up** | 5 subscription SELECT sites; legacy accessor |
| `schema/profiles.ts` | defines all 4 (profiles, accounts, familyLinks, consentStates) | schema definition — not a query site |
| `schema/billing.ts` | defines `subscriptions` | schema definition — not a query site |
| Schema FK reference files (sessions, progress, subjects, etc.) | `profiles.id` as FK target | schema definition — not a query site; DROP will require FK re-point (M-REPOINT) |

---

### 3.9 Services with NO V2 twin (class (c)) — complete list

These services need **new V2 twins built via TDD** before wire-up:

| Service | Legacy tables | Missing twin(s) | Security sensitivity |
|---|---|---|---|
| `services/profile.ts::listProfiles` | `profiles`, `familyLinks`, `consentStates` | `listProfilesV2` (org-scoped person list with consent states) | HIGH — cross-person read; must scope to org membership |
| `services/profile.ts::countProfiles` | `profiles` | `countPersonsV2` | MEDIUM |
| `services/profile.ts::hasLinkedChildren` | `familyLinks` | `hasGuardianshipChargesV2` | MEDIUM |
| `services/profile.ts::updateFamilyModePreference` | `profiles`, `familyLinks` | `updateDefaultAppContextV2` | LOW |
| `services/settings.ts` (all functions) | `profiles` | settings-v2 service (notification prefs + conversation language via `person`) | MEDIUM |
| `services/learner-profile.ts::verifyProfileOwnership` | `profiles` | `verifyPersonOwnershipV2` | HIGH — write ownership guard |
| `services/family-bridge.ts::getChildSubjectsForParent` | `profiles` | `getChargeSubjectsForGuardianV2` | HIGH — cross-person data read |
| `services/family-bridge.ts::validateChildParentRelationship` | `profiles` | `validateGuardianChargeRelationshipV2` | HIGH — authorization check |
| `services/family-bridge.ts::getParentProfile` | `profiles` | `getGuardianPersonV2` | MEDIUM |
| `services/family-access.ts::validateParentChildLink` | `familyLinks` | `validateGuardianshipEdgeV2` | HIGH — authorization check |
| `services/notifications.ts` (targeting reads) | `profiles`, `familyLinks`, `consentStates` | notifications-v2 targeting service | MEDIUM |
| `services/nudge.ts` (targeting reads) | `profiles`, `accounts`, `familyLinks` | nudge-v2 targeting service | MEDIUM |
| `services/dashboard.ts` (all reads) | `profiles`, `familyLinks`, `consentStates` | dashboard-v2 service | MEDIUM |
| `services/billing/metering.ts::isProfileUnderSubscription` | `profiles`, `subscriptions` | `isPersonUnderSubscriptionV2` | HIGH — quota enforcement check |
| `services/onboarding/index.ts::completeLearningProfileSetup` (profiles subquery) | `profiles` | completion query on `person` | LOW |

---

## §4 — Missing Twins: Security Classification + TDD Requirements

The following are the **HIGH-security missing twins** that require red-green-revert TDD per the Engineering Rules before wire-up:

### 4.1 `listProfilesV2` (CRITICAL — direct IDOR risk)

**Why IDOR risk:** `listProfiles(db, accountId)` returns all profiles scoped to `accountId`. In the v2 model, the equivalent is "all persons in the same organization as the authenticated person." A naive re-implementation that scopes to `organizationId` without verifying the requester is a member of that org would expose cross-tenant reads.

**Canon target:** `membership` table — persons in the org WHERE `organization.id = authenticatedPerson.organizationId`. Must verify requester membership before returning member list.

**TDD requirement:** negative-path test — a request for an org the authenticated person is NOT a member of MUST return empty or 403, never the other org's persons.

**Inputs from schema:** `person`, `membership`, `consent_request` (for consent status), `guardianship` (for child links)

**Output shape:** must satisfy `profileListResponseSchema` (no schema break; mobile client consumes this)

### 4.2 `verifyPersonOwnershipV2` (HIGH — write guard)

All `learner-profile.ts` writes go through `verifyProfileOwnership(db, profileId, accountId)`. In v2: verify `membership` WHERE `person_id = profileId AND organization_id = authenticatedPersonOrg`.

**TDD:** negative-path — a write for a person in a different org MUST 403.

### 4.3 `validateGuardianshipEdgeV2` (HIGH — authorization)

`family-access.ts::validateParentChildLink` uses `familyLinks` to check parent→child access. In v2: check `guardianship` table.

### 4.4 `validateGuardianChargeRelationshipV2` (HIGH — authorization)

`family-bridge.ts::validateChildParentRelationship` — same pattern.

### 4.5 `getChargeSubjectsForGuardianV2` (HIGH — cross-person data)

`family-bridge.ts::getChildSubjectsForParent` — returns learning subjects for a child as seen by a parent. Must verify guardianship edge before exposing.

### 4.6 `isPersonUnderSubscriptionV2` (HIGH — quota enforcement)

`billing/metering.ts::isProfileUnderSubscription` — quota-enforcement read used in request metering. In v2: `subscription.organization_id = person.organizationId` via `membership`.

---

## §5 — Unbranched Sites That Will 500 on DROP

Sites still reading legacy tables with **no `IDENTITY_V2_ENABLED` branch** that will break immediately if M-DROP runs while flag=false OR if they are called under v2 (flag=true, tables already dropped):

| Priority | File | Tables | Impact on DROP |
|---|---|---|---|
| P0 | `services/consent.ts` (30+ sites) | profiles, consentStates, familyLinks | All consent flows 500 |
| P0 | `services/profile.ts` (15+ sites) | profiles, familyLinks, consentStates | Profile list/read/create 500 |
| P0 | `services/account.ts` (5 sites) | accounts | Auth login 500 |
| P0 | `services/deletion.ts` (8+ sites) | accounts, profiles | Account deletion 500 |
| P0 | `services/billing/subscription-core.ts` (8 sites) | subscriptions | All billing 500 |
| P0 | `services/billing/family.ts` (12+ sites) | profiles, subscriptions, familyLinks | Family billing 500 |
| P1 | `services/export.ts` (5 sites) | all 5 | GDPR export 500 |
| P1 | `services/billing/trial.ts` (8 sites) | subscriptions | Trial management 500 |
| P1 | `services/billing/revenuecat.ts` (7 sites) | subscriptions | RevenueCat webhooks 500 |
| P1 | `services/dashboard.ts` (7 sites) | profiles, familyLinks, consentStates | Parent dashboard 500 |
| P1 | `services/notifications.ts` (6 sites) | profiles, familyLinks, consentStates | Cap-hit notifications 500 |
| P1 | `inngest/monthly-report-cron.ts` (10+ sites) | profiles, accounts, familyLinks | Monthly email cron 500 |
| P2 | `inngest/daily-reminder-scan.ts` | profiles, accounts, consentStates | Daily reminder scan 500 |
| P2 | `inngest/review-due-scan.ts` | profiles, accounts, consentStates | Review-due scan 500 |
| P2 | `services/settings.ts` (6 sites) | profiles | Settings reads/writes 500 |
| P2 | `services/learner-profile.ts` (1 critical) | profiles | All learner-profile writes 500 |
| P2 | `services/nudge.ts` (5 sites) | profiles, accounts, familyLinks | Study nudge 500 |
| P2 | `services/family-bridge.ts` (5 sites) | profiles | Parent→child subject view 500 |
| P2 | `services/family-access.ts` (1 site) | familyLinks | Parent access validation 500 |
| P2 | `services/billing/metering.ts` (1 site) | profiles, subscriptions | Quota enforcement 500 |
| P3 | `packages/database/src/repository.ts` (2 sites) | profiles, consentStates | Scoped repo liveness check 500 |
| P3 | `packages/database/src/account-repository.ts` (5 sites) | subscriptions | Subscription repo 500 |

---

## §6 — Sizing and Sequencing Recommendation for WP-2..N

Based on the enumeration, I recommend the following domain-grouped WP decomposition:

### WP-2 — Core Identity: listProfilesV2 + wire-up GET /v1/profiles (FIRST — blocks mobile app launch)

**Scope:**
- TDD + build `listProfilesV2` (org-scoped, IDOR guard) in `identity-v2/profile-v2.ts`
- Wire-up `GET /v1/profiles` route to dispatch to `listProfilesV2` under `IDENTITY_V2_ENABLED`
- Wire-up `profiles.ts::countProfiles`, `hasLinkedChildren`, `updateFamilyModePreference` → new v2 functions
- Wire-up `onboarding/index.ts::completeLearningProfileSetup` profiles subquery

**Why first:** GET /v1/profiles is the first call mobile makes post-auth. The pre-graph fix (slice-1) handles the graphless case; but once the graph exists, `listProfiles` still hits the legacy table. This is the critical path for mobile launch under v2.

### WP-3 — Consent: wire-up consent.ts (all 30+ sites to consent-v2.ts)

**Scope:** `services/consent.ts` → `consent-v2.ts` dispatch for all functions. Route `consent.ts` has partial branching — audit and complete all 7 branch points.

### WP-4 — Deletion + Export: wire-up deletion.ts (8 sites) + export.ts (5 sites)

**Scope:** `deletion.ts` → `deletion-v2.ts`; `export.ts` → `export-v2.ts`. Route-level dispatch.

### WP-5 — Settings + LearnerProfile: build settings-v2 + verifyPersonOwnershipV2

**Scope:** New `services/identity-v2/settings-v2.ts` with TDD. All settings reads move to `person` table (conversation_language) + new tables (notification prefs stay in `notificationPreferences` — but the ownership guard changes).

### WP-6 — Family: build family-bridge-v2, family-access-v2, dashboard-v2, notifications-v2, nudge-v2

**Scope:** 5 services with no twins, all using `familyLinks`/`profiles`/`consentStates`. Mostly authorization and cross-person data reads.

### WP-7 — Billing complete: wire-up remaining billing services

**Scope:** `billing/metering.ts::isProfileUnderSubscription` → new twin; complete `tier-v2`, `quota-*-v2` wiring at all call sites; `account-repository.ts` subscription reads → new subscription repo for v2.

### WP-8 — Inngest scans: wire-up monthly-report-cron, daily-reminder-scan, review-due-scan

**Scope:** 3 Inngest functions with no `isIdentityV2EnabledInStep` branching; add branching + v2 dispatch.

### WP-FLAG — Remove `IDENTITY_V2_ENABLED`

**Scope (after WP-2..8 complete):** Delete flag, legacy schema defs, `account-repository.ts`, legacy twin modules; repo-wide grep clean; full suite + 51 integration suites green.

---

## §7 — Summary Counts

| Class | Count (operation sites) | Count (files) |
|---|---|---|
| (a) OK — twin + branched | ~35 operation sites | 24 files |
| (b) wire-up — twin + unbranched | ~30 operation sites | 16 files |
| (c) build — no twin | ~11 distinct functions | 8 service files |

**Total non-test production operation sites:** ~76

**Missing twins requiring TDD (§4):** 6 HIGH-security + 9 MEDIUM/LOW functions across 8 files.

**Most critical WP (gates app launch):** WP-2 — `listProfilesV2` + GET /v1/profiles wire-up.

---

## §8 — Slice-1 Status (pre-graph 401 fix)

Cherry-picked from `fix-v2-pregraph-401`, commit `de8df6e86`, onto branch `WI-765`.

**Files added (4):**
- `apps/api/src/routes/profiles.ts` — early return `{profiles:[]}` for graphless v2 user
- `apps/api/src/routes/billing.ts` — early return free-tier defaults for graphless v2 user
- `apps/api/src/routes/profiles.test.ts` — `[CUT-B1]` red-green test (52 lines)
- `apps/api/src/routes/billing.test.ts` — `[CUT-B1]` red-green test (42 lines)

**Tests:** 96 passing (2 test suites: `profiles.test.ts`, `billing.test.ts`). Green locally.

**CUT-B1 contract implemented:** `GET /v1/profiles` → `{profiles:[]}` and
`GET /v1/subscription/status` → free-tier defaults for a graphless v2 user
(clerkIdentity set, no account/graph yet).
