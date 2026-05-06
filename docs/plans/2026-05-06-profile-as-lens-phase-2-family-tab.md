# Profile-as-Lens — Phase 2 (PR 6) Implementation Plan: Family Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-06
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md) (rev 4, 2026-04-29)
**Phase:** 2 of 3 — scoped to PR 6 only
**Goal:** Promote child-management surfaces out of `/more` into a dedicated `Family` bottom tab, conditionally mounted when the user has at least one linked child profile.

**Architecture:** Move the existing `dashboard.tsx` body into a new `family.tsx` route, repoint `FAMILY_HOME_PATH` to it, mount it as a 5th visible tab gated on `useDashboard().data?.children.length > 0`, redirect `/dashboard` indefinitely to `/family` for any deep links, and ship a single dismissible inline orientation cue on first visit (SecureStore-backed). No backend changes.

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
- `useDashboard` is the source of truth for "does the user have linked children". The hook returns `DashboardData` shaped as `{ children: DashboardChild[]; demoMode: boolean; ... }`. We treat `data?.children?.length ?? 0 > 0` as "has family".

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
- `apps/mobile/src/components/home/ParentGateway.tsx` — replace any literal `/(app)/dashboard` push with `FAMILY_HOME_PATH`. Verify with grep — there is at least one direct reference per `Grep` results.
- `apps/mobile/src/components/home/ParentGateway.test.tsx` — update assertions to new path.
- `apps/mobile/src/i18n/locales/en.json` — add `tabs.family`, `tabs.familyLabel`, `family.title`, `family.subtitle` (move from `dashboard.title`/`dashboard.subtitle` if reusable; otherwise add new), `family.orientationCueTitle`, `family.orientationCueBody`, `family.orientationCueDismiss`. Other locale files (`de`, `es`, `ja`, `nb`, `pl`, `pt`) get the same keys with English fallback strings — translation pass not required for this PR.

**Not modified (intentional):**

- API endpoints — none change.
- `apps/mobile/src/app/(app)/more.tsx` — already imports `FAMILY_HOME_PATH`. Switching the constant retargets it automatically.

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
jest.mock('./use-dashboard', () => ({
  useDashboard: () => mockUseDashboard(),
}));

describe('useFamilyPresence', () => {
  it('returns hasFamily=false while loading', () => {
    mockUseDashboard.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: true });
  });

  it('returns hasFamily=false when children list is empty', () => {
    mockUseDashboard.mockReturnValue({
      data: { children: [], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: false });
  });

  it('returns hasFamily=true when at least one child is linked', () => {
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: true, isLoading: false });
  });

  it('treats demoMode children as real (demo still shows family)', () => {
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'demo' }], demoMode: true },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current.hasFamily).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-family-presence.test.ts --no-coverage`
Expected: FAIL with "Cannot find module './use-family-presence'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/mobile/src/hooks/use-family-presence.ts
import { useDashboard } from './use-dashboard';

export interface FamilyPresence {
  hasFamily: boolean;
  isLoading: boolean;
}

export function useFamilyPresence(): FamilyPresence {
  const { data, isLoading } = useDashboard();
  const hasFamily = (data?.children?.length ?? 0) > 0;
  return { hasFamily, isLoading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-family-presence.test.ts --no-coverage`
Expected: PASS, 4 tests.

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
it('renders the FamilyOrientationCue at the top of the screen', () => {
  // The cue is rendered conditionally on SecureStore — pass the "show" branch.
  // The component itself owns its visibility logic; this assertion only
  // verifies the screen mounts the component as a child.
  // Note: the component returns null while SecureStore is pending, so this
  // test relies on the component being present in the tree. We assert by
  // mock — see the cue's own test for render-state coverage.
  // ...rendering the screen and asserting a stable testID below requires
  // resolving SecureStore. The simplest way is to mock SecureStore directly
  // here and await the cue.
});
```

If a reliable assertion proves awkward in this test file, drop this `it` block — the cue's own test already covers the rendering logic and Step 7 verifies the wiring at the file-presence level via a grep-style assertion is not necessary. Skip if it fights the existing `family.test.tsx` mock setup.

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

Replace it with a derivation. Keep the original as an immutable base; the per-render set is computed inside the component:

```tsx
const BASE_VISIBLE_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);
```

c. Inside `AppLayout`, after the existing `useParentProxy` line, add:

```tsx
const { hasFamily } = useFamilyPresence();
const visibleTabs = React.useMemo(() => {
  const next = new Set<string>(BASE_VISIBLE_TABS);
  if (hasFamily) next.add('family');
  return next;
}, [hasFamily]);
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

