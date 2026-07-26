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

## Rework (reviewer:codex:global bounce, 2026-07-25)

The independent reviewer returned WI-2331 to rework with two substantive findings.
Both are addressed below; the original landed fix (3 defects above) is unchanged and
this rework stacks on top of it.

### Rework Defect A — AC-1/AC-2/AC-5: multi-origin route highlights the wrong tab

**Finding:** `accountReturnTokenForPathname` (pathname-only) maps every `/my-notes/*`
route to the Mentor catch-all, but `/my-notes` is **multi-origin** — `LearnerScreen`
(Mentor) pushes it with `returnTo=<own tab>`, and `JournalNotesArchive` (Journal) pushes
`/my-notes/[kind]` with `returnTo='journal'`. So a Journal-origin visit wrongly
highlighted Mentor, and `my-notes/index.tsx` hard-coded its Back **label** to
`V2_TAB_TITLE_KEYS.mentor` even though its Back **destination** already honoured
`returnTo` — "Back to Mentor" while actually returning to Journal.

**Fix:** `resolveV2TabIsActive` (`_layout.tsx`) gains a `returnTo` param: a definitive
`subjects`/`journal` pathname owner still wins, but the Mentor catch-all now defers to
`accountReturnToken(returnTo)` — the same resolver `homeHrefForReturnTo` uses for the Back
destination, so highlight and Back always agree. The active leaf's `returnTo` is read at
the tab layout via `useGlobalSearchParams` and threaded into all six tab
icon/label call sites. `my-notes/index.tsx`'s `backLabel` now derives from
`accountReturnToken(returnTo)` too. Backward-compatible: catch-all + no `returnTo` →
`accountReturnToken(undefined)` = `mentor` (unchanged).

**Guard tests:** `_layout.test.tsx` → `'disambiguates the multi-origin /my-notes/* catch-all via returnTo'`
and `'never lets returnTo override a definitive subjects/journal pathname owner'`;
`my-notes/index.test.tsx` → `'labels and routes Back to Journal when returnTo is journal'`
+ the Mentor-origin counterpart.

```text
### GREEN baseline (fix present)
_layout.test.tsx + my-notes/index.test.tsx: 133 passed, 133 total
### REVERT A (resolveV2TabIsActive -> pathname-only; my-notes backLabel -> hard-coded mentor)
### RED
  ✕ disambiguates the multi-origin /my-notes/* catch-all via returnTo
  ✕ labels and routes Back to Journal when returnTo is journal
2 failed, 131 passed, 133 total
### RESTORE + GREEN again
133 passed, 133 total
```

### Rework Defect B — AC-2: remaining generic Back labels on "fixed this pass" screens

The reviewer named `progress/[subjectId]` and `quiz/launch` as still-generic; treated as a
class. Every "Fixed this pass" screen was re-audited (chevron + loading + error controls).
Generic `common.goBack`/`common.back` Back controls now name their semantic destination
(`t('common.backTo', { destination: t(V2_TAB_TITLE_KEYS[<token>]) })`), V2-gated, V0/V1
copy unchanged, in: `my-notes/index.tsx`, `topic/relearn.tsx`, `homework/camera.tsx`
(permission-denied exit), `quiz/index.tsx`, `quiz/launch.tsx` (error-state exits),
`progress/[subjectId]/index.tsx` (all 5 sites unified, incl. two previously
hard-coded), `practice/index.tsx`, `onboarding/language-setup.tsx`,
`child/[profileId]/session/[sessionId].tsx`. Phase-stepping chevrons, icon-only
camera-modal buttons, and in-flight "Cancel" actions were deliberately left (not exit
controls). The ~57 un-audited files remain WI-2677.

### Rework Finding 2 — AC-5 representative coverage, identified per axis

AC-5's required coverage axes, each mapped to the specific executable test that exercises
it (no blanket "representative coverage" assertion):

| AC-5 axis | Covering test |
|-----------|---------------|
| All three tabs | `_layout.test.tsx` `resolveV2TabIsActive` cases (Mentor/Subjects/Journal owning-tab resolution) |
| Own vs supporting context | `_layout.test.tsx` → `'resolves identically for own-scope and supporter-scope returnTo tokens (both fall to the Mentor catch-all)'` |
| Deep links | `_layout.test.tsx` → `'resolves a cold deep-link landing (no returnTo, reactNavigationFocused=false) to its owning tab'` |
| Small-phone layout | `_layout.test.tsx` → `'keeps the V2 tab bar visible with correct tab highlight at a small-phone viewport'` (inset top:20/bottom:0; tab bar not collapsed, owning-tab accent) + `my-notes/index.test.tsx` → `'keeps the named Back control usable at a small-phone viewport'` |
| Dark/light themes | `_layout.test.tsx` → `'TabIcon / TabLabel theme-token wiring'` (focused → `colors.accent`, unfocused → `colors.textSecondary` — the semantic-token mechanism that adapts to either theme) |

The small-phone axis was retained (not treated as vestigial to the removed AC-4) per the
orchestrator's KEEP recommendation: AC-1/AC-2 are integrated UI outcomes — tab-bar
visibility/highlight and Back-label usability can regress through layout at a small
viewport even though the route-resolution logic itself takes no size input, so the axis is
covered rather than reasoned away.

