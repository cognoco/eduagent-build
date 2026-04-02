# Epic 5 + Epic 6 Code Review Findings

Date: 2026-04-02

## Scope

- Reviewed Epic 5 expectations from `docs/epics.md` against the current billing, metering, webhook, and subscription-screen implementation in `apps/api`, `apps/mobile`, and `packages/*`.
- Reviewed Epic 6 placeholder stories plus the extension notes in `docs/architecture.md`, then searched `apps/*` and `packages/*` for language-learning implementation markers such as `pedagogy_mode`, `Four Strands`, `CEFR`, `FSI`, and `fluency drill`.
- Tried to run a targeted Jest slice for billing/webhook/trial-expiry files, but the run timed out while starting plugin workers (`Failed to start plugin worker`), so the findings below are based on code inspection plus the existing tests already in the repo.

## Findings

### 1. High: expired Stripe subscriptions are never downgraded to free-tier limits

- Epic/story: Epic 5, Stories 5.1 and 5.4.
- Evidence:
  - Story 5.4 requires access until the current billing period ends and then a downgrade to Free: `docs/epics.md:2827-2828`.
  - The Stripe delete path only writes `status: 'expired'` and `cancelledAt`; it does not change `tier` or the quota pool: `apps/api/src/routes/stripe-webhook.ts:187-206`.
  - The only quota-pool adjustment in the Stripe webhook route happens on active subscription updates when tier metadata is present: `apps/api/src/routes/stripe-webhook.ts:176-183`.
  - Metering reads `monthlyLimit` / `dailyLimit` and decrements quota without checking subscription status: `apps/api/src/middleware/metering.ts:146-195`.
- Impact:
  - A Stripe-backed subscription can reach `expired` state while still retaining its previous paid quota ceiling.
  - Because metering ignores `status`, this becomes an entitlement leak on the preserved web-billing path.

### 2. High: family add/remove endpoints can re-parent arbitrary profiles across accounts

- Epic/story: Epic 5, Story 5.5.
- Evidence:
  - The request schemas accept only raw UUIDs (`profileId`, `newAccountId`) and no invite/ownership proof: `packages/schemas/src/billing.ts:76-86`.
  - The routes pass those identifiers straight into the service layer: `apps/api/src/routes/billing.ts:492-506` and `apps/api/src/routes/billing.ts:527-542`.
  - `addProfileToSubscription()` updates any row matching `profiles.id = profileId` to `accountId: sub.accountId` without verifying the source account or any invitation flow: `apps/api/src/services/billing.ts:1251-1284`.
  - `removeProfileFromSubscription()` trusts a caller-supplied `newAccountId` and rewrites the profile to that account after only checking that the profile is currently in the family: `apps/api/src/services/billing.ts:1296-1338`.
- Impact:
  - The backend currently models family membership as direct account reassignment, not a controlled join/leave workflow.
  - If a caller can obtain UUIDs, they can move profiles across account boundaries without defense-in-depth ownership checks or an audit trail.

### 3. High: the shipped free-tier limits still use 100/month, not the 50/month cap Epic 5 specifies

- Epic/story: Epic 5, Stories 5.2 and 5.3.
- Evidence:
  - The reverse-trial spec says Day 29+ becomes Free tier at `50/month`, and upgrade prompts should trigger at the Free `50/month` cap: `docs/epics.md:2781` and `docs/epics.md:2802`.
  - The core tier config still defines Free as `monthlyQuota: 100`: `apps/api/src/services/subscription.ts:25-33`.
  - Free defaults in the billing API also return `monthlyLimit: 100` / `remainingQuestions: 100`: `apps/api/src/routes/billing.ts:87-89` and `apps/api/src/routes/billing.ts:331-333`.
  - The learner subscription screen hard-codes `free: '100 questions/month'`: `apps/mobile/src/app/(learner)/subscription.tsx:57`.
  - `getUpgradePrompt()` is documented as the Free `50/month` trigger, but the actual condition is `usedThisMonth >= monthlyLimit`, so it inherits the incorrect `100` threshold from config: `apps/api/src/services/billing.ts:1127` and `apps/api/src/services/billing.ts:1149-1153`.
