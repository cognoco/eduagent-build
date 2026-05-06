# Profile-as-Lens — Phase 2 (PR 6) Implementation Plan: Family Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-06
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md) (rev 4, 2026-04-29)
**Phase:** 2 of 3 — scoped to PR 6 only
**Goal:** Promote child-management surfaces out of `/more` into a dedicated `Family` bottom tab, conditionally mounted when the user has at least one linked child profile.

**Architecture:** Move the existing `dashboard.tsx` body into a new `family.tsx` route, repoint `FAMILY_HOME_PATH` to it, mount it as a 5th visible tab gated on **(a) active profile is a parent (`useActiveProfileRole() === 'parent'`) AND (b) `useDashboard()` returns real (non-demo) children**, redirect `/dashboard` indefinitely to `/family` for any deep links, and ship a single dismissible inline orientation cue on first visit (SecureStore-backed). No backend changes.

**Phase 1 gate decision:** The spec (line 25) gates Phase 2 on validating Phase 1 telemetry. Phase 1 PR 1/2/3 are unstarted. Per user direction, this plan proceeds without Phase 1 telemetry — the kill criterion (spec line 37: post-launch tap rate <5%) becomes a post-launch monitor rather than a pre-merge gate. If a Phase 1 prerequisite turns up during implementation, stop and re-plan.

**Tech stack:** Expo Router v6 Tabs, React Query (existing `useDashboard` hook), SecureStore (Expo-safe key), `react-i18next`, NativeWind. Mobile only.

---

## Scope statement — what this plan does NOT cover

The Phase 2 spec bundles four PRs (5, 6, 7, 9). This plan is **PR 6 (Family tab) only**. Excluded:

- **PR 5 — Privacy & Lenses panel + per-profile notifications + breakdown sharing toggle.** Most rows depend on PR 7 mechanism, Phase 1 PR 2 (per-profile quota), or Phase 3 PR 11 (withdrawal-consent forward setting). Plannable as a separate small follow-up.
- **PR 6b — Cross-tab withdrawal-consent countdown banner + 24h push notification.** Touches API + Inngest + push; treated as a follow-on plan once PR 6a foundation lands. The existing `ConsentWithdrawnGate` already blocks access; the countdown banner is a UX layer on top.
- **PR 7 — Multi-lens Home.** The Self-lens entry mechanism is explicitly gated on Phase 1 telemetry per spec line 154. Cannot be planned today without picking a mechanism arbitrarily.
- **PR 9 — Soft-state lens rendering.** Depends on PR 7 lenses existing.

Phase 1 PR 1/2/3 are independent of this plan and remain unstarted (per `2026-04-29-profile-as-lens-phase-1.md`).

## Pre-conditions

- Working tree on a feature branch (suggested name: `phase2-family-tab`). Confirm with `git status` before starting.
- `pnpm exec nx run-many -t typecheck` passes on the base branch (sanity check).
- `useDashboard` plus `useActiveProfileRole` are the sources of truth for "should Family tab mount". The dashboard hook returns `DashboardData` shaped as `{ children: DashboardChild[]; demoMode: boolean; ... }`. We treat `role === 'parent' && data?.demoMode === false && (data?.children?.length ?? 0) > 0` as "has family".
- **Why the `demoMode` gate matters:** `apps/mobile/src/hooks/use-dashboard.ts:62-69` silently falls back to `/dashboard/demo` when the real dashboard returns zero children. The demo endpoint (`apps/api/src/routes/dashboard.ts:339-345`) returns one fake child `'demo-child-1'` with `demoMode: true`. Without the demo gate, every parent with no linked children would see a Family tab populated with fake demo data.
- **Why the role gate matters:** spec line 276 — *"The Family tab — never appears for child profiles regardless of relationships."* `useDashboard` is `enabled: !!activeProfile` and runs for child profiles too, so we cannot rely on the dashboard payload alone. `useActiveProfileRole()` (`apps/mobile/src/hooks/use-active-profile-role.ts:20`) already returns the discriminated role.

## File structure

**Created:**

- `apps/mobile/src/hooks/use-family-presence.ts` — wraps `useDashboard`, returns `{ hasFamily: boolean; isLoading: boolean }`.
- `apps/mobile/src/hooks/use-family-presence.test.ts`
- `apps/mobile/src/app/(app)/family.tsx` — page component. Receives the entire `dashboard.tsx` body (children list + drill-down + skeleton + error + demo banner).
- `apps/mobile/src/app/(app)/family.test.tsx` — copy of `dashboard.test.tsx` retargeted at `family.tsx`. Most assertions transfer directly because the body is identical.
- `apps/mobile/src/components/family/FamilyOrientationCue.tsx` — dismissible inline cue ("Family is your home for everyone you're learning alongside.") shown once.
- `apps/mobile/src/components/family/FamilyOrientationCue.test.tsx`

**Modified:**

