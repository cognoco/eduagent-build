# Sprint 9 — Billing, Subscriptions & Trial Management

## Goal
Complete Stripe integration: checkout, webhooks, subscription lifecycle, quota enforcement, and mobile billing UI.

## Current State (post-Sprint 7)
- `routes/billing.ts` — 5 endpoints returning hardcoded mock data (all TODO)
- `routes/stripe-webhook.ts` — skeleton returning `{ received: true }`
- `services/subscription.ts` — solid pure business logic (state machine, tiers, transitions) ✓
- `services/trial.ts` — solid pure business logic (trial phases, warnings, soft landing) ✓
- `services/metering.ts` — solid pure business logic (warning levels, quota check, upgrade math) ✓
- `inngest/functions/trial-expiry.ts` — stub with TODO steps
- `inngest/functions/payment-retry.ts` — stub with TODO bodies
- `packages/database/src/schema/billing.ts` — complete schema (subscriptions, quota_pools, top_up_credits, byok_waitlist)
- `packages/schemas/src/billing.ts` — Zod schemas for billing
- `config.ts` — missing all Stripe env vars
- No Stripe SDK anywhere in codebase
- No metering middleware
- No mobile billing UI

---

## Phase 1: Stripe Foundation & Config

**Goal:** Establish Stripe SDK, typed config, Workers KV helpers, and DB service layer.

### Changes

1. **Modify: `apps/api/src/config.ts`** — Add Stripe env vars:
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`
   - `STRIPE_PRICE_FAMILY_MONTHLY`, `STRIPE_PRICE_FAMILY_YEARLY`
   - `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`
   - `STRIPE_CUSTOMER_PORTAL_URL` (optional)

2. **Modify: `.env.example`** — Add Stripe env var placeholders

3. **Modify: `apps/api/src/index.ts`** — Add Stripe + KV bindings to `Bindings` type

4. **New: `apps/api/src/services/billing.ts`** — DB-layer billing service:
   - `getSubscriptionByAccountId(db, accountId)`
   - `createSubscription(db, accountId, tier, stripeCustomerId, stripeSubscriptionId)`
   - `updateSubscriptionFromWebhook(db, stripeSubscriptionId, updates)` — idempotent
   - `getOrCreateStripeCustomer(db, accountId)`
   - `linkStripeCustomer(db, accountId, stripeCustomerId)`
   - `getQuotaPool(db, subscriptionId)`
   - `resetMonthlyQuota(db, subscriptionId, newLimit)`

5. **New: `apps/api/src/lib/stripe.ts`** — Stripe SDK factory:
   - `createStripeClient(secretKey)`
   - `verifyWebhookSignature(payload, signature, secret)`

6. **New: `apps/api/src/lib/kv.ts`** — Workers KV helpers:
   - `writeSubscriptionStatus(kv, accountId, status)` — JSON + KV put with TTL
   - `readSubscriptionStatus(kv, accountId)` — KV get + parse

### Tests
- `billing.test.ts` — mock DB tests for all service functions
- `stripe.test.ts` — mock Stripe SDK
- `kv.test.ts` — mock KV namespace

### Verification
- All new tests pass
- TypeScript compiles
- Config validation catches missing Stripe vars

---

## Phase 2: Webhook Handler & Subscription Sync

**Goal:** Complete Stripe webhook processing with idempotent event handling.

### Changes

1. **Rewrite: `apps/api/src/routes/stripe-webhook.ts`**
   - Signature verification via `verifyWebhookSignature()`
   - Event dispatch: `customer.subscription.created`, `.updated`, `.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
   - Idempotent: check `lastStripeEventTimestamp`, skip older events
   - On `invoice.payment_failed`: emit Inngest event `app/payment.failed`
   - Update Workers KV on every state change

2. **Implement: `apps/api/src/inngest/functions/payment-retry.ts`**
   - Load subscription, check attempt count
   - >= 3 attempts: cancel subscription, notify
   - < 3: wait 24h, update counter

3. **Implement: `apps/api/src/inngest/functions/trial-expiry.ts`**
   - Query expired trials → transition to `expired`, set free-tier quota
   - Query 3-day/1-day warnings → send notifications
   - Query soft-landing phase → send messages
   - Update Workers KV

4. **New: `apps/api/src/inngest/functions/quota-reset.ts`**
   - Daily cron: reset `used_this_month = 0` where `cycle_reset_at <= now()`

### Tests
- Webhook: signature valid/invalid, each event type, idempotency, KV writes
- Payment retry: downgrade after 3 attempts, retry delay
- Trial expiry: expired trial handling, warning notifications
- Quota reset: cycle reset logic

### Verification
- Webhook rejects invalid signatures (400)
- Each event type updates DB correctly
- Out-of-order events skipped
- All existing tests still pass

---

## Phase 3: Checkout, Cancellation & Customer Portal

