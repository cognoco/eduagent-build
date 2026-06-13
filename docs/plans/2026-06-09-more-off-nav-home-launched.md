---
title: V1 learner tab redesign — More off-nav + Practice promotion — Implementation Plan
date: 2026-06-09
profile: code
spec: docs/specs/2026-05-21-navigation-contract.md
status: draft
---

# V1 learner tab redesign — More off-nav + Practice promotion — Implementation Plan

**Goal:** Under the V1 navigation flag, reshape the learner tab bar from
`home, library, progress, more` to **`home, practice, library, progress`** — i.e.
(Part A) remove `More` from the bottom bar and make it a quiet Home-launched
destination, and (Part B) promote the already-built Practice hub from a hidden
Home-action route into a first-class tab in the slot More frees — all without
regressing the V0 5-tab guardian shell or the 4-tab V0 learner shell.

**Scope of the two changes by shell:**
- **Learner / study shell (`STUDY_TABS`):** loses `more`, gains `practice`.
- **Guardian / family shell (`FAMILY_TABS`):** loses `more`; does **not** gain
  `practice` (the adult-owner practices their own subjects in *study* mode via the
  mentor/student switcher; family mode is mentoring-only → `home, recaps, progress`).
- **Proxy (`PROXY_TABS`) and all V0 legacy sets:** untouched.