- `apps/mobile/src/app/(app)/_layout.tsx` — add `family` to `VISIBLE_TABS`, conditional `Tabs.Screen` with `href: null` when `hasFamily` is false, new icon mapping.
- `apps/mobile/src/app/(app)/_layout.test.tsx` — add coverage for tab visibility branches.
- `apps/mobile/src/app/(app)/dashboard.tsx` — replaced by a thin component that returns `<Redirect href="/(app)/family" />`. Preserve `returnTo` query-param forwarding so deep links keep working.
- `apps/mobile/src/app/(app)/dashboard.test.tsx` — collapse to redirect-coverage tests; original screen-behavior tests move to `family.test.tsx`.
- `apps/mobile/src/lib/navigation.ts` — `FAMILY_HOME_PATH = '/(app)/family'`.
- `apps/mobile/src/lib/navigation.test.ts` — update assertion to new path.
- `apps/mobile/src/components/home/ParentGateway.tsx` — replace literal `'/(app)/dashboard?returnTo=home'` with `` `${FAMILY_HOME_PATH}?returnTo=home` ``. (Plain `FAMILY_HOME_PATH` is path-only; query string must be concatenated explicitly.)
- `apps/mobile/src/components/home/ParentGateway.test.tsx` — update assertion at line 125 (`'/(app)/dashboard?returnTo=home'` → `'/(app)/family?returnTo=home'`).
- `apps/mobile/src/app/(app)/more.tsx` — line 610 has a literal `'/(app)/dashboard?returnTo=more'` despite the file already importing `FAMILY_HOME_PATH` (line 49). Replace with `` `${FAMILY_HOME_PATH}?returnTo=more` ``.
- `apps/mobile/src/app/(app)/more.test.tsx` — line 282 asserts `'/(app)/dashboard'`. Update to `'/(app)/family'`.
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` — line 288 `router.replace('/(app)/dashboard' as never)`. Replace with `FAMILY_HOME_PATH`.
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` — three literals (lines 85, 256, 345). Replace each with `FAMILY_HOME_PATH`.
- `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx` — line 53 literal. Replace with `FAMILY_HOME_PATH`.
- `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx` — two literals (lines 99, 138). Replace each with `FAMILY_HOME_PATH`.
- For each `child/*` file, update its co-located test if any assertions reference the old literal — verify with the Task 6 grep pass.
- `apps/mobile/src/i18n/locales/en.json` — add `tabs.family`, `tabs.familyLabel`, `family.title`, `family.subtitle` (move from `dashboard.title`/`dashboard.subtitle` if reusable; otherwise add new), `family.orientationCueTitle`, `family.orientationCueBody`, `family.orientationCueDismiss`. Other locale files (`de`, `es`, `ja`, `nb`, `pl`, `pt`) get the same keys with English fallback strings — translation pass not required for this PR.

**Not modified (intentional):**

- API endpoints — none change.
- The decision NOT to delete the old `dashboard.*` i18n keys after the cutover. Because the redirect is indefinite (per spec line 163), `family.tsx` still relies on most `dashboard.*` keys (renaming all of them is out of scope for this PR). A future cleanup PR can rename them once the redirect is sunset; track it as a follow-up rather than mixing it into this plan.

---

## Task 1: `useFamilyPresence` hook

**Files:**
- Create: `apps/mobile/src/hooks/use-family-presence.ts`
- Test: `apps/mobile/src/hooks/use-family-presence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/hooks/use-family-presence.test.ts
import { renderHook } from '@testing-library/react-native';
import { useFamilyPresence } from './use-family-presence';

const mockUseDashboard = jest.fn();
const mockUseActiveProfileRole = jest.fn();
jest.mock('./use-dashboard', () => ({
  useDashboard: () => mockUseDashboard(),
}));
jest.mock('./use-active-profile-role', () => ({
  useActiveProfileRole: () => mockUseActiveProfileRole(),
}));

describe('useFamilyPresence', () => {
  beforeEach(() => {
    mockUseDashboard.mockReset();
    mockUseActiveProfileRole.mockReset();
  });

  it('returns hasFamily=false while loading', () => {
    mockUseActiveProfileRole.mockReturnValue('parent');
    mockUseDashboard.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: true });
  });

  it('returns hasFamily=false when children list is empty', () => {
    mockUseActiveProfileRole.mockReturnValue('parent');
    mockUseDashboard.mockReturnValue({
      data: { children: [], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: false });
  });

  it('returns hasFamily=true when at least one real child is linked', () => {
    mockUseActiveProfileRole.mockReturnValue('parent');
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: true, isLoading: false });
  });

  it('returns hasFamily=false when dashboard payload is demo data (parent has no real children)', () => {
    // Regression guard: useDashboard silently falls back to /dashboard/demo
    // when children.length === 0, returning fake demo-child-1 with demoMode:true.
    // Family tab must NOT mount in this case.
    mockUseActiveProfileRole.mockReturnValue('parent');
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'demo-child-1' }], demoMode: true },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current.hasFamily).toBe(false);
  });

  it('returns hasFamily=false on a child profile, even with non-empty children list', () => {
    // Per spec line 276: Family tab never appears for child profiles
    // regardless of relationships.
    mockUseActiveProfileRole.mockReturnValue('child');
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current.hasFamily).toBe(false);
  });

  it('returns hasFamily=false on a parent-impersonating-child (proxy) session', () => {
    // useActiveProfileRole returns 'parent-as-child' for proxy sessions.
    // Family tab is a parent-seat surface — suppress it during proxy.
    mockUseActiveProfileRole.mockReturnValue('parent-as-child');
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current.hasFamily).toBe(false);
  });

  it('returns hasFamily=false when role is not yet resolved (null)', () => {
    mockUseActiveProfileRole.mockReturnValue(null);
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current.hasFamily).toBe(false);
  });
});
```

