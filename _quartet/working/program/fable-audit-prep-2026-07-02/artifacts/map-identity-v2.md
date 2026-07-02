# Structural Map — identity-v2 subsystem

> **⚠ Point-in-time input (2026-07-02).** Raw sub-agent map; anchor ancestor `a52b8282f`, bundle
> frozen at `145e74d5e` (`05-audit-response.md` § Frozen Anchor). RLS count corrected downstream:
> **17/18** identity-v2 tables RLS-off (all 18 checked incl. policy tables) — see
> `artifacts/rls-posture-note.md`. Yellow flag on "policy-engine tables have zero consumers":
> WI-367 (`145e74d5e`) touched `policy-engine/judge-dispatch.ts` — re-check whether that reads the
> policy *tables* or only age logic before relying on the "inert" claim (Q4-F8).

Scope: `packages/database/src/schema/identity.ts`, `apps/api/src/services/identity-v2/**`,
identity-serving routes, `packages/schemas/src/**` identity contracts.

Reality baseline: `origin/main` @ `a52b8282f` (merge commit `a4798547e` is HEAD of origin/main).
Working tree HEAD = `d843bf7bd` (5 commits behind). `deletion-v2.ts` and `consent-v2.ts` read via
`git show origin/main:<path>`; all else read from working tree (git commands run with
`-c core.bare=false` — this checkout's `.git/config` has a stray `core.bare=true` that otherwise
breaks `git status`/`show`, unrelated to identity-v2, noting for hygiene only).

---

## 1. Schema tables — `packages/database/src/schema/identity.ts`

File header (lines 1–31) declares 17 tables in dependency order + numbers them 1–17. Actual file
contains **18 tables**: the 17 enumerated + `consent_request` (added post-header, CUT-A amendment,
line 791). Two `pgEnum`s also declared: `policy_kind` (line 57), `model_tier` (line 63).