- Impact:
  - The Day 29+ reverse-trial landing is materially looser than the product contract.
  - Free-to-Plus upgrade prompting is delayed until 100 questions instead of the specified 50, which changes the monetization behavior of the epic.

### 4. Medium: trial warning and soft-landing push notifications are sent to `accountId`, not `profileId`

- Epic/story: Epic 5, Story 5.2.
- Evidence:
  - Story 5.2 requires trial expiry warnings: `docs/epics.md:2777`.
  - The trial-expiry job sends `profileId: trial.accountId` for both pre-expiry warnings and soft-landing messages: `apps/api/src/inngest/functions/trial-expiry.ts:104-117` and `apps/api/src/inngest/functions/trial-expiry.ts:146-159`.
  - `sendPushNotification()` expects an actual profile id and immediately looks up the push token by `payload.profileId`: `apps/api/src/services/notifications.ts:80-85`.
  - `getPushToken()` is keyed by `notificationPreferences.profileId`, not account id: `apps/api/src/services/settings.ts:366-372`.
  - The existing tests encode the same mismatch by asserting `profileId: 'acc-3'` and `profileId: 'acc-4'`: `apps/api/src/inngest/functions/trial-expiry.test.ts:194` and `apps/api/src/inngest/functions/trial-expiry.test.ts:231`.
- Impact:
  - Trial reminders and soft-landing notices will miss the intended device token in normal data shapes.
  - The warning flow looks implemented in code and tests, but it is keyed to the wrong entity at runtime.

### 5. Medium: the BYOK waitlist exists server-side but is completely hidden in the mobile subscription UI

- Epic/story: Epic 5, Story 5.4.
- Evidence:
  - Story 5.4 explicitly requires a BYOK waitlist entry point: `docs/epics.md:2818` and `docs/epics.md:2829`.
  - The API route exists: `apps/api/src/routes/billing.ts:563-570`.
  - The mobile mutation hook exists: `apps/mobile/src/hooks/use-subscription.ts:222-234`.
  - The learner subscription screen comments out the hook import, state, submit handler, and the entire form block: `apps/mobile/src/app/(learner)/subscription.tsx:33`, `apps/mobile/src/app/(learner)/subscription.tsx:470-490`, `apps/mobile/src/app/(learner)/subscription.tsx:667-675`, and `apps/mobile/src/app/(learner)/subscription.tsx:1026-1057`.
- Impact:
  - There is no user-facing path to join the waitlist from the app.
  - FR114 is only partially implemented at the API layer.

## No new findings called out in these areas

- Epic 5 RevenueCat purchase/restore hooks, top-up credit grants, KV-backed quota reads, and the child-trial paywall all look materially wired up.
- Epic 6 still appears intentionally deferred rather than half-shipped. `docs/epics.md:2900-2963` and `docs/architecture.md:47` / `docs/architecture.md:1138` describe it as v1.1-only, and a repo search across `apps/*` and `packages/*` for `pedagogy_mode`, `Four Strands`, `CEFR`, `FSI`, `comprehensible input`, and `fluency drill` returned no implementation hits outside docs.

---

# Epic 9 + Epic 10 Code Review Findings

Date: 2026-04-02

## Scope

- Reviewed Epic 9 expectations from `docs/epics.md` against the current RevenueCat webhook flow, mobile subscription screen, and related billing hooks in `apps/api` and `apps/mobile`.
- Reviewed Epic 10 partial / must-ship stories against the shipped consent, session-summary, session-classification, and Expo config code paths.
- This pass is based on code inspection. I did not rerun Jest after the earlier targeted test attempt failed during plugin-worker startup.

## Findings

### 1. High: RevenueCat cancellation loses the cancel-at-period-end state the mobile UI depends on