> **Note:** Verify the exact role string for proxy sessions by reading `apps/mobile/src/hooks/use-active-profile-role.ts` before writing the test — adjust the literal (`'parent-as-child'`) to match the actual discriminated union value. Whatever the value, the rule is: only the plain `'parent'` role mounts the tab.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-family-presence.test.ts --no-coverage`
Expected: FAIL with "Cannot find module './use-family-presence'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/mobile/src/hooks/use-family-presence.ts
import { useDashboard } from './use-dashboard';
import { useActiveProfileRole } from './use-active-profile-role';

export interface FamilyPresence {
  hasFamily: boolean;
  isLoading: boolean;
}

/**
 * Whether the active profile should see the Family tab.
 *
 * Three guards stack:
 *   1. Role must be exactly 'parent' (not 'child', not proxy/impersonation,
 *      not null/loading). Spec line 276: Family tab never appears for child
 *      profiles regardless of relationships.
 *   2. The dashboard payload must NOT be demo data. useDashboard falls back
 *      to /dashboard/demo when the real response has zero children, so a
 *      bare children-length check would incorrectly mount the tab for any
 *      parent with no linked children.
 *   3. At least one real child must be present.
 */
export function useFamilyPresence(): FamilyPresence {
  const role = useActiveProfileRole();
  const { data, isLoading } = useDashboard();

  const isParent = role === 'parent';
  const isReal = data?.demoMode === false;
  const hasRealChildren = (data?.children?.length ?? 0) > 0;
  const hasFamily = isParent && isReal && hasRealChildren;

  return { hasFamily, isLoading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-family-presence.test.ts --no-coverage`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit (using `/commit`)**

```
feat(mobile): add useFamilyPresence hook for Phase 2 family tab
```

Per repo CLAUDE.md, commits go through `/commit`. Do not run raw `git commit`.

---

## Task 2: Create `family.tsx` route as a duplicate of `dashboard.tsx`

This task creates the new screen without yet wiring it up. After this task, the file exists, has tests, and renders correctly when navigated to directly. It is not yet visible in the tab bar and `FAMILY_HOME_PATH` still points at `/dashboard`. That comes in Task 5.

**Files:**
- Create: `apps/mobile/src/app/(app)/family.tsx`
- Create: `apps/mobile/src/app/(app)/family.test.tsx`

- [ ] **Step 1: Copy `dashboard.tsx` to `family.tsx` verbatim, then make four edits**

Read the entire current `apps/mobile/src/app/(app)/dashboard.tsx` and write the same content to `apps/mobile/src/app/(app)/family.tsx`, then:

1. Rename the default export from `DashboardScreen` to `FamilyScreen`.
2. Change the `testID="dashboard-scroll"` on the `ScrollView` to `testID="family-scroll"`.
3. Change the `testID="dashboard-back"` on the back `Pressable` to `testID="family-back"`.
4. Change the `testID="dashboard-skeleton"` and `testID="dashboard-retry-button"` to `family-skeleton` and `family-retry-button` respectively.
5. Replace any `t('dashboard.title')` / `t('dashboard.subtitle')` with `t('family.title')` / `t('family.subtitle')`. Leave other `t('dashboard.*')` keys alone for now — they continue to render correctly because the i18n keys still exist; they will be migrated in a later cleanup if the team chooses, but that is not required for this plan.
6. Leave the `returnTo` logic intact — it is still a valid back-navigation pattern when entered from `/home` or `/more`.

- [ ] **Step 2: Add the i18n keys**

Open `apps/mobile/src/i18n/locales/en.json` and add (keep alphabetical ordering inside the `family` block, place the block alphabetically among siblings):

```json
"family": {
  "title": "Family",
  "subtitle": "Everyone you're learning alongside.",
  "orientationCueTitle": "This is your family hub",
  "orientationCueBody": "Children, their progress, and family settings live here.",
  "orientationCueDismiss": "Got it"
},
"tabs": {
  ...existing keys...
  "family": "Family",
  "familyLabel": "Family tab"
}
```

For each of `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json`: add the same keys with the English strings as fallback values. Translation polish is out of scope for this PR; the keys must exist so `react-i18next` does not log missing-key warnings during tests.

- [ ] **Step 3: Copy `dashboard.test.tsx` to `family.test.tsx` and adapt**

Read the entire current `apps/mobile/src/app/(app)/dashboard.test.tsx`. Write the same content to `apps/mobile/src/app/(app)/family.test.tsx`, then:

1. Update the import from `./dashboard` to `./family`.
2. Update the imported component name accordingly (`DashboardScreen` → `FamilyScreen`).
3. Update any `testID` selectors to match the renamed testIDs from Step 1.
4. Replace any literal `'/(app)/dashboard'` strings with `'/(app)/family'`.
5. Drop the `[BUG-905]` provenance tags from the test descriptions for the new file (those bugs were already closed; this is a fresh file, not a bug-fix).

- [ ] **Step 4: Run the new test file**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/family.test.tsx --no-coverage`
Expected: PASS — all tests transferred from dashboard.test.tsx pass against family.tsx.

- [ ] **Step 5: Run the existing dashboard test file (sanity)**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/dashboard.test.tsx --no-coverage`
Expected: PASS — `dashboard.tsx` still works unchanged at this point.

- [ ] **Step 6: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit (using `/commit`)**

```
feat(mobile): add /family route mirroring /dashboard
```

---

## Task 3: `FamilyOrientationCue` component

A dismissible inline cue shown above the children list on first visit only. SecureStore-backed, never re-shown after dismissal.