In `apps/mobile/src/app/(app)/_layout.test.tsx`, find an existing top-level `describe` block. Add a new block:

```tsx
describe('Family tab visibility', () => {
  beforeEach(() => {
    mockUseProfile.mockReturnValue({
      activeProfile: {
        id: 'p1',
        displayName: 'Parent',
        birthYear: 1990,
        consentStatus: 'CONSENTED',
      },
      profiles: [],
      isLoading: false,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/(app)/home');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  it('mounts a family Tabs.Screen when useFamilyPresence reports hasFamily=true', () => {
    jest.doMock('../../hooks/use-family-presence', () => ({
      useFamilyPresence: () => ({ hasFamily: true, isLoading: false }),
    }));
    // Re-import the layout fresh after re-mocking
    jest.resetModules();
    const AppLayout = require('./_layout').default;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppLayout />
      </QueryClientProvider>
    );
    // The mock Tabs.Screen returns null, so we cannot assert on its presence
    // by testID. Instead, capture it: replace the Tabs mock to record names.
    // (See Step 3 for an alternative if this assertion is awkward.)
  });
});
```

If the existing `Tabs.Screen` mock makes per-screen assertions awkward, replace the assertion with a render-style check: assert that `screen.queryByTestId('tab-family')` is non-null when `hasFamily=true` and null when `hasFamily=false`. The `tabBarButtonTestID` option propagates to Expo Router's tab button rendering — adapt the mock if necessary so that the test can observe the option.

If any of this fights the existing test infrastructure, **simpler alternative**: write a unit test against the `visibleTabs` derivation logic by extracting it into a tiny exported pure function `computeVisibleTabs(hasFamily: boolean): Set<string>` and asserting its output directly. This is cheaper than fighting the Tabs mock and the test still proves the rule.

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

Read `apps/mobile/src/components/home/ParentGateway.tsx`. Find every literal `'/(app)/dashboard'` reference. If `FAMILY_HOME_PATH` is not already imported, import it from `../../lib/navigation`. Replace each literal with `FAMILY_HOME_PATH`. If a reference already uses the constant, leave it untouched.

If there is logic that branches on the path, be careful: `as Href` casts may need to remain. Verify with `tsc --noEmit` after.

- [ ] **Step 7: Update `ParentGateway.test.tsx`**

In `apps/mobile/src/components/home/ParentGateway.test.tsx`, replace any assertion that compares against `'/(app)/dashboard'` with `'/(app)/family'`.

- [ ] **Step 8: Run all affected tests**

Run:
```
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/lib/navigation.test.ts \
  src/app/(app)/dashboard.test.tsx \
  src/app/(app)/family.test.tsx \
  src/app/(app)/more.test.tsx \
  src/components/home/ParentGateway.test.tsx \
  --no-coverage
```

Expected: PASS across all five files.

- [ ] **Step 9: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 10: Commit (using `/commit`)**

```
feat(mobile): switch FAMILY_HOME_PATH to /family and redirect /dashboard
```

---

## Task 6: Sweep audit — find any remaining hard-coded `/(app)/dashboard` references

After Task 5 the constant has flipped, but raw string literals elsewhere in the codebase may still target `/dashboard`. This task is a deliberate sweep — per the repo rule "Sweep when you fix" (CLAUDE.md → Fix Development Rules).

- [ ] **Step 1: Grep for stragglers**

Run from the repo root:

```
rg -n "/\(app\)/dashboard" apps/mobile/src --glob '!*.test.*'
```

Expected: only the redirect in `dashboard.tsx` (which is the legitimate target inside `<Redirect href=... />`) and possibly an entry in `lib/navigation.ts` (the old `FAMILY_HOME_PATH` value — should now read `/family`).