**Goal:** Wire billing routes to real Stripe Checkout. Auto-create trial on registration.

### Changes

1. **Wire: `apps/api/src/routes/billing.ts`** — All endpoints:
   - `GET /subscription` → `billing.getSubscriptionByAccountId()`
   - `POST /subscription/checkout` → Stripe Checkout Session creation
   - `POST /subscription/cancel` → `stripe.subscriptions.update(id, { cancel_at_period_end: true })`
   - `POST /subscription/top-up` → Stripe Payment Intent
   - `GET /usage` → `billing.getQuotaPool()` + metering
   - `POST /byok-waitlist` → insert into DB
   - **New: `POST /subscription/portal`** → Stripe Customer Portal session

2. **Modify: `apps/api/src/services/account.ts`**
   - On new account creation: auto-create trial subscription (FR108)
   - 14-day trial, Plus-tier limits (500/month)

3. **Add schemas: `packages/schemas/src/billing.ts`**
   - `portalResponseSchema`, `checkoutResponseSchema`, `cancelResponseSchema`

### Tests
- Route tests mock billing service + Stripe SDK
- Account service tests verify trial auto-creation

### Verification
- Checkout returns real Stripe URL (test mode)
- Cancel sets `cancel_at_period_end`
- Portal redirect works
- New accounts start in trial

---

## Phase 4: Metering Middleware & Quota Enforcement

**Goal:** Real quota enforcement. PostgreSQL `decrement_quota` function. Family billing.

### Changes

1. **New: `apps/api/src/middleware/metering.ts`**
   - Read subscription from KV (fast) or DB (fallback, backfill KV)
   - Only applies to LLM-consuming routes (session messages)
   - Call `decrement_quota` before LLM call
   - If exceeded: return 403 `QUOTA_EXCEEDED` with paywall data
   - On LLM failure: refund via `increment_quota`

2. **New SQL: `decrement_quota` PostgreSQL function**
   - Lock quota pool row (FOR UPDATE — prevents family pool races)
   - Decrement monthly quota or fall back to top-up credits (FIFO)

3. **New SQL: `increment_quota` PostgreSQL function** — Refund

4. **Modify: `apps/api/src/services/billing.ts`** — Add family billing:
   - `getSubscriptionForProfile(db, profileId)` — resolve profile → account → subscription
   - `getProfileCountForSubscription(db, subscriptionId)`
   - `canAddProfile(db, subscriptionId)`

5. **Add schema: `packages/schemas/src/billing.ts`**
   - `quotaExceededSchema` for 403 response body

### Tests
- Metering middleware: under limit, warning, exceeded, KV vs DB path, refund
- Family pool concurrency test
- `decrement_quota` SQL function (integration test)

### Verification
- Free tier hits 50/month cap → 403 with upgrade prompt
- Plus tier hits 500/month → can purchase top-ups
- Family shared pool tracks correctly across profiles
- LLM failure refunds quota

---

## Phase 5: Mobile Billing UI & Integration Tests

**Goal:** Subscription management screen on mobile.

### Changes

1. **New: `apps/mobile/src/hooks/use-subscription.ts`**
   - `useSubscription()`, `useUsage()`
   - `useCreateCheckout()`, `useCancelSubscription()`, `useCreatePortalSession()`
   - `usePurchaseTopUp()`, `useJoinByokWaitlist()`

2. **New: `apps/mobile/src/app/(learner)/subscription.tsx`**
   - Current plan display, usage meter, trial banner
   - Upgrade section (tier comparison, Stripe Checkout redirect)
   - Top-up, cancel, manage billing buttons
   - BYOK waitlist form

3. **Modify: `apps/mobile/src/app/(learner)/more.tsx`**
   - Wire "Subscription" row to real data + navigation

4. **New: `apps/mobile/src/components/UsageMeter.tsx`**
   - Progress bar with threshold colors (green → yellow → red)

### Integration Tests
- New account → trial subscription auto-created
- Webhook → subscription state updated in DB and KV
- Metering enforces quota after trial expiry
- Top-up credits consumed FIFO after monthly quota exhausted
- Mid-cycle upgrade adjusts remaining quota

### Verification
- Subscription screen displays real data
- Checkout redirects to Stripe (test mode)
- Usage meter updates after session exchanges
- All tests pass

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 (Webhooks)
        ──→ Phase 3 (Checkout) [can partially parallel with Phase 2]
Phase 3 ──→ Phase 4 (Metering)
Phase 1-4 ──→ Phase 5 (Mobile UI)
```

## Architecture Rules Compliance
- Services never import from `hono`
- All routes prefixed `/v1/`
- Zod validation on every input
- Named exports only
- Co-located tests
- Inngest for all async work
- Never call Stripe during learning sessions — reads from local DB/KV only
- Typed config for all env vars
