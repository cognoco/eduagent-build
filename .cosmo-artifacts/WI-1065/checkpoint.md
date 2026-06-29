# WI-1065 checkpoint - bug premise not reproduced

Date: 2026-06-25
Worktree checked: `C:\Dev\Projects\Products\Apps\eduagent-build\.worktrees\WI-1065-repaired`
Branch checked: `WI-1065`

## Summary

Stopped without production changes because the requested red regression did not
fail against the current code.

## Evidence

- `apps/mobile/src/app/(app)/subscription.tsx:167-168` declares
  `restoreCancelledRef` and `topUpCancelledRef` with `useRef(false)`. A true
  React unmount/remount recreates these refs as `false` before any mount-only
  effect would run.
- `apps/mobile/src/app/(app)/subscription.tsx:247` resets
  `restoreCancelledRef.current = false` after a successful
  `restore.mutateAsync()` and before restore polling/alert branching.
- `apps/mobile/src/app/(app)/subscription.tsx:517` resets
  `topUpCancelledRef.current = false` after a successful top-up purchase and
  before top-up polling/alert branching.
- Temporary regression test added, run, then removed:
  `[WI-1065] shows restore success after cancelling a previous poll and remounting`.
  The test rendered the subscription screen, started restore polling, pressed
  `restore-polling-cancel`, unmounted, remounted, restored again, advanced the
  confirmation poll, and asserted the restored success alert.
- Command run:
  `pnpm exec jest --runTestsByPath 'apps/mobile/src/app/(app)/subscription.test.tsx' -t 'WI-1065' --runInBand --no-coverage --verbose`
- Result: PASS on unchanged production code. Jest also emitted existing Expo
  native-module/environment warnings and act warnings from the temporary test
  mechanics; they did not cause failure.

## Files changed

- No code or test files left changed.
- This checkpoint artifact only.

## Remaining risk

If the intended scenario is not a true unmount/remount but a still-mounted
Expo Router screen regaining focus, then a mount-only `useEffect(..., [])` would
not address that scenario either. That would need a separate focus/lifecycle
acceptance criterion and a different regression test.