| # | Table (export name) | Line | Purpose | Key columns / relations |
|---|---|---|---|---|
| 1 | `person` (`person`) | 75 | The human; learning-data scope key | `loginId` nullable FK→login (FK enforced only at SQL layer, not in Drizzle — comment lines 84-95 explain circular-ref workaround); `ageKnowing`/`residenceKnowing` jsonb caches; `hasOwnAccount`; checks on `conversationLanguage`(10-lang enum), `pronouns` (≤32 chars), `defaultAppContext` |
| 2 | `login` (`login`) | 155 | Thin Clerk credential binding | `personId` FK→person cascade; `clerkUserId` unique; `email` unique |
| 3 | `organization` (`organization`) | 193 | Billing/consent/quota anchor | `deletionScheduledAt`/`deletionCancelledAt` |
| 4 | `membership` (`membership`) | 219 | person↔org + roles | `roles: text[]`, checks: non-empty, closed set `{admin,learner}`; unique (person,org) |
| 5 | `subscription` (`subscription`) | 269 | Billing row, org-anchored | `payerPersonId` NOT NULL FK→person RESTRICT; Stripe/RevenueCat correlation columns (CUT-A re-home, lines 292-304); checks on `planTier`/`status` enums-as-text |
| 6 | `guardianship` (`guardianship`) | 351 | Consent-authority edge | `guardianPersonId`/`chargePersonId` FK→person RESTRICT; check no-self-guardian; partial-unique active edge (`revokedAt IS NULL`); `qualification` check (9-value closed set) |
| 7 | `supportership` (`supportership`) | 408 | Opt-in data-access grant | Same shape as guardianship (no-self, partial-unique active) |
| 8 | `consent_grant` (`consentGrant`) | 455 | Append-only per-purpose consent EVENT log | `chargePersonId`/`organizationId` FK RESTRICT; `granted`, `priorValue`, `auditFact` jsonb, `assuranceToken`/`assuranceMethod` (VPC), age/jurisdiction snapshot at grant |
| 9 | `consent_receipt` (`consentReceipt`) | 512 | Durable receipt, outlives person | `personId`/`organizationId` NOT NULL, **no FK** (intentional — comment line 508-509) |
| 10 | `deletion_audit` (`deletionAudit`) | 539 | Deletion record, outlives person | `personId` no FK; `deletedBy` nullable (null = system/abandonment) |
| 11 | `financial_record` (`financialRecord`) | 558 | Billing/tax record, outlives person | `personId`/`organizationId` no FK; `payload` jsonb; `recordType` |
| 12 | `regimes` (`regimes`) | 592 | Policy-engine regime lookup — DATA not enum | `code` unique; seed comment lists `US_COPPA, EU_GDPR_16/15/14/13, UK_AADC, ROW` |
| 13 | `policy_cells` (`policyCells`) | 603 | age-band × regime × knowledge-axis grid | `regimeId` FK→regimes RESTRICT; check `knowledgeAxis IN ('age','residence')`; check age-band ordering |
| 14 | `policy_rules` (`policyRules`) | 636 | Per-cell rules | `cellId` FK→policyCells cascade; `kind` = `policyKindEnum`; `ruleText`, `citationUrl`, `effectiveAt`/`expiresAt` |
| 15 | `knowledge_assertions` (`knowledgeAssertions`) | 669 | Append-only known-age/known-residence history | `personId` FK cascade; `axis` check; `confidence` decimal(3,2) check 0–1; `actorId` self-FK set-null |
| 16 | `allowed_models` (`allowedModels`) | 709 | Vetting-pipeline output; router reads this | `model`/`providerViaService`/`service`/`region`; `tier` = `modelTierEnum`; `criteriaMetadata` jsonb; runtime-key index |
| 17 | `subscription_payers` (`subscriptionPayers`) | 749 | Primary + ≤1 secondary payer join | `subscriptionId` FK cascade, `personId` FK RESTRICT; `role` check `{primary,secondary}` |
| 18 (unlisted in header) | `consent_request` (`consentRequest`) | 791 | Pre-grant consent WORKFLOW (pending/requested/approved/denied/expired) — distinct from `consent_grant`'s append-only event log | `chargePersonId`/`organizationId` FK cascade; `token`/`tokenExpiresAt`; `consentGrantId` back-link FK→consent_grant; **only table in file with `.enableRLS()`** (line 877) |

**Present/absent vs expected list:** all 17 header-enumerated tables present. One undocumented
18th table (`consent_request`) exists — added by a later "CUT-A" amendment (comment block
lines 772-789) but never folded into the file's own header inventory/count. `consent_request` is
also the *only* table in the file carrying `enableRLS()` — every other identity-v2 table (person,
consent_grant, subscription, guardianship, etc.) has **no RLS enabled** in this schema file
(row-level isolation, if any, must come from `createScopedRepository`/service-layer checks, not DB
RLS — worth the audit's attention given `person`/`consent_grant`/`subscription` are the sensitive
tables).

---

## 2. Services — `apps/api/src/services/identity-v2/**`

17 non-test files. Table access derived from each file's `from '@eduagent/database'` import list
(static — does not catch tables touched only via raw SQL).

