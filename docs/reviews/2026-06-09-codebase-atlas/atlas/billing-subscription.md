# Billing, subscription, paywall & quota — Functional Atlas

> Read-only audit, branch `new-llm`, 2026-06-09. Every claim cites `file:line`. Monetization in this app is **mobile-IAP-first via RevenueCat**; Stripe is fully wired server-side but **dormant** (kept for a future web client). All citations verified against source.

---

## Screens (route -> purpose)

There is **exactly one user-facing billing screen** plus one in-screen branch (the child paywall). Everything else is a card/section *inside* that single screen, or an inline component rendered in other flows.

| Route / component | Where | Purpose | Gating |
|---|---|---|---|
| **`/(app)/subscription`** (`SubscriptionScreen`) | `apps/mobile/src/app/(app)/subscription.tsx:89` | The one billing hub. Renders `SubscriptionContent` for ALL users (not wrapped in `ParentOnly` so children can reach the paywall branch). `subscription.tsx:76-91` | none at screen root; content branches by `isOwner` |
| **`ChildPaywall`** (branch inside the same screen) | `subscription.tsx:647-662` → `_subscription/_components/ChildPaywall.tsx:39` | Child-friendly dead-end when a non-owner's sub is expired/cancelled OR quota is exhausted. "Notify parent", browse library, see progress, go home. | `isChild && (trialOrExpired || quotaExhausted)` |
| `SubscriptionHeader` | `_subscription/_components/SubscriptionHeader.tsx:5` | Back button (`router.replace('/(app)/more')`) + "Subscription" title. Hardcoded English. | — |
| `SubscriptionUsageCard` | `_subscription/_components/SubscriptionUsageCard.tsx:17` | "Usage this month" meter, daily-usage card (free tier), top-up credits line, per-profile breakdown, family aggregate, reset/renew dates. | rendered when `usage` present |
| `PackageOption` | `_subscription/_components/PackageOption.tsx:14` | One purchasable RevenueCat package row (title, price/period, subscribe CTA). | not-current-plan & not-purchasing |
| `QuotaExceededCard` | `apps/mobile/src/components/session/QuotaExceededCard.tsx:17` | In-chat 402 handler. Owner sees Upgrade + Top-up CTAs (both → `/(app)/subscription`); child sees "Notify parent" + go-home. | `isOwner` prop |

### Stripe landing pages (web, server-rendered HTML — not RN screens)
- `GET /billing/success` — `apps/api/src/routes/billing.ts:980` — post-checkout success page, deep-links `mentomate://home`.
- `GET /billing/cancel` — `billing.ts:1034` — post-checkout cancel page.

Both are dormant (only reachable from Stripe checkout, which mobile never invokes).

---

## Capabilities (user task -> backend process file:line)

Every action a user can take in this domain, with the exact backend path.

### On `/(app)/subscription` (owner / solo)