**Approach (both parts share one mechanism).** The tab bar renders purely from
`visibleTabs.has(route.name)` (`_layout.tsx:614`); the full-screen/immersive
collapse is the only other lever. Both `more` and `practice` are already declared
routes with nested `Stack`s. So the entire redesign is: edit the **V1** tab sets
in `navigation-contract.ts` (drop `more` from both shells; add `practice` to
`STUDY_TABS`), and unify the tab-bar-collapse rule into a single derived
predicate — *a destination route collapses the bar iff it is NOT a currently
visible tab.* That one rule is automatically correct in both V0 and V1: in V0
`practice` is not a tab → stays full-screen (today's behavior); in V1 learner
`practice` IS a tab → its hub renders with the bar; `more` flips the other way.
V0 reads entirely separate legacy sets (`legacy-navigation-contract.ts`), so the
whole redesign is V1-only by construction. We then (a) add a quiet More entry on
both Home screens + a back affordance on the More index (Part A), and (b) register
the Practice tab and make its nested activities hide the bar themselves (Part B).

## Context established (verified in code)

- Tab render: `apps/mobile/src/app/(app)/_layout.tsx:612-657` — `isVisible =
  visibleTabs.has(route.name)`; non-visible routes get `href:null` +
  `tabBarItemStyle:{display:'none'}`. `more` is declared at `:724-734`.
- V1 tab sets: `apps/mobile/src/lib/navigation-contract.ts:146-157`
  (`STUDY_TABS`, `FAMILY_TABS`) — both currently contain `'more'`.
- V0 tab sets (must NOT change): `apps/mobile/src/lib/legacy-navigation-contract.ts:4-36`
  (`GUARDIAN_TABS`, `LEARNER_TABS`, `FAMILY_MODE_TABS`, `STUDY_MODE_TABS`) — all
  contain `'more'`; `PARENT_PROXY_TABS:19-23` does not.
- V1 vs V0 selection: `resolveShellVisibleTabs` (`legacy-navigation-contract.ts:151-183`)
  returns `navigationContract.visibleTabs` only when `useContract === true`
  (= `MODE_NAV_V1_ENABLED`); otherwise it uses the legacy sets. So editing the
  contract sets cannot touch V0.
- Proxy: `PROXY_TABS` (contract) and `PARENT_PROXY_TABS` (legacy) already exclude
  `'more'`; proxy More renders a locked preview (`more/index.tsx:83-111`). No
  proxy change needed.
- LearnerScreen header: `apps/mobile/src/components/home/LearnerScreen.tsx:498-538`
  — flex-row, title block + optional "My Notes" pressable. No persistent settings
  entry today (More reached via tab).
- ParentHomeScreen header: `apps/mobile/src/components/home/ParentHomeScreen.tsx:872-889`
  — already has an avatar (`parent-home-account-avatar`) routing to
  `/(app)/more/account`. Reaches only `account`, not the full hub.
- More index header: `apps/mobile/src/app/(app)/more/index.tsx:114-119` — custom
  title View, no back button (it is a tab root today).
- Supporter path is independent of the tab: `child/[profileId]/index.tsx:1064`
  pushes `/(app)/more/accommodation?childProfileId=…`; `more/celebrations` is
  reached the same way. Removing the More **tab** does not affect these.
- Practice hub already built: `apps/mobile/src/app/(app)/practice/index.tsx` is the
  hub (4 sections); `practice/_layout.tsx` is a nested `Stack`
  (`initialRouteName:'index'`) also containing `assessment/` and
  `assessment-picker.tsx`. Promotion, not a build.
- Practice is hidden + immersive today: `'practice'` is in `FULL_SCREEN_ROUTES`
  (`_layout.tsx:60-70`, added by Bug 770) and in `HIDDEN_TAB_ROUTES`
  (`_layout.tsx:83-100`). It is reached only via the `home-action-practice` button
  (`LearnerScreen.tsx:87,91` → `/(app)/practice`).
- `TabKey` (`navigation-contract.ts:13-19`) is `home | own-learning | library |
  recaps | progress | more` — **no `'practice'`**; the union must be extended.
- `iconMap` (`_layout.tsx:106-120`) has no `Practice` entry; needs one.
- The practice activity *families* (`quiz`, `dictation`, `homework`, `session`,
  etc.) are their own top-level route groups, each already in `FULL_SCREEN_ROUTES`
  — unaffected by promoting the hub. Only `assessment`/`assessment-picker` live
  **inside** the practice Stack and therefore inherit the practice tab's chrome.
- Existing `/(app)/more` return targets (unaffected — `replace`/`goBackOrReplace`
  still land on the hub): `mentor-memory.tsx`, `onboarding/pronouns.tsx`,
  `onboarding/language-setup.tsx`, `subscription.tsx`, `_subscription/_components/*`,
  `more/privacy.tsx`, `more/terms.tsx`, `more/delete-account.tsx`,
  `LearnerScreen.tsx:473,749`.

## Decisions (resolved — no open forks)

1. **Gate:** ride `MODE_NAV_V1_ENABLED`. More-off-nav is part of the V1 redesign;
   no separate flag. V0 keeps More-as-tab unchanged.
2. **Full-screen treatment:** when off-nav, `more` collapses the tab bar (matches
   Practice — `FULL_SCREEN_ROUTES`, `_layout.tsx:60-70`). Avoids an orphaned
   "no tab highlighted" state.
3. **Entry treatment:** quiet, not a peer of activity actions. LearnerScreen gets
   a header icon button (`menu-outline`, matching the existing More tab icon at
   `_layout.tsx:119`); ParentHomeScreen reuses its existing avatar, repointed to
   the hub when off-nav.
4. **Back affordance:** More index gains a back button when off-nav, using
   `goBackOrReplace(router, '/(app)/home')` so it recovers even when reached via
   `router.replace('/(app)/more')`.
5. **Supporter flow:** unchanged — child settings are pushed from `child/[profileId]`
   with `childProfileId`, not via the More tab.
6. **Practice promotion is learner/study-shell only — ruled, not open.**
   `STUDY_TABS` gains `'practice'`; `FAMILY_TABS` does **not** (confirmed by
   product 2026-06-10). An adult-owner-with-children practices their own subjects
   in *study* mode (the learner shell, reached via the mentor/student switcher),
   so family mode stays mentoring-only (`home, recaps, progress`). T8's test
   asserts `FAMILY_TABS` never contains `'practice'` to lock this in.
7. **Keep the Home Practice action.** `home-action-practice`
   (`LearnerScreen.tsx:87,91`) stays; with Practice now a tab it simply deep-links
   into that tab (the proposed "contextual entries deep-link into the Practice
   tab" model). Redundant-but-convenient; removing it is out of scope.
8. **Practice tab root shows the bar; deeper practice activities hide it.** The
   hub (`practice/index.tsx`) is a destination and renders with the tab bar (via
   T2's `visibleTabs.has` short-circuit). The nested immersive screens
   (`assessment`, `assessment-picker`) hide the bar themselves (T10) so Bug 770's
   "activity under the host bar" ambiguity does not return.

## V0 / V1 coexistence matrix (why this is not a half-migration)

Tab rendering reads `visibleTabs` (`_layout.tsx:614`), sourced from
`resolveShellVisibleTabs` whose `useContract` switch **is** `MODE_NAV_V1_ENABLED`
(`use-navigation-contract.ts:168`). So the two-flag space collapses to one axis —
*is V1 on?* — for the More-tab question:

| Flag state | Path read | More a tab today | After this change |
|---|---|---|---|
| V0=on, V1=off (**prod default**) | legacy sets | yes (proxy: no) | **unchanged** |
| V0=off, V1=off (flags-off fallback) | legacy sets | yes (proxy: no) | **unchanged** |
| V1=on, learner | `STUDY_TABS` | yes | off-nav |
| V1=on, guardian | `FAMILY_TABS` | yes | off-nav |
| V1=on, proxy | `PROXY_TABS` | already no | already no |

And the symmetric table for the **Practice** tab (Part B):

| Flag state | Path read | Practice a tab today | After this change |
|---|---|---|---|
| V0=on / V0=off (legacy) | legacy sets | no (Home-action, full-screen) | **unchanged** |
| V1=on, learner | `STUDY_TABS` | no | **promoted to a tab** |
| V1=on, guardian | `FAMILY_TABS` | no | unchanged (no practice tab; study mode has it) |
| V1=on, proxy | `PROXY_TABS` | no | unchanged |

T1 + T8 edit only `STUDY_TABS`/`FAMILY_TABS` (the V1-on rows). The V1-off rows read
`legacy-navigation-contract.ts` sets, which are **out of scope and untouched** —
so V0 cannot regress (the hard constraint is satisfied mechanically, not by
gating). Moving More off-nav in V0 is **forbidden** (it would reshape the V0
shell); the V0/V1 split is mandated by the constraint, not a design choice, and
is temporary.

**Anti-half-migration property (the reason "what about V0" is a non-issue):**
all new UI — the LearnerScreen gear (T3), the ParentHomeScreen avatar repoint
(T4), the More-index back button (T5), the tab-bar collapse (T2) — gates on the
**derived** runtime condition `!visibleTabs.has('more')`, never on
`MODE_NAV_V1_ENABLED` directly. Consequences:

1. **V0 cells are byte-identical to today** (derived condition is false in V0).
2. **V0 retirement needs zero rework of this feature:** when the legacy sets and
   the `useContract` switch are deleted, `visibleTabs` becomes always-contract
   (no `more`), so every derived gate stays correct automatically. The only
   flag-coupled line (T1's set contents) dies with the legacy file.
3. **Rollback is graceful:** flipping V1 off mid-session while inside full-screen
   More → `visibleTabs` recomputes to legacy (has `more`) → tab bar reappears,
   More becomes the active tab, back button hides itself. No dead-end.

**Carry-forward note for the eventual V0-retirement PR (record, do not act now):**
do NOT re-add `'more'` to any tab set; do NOT remove `'practice'` from
`STUDY_TABS` or re-add it to `HIDDEN_TAB_ROUTES`; and do NOT "simplify" the
derived `!visibleTabs.has('more')` / `visibleTabs.has('practice')` gates into
`if (MODE_NAV_V1_ENABLED)` — each move recreates the stranding pattern this design
avoids. When the legacy file dies, `visibleTabs` becomes always-contract (no
`more`, learner-has `practice`) and every derived gate and the unified
`shouldCollapseTabBar` rule stay correct with zero edits.

## Scope

In scope:
- `apps/mobile/src/lib/navigation-contract.ts` (+ `.test.ts`) — drop `more` from
  V1 sets; add `practice` to `STUDY_TABS`; extend the `TabKey` union with `practice`
- `apps/mobile/src/lib/legacy-navigation-contract.ts` (+ `.test.ts`) — add one pure helper only
- `apps/mobile/src/app/(app)/_layout.tsx` (+ test) — collapse rule, Practice
  `Tabs.Screen` registration, `iconMap` entry, remove `practice` from `HIDDEN_TAB_ROUTES`
- `apps/mobile/src/components/home/LearnerScreen.tsx` (+ `.test.tsx`)
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` (+ `.test.tsx`)
- `apps/mobile/src/app/(app)/more/index.tsx` (+ `.test.tsx`)
- `apps/mobile/src/i18n/en.json` (More accessibility key if not reusing
  `tabs.moreLabel`; `tabs.practice` + `tabs.practiceLabel`) — then `pnpm translate`

Out of scope (must NOT change):
- `legacy-navigation-contract.ts` tab SETS (`GUARDIAN_TABS`, `LEARNER_TABS`,
  `FAMILY_MODE_TABS`, `STUDY_MODE_TABS`, `PARENT_PROXY_TABS`) — V0 shells. (V0
  must keep More-as-tab and Practice-as-Home-action.)
- `PROXY_TABS` and `FAMILY_TABS`'s membership of `practice` in
  `navigation-contract.ts` (FAMILY loses `more` per T1 but gains nothing).
- More sub-screen content (`account`, `privacy`, `accommodation`, `celebrations`,
  `notifications`, `help`, `security-sessions`).
- Practice hub/activity *content* (`practice/index.tsx` sections,
  `assessment*`, `quiz`, `dictation`, `relearn`, etc.) — only chrome/registration
  changes; the activity routes' own `FULL_SCREEN_ROUTES` membership is unchanged.
- `child/[profileId]/**` deep-links into `more/*`.

## Tasks

- [ ] **T1: Drop `'more'` from the V1 tab sets.**
  In `navigation-contract.ts:146-157`, remove `'more'` from `STUDY_TABS` and
  `FAMILY_TABS`:
  ```ts
  const STUDY_TABS: ReadonlySet<TabKey> = new Set(['home', 'library', 'progress']);
  const FAMILY_TABS: ReadonlySet<TabKey> = new Set(['home', 'recaps', 'progress']);
  ```
  Leave `PROXY_TABS` and `LEGACY_GUARDIAN_TABS` untouched. `more` stays a valid
  `TabKey`/route — only tab-bar membership changes.
  — **done when:** `navigation-contract.test.ts` asserts (a) V1 learner
  `visibleTabs` = `{home, library, progress}` and excludes `more`; (b) V1 family
  `visibleTabs` = `{home, recaps, progress}` and excludes `more`; (c) `canEnter`
  for every existing route is unchanged (no route keyed `'more'` exists, so this
  is a no-op assertion guarding against accidental coupling).

- [ ] **T2: Unify the tab-bar collapse rule (serves both More-off-nav AND
  Practice-promotion).**
  Add one pure helper to `legacy-navigation-contract.ts` (already imported by
  `_layout.tsx`). The rule: *a destination route collapses the tab bar iff it is
  NOT a currently visible tab.* This is the single seam that makes both parts
  V0/V1-correct without any flag read:
  ```ts
  export function shouldCollapseTabBar(
    routeName: string,
    visibleTabs: ReadonlySet<string>,
    fullScreenRoutes: ReadonlySet<string>,
  ): boolean {
    // A route promoted to a visible tab renders its hub WITH the bar
    // (V1 practice-as-tab, V0 more-as-tab). Its deeper immersive children
    // hide the bar themselves (see T10), not here.
    if (visibleTabs.has(routeName)) return false;
    // Immersive activities (session/quiz/dictation/…) + practice when it is NOT
    // a tab (V0, or V1 family): full-screen.
    if (fullScreenRoutes.has(routeName)) return true;
    // More: full-screen destination when off the bar (V1); a normal tab in V0
    // is already handled by the visibleTabs short-circuit above.
    return routeName === 'more';
  }
  ```
  Note the ordering: the `visibleTabs.has` short-circuit must come **first** so a
  promoted `practice` (which is also in `FULL_SCREEN_ROUTES`) does not collapse.
  In `_layout.tsx` `screenOptions`, replace `const isFullScreen =
  FULL_SCREEN_ROUTES.has(route.name)` (`:615`) with
  `const isFullScreen = shouldCollapseTabBar(route.name, visibleTabs, FULL_SCREEN_ROUTES)`.
  (`FULL_SCREEN_ROUTES` is a `Set`; pass as-is.)
  — **done when:** `legacy-navigation-contract.test.ts` covers all four branches:
  (a) `'more'` collapses when `visibleTabs` lacks `more` (V1); (b) `'more'` does
  NOT collapse when `visibleTabs` has `more` (V0); (c) `'practice'` collapses when
  `visibleTabs` lacks it but it is in `fullScreenRoutes` (V0 / V1-family); (d)
  `'practice'` does NOT collapse when `visibleTabs` has it (V1 learner); plus
  `'session'` (full-screen, not a tab) → true and `'home'` → false.

- [ ] **T3: Add the quiet settings entry to LearnerScreen.**
  Compute `const moreOffNav = !navigationContract.visibleTabs.has('more') &&
  !navigationContract.isParentProxy;` (the screen already holds
  `navigationContract`). In the header row (`LearnerScreen.tsx:511-536`, the
  right-side block alongside "My Notes"), render — only when `moreOffNav` — a
  header icon button:
  ```tsx
  {moreOffNav ? (
    <Pressable
      onPress={() => router.push('/(app)/more' as Href)}
      className="min-h-[44px] min-w-[44px] rounded-card items-center justify-center px-2 ml-2"
      accessibilityRole="button"
      accessibilityLabel={t('tabs.moreLabel')}
      testID="home-settings-entry"
    >
      <Ionicons name="menu-outline" size={24} color={colors.textSecondary} />
    </Pressable>
  ) : null}
  ```
  Place it after the My Notes `Pressable` inside the same flex-row so it sits at
  the trailing edge. Reuse existing `t('tabs.moreLabel')` (no new key).
  — **done when:** `LearnerScreen.test.tsx` adds: (a) with `MODE_NAV_V1_ENABLED`
  on (more off-nav), `home-settings-entry` is present and `router.push` is called
  with `'/(app)/more'`; (b) with the flag off (V0, more is a tab),
  `home-settings-entry` is absent; (c) in parent-proxy, absent.

- [ ] **T4: Repoint the ParentHomeScreen avatar to the hub when off-nav.**
  At `ParentHomeScreen.tsx:875-876`, make the avatar target conditional. Derive
  `const moreOffNav = !navigationContract.visibleTabs.has('more');` from the
  contract the screen already consumes (or accept it via props from the shell
  contract — use whichever the screen already has; ParentHomeScreen renders only
  in family/guardian shape and is not proxy). Change:
  ```tsx
  onPress={() => router.push((moreOffNav ? '/(app)/more' : '/(app)/more/account') as Href)}
  ```
  Rationale: in V1 the More tab is gone, so the avatar must reach the full hub,
  not only `account`; in V0 it keeps today's behavior.
  — **done when:** `ParentHomeScreen.test.tsx` adds: (a) flag on → avatar press
  pushes `'/(app)/more'`; (b) flag off → avatar press pushes `'/(app)/more/account'`
  (existing behavior preserved).

- [ ] **T5: Add a back affordance to the More index when off-nav.**
  In `more/index.tsx`, derive `const moreOffNav = !navigationContract.visibleTabs.has('more')`
  (the screen already calls `useNavigationContract()` at `:40` — read
  `navigationContract.visibleTabs`). In the header View (`:114-119`), prepend a
  back button shown only when `moreOffNav`:
  ```tsx
  {moreOffNav ? (
    <Pressable
      onPress={() => goBackOrReplace(router, '/(app)/home')}
      className="mb-2 -ml-1 min-h-[44px] min-w-[44px] flex-row items-center"
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      testID="more-back-button"
    >
      <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
    </Pressable>
  ) : null}
  ```
  Add imports: `Ionicons` from `@expo/vector-icons`, `goBackOrReplace` from
  `../../../lib/navigation`, `useThemeColors` for `colors` (check existing
  imports; add only what is missing). Use existing `t('common.back')` if present;
  otherwise add it (verify in `en.json` — if absent, add `"back": "Back"` under
  `common`).
  — **done when:** `more/index.test.tsx` adds: (a) flag on → `more-back-button`
  present, press calls `goBackOrReplace`/navigates toward `/(app)/home`; (b) flag
  off → `more-back-button` absent (More is a tab, native tab nav handles it).
  Proxy path (locked preview) unchanged — assert `more-back-button` absent in
  proxy since the early-return branch (`:83-111`) renders before the header
  block; if a back button is desired there too, it is out of scope.

- [ ] **T6: Reconcile existing tests asserting `'more'` tab membership.**
  Grep for assertions that the V1 study/family `visibleTabs` include `'more'`
  (`navigation-contract.test.ts`, any `_layout` tab test, `use-navigation-contract`
  tests). For each: this is case (b) of the test-update rule — the behavior
  changed, so update the assertion to the **current** real set (exclude `more`
  for V1; keep `more` for V0/legacy assertions). Do NOT weaken or delete
  assertions that still apply. Re-run `navigation-contract-usage-guard.test.ts`
  (it tracks `isOwner` reads, not `visibleTabs`; adding a `visibleTabs` read to
  `more/index.tsx` must not change its `profile-owner-read: 1` expectation — if it
  does, the read was miscounted and must be investigated, not rebaselined).
  — **done when:** `cd apps/mobile && pnpm exec jest --no-coverage
  src/lib/navigation-contract.test.ts src/lib/legacy-navigation-contract.test.ts
  src/lib/navigation-contract-usage-guard.test.ts` is green, with no assertion
  loosened (diff shows set-content changes only).

- [ ] **T7: V0 non-regression guard (red-green).**
  Add an explicit test that with `MODE_NAV_V1_ENABLED=false`: (a) a learner's
  `visibleTabs` includes `'more'` (legacy `LEARNER_TABS`); (b) a legacy guardian's
  `visibleTabs` includes `'more'` and is the 5-tab set; (c) `home-settings-entry`
  is absent on LearnerScreen; (d) the ParentHomeScreen avatar still targets
  `/(app)/more/account`. Verify red-green: temporarily force the V1 path, watch
  (a)/(b) fail, restore.
  — **done when:** the four assertions pass under the flag-off config and the
  red-green flip was observed (note it in the commit message).

### Part B — Practice promotion (V1 learner shell)

- [ ] **T8: Add `'practice'` to the `TabKey` union and to `STUDY_TABS`.**
  In `navigation-contract.ts:13-19`, extend the union:
  ```ts
  export type TabKey =
    | 'home'
    | 'own-learning'
    | 'practice'
    | 'library'
    | 'recaps'
    | 'progress'
    | 'more';
  ```
  Then add `'practice'` to `STUDY_TABS` (after T1 it reads
  `{home, library, progress}`) so the V1 learner shell becomes the proposed
  order **home, practice, library, progress**:
  ```ts
  const STUDY_TABS: ReadonlySet<TabKey> = new Set(['home', 'practice', 'library', 'progress']);
  ```
  Do **not** add `'practice'` to `FAMILY_TABS`, `PROXY_TABS`, `LEGACY_GUARDIAN_TABS`,
  or any legacy V0 set (decision 6). `practice` is a route only; no `canEnter`/
  `isSurfaced` entry is required for it to be navigable (it already navigates today).
  — **done when:** `navigation-contract.test.ts` asserts V1 learner `visibleTabs`
  === ordered/identical to `{home, practice, library, progress}` and that
  `FAMILY_TABS`/`PROXY_TABS` do **not** contain `practice`; `tsc` passes with the
  widened union (no exhaustiveness switch on `TabKey` breaks — grep for `switch`
  over `TabKey` and add a `case 'practice'` if any exists).

- [ ] **T9: Register the Practice tab and its icon; remove it from `HIDDEN_TAB_ROUTES`.**
  In `_layout.tsx`:
  (a) Add an `iconMap` entry (`:106-120`): `Practice: { focused: 'barbell', default: 'barbell-outline' }`.
  (b) Add a `<Tabs.Screen name="practice">` registration alongside the others
  (`:680-723`), mirroring the existing pattern:
  ```tsx
  <Tabs.Screen
    name="practice"
    options={{
      title: t('tabs.practice'),
      tabBarButtonTestID: 'tab-practice',
      tabBarAccessibilityLabel: t('tabs.practiceLabel'),
      tabBarIcon: ({ focused }) => <TabIcon name="Practice" focused={focused} />,
    }}
  />
  ```
  (c) Remove `'practice'` from `HIDDEN_TAB_ROUTES` (`:83-100`) and delete its
  belt-and-braces `href:null` entry in the hidden-routes render block
  (`:735+`) if one is emitted for it — otherwise the explicit `href:null` would
  fight the dynamic `isVisible` whitelist. Keep `'practice'` in
  `FULL_SCREEN_ROUTES` (T2 now gates collapse on `visibleTabs` first, so V0 stays
  full-screen and the V1 hub shows the bar).
  The existing dynamic `screenOptions` (`isVisible = visibleTabs.has('practice')`)
  then hides the tab in V0/family and shows it in V1 learner with no extra code.
  — **done when:** `_layout.test.tsx` (or a tab-shape render test) asserts
  `tab-practice` is present in the V1 learner shell and absent in V0 learner and in
  V1 family/proxy; no duplicate `practice` screen-registration warning.

- [ ] **T10: Hide the tab bar for deeper Practice activities (nested in the Stack).**
  Once `practice` is a visible tab, its root hub shows the bar (T2), but the
  nested `assessment`/`assessment-picker` screens would inherit it — reintroducing
  Bug 770's "activity under the host bar". On the Practice `<Tabs.Screen>` options
  (T9), derive the focused nested route and collapse the bar for anything that is
  not the hub `index`:
  ```tsx
  import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
  // inside <Tabs.Screen name="practice" options={({ route }) => ({ ...
  const focused = getFocusedRouteNameFromRoute(route) ?? 'index';
  const immersive = focused !== 'index';
  // merge into the screen's tabBarStyle:
  tabBarStyle: immersive ? { display: 'none' } : undefined,
  ```
  (Convert the Practice `options` to the function form `({ route }) => ({...})` so
  `route` is available; the other tabs keep object-form options.) Only `index`
  keeps the bar; `assessment`, `assessment-picker`, and any future practice child
  go full-screen — matching how `quiz`/`dictation` already behave as top-level
  full-screen routes.
  — **done when:** a render test mounts the Practice tab and asserts (a) at
  `practice/index` the tab bar is visible, (b) at `practice/assessment` the
  `tabBarStyle` resolves to `{ display: 'none' }`. If a direct render assertion is
  impractical, extract the `immersive` predicate into a tiny pure helper
  (`isImmersivePracticeRoute(focusedName: string)`) co-located in `_layout.tsx`
  and unit-test that instead (hub→false, assessment→true, undefined→false).

- [ ] **T11: Add the Practice tab i18n keys.**
  In `apps/mobile/src/i18n/en.json` under `tabs`, add `"practice": "Practice"` and
  `"practiceLabel": "Practice"` (accessibility label; mirror the
  `library`/`libraryLabel` shape). Run `pnpm translate` to populate the other 6
  locales, then confirm `scripts/check-i18n-staleness.ts` and
  `scripts/check-i18n-orphan-keys.ts` pass (the new keys are reached via
  `t('tabs.practice')`/`t('tabs.practiceLabel')` in T9, so they are not orphans).
  — **done when:** both i18n checks pass and `en.json` has the two keys with all
  locale files updated by `pnpm translate`.

- [ ] **T12: Confirm the Home Practice action still resolves (no code change expected).**
  Verify `home-action-practice` (`LearnerScreen.tsx:87,91`) still pushes
  `/(app)/practice` and that, with Practice now a tab, the push selects/enters the
  Practice tab rather than stacking a full-screen route over it. If Expo Router
  stacks instead of switching tabs (producing a back-button-to-Home rather than
  tab-switch UX), change the action to `router.navigate('/(app)/practice')` (tab
  navigation) instead of `router.push`. Decision 7: keep the action.
  — **done when:** `LearnerScreen.test.tsx` still asserts `home-action-practice`
  navigates to `/(app)/practice`; a manual smoke confirms tapping it lands on the
  Practice tab with the tab bar visible (not a full-screen stacked route) in V1.

- [ ] **T13: V0 + family non-regression guard for Practice (red-green).**
  Add assertions that with `MODE_NAV_V1_ENABLED=false`: (a) learner `visibleTabs`
  does **not** contain `'practice'` (V0 keeps it a Home-action route); (b)
  `shouldCollapseTabBar('practice', v0LearnerTabs, FULL_SCREEN_ROUTES)` is `true`
  (still full-screen in V0). And with V1 on, family shell: (c) `visibleTabs` does
  not contain `'practice'`; (d) `shouldCollapseTabBar('practice', familyTabs,
  FULL_SCREEN_ROUTES)` is `true`. Verify red-green by temporarily adding
  `'practice'` to a legacy set, watching (a) fail, and restoring.
  — **done when:** all four assertions pass and the red-green flip was observed
  (note in commit message).

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| In More (V1, full-screen), wants out | Opened via Home gear/avatar | `more-back-button` (T5) + native back/swipe | `goBackOrReplace(router,'/(app)/home')` → Home |
| Sub-screen `replace`s to `/(app)/more` | e.g. onboarding/subscription return | Lands on full-screen More hub with back button | Back button → Home (T5) |
| Proxy reaches More | Edge (no gear, no tab) | Locked preview (`more/index.tsx:83-111`) | ProxyBanner "switch back" (existing) |
| Flag off (V0) | Production default today | More as 5th/4th tab + Practice as Home-action, unchanged | Tab nav / Home action (unchanged) |
| In a Practice activity (V1) | Tap Assessment from hub | Full-screen activity, tab bar hidden (T10) | Native back / activity's own exit → back to hub (bar returns) |
| Practice tab tapped (V1) | Bottom-nav tap | Practice hub with tab bar visible | Switch to any other tab (standard) |
| V1 family-mode owner wants to practice own subject | In family mode (no Practice tab) | No Practice tab in family shell | Switch to study mode (mentor/student switcher) → learner shell has Practice |

## Validation (whole-change)

- `cd apps/mobile && pnpm exec jest --no-coverage src/lib/navigation-contract.test.ts
  src/lib/legacy-navigation-contract.test.ts src/lib/navigation-contract-usage-guard.test.ts
  src/components/home/LearnerScreen.test.tsx src/components/home/ParentHomeScreen.test.tsx
  src/app/\(app\)/more/index.test.tsx src/app/\(app\)/_layout.test.tsx`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `pnpm exec nx lint mobile`
- i18n: `pnpm translate` then `pnpm exec tsx scripts/check-i18n-staleness.ts` and
  `scripts/check-i18n-orphan-keys.ts` (Practice keys, T11).
- Manual smoke (both flag states via Doppler):
  - **V1 learner** — bar reads **home · practice · library · progress**; no More
    tab; gear on learner Home + avatar on parent Home open the More hub
    full-screen, back returns Home; tapping **Practice** lands on the hub with the
    bar; entering an Assessment hides the bar; the Home "Practice" action still
    reaches the Practice tab.
  - **V1 guardian/family** — bar reads **home · recaps · progress** (no More, no
    Practice); study-mode switch reveals the learner shell with Practice.
  - **V0** — More tab present and unchanged on learner + guardian shells; Practice
    reached only via the Home action and rendered full-screen (no Practice tab).
```
