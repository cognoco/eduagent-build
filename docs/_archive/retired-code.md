# Retired Code

Durable record of code deliberately removed (not just refactored), why it was safe,
and how to recover it. Append newest-first.

---

## WI-1364 — dead legacy identity/billing prod readers (2026-07-03)

Dead-code sweep of the production service functions that still read/wrote the
legacy `accounts` / `profiles` / `family_links` / `consent_states` /
`subscriptions` tables. Every removed function was confirmed to have **zero live
non-test callers** (routes and Inngest functions all dispatch to their v2 twins);
the removals unblock WI-1139 (legacy schema-def removal). Verified per function
via method-aware `git grep -nw` + route/Inngest dispatch tracing + alias-import
sweep; `tsc -p tsconfig.app.json` clean afterward (the pre-existing
`@eduagent/schemas`/language typecheck errors are a worktree build-order artifact,
unrelated). **No test files were retired here** — the tests for these functions
were already retired upstream in WI-1128 / WI-1347 (a clean `tsconfig.spec.json`
typecheck confirms no surviving test statically references a removed function).

**Recovery:** annotated tag `retired/wi-1364-dead-legacy-readers` points at the
pre-sweep commit. Retrieve any removed file/function with:

```
git show retired/wi-1364-dead-legacy-readers:<path>
```

### Whole files deleted

| File | Reachability evidence |
|------|-----------------------|
| `apps/api/src/services/deletion.ts` | All 11 exports (`scheduleDeletion`, `cancelDeletion`, `executeDeletion`, `deleteProfile`, `deleteProfileIfConsentWithdrawn`, …) prod-calls=0; no module importer, no method-style caller. Live path is `identity-v2/deletion-v2.ts` (`scheduleDeletionV2`/`executeDeletionV2`, wired in `routes/account.ts` + `inngest/functions/account-deletion.ts`). |
| `apps/api/src/services/deletion.test.ts` | Tests only the above dead module. |

### Gutted files (dead functions removed; live surface kept)

| File | Removed (dead) | Kept (live) |
|------|----------------|-------------|
| `services/account.ts` | `findOrCreateAccount` (+ private `findLegacyAccountByClerkId`, `hashEmail`); **completeness follow-up (2026-07-03): `updateAccountEmailFromClerk`** (+ private `mapAccountRow`, `normalizeEmail`) — dead pre-sweep (0 non-test callers; v2 twin `updateLoginEmailFromClerk` in `identity-v2/account-v2.ts`); its removal drops the last `accounts` legacy-def import from the file | `notifyAccountSecurityEvent`, `findAccountByClerkId` (now v2 via `resolveIdentityV2`) |
| `services/profile.ts` | `listProfiles`, `countProfiles`, `assertProfileCreationAllowed`, `findOwnerProfile`, `createProfile`, `createProfileWithLimitCheck`, `getProfile`, `updateProfile`, `switchProfile`, `getProfileAge`, `loadProfileRowById`, `getProfileDisplayName`, `getProfileAgeBracket`, `resolveProfileRole` (+ private `mapProfileRow`, `loadProfileFamilyMeta`) | `updateProfileAppContext` (v2: person+membership), `ProfileValidationError`, `ProfileLimitError` classes |
| `services/consent.ts` | `createPendingConsentState`, `createGrantedConsentState`, `requestConsent`, `resendConsent`, `processConsentResponse`, `refreshConsentToken`, `refreshConsentTokenForRequest`, `getConsentStatus`, `isConsentRevocationGenerationCurrent`, `isGdprProcessingAllowed`, `getChildNameByToken`, `getProfileDisplayName`, `getProfileForConsentRevocation`, `getFamilyOwnerProfileId`, `getProfileConsentState`, `getChildConsentForParent`, `revokeConsent`, `restoreConsent` (+ `ConsentState` interface, `mapConsentRow`); **completeness follow-up (2026-07-03): `isGdprProcessingAllowedBatch`** (became dead in this sweep — its only prod caller `listEligibleSelfReportProfileIds` was removed) **+ `getLatestGdprConsentByProfile`** (transitively dead — its only caller was `isGdprProcessingAllowedBatch`); removing both drops the last `consentStates` legacy-def import from the file | `checkConsentRequiredFromDate`, `checkConsentRequired`, `RESTORE_CONSENT_GRACE_PERIOD_MS`, error classes, `age-utils` re-exports. Routes use v2 twins (`requestConsentV2` …). |
| `services/billing/subscription-core.ts` | `getSubscriptionByAccountId`, `createSubscription`, `ensureFreeSubscription`, `resetMonthlyQuota`, `updateQuotaPoolLimit` | `getQuotaPool` (live: `inngest/session-completed.ts`) |
| `services/billing/quota-reconcile.ts` | `reconcileQuotaStateForSubscription` (only caller was dead `ensureFreeSubscription`) | `reconcileQuotaStateForEffectiveTier` (live: `billing-v2/quota-reconcile-v2.ts`) |
| `services/billing/family.ts` | `getProfileCountForSubscription`, `canAddProfile` | `addToByokWaitlist`, `getUsageEventsAvailableSince`, `buildUsageDateLabels` (live: `routes/billing.ts`) |
| `services/billing/trial.ts` | `expireTrialSubscription`, `downgradeQuotaPool`, `resetExpiredQuotaCycles`, `findExpiredTrials`, `findSubscriptionsByTrialDateRange`, `transitionToExtendedTrial`, `downgradeExtendedTrialQuotaIfStillExpired`, `transitionToExtendedTrialFromRevenuecatEvent`, `expireTrialAndDowngradeQuota`, `findExpiredTrialsByDaysSinceEnd` | `resetDailyQuotas` (live: `inngest/quota-reset.ts`; v2 twins in `trial-v2.ts` power `trial-expiry.ts`) |
| `services/child-cap-notifications.ts` | `listActiveChildCapNotifications`, `recordChildCapNotificationForSubscription`, `recordChildCapNotificationForAccount` (+ private `mapNotificationRow`, `findOwnerProfileIdBySubscription`, `childBelongsToSubscriptionAccount`, `findOwnerProfileIdByAccount`, `insertChildCapNotification`) | `dismissChildCapNotification` (live) |
| `services/onboarding/index.ts` | `updateConversationLanguage`, `updatePronouns` (routes use v2 twins) | `sanitizeInterestLabel`, `assertPronounsSelfEditAllowed`, `updateInterestsContext` |
| `services/solo-progress-reports.ts` | `listEligibleSelfReportProfileIds`, `listEligibleSelfReportProfileIdsAtLocalHour9` | `isLocalHour9ForTimezone` (live: `identity-v2/solo-progress-reports-v2.ts`) |
| `services/billing.ts` + `services/billing/index.ts` | Barrel re-exports of every removed billing/trial/family/subscription-core function | Re-exports of the kept functions above |