| User task | Frontend handler | Backend route → service |
|---|---|---|
| View current plan/status/limits | `useSubscription()` `hooks/use-subscription.ts:75` | `GET /subscription` `billing.ts:93` → `getSubscriptionByAccountId` + `getEffectiveAccessForSubscription` + `getOrProvisionProfileQuotaUsage`/`getQuotaPool` `billing.ts:110-162`. **Owner-gated** `assertOwnerProfile` `billing.ts:103` (BUG-644) |
| View usage meter (monthly + daily + top-up + per-profile breakdown) | `useUsage()` `use-subscription.ts:96` | `GET /usage` `billing.ts:430` → `getUsageBreakdownForProfile`, `resolveWarningLevel`, `calculateRemainingQuestions`, `buildUsageDateLabels` `billing.ts:564-601` |
| Buy a subscription package | `handlePurchase` `subscription.tsx:313` → `usePurchase()` `hooks/use-revenuecat.ts:190` → `Purchases.purchasePackage()` | **No direct API call.** Store charges → RevenueCat webhook `POST /revenuecat/webhook` `routes/revenuecat-webhook.ts:138` → `handleInitialPurchase` `revenuecat-webhook.ts:321`. Frontend then **polls** `GET /subscription` until `tier !== 'free'` `subscription.tsx:356-369` |
| Buy 500 top-up credits | `handleTopUp` `subscription.tsx:439` → `usePurchase()` w/ consumable pkg `subscription.tsx:492` | Store → webhook `NON_RENEWING_PURCHASE` `revenuecat-webhook.ts:344` → `handleNonRenewingPurchase` → `purchaseTopUpCredits` `services/billing/top-up.ts:112`. Polls `GET /usage` for `topUpCreditsRemaining` increase `subscription.tsx:518-525` |
| Restore purchases (App Store 3.1.1) | `handleRestore` `subscription.tsx:230` → `useRestorePurchases()` `use-revenuecat.ts:229` → `Purchases.restorePurchases()` | Polls `GET /subscription` `subscription.tsx:247-260`. Native only (hidden on web `subscription.tsx:1121`, BUG-606) |
| Manage billing | `handleManageBilling` `subscription.tsx:408` → `openSubscriptionManagement()` (deep link to App Store / Play subscriptions) | **No API.** OS-level. Web shows static info row `subscription.tsx:1252` (BUG-916) |
| Cancel subscription | **Not in the mobile UI** — only via store management deep link. Stripe `POST /subscription/cancel` `billing.ts:287` exists but dormant. |
| Join BYOK waitlist | `handleByokSubmit` `subscription.tsx:627` → `useJoinByokWaitlist()` `use-subscription.ts:187` | `POST /byok-waitlist` `billing.ts:947` → `addToByokWaitlist`. Persistent "joined" flag in SecureStore `use-byok-joined-flag.ts` (BUG-399) |
| View family pool & members | `useFamilySubscription()` `use-subscription.ts:114` (enabled only if tier family/pro) | `GET /subscription/family` `billing.ts:799` → `getFamilyPoolStatus` + `listFamilyMembers`. Owner-gated `billing.ts:809` (BUG-645) |
| Remove a family member | `handleRemoveFamilyProfile` `subscription.tsx:579` → `useRemoveFamilyProfile()` `use-subscription.ts:203` | `POST /subscription/family/remove` `billing.ts:888` → `removeProfileFromSubscription`. Owner-gated `billing.ts:899` |
| Contact support | `handleContactSupport` `subscription.tsx:566` → `mailto:support@mentomate.app` | none |

### On `ChildPaywall` (non-owner child)

| Task | Handler | Backend |
|---|---|---|
| Notify parent to subscribe | `handleNotify` (subscription mode) `ChildPaywall.tsx:156` → `useNotifyParentSubscribe()` | settings hook; 24h SecureStore cooldown `child-paywall-helpers.ts`, `NOTIFY_COOLDOWN_MS` `constants.ts:75` |
| Notify parent of quota cap | `handleNotify` (quota mode) `ChildPaywall.tsx:130` → `useNotifyParentChildCap()` | child-cap notification hook |
| Browse library / see progress / go home | `router.push` `ChildPaywall.tsx:300,314,328` | navigation only |

### Quota enforcement at point of use (the real "asked to pay" trigger)

This is where most users actually *hit* billing — not the subscription screen, but mid-session:

- **`meteringMiddleware`** `apps/api/src/middleware/metering.ts:512` gates **every LLM-consuming route** (session messages/stream, recall-bridge, evaluate-depth, quiz rounds, dictation, OCR, filing, assessments, summary, curriculum gen, subject resolve/classify — full allowlist `metering.ts:140-229`). It: reads KV→DB quota, `checkQuota()` `metering.ts:704` (pure logic in `services/metering.ts:100`), then atomic `decrementQuota()` `services/billing/metering.ts:234`, returns **402 `QUOTA_EXCEEDED`** with `upgradeOptions` `metering.ts:716-741` on exhaustion, refunds on handler throw/4xx `metering.ts:842-911`.
- Mobile classifies 402 → `QuotaExhaustedError` at the api-client boundary, surfaced as `QuotaExceededCard` in-session (owner → upgrade CTA to `/(app)/subscription`).

