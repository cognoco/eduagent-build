---
title: WI-293 Auth Redirect Remount Regression — Implementation Plan
date: 2026-05-29
profile: code
work_items: [WI-293]
status: in-progress
---

# WI-293 Auth Redirect Remount Regression — Implementation Plan

**Goal:** Add a regression guard proving sign-in remounts preserve a pending auth redirect instead of replacing it with `/(app)/home`.
**Approach:** Extend the existing sign-in screen test suite first, verify it fails against current `origin/main`, then make the smallest redirect-state fix needed. Keep the change inside auth redirect handling and avoid changing Clerk activation or auth-layout navigation.

## Scope

In scope:
- `apps/mobile/src/app/(auth)/sign-in.test.tsx` — add the remount regression test and redirect-param test helpers.
- `apps/mobile/src/app/(auth)/sign-in.tsx` — only if the failing test shows current screen initialization overwrites a pending redirect.
- `apps/mobile/src/lib/normalize-redirect-path.ts` and `apps/mobile/src/lib/normalize-redirect-path.test.ts` — only if honoring `toInternalAppRedirectPath()` fallback directly is the least invasive fix.

Out of scope:
- Auth layout routing behavior.
- Clerk session activation behavior.
- New navigation features or broad redirect refactors.

## Tasks

- [x] T1: Add failing sign-in remount regression test — done when `apps/mobile/src/app/(auth)/sign-in.test.tsx` simulates `rememberPendingAuthRedirect('/(app)/quiz')`, remounts `SignInScreen` with no `redirectTo`, completes sign-in, and fails because `peekPendingAuthRedirect()` becomes `/(app)/home` instead of `/(app)/quiz`.
- [x] T2: Preserve pending redirect during no-param sign-in remount — done when the T1 test passes by initializing sign-in redirect state from the pending redirect before falling back to `/(app)/home`, while existing explicit `redirectTo` behavior still stores and activates the explicit target.
- [x] T3: Cover explicit and default redirect variants touched by the fix — done when tests assert local `redirectTo`, browser/search `redirectTo`, pending-only remount, and no-redirect fresh render all resolve to the expected pending redirect value.
- [x] T4: Validate the focused change — done when the related mobile Jest tests pass and the change-aware validator is run or a blocker is recorded if secrets/env prevent it.

## Tests

T1:
- Command: `cd apps/mobile && pnpm exec jest 'src/app/(auth)/sign-in.test.tsx' --runInBand --no-coverage --testNamePattern='pending auth redirect'`
- Expected red: pending-only remount stores `/(app)/home` before the fix.

T2/T3:
- Command: `cd apps/mobile && pnpm exec jest 'src/app/(auth)/sign-in.test.tsx' --runInBand --no-coverage`
- Expected green: all sign-in tests pass.

T4:
- Command: `bash scripts/check-change-class.sh --run --fast`
- If secret-dependent checks fail because `pnpm env:sync` reported Doppler project setup missing, record the exact failing command and run the non-secret targeted tests directly.
