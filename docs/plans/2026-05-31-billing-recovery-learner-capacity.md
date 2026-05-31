---
title: Billing Recovery and Learner Capacity - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [billing-3, billing-4, notif-3]
---

# Billing Recovery and Learner Capacity - Implementation Plan

**Goal:** Make paid-access failures and child-cap exhaustion recoverable before
users silently lose access or get stuck waiting for a parent who was never
actually alerted.

**Approach:** Treat `billing-3`, `billing-4`, and `notif-3` as one recovery
plane. RevenueCat billing issues need proactive in-app/push/email notification
with a manage-billing path. Child quota exhaustion needs a real out-of-app
parent alert and an owner action that grants capacity without forcing every
single-child Plus family into the full Family tier.

## Scope

In scope:
- `apps/api/src/services/billing/revenuecat-webhook-handler.ts`
- `apps/api/src/inngest/functions/payment-failed-observe.ts`
- `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts`
- `apps/api/src/services/child-cap-notifications.ts`
- `apps/api/src/services/notifications.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/services/billing/top-up.ts`
- `apps/api/src/middleware/metering.ts`
- `apps/mobile/src/app/(app)/subscription.tsx`
- `apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx`
- `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- `apps/mobile/src/hooks/use-child-cap-notifications.ts`
- API integration tests and mobile focused tests.

Out of scope:
- Replacing RevenueCat or changing store products.
- Identity/org billing migration from account to organization; that is T4 of
  the identity redesign.
- Price packaging decisions for new paid SKUs beyond enabling the product path.

## Product Decisions

- Billing issues are user-visible events, not observe-only telemetry. The app
  sends `app/payment.failed` to a notification function that creates an in-app
  banner and attempts push/email when channels are available.
- Child-cap notification means the parent is alerted out of app. The DB row
  remains the in-app inbox source, but push/email fan-out is part of the flow.
- Single-child extra capacity is implemented as owner-purchased top-up credits
  that can be assigned to a child profile on Plus. The first version does not
  add a new subscription tier; it uses the existing top-up purchase mechanism
  with explicit child allocation and metering consumption.

## Tasks

- [ ] **T1: Turn `app/payment.failed` into a user-facing notification flow.**
  Done when: the Inngest payment-failed handler sends a typed notification event
  to the paying profile, attempts push/email through existing notification
  services, stores an in-app billing-alert row or equivalent existing alert
  record, and includes a manage-billing deep link. Tests prove the current
  observe-only behavior fails and the new handler sends one deduped alert.
  Covers `billing-3`.

- [ ] **T2: Surface past-due state outside the subscription screen.** Done when:
  home/account/subscription entry points show a concise past-due banner for
  owners with `status='past_due'`, the CTA opens the existing manage-billing
  path, and dismissing the banner does not hide future distinct billing issues.
  Mobile tests cover owner-visible and child-hidden states.

- [ ] **T3: Add real parent push/email fan-out for child-cap notifications.**
  Done when: both manual `/notifications/child-cap/notify-parent` and automatic
  `app/billing.profile_quota.exhausted` paths write the existing DB row and also
  call notification delivery for the owner profile; delivery is deduped per
  child/quota window; child UI reports "sent" only after the server accepted the
  fan-out. Tests cover manual, automatic, duplicate, and no-parent/no-token
  paths. Covers `notif-3`.

- [ ] **T4: Add child-allocated top-up capacity for Plus owners.** Done when:
  an owner can allocate purchased top-up credits to a child profile; metering
  consumes allocated child credits after the child's included daily/monthly cap
  is exhausted; owner-only top-ups continue to work; and unauthorized child or
  cross-account allocation is denied. Tests cover allocation, consumption,
  depletion, and cross-profile denial. Covers `billing-4`.

- [ ] **T5: Wire parent action from the child-cap banner.** Done when:
  `ParentHomeScreen` child-cap notification offers a primary action to grant
  capacity (allocate top-up or upgrade), not only dismiss; the child paywall can
  refresh and show capacity restored after the parent acts; tests cover the
  notification-to-action loop.

- [ ] **T6: Add recovery-state observability.** Done when:
  structured metrics or events record billing-alert sent/failed, child-cap
  parent-alert sent/failed, and child-credit allocation consumed; silent
  recovery is not used for billing notification failures.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Payment failed but no push token | `app/payment.failed` with no token | In-app banner and email attempt | Open app or email link to manage billing |
| Payment alert delivery provider fails | Push/email service error | Sentry/metric, in-app banner still persists | Retry through Inngest/backoff |
| Child asks parent repeatedly | Multiple cap hits in same quota window | One parent alert, child sees already sent state | Reset dedupe on next quota window |
| Parent has no actionable purchase path | Store/top-up unavailable | Upgrade/manage plan CTA only | Use existing Family upgrade path |
| Child-credit allocation races metering | Parent allocates while child retries | Atomic consumption prevents negative credits | Retry metering after cache refresh |
| Unauthorized allocation | Non-owner or unrelated profile | Typed 403/404 | Switch to owner profile |

## Verification

Focused checks:

```powershell
pnpm exec nx run api:test --testPathPattern="payment-failed|child-cap|billing|metering|top-up"
Push-Location apps/mobile
pnpm exec jest --findRelatedTests src/app/(app)/subscription.tsx src/app/(app)/_subscription/_components/ChildPaywall.tsx src/components/home/ParentHomeScreen.tsx --no-coverage
pnpm exec tsc --noEmit
Pop-Location
```

Because this touches billing and API behavior, run before commit:

```powershell
pnpm exec nx run api:typecheck
pnpm exec nx test:integration api
```

