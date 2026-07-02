# Q1 — Cutover Completeness: Legacy Identity/Billing Table Access

## Question

Do any PRODUCTION code paths still READ or WRITE the legacy identity/billing
tables — `accounts`, `profiles`, `family_links`, `consent_states`,
`subscriptions` (schema: `packages/database/src/schema/profiles.ts` +
`billing.ts`) — as opposed to their v2 replacements in
`packages/database/src/schema/identity.ts` (`person`, `login`, `organization`,
`membership`, `guardianship`, `consentGrant`/`consentReceipt`,
`subscription`)?

## Scope

- `apps/api/src/**` (routes, services, middleware, inngest/functions), read-only.
- Ref: the exhaustive sweep ran at `a52b8282f` (task-specified ref at the time; the 6
  deletion/consent files read via `git show a52b8282f:<path>`, rest via working tree).
- **RE-VERIFIED at freeze SHA `145e74d5e` (audit close):** the `a52b8282f..145e74d5e` delta is only
  mobile (`ed3806ef6`, `0c053c06f`, `8060b4ae0`), the WI-1128 migration-SQL fix (`56b9ded15` — DDL,
  not a service reader), and WI-367 v2 age-gating (`145e74d5e`) — **none add a legacy-table
  reader.** A fresh live-surface grep at `145e74d5e` (value-imports of `profiles`/`accounts`/
  `familyLinks`/`consentStates`/`subscriptions` from `@eduagent/database` in non-test `apps/api/src`;
  raw SQL `FROM/INTO` those tables in routes/inngest) returns **empty**. So **"zero live legacy
  readers" holds at the freeze SHA**, not just the ancestor. (The orphaned dead subtree still
  *imports* legacy tables but has zero live callers — unchanged.)
- Excluded per instruction: `_wip/identity-cutover/2026-07-01-identity-cutover-779-strip-proposal.md`,
  `_wip/identity-cutover/strip-proposal-critique.md` (not opened).
- Test files (`*.test.ts`, `*.integration.test.ts`) reviewed only for
  reachability triage (are they the *only* caller of a legacy function?), not
  content-audited in depth.

## Method (commands run)

1. `rtk git rev-parse HEAD / origin/main`, `rtk git fetch origin main`,
   `rtk git merge-base --is-ancestor a52b8282f origin/main` — confirmed ref state.
2. `rtk rg -n "^export const \w+ = pgTable" packages/database/src/schema/{profiles,billing,identity}.ts`
   — enumerated legacy vs v2 table symbol names (confirmed no name collisions:
   `profiles`≠`person`, `subscriptions`≠`subscription`, `accounts` has no v2 twin name).
3. `rtk rg -n "from ['\"]@eduagent/database" apps/api/src --glob '!*.test.ts' -A0` piped
   through a legacy-symbol filter, and a multi-line `rg -U` sweep of every
   `apps/api/src/routes/*.ts` for `import { ...legacy... } from '@eduagent/database'`
   blocks — found the exact set of files that import legacy Drizzle table
   objects **as values** (not just `type Database`).
4. For every hit, traced the call graph outward with `rg -n "\bfnName\("` across
   `apps/api/src` (excluding tests) to determine whether the function containing
   the legacy-table query has **any live caller** reachable from a `routes/*.ts`
   HTTP handler, an `inngest/functions/*.ts` job, or `middleware/*.ts` — the three
   production entry-point classes in this repo.
