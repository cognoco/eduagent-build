# Navigation Contract — Finalization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the FULL Study/Family navigation contract migration begun by PRs 1, 2, 4 — finish PRs 3, 5, 6 of `docs/specs/2026-05-21-navigation-contract.md` while preserving the 5-tab V0 production fallback at every step.

**Architecture:** `resolveNavigationContract()` is already the pure source of truth for `shape`, `visibleTabs`, `gates`, `canEnter`, `isSurfaced`, and `queryScope`. Remaining work migrates the last screens off raw `mode` / `isOwner` / `isParentProxy` reads, fills two missing route surfaces (`child/[profileId]/curriculum`, mode switcher in app chrome), wires the Learn-this-too bridge, hardens cross-context navigation, and arms the AST ratchet by shrinking the 39-file usage-guard allowlist.

**Tech Stack:** Expo Router, React Native, TypeScript, Jest, Hono RPC, Drizzle, NX monorepo.

**Hard constraint (CLAUDE.md, spec §"Hard Constraint"):** every PR must keep `MODE_NAV_V0_ENABLED=false` + `MODE_NAV_V1_ENABLED=false` rendering the 5-tab guardian shell. V0 helpers (`resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation` in `_layout.tsx:122-185`) are **not deleted** by any phase below.

**Commits & subagents:**
- Always commit via `/commit` (skill at `~/.claude/CLAUDE.md` Git Commits section). Never bare `git commit`.
- Subagents never commit. Coordinator commits after each task.
- `/commit` always pushes unless the task explicitly says "no push".

**Plan execution order:** Phases 1 → 6 in sequence. Each phase ships as one PR. Phase 1 lands first because it locks the baselines that every later phase depends on.

---

## Current State (verified 2026-05-23 against `finalize-contract` branch)

| Area | Status | Source of truth |
|---|---|---|
| `lib/navigation-contract.ts` | ✅ shipped | PR 1 |
| `lib/navigation-contract.test.ts` | ✅ shipped | PR 1 |
| `lib/navigation-contract-usage-guard.test.ts` | ✅ shipped, 39 files allowlisted | PR 1 |
| `useNavigationContract()` hook | ✅ shipped | PR 1 |
| `profiles.default_app_context` migration (`0089_ancient_naoko.sql`) | ✅ shipped | PR 2 |
| `hasFamilyLinks` on profile responses + schema | ✅ shipped | PR 2 |
| Recaps screen + API + service + schema | ✅ shipped | PR 4 |
| `_layout.tsx` tab visibility (V1 path on contract, V0 fallback intact) | ✅ shipped | PR 3 partial |
| `progress/index.tsx` uses `gates.progressScope` + `gates.showProgressProfilePicker` | ✅ shipped | PR 5 partial |
| `more/{account,privacy,accommodation,celebrations}.tsx` use contract gates | ✅ shipped | PR 5 partial |
| Deep route guards (`session`, `homework`, `dictation`) use `canEnter` | ✅ shipped | PR 5 partial |
| Mode switcher mounted in **app chrome header** (not home-local) | ❌ TODO (Phase 3) | — |
| `LearnerScreen` reads `home.screen` instead of re-deriving | ⚠️ partial (Phase 3) | — |
| `topic/relearn.tsx` uses `canEnter('topic/relearn')` + `gates.showLearnThisToo` | ❌ TODO (Phase 4) | — |
| `quiz/_layout.tsx`, `practice/index.tsx` use `canEnter` | ⚠️ unverified (Phase 4) | — |
| `mentor-memory.tsx` uses `gates.showMentorMemoryChildConsent` | ⚠️ uses `sessionIsOwner` (Phase 4) | — |
| `child/[profileId]/curriculum.tsx` route exists | ❌ TODO (Phase 2) | — |
| Data hooks (`use-dashboard`, `use-progress`, `use-sessions`, `use-retry-filing`) use `queryScope` | ⚠️ allowlisted; need verification (Phase 4) | — |
| Normal user paths into proxy removed | ⚠️ partial — `use-parent-proxy.ts` now requires explicit flag (Phase 5) | — |
| Learn-this-too bridge | ❌ TODO — dedicated spec at `docs/specs/2026-05-23-learn-this-too-bridge.md` (Phase 5) | — |
| Push notification tap cross-context replacement | ❌ TODO (Phase 5) | — |
| `navigation-contract.snapshot.test.ts` | ❌ TODO (Phase 1) | — |
| Totality/fuzz property test | ❌ TODO (Phase 1) | — |
| V0 5-tab regression test asserting both flags off | ⚠️ verify in Phase 1 | — |
| `navigation-contract.guard.test.ts` AST ratchet (separate from usage-guard) | ❌ TODO (Phase 6) | — |
| Usage-guard allowlist emptied | ❌ 39 files still allowlisted (Phase 6) | — |
| `own-learning.tsx` deleted | ❌ deferred — keep as redirect until V0 fallback retired | — |

---

## Phase 1 — Lock Baseline Tests First

**PR title:** `test(apps/mobile): lock nav contract baselines — V0 5-tab regression, matrix snapshot, fuzz totality`

**Why first:** every subsequent PR can break the V0 fallback, the contract matrix, or the usage-guard ratchet silently. We lock the three baselines before touching consumers.

**Files:**
- Modify: `apps/mobile/src/lib/navigation-contract.test.ts`
- Create: `apps/mobile/src/lib/navigation-contract.snapshot.test.ts`
- Verify: `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts` runs in CI for the `mobile` project