- Epic/story: Epic 9, Story 9.5.
- Evidence:
  - Story 9.5 requires cancellation to remain effective only at the end of the billing period, with status shown in-app from the subscription state: `docs/epics.md:3418-3420`.
  - The RevenueCat cancellation handler immediately writes `status: 'cancelled'` plus `cancelledAt`, rather than keeping an `active` row with a scheduled end-of-period cancellation: `apps/api/src/routes/revenuecat-webhook.ts:270-286`.
  - The billing API only exposes `cancelAtPeriodEnd` when `subscription.cancelledAt !== null && subscription.status === 'active'`: `apps/api/src/routes/billing.ts:107-117`.
  - The learner subscription screen uses `cancelAtPeriodEnd` to render the `Cancelling` badge, the `Access until ...` copy, and the cancellation notice; otherwise it falls back to `hasActiveSubscription ? 'Active' : status` and `Renews ...`: `apps/mobile/src/app/(learner)/subscription.tsx:516-517` and `apps/mobile/src/app/(learner)/subscription.tsx:796-826`.
- Impact:
  - A store-side cancellation that should read as "cancelling at period end" is not surfaced that way through the API.
  - While RevenueCat still reports an active entitlement, the app can show `Active` plus `Renews ...` even though the subscription has already been cancelled.

### 2. Medium: successful mobile purchases do not refresh the API-backed subscription and usage state

- Epic/story: Epic 9, Story 9.3.
- Evidence:
  - Story 9.3 requires the purchase result to update local state immediately: `docs/epics.md:3357-3366`.
  - The subscription screen derives the displayed plan and quota from API hooks (`useSubscription()` / `useUsage()`) and reads RevenueCat entitlement state separately via `useCustomerInfo()`: `apps/mobile/src/app/(learner)/subscription.tsx:475-489` and `apps/mobile/src/app/(learner)/subscription.tsx:507-517`.
  - `handlePurchase()` only awaits the purchase mutation and shows a success alert; it does not refetch API-side subscription or usage data: `apps/mobile/src/app/(learner)/subscription.tsx:523-527`.
  - `usePurchase()` invalidates only the RevenueCat `customerInfo` query: `apps/mobile/src/hooks/use-revenuecat.ts:150-174`.
  - The top-up flow explicitly polls and invalidates usage until webhook confirmation arrives, which highlights that the subscription purchase path has no equivalent sync step: `apps/mobile/src/app/(learner)/subscription.tsx:622-658`.
- Impact:
  - After a successful store purchase, the screen can keep showing stale tier/quota data until a manual refresh, remount, or later background refetch.
  - RevenueCat entitlement state and API subscription state can temporarily disagree on the same screen.

### 3. Medium: the family-plan purchase UI does not show the real family pool state and its static copy overstates capacity

- Epic/story: Epic 9, Story 9.3.
- Evidence:
  - Story 9.3 requires the family plan UI to show profile count and shared-pool information: `docs/epics.md:3365`.
  - The backend exposes a dedicated family endpoint that returns pool status plus members: `apps/api/src/routes/billing.ts:465-485`.
  - The mobile subscription screen only loads generic subscription, usage, offerings, and customer-info hooks; there is no family-members / pool query in the screen, and the mobile billing hook file exposes no family query alongside those subscription hooks: `apps/mobile/src/app/(learner)/subscription.tsx:475-517` and `apps/mobile/src/hooks/use-subscription.ts:51-125`.
  - The displayed family feature list is fully static and currently says `Up to 5 child profiles`, while the backend family tier config enforces `maxProfiles: 4`: `apps/mobile/src/app/(learner)/subscription.tsx:87-93` and `apps/api/src/services/subscription.ts:46-54`.
- Impact:
  - The Story 9.3 requirement to preserve the family-plan details UX is not met on mobile.
  - The static copy also overpromises family capacity relative to backend enforcement.

### 4. High: consent email delivery status is returned by the API but dropped before the mobile flow can act on it