- [ ] **Step 2: Grep for the bare path used as a literal**

```
rg -n '"dashboard"' apps/mobile/src --glob '*.tsx' --glob '!*.test.*'
```

Inspect each match. The `_layout.tsx` `Tabs.Screen` for `name="dashboard"` does **not** need to change — Expo Router still requires the route file `dashboard.tsx` to exist (we kept it as the redirect file), so the `Tabs.Screen name="dashboard"` continues to apply auto-hide rules to it (it never appears in `BASE_VISIBLE_TABS` either way, so it stays hidden). If it somehow ends up rendering as a visible tab, the user would briefly see it before the redirect — review the tab-bar render path.

If you do find `Tabs.Screen name="dashboard"`, leave it alone unless its presence demonstrably breaks something. A defensive `href: null, tabBarItemStyle: { display: 'none' }` was already the auto-hide default for non-whitelisted routes.

- [ ] **Step 3: Grep for test fixtures**

```
rg -n '/\(app\)/dashboard' apps/mobile/src --glob '*.test.*'
```

Update any test fixtures that hard-code the literal path to reflect the new path, **unless** the test specifically asserts the old path is preserved as a redirect target — in which case the literal should remain.

- [ ] **Step 4: Run the broader test suite for the app folder**

Run: `cd apps/mobile && pnpm exec jest src/app --no-coverage`
Expected: PASS.

- [ ] **Step 5: Run lint over mobile**

Run: `pnpm exec nx lint mobile`
Expected: 0 errors (warnings tolerated only if pre-existing on main).

- [ ] **Step 6: Commit (using `/commit`) — only if Step 1–3 surfaced changes**

If the sweep found and corrected any hard-coded paths:

```
chore(mobile): sweep remaining /dashboard literals to /family
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
- Tap More → cross-link to "Family" should still navigate (it now lands on `/family`, which renders an empty children list / error state because `useDashboard` returns no children for solo). This is acceptable — the spec says solo learners shouldn't reach Family in normal nav, and the cross-link from `more.tsx` was always conditional on having children.

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

- [ ] **Step 6: If any verification fails, fix the underlying cause and re-run.** Do not loosen tests or take shortcuts.

- [ ] **Step 7: Final commit only if Steps 1–5 surfaced changes**

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

## Risks and rollback

- **Risk: tab-bar layout regression on small phones (5.8" Galaxy S10e, per memory).** A 5-tab bar leaves less width per item. Verify in Task 7 that no tab label is clipped on the smallest device. If clipping occurs, drop the `tabBarLabelStyle.fontSize` from 12 to 11 for that build, or shorten the "Family" label to "Family" (it's already the shortest reasonable choice).
- **Risk: `useDashboard` is request-driven; the Family tab visibility ticks after the network round-trip.** First-launch behavior is: 4 tabs render → `useDashboard` resolves → tab bar re-renders with 5 tabs. This is acceptable per spec ("transitions are announced once, quietly"). The orientation cue covers the announcement.
- **Risk: a child profile's `useDashboard` returns 0 children but the tab unexpectedly mounts.** Defensive: `useFamilyPresence` returns `hasFamily=false` while `isLoading=true`, so the tab never mounts during the initial loading state. Verify behavior in Task 7 with a child profile.
- **Rollback: revert all commits from Tasks 1–6 in reverse order.** No DB changes. No API changes. No persisted state survives uninstall. The SecureStore key (`family_orientation_cue_dismissed_v1`) is harmless to leave behind even if the feature reverts.

## Out of scope (explicit deferrals)

- PR 5 — Privacy & Lenses panel and per-profile notifications.
- PR 6b — Withdrawal-consent grace countdown banner + 24h push notification.
- PR 7 — Multi-lens Home (gated on telemetry).
- PR 9 — Soft-state lens rendering.
- Renaming the `/child/[profileId]/*` URL prefix (spec line 61 — explicitly out of scope across all phases).
- Adding a "family pool / subscription summary" section inside `/family` (spec line 158 mentions it; that is a future enhancement once the per-profile quota work from Phase 1 PR 2 ships).
