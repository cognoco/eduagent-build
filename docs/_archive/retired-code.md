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
`subscription-core.integration.test.ts`, `export.integration.test.ts`.

### Follow-up dead-sweep (separate WI, home WS-18)

These functions are now confirmed dead (retired their only tests here) and should be
removed by a dead-code-sweep WI, with reachability evidence:

- `deleteProfileIfConsentWithdrawn` (`apps/api/src/services/deletion.ts`) — zero live callers.
- `createProfileWithLimitCheck` (`apps/api/src/services/profile.ts`) — v2 twin is
  `createChildProfileV2`; confirm reachability (billing/* doc-comments still name it an entry point).
- `getSubscriptionByAccountId` + `resetMonthlyQuota` (`billing/subscription-core.ts`) — prior finding, both dead.