- Epic/story: Epic 10, Story 10.17.
- Evidence:
  - Story 10.17 requires the API to return delivery status and the mobile flow to branch on `sent` vs `failed`: `docs/epics.md:4313-4335`.
  - The consent service already computes `emailDelivered`, and the route already returns `emailStatus: 'sent' | 'failed'`: `apps/api/src/services/consent.ts:166-245` and `apps/api/src/routes/consent.ts:99-105`.
  - The shared `ConsentRequestResult` schema still only models `{ message, consentType }`: `packages/schemas/src/consent.ts:29-35`.
  - The mobile request hook casts the server response to that reduced schema type: `apps/mobile/src/hooks/use-consent.ts:8-30`.
  - The consent screen ignores the mutation result, always flips to `success`, and the success view hard-codes `We sent a consent link to ...`: `apps/mobile/src/app/consent.tsx:62-76` and `apps/mobile/src/app/consent.tsx:188-215`.
- Impact:
  - Email delivery failures are now detectable at the API boundary but still invisible in the app.
  - The flow continues to show a false-success screen even when the backend explicitly knows delivery failed.

### 5. High: `privacyPolicyUrl` is still missing from the Expo app config

- Epic/story: Epic 10, Story 10.14.
- Evidence:
  - Story 10.14 marks the missing `privacyPolicyUrl` as the remaining launch-blocking config gap: `docs/epics.md:4200` and `docs/epics.md:4234`.
  - `apps/mobile/app.json` contains the Expo app metadata, privacy manifests, and plugins, but there is still no `privacyPolicyUrl` field anywhere in the config: `apps/mobile/app.json:1-112`.
- Impact:
  - The App Store submission/compliance requirement remains open in code, not just in documentation.
  - Epic 10.14 is still materially partial even though the Sentry gating work appears to be present.

### 6. Medium: the rating-prompt hook exists but is never integrated into the session-summary flow

- Epic/story: Epic 10, Story 10.18.
- Evidence:
  - Story 10.18 requires `session-summary/[sessionId].tsx` to call `useRatingPrompt()` / `onSuccessfulRecall()` before navigating home: `docs/epics.md:4351-4375`.
  - The hook exists and encapsulates the recall-count, account-age, cooldown, and `StoreReview.requestReview()` logic: `apps/mobile/src/hooks/use-rating-prompt.ts:31-104`.
  - A repo search only finds `useRatingPrompt` / `onSuccessfulRecall` inside the hook and its tests, not in the session-summary screen or other runtime callers: `rg -n "useRatingPrompt|onSuccessfulRecall" apps/mobile/src`.
  - The session-summary screen handles submit/continue navigation directly with no rating-hook import or call: `apps/mobile/src/app/session-summary/[sessionId].tsx:124-209`.
- Impact:
  - The review prompt never fires in production despite the trigger logic being implemented.
  - Story 10.18 remains dead code rather than a shipped user-facing behavior.

### 7. Medium: ambiguous first-message subject classification still falls straight through to freeform

- Epic/story: Epic 10, Story 10.22.
- Evidence:
  - Story 10.22 requires ambiguous classifications to trigger a natural confirmation / picker, with freeform fallback reserved for no-match cases: `docs/epics.md:4575-4601`.
  - The session screen calls subject classification on the first message, but any result other than a single high-confidence match just toggles chip state and proceeds without a subject; the code comment is explicit: `Ambiguous / no match → proceed without subject (freeform)`: `apps/mobile/src/app/(learner)/session/index.tsx:671-692`.
- Impact:
  - Multiple-candidate cases skip the required confirmation step entirely.
  - Ambiguous conversations are handled the same as true no-match fallback, so sessions are less likely to attach to the correct subject.

## No new findings called out in these areas

- Epic 9 RevenueCat SDK usage, restore-purchases flow, manage-billing deep links, and top-up polling after store purchase all look materially wired up.
- Epic 10 consent unification and age-gated Sentry appear materially implemented; the remaining gaps I found are around delivery-status plumbing, App Store config, and unfinished client integrations.