| File | Purpose (from header comment) | Tables imported |
|---|---|---|
| `account-v2.ts` | `updateLoginEmailFromClerk` (line 44) — writes `login.email` off Clerk webhook | `login` |
| `child-profile-v2.ts` | `createChildProfileV2` (line 87) — v2 add-child orchestrator (CUT-B2, WI-811); comment notes owner bootstrap still dual-writes retained legacy tables | `guardianship`, `membership`, `person`, `profiles` (legacy, type-only likely) |
| `consent-status-v2.ts` | CUT-B1 consent-status READ module — resolves current/withdrawn/multi-basis consent state | `consentGrant`, `consentRequest`, `membership` |
| `consent-v2.ts` | CUT-B2 consent WRITE machine — request/resend/respond/revoke/restore/token flows (21 exported fns at origin/main, listed below) | `consentGrant`, `consentRequest`, `membership`, `nudges`, `person`, `subscription` (aliased `subscriptionTable`) — **origin/main only**: also imports `deletionAudit` + `writeFinancialRecordsTx`/`SubscriptionSnapshot` from `deletion-v2.ts` (WI-1138, payer-deny audit trail — absent from working-tree HEAD) |
| `deletion-v2.ts` | CUT-B2 deletion twin — schedule/cancel/execute/status; person delete variants (consent-withdrawn / no-consent / archived-eligible); Stripe/store teardown target resolution; financial-record writer | `byokWaitlist`, `consentGrant`, `consentReceipt`, `consentRequest`, `deletionAudit`, `financialRecord`, `guardianship`, `login`, `membership`, `organization`, `person`, `subscription`, `supportership` — broadest table footprint in the service set |
| `export-v2.ts` | `generateExportV2` (line 79) — CUT-B2 GDPR export twin | `consentGrant`, `consentRequest`, `guardianship`, `login`, `membership`, `organization`, `person`, `quotaPools`, `subscription`, `topUpCredits` |
| `family-bridge-v2.ts` | CUT-B2 guardianship read module ("single source of truth", line 24) — edge validation, guardian↔charge relationship checks | `person` |
| `family-v2.ts` | CUT-B2 family-service read twins — composes consent-status-v2 + guardianship reads ("never" duplicates them, line 13) | `consentGrant`, `membership`, `person` |
| `guardianship.ts` | CUT-B2 guardianship reads — `isGuardianOf`, get charge/guardian person-id sets, active-edge queries, filter helper | `guardianship` |
| `helpers.ts` | CUT-B1 shared person-read helpers (`findOwnerPersonId`, `getPersonLlmContext`, `getPersonAge(Bracket)`, `isPersonLive`, `getPersonOrgTimezone`) — widely imported by non-identity routes (sessions.ts, books.ts) | `membership`, `organization`, `person` |
| `identity-graph.ts` | CUT-B1 onboarding-completion bootstrap — `createIdentityGraph` builds person/login/org/membership/subscription graph from legacy signup; explicit comment against dual-write after legacy table removal (line 67) | `accounts`, `login`, `membership`, `organization`, `person`, `profileQuotaUsage`, `profiles`, `quotaPools`, `subscription`, `subscriptionPayers`, `subscriptions` (aliased `legacySubscriptions`) — the one file that bridges legacy (v1) tables into v2 |
| `identity-resolve.ts` | CUT-B1 identity resolution (`resolveIdentityV2`) — v2 equivalent of legacy identity resolve | `login`, `membership`, `organization` |
| `identity-v2-opts.ts` | `requireCallerPersonId` — opts/caller-context guard, no DB import | — |
| `onboarding-v2.ts` | CUT-B1 onboarding write twins — `updateConversationLanguageV2`, `updatePronounsV2` | `membership`, `person` |
| `ownership-v2.ts` | CUT-B person-ownership write guards — `verifyPersonOwnershipV2`, `verifyPersonIsOrgAdminV2` | `membership` |
| `profile-v2.ts` | CUT-B1 person-scope profile reads — `getOwnerProfileV2`, `getProfileV2`, `getPersonScope`, `listProfilesV2`, `updateProfileV2`, `loadProfileRowByIdV2`, `jurisdictionToLocation` | `guardianship`, `membership`, `person` (+ `profiles` type-only import) |
| `solo-progress-reports-v2.ts` | CUT-B2 solo-progress-reports twin — eligible self-report person-id listing | `learningSessions`, `membership`, `organization`, `person` |

