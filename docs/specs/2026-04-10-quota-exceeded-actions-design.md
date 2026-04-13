# BILLING-07: Quota Exceeded In-Session Actions

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` BILLING-07

## Problem

When a user hits their daily quota mid-learning, the API returns a 402 with a `QuotaExceededError` containing full upgrade/top-up details. The session screen catches this but only calls `formatApiError()`, which discards the `.details` and renders a plain text bubble: "You've reached your daily question limit. Come back tomorrow for more!" No action button, no upgrade link, no way to unblock.

The `QuotaExceededError.details` object carries `tier`, `reason` (daily/monthly), `upgradeOptions[]`, `topUpCreditsRemaining`, `dailyLimit`, `usedToday`, `monthlyLimit`, `usedThisMonth` — all thrown away.

## Solution

### 1. Detect `QuotaExceededError` in session catch block

In `session/index.tsx`, replace the generic `formatApiError` path with an `instanceof QuotaExceededError` check. When detected, render a **structured quota card** instead of a plain text bubble.

### 2. Quota exceeded card component

A new `QuotaExceededCard` component rendered inline in the chat transcript (not a modal, not a navigation). Content varies by user context:

**Free tier — daily limit hit:**
- Message: "You've used all {dailyLimit} questions for today."
- Primary CTA: "Upgrade for more" → `router.push('/(app)/subscription')`
- Secondary: "Your questions reset tomorrow at {resetTime}."

**Free tier — monthly limit hit:**
- Message: "You've used all {monthlyLimit} free questions this month."
- Primary CTA: "Upgrade for more" → `router.push('/(app)/subscription')`
- Secondary: "Questions reset on the 1st of next month."

**Paid tier — daily limit (N/A currently, paid has no daily cap):**
- Not applicable per current pricing (Plus has no daily limit).

**Paid tier — monthly limit hit:**
- Message: "You've used all {monthlyLimit} questions this month."
- Primary CTA (if `topUpCreditsRemaining === 0`): "Buy more credits" → `router.push('/(app)/subscription')` (scrolls to top-up section)
- Primary CTA (if `topUpCreditsRemaining > 0`): "You have {N} top-up credits remaining" (no action needed — this shouldn't happen since top-up credits should have been consumed first, but handle gracefully)
- Secondary: "Questions reset on the 1st of next month."

**Child profile:**
- Message: "You've used all your questions for today."
- Primary CTA: "Ask your parent for more" → same notify-parent flow as `ChildPaywall`
- No upgrade/purchase CTAs for children.

### 3. Disable chat input after quota hit

After rendering the quota card, disable the message input with placeholder text: "Daily limit reached" or "Monthly limit reached." The user can still scroll the transcript and read previous messages, but cannot send new ones.

### 4. Pass `reason` to distinguish daily vs monthly

The `QuotaExceededError.details.reason` field (`'daily' | 'monthly'`) drives which message variant to show. This is already available in the error object.

## Scope Exclusions

- **Instant unblock after top-up** — would require the session screen to poll usage after the user returns from the subscription screen. Deferred to a follow-up. For now, the user must start a new session after purchasing.
- **Grace question** — allowing one more question after quota hit. Not implementing — complicates metering logic for minimal benefit.

## Files Touched

- `apps/mobile/src/app/(app)/session/index.tsx` — `QuotaExceededError` detection in catch block, render `QuotaExceededCard`, disable input
- `apps/mobile/src/components/session/QuotaExceededCard.tsx` — new component (inline chat card with CTAs)
- `apps/mobile/src/components/session/QuotaExceededCard.test.tsx` — tests for free/paid/child variants

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Upgrade completed but session still blocked | User returns from subscription after upgrading | Input still disabled (session was quota-blocked) | Start a new session (new sessions check fresh quota) |
| QuotaExceededError without details | Malformed API response | Fallback to plain text message (current behavior) | Graceful degradation |
| Child taps "Ask your parent" | Same as BILLING-06 notify flow | Push + email sent to parent | Wait for parent action |
