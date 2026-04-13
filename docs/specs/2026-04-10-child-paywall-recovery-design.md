# BILLING-06: Child Paywall Recovery Actions

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` BILLING-06

## Problem

When a child hits the paywall (`ChildPaywall` in `subscription.tsx`), they can only "Notify My Parent" (24-hour cooldown) and "Browse Library." The copy mentions "see your progress" but there's no button for it. The tab bar is not visible — the child is effectively trapped on this one screen with minimal actions.

## Current State

- Full-screen `ChildPaywall` component replaces the subscription screen content
- "Notify My Parent" sends push + email to parent, then locks for 24 hours
- "Browse Library" navigates to `/(app)/library`
- "Back" button calls `router.back()`
- No progress link, no home link, no tab bar

## Solution

### 1. Add "See your progress" action button

The copy already says "you can still browse your Library and see your progress." Match it with a real button:

```
"See your progress" → router.push('/(app)/progress')
```

Place it alongside "Browse Library" as a secondary action row. Both buttons use the same tertiary/outline style.

### 2. Add "Go Home" action

Add a "Go Home" button that navigates to `/(app)/home`. This gives the child a clear escape from the paywall screen without relying on `router.back()` (which may land them somewhere unexpected depending on navigation history).

### 3. Warmer messaging while waiting

After notification is sent, replace the static "While you wait" copy with a more encouraging message:

Current: "While you wait, you can still browse your Library and see your progress."

New: "Your parent has been notified! While you wait, you can still explore:"

Followed by the action buttons (Browse Library, See your progress, Go Home).

### 4. Show what the child accomplished

The component already conditionally shows XP stats ("You learned N topics and earned X XP"). Make this always visible (not conditional on XP data availability) with a graceful fallback:

- Has XP data: "You learned N topics and earned X XP — great work!"
- No XP data: "You've been exploring and learning — great start!"

## Scope Exclusions

- **Showing the tab bar** — the paywall screen is rendered within the subscription route, not as a tab-level gate. Changing this would require restructuring the navigation. The action buttons provide sufficient escape paths.
- **Reducing the 24-hour notification cooldown** — the rate limit exists to prevent spam. Not changing it.

## Files Touched

- `apps/mobile/src/app/(app)/subscription.tsx` — `ChildPaywall` component: add progress button, home button, always-show stats, warmer copy

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Progress screen empty | Child has no sessions yet | Empty progress screen with guidance | Back button returns to paywall |
| Notification already sent | Second tap within 24h | Countdown timer + disabled button | Wait or browse library/progress |
| Parent never upgrades | Days pass without action | Same paywall, notification button re-enabled daily | Child can re-notify once per day |
