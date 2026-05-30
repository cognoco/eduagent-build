---
title: WI-366 Mobile Duplicate Submission — Implementation Plan
date: 2026-05-26
profile: code
work_items: [WI-366, WI-298, WI-268]
spec: Cosmo WI-366
status: done
---

# WI-366 Mobile Duplicate Submission — Implementation Plan

**Goal:** Make the two mobile flows in WI-366 safe against duplicate submission, with regression coverage for the reported DeepSec findings.
**Approach:** Keep the change surgical. Add RN tests first for the profile-create timeout/double-tap behavior and the dictation review pending-disabled evidence, then implement only the profile-create guard/abort code needed to make those tests pass. WI-268 is verified as already mitigated by existing server idempotency plus the new RN disabled-state test.

## Scope

In scope:
- `apps/mobile/src/app/create-profile.tsx`
- `apps/mobile/src/app/create-profile.test.tsx`
- `apps/mobile/src/app/(app)/dictation/review.test.tsx`

Out of scope:
- Backend profile-create idempotency keys
- Dictation production code unless the pending-disabled test proves the current UI is missing accessibility disabled state
- Broad cleanup of existing internal mocks beyond documenting the existing `use-dictation-api` mock deferral in the commit message

## Tasks

- [x] T1: Add WI-298 regression test for post-timeout retry — done when `apps/mobile/src/app/create-profile.test.tsx` has a test proving the first hung profile-create request is aborted at the 30s timeout before the form unlocks, and a retry results in exactly one successful create.
- [x] T2: Add WI-298 regression test for synchronous double-tap — done when `apps/mobile/src/app/create-profile.test.tsx` has a test proving two immediate submit presses issue at most one profile-create request.
- [x] T3: Add WI-268 evidence test for pending dictation review save — done when `apps/mobile/src/app/(app)/dictation/review.test.tsx` asserts `review-done` is disabled via `accessibilityState.disabled` while `recordResult.isPending` is true.
- [x] T4: Implement profile-create in-flight guard and abort-on-timeout — done when T1 and T2 pass with minimal production changes: a synchronous in-flight ref blocks same-frame duplicate submits, an `AbortController` is passed through the Hono client call, the 30s timeout aborts before unlocking, `AbortError` preserves the timeout message, and unmount aborts any in-flight create.
- [x] T5: Verify local acceptance criteria — done when the targeted Jest command passes, `pnpm exec nx lint mobile` passes, and `cd apps/mobile && pnpm exec tsc --noEmit` passes.

## Tests

T1 RED command:
`cd apps/mobile && pnpm exec jest src/app/create-profile.test.tsx --runInBand --no-coverage -t "aborts the in-flight create before allowing a post-timeout retry"`

T2 RED command:
`cd apps/mobile && pnpm exec jest src/app/create-profile.test.tsx --runInBand --no-coverage -t "ignores a synchronous double-tap while profile creation is already in flight"`

T3 RED command:
`cd apps/mobile && pnpm exec jest "src/app/(app)/dictation/review.test.tsx" --runInBand --no-coverage -t "disables Done accessibly while the result save is pending"`

Final targeted command:
`cd apps/mobile && pnpm exec jest --findRelatedTests src/app/create-profile.tsx "src/app/(app)/dictation/review.tsx" --runInBand --no-coverage`