### NOT swept (out of scope, surfaced for follow-up)

- `services/export.ts` `generateExport` — **live** (unconditionally called by
  `identity-v2/export-v2.ts` with `learningOnlyProfileIds`). Untouched.

### Residual legacy-def readers — CLEARED (completeness follow-up, 2026-07-03)

The initial sweep kept three functions that were in fact dead; the completeness
follow-up removed them (see the `account.ts` / `consent.ts` rows above). After it,
**`services/account.ts` and `services/consent.ts` import zero legacy table defs**
— `accounts` and `consentStates` are no longer imported by either file. WI-1139's
"no code imports legacy defs" precondition is now **met for `accounts` +
`consent_states`** from this surface. The three removed functions were all dead
code (0 live callers), not live paths — this was a small dead-removal, not a
behavior-changing port.

(`findAccountByClerkId` was never a legacy reader — it resolves via
`resolveIdentityV2`. The bucket-(c) `tableExists`-gated v2 dual-write files —
`identity-graph.ts`, `subscription-core-v2.ts`, `child-profile-v2.ts` — remain
WI-1398's scope, untouched here.)

### Test-block retirements (completeness follow-up, 2026-07-03)

The initial sweep removed ~40 prod functions but left co-located unit tests that
still imported/exercised them, leaving the branch red in both CI jobs. The
follow-up retired those orphaned test blocks (keeping every block that covers a
KEPT function). 13 test files, all validated green in the worktree
(`tsc --build tsconfig.spec.json` clean; targeted jest 477 passing):

- **Rebuilt to keep only live-fn blocks:** `services/account.test.ts`
  (`findAccountByClerkId`), `services/consent.test.ts`
  (`calculateAge`/`checkConsentRequired*`), `services/profile.test.ts`
  (`updateProfileAppContext` ×2), `services/solo-progress-reports.test.ts`
  (`isLocalHour9ForTimezone`).
- **Surgical retirement of removed-fn blocks/imports:** `services/billing.test.ts`
  (removed subscription-core/family/trial blocks; kept `getQuotaPool`,
  `decrementQuota`, top-up), `routes/profiles.test.ts` + `routes/sessions.test.ts`
  (dropped legacy `listProfiles`/`assertProfileCreationAllowed`/`getProfileAgeBracket`
  imports + obsolete legacy-not-called guards), `inngest/quota-reset.test.ts` +
  `services/session/session-crud.test.ts` (removed legacy `resetExpiredQuotaCycles` /
  `getProfileAge` spies; v2 spies retained).
- **Deletion behavioral repoint (source is v2-collapsed on `identity-v2/deletion-v2`):**
  `routes/account.test.ts` repointed the [Issue 901] privilege-escalation guards to
  the v2 twins (`scheduleDeletionV2`/`cancelDeletionV2`/`getDeletionStatusV2`) and
  dropped the deleted-`services/deletion` mock + inert `findOwnerProfile` setups;
  `inngest/archive-cleanup.test.ts` + `inngest/account-deletion.test.ts` dropped
  their mocks of the deleted `services/deletion` module (the legacy "not-called"
  guards were vacuous post-collapse; live v2 assertions retained).

Recovery for all of the above is the existing pre-sweep tag
`retired/wi-1364-dead-legacy-readers` plus this commit's parent.

### Guard-ratchet gap closure (completeness follow-up, 2026-07-04)

Two tree-scanning guard tests went red in CI (they scan source, not import the
changed files, so file-targeted jest never selected them). Both are direct
consequences of the sweep:

- **`inngest/functions/billing-trial-subscription-failed.ts` (+ its co-located
  test + registration in `inngest/index.ts`) REMOVED.** This handler observed the
  `app/billing.trial_subscription_failed` event, whose **sole** dispatcher was the
  removed `findOrCreateAccount` (it created the trial subscription *separately,
  after* the account, in a try/catch that let account creation succeed even when
  the trial insert failed — the silent-recovery path the event escalated per
  BUG-837). The v2 account-provisioning path (`identity-v2/identity-graph.ts`
  `createIdentityGraph`, step 8) creates the trial subscription **inline and
  atomically inside the graph transaction** — a failed insert throws and rolls the
  whole account creation back (fail-loud), so there is no silent-recovery state to
  escalate and no v2 equivalent event. The handler was a true inverse-orphan
  (registered, zero production dispatchers). `orphan-handler.guard.test.ts` flagged
  it; removal (not a `KNOWN_PENDING_INVERSE_ORPHANS` park) is the fix. No
  dispatcher-orphan created (0 dispatchers).
- **`multi-write-tx.guard.test.ts` target repointed** `services/deletion.ts` →
  `services/identity-v2/deletion-v2.ts`. The WI-1060 multi-write-transaction
  invariant that `executeDeletion` carried now lives in the `executeDeletionV2`
  family of the live v2 twin (all writes wrapped in `db.transaction`); the guard
  follows the invariant to the live code rather than dropping coverage.

Recovery: same pre-sweep tag `retired/wi-1364-dead-legacy-readers` plus this
commit's parent.

---

## WI-1128 — legacy identity integration suites (2026-07-03)

The identity-v2 cutover's migration **0130 (`0130_m_drop_legacy.sql`)** physically
drops the legacy `profiles` / `accounts` / `family_links` / `consent_states` tables.
Integration suites that seed those tables would break in the required flag-OFF `main`
CI lane once 0130 lands (that lane never sets `IDENTITY_V2_ENABLED`, so every
`describe.skip`/`it.skip`-under-flag-ON quarantine gate evaluates to *run*). The
legacy suites were therefore retired as part of the 0129+0130 change-set.

**Recovery:** annotated tag `retired/wi-1128-legacy-integration-suites` (pushed) points
at the pre-deletion commit. Retrieve any removed file/block with:

```
git show retired/wi-1128-legacy-integration-suites:<path>
```

### Whole-deleted files (every live test ported to a v2 twin, or obsolete)

| File | Disposition |
|------|-------------|
| `apps/api/src/services/consent.integration.test.ts` | nudge-suppression ×4 → `identity-v2/consent-v2.integration.test.ts`; resend ×7 (incl BUG-791 revive) → consent-v2; raw two-row insert/rollback = dropped-table mechanics, live v2 analog at consent-v2 (`requestConsentV2` grant+back-link). |
| `apps/api/src/services/profile.integration.test.ts` | BUG-862 concurrent-cap, OPT-C under-18, exact-18, WI-367 exact-age + birth-date persistence, flag-off, at-cap → `identity-v2/child-profile-v2.integration.test.ts`. BUG-1100 (COUNT-returns-string owner assignment) = obsolete: legacy-`profiles`-COUNT artifact, no v2 analog. |
| `apps/api/src/services/deletion.integration.test.ts` | Bug#494 cancel → `identity-v2/deletion-v2.integration.test.ts`; retention-cascade → `tests/integration/account-deletion.integration.test.ts` (D2); TOCTOU / consent-restored / archived-live-grant → consent-v2 deletion section. **F-093 cross-account reject + same-account + omit-parent** = obsolete: all three test `deleteProfileIfConsentWithdrawn(…, parentProfileId)`, a **dead** legacy fn (zero live callers). v2 deletion is `executeDeletionV2`, org-scoped by construction (no foreign-parent vector); cross-org authority is child-profile-v2's `[SECURITY] parents to caller org's owner`, data-isolation is account-deletion's BUG-368/-v2 cross-account breaks. |

### Trimmed files (dead breaker tests removed, live drop-safe test kept in place)

| File | Kept | Removed |
|------|------|---------|
| `apps/api/src/services/child-cap-notifications.integration.test.ts` | `dismissChildCapNotification` (live; touches only `childCapNotifications`, not dropped) | 3 `(isIdentityV2Enabled()?it.skip:it)` breaker tests for the dead `recordChildCapNotificationForSubscription` / `listActiveChildCapNotifications` (v2 twins in `billing/billing-v2/child-cap-notifications-v2.integration.test.ts`) + orphaned `seedFamily` helper. |
| `apps/api/src/services/onboarding/onboarding.integration.test.ts` | `updateInterestsContext` (live; v2-anchored seed) | 2 `(isIdentityV2Enabled()?describe.skip:describe)` blocks for the dead `updateConversationLanguage` / `updatePronouns` (routes dispatch to the v2 twins per `[WI-867] v2 always`). |

Left untouched (already drop-safe via runtime guards / pure-v2 seeds):
`export.integration.test.ts`. `subscription-core.integration.test.ts` was **not**
in fact drop-safe via its runtime guards — see the follow-up entry below (2026-07-03)
for why and what was retired there instead.

### Follow-up dead-sweep (separate WI, home WS-18)

These functions are now confirmed dead (retired their only tests here) and should be
removed by a dead-code-sweep WI, with reachability evidence:

- `deleteProfileIfConsentWithdrawn` (`apps/api/src/services/deletion.ts`) — zero live callers.
- `createProfileWithLimitCheck` (`apps/api/src/services/profile.ts`) — v2 twin is
  `createChildProfileV2`; confirm reachability (billing/* doc-comments still name it an entry point).
- `getSubscriptionByAccountId` + `resetMonthlyQuota` (`billing/subscription-core.ts`) — prior finding, both dead.

---

## WI-1128 — subscription-core.integration.test.ts, follow-up (2026-07-03)

The `isIdentityV2Enabled()`-gated quarantine on 4 dead-fn test blocks in this file
(added by the WI-1128 entry above) did NOT make them drop-safe. This branch's
migration chain currently tops out at `0129_m_repoint` — the FK re-point;
`0130` (the physical legacy-table drop) was reverted out of this branch by commit
`fb7a49f6a` and does not exist here — and CI's `drizzle-kit migrate` applies that
chain unconditionally in every lane (flag-ON and flag-OFF alike — schema state
isn't flag-gated). So the flag-OFF lane still ran these blocks un-skipped against
the post-0129-repoint schema and FK-violated on
`quota_pools_subscription_id_subscription_id_fk`. Retired outright rather than
re-guarded — the guard mechanism was categorically wrong for a schema-level break,
not a runtime-behavior difference. Verified via local Postgres with this branch's
full migration chain applied (matching CI's `drizzle-kit migrate`): full-file
suite is 20/20 passing in both `IDENTITY_V2_ENABLED=true` and `=false`.

| Removed | Reachability evidence |
|---|---|
| `ensureFreeSubscription` describe block (2 `it`s) | Called only from `services/profile.ts`'s `createProfileWithLimitCheck`, confirmed zero live callers (`git grep -n "createProfileWithLimitCheck("` — no invocation outside its own definition). |
| `createSubscription` describe block (3 `it`s) | Called only from `services/account.ts`'s `findOrCreateAccount`, confirmed zero live callers (`git grep -n "findOrCreateAccount("` — no invocation outside its own definition; `account.ts:114`'s own comment states this: accountMiddleware resolves via `resolveIdentityV2`, not `findOrCreateAccount`). |
| `resetMonthlyQuota` guarded `it` ("resets usedThisMonth to 0 and sets a new limit") | Zero callers anywhere in `apps/` or `packages/` (not even reachable via the two dead wrappers above). The sibling "returns null when quota pool does not exist" `it` is KEPT — it doesn't route through the dead seed path and passes both flag states. |
| `updateQuotaPoolLimit` describe block (2 `it`s) | Zero callers anywhere in `apps/` or `packages/`, same as `resetMonthlyQuota`. |

`getSubscriptionByAccountId`, `getQuotaPool`, `updateSubscriptionFromWebhookV2`,
`activateSubscriptionFromCheckoutV2` coverage is KEPT — all pass both flag-ON and
flag-OFF against the post-0129-repoint schema. The `isIdentityV2Enabled()` guard
and its import are removed from the file entirely — no guarded blocks remain in it.

`getSubscriptionByAccountId`'s own prod-fn deadness (flagged in the "Follow-up
dead-sweep" list above) is explicitly **not** addressed here — its test coverage
passes and stays; removing the dead prod fn itself is WI-1167/WI-1347 territory.

**Recovery:** pre-retirement file state — `git show fb7a49f6a8acd316c2cd241bfb88f64f28c12992:apps/api/src/services/billing/subscription-core.integration.test.ts`.

---

## WI-1347 — getSubscriptionByAccountId (2026-07-03)

WI-1347 (corpus seed migration ahead of the WI-1306/0130 legacy-table drop) requires
the full integration corpus to pass with `accounts`/`profiles`/`family_links`/
`consent_states`/`subscriptions` physically absent. The `getSubscriptionByAccountId`
describe block in `subscription-core.integration.test.ts` (2 `it`s: "returns null
when no subscription exists", "returns the subscription row when one exists")
directly calls `getSubscriptionByAccountId` (`services/billing/subscription-core.ts`),
which does an unconditional `repo.subscriptions.findFirst()` against the legacy
`subscriptions` table — no `tableExists` gate, no v2 fallback. Both `it`s hard-fail
once the table is dropped, regardless of test-seed gating (the *production* function
itself throws).

**Reachability confirmed dead**, independently re-derived via `git grep -nw` and
cross-checked against the WI-1128 follow-up entry above (which already flagged this
same fact and deferred acting on it to "WI-1167/WI-1347 territory"): `git grep -nw
"getSubscriptionByAccountId("` finds live call sites only inside
`findOrCreateAccount` (`services/account.ts:168`) and `createProfileWithLimitCheck`
(`services/profile.ts:526`) — both already confirmed transitively dead (zero
non-test callers; `account.ts:114-115` self-documents `findOrCreateAccount` has zero
live callers, `accountMiddleware` resolves via `resolveIdentityV2` instead).

Per shepherd ruling on WI-1347: the *test* block is retired (this WI's authority);
the *production* function `getSubscriptionByAccountId` itself is **not** removed
here — that dead-code removal is WI-1364 territory, tracked separately.

**Recovery:** annotated tag `retired/wi-1347-getsubscriptionbyaccountid` (pushed)
points at the pre-removal commit on branch `WI-1347`. Retrieve with:

```
git show retired/wi-1347-getsubscriptionbyaccountid:apps/api/src/services/billing/subscription-core.integration.test.ts
```

---

## WI-1347 — tests/integration/consent-restore-archive.integration.test.ts (2026-07-03)

Retired per explicit orchestrator ruling on WI-1347 (non-negotiable — not a builder
judgment call). Whole file, one describe block: a
`(isIdentityV2Enabled() ? describe.skip : describe)`-gated legacy-quarantine suite
(2 `it`s: "restoreConsent clears archivedAt atomically",
"archive-cleanup bails with consent_restored when consent is CONSENTED"). Its own
header comment already documented the disposition: it exercises
`services/consent.ts`, "whose DB layer is orphaned dead code (§7.3-confirmed; all DB
exports have live V2 twins in services/identity-v2/consent-v2.ts)", and "fails
post-0130 because consent.ts reads legacy tables WI-1128 drops." Its raw
`accounts`/`profiles`/`family_links`/`consent_states` seeds were unconditional (no
`tableExists` gate) and would hard-fail once those tables are dropped regardless.

Coverage is not lost: `tests/integration/consent-restore-archive-v2.integration.test.ts`
already exercises the same restore-vs-archive-cleanup race against the v2
(person/organization/guardianship/consentGrant) graph — it is in fact the source the
WI-1347 refine package cites as the canonical v2 seeding idiom for this WI.
`archive-cleanup`'s "bails with consent_restored" behavior also has non-integration
coverage in `apps/api/src/inngest/functions/archive-cleanup.test.ts`.

**Recovery:** annotated tag `retired/wi-1347-consent-restore-archive` (pushed) points
at the pre-removal commit on branch `WI-1347`. Retrieve with:

```
git show retired/wi-1347-consent-restore-archive:tests/integration/consent-restore-archive.integration.test.ts
```

---

## WI-1347 — billing/trial.integration.test.ts (2026-07-03)

Shepherd-ruled disposition (option a, of two proposed). 4 of the file's 5 describe
blocks retired: `transitionToExtendedTrial atomicity [CR-2026-05-19-M3 SITE 2a]`,
`downgradeExtendedTrialQuotaIfStillExpired atomicity [F-121]`,
`transitionToExtendedTrialFromRevenuecatEvent [WI-78 review]`,
`expireTrialAndDowngradeQuota atomicity [CR-2026-05-19-M3 SITE 2b]`. All test exports
of `apps/api/src/services/billing/trial.ts` (the legacy, non-V2 trial-lifecycle
functions), confirmed transitively dead via `git grep -nw`: each has live call sites
only inside `services/billing.ts` / `services/billing/index.ts` barrel re-exports —
no real invocation anywhere else. The live Inngest cron
(`apps/api/src/inngest/functions/trial-expiry.ts`) imports its trial-expiry logic
exclusively from `services/billing/billing-v2`, not `services/billing/trial.ts`.

Also trimmed 2 of 3 tests inside the surviving `Quota reset helpers (integration)
[CR-2026-05-19-C7]` describe: the combined-transaction atomicity test and the
standalone `resetExpiredQuotaCycles` test. Legacy `resetExpiredQuotaCycles` is
likewise dead — the live `quota-reset.ts` cron pairs `resetDailyQuotas` with
`resetExpiredQuotaCyclesV2` instead (per an in-code comment: "the legacy
resetExpiredQuotaCycles joins the `subscriptions` table dropped at the cutover...
and would FK/500"). `resetDailyQuotas` itself touches no legacy identity table
(`quota_pools`/`profile_quota_usage` only) and is live-safe; its one test is kept.

**Coverage gap, tracked separately:** there is currently zero integration coverage
of the v2 trial-lifecycle twins (`services/billing/billing-v2/trial-v2.ts`:
`transitionToExtendedTrialV2`, `downgradeExtendedTrialQuotaIfStillExpiredV2`,
`transitionToExtendedTrialFromRevenuecatEventV2`, `expireTrialAndDowngradeQuotaV2`,
`resetExpiredQuotaCyclesV2`) anywhere in the repo. Filed as **WI-1371**
(trial-v2.ts integration coverage) by the shepherd.

**Recovery:** annotated tag `retired/wi-1347-trial-dead-fn-blocks` (pushed) points
at the pre-removal commit on branch `WI-1347`. Retrieve with:

```
git show retired/wi-1347-trial-dead-fn-blocks:apps/api/src/services/billing/trial.integration.test.ts
```

---

## WI-1347 — quota-reconcile.integration.test.ts (2026-07-03)

Retired the `reconcileQuotaStateForSubscription` describe block's "returns null for
an unknown subscription id" `it`. The legacy (non-V2) `reconcileQuotaStateForSubscription`
(`apps/api/src/services/billing/quota-reconcile.ts:36`) is transitively dead per the
file's own in-code comment (lines 21-24): "KEPT — it is transitively reachable from
subscription-core.ts's createSubscription/ensureFreeSubscription, which are in turn
only reachable from services/account.ts's findOrCreateAccount" — all three already
confirmed dead (zero live callers) in the `getSubscriptionByAccountId` entry above.
It reads the legacy `subscriptions` table unconditionally (no `tableExists` gate) and
hard-fails once the table is dropped, regardless of test-seed gating.

The sibling `it` ("resolves the effective tier of an active plus subscription and
writes per-profile rows") in the same describe tests the live V2 twin,
`reconcileQuotaStateForSubscriptionV2`, and is kept unchanged.

**Recovery:** annotated tag `retired/wi-1347-quota-reconcile-dead-fn` (pushed) points
at the pre-removal commit on branch `WI-1347`. Retrieve with:

```
git show retired/wi-1347-quota-reconcile-dead-fn:apps/api/src/services/billing/quota-reconcile.integration.test.ts
```
