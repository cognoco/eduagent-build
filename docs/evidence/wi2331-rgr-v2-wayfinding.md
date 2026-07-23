# WI-2331 — Red-Green-Revert evidence (V2 wayfinding + active-profile orientation)

**Type:** Bug · **Batch:** BID-28 (V2 shell coherence)

This Bug restores two V2 wayfinding behaviours that silently regressed on
root-level pushed screens. Both fixes carry a regression test that fails when
the fix is reverted, per the repo Fix Development Rules (red → green → revert →
restore). Cycles run on Node 22, in the `WI-2331` worktree, base
`b95639a4b` (WI-2240 merge).

## Defect 1 — AC-1: pushed screens lose the highlighted owning tab

**Fix:** `apps/mobile/src/app/(app)/_layout.tsx` — new pure
`resolveV2TabIsActive(pathname, tabName, v2Enabled, reactNavigationFocused)`
resolves the visually-active V2 tab from the pathname's owning tab
(`accountReturnTokenForPathname`) instead of React Navigation's `focused`,
which reports `false` for all three real tab buttons while a hidden-sibling
pushed screen is active. Wired into the Mentor/Subjects/Journal
`tabBarIcon`/`tabBarLabel`, V2-gated (V0/V1 pass `reactNavigationFocused`
straight through).

**Guard test:** `_layout.test.tsx` → `describe('resolveV2TabIsActive [WI-2331 AC-1]')`.

```
### GREEN baseline
Tests:       120 passed, 120 total
### REVERT AC-1 (resolveV2TabIsActive -> unconditional reactNavigationFocused)
### RED
  ✕ highlights the owning tab for a pushed route React Navigation does not focus
  ✕ resolves Subjects-owned pushed routes (subject-hub, pick-book, shelf, …)
Tests:       3 failed, 117 passed, 120 total
### RESTORE + GREEN again
Tests:       120 passed, 120 total
```

## Defect 2 — AC-2/AC-3: root pushed screens fall back to the dead V0 `/(app)/home`

**Fix:** `apps/mobile/src/lib/navigation.ts` — `homeHrefForReturnTo` gained a
`v2Enabled` param; its trailing catch-all (reachable whenever `returnTo` is
absent or an unrecognized token, from session/quiz/practice/homework/
topic-relearn/child-session/my-notes) now routes through the owning-tab
contract (`unknown -> Mentor`) when V2 is on, instead of the dead
`/(app)/home`. Every named token above the catch-all — and the `v2Enabled=false`
default — is untouched, so V0/V1 does not regress. All ~15 root call sites pass
`FEATURE_FLAGS.MODE_NAV_V2_ENABLED`.

**Guard test:** `navigation.test.ts` → `describe('homeHrefForReturnTo')`,
`WI-2331 AC-2/AC-5` cases.

```
### GREEN baseline
Tests:       44 passed, 44 total
### REVERT AC-2 (catch-all -> unconditional '/(app)/home')
### RED
  ✕ routes the unrecognized/absent catch-all to the Mentor tab when V2 is on
Tests:       1 failed, 43 passed, 44 total
### RESTORE + GREEN again
Tests:       44 passed, 44 total
```

## V0/V1 must-not-regress

The `v2Enabled=false` default is the legacy path. `navigation.test.ts` asserts
the catch-all still returns `/(app)/home` with V2 off, and every pre-existing
`homeHrefForReturnTo` token assertion (2-arg form) is unchanged — the diff adds
behaviour behind the flag and removes none.