---

## Navigation depth map

Tab roots: home / library / progress / more (learner) — guardian swaps in recaps. The subscription screen is **not a tab**; it is always reached via push.

| Capability | Path from tab root | Depth | Flag? |
|---|---|---|---|
| Open subscription screen | **More tab → Account → "Subscription" row** | **3 levels** | `more/account.tsx:103` `router.push('/(app)/subscription')`, gated by `navigationContract.gates.showBilling` |
| Open subscription (from quota wall) | In-session 402 → `QuotaExceededCard` "Upgrade" | 1 tap *from the dead-end* (but session itself is ~3-4 deep) | `QuotaExceededCard.tsx:64` |
| Open subscription (from add-child limit) | Create-profile → "Upgrade required" alert → "See plans" | deep modal-on-alert | `create-profile.tsx:424` |
| Open subscription (from assessment quota error) | Assessment error fallback → "Upgrade" | deep | `practice/assessment/index.tsx:374` |
| View usage meter | subscription screen, scroll | **3 + scroll** | — |
| Buy a plan (PackageOption) | subscription screen → scroll to "Plans" → tap package → **native store sheet** → poll | **3 + scroll + OS modal** | offerings must load |
| Buy top-up | subscription screen → scroll to "Need more questions?" → tap → store sheet → poll | **3 + scroll + OS modal** | `isPaidTier` only `subscription.tsx:1180` |
| Restore purchases | subscription screen → scroll to bottom | **3 + scroll** | native only |
| Manage billing | subscription screen → "Manage" → OS subscription page | **3 + OS handoff** | `canManageBilling` `subscription-derived-state.ts:25` |
| BYOK waitlist | subscription screen → scroll to very bottom | **3 + deep scroll** | always shown |
| Family pool / remove member | subscription screen → "Family pool" section | **3 + scroll** | family/pro tier + owner |
| Child notify parent | quota wall OR child paywall | varies | non-owner |

**Flag-worthy ( > 2 levels):** *Every* billing capability is ≥3 levels deep (More→Account→Subscription) and then **further gated by vertical scroll position** inside one very long `ScrollView` (`subscription.tsx:762-1327`, ~565 lines of JSX). The single screen stacks: trial banner → current plan → cancellation notice → usage meter → daily card → family pool → plans/offerings → restore → top-up → manage → BYOK waitlist. That is **11 distinct sections** a user must scroll through.

---

## Backend processes & data model

### Routes (all mounted at `/` in `apps/api/src/index.ts:278-280`)
- `billingRoutes` `routes/billing.ts` — 11 endpoints: `GET /subscription`, `POST /subscription/checkout|cancel|top-up|portal`, `GET /usage`, `GET /subscription/status`, `GET /subscription/family`, `POST /subscription/family/add|remove`, `POST /byok-waitlist`, `GET /billing/success|cancel`.
- `stripeWebhookRoute` `routes/stripe-webhook.ts:55` — `POST /stripe/webhook` (signature-verified, dormant).
- `revenuecatWebhookRoute` `routes/revenuecat-webhook.ts:138` — `POST /revenuecat/webhook` (Bearer-token, **the live money path**).

### Tier config — single source of truth `services/subscription.ts:43-119`
| Tier | Monthly | Daily | maxProfiles | quotaModel | price/mo | top-up |
|---|---|---|---|---|---|---|
| **free** | 100 | **10** | 2 | per-profile | 0 | n/a |
| **plus** | **700** | null | 2 | per-profile | 18.99 | €10/500 |
| **family** | 1500 | null | 4 | shared-pool | 28.99 | €5/500 |
| **pro** | 3000 | null | 6 | shared-pool | 48.99 | €5/500 |

> NOTE drift: CLAUDE/the brief say Plus = 700/mo (correct, `subscription.ts:78`). The metering middleware header comment says "free…50 questions/month" `metering.ts:13` — **stale comment**, the actual free monthlyQuota is **100** `subscription.ts:45`. Also an **AI-upgrade add-on** (€15/mo, premium LLM) exists `subscription.ts:130` but has **no purchase UI** in this domain.

