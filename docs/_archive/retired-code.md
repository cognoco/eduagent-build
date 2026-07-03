# Retired Code

Durable record of code deliberately removed (not just refactored), why it was safe,
and how to recover it. Append newest-first.

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
