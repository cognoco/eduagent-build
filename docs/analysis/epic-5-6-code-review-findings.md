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