## Rework #2 (reviewer:codex:global bounce, 2026-07-26)

The independent reviewer returned the item again with one finding: the AC-5 per-axis tests
from Rework Finding 2 were **structural proxies** — they passed without genuinely exercising
their axis (dark/light ran only one theme; own/supporting fed hand-written `returnTo` strings
to the pure resolver; small-phone changed only insets). Two axes were made genuine; the third
is resolved by an operator scope ruling.

### Axis 1 — dark/light themes: made genuine
The theme mock now reads the real `design-tokens.ts` table keyed by a mutable colour-scheme,
and the describe block runs `it.each(['light','dark'])` over `TabIcon`/`TabLabel`, asserting
the unfocused colour **differs** between themes (`light.textSecondary` vs `dark.textSecondary`).
Base `accent` is the same token value in both themes in design-tokens, so the cross-theme
differ-proof is anchored on `textSecondary`. Red-green: hardcoding the light token for the dark
case fails the dark assertion; restore → green.

### Axis 2 — own vs supporting context: made genuine (producer / consumer split)
The prior test fed hand-written `returnTo` strings to the pure resolver, and a follow-up round
paired a **solo-owner** fixture with the own-learning flow — but `own-learning.tsx` redirects a
solo owner (`!familyCapable && tabShape !== 'guardian'`) to `/(app)/home`, so that state is
unreachable, and the token was still injected rather than produced. Corrected by splitting the
axis along the seam WI-2331 actually changed (the `returnTo` **consumer**), with the token-origin
proof driven from the real **producers** — which live behind their own screens' mock infra, so
the proof lives in those screens' co-located tests (no new internal mocks in the layout test):

- **Own-scope producer** — `own-learning.test.tsx`: a reachable family-capable/guardian fixture
  (owner + linked child) renders `OwnLearningScreen`, asserts it does **not** redirect to
  `/(app)/home` (reachability), reads the **real emitted** `returnToTab` prop
  (`own-learning.tsx` wires `returnToTab={OWN_LEARNING_RETURN_TO}` into `LearnerScreen`), and
  resolves that emitted token through `homeHrefForReturnTo` to `OWN_LEARNING_HREF`. Red-green:
  break `own-learning.tsx`'s emitted token → the own test fails; restore → green.
- **Supporting-scope producer** — `recaps/[recapId].test.tsx`: renders the loaded recap detail,
  fires `recap-detail-open-session`, and asserts the **real** `router.push` call carries
  `returnTo: FAMILY_RECAPS_RETURN_TO` (`handleOpenChildSession`), then resolves that emitted
  token through `homeHrefForReturnTo` to the recap-detail href. Red-green: break the pushed
  token → the supporting test fails; restore → green.
- **Consumer** — `_layout.test.tsx`: given a *supplied* own vs supporting token, `AppLayout`'s
  real `Tabs.Screen` wiring + `homeHrefForReturnTo` resolve the correct owning tab and the
  **distinct** Back destination. Profile fixtures were removed (they implied a token origin this
  test does not prove); a single neutral profile mounts the layout, and the assertion weight is
  on the Back destination (both tokens share the Mentor catch-all highlight, so the destination
  is the real differentiator). Red-green: swap the own-learning branch of `homeHrefForReturnTo`
  → the own-scope case fails while the supporting-scope case still passes (proving the two are
  independent), restore → green.

### Axis 3 — small-phone layout: operator scope ruling (2026-07-26)
The reviewer asked for a test that "supplies a small viewport/window dimension." The V2 shell
has none to supply: tab-bar sizing reads only safe-area **insets**, floored by a minimum —
`height = 56 + Math.max(insets.bottom, V2_TAB_BAR_MIN_BOTTOM_INSET)` in `_layout.tsx`
(`V2_TAB_BAR_MIN_BOTTOM_INSET = 48`). There is **no `useWindowDimensions` / `Dimensions.get`
anywhere in the render path** (`_layout.tsx`, `my-notes/index.tsx`), so a mocked viewport width
would be inert — a fourth structural proxy, not a genuine test.

**Ruling (operator, 2026-07-26): the inset + minimum-height-floor behaviour IS the genuine
small-phone signal for this inset-driven layout.** The floor structurally guarantees the AC-1
"bottom navigation remains visible on a small phone" invariant *regardless* of screen width: at
`bottom: 0` (a small phone with no home-indicator gesture area) the floor forces `height: 104`
(`56 + 48`) with `display !== 'none'`. The covering test (`'keeps the V2 tab bar visible with
correct tab highlight at a small-phone viewport'`, alongside the all-zero-inset chrome test)
asserts exactly this floored height and the surviving owning-tab highlight — it proves the
guarantee the reviewer's viewport test was standing in for. Making the layout viewport-responsive
(adding a `useWindowDimensions` read) would be net-new product behaviour, out of scope for this
test-only Bug rework, and was declined in favour of testing the guarantee the shipped code
actually provides. Provenance note only; the Cosmo AC-5 field is unchanged.

Verification: mobile suite over the touched files green on Node 22 (144 pass / 0 fail); mobile
typecheck and eslint clean; production source byte-identical (test-only change).