### Quota model split
- **per-profile** (free, plus): each profile has its own `profileQuotaUsage` row; owner vs child get different caps (`ownerMonthlyQuota`/`childMonthlyQuota` — child on a Plus account is clamped to 100/10 `subscription.ts:79-81`).
- **shared-pool** (family, pro): one `quotaPools` row for the account; `supportsProfileBreakdown` true so usage can be shown per-profile but drawn from one pool.

### Core data/tables touched
`subscriptions`, `quotaPools`, `profileQuotaUsage`, `topUpCredits`, `usageEvents` (audit row per decrement/refund `metering.ts:161`). KV: `SUBSCRIPTION_KV` caches status for the hot metering path.

### Metering hot path `services/billing/metering.ts`
- `decrementQuota` `:234` dispatches per-profile vs shared-pool; atomic SQL WHERE guards prevent TOCTOU over-decrement; FIFO top-up fallback `:378`; daily-cap hard stop `:366`; ownership-mismatch returns `profile_mismatch` + emits `app/billing.ownership.mismatch` `:67`.
- `incrementQuota`/`safeRefundQuota` `:858,:1081` — refund on LLM failure, routes to the same pool (monthly vs top_up) the decrement consumed (`CR-2026-05-19-C6`).
- Child quota exhaustion emits `app/billing.profile_quota.exhausted` `:34` (drives parent notification).

### Webhook handlers `services/billing/`
- RevenueCat: `handleInitialPurchase/Renewal/Cancellation/Expiration/BillingIssue/SubscriberAlias/ProductChange/Uncancellation/NonRenewingPurchase` (`revenuecat-webhook-handler.ts`). Idempotency via `isRevenuecatEventProcessed` + per-txn unique index on top-ups. SANDBOX-in-prod rejected `revenuecat-webhook.ts:217`.
- Stripe: `handleSubscriptionEvent/Deleted/CheckoutCompleted/PaymentFailed/Succeeded` (`stripe-webhook-handler.ts`). Test-mode-in-prod rejected `stripe-webhook.ts:100`.
- State machine `isValidTransition` `subscription.ts:245`; effective-access (grace-period, cancel-at-period-end) `resolveEffectiveAccessTier` `subscription.ts:178`.

### Inngest (background billing jobs)
`trial-expiry`, `trial-expiry-failure-observe`, `billing-trial-subscription-failed`, `quota-reset` (daily 01:00 UTC reset + monthly cycle rollover `services/billing/trial.ts:89,124`), `topup-expiry-reminder`, `topup-expiry-reminder-send`.

---

## Complexity signals & redesign notes

1. **One 1,330-line screen doing 11 jobs.** `subscription.tsx` mixes: plan display, status badges, trial banner, cancellation notice, usage meter, daily card, family pool + member removal, RevenueCat offerings purchase, static tier fallback, restore, top-up, manage-billing, BYOK waitlist. The component carries **8 distinct polling/in-flight state machines** (`topUpPurchasing`, `topUpPolling`, `restorePolling`, `purchasePolling`, plus cancel refs). This is the prime candidate for radical simplification.

2. **Buried purchase flow.** To upgrade, a user must: More → Account → Subscription → scroll past plan/usage/family → find "Plans" → tap package → OS sheet → wait through a poll with up-to-30s "still confirming" message `subscription.tsx:526`. The actual money action is 3 navigations + a scroll + an OS modal + an async poll deep.

3. **Two parallel "you're out of quota" UIs.** `ChildPaywall` (full screen, `subscription.tsx:647`) AND `QuotaExceededCard` (in-chat, `QuotaExceededCard.tsx`) both handle exhaustion with different copy, different recovery, different "notify parent" implementations. A child can see either depending on entry path.

4. **Four+ entry points into the same screen, each with bespoke pre-amble:** account row `account.tsx:103`, in-chat quota card `QuotaExceededCard.tsx:64`, add-child limit alert `create-profile.tsx:424`, assessment quota error `practice/assessment/index.tsx:374`, clone-from-child flow (`use-clone-from-child`). Each constructs its own alert/CTA copy.