**`consent-v2.ts` exported functions (origin/main, 21 total, lines from `/tmp` capture):**
`consentTypeToBasis`, `createPendingConsentRequest`, `createDirectConsentGrant`,
`requestConsentV2`, `resendConsentV2`, `processConsentResponseV2`, `revokeConsentV2`,
`withdrawConsentByToken`, `restoreConsentV2`, `restoreConsentByToken`, `refreshConsentTokenV2`,
`refreshConsentTokenForRequestV2`, `getChildNameByTokenV2`, `revokeChildConsentV2`,
`restoreChildConsentV2`, `getProfileConsentStateV2`, `isConsentRevocationGenerationCurrentV2`,
`getPersonForConsentRevocationV2`, `getPersonDisplayNameV2`, `getGdprGrantWithdrawalStateV2`,
`getOrgMemberDisplayNameV2`.

**`deletion-v2.ts` exported functions (origin/main, lines from `/tmp` capture):**
`consentPersonLockKey`, `scheduleDeletionV2`, `cancelDeletionV2`, `isDeletionCancelledV2`,
`getDeletionStatusV2`, `organizationExistsV2`, `getPersonIdsForOrganizationV2`,
`getOrganizationOwnerClerkUserIdV2`, `getOrganizationOwnerEmailV2`, `executeDeletionV2`,
`deletePersonV2`, `deletePersonIfConsentWithdrawnV2`, `deletePersonIfNoConsentV2`,
`deleteArchivedPersonIfStillEligibleV2`, `getSubscriptionStoreTeardownTargetsV2`,
`writeFinancialRecordsTx` (newly exported at origin/main for WI-1138 reuse by consent-v2.ts;
non-exported `type SubscriptionSnapshot` is also newly exported at origin/main — working-tree
HEAD has both as module-private).

**WI-1255 diff (origin/main vs working-tree HEAD, `deletion-v2.ts`):** only the two export-visibility
changes above — no behavioral diff in this file. The behavioral payload of WI-1255/WI-1138 lives
in `consent-v2.ts`'s `deny` branch of `processConsentResponseV2` (~line 466-627 origin/main):
working tree does a bare "delete payer subscription if owned + cascade-delete person"; origin/main
inserts a pre-delete snapshot of the payer's `subscription` row(s), a `deletionAudit` insert, and a
`writeFinancialRecordsTx` call (tax+chargeback pair) *inside* the transaction, then a post-commit
Stripe-cancel of the snapshotted subscription (imports `cancelStripeSubscriptionForErasure` from
`../billing/store-teardown`, `inngest`/`safeSend` for post-commit dispatch — none of which appear
in the working-tree version).

---

## 3. Routes serving identity/person/consent/guardianship/subscription shapes

`apps/api/src/routes/` is flat (no subdirectories); 50 route files total. Files importing
`../services/identity-v2/*` (non-test): `account.ts`, `profiles.ts`, `sessions.ts`, `consent.ts`,
`books.ts`, `consent-web.ts`, `onboarding.ts`.

