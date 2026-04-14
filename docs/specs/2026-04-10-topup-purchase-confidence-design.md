# BILLING-09: Top-Up Purchase Confidence

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` BILLING-09

## Problem

After completing a top-up credit IAP, the app polls `/usage` for up to ~37.5 seconds (15 attempts × 2.5s). During this time, the user sees only "Purchase processing..." with a spinner. No progress indicator, no time estimate, no reassurance messaging. If polling times out, the alert says "Credits will appear shortly" with no explanation. If the user navigates away, polling stops silently and there's no background confirmation.

Additionally, if the RevenueCat offering/package is missing, the error is a bare `Alert.alert('Error', 'Top-up package not available.')` with no retry or support path.

## Current Flow

1. User taps "Buy 500 credits" → store sheet opens
2. Store purchase completes → "Purchase processing..." spinner
3. Poll loop: 15 × (2s sleep → invalidate queries → 500ms sleep → check cache)
4. If `topUpCreditsRemaining` increased → success alert
5. If 15 attempts pass → "Credits will appear shortly" alert

## Solution

### 1. Progress messaging during polling

Replace the static "Purchase processing..." with a two-stage message:

**0-10 seconds:** "Confirming your purchase..."
**10+ seconds:** "Still confirming — this can take up to 30 seconds. Your purchase is safe."

This sets expectations and reassures the user that slowness is normal (webhook delivery varies).

### 2. Improve the timeout fallback

Current: `Alert.alert('Processing', 'Your purchase is being processed. Credits will appear shortly.')`

New: A structured alert with:
- Title: "Purchase confirmed"
- Body: "Your 500 credits are being added. They usually appear within a minute — pull down to refresh your usage."
- Single button: "OK" (dismisses)

The key change is **confidence**: say "confirmed" not "processing." The IAP was completed successfully at the store level — the only delay is webhook delivery. The user's money is spent; don't make them feel uncertain about it.

### 3. Auto-refresh usage on return

If the user navigates away during polling, the usage query's `staleTime` will cause a refetch when they return to the subscription screen. Ensure the `['usage']` query has a short `staleTime` (e.g., 10 seconds) so returning to the screen triggers a fresh check. This is likely already the case, but verify.

### 4. Handle missing package gracefully

Current: `Alert.alert('Error', 'Top-up package not available.')`

New:
- Check if `offerings` is still loading (show spinner instead of error)
- If loaded but package missing: "Top-up credits aren't available right now. Try again later or contact support." with two buttons: "Retry" (refetches offerings) and "OK"
- If `offeringsError` is set: "Couldn't load purchase options. Check your connection and try again." with "Retry" button

### 5. Tighten the polling race condition

The current poll reads `queryClient.getQueryData` 500ms after `invalidateQueries`. This is a race — the refetch may not have completed in 500ms on slow connections. Fix:

```typescript
// Instead of: invalidate → sleep 500ms → read cache
// Do: invalidate → await refetch → read result
const result = await queryClient.fetchQuery({
  queryKey: ['usage', activeProfile?.id],
  staleTime: 0,  // force fresh fetch
});
```

This eliminates the timing race entirely.

## Scope Exclusions

- **WebSocket/SSE for real-time confirmation** — over-engineered for a flow that happens rarely. Polling is fine.
- **Push notification on credit delivery** — nice-to-have but requires a new notification type. Deferred.
- **Optimistic credit display** — dangerous. If the webhook fails, the user would see credits that don't exist server-side. Better to wait for confirmation.

## Files Touched

- `apps/mobile/src/app/(app)/subscription.tsx` — `handleTopUp`: progress messaging, timeout copy, polling fix, missing package handling

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Webhook delayed > 37.5s | RevenueCat slow delivery | "Purchase confirmed, credits being added" | Pull-to-refresh on subscription screen |
| Webhook never arrives | RevenueCat outage | Credits never appear | RevenueCat retry mechanism will deliver eventually; user contacts support if prolonged |
| Store purchase cancelled by user | Taps cancel on payment sheet | Button re-enables silently | Tap "Buy" again |
| Network error during purchase | Connectivity drop | "Please check your internet connection" alert | Retry after reconnecting |
| Duplicate purchase | User taps rapidly | `topUpPurchasing` flag prevents double-tap; DB idempotency key prevents double-credit | Single charge, single credit grant |
| Package missing after retry | Offering genuinely not configured | "Not available right now" + support suggestion | Contact support |