5. **Static-vs-live offerings dual rendering.** When RevenueCat offerings load → `PackageOption` rows; when they don't (web, store blocked, error) → a *completely separate* static tier-comparison block `subscription.tsx:1028-1114` with its own retry/contact-support buttons. Two code paths for "show plans."

6. **Family/Pro are half-hidden.** `BUG-899`: only Free+Plus are shown as upgrade options `constants.ts:19-25`; Family/Pro only appear (read-only) if you already own them `constants.ts:34-48`, because their store SKUs aren't approved for public listing. So the screen's "Plans" section deliberately under-shows the catalog.

7. **Dormant Stripe surface inflates the model.** 5 Stripe endpoints (`checkout/cancel/top-up/portal` + 2 landing pages) + full webhook handler + price-resolution service exist but are unreachable from the mobile app. Anyone reading the code sees "web billing" that doesn't run.

8. **AI-upgrade add-on with no UI.** `AI_UPGRADE_ADDON` (€15/mo premium LLM `subscription.ts:130`) is referenced by routing/entitlement but has no purchase entry anywhere in this domain — a monetization lever defined but not surfaced.

9. **Hardcoded English leaks.** Many strings bypass i18n: "Current plan" `subscription.tsx:801`, "Family pool" `:929`, "Need more questions?" `:1183`, "Buy 500 credits" `:1207`, all top-up alert bodies `:472,501,549`, `SubscriptionHeader` "Back"/"Subscription" `:15,17`, remove-family alerts `:582-601`.

10. **Stale 50/month comment** `metering.ts:13` vs real 100/month — a redesign spec writer reading the middleware would get the wrong number.

---

## Overlaps with other domains

- **Usage/quota shown in ≥3 places:** the subscription `SubscriptionUsageCard`, the in-session `QuotaExceededCard`, and the **home screen** — `LearnerScreen.tsx:134` calls `useSubscriptionStatus()` and the comment at `:144` explicitly says "session entry owns subscription/quota gating — never duplicate that logic here." Quota fraction/remaining is also pushed as response headers (`X-Quota-Remaining`, `X-Quota-Warning-Level`) `metering.ts:276` consumed by the session UI.
- **Profile / family management overlap:** "remove family member" lives **inside** the subscription screen `subscription.tsx:579`, but add-child lives in **More** (`more/index.tsx:56`) and create-profile is its own route. Family-pool membership is split across billing (`/subscription/family`) and profile domains.
- **Account/Security domain:** the *entry* to billing is the "Subscription" row inside `more/account.tsx` — same screen that holds Billing/Security gating. The `showBilling` / `showRemoveFamilyMember` gates come from the shared `navigationContract` (`hooks/use-navigation-contract`), so billing visibility is owned by the **navigation-contract** domain, not here.
- **Notifications domain:** child→parent "notify" (subscribe + cap) uses `useNotifyParentSubscribe` / `useNotifyParentChildCap` (settings/notifications hooks), and the server emits `app/billing.profile_quota.exhausted` Inngest events that the notification pipeline consumes.
- **Onboarding / consent:** age/COPPA gating that decides owner-vs-child (and therefore which billing UI shows) is upstream in identity/onboarding; this domain only consumes `activeProfile.isOwner`.
- **LLM routing domain:** tier → `llmTier` (`metering.ts:834`) and the AI-upgrade `premium` entitlement bridge billing into the model-selection/routing domain.

---

### Bottom line for the one-screen redesign
The "screen" is already one screen — the problem is it is **3 navigations deep, 1,330 lines, 11 stacked scroll sections, 8 polling state machines, 2 parallel exhaustion UIs, 4 entry points, and a dormant Stripe shadow.** The redesign lever is: surface the single money action (upgrade / top-up) at the point of need (the quota wall) rather than burying it under More→Account→Subscription→scroll, collapse `ChildPaywall` + `QuotaExceededCard` into one exhaustion component, and drop/relocate the BYOK waitlist, family-member management, and dormant Stripe surfaces out of the critical buy path.