| Route file | Method + path | Service call(s) |
|---|---|---|
| `account.ts:49` | `GET /account/deletion-status` | `getDeletionStatusV2` (line 59) |
| `account.ts:106` | `PATCH /account/email` | `updateLoginEmailFromClerk` (line 119) |
| `account.ts:130` | `POST /account/delete` | `scheduleDeletionV2` (138), `getPersonIdsForOrganizationV2` (144) |
| `account.ts:228` | `POST /account/cancel-deletion` | `cancelDeletionV2` (241) |
| `account.ts:254` | `GET /account/export` | `generateExportV2` (262) |
| `consent.ts:177` | `POST /consent/request` | `requestConsentV2`, `getOrgMemberDisplayNameV2` |
| `consent.ts:299` | `POST /consent/resend` | `resendConsentV2` |
| `consent.ts:387` | `POST /consent/respond` | `processConsentResponseV2` |
| `consent.ts:441` | `GET /consent/my-status` | `getProfileConsentStateV2` |
| `consent.ts:467` | `GET /consent/:childProfileId/status` | `getChildConsentForParentV2` (family-v2.ts) |
| `consent.ts:505` | `PUT /consent/:childProfileId/revoke` | `revokeChildConsentV2` |
| `consent.ts:553` | `PUT /consent/:childProfileId/restore` | `restoreChildConsentV2` |
| `consent-web.ts:321` | `GET /consent-page` | (page render, token lookup — see `getChildNameByTokenV2`/`getGdprGrantWithdrawalStateV2` imports) |
| `consent-web.ts:390` | `GET /consent-page/deny-confirm` | as above |
| `consent-web.ts:457` | `POST /consent-page/confirm` | `processConsentResponseV2` |
| `consent-web.ts:676` | `GET /consent-page/withdraw` | `getPersonDisplayNameV2` |
| `consent-web.ts:744` | `POST /consent-page/withdraw` | `withdrawConsentByToken` |
| `consent-web.ts:828` | `POST /consent-page/restore` | `restoreConsentByToken` |
| `onboarding.ts` (3 PATCH-style handlers ~89/149/209) | conversation-language / pronouns updates | `updateConversationLanguageV2`, `updatePronounsV2` |
| `profiles.ts:128` | `GET /profiles` | `listProfilesV2` |
| `profiles.ts:138` | `POST /profiles` | `createChildProfileV2`, `createIdentityGraph` |
| `profiles.ts:291` | `GET /profiles/:id` | `getProfileV2` |
| (profiles.ts, further handlers ~303/358/405) | profile update / owner / scope | `getOwnerProfileV2`, `updateProfileV2`, `getPersonScope` |
| `sessions.ts:84` (import only) | n/a — helper use inline | `getPersonAgeBracket` (helpers.ts) |
| `books.ts:40` (import only) | n/a — helper use inline | `getPersonAge` (helpers.ts) |

**Notable false lead:** `apps/api/src/routes/learner-profile.ts` — despite the name, imports
**zero** identity-v2 services; it's memory/learning-profile CRUD (`services/learner-profile.ts`,
`services/memory/projection.ts`), unrelated to `person`/`profile-v2.ts`. Don't conflate the two
"profile" concepts when auditing route surface.

---

## 4. Shared schemas — `packages/schemas/src/**`

Identity-adjacent files: `consent.ts` (83 lines), `profiles.ts` (292 lines), `billing.ts`
(subscription/tier shapes), `learning-profiles.ts` (304 lines — pedagogy preferences, NOT
person/identity; tangential, included only because of name overlap).

| File | Key exported schemas (API↔mobile boundary types) |
|---|---|
| `consent.ts` | `consentTypeSchema` (`GDPR`\|`COPPA`), `consentStatusSchema`, `consentRequestSchema`, `consentResendSchema`, `consentRespondRequestSchema`, `consentRequestResultSchema`, `consentRespondResultSchema`, `myConsentStatusSchema`, `childConsentStatusSchema`, `consentActionResultSchema` |
| `profiles.ts` | `locationSchema` (`EU`\|`US`\|`OTHER`), `conversationLanguageSchema` (10-lang superset — see AGENTS.md Languages section), `pronounsSchema`, `appContextSchema`, `profileCreateSchema`/`profileUpdateSchema`, `onboardingLanguagePatchSchema`, `onboardingPronounsPatchSchema`, `profileAppContextUpdateSchema`, `profileSwitchSchema`, `internalProfileSchema`/`profileSchema`/`publicProfileSchema`/`profileResponseSchema` |
| `billing.ts` | `subscriptionTierSchema` (`free`\|`plus`\|`family`\|`pro`), `billingAccessSchema`, `quotaModelSchema`, `profileQuotaRoleSchema`, `subscriptionSchema`, `subscriptionStatusSchema`, `checkoutRequestSchema`/`checkoutResponseSchema`, `topUpRequestSchema`, `usageSchema` family |

These `z.infer` types are the cross-boundary contract per AGENTS.md's "`@eduagent/schemas` is the
shared contract" rule — mobile never sees Drizzle table types directly (e.g. `person`, `consentGrant`
row shapes stay server-side; mobile gets `Profile`/`ConsentActionResult`/`Subscription` etc.).

---

## 5. Policy/regime + safety tables — consumer check