5. Raw-SQL sweep: `rg -ni "from accounts\b|from profiles\b|from subscriptions\b|from family_links\b|from consent_states\b|insert into ...|update ..."` across
   non-test `apps/api/src` — caught `services/deletion.ts`'s raw `DELETE FROM
   profiles` / `consent_states` CTEs and `services/billing/trial.ts`'s raw
   `FROM subscriptions AS s` UPDATE, which symbol-based Drizzle greps miss.
6. Flag check: `rg -n "IDENTITY_V2|identityV2" apps/api/src/config.ts` (no hits)
   and direct read of `middleware/metering.ts` / `inngest/functions/session-completed.ts`
   for the `identityV2` boolean passed into `decrementQuota`.
7. Read `apps/api/src/services/billing/billing-v2/dispatch.ts` in full — this is
   the single seam that used to branch legacy/v2 for the two payment webhooks.

## Findings

| ID | Claim | Severity | Confidence | Evidence file:line | Gap |
|----|-------|----------|------------|---------------------|-----|
| F1 | `apps/api/src/services/billing/billing-v2/dispatch.ts` — the sole dispatch seam for Stripe + RevenueCat webhooks — is **hardcoded to always return the v2 handler bundle**. Its own header comment (lines 1-9) documents this: "always return the v2 handler bundle." No flag branch remains. | info | high | `apps/api/src/services/billing/billing-v2/dispatch.ts:1-9,80-90,171-181` | Route-file header comments in `routes/revenuecat-webhook.ts:26-29` are **stale** — they still describe a flag-off/flag-on branch that no longer exists in the code they annotate. See Contradictions. |
| F2 | `apps/api/src/middleware/metering.ts:558` hardcodes `const identityV2 = true;` (comment: "Single read of the cutover flag... always-on post-cutover" pattern) — the sole request-path caller of `decrementQuota`. `apps/api/src/inngest/functions/session-completed.ts:1786` hardcodes the same, `// always-on post-cutover`. Both are the **only two live callers** of `decrementQuota` in the repo. | info | high | `apps/api/src/middleware/metering.ts:558`, `apps/api/src/inngest/functions/session-completed.ts:1786` | `decrementQuota`'s function signature still defaults the param to `false` (`identityV2 = false`, `apps/api/src/services/billing/metering.ts:259`), so the legacy `profiles`⋈`subscriptions` ownership join (`verifyProfileInSubscriptionAccount`, same file lines 144-158) is reachable **only** if some future/test caller omits the argument. |
| F3 | `apps/api/src/middleware/account.ts` (the accountMiddleware run on every authenticated request) calls `resolveIdentityV2()` + `ensureInitialTrialSubscriptionV2()` exclusively. It does **not** call `findOrCreateAccount()` (the legacy JIT-provisioning function in `services/account.ts`). | info | high | `apps/api/src/middleware/account.ts:143-170` | Contradicts a stale comment in `middleware/maintenance.ts:7-9` — see Contradictions. |
| F4 | `services/account.ts::findOrCreateAccount` (writes legacy `accounts` + calls legacy `createSubscription`) has **zero live callers** anywhere in `apps/api/src` outside its own file and comments. | low | high | `apps/api/src/services/account.ts:129` (definition); grep for `findOrCreateAccount(` outside the file returns only comment mentions in `middleware/maintenance.ts:7`, `test-utils/database-module.ts:31`, `inngest/functions/account-reclaim-attempt.ts:5` | Dead code, not flag-gated — should be considered for removal. |
| F5 | `services/account.ts::findAccountByClerkId` (legacy `accounts` reader) is called live only from `services/billing/alias-merge.ts:196` and `services/billing/revenuecat-webhook-handler.ts:203,436,647,865` — both of which are themselves unreachable (F6, F7). | low | high | `apps/api/src/services/account.ts:94` | — |
| F6 | `services/billing/alias-merge.ts::mergeAliasedSubscription` (writes legacy `subscriptions` in a `db.transaction()`) has **zero live callers**. Only the v2 twin `mergeAliasedSubscriptionV2` (`billing-v2/alias-merge-v2.ts`) is wired to `inngest/functions/billing-alias-merge.ts:59`. Legacy `alias-merge.ts` is reused **only** for the pure `decideAliasMerge()` function and the `ALIAS_MERGE_IDEMPOTENCY_SOURCE` constant, imported by `alias-merge-v2.ts:45-47`. | low | high | `apps/api/src/services/billing/alias-merge.ts:187` (def), `apps/api/src/inngest/functions/billing-alias-merge.ts:27,59` | — |
| F7 | `services/billing/revenuecat-webhook-handler.ts` (legacy, DB-mutating) and `services/billing/stripe-webhook-handler.ts` (legacy, DB-mutating) have **no live callers** for their DB-write functions. `dispatch.ts` only imports pure extractor helpers (`extractPeriodStart`, `extractPeriodEnd`, `extractSubscriptionIdFromInvoice`, `shouldRefreshStripeKv`, `extractPaidTier`, `mapStripeStatus`) from `stripe-webhook-handler.ts:59-113`, and only a `type` import from `revenuecat-webhook-handler.ts`. | low | high | `apps/api/src/services/billing/billing-v2/dispatch.ts:14,19-36`; `apps/api/src/routes/stripe-webhook.ts:25,137`; `apps/api/src/routes/revenuecat-webhook.ts:26` | Consequently `services/safe-refresh-kv-cache.ts::safeRefreshKvCache` (which calls legacy `getSubscriptionByAccountId`) is also dead — its only callers are inside these two dead legacy handler files. |
| F8 | `services/profile.ts` has **one** live importer (`routes/profiles.ts:37-41`), which imports exactly `updateProfileAppContext`, `ProfileValidationError`, `ProfileLimitError`. `updateProfileAppContext` is fully v2 internally (comment at line 685: "v2 path: read/write person + membership; no profiles/family_links touch") despite living in the legacy-named file. Every other exported function in `profile.ts` — `createProfileWithLimitCheck` (legacy `profiles` SELECT/INSERT + legacy `getSubscriptionByAccountId`/`canAddProfile`/`provisionProfileQuotaUsage`), `findOwnerProfile`, `createProfile`, `getProfile`, `updateProfile`, `listProfiles`, `countProfiles`, `switchProfile`, etc. (which call legacy `getConsentStatus`/`createPendingConsentState`/`createGrantedConsentState` from `services/consent.ts`) — has **zero live callers**. `routes/profiles.ts` instead calls `createIdentityGraph` + `createChildProfileV2` (v2) for profile creation. | low | high | `apps/api/src/services/profile.ts:484` (`createProfileWithLimitCheck`, legacy `.from(profiles)` at line ~512, `getSubscriptionByAccountId` at 522, `canAddProfile` at 524); `apps/api/src/routes/profiles.ts:20-21,37-41` | Dead code surface is large (12 of 15 exported functions in this file); worth a cleanup sweep. |
| F9 | `services/billing/family.ts`, `services/billing/tier.ts`, `services/billing/quota-reconcile.ts`, `services/billing/quota-provision.ts`, `services/billing/revenuecat.ts`, `services/billing/trial.ts` (except `resetDailyQuotas`, F11) all import legacy `profiles`/`subscriptions` and read/write them, but **every exported function has zero external callers** outside this mutually-referential legacy cluster, whose only entry points (F4-F8 above) are themselves dead. `services/billing.ts` (barrel) re-exports the whole cluster, but only 2 of its ~25 re-exported names have a live caller — see F10. | low | high | Representative: `apps/api/src/services/billing/tier.ts:211` (`handleTierChange`, zero external callers); `apps/api/src/services/billing/quota-provision.ts:50` (`provisionProfileQuotaUsage`, sole caller is dead `createProfileWithLimitCheck` at `profile.ts:603`) | Confirms this is a large **orphaned legacy subtree**, not scattered live readers. |
| F10 | `routes/billing.ts` (live route) imports 7 symbols from legacy `services/billing.ts`: `addToByokWaitlist` (writes only `byokWaitlist` — not a hunted table), `getTopUpCreditsRemaining`, `getTopUpPriceCents` (pure tier-config lookup, no DB — `tier.ts:392-398`), `getUsageEventsAvailableSince`, `buildUsageDateLabels` (both pure), `ProfileRemovalNotImplementedError` (error class), `getStartOfTodayInTimeZone` (utility). None touch `accounts`/`profiles`/`family_links`/`consent_states`/`subscriptions`. | info | high | `apps/api/src/routes/billing.ts:27-35` | — |
| F11 | `services/billing/trial.ts::resetDailyQuotas` **is** live — called from `inngest/functions/quota-reset.ts:44`, a cron job — but only touches `quotaPools` and `profileQuotaUsage` (billing.ts schema tables not in the charter's 5-table hunt list; keyed generically by `subscriptionId`, shared infra per WI-868 comments, not part of the identity-graph cutover). `resetExpiredQuotaCycles` (same file, raw `FROM subscriptions AS s` SQL) has zero external callers — dead. | info | medium | `apps/api/src/services/billing/trial.ts:106-128` (`resetDailyQuotas`), `:141-173` (`resetExpiredQuotaCycles`); `apps/api/src/inngest/functions/quota-reset.ts:44` | `quotaPools`/`profileQuotaUsage` are out of the charter's literal 5-table scope; flagged for completeness only. |
| F12 | `routes/consent.ts` and `routes/consent-web.ts` (both, `a52b8282f`) import **only error classes** (`ConsentTokenNotFoundError`, `ConsentAlreadyProcessedError`, etc.) from legacy `services/consent.ts`; all real consent logic is `requestConsentV2`/`resendConsentV2`/`processConsentResponseV2`/`revokeChildConsentV2`/`restoreChildConsentV2`/`getProfileConsentStateV2` from `services/identity-v2/consent-v2.ts`. `inngest/functions/consent-reminders.ts` imports only from `consent-v2.ts`; `consent-revocation.ts` imports the pure `calculateAgeFromParts` (actually defined in `./age-utils`, just re-exported by `consent.ts`) plus v2 functions. | info | high | `apps/api/src/routes/consent.ts:21-32` (git show a52b8282f), `apps/api/src/routes/consent-web.ts:4-8` (git show a52b8282f), `apps/api/src/inngest/functions/consent-reminders.ts:16`, `apps/api/src/inngest/functions/consent-revocation.ts:10,16` | — |
| F13 | `services/consent.ts` DB-touching functions (`createPendingConsentState`, `createGrantedConsentState`, `requestConsent`, `resendConsent`, `processConsentResponse`, `getConsentStatus`, `revokeConsent`, `restoreConsent`, `getProfileConsentState`, `getChildConsentForParent`, etc.) have **no live callers** except from inside `services/profile.ts`'s already-dead functions (F8). `isGdprProcessingAllowedBatch` is called from `services/solo-progress-reports.ts:90` — but that file is itself dead (F14). | low | high | `apps/api/src/services/consent.ts:283-1377` (function block); cross-refs at `profile.ts:311,362,455,463,633,665` | — |
| F14 | `services/solo-progress-reports.ts` (legacy, imports `accounts, familyLinks, learningSessions, profiles` directly) has **zero live callers** for `listEligibleSelfReportProfileIds`/`listEligibleSelfReportProfileIdsAtLocalHour9`. `inngest/functions/weekly-self-reports.ts:10` imports exclusively from `services/identity-v2/solo-progress-reports-v2.ts`. | low | high | `apps/api/src/services/solo-progress-reports.ts:33,97`; `apps/api/src/inngest/functions/weekly-self-reports.ts:10` | — |
| F15 | **`services/deletion.ts`** (legacy) contains raw SQL `DELETE FROM profiles`, `FROM consent_states` (lines 374-479) — a genuine legacy-table writer. On the **working tree** (5 commits behind), `inngest/functions/account-deletion.ts:9` imported from this file — a live P1 path. On **`a52b8282f`** (current reality, commit message: *"reroute v1-pinned scheduledDeletion to v2 — P1 live prod 500 + GDPR erasure gap [WI-1255]"*), `account-deletion.ts` imports **exclusively** from `services/identity-v2/deletion-v2.ts` (`organizationExistsV2`, `isDeletionCancelledV2`, `executeDeletionV2`, etc.) — zero import from legacy `services/deletion.ts`. A repo-wide sweep of every non-test file in `a52b8282f`'s tree (454 files under `apps/api/src`) found **zero** live importers of `services/deletion.ts`. | high (as historical/just-fixed) / info (as of current ref) | high | `apps/api/src/services/deletion.ts:374-479` (raw SQL); `apps/api/src/inngest/functions/account-deletion.ts:1-13` (git show a52b8282f) vs. working-tree `apps/api/src/inngest/functions/account-deletion.ts:9` (stale, pre-fix) | **This is the charter's exact scenario** — a real prod-breaking legacy read/write that existed until very recently. Confirms the risk class is real, not hypothetical, and that "current reality" and "working tree" diverge materially on this exact question. Flag this prominently to Fable: don't trust a stale checkout for this class of finding. |
| F16 | `services/identity-v2/deletion-v2.ts` (`a52b8282f`) reads subscriptions via `tx.query.subscription` (v2 singular table, `organizationId`-keyed) — confirmed v2-only, including comments explicitly noting legacy `accounts`/`profiles` "DO NOT EXIST" on reset environments. | info | high | `apps/api/src/services/identity-v2/deletion-v2.ts:924-937` (git show a52b8282f) | — |
| F17 | No route file in `apps/api/src/routes/*.ts` (a52b8282f / working tree, both checked) imports any legacy Drizzle table object (`profiles`, `accounts`, `familyLinks`, `consentStates`, `subscriptions`) as a value from `@eduagent/database`. All such imports across the whole route layer are `type Database` / `type Account` or v2 symbols. | info | high | Multi-line `rg -U` sweep, all `apps/api/src/routes/*.ts`, zero matches | — |
| F18 | No remaining `IDENTITY_V2_ENABLED`-style env flag exists in `apps/api/src/config.ts`. The legacy/v2 branch points that used to be flag-gated (`metering.ts`, `dispatch.ts`) are now **hardcoded to the v2 branch** in source, not toggled at runtime. | info | high | `rg -n "IDENTITY_V2\|identityV2" apps/api/src/config.ts` → no hits | This means "flag-gated-off legacy" (medium severity per the charter's own rubric) does not currently describe anything in this repo — the cutover for the paths we traced is a **hardcoded** source-level commit, not a runtime toggle. The remaining risk is 100% "dead code not yet deleted," not "flag could flip back on." |

## Reader-vs-symbol-lag classification

Every legacy hit found, classified per the charter's (a)/(b)/(c) scheme. **(a)** = live runtime reader/writer reachable from a prod entry point; **(b)** = schema `.references()` symbol-lag only (WI-779, not re-verified here — out of scope, DB FK already repointed per given context); **(c)** = test-only. Added **(d)** = dead code (zero live callers, not test-only, not a mere schema symbol reference — a real function body with a real DB call, but unreachable).

| Legacy symbol / file | Class | Flag-gated? | Notes |
|---|---|---|---|
| `services/account.ts::findOrCreateAccount` (accounts R/W, subscriptions W) | (d) dead | No — zero callers | F4 |
| `services/account.ts::findAccountByClerkId` (accounts R) | (d) dead | No | F5 — only called from dead F6/F7 |
| `services/account.ts::updateAccountEmailFromClerk` (accounts W) | **(d) dead** — traced at audit close | No | `git grep` (origin/main) → only tests/comments/v2-twin; def `account.ts:341` has zero live callers. Evidence `artifacts/q1-updateAccountEmail-trace.txt` |
| `services/billing/alias-merge.ts::mergeAliasedSubscription` (subscriptions W) | (d) dead | No | F6 |
| `services/billing/alias-merge.ts::decideAliasMerge`, `ALIAS_MERGE_IDEMPOTENCY_SOURCE` | (b)-like reuse | N/A (pure, no DB) | Imported live by v2 twin — fine, not a legacy-table hit |
| `services/billing/revenuecat-webhook-handler.ts` (all DB-write fns) | (d) dead | No | F7 |
| `services/billing/stripe-webhook-handler.ts` (all DB-write fns) | (d) dead | No | F7 |
| `services/billing/stripe-webhook-handler.ts` pure extractors | (b)-like reuse | N/A (pure) | Imported live by v2 twin |
| `services/safe-refresh-kv-cache.ts::safeRefreshKvCache` (subscriptions R via getSubscriptionByAccountId) | (d) dead | No | Only called from dead F7 files |
| `services/profile.ts` — 12 of 15 exported fns (profiles R/W, consent_states R/W, subscriptions R) | (d) dead | No | F8 |
| `services/profile.ts::updateProfileAppContext` | not a hit | N/A | Fully v2 despite file location |
| `services/billing/family.ts` (all fns; profiles/subscriptions R/W) | (d) dead | No | F9 |
| `services/billing/tier.ts` (all fns except `getTopUpPriceCents`) | (d) dead | No | F9 |
| `services/billing/tier.ts::getTopUpPriceCents` | not a hit | N/A | Pure tier-config lookup |
| `services/billing/quota-reconcile.ts`, `quota-provision.ts` (all fns) | (d) dead | No | F9 |
| `services/billing/revenuecat.ts` (all fns) | (d) dead | No | F9 |
| `services/billing/subscription-core.ts` (all fns — the core legacy `subscriptions` CRUD) | (d) dead | No | Callers are `family.ts`/`profile.ts`/`safe-refresh-kv-cache.ts`, all themselves dead |
| `services/billing/metering.ts::verifyProfileInSubscriptionAccount` (profiles⋈subscriptions R) | (d) dead-in-practice, but **reachable by construction** if a caller omits `identityV2` | Hardcoded `true` at both live call sites | F2 — closest thing to a live risk; recommend removing the `= false` default or asserting `identityV2` is always `true` |
| `services/billing/trial.ts::resetDailyQuotas` | live, but touches out-of-scope tables (`quotaPools`, `profileQuotaUsage`) | No | F11 |
| `services/billing/trial.ts::resetExpiredQuotaCycles` (raw SQL, subscriptions) | (d) dead | No | F11 |
| `services/consent.ts` — all DB-touching fns (consent_states, family_links, profiles R/W) | (d) dead | No | F13 — only called from dead `profile.ts` |
| `services/consent.ts` — error classes, `checkConsentRequired`, `calculateAgeFromParts` | not a hit | N/A | Pure / type-only reuse by live v2 routes |
| `services/solo-progress-reports.ts` (accounts, familyLinks, profiles R) | (d) dead | No | F14 |
| `services/deletion.ts` (raw SQL: profiles, consent_states R/W) | **(a) was live** until `a52b8282f`; **(d) dead as of `a52b8282f`** | No (was a routing bug, not a flag) | F15 — the one genuine near-miss; recently fixed |
| `services/billing/store-teardown.ts::subscriptions` reference | not a hit | N/A | Refers to the Stripe SDK's `client.subscriptions` property, not the DB table |
| `services/identity-v2/deletion-v2.ts`, `consent-v2.ts` | v2-only | N/A | F16 |
| `packages/database/src/schema/*.ts` `.references()` symbols | (b) symbol-lag | N/A | Not re-verified — explicitly out of scope per task framing (WI-779, DB FK already repointed) |
| Test files (`*.test.ts`, `*.integration.test.ts`) importing legacy fns directly | (c) test-only | N/A | Not content-audited; e.g. `routes/assessments.test.ts`, `routes/revenuecat-webhook.test.ts`, `routes/stripe-webhook.test.ts`/`.integration.test.ts` import legacy `services/billing` symbols for fixture/assertion purposes — expected and out of scope for a prod-path audit |

## Contradictions

1. **`middleware/maintenance.ts:7-9`** (stale comment, unfixed): *"accountMiddleware's `findOrCreateAccount()` JIT-inserts legacy `accounts` + a trial `subscriptions` row on ANY authenticated request (including a GET)"* — this describes pre-cutover behavior. Current `middleware/account.ts` calls `resolveIdentityV2()` / `ensureInitialTrialSubscriptionV2()` only (F3); `findOrCreateAccount` is dead (F4). The maintenance-gate's *placement* (before auth) is still defensible for the v2 provisioning it now actually guards, but the comment's causal claim is wrong and should be corrected or it will mislead the next person reasoning about this gate.
2. **`routes/revenuecat-webhook.ts:26-29`** (stale comment): *"[CUT-B3 / WI-693] The handler seam dispatches: flag-off → legacy handlers (byte-identical, accounts-keyed), flag-on → v2 handlers"* — contradicts `dispatch.ts`'s own header, which says the seam now *"always return[s] the v2 handler bundle"* (WI-868, a later commit that superseded WI-693's flag). The route-file comment was not updated when WI-868 landed.
3. **Working tree vs. `a52b8282f`** on `inngest/functions/account-deletion.ts` (F15): not a code contradiction, but a **provenance trap** — the two states disagree on live/dead status of `services/deletion.ts`. Any tool or agent that reads the checked-out working tree instead of `origin/main` will misreport this specific finding's severity as critical/live rather than info/dead-just-fixed.

## Fable prompts

- Confirm independently that `middleware/metering.ts:558` and `inngest/functions/session-completed.ts:1786` are the **only** two call sites of `decrementQuota` in the deployed Worker bundle (not just source) — a build-time dead-code-elimination check would strengthen F2's "no live risk" conclusion beyond static grep.
- ~~Verify whether `services/account.ts::updateAccountEmailFromClerk` has any reachable caller.~~
  **CLOSED (2026-07-02 audit).** `git grep updateAccountEmailFromClerk origin/main -- apps/ packages/`
  returns only: test files (`account.test.ts`, `services/account.test.ts`), doc/comments, and the
  v2 twin (`identity-v2/account-v2.ts`). The definition (`services/account.ts:341`) has **zero live
  route/inngest callers** → dead code, class (d), consistent with the orphaned subtree. Raw output:
  `artifacts/q1-updateAccountEmail-trace.txt`. **The "zero live legacy readers/writers" conclusion
  now holds with no untraced exceptions.**
- Independently decide whether the ~12 dead functions in `services/profile.ts`, the ~9 dead functions in `services/billing/family.ts`, and the fully-dead `services/deletion.ts` / `services/solo-progress-reports.ts` / `services/billing/revenuecat-webhook-handler.ts` / `services/billing/stripe-webhook-handler.ts` / `services/billing/subscription-core.ts` constitute a WI-779-adjacent cleanup target — Q1's charter asked "do live paths still touch legacy tables," and the answer is essentially no, but there is a large, precisely-enumerated dead-code surface still importing and querying dropped-in-prod tables that would break immediately if anything ever called it again (e.g. a future refactor that accidentally re-wires a route to the wrong service file).
- Treat F15 as the calibration case for how much to trust this evidence pack's confidence ratings: the exact failure mode the charter worried about (a live prod path hitting a dropped table) existed 5 commits ago and was fixed in the commit the task pointed at. That is strong evidence this class of bug is real and recently active in this codebase, not a purely theoretical WI-779 concern — worth weighting Q1's overall risk assessment accordingly even though the current-`origin/main` answer is "no live legacy readers found."