**Files:**
- Create: `apps/mobile/src/components/family/FamilyOrientationCue.tsx`
- Create: `apps/mobile/src/components/family/FamilyOrientationCue.test.tsx`

The SecureStore key uses Expo-safe characters only (per CLAUDE.md): `family_orientation_cue_dismissed_v1`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/family/FamilyOrientationCue.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FamilyOrientationCue } from './FamilyOrientationCue';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock('../../lib/secure-storage', () => ({
  getItemAsync: (k: string) => mockGetItem(k),
  setItemAsync: (k: string, v: string) => mockSetItem(k, v),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('FamilyOrientationCue', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it('renders nothing while the SecureStore lookup is pending', () => {
    let resolve: (v: string | null) => void;
    mockGetItem.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<FamilyOrientationCue />);
    expect(screen.queryByTestId('family-orientation-cue')).toBeNull();
    resolve!(null);
  });

  it('renders the cue when no dismissal flag is stored', async () => {
    mockGetItem.mockResolvedValue(null);
    render(<FamilyOrientationCue />);
    await waitFor(() => {
      expect(screen.getByTestId('family-orientation-cue')).toBeTruthy();
    });
  });

  it('does not render when the dismissal flag is set', async () => {
    mockGetItem.mockResolvedValue('true');
    render(<FamilyOrientationCue />);
    // Wait one tick for the effect to settle
    await waitFor(() => {
      expect(screen.queryByTestId('family-orientation-cue')).toBeNull();
    });
  });

  it('writes the dismissal flag and hides on dismiss tap', async () => {
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    render(<FamilyOrientationCue />);
    const cue = await screen.findByTestId('family-orientation-cue');
    expect(cue).toBeTruthy();
    fireEvent.press(screen.getByTestId('family-orientation-cue-dismiss'));
    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(
        'family_orientation_cue_dismissed_v1',
        'true'
      );
      expect(screen.queryByTestId('family-orientation-cue')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/family/FamilyOrientationCue.test.tsx --no-coverage`
Expected: FAIL with "Cannot find module './FamilyOrientationCue'".

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/family/FamilyOrientationCue.tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from '../../lib/secure-storage';

const STORAGE_KEY = 'family_orientation_cue_dismissed_v1';

export function FamilyOrientationCue(): React.ReactElement | null {
  const { t } = useTranslation();
  const [state, setState] = React.useState<'pending' | 'show' | 'hide'>(
    'pending'
  );

  React.useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(STORAGE_KEY)
      .then((value) => {
        if (cancelled) return;
        setState(value === 'true' ? 'hide' : 'show');
      })
      .catch(() => {
        if (cancelled) return;
        setState('show');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = React.useCallback(() => {
    setState('hide');
    void SecureStore.setItemAsync(STORAGE_KEY, 'true').catch(() => {
      /* non-fatal — worst case the cue shows once more on next launch */
    });
  }, []);

  if (state !== 'show') return null;

  return (
    <View
      className="bg-surface-elevated rounded-card px-4 py-3.5 mt-2 mb-3"
      testID="family-orientation-cue"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary mb-1">
        {t('family.orientationCueTitle')}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-3">
        {t('family.orientationCueBody')}
      </Text>
      <Pressable
        onPress={handleDismiss}
        className="self-start"
        testID="family-orientation-cue-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t('family.orientationCueDismiss')}
        hitSlop={8}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('family.orientationCueDismiss')}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/family/FamilyOrientationCue.test.tsx --no-coverage`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mount the cue inside `family.tsx`**

In `apps/mobile/src/app/(app)/family.tsx`, import the cue:

```tsx
import { FamilyOrientationCue } from '../../components/family/FamilyOrientationCue';
```

Inside the `ScrollView` body, place `<FamilyOrientationCue />` immediately above the demo banner / children list — i.e. before the `dashboardLoading || (!dashboard && !isError)` ternary block. The cue self-hides while loading, so order doesn't risk a flash.

- [ ] **Step 6: Add a cue-presence test to `family.test.tsx`**

Add inside the existing `describe('FamilyScreen', ...)` block:

```tsx
it('mounts the FamilyOrientationCue inside the screen', async () => {
  // Mock SecureStore at the top of family.test.tsx so the cue resolves to
  // its visible state during render. (Place the mock alongside the existing
  // top-level mocks; do not re-mock per-test.)
  //   jest.mock('../../lib/secure-storage', () => ({
  //     getItemAsync: jest.fn().mockResolvedValue(null),
  //     setItemAsync: jest.fn().mockResolvedValue(undefined),
  //   }));
  render(<FamilyScreen />);
  expect(await screen.findByTestId('family-orientation-cue')).toBeTruthy();
});
```

The cue's own test (`FamilyOrientationCue.test.tsx`) covers the SecureStore branches in detail; this assertion only proves the wiring (cue is mounted by the screen). If the SecureStore mock cannot be added at the top of `family.test.tsx` without breaking other tests, scope it inside this single `it` via `jest.doMock` + `jest.isolateModules` rather than dropping the assertion.

- [ ] **Step 7: Run all three test files**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/family.test.tsx src/components/family/FamilyOrientationCue.test.tsx --no-coverage`
Expected: PASS.

- [ ] **Step 8: Commit (using `/commit`)**

```
feat(mobile): add FamilyOrientationCue first-visit dismissible cue
```

---

## Task 4: Mount Family in the bottom-tab whitelist (conditional)

This task makes the tab actually appear in the bar, but only when the user has linked children. When they don't, the tab is hidden via `href: null` exactly like other non-whitelisted routes — so the `(app)` layout's auto-hide pattern still holds.

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx`

- [ ] **Step 1: Add `family` to the visible-tab whitelist conditionally**

In `apps/mobile/src/app/(app)/_layout.tsx`:

a. Import the new hook at the top:

```tsx
import { useFamilyPresence } from '../../hooks/use-family-presence';
```

b. Find the existing `VISIBLE_TABS` constant:

```tsx
const VISIBLE_TABS = new Set(['home', 'library', 'progress', 'more']);
```

Replace it with a derivation. Keep the original as an immutable base; extract the per-render derivation into a small exported pure function so it can be unit-tested directly without fighting the Expo Router Tabs mock:

```tsx
const BASE_VISIBLE_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);

export function computeVisibleTabs(hasFamily: boolean): ReadonlySet<string> {
  if (!hasFamily) return BASE_VISIBLE_TABS;
  return new Set([...BASE_VISIBLE_TABS, 'family']);
}
```

c. Inside `AppLayout`, after the existing `useParentProxy` line, add:

```tsx
const { hasFamily } = useFamilyPresence();
const visibleTabs = React.useMemo(
  () => computeVisibleTabs(hasFamily),
  [hasFamily]
);
```

d. In the `screenOptions` callback, replace the `VISIBLE_TABS.has(route.name)` reference with `visibleTabs.has(route.name)`.

e. Add the icon mapping. In the `iconMap` constant near the top, add:

```tsx
Family: { focused: 'people', default: 'people-outline' },
```

f. Inside the `<Tabs>` JSX, add a new `Tabs.Screen` between `progress` and `more`:

```tsx
<Tabs.Screen
  name="family"
  options={{
    title: t('tabs.family'),
    tabBarButtonTestID: 'tab-family',
    tabBarAccessibilityLabel: t('tabs.familyLabel'),
    tabBarIcon: ({ focused }) => (
      <TabIcon name="Family" focused={focused} />
    ),
  }}
/>
```

g. Verify by reading: when `hasFamily` is `false`, the `screenOptions` callback returns `href: null, tabBarItemStyle: { display: 'none' }` for the `family` route (same path as any other non-whitelisted route), so it is invisible. When `hasFamily` is `true`, it renders with the icon and label.

- [ ] **Step 2: Add tab-visibility tests**

In `apps/mobile/src/app/(app)/_layout.test.tsx`, find an existing top-level `describe` block. Add a new block that asserts the pure derivation directly — no `jest.doMock`, no `jest.resetModules`, no fighting the Tabs mock:

```tsx
import { computeVisibleTabs } from './_layout';

describe('computeVisibleTabs', () => {
  it('returns the base 4-tab set when hasFamily=false', () => {
    const tabs = computeVisibleTabs(false);
    expect([...tabs].sort()).toEqual(['home', 'library', 'more', 'progress']);
  });

  it('adds the family tab when hasFamily=true', () => {
    const tabs = computeVisibleTabs(true);
    expect(tabs.has('family')).toBe(true);
    expect([...tabs].sort()).toEqual([
      'family',
      'home',
      'library',
      'more',
      'progress',
    ]);
  });

  it('never mutates the base set across calls', () => {
    const a = computeVisibleTabs(false);
    const b = computeVisibleTabs(true);
    // Calling with true must not have leaked 'family' into a future hasFamily=false call.
    expect(computeVisibleTabs(false).has('family')).toBe(false);
    expect(a.has('family')).toBe(false);
    expect(b.has('family')).toBe(true);
  });
});
```

This proves the rule that drives tab mounting without rendering the layout. The full screen-render integration is covered indirectly via Task 7 manual verification.

- [ ] **Step 3: Run all _layout tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/_layout.test.tsx --no-coverage`
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit (using `/commit`)**

```
feat(mobile): mount Family bottom tab conditional on linked children
```

---

## Task 5: Switch `FAMILY_HOME_PATH` constant + redirect `/dashboard`

This is the cutover task. After this task, every consumer of `FAMILY_HOME_PATH` (`more.tsx`, `ParentGateway.tsx` if it imports the constant, anything else) routes to `/family`. Direct `/dashboard` deep links still work via redirect.

**Files:**
- Modify: `apps/mobile/src/lib/navigation.ts`
- Modify: `apps/mobile/src/lib/navigation.test.ts`
- Modify: `apps/mobile/src/app/(app)/dashboard.tsx`
- Modify: `apps/mobile/src/app/(app)/dashboard.test.tsx`
- Modify: `apps/mobile/src/components/home/ParentGateway.tsx` (if it uses a literal `/(app)/dashboard`)
- Modify: `apps/mobile/src/components/home/ParentGateway.test.tsx`

- [ ] **Step 1: Update `navigation.ts`**

```typescript
// apps/mobile/src/lib/navigation.ts (line 4)
export const FAMILY_HOME_PATH = '/(app)/family';
```

Update the comment if any (none currently).

- [ ] **Step 2: Update `navigation.test.ts` assertion**

```typescript
it('exports FAMILY_HOME_PATH for family-facing navigation', () => {
  expect(FAMILY_HOME_PATH).toBe('/(app)/family');
});
```

- [ ] **Step 3: Run navigation tests to confirm**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 4: Replace `dashboard.tsx` body with a redirect**

```tsx
// apps/mobile/src/app/(app)/dashboard.tsx
import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';

/**
 * /(app)/dashboard is preserved as an indefinite redirect to /(app)/family.
 * Any deep link or external entry that still points at /dashboard
 * (push notifications, bookmarks, third-party links) lands users on the
 * canonical route. Per spec line 163: "indefinite redirect to /family,
 * with 90-day deprecation cycle if ever sunset."
 *
 * The returnTo query param is preserved so the back button on /family
 * still respects the originating tab.
 */
export default function DashboardRedirect(): React.ReactElement {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnToValue = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const href: Href = returnToValue
    ? { pathname: '/(app)/family', params: { returnTo: returnToValue } }
    : '/(app)/family';

  return <Redirect href={href} />;
}
```

- [ ] **Step 5: Replace `dashboard.test.tsx` with redirect-only coverage**

```tsx
// apps/mobile/src/app/(app)/dashboard.test.tsx
import { render } from '@testing-library/react-native';
import React from 'react';
import DashboardRedirect from './dashboard';

const mockUseLocalSearchParams = jest.fn();
const mockRedirect = jest.fn(({ href }) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props);
    return null;
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('DashboardRedirect (legacy /dashboard route)', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReset();
    mockRedirect.mockReset();
  });

  it('redirects to /(app)/family when no returnTo is provided', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    render(<DashboardRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(app)/family' });
  });

  it('preserves a string returnTo param', () => {
    mockUseLocalSearchParams.mockReturnValue({ returnTo: 'home' });
    render(<DashboardRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({
      href: { pathname: '/(app)/family', params: { returnTo: 'home' } },
    });
  });

  it('uses the first element when returnTo arrives as an array', () => {
    mockUseLocalSearchParams.mockReturnValue({ returnTo: ['more', 'extra'] });
    render(<DashboardRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({
      href: { pathname: '/(app)/family', params: { returnTo: 'more' } },
    });
  });
});
```

- [ ] **Step 6: Update `ParentGateway.tsx`**

`apps/mobile/src/components/home/ParentGateway.tsx:122` currently reads:

```tsx
router.push('/(app)/dashboard?returnTo=home' as never)
```

`FAMILY_HOME_PATH` is path-only — the query string must be concatenated. Import the constant and update to:

```tsx
import { FAMILY_HOME_PATH } from '../../lib/navigation';
// ...
router.push(`${FAMILY_HOME_PATH}?returnTo=home` as never)
```

(`as never` is preserved because `home.tsx` and `ParentGateway.tsx` already cast at this site; tightening to `as Href` is out of scope.)

- [ ] **Step 7: Update `ParentGateway.test.tsx`**

`apps/mobile/src/components/home/ParentGateway.test.tsx:125` asserts `'/(app)/dashboard?returnTo=home'`. Update to `'/(app)/family?returnTo=home'`.

- [ ] **Step 8: Update `more.tsx` and `more.test.tsx`**

`apps/mobile/src/app/(app)/more.tsx:610` has a literal `'/(app)/dashboard?returnTo=more'` despite the file already importing `FAMILY_HOME_PATH` (line 49). Update to `` `${FAMILY_HOME_PATH}?returnTo=more` ``.

`apps/mobile/src/app/(app)/more.test.tsx:282` asserts `expect(mockPush).toHaveBeenCalledWith('/(app)/dashboard')`. Update to `'/(app)/family'`. (If a sibling assertion targets the `?returnTo=more` variant, update it to `'/(app)/family?returnTo=more'`.)

- [ ] **Step 9: Update `child/*` route files**

These six files contain hardcoded `/(app)/dashboard` literals that survive the constant flip but route through the redirect (double-hop). Replace each with `FAMILY_HOME_PATH`:

- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:288` — `router.replace('/(app)/dashboard' as never)` → `router.replace(FAMILY_HOME_PATH as never)`
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` — three occurrences (lines 85, 256, 345)
- `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx:53`
- `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx` — two occurrences (lines 99, 138)

Each file must add `import { FAMILY_HOME_PATH } from '../../../../lib/navigation';` (relative depth varies per file — count the segments). Update any co-located test assertions in the same pass.

- [ ] **Step 10: Run all affected tests**

Run:
```
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/lib/navigation.test.ts \
  src/app/(app)/dashboard.test.tsx \
  src/app/(app)/family.test.tsx \
  src/app/(app)/more.test.tsx \
  src/components/home/ParentGateway.test.tsx \
  src/app/(app)/child \
  --no-coverage
```

Expected: PASS across all affected files.

- [ ] **Step 11: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 12: Commit (using `/commit`)**

```
feat(mobile): switch FAMILY_HOME_PATH to /family, redirect /dashboard, sweep literals
```

---

## Task 6: Verification sweep — confirm no remaining hard-coded `/(app)/dashboard` references

The cleanup is performed in Task 5 (steps 6–9) so the constant flip and the literal sweep ship together — per "Sweep when you fix" (CLAUDE.md → Fix Development Rules) and per the spec's intent that `/dashboard` survives only as the redirect file.

This task is a **verification pass**: re-grep to confirm Task 5 didn't miss anything, and only commit if it did.

- [ ] **Step 1: Grep for non-test stragglers**

Run from the repo root:

```
rg -n "/\(app\)/dashboard" apps/mobile/src --glob '!*.test.*'
```

Expected results (and only these):
- `apps/mobile/src/app/(app)/dashboard.tsx` — the legitimate redirect target inside `<Redirect href={...} />` and JSDoc comments.

NOT expected (would indicate Task 5 missed a site):
- `more.tsx`, `ParentGateway.tsx`, any `child/*` route file, or any other source file outside `dashboard.tsx`.
- `lib/navigation.ts` (`FAMILY_HOME_PATH` should now read `/(app)/family`).

If anything else is reported, return to Task 5 step 9 and update it before committing this task.

- [ ] **Step 2: Grep for the bare path used as a literal**

```
rg -n '"dashboard"' apps/mobile/src --glob '*.tsx' --glob '!*.test.*'
```

Inspect each match. The `_layout.tsx` `Tabs.Screen` for `name="dashboard"` is **not present** in our updated layout (we never added one — the file is auto-hidden because `dashboard` isn't in `BASE_VISIBLE_TABS`). If a phantom `Tabs.Screen name="dashboard"` appears, it predates this plan and is unrelated; leave it alone.

- [ ] **Step 3: Grep for test fixtures**

```
rg -n '/\(app\)/dashboard' apps/mobile/src --glob '*.test.*'
```

Expected results:
- `apps/mobile/src/app/(app)/dashboard.test.tsx` — asserts the redirect *target* path inside `<Redirect>` calls. Literals here are correct (the test verifies behaviour of the redirect itself).

NOT expected:
- Any `more.test.tsx`, `ParentGateway.test.tsx`, or `child/*.test.tsx` literals. If found, Task 5 missed an assertion update — fix it before committing this task.

- [ ] **Step 4: Run the broader test suite for the app folder**

Run: `cd apps/mobile && pnpm exec jest src/app --no-coverage`
Expected: PASS.

- [ ] **Step 5: Run lint over mobile**

Run: `pnpm exec nx lint mobile`
Expected: 0 errors (warnings tolerated only if pre-existing on main).

- [ ] **Step 6: Commit (using `/commit`) — only if the verification surfaced fixes**

If steps 1–3 surfaced any missed literals that you corrected here:

```
chore(mobile): sweep stragglers from /dashboard → /family migration
```

If the sweep was clean, no commit — note this fact in the next conversation turn.

---

## Task 7: Manual verification on a real device or emulator

Type-checking and unit tests verify code correctness, not feature correctness. Per CLAUDE.md → "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete."

- [ ] **Step 1: Start the mobile dev server**

Use the project's standard dev launcher (one of the Doppler-wrapped commands or `expo start` per `.claude/launch.json` `mobile` target).

- [ ] **Step 2: Verify with no children (parent-only or solo profile)**

Sign in / switch to a profile with `family_links` empty.
- Confirm the bottom-tab bar shows exactly **4 tabs**: Home, Library, Progress, More. No Family tab.
- Confirm `useFamilyPresence().hasFamily` is `false` even though `useDashboard` falls back to `/dashboard/demo` and returns one fake child. (Use the React DevTools or a temporary `console.log` if needed; remove before commit.)
- Confirm the More tab does NOT render the cross-link to "Family" — `more.tsx` already gates on having children, so the link should be absent. If the link appears for a no-child profile, that's a separate bug pre-dating this plan; flag it but do not fix here.

- [ ] **Step 3: Verify with one or more linked children**

Switch to a parent profile that has at least one child.
- Confirm the bottom-tab bar shows **5 tabs**: Home, Library, Progress, Family, More.
- Tap Family. Expected: the children list renders, identical to the previous `/dashboard` rendering.
- The `FamilyOrientationCue` is visible at the top on the very first visit (assuming SecureStore is empty for that key). Tap "Got it" — cue disappears, does not return on subsequent visits.
- Kill the app, relaunch, navigate to Family — cue stays dismissed.

- [ ] **Step 4: Verify the legacy `/dashboard` redirect**

In a deep-link-capable build, navigate to `/(app)/dashboard?returnTo=more` directly (use the dev menu, a typed URL on web, or an `adb shell am start` deep link on Android).
- Expected: lands on `/family` with the back button respecting the `more` returnTo.

- [ ] **Step 5: Verify Home → Family transition**

From Home, use any "Check child's progress" intent card or `more.tsx` cross-link — should land on Family without bouncing through `/dashboard`. Verify by inspecting the URL on web; on native, verify back-button behavior follows the new path.

- [ ] **Step 6: Verify icon distinctness in the tab bar**

Inspect the tab bar visually with all 5 tabs visible. Confirm `people-outline` (Family) is visually distinct from the other four icons (`home-outline`, `book-outline`, `stats-chart-outline`, `menu-outline`). If two icons read as a near-collision at thumbnail size, swap Family to a less ambiguous Ionicon (`person-add-outline` or similar).

- [ ] **Step 7: Verify proxy/impersonation suppresses the tab**

Switch to a child profile via the parent's proxy flow (the ProxyBanner appears at the top). Confirm the Family tab is hidden during proxy — the rule is parent-seat surface only.

- [ ] **Step 8: If any verification fails, fix the underlying cause and re-run.** Do not loosen tests or take shortcuts.

- [ ] **Step 9: Final commit only if Steps 1–7 surfaced changes**

If verification surfaced any code change, commit it via `/commit`. If verification was clean, no commit needed.

---

## Acceptance criteria (subset of spec § Phase 2 acceptance)

These are the criteria from the spec that PR 6 alone meets. Verify each before declaring the plan complete:

1. **Family tab appears on next render after a parent adds their first child.** Confirmed in Task 7 Step 3.
2. **First visit to Family tab shows a single dismissible orientation cue.** Confirmed in Task 7 Step 3 + FamilyOrientationCue tests.
3. **The Family tab is hidden for parent-only / solo / child profiles with no linked children.** Confirmed in Task 7 Step 2.
4. **Legacy `/dashboard` deep links continue to work via redirect.** Confirmed in Task 7 Step 4.
5. **No CSS `text-transform: uppercase` introduced** for any user-facing string. The new `FamilyOrientationCue` and `family.tsx` use sentence case at source — verify by reading the JSX.

Spec acceptance items 4–10 are out of scope for this plan (they cover PR 5, 7, 9 territory).

## Audit bugs closed

- BUG-896: nav burial — Family tab promotes child management to top-level.
- BUG-897: scattered child management surfaces — Family becomes the single home.
- BUG-905: hardcoded back-to-`/more`. Already partially closed by `returnTo` plumbing in `dashboard.tsx`; this plan preserves that plumbing on `family.tsx`.

## Failure modes

Per CLAUDE.md UX Resilience rule "Spec failure modes before coding". Every state below has a Recovery cell — if any cannot be filled, the design is incomplete.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `useDashboard` returns 5xx on initial launch (parent with kids) | API outage or auth blip | 4-tab bar (no Family). `home.tsx` ParentGateway shows its existing dashboard error retry | Tap retry on ParentGateway error card → on success, tab bar re-renders with 5 tabs. No code-level recovery needed; existing error surface handles it. |
| `useDashboard` returns 5xx on initial launch (child profile) | API outage | 4-tab bar (no Family — correct, since role gate would suppress it anyway) | None needed; child-profile UX is unchanged. |
| Active profile switches parent → child mid-session | User tap on profile switcher | Family tab disappears on next render. If user was on `/(app)/family`, they remain on the screen but the tab button vanishes | After switch, Expo Router still has the screen mounted but no tab button. Add to Task 7 step 7: confirm `goBackOrReplace(router, '/(app)/home')` is the recovery if the user was viewing Family at switch time. If not already wired, add a `useEffect` in `family.tsx` that redirects to `/(app)/home` when `useFamilyPresence().hasFamily` flips to `false`. |
| Active profile switches child → parent (with kids) | User tap on profile switcher | 4-tab → 5-tab transition; Family tab appears | None — orientation cue handles the announcement. |
| SecureStore unavailable for `FamilyOrientationCue` (corrupted/locked) | Device-level SecureStore fault | Cue may show on every launch | Per `FamilyOrientationCue.tsx` Step 3 catch block: on read error, show the cue (fail-open). On write error, swallow silently (worst case: cue shows once more). Both branches are tested. |
| Cold launch race: parent with kids, dashboard query in flight | First app launch after sign-in | 4 tabs render briefly → 5 tabs render after dashboard resolves (~200–800ms) | Acceptable per spec line 56 *"announced when added"*. Mitigation deferred (see follow-up below) — cache last-known `hasFamily` to SecureStore for an instant 5-tab seed. |
| Deep link to `/(app)/dashboard?returnTo=foo` after cutover | External entry (push, bookmark) | Brief mount of `DashboardRedirect`, then `/family?returnTo=foo` | `<Redirect>` handles synchronously; covered by `dashboard.test.tsx` redirect tests. |
| Proxy/impersonation session active | Parent viewing child via proxy | Family tab hidden (suppressed by `useFamilyPresence` role check) | None needed. Verified in Task 7 Step 7. |

## Risks and rollback

- **Risk: tab-bar layout regression on small phones (5.8" Galaxy S10e, per memory).** A 5-tab bar leaves less width per item. Verify in Task 7 that no tab label is clipped on the smallest device. If clipping occurs, drop the `tabBarLabelStyle.fontSize` from 12 to 11 for that build, or shorten the "Family" label.
- **Risk: cold-launch tab-bar flicker.** First-launch behavior is: 4 tabs render → `useDashboard` resolves → tab bar re-renders with 5 tabs. Acceptable per spec but conspicuous on every launch. **Follow-up:** stash last-known `hasFamily` in SecureStore (key `family_presence_cached_v1`) and seed `useFamilyPresence` with it for an instant 5-tab render. Out of scope for this plan; tracked as a refinement.
- **Risk: orphan `dashboard.*` i18n keys.** The redirect is indefinite, and `family.tsx` keeps using most `dashboard.*` keys. We accept the orphan for now (see "Not modified (intentional)"). Cleanup is a follow-up if/when the redirect is sunset.
- **Rollback: revert all commits from Tasks 1–6 in reverse order.** No DB changes. No API changes. No persisted state survives uninstall. The SecureStore key (`family_orientation_cue_dismissed_v1`) is harmless to leave behind even if the feature reverts.

## Out of scope (explicit deferrals)

- PR 5 — Privacy & Lenses panel and per-profile notifications.
- PR 6b — Withdrawal-consent grace countdown banner + 24h push notification.
- PR 7 — Multi-lens Home (gated on telemetry).
- PR 9 — Soft-state lens rendering.
- Renaming the `/child/[profileId]/*` URL prefix (spec line 61 — explicitly out of scope across all phases).
- Adding a "family pool / subscription summary" section inside `/family` (spec line 158 mentions it; that is a future enhancement once the per-profile quota work from Phase 1 PR 2 ships).