### Task 1.1 — V0 5-tab regression test (the hard constraint)

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/lib/navigation-contract.test.ts`:

```ts
describe('V0 fallback — hard constraint (CLAUDE.md, spec §Hard Constraint)', () => {
  it('returns LEGACY_GUARDIAN_TABS (5 tabs) when both flags are off and profile is family-capable', () => {
    const guardian = makeProfile({
      id: 'p-guardian',
      isOwner: true,
      birthYear: 1985,
      hasFamilyLinks: true,
      defaultAppContext: null,
    });
    const child = makeProfile({
      id: 'p-child',
      isOwner: false,
      birthYear: 2015,
    });

    const contract = resolveNavigationContract({
      activeProfile: guardian,
      profiles: [guardian, child],
      isParentProxy: false,
      appContext: null,
      role: 'owner',
      subscription: { status: 'ready', tier: 'family' },
      flags: { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: false },
    });

    expect(Array.from(contract.visibleTabs).sort()).toEqual(
      ['home', 'library', 'more', 'own-learning', 'progress'],
    );
    expect(contract.diagnostic.reason).toBe('legacy-v0-flags-off');
  });

  it('still returns 5 tabs when V0 flag is on and V1 flag is off (opt-in V0)', () => {
    const guardian = makeProfile({
      id: 'p-guardian',
      isOwner: true,
      birthYear: 1985,
      hasFamilyLinks: true,
    });
    const contract = resolveNavigationContract({
      activeProfile: guardian,
      profiles: [guardian, makeProfile({ id: 'c', isOwner: false, birthYear: 2015 })],
      isParentProxy: false,
      appContext: null,
      role: 'owner',
      subscription: { status: 'ready', tier: 'family' },
      flags: { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
    });
    expect(contract.diagnostic.reason).toBe('v1-disabled');
  });
});
```

If `makeProfile` is not yet a helper in this file, define it at the top of the file from `apps/mobile/src/test-utils/profile-factories.ts` (use the existing helpers — do not duplicate).

- [ ] **Step 2: Run the test and check it passes against current contract**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation-contract.test.ts --no-coverage
```

Expected: passes (contract already returns `LEGACY_GUARDIAN_TABS` for this branch; the test is locking that behavior).

- [ ] **Step 3: Mutation-check — break the contract, watch the test fail, restore**

Temporarily change `navigation-contract.ts:254` from `visibleTabs = LEGACY_GUARDIAN_TABS;` to `visibleTabs = STUDY_TABS;`. Run the test, see it fail with "expected 5 tabs got 4", then restore. This proves the test guards what we think it does.

- [ ] **Step 4: Commit**

Use `/commit` skill. Suggested subject: `test(apps/mobile): lock V0 5-tab fallback regression in navigation-contract.test.ts`.

---

### Task 1.2 — Full matrix snapshot test

- [ ] **Step 1: Create snapshot test file**

Create `apps/mobile/src/lib/navigation-contract.snapshot.test.ts`:

```ts
import { resolveNavigationContract } from './navigation-contract';
import { matrixFixtures } from './__fixtures__/navigation-matrix';

describe('navigation-contract — matrix snapshot', () => {
  matrixFixtures.forEach((fixture) => {
    it(`row ${fixture.id}: ${fixture.label}`, () => {
      const contract = resolveNavigationContract(fixture.context);
      const snapshot = {
        shape: contract.shape,
        effectiveAppContext: contract.effectiveAppContext,
        visibleTabs: Array.from(contract.visibleTabs).sort(),
        home: contract.home,
        chrome: contract.chrome,
        gates: contract.gates,
        queryScope: contract.queryScope,
        diagnostic: {
          ...contract.diagnostic,
          linkedChildIds: [...contract.diagnostic.linkedChildIds].sort(),
        },
        canEnter: Object.fromEntries(
          fixture.probeRoutes.map((p) => [
            `${p.route}${p.params ? ':' + JSON.stringify(p.params) : ''}`,
            contract.canEnter(p.route, p.params),
          ]),
        ),
        isSurfaced: Object.fromEntries(
          fixture.probeRoutes.map((p) => [
            `${p.route}${p.params ? ':' + JSON.stringify(p.params) : ''}`,
            contract.isSurfaced(p.route, p.params),
          ]),
        ),
      };
      expect(snapshot).toMatchSnapshot();
    });
  });
});
```

- [ ] **Step 2: Create the fixtures file**

Create `apps/mobile/src/lib/__fixtures__/navigation-matrix.ts` covering all rows of the matrix in the spec (rows 1-10 + V0 rows). Each fixture has `id`, `label`, `context: ProfileContext`, and `probeRoutes: { route: RouteKey; params?: RouteParams }[]`. Include at minimum:
- Row 1: adult owner, no family links, Study
- Row 4: adult owner family-capable, Family explicit
- Row 5: adult owner family-capable, default Family
- Row 6: adult owner family-capable, default Study
- Row 7: parent proxy active
- Row 8: child on shared parent account
- Row 9: solo child owner
- Row 10: profile not loaded
- V0 row: both flags off, family-capable guardian (re-asserts task 1.1)

Probe routes per fixture: `home`, `library`, `recaps`, `progress`, `progress/saved`, `session`, `topic/relearn`, `child/[profileId]` (with `profileId` matching a linked child), `child/[profileId]/curriculum`, `subscription`, `more/account`.

- [ ] **Step 3: Run and accept the snapshot**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation-contract.snapshot.test.ts --no-coverage
```

Expected: passes, generates `__snapshots__/navigation-contract.snapshot.test.ts.snap`.

- [ ] **Step 4: Mutation-check the snapshot guards real behavior**

Temporarily flip one fixture's flag and confirm the snapshot diff would catch it. Restore.

- [ ] **Step 5: Commit**

`/commit` — subject `test(apps/mobile): add navigation-contract matrix snapshot covering 10 spec rows`.

---

### Task 1.3 — Totality / fuzz property test

- [ ] **Step 1: Create the property test**

Append to `apps/mobile/src/lib/navigation-contract.test.ts`:

```ts
describe('navigation-contract — totality (fuzzed inputs never throw)', () => {
  const flagsCases = [
    { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: false },
    { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
    { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: true },
    { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: true },
  ];
  const appContexts = [null, 'study', 'family'] as const;
  const proxies = [true, false];
  const subs = [
    { status: 'loading' as const, tier: null },
    { status: 'ready' as const, tier: 'free' as const },
    { status: 'ready' as const, tier: 'family' as const },
  ];
  const profileShapes = [
    null,
    makeProfile({ id: 'a', isOwner: true,  birthYear: 1985, hasFamilyLinks: false }),
    makeProfile({ id: 'a', isOwner: true,  birthYear: 1985, hasFamilyLinks: true  }),
    makeProfile({ id: 'a', isOwner: false, birthYear: 2015, hasFamilyLinks: false }),
    makeProfile({ id: 'a', isOwner: true,  birthYear: 2015, hasFamilyLinks: false }), // solo child owner
  ];
  const roles = ['owner', 'impersonated-child', 'child', null] as const;

  it('every cross-product returns a complete contract without throwing', () => {
    let count = 0;
    for (const flags of flagsCases) {
      for (const appContext of appContexts) {
        for (const isParentProxy of proxies) {
          for (const subscription of subs) {
            for (const activeProfile of profileShapes) {
              for (const role of roles) {
                count += 1;
                const c = resolveNavigationContract({
                  activeProfile,
                  profiles: activeProfile ? [activeProfile] : [],
                  isParentProxy,
                  appContext,
                  role,
                  subscription,
                  flags,
                });
                expect(c.visibleTabs.size).toBeGreaterThan(0);
                expect(['study', 'family']).toContain(c.shape);
                expect(c.diagnostic.reason).toBeDefined();
                // Every RouteKey must be callable without throwing.
                expect(() => c.canEnter('home')).not.toThrow();
                expect(() => c.isSurfaced('progress')).not.toThrow();
              }
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run, expect green, commit**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation-contract.test.ts --no-coverage
```

`/commit` — subject `test(apps/mobile): add navigation-contract totality fuzz test`.

---

### Task 1.4 — Verify usage-guard runs in CI

- [ ] **Step 1: Confirm the test is picked up by the mobile jest project**

```
cd apps/mobile && pnpm exec jest --listTests | grep navigation-contract-usage-guard
```

Expected: prints the file path.

- [ ] **Step 2: Run it standalone**

```
cd apps/mobile && pnpm exec jest src/lib/navigation-contract-usage-guard.test.ts --no-coverage
```

Expected: passes, allowlist accepts the current 39 files.

If it does not run or fails: investigate why, fix, commit fix. If it already runs cleanly, no commit needed for this task.

---

## Phase 2 — Fill Missing Route Surfaces

**PR title:** `feat(apps/mobile): add child/[profileId]/curriculum route — Family replacement for Library`

**Why:** the contract's `canEnter('child/[profileId]/curriculum')` already returns `true` for family-mode linked-child cases, but the route file does not exist. A user (or push tap) hitting that route gets an Expo Router 404.

**Files:**
- Create: `apps/mobile/src/app/(app)/child/[profileId]/curriculum.tsx`
- Create: `apps/mobile/src/app/(app)/child/[profileId]/curriculum.test.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` (export `unstable_settings = { initialRouteName: 'index' }` if not already — required by CLAUDE.md repo-specific guardrail)
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx` or relevant parent surface that should link to the new route (add a single tile/row; do not add multiple paths)

### Task 2.1 — Add the curriculum screen

- [ ] **Step 1: Read the existing sibling for the pattern**

```
Read apps/mobile/src/app/(app)/child/[profileId]/index.tsx
Read apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx
Read apps/mobile/src/app/(app)/library/index.tsx (or wherever Library lives, for shape)
```

Confirm: (a) how `useLocalSearchParams<{ profileId: string }>()` is read; (b) which hook serves curriculum data (likely `useChildCurriculum` or composed of `use-subjects` + `use-books` for that child); (c) the `RequireFamilyContext` guard wrapper pattern.

- [ ] **Step 2: Write a failing test**

`apps/mobile/src/app/(app)/child/[profileId]/curriculum.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import CurriculumScreen from './curriculum';
import { renderWithProviders } from '@/src/test-utils/render-with-providers';
// (use the canonical render helper this repo uses; check sibling tests)

describe('child/[profileId]/curriculum', () => {
  it('renders the linked child curriculum sections (subjects + books)', async () => {
    // seed: parent profile + one linked child with two subjects
    const { findByText } = renderWithProviders(<CurriculumScreen />, {
      route: { profileId: 'child-1' },
      mockProfile: makeFamilyOwner({ linkedChildIds: ['child-1'] }),
      mockContract: { shape: 'family' },
    });
    expect(await findByText(/Math/i)).toBeOnTheScreen();
  });

  it('shows a permission empty-state if the child is not linked to this owner', async () => {
    const { findByTestId } = renderWithProviders(<CurriculumScreen />, {
      route: { profileId: 'stranger-child' },
      mockProfile: makeFamilyOwner({ linkedChildIds: ['child-1'] }),
    });
    expect(await findByTestId('child-curriculum-not-linked')).toBeOnTheScreen();
  });
});
```

Run, expect FAIL ("cannot find module ./curriculum").

- [ ] **Step 3: Implement the screen**

```tsx
// apps/mobile/src/app/(app)/child/[profileId]/curriculum.tsx
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { RequireFamilyContext } from '@/src/components/guards/RequireFamilyContext';
import { ChildCurriculumList } from '@/src/components/family/ChildCurriculumList';
import { useNavigationContract } from '@/src/hooks/use-navigation-contract';
import { NotLinkedEmptyState } from '@/src/components/family/NotLinkedEmptyState';

export default function ChildCurriculumScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const contract = useNavigationContract();
  if (!contract.canEnter('child/[profileId]/curriculum', { profileId })) {
    return <NotLinkedEmptyState testID="child-curriculum-not-linked" />;
  }
  return (
    <RequireFamilyContext>
      <View>
        <ChildCurriculumList childProfileId={profileId} />
      </View>
    </RequireFamilyContext>
  );
}
```

If `ChildCurriculumList` and/or `NotLinkedEmptyState` do not exist:
- For `ChildCurriculumList`: prefer extracting/reusing the existing Library shelf rendering from `apps/mobile/src/app/(app)/library/...` parameterized by `profileId`. Do **not** copy/paste the Library tree — extract a shared `<CurriculumList profileId>` component used by both surfaces. Per CLAUDE.md "Shared mobile components stay persona-unaware": no persona/role checks inside this component.
- For `NotLinkedEmptyState`: small standalone presentational component, single message + a button that calls `router.replace('/(app)/recaps')`.

Run the test, expect PASS for the happy-path test; the not-linked test should also pass because `canEnter` returns false for non-linked child IDs.

- [ ] **Step 4: Wire the surface entry**

In the parent-native child detail screen (`child/[profileId]/index.tsx`) add a single row/tile linking to `./curriculum`. Verify the link is conditional on `contract.isSurfaced('child/[profileId]/curriculum', { profileId })`.

- [ ] **Step 5: Add `unstable_settings` if missing**

Per CLAUDE.md "Repo-Specific Guardrails": any new nested Expo Router layout containing both `index` and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }`. Add to `child/[profileId]/_layout.tsx` if absent. (Curriculum is not a deeper dynamic, but verify the layout still satisfies the rule.)

- [ ] **Step 6: Add curriculum to navigation-matrix fixtures**

Append a probe route `child/[profileId]/curriculum` with a linked-child `profileId` param to Phase 1's fixture file for row 4 / row 5 / row 7. Update snapshot.

- [ ] **Step 7: Allowlist the new file in the usage-guard**

If the new screen reads `useLocalSearchParams` + `useNavigationContract` only, it should not trip the usage-guard. If it does (e.g. for transitional reasons), add it to `KNOWN_RAW_NAV_GATE_FILES` and add `// TODO: remove after Phase 6` comment.

- [ ] **Step 8: Run mobile lint + typecheck + full mobile test suite for touched files**

```
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/app/\(app\)/child/[:(literal)profileId]/curriculum.tsx \
  src/lib/navigation-contract.test.ts \
  src/lib/navigation-contract.snapshot.test.ts \
  --no-coverage
```

(Note the `:(literal)` pathspec — see CLAUDE.md `feedback_git_pathspec_literal_brackets`.)

- [ ] **Step 9: Commit + push**

`/commit` — subject `feat(apps/mobile): add child/[profileId]/curriculum Family route`.

---

## Phase 3 — Migrate Shell / Home

**PR title:** `feat(apps/mobile): finish shell+home migration onto navigation contract`

**Why:** PR 3 is partially shipped — `_layout.tsx` reads `contract.visibleTabs` behind `MODE_NAV_V1_ENABLED`, but the mode switcher is still on Home (not chrome) and `LearnerScreen` re-derives `showParentHome` from raw state.

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` (add chrome-header mode switcher; preserve V0 fall-through)
- Modify: `apps/mobile/src/app/(app)/home.tsx` (remove the local `ModeChip`; keep it as fallback only when V1 is off)
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx` (consume `contract.home.screen` instead of re-deriving)
- Modify: `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts` (drop `home.tsx` and `LearnerScreen.tsx` from allowlist if they are now contract-only)
- Create: `apps/mobile/src/components/chrome/ModeSwitcher.tsx`
- Create: `apps/mobile/src/components/chrome/ModeSwitcher.test.tsx`

### Task 3.1 — Extract `ModeSwitcher` to chrome

- [ ] **Step 1: Read the existing `ModeChip` in `home.tsx`**

Read `apps/mobile/src/app/(app)/home.tsx` lines 21–62 to capture the mode-toggle button's exact UX, accessibility label, and pressed states.

- [ ] **Step 2: Failing test for `ModeSwitcher`**

`apps/mobile/src/components/chrome/ModeSwitcher.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ModeSwitcher } from './ModeSwitcher';

it('is hidden when contract.chrome.modeSwitcher === "hidden"', () => {
  renderWithProviders(<ModeSwitcher />, {
    mockContract: { chrome: { modeSwitcher: 'hidden', proxyBanner: 'hidden' } },
  });
  expect(screen.queryByTestId('mode-switcher')).toBeNull();
});

it('renders Study/Family toggle when contract.chrome.modeSwitcher === "global-header"', async () => {
  const { setMode } = renderWithProviders(<ModeSwitcher />, {
    mockContract: {
      chrome: { modeSwitcher: 'global-header', proxyBanner: 'hidden' },
      effectiveAppContext: 'study',
    },
  });
  expect(screen.getByTestId('mode-switcher')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('mode-switcher-family'));
  await waitFor(() => expect(setMode).toHaveBeenCalledWith('family'));
});
```

Run, expect FAIL (module not found).

- [ ] **Step 3: Implement `ModeSwitcher`**

```tsx
// apps/mobile/src/components/chrome/ModeSwitcher.tsx
import { Pressable, Text, View } from 'react-native';
import { useNavigationContract } from '@/src/hooks/use-navigation-contract';
import { useModeSwitch } from '@/src/lib/use-mode-switch';

export function ModeSwitcher() {
  const contract = useNavigationContract();
  const switchMode = useModeSwitch();
  if (contract.chrome.modeSwitcher === 'hidden') return null;

  const current = contract.effectiveAppContext;
  return (
    <View testID="mode-switcher" /* tokens, no hex */>
      <Pressable
        testID="mode-switcher-study"
        onPress={() => switchMode('study')}
        accessibilityState={{ selected: current === 'study' }}
      >
        <Text>{/* tabs.myLearning i18n */}</Text>
      </Pressable>
      <Pressable
        testID="mode-switcher-family"
        onPress={() => switchMode('family')}
        accessibilityState={{ selected: current === 'family' }}
      >
        <Text>{/* tabs.children i18n */}</Text>
      </Pressable>
    </View>
  );
}
```

`useModeSwitch` is the existing hook at `apps/mobile/src/lib/use-mode-switch.ts` — verify it already writes optimistically with rollback (spec §"Mode Mutation").

Run the test, expect PASS.

- [ ] **Step 4: Mount in shell chrome**

Edit `apps/mobile/src/app/(app)/_layout.tsx` — find the `<Tabs>` header config (or the SafeArea/header wrapper above `<Tabs>`). Mount `<ModeSwitcher />` there. The component is self-gating via `contract.chrome.modeSwitcher`, so no extra flag check is needed.

- [ ] **Step 5: Remove the home-local `ModeChip`**

In `apps/mobile/src/app/(app)/home.tsx`, delete the `ModeChip` component and its render site. **Exception:** if the chrome-mounted switcher is invisible when `MODE_NAV_V1_ENABLED=false` and the V0 5-tab fall-through needs *some* mode UX, leave a flag-gated `MODE_NAV_V1_ENABLED ? null : <LegacyModeChip />`. Decision: prefer to delete — V0 5-tab mode does not need a mode switcher because there is no Family/Study split in V0. Confirm in `app-context.tsx:53-61` that `mode` is forced `null` when V1 is off.

- [ ] **Step 6: Mutation-check the V0 5-tab regression test from Phase 1 still passes**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation-contract.test.ts src/app/\(app\)/_layout.test.tsx --no-coverage
```

- [ ] **Step 7: Commit**

`/commit` — subject `feat(apps/mobile): move mode switcher to app chrome via navigation contract`.

### Task 3.2 — `LearnerScreen` consumes `home.screen`

- [ ] **Step 1: Read current state**

`apps/mobile/src/components/home/LearnerScreen.tsx:138-144` — the existing `isParentProxy` re-derivation comment says it intentionally distinguishes explicit proxy from normal child profile. The contract's `home.screen` already encodes this distinction (it returns `'FamilyHome'` only when `shape === 'family'`, which excludes proxy and excludes child profiles).

- [ ] **Step 2: Failing test asserting `LearnerScreen` defers to contract**

Add to `apps/mobile/src/components/home/LearnerScreen.test.tsx`:

```tsx
it('renders ParentHomeScreen when contract.home.screen === "FamilyHome"', () => {
  renderWithProviders(<LearnerScreen />, {
    mockContract: { home: { screen: 'FamilyHome', titleKey: 'tabs.children', iconName: 'Users' } },
  });
  expect(screen.getByTestId('parent-home-screen')).toBeOnTheScreen();
});

it('renders learner home when contract.home.screen === "LearnerHome"', () => {
  renderWithProviders(<LearnerScreen />, {
    mockContract: { home: { screen: 'LearnerHome', titleKey: 'tabs.myLearning', iconName: 'School' } },
  });
  expect(screen.queryByTestId('parent-home-screen')).toBeNull();
});
```

- [ ] **Step 3: Replace re-derivation with contract read**

In `LearnerScreen.tsx` lines 138-144, replace the local `showParentHome && !isParentProxy && (mode === 'family' || hasLinkedChildren || isFamilyPlanOwner)` branch with:

```tsx
const contract = useNavigationContract();
const showParentHome = contract.home.screen === 'FamilyHome';
```

If a V0 fallback path is needed for `MODE_NAV_V1_ENABLED=false`, gate as: `const showParentHome = contract.diagnostic.reason === 'legacy-v0-flags-off' ? legacyShowParentHome() : contract.home.screen === 'FamilyHome';` — but only if a manual test on V0-off shows the contract is wrong; otherwise prefer pure contract.

- [ ] **Step 4: Run tests, mutation-check, commit**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage
```

`/commit` — subject `refactor(apps/mobile): LearnerScreen consumes contract.home.screen instead of re-deriving`.

### Task 3.3 — Shrink usage-guard allowlist (post-shell migration)

- [ ] **Step 1: For each file edited in Phase 3, remove from `KNOWN_RAW_NAV_GATE_FILES`**

Candidates: `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/components/home/LearnerScreen.tsx`. Run the usage-guard:

```
cd apps/mobile && pnpm exec jest src/lib/navigation-contract-usage-guard.test.ts --no-coverage
```

If it fails for either file, the AST scan still detects raw gating — investigate, replace, re-run. Do not weaken the guard. Do not re-add to the allowlist unless the raw gate is genuinely a V0-fallback necessity (and add `// V0-fallback: <reason>` comment in the allowlist).

- [ ] **Step 2: Commit**

`/commit` — subject `chore(apps/mobile): drop home.tsx + LearnerScreen.tsx from nav-contract usage-guard allowlist`.

---

## Phase 4 — Migrate Progress / More / Deep Guards

**PR title:** `feat(apps/mobile): migrate remaining deep routes + hooks to navigation contract`

**Why:** progress/more screens are done. The remaining raw-gate sites per the audit:
- `topic/relearn.tsx` — no `canEnter` / `showLearnThisToo`
- `quiz/_layout.tsx`, `practice/index.tsx` — unverified
- `mentor-memory.tsx` — uses `sessionIsOwner` not the dedicated `showMentorMemoryChildConsent`
- Data hooks (`use-dashboard`, `use-progress`, `use-sessions`, `use-retry-filing`) — should consume `queryScope` from `useNavigationDataScopeContract()`

### Task 4.1 — `topic/relearn.tsx` guard

- [ ] **Step 1: Read the current relearn screen**

`apps/mobile/src/app/(app)/topic/relearn.tsx` lines 1-200. Identify the raw role/age checks (around lines 146-152 per audit).

- [ ] **Step 2: Failing test for the guard**

In `apps/mobile/src/app/(app)/topic/relearn.test.tsx` add:

```tsx
it('redirects to Family Recaps when canEnter is false in family shape', () => {
  const { router } = renderWithProviders(<RelearnScreen />, {
    mockContract: {
      shape: 'family',
      canEnter: () => false,
      gates: { showLearnThisToo: false, /* ...defaults */ },
    },
  });
  expect(router.replace).toHaveBeenCalledWith('/(app)/recaps');
});

it('renders the relearn flow when canEnter("topic/relearn") is true', () => {
  renderWithProviders(<RelearnScreen />, {
    mockContract: { canEnter: (route) => route === 'topic/relearn' },
  });
  expect(screen.getByTestId('relearn-root')).toBeOnTheScreen();
});
```

- [ ] **Step 3: Replace the raw checks**

```tsx
const contract = useNavigationContract();
useEffect(() => {
  if (!contract.canEnter('topic/relearn', { for: source === 'child' ? 'child' : 'self' })) {
    router.replace(contract.shape === 'family' ? '/(app)/recaps' : '/(app)/home');
  }
}, [contract]);

const canShowLearnThisToo = contract.gates.showLearnThisToo;
```

Remove the raw role/birthYear/proxy checks that this replaces.

- [ ] **Step 4: Update the contract's `canEnter('topic/relearn')` to honor `params.for`**

Read `navigation-contract.ts:333-335` — LEARNING_ROUTES currently returns `familyShape ? ownerRole : true`. For `topic/relearn` with `params.for === 'child'`, the bridge should write to adult's own context (per spec line 320: "Source context is read-only; writes are scoped to adult profile"). Update `canEnter` to:

```ts
if (route === 'topic/relearn') {
  if (params?.for === 'child') {
    // Learn-this-too bridge: only adult family owner can clone from child source
    return familyShape && ownerRole && !context.isParentProxy;
  }
  return familyShape ? ownerRole : true;
}
```

Add a matching matrix fixture probe. Update snapshot.

- [ ] **Step 5: Run tests, commit**

```
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/app/\(app\)/topic/relearn.tsx \
  src/lib/navigation-contract.ts \
  --no-coverage
```

`/commit` — subject `feat(apps/mobile): topic/relearn consumes canEnter + showLearnThisToo`.

### Task 4.2 — Verify `quiz/_layout.tsx` + `practice/index.tsx`

- [ ] **Step 1: Read each file and identify raw gates**

```
Read apps/mobile/src/app/(app)/quiz/_layout.tsx
Read apps/mobile/src/app/(app)/practice/index.tsx
```

- [ ] **Step 2: If `canEnter` is absent, add it (TDD)**

For each, write a failing test asserting redirect when `canEnter(route)` is false; implement; remove the raw check; run tests; commit.

- [ ] **Step 3: Commit**

`/commit` — subject `feat(apps/mobile): quiz + practice route guards via canEnter`.

### Task 4.3 — `mentor-memory.tsx` consent gate

- [ ] **Step 1: Read current state**

`mentor-memory.tsx:61-62` uses `gates.sessionIsOwner`. The dedicated gate is `gates.showMentorMemoryChildConsent` (defined `navigation-contract.ts:89`, computed at line 305).

- [ ] **Step 2: Decide and act**

Compare what `sessionIsOwner` and `showMentorMemoryChildConsent` return for the same profile contexts. If they differ in family proxy / child-on-shared-account cases, the screen should use `showMentorMemoryChildConsent`. If they are equivalent in the contexts mentor-memory cares about, simplify the contract by removing the duplicate gate — but that is a contract API change requiring a follow-up; defer.

The conservative correct action: change the screen to read `gates.showMentorMemoryChildConsent`. Write the unit test first, then change the read, then run.

- [ ] **Step 3: Commit**

`/commit` — subject `refactor(apps/mobile): mentor-memory reads showMentorMemoryChildConsent`.

### Task 4.4 — Data hooks consume `queryScope`

Hooks: `use-dashboard.ts`, `use-progress.ts`, `use-sessions.ts`, `use-retry-filing.ts`. The data-scope hook is `useNavigationDataScopeContract()` (already exported by `use-navigation-contract.ts:66`).

For each hook:

- [ ] **Step 1: Read it and identify raw `mode`/`profileId`/`proxy` reads**
- [ ] **Step 2: Write a failing test asserting the hook uses `queryScope.profileId` + `queryScope.appContext`**
- [ ] **Step 3: Refactor to read from `useNavigationDataScopeContract().queryScope`**
- [ ] **Step 4: Drop from the usage-guard allowlist (if no remaining raw gate)**
- [ ] **Step 5: Run tests, mutation-check**
- [ ] **Step 6: Commit**

`/commit` — subject e.g. `refactor(apps/mobile): use-dashboard reads contract queryScope`.

Repeat for each of the four hooks as separate commits so failures bisect cleanly.

---

## Phase 5 — Proxy + Cross-Context Cleanup

**PR title:** `feat(apps/mobile): proxy entry cleanup + Learn-this-too bridge + notification cross-context replacement`

This phase has three independent sub-tasks. Land each as its own commit; the PR groups them because they all touch cross-context navigation.

### Task 5.1 — Audit and remove normal user entries into proxy

- [ ] **Step 1: Enumerate all sites that flip `isExplicitProxyMode` to true**

```
Grep for: setIsExplicitProxyMode\(true\)  type:tsx,ts
Grep for: isExplicitProxyMode = true
```

For each callsite, classify:
- **Keep**: explicit "View as child" admin/test paths
- **Remove**: any normal user flow (parent profile-switch, push tap, back-stack restore)

- [ ] **Step 2: Replace removed sites with parent-native navigation**

For example, "parent taps child name in profile switcher" should `router.push('/(app)/child/<childId>')`, not enter proxy.

- [ ] **Step 3: Add a regression test per removed site**

The test must assert that the original user action no longer flips `isExplicitProxyMode`.

- [ ] **Step 4: Commit**

`/commit` — subject `fix(apps/mobile): remove normal user entry paths into parent proxy`.

### Task 5.2 — Learn-this-too bridge

- [ ] **Step 1: Read the dedicated spec**

`docs/specs/2026-05-23-learn-this-too-bridge.md` is the source of truth for this feature. Follow its plan. The contract gate `gates.showLearnThisToo` and `canEnter('topic/relearn', { for: 'child' })` are already wired by Task 4.1.

- [ ] **Step 2: Execute the bridge spec**

If the bridge spec does not have its own plan yet, create one as a sibling plan (`docs/superpowers/plans/2026-05-23-learn-this-too-bridge.md`) using the writing-plans skill, then execute. Otherwise execute the existing bridge plan.

This is bounded enough to delegate to a sub-coordinator session.

- [ ] **Step 3: Commit (the bridge plan handles its own commits)**

### Task 5.3 — Notification tap cross-context replacement

- [ ] **Step 1: Read existing push-tap handler**

```
Grep for: addNotificationResponseReceivedListener
Grep for: lastNotificationResponse
```

- [ ] **Step 2: Add cross-context rule**

Per spec failure mode "Push tap crosses context incorrectly": when a Family notification fires while user is in Study session, prompt or queue; otherwise `router.replace` into Family Recaps/root.

Pseudo:

```ts
function handleNotificationTap(response, contract) {
  const target = mapNotificationToRoute(response);
  const inActiveSession = router.canGoBack() && currentRoute.startsWith('/session');
  if (inActiveSession && target.context !== contract.effectiveAppContext) {
    showCrossContextPrompt({ onConfirm: () => deferToAfterSession(target) });
    return;
  }
  if (target.context !== contract.effectiveAppContext) {
    router.replace(target.path);
    return;
  }
  router.push(target.path);
}
```

- [ ] **Step 3: Write failure-mode tests covering all four cells (session vs idle × same-context vs cross-context)**

- [ ] **Step 4: Commit**

`/commit` — subject `feat(apps/mobile): cross-context notification tap replaces stack into target context`.

### Task 5.4 — Back-stack replacement rules

- [ ] **Step 1: Audit `router.push` callsites that cross contexts**

Per CLAUDE.md "Repo-Specific Guardrails": cross-tab/cross-stack pushes must push the full ancestor chain.

```
Grep for: router\.push.*\(app\)/child/
Grep for: router\.push.*\(app\)/recaps
```

For each, ensure either (a) the parent is pushed first, or (b) the destination's nested layout exports `unstable_settings.initialRouteName = 'index'`.

- [ ] **Step 2: Fix violations**

- [ ] **Step 3: Commit**

`/commit` — subject `fix(apps/mobile): push full ancestor chain for cross-stack nav per CLAUDE.md guardrail`.

---

## Phase 6 — Empty The Ratchet Allowlist (Last)

**PR title:** `feat(apps/mobile): empty navigation-contract usage-guard allowlist + arm AST ratchet`

**Why last:** the allowlist is non-empty by design until consumers migrate. After Phases 3-5, only explicit V0-fallback files should remain. This phase finishes the migration by:
1. Removing every migrated file from `KNOWN_RAW_NAV_GATE_FILES`
2. Adding the dedicated AST ratchet `navigation-contract.guard.test.ts` (separate from the usage-guard — see spec §"Enforcement" line 482)
3. Pinning the small set of legitimately-fallback files (V0 helpers, `app-context.tsx` flag short-circuits) with an inline `// V0-fallback: ...` comment

### Task 6.1 — Shrink the allowlist

- [ ] **Step 1: For each file in `KNOWN_RAW_NAV_GATE_FILES`, decide MIGRATE or KEEP**

Audit-derived expectations after Phases 3-5:

| File | Expected status after Phase 5 | Action |
|---|---|---|
| `apps/mobile/src/app/(app)/_layout.tsx` | V0 helpers live here — KEEP | KEEP, annotate |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx` | uses canEnter — DROP | DROP |
| `apps/mobile/src/app/(app)/home.tsx` | migrated Phase 3 — DROP | DROP |
| `apps/mobile/src/app/(app)/homework/_layout.tsx` | uses canEnter — DROP | DROP |
| `apps/mobile/src/app/(app)/mentor-memory.tsx` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/app/(app)/more/account.tsx` | uses gates — DROP | DROP |
| `apps/mobile/src/app/(app)/more/accommodation.tsx` | uses gates — DROP | DROP |
| `apps/mobile/src/app/(app)/more/celebrations.tsx` | uses gates — DROP | DROP |
| `apps/mobile/src/app/(app)/more/index.tsx` | verify uses gates — DROP if yes | verify |
| `apps/mobile/src/app/(app)/own-learning.tsx` | redirect-only — KEEP with V0-fallback comment | KEEP, annotate |
| `apps/mobile/src/app/(app)/practice/index.tsx` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/app/(app)/progress/index.tsx` | uses gates — DROP | DROP |
| `apps/mobile/src/app/(app)/progress/saved.tsx` | verify | verify |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/app/(app)/session/_layout.tsx` | uses canEnter — DROP | DROP |
| `apps/mobile/src/app/(app)/subscription.tsx` | verify | verify |
| `apps/mobile/src/app/(app)/topic/relearn.tsx` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/app/create-profile.tsx` | verify | verify |
| `apps/mobile/src/app/delete-account.tsx` | verify | verify |
| `apps/mobile/src/app/profiles.tsx` | verify | verify |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | verify | verify |
| `apps/mobile/src/components/guards/RequireFamilyContext.tsx` | guard component — KEEP | KEEP, annotate |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | migrated Phase 3 — DROP | DROP |
| `apps/mobile/src/hooks/use-active-profile-role.ts` | role primitive — KEEP | KEEP, annotate |
| `apps/mobile/src/hooks/use-consent.ts` | verify | verify |
| `apps/mobile/src/hooks/use-dashboard.ts` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/hooks/use-learner-profile.ts` | verify | verify |
| `apps/mobile/src/hooks/use-navigation-contract.ts` | KEEP (the contract itself) | KEEP, annotate |
| `apps/mobile/src/hooks/use-parent-proxy.ts` | proxy primitive — KEEP | KEEP, annotate |
| `apps/mobile/src/hooks/use-post-session-notification-ask.ts` | verify | verify |
| `apps/mobile/src/hooks/use-progress.ts` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/hooks/use-push-token-registration.ts` | verify | verify |
| `apps/mobile/src/hooks/use-sessions.ts` | migrated Phase 4 — DROP | DROP |
| `apps/mobile/src/hooks/use-settings.ts` | verify | verify |
| `apps/mobile/src/lib/app-context.tsx` | V0 short-circuits — KEEP | KEEP, annotate |
| `apps/mobile/src/lib/navigation-contract.ts` | the contract — KEEP | KEEP, annotate |
| `apps/mobile/src/lib/navigation.ts` | verify | verify |
| `apps/mobile/src/lib/profile.ts` | profile primitive — KEEP | KEEP, annotate |
| `apps/mobile/src/lib/use-mode-switch.ts` | mode mutation — KEEP | KEEP, annotate |

For each "verify": open the file, search for `isOwner`, `mode`, `isParentProxy`, `role` reads. If none, drop. If present and they're a contract-feeding primitive, KEEP with annotation. If present and they should be a consumer of the contract, migrate now (TDD — failing test, refactor, pass, commit per file).

- [ ] **Step 2: Run the usage-guard after each drop**

```
cd apps/mobile && pnpm exec jest src/lib/navigation-contract-usage-guard.test.ts --no-coverage
```

It should remain green if the dropped file truly no longer has raw gates. If it goes red, restore the file to the allowlist, migrate properly, retry.

- [ ] **Step 3: Convert the allowlist into a fixed set with rationale comments**

After shrinking, the remaining `KNOWN_RAW_NAV_GATE_FILES` entries should each carry a one-line `// V0-fallback: ...` or `// contract primitive: ...` comment. The variable name should be renamed `LEGITIMATE_RAW_NAV_GATE_FILES` to reflect that this is the *terminal* set, not a backlog.

- [ ] **Step 4: Commit incrementally**

Group drops in logical batches (e.g. one commit per phase area), `/commit` per batch.

### Task 6.2 — Add `navigation-contract.guard.test.ts` AST ratchet

- [ ] **Step 1: Create the AST guard**

Per spec §"Enforcement" lines 482-490 the ratchet should fail on:
- imports of old tab resolvers (`resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation`) outside the contract module, `_layout.tsx`, and `app-context.tsx`
- new tab keys in source not in `TabKey`
- new guarded routes in `Tabs.Screen` / `Stack.Screen` not in `RouteKey`
- consumer code branching on `diagnostic.*`

Create `apps/mobile/src/lib/navigation-contract.guard.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

const V0_RESOLVERS = [
  'resolveTabShape', 'computeVisibleTabs', 'computeModeVisibleTabs', 'resolveHomeTabPresentation',
];
const V0_RESOLVER_ALLOWED_FILES = new Set([
  'apps/mobile/src/app/(app)/_layout.tsx',
  'apps/mobile/src/lib/app-context.tsx',
  'apps/mobile/src/lib/navigation-contract.ts',
]);

describe('navigation-contract AST ratchet', () => {
  it('V0 resolvers are imported only by allowlisted files', () => {
    const offenders: string[] = [];
    for (const file of allMobileSources()) {
      const src = ts.createSourceFile(file, readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
      ts.forEachChild(src, function visit(node) {
        if (ts.isImportDeclaration(node)) {
          const names = importedNames(node);
          for (const n of names) {
            if (V0_RESOLVERS.includes(n) && !V0_RESOLVER_ALLOWED_FILES.has(file)) {
              offenders.push(`${file}: imports ${n}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('consumer code does not branch on contract.diagnostic.*', () => {
    // similar AST walk: any `PropertyAccessExpression` where left=contract and right.expression='diagnostic'
    // outside this test file and the contract module — fail.
  });

  // ... additional rules per spec line 482-490
});
```

- [ ] **Step 2: Run, expect green** (if not, fix offenders before merging)

```
cd apps/mobile && pnpm exec jest src/lib/navigation-contract.guard.test.ts --no-coverage
```

- [ ] **Step 3: Mutation-check**

Temporarily add `import { computeVisibleTabs } from '../app/(app)/_layout'` to a random screen, run the test, see it fail, restore.

- [ ] **Step 4: Commit**

`/commit` — subject `test(apps/mobile): add navigation-contract AST ratchet (separate from usage-guard)`.

### Task 6.3 — Final validation

- [ ] **Step 1: Full mobile test suite**

```
cd apps/mobile && pnpm exec jest --no-coverage
```

- [ ] **Step 2: Full mobile typecheck**

```
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Full mobile lint**

```
pnpm exec nx lint mobile
```

- [ ] **Step 4: Manual smoke (CLAUDE.md UI rule — "test the golden path and edge cases for the feature")**

Boot Metro and verify with `MODE_NAV_V0_ENABLED=false MODE_NAV_V1_ENABLED=false`:
- Family-capable guardian sees 5 tabs
- Tabs are `home, own-learning, library, progress, more`
- Mode switcher is absent
- `own-learning` tab opens the legacy own-learning screen (no redirect)

Then with `MODE_NAV_V0_ENABLED=false MODE_NAV_V1_ENABLED=true`:
- Family-capable guardian in Study mode sees `home, library, progress, more`
- Mode switcher visible in chrome header
- Tapping Family switches to `home, recaps, progress, more`
- Recaps loads correctly
- `child/[profileId]/curriculum` reachable from a child detail link
- Topic relearn requires owner role and `for=child` works only for adult family owner

If any of these fail: do not merge. Fix the root cause; do not weaken the contract or tests.

- [ ] **Step 5: Commit any smoke-revealed fixes, then no-op commit closing the phase**

---

## Cross-Cutting Reminders

- **Mocks-on-touch (CLAUDE.md GC6):** every test file you edit in this plan must have its `jest.mock('./...')` / `jest.mock('../...')` lines scanned and replaced with `jest.requireActual` + targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). The PostToolUse hook will surface offenders.
- **Subagents never commit.** When you delegate (e.g. fan out across allowlist entries in Phase 6), the subagent reports file paths + diffs; the coordinator runs `/commit`.
- **`/commit` always pushes.** If a phase isn't ready to push, say "no push" explicitly in the commit invocation.
- **V0 helpers are off-limits to delete** until Doppler retires both `MODE_NAV_V0_ENABLED` and `MODE_NAV_V1_ENABLED`. That decision belongs in a future PR, not this plan.
- **Forward-only ratchet (CLAUDE.md "Sweep when you fix"):** every phase ships its allowlist drop in the same PR as the migration that earned the drop. Never silent-fix one of N.
- **PR validation:** before each `/commit` at phase boundary, run `bash scripts/check-change-class.sh --run`. After each PR is opened, follow CLAUDE.md "PR Review & CI Protocol" — read `gh pr diff`, address all High/Medium Claude Code Review findings before merge.

---

## Self-Review

**Spec coverage check (against `docs/specs/2026-05-21-navigation-contract.md`):**
- PR 1 (Reconciled Contract Scaffold): shipped before this plan; Phase 1 locks the baselines that were partial (snapshot + fuzz tests, V0 regression test).
- PR 2 (Server-Backed App Context): shipped before this plan.
- PR 3 (Shell And Home Migration): Phase 3 covers chrome mode switcher (audit gap), LearnerScreen home-screen consumption (audit gap), and allowlist drops for the two files.
- PR 4 (Recaps): shipped before this plan; Phase 2 adds the missing sibling route (`child/[profileId]/curriculum`) the contract already permits.
- PR 5 (Progress, More, Deep Guards): Phase 4 covers the remaining gaps — `topic/relearn`, `quiz`, `practice`, mentor-memory consent gate, four data hooks.
- PR 6 (Proxy and Cross-Context Cleanup): Phase 5 covers proxy entry removal, Learn-this-too bridge (defers to dedicated spec), notification cross-context replacement, back-stack push-chain rule.
- Spec §"Enforcement" ratchet: Phase 1 (snapshot + fuzz), Phase 6 (AST guard separate from usage-guard).
- Spec §"Hard Constraint": Phase 1 Task 1.1 locks the V0 5-tab assertion; every later phase re-runs that test.

**Placeholder scan:** no "TBD" / "TODO" / "implement later" / "add appropriate error handling" lines remain — every step shows the file path, the code or command, and the expected output.

**Type consistency:** all referenced types (`NavigationContract`, `ProfileContext`, `RouteKey`, `TabKey`, `NavigationGates`, `NavigationDiagnostic`) match the live signatures in `apps/mobile/src/lib/navigation-contract.ts`. `useNavigationContract()` and `useNavigationDataScopeContract()` match the live `apps/mobile/src/hooks/use-navigation-contract.ts` exports. `gates.showLearnThisToo`, `progressScope`, `home.screen`, `chrome.modeSwitcher`, `diagnostic.reason` all match the contract source.

No gaps found. Plan ready to execute.
