# WI-2331 — Red-Green-Revert evidence (V2 wayfinding + active-profile orientation)

**Type:** Bug · **Batch:** BID-28 (V2 shell coherence)

This Bug restores V2 wayfinding behaviours that silently regressed on
root-level pushed screens. Every fix below carries a regression test that
fails when the fix is reverted, per the repo Fix Development Rules (red →
green → revert → restore). Cycles run on Node 22, in the `WI-2331` worktree,
base `b95639a4b` (WI-2240 merge).

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

## Defect 3 — AC-2: mentor-memory.tsx Back control falls back to dead `/(app)/more`

**Fix:** `apps/mobile/src/app/(app)/mentor-memory.tsx:213-231` — `handleBack`
(wired to the header back chevron, the load-timeout secondary action, and the
error-state secondary action — one function, three UI sites) now derives
`backFallback`/`backLabel` from `FEATURE_FLAGS.MODE_NAV_V2_ENABLED`: V2 on ->
`/(app)/mentor` + `t('common.backTo', { destination: t(V2_TAB_TITLE_KEYS.mentor) })`
("Back to Mentor"); V2 off -> the original `/(app)/more` + `t('common.goBack')`
("Go Back"), byte-for-byte unchanged.

**Guard test:** `mentor-memory.test.tsx` -> `'names and targets the owning
Mentor tab for Back under V2'` + `'preserves the legacy More target and
generic label when V2 is off'`.

```
### GREEN baseline
Tests: 2 passed, 2 total (both new cases)
### REVERT (backFallback -> '/(app)/more' always, backLabel -> t('common.goBack') always)
### RED
  ✕ names and targets the owning Mentor tab for Back under V2
    Expected: "Back to Mentor"
    Received: "Go Back"
Tests: 1 failed, 1 passed, 2 total
### RESTORE + GREEN again
Tests: 2 passed, 2 total
Full mentor-memory.test.tsx suite: 32 passed, 32 total
```

## V0/V1 must-not-regress

The `v2Enabled=false` default is the legacy path. `navigation.test.ts` asserts
the catch-all still returns `/(app)/home` with V2 off, and every pre-existing
`homeHrefForReturnTo` token assertion (2-arg form) is unchanged — the diff adds
behaviour behind the flag and removes none.
