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

**Fix:** `apps/mobile/src/app/(app)/mentor-memory.tsx:229-246` — `handleBack`
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

## Scope reconciliation & provenance (PM AC-scope ruling, 2026-07-23)

WI-2331 is `Type=Bug` but carried feature-scale Acceptance Criteria. A PM AC-scope
ruling (MentoMate PM chair, clacks `mentomate-pgm` seq **39322**, relayed to this lane
at seq **39333**, 2026-07-23) split the item on the **bug/feature line** — Option (b) —
and was **executed in place on the Cosmo AC field** with `[AMENDED]` / `[REMOVED]`
markers (original AC-4 text preserved in its removal note; same pattern as WI-2624).
This section reconciles the delivered code against that amended field so a reviewer can
resolve every AC unit in-repo. The shepherd did **not** edit the Cosmo AC field — the PM
chair did.

| AC | Ruling | Delivered here |
|----|--------|----------------|
| AC-1 | Stays | Owning-tab highlight — `resolveV2TabIsActive` (Defect 1). |
| AC-2 | **Narrowed** to the root-level dead-V0-fallback screens; the exhaustive ~76-file semantic-Back sweep is split out. | Root-cause dead-fallback fix (Defects 2 & 3: `homeHrefForReturnTo` catch-all + `mentor-memory` Back). Sweep → **WI-2677**. |
| AC-3 | Stays | Focused-journey exit preserved; `session/index.tsx` `handleChatBackPress` last-resort routes to the owning tab under V2 instead of dead `/(app)/home`. |
| AC-4 | **Removed** — type correction: net-new own/supporting identity UI is a Feature, not a Bug deviation. | Not delivered here; split → **WI-2678**. |
| AC-5 | Stays | One central contract (`accountReturnTokenForPathname` / `homeHrefForReturnTo` / `V2_TAB_TITLE_KEYS`) backs both the tab highlight and every Back target; the full ~78-file back-route audit is enumerated in `docs/evidence/wi2331-backnav-audit.md`; representative regression coverage across all three tabs; V0/V1 flag states preserved. The exhaustive fix-sweep of the audited set → WI-2677. |

Both mandated follow-ups were minted and linked **before** completion (mint-before-complete
rule) and independently verified by the orchestrator (clacks seq **40193**): WI-2331
`Related Items = [WI-2185, WI-2178, WI-2240, WI-2677, WI-2678]`; WI-2677 (Enhancement,
AC-2 sweep) and WI-2678 (Feature, removed AC-4) both back-link to WI-2331 with Workstream
and Project set.

## Post-merge re-verification (origin/main reconcile)

The RGR cycles above were captured at base `b95639a4b`. `origin/main` later advanced and
was forward-merged into this branch (merge commit reconciling WI-2331 against the landed
WI-2234 returning-learner and WI-2239 Journal-paper-trail changes, which touched the same
`handleBack` / `handleChatBackPress` / `summaryHomeHref` sites). Both sides were preserved
in the resolution. Re-verified on the merged head (Node 22): `jest --findRelatedTests` over
the three reconciled files plus `navigation.ts` and `_layout.tsx` → **96 suites / 2239
tests pass**, covering both the WI-2331 AC guards above and the WI-2234/WI-2239 additions;
mobile `tsc --noEmit` clean.