**Finding (verified, not inference):** `rg -l "allowedModels|policyCells|policyRules|knowledgeAssertions"`
across `apps/api/src/` (all files, including tests) returns **zero hits**. Repo-wide (`--type ts`,
excluding `node_modules`), the only hits are `packages/database/src/schema/identity.ts` itself and
its co-located `identity.test.ts`. `regimes` likewise has no non-schema consumer found.

**Conclusion:** the policy-engine table family (tables 12–16: `regimes`, `policy_cells`,
`policy_rules`, `knowledge_assertions`, `allowed_models`) is declared and presumably migrated, but
has **no service-layer reader or writer anywhere in `apps/api/src`** as of this baseline. The
schema header's claim that "router reads this" (line 25, re: `allowed_models`) is not currently
true in code — `apps/api/src/services/llm/router.ts` (the actual router) was grepped separately
(§6 below) and shows no reference to `allowedModels`. This is either (a) infra built ahead of its
consumer per the repo's own stated pattern for `LLM_ROUTING_V2_ENABLED`-style flags, or (b) dead
schema. Audit should confirm which via `docs/registers/llm-models/master.md` / `MMT-ADR-0014`
(cited in AGENTS.md as the actual per-tier model-routing source of truth — which appears to be a
config/register file, not these DB tables).

`knowledge_assertions` (age/residence knowledge history) also has no writer found — the `person`
table's own `ageKnowing`/`residenceKnowing` jsonb cache columns (identity.ts lines 99-102) appear to
be the only in-code age/residence-knowledge surface touched by services (not verified which service
writes them in this pass — flagged for the audit, not confirmed absent).

---

## 6. Flip flag — `IDENTITY_V2_ENABLED` or equivalent

**Not found.** Grepped `apps/api/src`, `apps/mobile/src`, `packages/` for `IDENTITY_V2`,
`identity_v2_enabled`, `identityV2Enabled`, `IDENTITY_ENABLED` (case-insensitive) — zero hits.
Compare to the two flag families that DO exist and follow a clear naming/gating pattern:
`LLM_ROUTING_V2_ENABLED` (Doppler env var, `apps/api/src/config.ts:180`, default `'false'`) and
`MODE_NAV_V2_ENABLED` (`apps/api/src/config.ts:218` API-side + `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` /
`apps/mobile/src/lib/feature-flags.ts:32` mobile-side).

**identity-v2 is NOT flag-gated.** It is a **call-site-by-call-site cutover** (internally labeled
`CUT-A`/`CUT-B1`/`CUT-B2` per the header comments in §2 above) — each route file directly imports
and calls the `*V2` function; there is no runtime branch choosing v1 vs v2 per request. No sibling
`apps/api/src/services/identity/` (v1) directory exists — legacy identity logic lives scattered
across other legacy service files (not enumerated in this pass). WI-1255 (the commit at
`origin/main` HEAD, "reroute v1-pinned scheduledDeletion to v2") is consistent with this: the bug
was a *hardcoded call to the wrong (v1) function at one call site*, not a flag misconfiguration —
there is no flag to misconfigure. Readers/writers split: N/A (no flag to split by) — the
CUT-B1/CUT-B2 labels are a *migration-history* taxonomy (B1 = reads done first, B2 = writes/twins
done second) baked into comments, not a live runtime toggle.

For the actual flag inventory and their default states, see `docs/registers/` (not opened this pass)
and AGENTS.md's "Profile Shapes" section which documents `MODE_NAV_V0/V1/V2_ENABLED` per-environment
gating — identity-v2 has no analogous entry there, reinforcing "always-on cutover" over "flagged
rollout."

---

## Exclusions honored

Did not open `_wip/identity-cutover/2026-07-01-identity-cutover-779-strip-proposal.md` or
`_wip/identity-cutover/strip-proposal-critique.md`. WI IDs referenced above (WI-1255, WI-1138,
WI-811, WI-586, WI-374) were sourced from code comments and `git log`/`git show` output, not from
the excluded files.
