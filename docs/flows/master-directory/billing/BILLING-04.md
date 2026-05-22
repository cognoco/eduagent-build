# BILLING-04 - Restore Purchases

> **Status:** Draft  
> **Access label:** Owner/account shared  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/more/account.tsx`, `apps/mobile/src/app/(app)/subscription.tsx`, `apps/mobile/src/hooks/use-subscription.ts`, `apps/mobile/src/hooks/use-revenuecat.ts`, `.claude/memory/billing-payments.md`, `.claude/memory/project_revenuecat_setup.md`

## Purpose

Let the account owner reconnect existing App Store / Play purchases to the current EduAgent/MentoMate account and profile state. This is a billing/account recovery action, not a Study-only or Family-only learning flow. It matters when a user installs on a new device, RevenueCat says the product is already purchased, a webhook is delayed, or store entitlement needs to be re-synced.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Solo owner/adult learner can access Subscription from More -> Account/Profile and tap Restore Purchases. Child/non-owner learners should not see billing management rows. |
| Mentor / Family | Adult owner in Family can access the same account-level Subscription screen. Restore affects the owner account entitlement and may unlock family pool capacity, but it is not child-specific. |
| Owner/account | Primary audience. Restore calls RevenueCat, invalidates subscription/customer/usage queries, polls API confirmation, and reports restored/no-purchase/failure states inline or by alert. |
| Wrong-audience deep link | Non-owner child profiles normally redirect away from owner management UI unless the route is being used to show ChildPaywall for expired/quota-exceeded access. Parent proxy More hides Subscription. |

## Shared Scope Decision

`Owner/account shared`

Billing is shared across Study and Family because the owner account pays for entitlements, not because student and mentor have identical learning behavior. Family/Pro plans can affect child capacity and shared usage, but restore remains an account-owner action with account-level privacy and store-platform constraints.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| More hub | `/(app)/more` -> `/(app)/more/account` | Yes for owners | Yes for adult owners | More itself hides destructive/account actions in impersonated-child mode. |
| Account/Profile row | `more-row-subscription` -> `/(app)/subscription` | Yes for `role === 'owner'` | Yes for `role === 'owner'` | Account screen renders Subscription row only for owner role. |
| Restore button | `restore-purchases-button` on subscription screen | Yes for owner management UI | Yes for owner management UI | Disabled while `restore.isPending` or `restorePolling`. |
| Already-purchased purchase error | Purchase alert -> `handleRestore()` | Yes | Yes | If RevenueCat returns product-already-purchased, app prompts Restore instead of generic failure. |
| Polling confirmation | API subscription/status/usage/customerInfo refetch loop | Yes | Yes | Polls up to roughly 30 seconds after RevenueCat restore because webhook/API sync can lag. |
| Cancel visual wait | `restore-polling-cancel` | Yes | Yes | Stops showing restore polling and tells user restore continues in background. |
| Child paywall exception | `/(app)/subscription` -> `ChildPaywall` | Direct/deep link only | No owner management | Non-owner expired/quota-exceeded profiles can notify parent, browse Library, see Progress, or go Home; they cannot restore. |
| Manage billing | `manage-billing-button` or web info | Related, not BILLING-04 | Related, not BILLING-04 | BILLING-05 handles platform subscription management. |

## Data Ownership And Privacy

- RevenueCat customer info and store receipts are account-level billing data. They should be available only to the authenticated owner account/profile.
- Restoring should update subscription entitlement, usage, family subscription state, and RevenueCat customerInfo cache for the active owner profile/account.
- Child profiles and parent-proxy sessions must not expose account billing controls. ChildPaywall is a learner-safe state with notify-parent, browse Library, Progress, and Home actions only.
- Family usage/breakdown is shared account data. If restore activates Family/Pro, family pool data should appear only to eligible owners and according to breakdown-sharing settings.
- Billing secrets and store credentials remain managed through Doppler; this flow should never direct users or operators to platform dashboards for secrets.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Subscription screen shows a loading state while subscription, usage, offerings, and customerInfo load. Restore button itself shows `Restoring...` then `Verifying purchase...` during polling. |
| Empty | If RevenueCat restore succeeds but no paid API entitlement appears after polling, alert says no subscriptions found and offers "Check again" by re-running restore. |
| Success | API confirms a paid tier, subscription/usage/customer/family queries are invalidated/refetched, and user sees restored alert. Current plan, usage meter, trial/family pool/static tier cards update from API state. |
| Error/recovery | RevenueCat restore failure alerts "Restore failed" with retry by tapping the button again. Polling can be visually dismissed with "Check later"; management route has separate fallback URL behavior. |
| No access | Owner-only Subscription row is hidden for child/non-owner profiles. Non-owner direct access redirects home when no paywall is needed; expired/quota-exceeded child direct access shows ChildPaywall instead of management controls. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Web can display subscription state and static management guidance, but RevenueCat IAP restore is native-store behavior; no web preview was run for this mapping pass. |
| Native/emulator | Inventory lists `e2e/flows/billing/subscription-details.yaml`; restore UI is asserted there, but real restore requires store/RevenueCat sandbox or a seeded/mocked native path. |
| API/unit tests | Relevant mobile tests include `subscription.test.tsx`, `use-subscription.test.ts`, and RevenueCat hook tests. API/webhook entitlement confirmation should be covered where subscription routes/webhooks are tested. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Fixed bug reference | BUG-397 | Restore polls backend after RevenueCat because CustomerInfo can be a local snapshot before webhook processing finishes. |
| Fixed bug reference | UX-DE-M8 | Product-already-purchased errors prompt Restore Purchases instead of generic failure. |
| Fixed bug reference | BUG-966 | Trial banner/status are rendered on subscription screen. |
| Fixed bug reference | BUG-917 | Family/Pro customers see read-only static comparison cards for their current tier. |
| Guardrail reference | BUG-899 | Family/Pro SKUs are not public upsell options; cards are read-only unless already entitled. |
| Fixed bug reference | BUG-896/916 | Paid native users need a manage-billing path even when RevenueCat sync lags; web gets static guidance. |
| Product drift | Navigation contract | Contract says `subscription` is owner-only in Study and Family, solo owner only for child/shared; current direct route still intentionally allows ChildPaywall for non-owner expired/quota states. |
| Tooling gap | Notion MCP unavailable | Prior Notion bug URLs for BILLING-04 could not be retrieved; only code/inventory bug IDs are recorded here. |

## Open Questions

- Should ChildPaywall remain on the same `/subscription` route long term, or move to a distinct route so owner billing and child quota recovery are easier to guard separately?
- What sandbox scenario should validate a real successful restore across iOS and Android before launch?
- If restore activates Family/Pro while the user is in Study mode, should the app surface any Family setup prompt immediately or wait until the owner enters Family/account surfaces?
