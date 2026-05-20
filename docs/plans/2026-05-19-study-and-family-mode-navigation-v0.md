# Study And Family Mode Navigation v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a client-only Study/Family mode split for family-capable adults — adds an in-memory mode context, mode-aware tab shell, mode-scoped query keys, Family home with recent-child-activity, and a single-chokepoint child-route guard. No DB migration, no API change.

**Architecture:** Mode state lives in a new `AppContextProvider` (React context) mounted after `ProfileProvider`. Capability is derived from already-loaded `Profile` data via `isFamilyCapableProfile()`. The `(app)/_layout.tsx` tab shell composes visible tabs via a fixed precedence: proxy > boot-null > family-capable-mode > legacy shape. Cache leak between modes is prevented by adding a `mode` segment to mode-scoped query-key factories plus a `MODE_SCOPED_KEYS` predicate invalidation on switch. Child-route guard wraps `child/[profileId]/_layout.tsx` once so every nested child route is gated.

**Tech Stack:** Expo Router, React Native, TanStack Query, Jest (co-located tests).

**Spec source of truth:** `docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md`. When this plan and the spec disagree, the spec wins — pause and amend.

---

## Conventions Used Throughout

- **Working directory:** `apps/mobile` for jest runs unless noted.
- **Test command:** `cd apps/mobile && pnpm exec jest --findRelatedTests <path> --no-coverage` (per CLAUDE.md handy commands). Use `--testPathPattern` for new test files that have no production sibling yet.
- **Typecheck:** `cd apps/mobile && pnpm exec tsc --noEmit`.
- **Lint:** `pnpm exec nx lint mobile`.
- **Commits:** Always via `/commit` (per CLAUDE.md). **Coordinator only** — subagents NEVER run `git add`, `git commit`, `git push`, or `/commit`. Subagents write code, run tests, and report which files they changed; the coordinator runs `/commit` between tasks. (Adversarial Review Pass 2 HIGH-2.)
- **No new internal `jest.mock()`** — use real implementations or `jest.requireActual()` with targeted overrides. External-boundary mocks (Stripe, Clerk JWKS, push) are unaffected. Each test-file edit also triggers GC6 boy-scout sweep — if you see existing `jest.mock('./...')` lines in a file you edit, follow `/my:mockfix` to remove them.
- **Read existing patterns first.** Before writing tests, open one nearby co-located test (e.g. `apps/mobile/src/lib/profile.test.tsx`, `apps/mobile/src/app/(app)/_layout.test.tsx`) to match harness shape (renderHook, providers wrapper, etc.).

---

## File Inventory

### New files

- `apps/mobile/src/lib/app-context.tsx` — `AppContextProvider`, `useAppContext()`.
- `apps/mobile/src/lib/app-context.test.tsx` — co-located unit tests.
- `apps/mobile/src/lib/mode-scoped-keys.ts` — `MODE_SCOPED_KEYS` list + guard.
- `apps/mobile/src/lib/mode-scoped-keys.test.ts` — invariants (non-empty, subset of `PROFILE_SCOPED_KEYS`).
- `apps/mobile/src/components/guards/RequireFamilyContext.tsx` — child-route gate component.
- `apps/mobile/src/components/guards/RequireFamilyContext.test.tsx` — gate behavior tests.

### Modified files

- `apps/mobile/src/lib/profile.ts` — add `isFamilyCapableProfile()`; **move** the inline `PROFILE_SCOPED_KEYS` (currently inside `switchProfile`, `profile.ts:252-307`) to a module-level `const` and export it. **No prefix additions needed** — `'session'` (line 262), `'session-summary'` (264), `'session-transcript'` (265), and `'parking-lot'` (294) are already present (Adversarial Review Pass 2 CRITICAL-1).
- `apps/mobile/src/lib/profile.test.tsx` — `isFamilyCapableProfile` cases; `MODE_SCOPED_KEYS ⊆ PROFILE_SCOPED_KEYS` guard.
- `apps/mobile/src/lib/query-keys.ts` — add `mode` segment to mode-scoped factories per §Task 8 table.
- `apps/mobile/src/lib/query-keys.test.ts` — update expected key shapes.
- `apps/mobile/src/lib/analytics.ts` — no signature change; only callers add a new event name. (Listed in front-matter as a touched-file because §Task 6 calls `track('mode_switched', …)`.)
- `apps/mobile/src/lib/navigation.ts` — add `useGuardFamilyRoute()` helper.
- `apps/mobile/src/app/(app)/_layout.tsx` — add `computeModeVisibleTabs()`; mount `AppContextProvider`; compose tab visibility per Hard Rule #10.
- `apps/mobile/src/app/(app)/_layout.test.tsx` — visible-tab precedence tests.
- `apps/mobile/src/app/(app)/home.tsx` — render mode chip; pass `mode` into `LearnerScreen`.
- `apps/mobile/src/app/(app)/own-learning.tsx` — Route Survival `setMode('study')` for family-capable adult.
- `apps/mobile/src/app/(app)/progress/index.tsx` — mode-aware profile picker; reset `selectedProfileId` to self on Family→Study flip; reject `?profileId=<childId>` deep-link param in Study mode (Adversarial Review Pass 2 CRITICAL-3, CRITICAL-4).
- `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` — wrap with `RequireFamilyContext`.
- `apps/mobile/src/components/home/LearnerScreen.tsx` — accept `mode` prop; mode-driven `showParentHome` branch.
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` — add Recent-child-activity section + adult-study activation card.
- `apps/mobile/src/hooks/use-dashboard.ts` — thread `mode` through dashboard factories.
- `apps/mobile/src/hooks/use-progress.ts` — thread `mode` through progress factories. Also: tighten `enabled` on `useProfileSessions`, `useChildInventory`, `useChildProgressSummary`, `useProfileReports`, `useProfileWeeklyReports` to gate foreign-profile fetches behind `mode === 'family'` (Adversarial Review Pass 2 CRITICAL-3). Without this, a Study-mode user with a stale `selectedProfileId === childId` will fetch child data via `client.dashboard.children[':profileId']` — Hard Rule #2 violation.
- `apps/mobile/src/hooks/use-sessions.ts` — thread `mode` through `sessions.detail`, `sessions.transcript`, `sessions.summary`, `sessions.parkingLot`, `sessions.topicParkingLot` (7 call sites at lines 530, 563, 657, 684, 727, 745). Also: rewrite the 2-element invalidations at lines 218 and 247 per Adversarial Review CRITICAL-1.
- `apps/mobile/src/hooks/use-retry-filing.ts` — rewrite 2-element invalidations at lines 27 and 29 per Adversarial Review CRITICAL-1.

### Files explicitly NOT modified

- `apps/mobile/src/lib/sign-out.ts` — `signOutWithCleanup` already calls `queryClient.clear()` and resets api-client identity; the identity-keyed subscription in `AppContextProvider` handles mode reset. (Removed from front-matter per Adversarial Review LOW-2 / MEDIUM-5.)
- API, schema, migration files — none touched in v0.

---

## Task 0: Feature flag for kill-switch rollback

**Why this task exists.** v0 is a probe. Pre-launch, ship-then-flip is cheaper than ship-then-revert-PR. Adding a single env-driven flag at the entry chokepoint lets the user OTA the feature off in ~5 min without code edits or store re-submission. `project_pre_launch_no_users.md` says we have no users to protect, so the flag is purely for *operator* (=user) ergonomics during dogfooding.

**Files:**
- Modify: `apps/mobile/src/lib/feature-flags.ts` — add the new flag.
- Modify: `apps/mobile/.env.example` — document the env var.
- Doppler (no file edit) — add `EXPO_PUBLIC_ENABLE_MODE_NAV` to all environments (dev/stg/prd) via the Doppler CLI; `pnpm env:sync` then propagates to `eas.json` build profiles.

**Gate sites (read in this task, applied in later tasks):**

1. `AppContextProvider` (Task 2) — when flag is off, `mode` stays `null` forever; `setMode` is a no-op. All downstream consumers that already condition on `mode === 'family'` or `mode !== null` auto-collapse to the legacy path.
2. `_layout.tsx` tab composition (Task 4.4) — `mode === null` already falls through to legacy `computeVisibleTabs` per Pass 2 HIGH-1. No additional gate needed.
3. `LearnerScreen.tsx` (Task 6.5) — flag-off branch keeps today's `(hasLinkedChildren || isFamilyPlanOwner)` condition; flag-on branch uses `mode === 'family'`. Both branches stay in the file; the flag picks which one runs.
4. `progress/index.tsx` (Task 9.3) — flag-off keeps today's picker behavior; flag-on adds the mode-aware filter + Family→Study reset + foreign-profile-id rejection. No `if (mode === null) return <LoadingState />` regression when the flag is off.
5. `RequireFamilyContext` (Task 14.3) — flag-off renders `{children}` as a no-op pass-through (child layout protected only by the existing `resolveTabShape() !== 'guardian'` redirect on the non-capable user path).
6. Task 13 (proxy hide-out) is **not** flag-gated — deleting user-facing `setProxyMode(true)` affordances is a Phase 1 cleanup that ships regardless. Per `project_pre_launch_no_users.md` there is no user-protection cost to leaving those deletions in even if mode nav is flipped off.

The chip (Task 6), activation card (Task 7), Recent-child-activity (Task 8), Route Survival (Task 5), and mode-switch invalidation (Task 12) all already condition on `mode !== null` or `mode === 'family'`. Because `AppContextProvider` returns `mode = null` when the flag is off, none of those render — no additional per-site gate needed. This is the design payoff for routing every consumer through `useAppContext()`.

- [ ] **Step 0.1: Add the flag to `feature-flags.ts`.**

In `apps/mobile/src/lib/feature-flags.ts`:

```ts
export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  I18N_ENABLED: true,
  // Study/Family mode navigation (v0 probe).
  // Source of truth: EXPO_PUBLIC_ENABLE_MODE_NAV (Doppler-managed, baked into
  // the bundle at build time). Flip via Doppler + `eas update` — no code edit
  // and no store re-submission. Defaults to `false` so the feature ships dark;
  // operator flips to `true` after the build lands on their device.
  // Spec: docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md
  // Plan: docs/plans/2026-05-19-study-and-family-mode-navigation-v0.md
  MODE_NAV_V0_ENABLED:
    process.env.EXPO_PUBLIC_ENABLE_MODE_NAV === 'true',
} as const;
```

The `=== 'true'` comparison is deliberate — `EXPO_PUBLIC_*` vars are always strings, and any non-`'true'` value (undefined, `'false'`, empty, typo) resolves to `false`. Safe default.

- [ ] **Step 0.2: Document the env var in `.env.example`.**

In `apps/mobile/.env.example`, append:

```
# Study/Family mode navigation v0 kill-switch (boolean string).
# 'true' enables the mode-aware tab shell, chip, Recent-child-activity, etc.
# Any other value (or absent) falls back to the pre-v0 behavior.
EXPO_PUBLIC_ENABLE_MODE_NAV=false
```

- [ ] **Step 0.3: Add to Doppler.**

```bash
# For each environment: dev, stg, prd
doppler secrets set EXPO_PUBLIC_ENABLE_MODE_NAV=false --config dev
doppler secrets set EXPO_PUBLIC_ENABLE_MODE_NAV=false --config stg
doppler secrets set EXPO_PUBLIC_ENABLE_MODE_NAV=false --config prd
```

Then sync to `eas.json` build profiles:

```bash
pnpm env:sync
```

Confirm the value lands in `apps/mobile/eas.json` under each profile's `env` block before the next build.

- [ ] **Step 0.4: Write a unit test.**

`apps/mobile/src/lib/feature-flags.test.ts` (create if absent):

```ts
describe('FEATURE_FLAGS.MODE_NAV_V0_ENABLED', () => {
  // Module is module-level static; re-import after env mutation in beforeEach.
  it('resolves to true only when env var is the literal string "true"', () => {
    process.env.EXPO_PUBLIC_ENABLE_MODE_NAV = 'true';
    jest.resetModules();
    const { FEATURE_FLAGS } = require('./feature-flags');
    expect(FEATURE_FLAGS.MODE_NAV_V0_ENABLED).toBe(true);
  });

  it.each(['false', '1', 'yes', 'TRUE', '', undefined])(
    'resolves to false for value %p',
    (value) => {
      if (value === undefined) delete process.env.EXPO_PUBLIC_ENABLE_MODE_NAV;
      else process.env.EXPO_PUBLIC_ENABLE_MODE_NAV = value;
      jest.resetModules();
      const { FEATURE_FLAGS } = require('./feature-flags');
      expect(FEATURE_FLAGS.MODE_NAV_V0_ENABLED).toBe(false);
    },
  );
});
```

- [ ] **Step 0.5: Typecheck + lint + commit via `/commit`.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

Stage `apps/mobile/src/lib/feature-flags.ts`, `apps/mobile/src/lib/feature-flags.test.ts`, and `apps/mobile/.env.example`. Commit via `/commit`.

---

## Flip workflow (operator runbook)

When you (the operator) want to turn the feature **on** or **off** after the build is on a device:

1. **Flip Doppler:**
   ```bash
   # turn ON
   doppler secrets set EXPO_PUBLIC_ENABLE_MODE_NAV=true --config prd
   # or turn OFF
   doppler secrets set EXPO_PUBLIC_ENABLE_MODE_NAV=false --config prd
   ```
2. **Sync + OTA:**
   ```bash
   pnpm env:sync
   pnpm exec eas update --branch production --message "mode-nav v0: <on|off>"
   ```
3. **On device:** force-close and reopen the app; the new bundle downloads and reads the new flag value. ~5 min end-to-end (per `project_eas_update_ota.md`).

Per `feedback_no_ota_unless_asked.md`, an agent never runs `eas update` without explicit operator instruction. Use this runbook only when the operator says "flip the mode-nav flag" or similar.

---

## Preflight (run once before Task 1)

- [ ] **Step P1: Verify `Profile` shape exposes `isOwner`, `birthYear`.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

If `profileSchema` is missing either field, **stop and amend the spec** — do not infer a hidden predicate.

- [ ] **Step P2: Verify `useLinkedChildren()` is in place.**

```bash
# already cited in spec preflight; just confirm the file/function
```

Read: `apps/mobile/src/lib/profile.ts:85-104` — must contain `useLinkedChildren()` returning `Profile[]`.

- [ ] **Step P3: Confirm baseline tests pass.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.ts src/lib/query-keys.ts --no-coverage
```

Expected: all green. If anything is red, fix or surface to the user **before** starting Task 1 — every later task assumes a green baseline.

---

## Task 1: `isFamilyCapableProfile()` capability helper

**Files:**
- Modify: `apps/mobile/src/lib/profile.ts` (add new exported function below `useHasLinkedChildren`, around line 104)
- Modify: `apps/mobile/src/lib/profile.test.tsx` (add new describe block)

- [ ] **Step 1.1: Write the failing tests.**

Append to `apps/mobile/src/lib/profile.test.tsx`:

```tsx
import { isFamilyCapableProfile } from './profile';
import type { Profile } from '@eduagent/schemas';

const adultOwner = (overrides: Partial<Profile> = {}): Profile =>
  ({
    id: 'p-owner',
    isOwner: true,
    birthYear: 1985,
    displayName: 'Owner',
    createdAt: '2024-01-01T00:00:00.000Z',
    linkCreatedAt: null,
    ...overrides,
  }) as Profile;

const child = (overrides: Partial<Profile> = {}): Profile =>
  ({
    id: 'p-child',
    isOwner: false,
    birthYear: 2015,
    displayName: 'Kid',
    createdAt: '2024-01-01T00:00:00.000Z',
    linkCreatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }) as Profile;

describe('isFamilyCapableProfile', () => {
  it('returns true for adult owner with at least one non-owner linked profile', () => {
    const active = adultOwner();
    expect(isFamilyCapableProfile(active, [active, child()])).toBe(true);
  });

  it('returns false for adult owner with no linked non-owner profiles', () => {
    const active = adultOwner();
    expect(isFamilyCapableProfile(active, [active])).toBe(false);
  });

  it('returns false for under-18 owner even with a linked non-owner sibling', () => {
    const active = adultOwner({ birthYear: 2012 });
    expect(isFamilyCapableProfile(active, [active, child()])).toBe(false);
  });

  it('returns false for non-owner active profile', () => {
    const active = child();
    expect(isFamilyCapableProfile(active, [adultOwner(), active])).toBe(false);
  });

  it('returns false when activeProfile is null', () => {
    expect(isFamilyCapableProfile(null, [adultOwner(), child()])).toBe(false);
  });

  it('does NOT consult subscription tier — linkage drives capability', () => {
    // Solo Family-plan owner with no children is intentionally NOT family-capable.
    const active = adultOwner();
    expect(isFamilyCapableProfile(active, [active])).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run tests; verify they fail with "isFamilyCapableProfile is not a function".**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.test.tsx --no-coverage
```

Expected: `ReferenceError` / import error.

- [ ] **Step 1.3: Implement the helper.**

Add to `apps/mobile/src/lib/profile.ts` (immediately below `useHasLinkedChildren`):

```ts
import { computeAgeBracket } from '@eduagent/schemas';

export function isFamilyCapableProfile(
  activeProfile: Pick<Profile, 'id' | 'isOwner' | 'birthYear'> | null | undefined,
  profiles: ReadonlyArray<Pick<Profile, 'id' | 'isOwner'>>,
): boolean {
  if (!activeProfile) return false;
  if (activeProfile.isOwner !== true) return false;
  if (computeAgeBracket(activeProfile.birthYear) !== 'adult') return false;
  return profiles.some(
    (p) => p.id !== activeProfile.id && p.isOwner === false,
  );
}
```

Notes:
- Do **not** check archived state — `profileSchema` has no `archivedAt` in v0.
- Do **not** read subscription tier.
- Accept the narrower `Pick<...>` shape so tests can pass minimal fixtures.

- [ ] **Step 1.4: Run tests; verify all green.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.ts src/lib/profile.test.tsx --no-coverage
```

- [ ] **Step 1.5: Typecheck + lint.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

- [ ] **Step 1.6: Commit via `/commit`.**

Stage `apps/mobile/src/lib/profile.ts` and `apps/mobile/src/lib/profile.test.tsx`.

---

## Task 2: `AppContextProvider` and `useAppContext()`

**Files:**
- Create: `apps/mobile/src/lib/app-context.tsx`
- Create: `apps/mobile/src/lib/app-context.test.tsx`

- [ ] **Step 2.1: Write failing tests.**

Create `apps/mobile/src/lib/app-context.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { AppContextProvider, useAppContext } from './app-context';
import { ProfileContext, type ProfileContextValue } from './profile';
import type { Profile } from '@eduagent/schemas';

const adult: Profile = {
  id: 'p-owner',
  isOwner: true,
  birthYear: 1985,
  displayName: 'Owner',
  createdAt: '2024-01-01T00:00:00.000Z',
  linkCreatedAt: null,
} as Profile;

const kid: Profile = {
  id: 'p-kid',
  isOwner: false,
  birthYear: 2015,
  displayName: 'Kid',
  createdAt: '2024-01-01T00:00:00.000Z',
  linkCreatedAt: '2024-01-02T00:00:00.000Z',
} as Profile;

function makeWrapper(value: Partial<ProfileContextValue>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // ProfileContextValue requires 7 fields (profile.ts:48-59). All seven are
    // listed explicitly so the example typechecks as-written (Adversarial
    // Review LOW-1).
    const merged: ProfileContextValue = {
      activeProfile: null,
      profiles: [],
      isLoading: false,
      switchProfile: async () => ({ success: true }),
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
      ...value,
    };
    return (
      <ProfileContext.Provider value={merged}>
        <AppContextProvider>{children}</AppContextProvider>
      </ProfileContext.Provider>
    );
  };
}

describe('AppContextProvider', () => {
  it('holds mode=null while profiles are loading', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({ isLoading: true }),
    });
    expect(result.current.mode).toBeNull();
  });

  it('resolves to "family" for a family-capable adult once profiles are loaded', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: adult,
        profiles: [adult, kid],
        isLoading: false,
      }),
    });
    expect(result.current.mode).toBe('family');
  });

  it('resolves to "study" for an adult owner without linked children', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: adult,
        profiles: [adult],
        isLoading: false,
      }),
    });
    expect(result.current.mode).toBe('study');
  });

  it('setMode("study") overrides default "family"', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: adult,
        profiles: [adult, kid],
        isLoading: false,
      }),
    });
    act(() => result.current.setMode('study'));
    expect(result.current.mode).toBe('study');
  });

  // Note: identity-loss reset and identity-swap recomputation tests live
  // in the integration suite (Task 15) because rerendering the wrapper
  // with a new ProfileContext value mirrors a real sign-out → sign-in.
});
```

- [ ] **Step 2.2: Run tests; verify they fail (module not found).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/app-context.test.tsx --no-coverage
```

- [ ] **Step 2.3: Implement `AppContextProvider` and `useAppContext`.**

Create `apps/mobile/src/lib/app-context.tsx`:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { isFamilyCapableProfile, useProfile } from './profile';

export type AppMode = 'study' | 'family';

export interface AppContextValue {
  mode: AppMode | null;
  setMode: (next: AppMode) => void;
}

const AppContext = createContext<AppContextValue>({
  mode: null,
  setMode: () => {
    // no-op default; real provider supplies the setter
  },
});

export function useAppContext(): AppContextValue {
  return useContext(AppContext);
}

export function AppContextProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { activeProfile, profiles, isLoading } = useProfile();
  const [mode, setMode] = useState<AppMode | null>(null);

  // Linked non-owner count — used as the capability subscription input so
  // add-child mid-session flips capability on the next render.
  const linkedNonOwnerCount = useMemo(
    () => profiles.filter((p) => !p.isOwner).length,
    [profiles],
  );

  // Identity-keyed recompute. Reset-before-recompute: if profiles are still
  // loading OR active profile is null, collapse mode to null synchronously
  // so the previous user's mode never renders against the new user's data
  // (cross-account leak class, project_cross_account_leak_2026_05_10.md).
  useEffect(() => {
    if (isLoading || !activeProfile) {
      setMode(null);
      return;
    }
    const next: AppMode = isFamilyCapableProfile(activeProfile, profiles)
      ? 'family'
      : 'study';
    setMode(next);
  }, [
    isLoading,
    activeProfile?.id,
    activeProfile?.isOwner,
    activeProfile?.birthYear,
    linkedNonOwnerCount,
  ]);

  const value = useMemo<AppContextValue>(
    () => ({ mode, setMode: (next) => setMode(next) }),
    [mode],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
```

Notes:
- The default `setMode` in the context fallback is a no-op (TypeScript-required); the real provider always supplies the setter.
- v0 explicitly **does not** read or write SecureStore. If a later change adds persistence, that change must also extend `signOutWithCleanup`.
- Identity-loss reset is what AC #27 + Failure Modes "Sign-in as a different user" require.
- **Synchronous derivation REQUIRED (Adversarial Review Pass 2 HIGH-1).** The `useState<AppMode | null>(null) + useEffect` pattern shown above leaves at least one render where `mode === null` after profiles have already loaded. In Task 4.4's tab composition, `mode === null` returns an empty Set → every `Tabs.Screen` gets `href: null` → **zero tabs render** for a frame. Today's `_layout.tsx:108` defaults to learner shape (least-privilege) so the shell always shows a non-empty tab set. The empty-tab frame is the visible regression Spec AC #3 forbids. **Replace the useState + useEffect block above with a `useMemo` so `mode` is derived synchronously during render**:

```tsx
const [modeOverride, setModeOverride] = useState<AppMode | null>(null);
const linkedNonOwnerCount = useMemo(
  () => profiles.filter((p) => !p.isOwner).length,
  [profiles],
);
const derivedMode = useMemo<AppMode | null>(() => {
  // Task 0 kill-switch: when MODE_NAV_V0_ENABLED is false, mode stays null
  // forever. Downstream consumers (chip, activation card, Recent-child-activity,
  // Route Survival, mode-switch invalidation, Progress filter) all condition
  // on `mode !== null` or `mode === 'family'` and auto-collapse to the legacy
  // path. The tab composition (Task 4.4) also falls through to legacy
  // `computeVisibleTabs` when mode is null.
  if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) return null;
  if (isLoading || !activeProfile) return null;
  return isFamilyCapableProfile(activeProfile, profiles) ? 'family' : 'study';
}, [isLoading, activeProfile?.id, activeProfile?.isOwner, activeProfile?.birthYear, linkedNonOwnerCount]);
// Override is cleared whenever the derivation key (identity) changes.
useEffect(() => { setModeOverride(null); }, [activeProfile?.id]);
const mode = modeOverride ?? derivedMode;
const setMode = useCallback((next: AppMode) => setModeOverride(next), []);
```

This keeps Route Survival (Task 5) and the chip switch (Task 6) working — they call `setMode(next)` which pins an override until identity changes. The identity-loss reset (AC #27) still fires because `derivedMode` collapses to `null` synchronously when `activeProfile === null`, and the override-clear effect runs the moment `activeProfile?.id` swaps. The cross-account safety test (Task 15.2) verifies this. **Add a Task 4 / Task 15 assertion that `computeModeVisibleTabs` is never called with `null` once profiles have resolved.**

- **Fallback option (only if the synchronous derivation above is rejected in review).** Fall back to the legacy `computeVisibleTabs(tabShape, isParentProxy)` whenever `mode === null` (Task 4.4 below) instead of returning ∅. This preserves the existing tab set during the boot frame. Pick one path; do not ship both.

- [ ] **Step 2.4: Run tests; verify green.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/app-context.tsx --no-coverage
```

- [ ] **Step 2.5: Typecheck.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 2.6: Commit via `/commit`.**

---

## Task 3: Mount `AppContextProvider` in `(app)/_layout.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` (wrap the `<Tabs>` tree)

**Important placement note (Adversarial Review HIGH-2).** `<ProfileProvider>` is mounted in the **root** `apps/mobile/src/app/_layout.tsx:570`, **not** in `(app)/_layout.tsx`. Do not look for it inside the `(app)` layout — `(app)/_layout.tsx` already consumes `useProfile()` via React context from above. `AppContextProvider` only needs to be somewhere below `<ProfileProvider>` in the tree.

Two structural options. Pick the one that compiles:

- **Option A (preferred):** Wrap the `<Tabs>` JSX subtree inside `AppLayout` (`(app)/_layout.tsx:1386`). Place `<AppContextProvider>` around the `<FeedbackProvider><View>…<Tabs>…</View></FeedbackProvider>` block returned at `_layout.tsx:1706-1836`. This is the smallest change.
- **Option B (use only if `AppLayout` itself needs `useAppContext()`):** A provider's value is not visible to its own render. If `AppLayout` consumes `useAppContext()` directly to compose `visibleTabs`, mount `<AppContextProvider>` one level up — split `AppLayout` into an outer wrapper (`AppLayoutWithMode`) that mounts the provider and an inner component (`AppLayoutInner`) that consumes it. Tasks 4 and 6 read `mode` inside `AppLayout`, so **Option B is what v0 needs** unless Task 4 hoists the read into a child component.

- [ ] **Step 3.1: Locate the JSX subtree.**

Read `apps/mobile/src/app/(app)/_layout.tsx:1386-1836`. Identify the `<FeedbackProvider><View>…<Tabs>…</View></FeedbackProvider>` return block.

- [ ] **Step 3.2: Implement Option B — split `AppLayout` into wrapper + inner.**

Add import at top of file:

```tsx
import { AppContextProvider } from '../../lib/app-context';
```

Rename the existing `export default function AppLayout()` to `function AppLayoutInner()` (no default export). Add a new default export below it:

```tsx
export default function AppLayout(): React.ReactElement {
  return (
    <AppContextProvider>
      <AppLayoutInner />
    </AppContextProvider>
  );
}
```

This makes `useAppContext()` available inside `AppLayoutInner` (Task 4) and inside every screen below the tabs.

- [ ] **Step 3.3: Typecheck and run existing layout tests.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx --no-coverage
```

Expected: all existing tests still green; no new tests needed at this step (composition tests come in Task 4).

- [ ] **Step 3.4: Commit via `/commit`.**

---

## Task 4: `computeModeVisibleTabs()` + tab visibility composition + mode-aware home tab title

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` (add helper near existing `computeVisibleTabs`; extend `resolveHomeTabPresentation` to take `mode`)
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx`

- [ ] **Step 4.1: Write failing tests for `computeModeVisibleTabs` and precedence.**

Append to `apps/mobile/src/app/(app)/_layout.test.tsx`:

```tsx
import {
  computeModeVisibleTabs,
  computeVisibleTabs,
  resolveTabShape,
} from './_layout';

describe('computeModeVisibleTabs', () => {
  it('returns Study tab set', () => {
    expect(Array.from(computeModeVisibleTabs('study')).sort()).toEqual(
      ['home', 'library', 'more', 'progress'],
    );
  });
  it('returns Family tab set (no library, no own-learning)', () => {
    expect(Array.from(computeModeVisibleTabs('family')).sort()).toEqual(
      ['home', 'more', 'progress'],
    );
  });
  it('returns empty set when mode === null (call site is responsible for falling back to the legacy path)', () => {
    expect(computeModeVisibleTabs(null).size).toBe(0);
  });
});

// Integration test for the composition at the call site (Adversarial Review
// Pass 2 HIGH-1): assert that during the boot frame (mode === null + profiles
// loading) the composition falls through to `computeVisibleTabs`, NOT to an
// empty set. This guards against accidentally returning ∅ at the call site.

// Precedence is tested via the real composition site in Task 15 integration
// tests; the helper-level test above just locks the shapes.
```

- [ ] **Step 4.2: Run tests; verify they fail (function not exported).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.test.tsx --no-coverage
```

- [ ] **Step 4.3: Add `computeModeVisibleTabs` to `_layout.tsx`.**

Below the existing `LEARNER_TABS` / `GUARDIAN_TABS` / `PARENT_PROXY_TABS` declarations (around line 76-89), add:

```ts
const STUDY_MODE_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);

const FAMILY_MODE_TABS: ReadonlySet<string> = new Set([
  'home',
  'progress',
  'more',
]);

// New helper — keeps `computeVisibleTabs` (shape-based) intact.
// See spec §Hard Rules #10 for the composition order this feeds.
export function computeModeVisibleTabs(
  mode: 'study' | 'family' | null,
): ReadonlySet<string> {
  if (mode === null) return new Set();
  if (mode === 'family') return FAMILY_MODE_TABS;
  return STUDY_MODE_TABS;
}
```

- [ ] **Step 4.4: Compose visible-tab set in the component body (not the callback).**

`visibleTabs` is currently computed by a `useMemo` at `_layout.tsx:1411-1414` in the component body (`AppLayoutInner` after Task 3); the `screenOptions` callback at line 1726 only reads `visibleTabs.has(route.name)`. **Edit the `useMemo` block, not the callback** (Adversarial Review MEDIUM-1).

Pseudocode (adapt to current variable names — read the file first):

```ts
import { useAppContext } from '../../lib/app-context';
import { isFamilyCapableProfile } from '../../lib/profile';

// inside AppLayoutInner, alongside the existing useProfile() / useParentProxy()
// reads (around _layout.tsx:1407):
const { mode } = useAppContext();
const familyCapable = isFamilyCapableProfile(activeProfile, profiles);

// Replace the existing useMemo at _layout.tsx:1411-1414 with this composition.
// Hard Rule #10 precedence: proxy > boot-null > family-capable mode > legacy.
//
// Adversarial Review Pass 2 HIGH-1: with the synchronous useMemo in Task 2,
// `mode === null` only occurs when profiles are still loading (legitimate
// boot frame). In that case fall through to the legacy `computeVisibleTabs`
// path so the shell never renders zero tabs — `resolveTabShape` already
// defaults to learner shape at `_layout.tsx:108`. Never return `new Set()`.
const visibleTabs: ReadonlySet<string> = React.useMemo(
  () =>
    isParentProxy
      ? new Set(PARENT_PROXY_TABS)
      : mode !== null && familyCapable
        ? computeModeVisibleTabs(mode)
        : computeVisibleTabs(tabShape, isParentProxy),
  [isParentProxy, mode, familyCapable, tabShape],
);
// The screenOptions callback at line 1726 already reads visibleTabs.has(route.name)
// — no edit needed inside the callback.
```

Add a short comment block above the composition documenting the precedence (so it doesn't get reordered by future refactors):

```ts
// Precedence (spec §Hard Rules #10): isParentProxy > mode===null > family-capable mode > legacy shape.
// Reordering this is a correctness regression — proxy chrome must win, and
// boot-frame must render no mode-specific tabs.
```

- [ ] **Step 4.5: Make the home tab title mode-aware (Adversarial Review HIGH-1).**

Today `resolveHomeTabPresentation(shape, isParentProxy)` at `_layout.tsx:128-149` returns `tabs.familyHub` when `shape === 'guardian' && !isParentProxy`. For a family-capable adult in Study mode, `tabShape === 'guardian'` (capability gate, not mode gate), so without this fix the home tab title stays "Family Hub / Children" while the chip and content say Study. Spec lines 222-223 require: "Family home tab label: Children. Study home tab label: My Learning."

Extend the function signature:

```ts
export function resolveHomeTabPresentation(
  shape: TabShape,
  isParentProxy = false,
  mode: 'study' | 'family' | null = null,
): {
  titleKey: 'tabs.familyHub' | 'tabs.myLearning';
  accessibilityLabelKey: 'tabs.familyHubLabel' | 'tabs.myLearningLabel';
  iconName: 'Home' | 'School';
} {
  // Family-capable adult mode override: when a guardian is in Study mode,
  // the home tab points at My Learning, not the family hub.
  if (shape === 'guardian' && !isParentProxy && mode === 'study') {
    return {
      titleKey: 'tabs.myLearning',
      accessibilityLabelKey: 'tabs.myLearningLabel',
      iconName: 'School',
    };
  }
  if (shape === 'guardian' && !isParentProxy) {
    return {
      titleKey: 'tabs.familyHub',
      accessibilityLabelKey: 'tabs.familyHubLabel',
      iconName: 'Home',
    };
  }
  return {
    titleKey: 'tabs.myLearning',
    accessibilityLabelKey: 'tabs.myLearningLabel',
    iconName: 'School',
  };
}
```

Update the call site at `_layout.tsx:1415-1418` to thread `mode`:

```ts
const homeTabPresentation = resolveHomeTabPresentation(
  tabShape,
  isParentProxy,
  mode,
);
```

Add a unit test alongside `computeModeVisibleTabs` tests:

```tsx
it('home tab title flips to My Learning for guardian-shape adult in Study mode', () => {
  expect(resolveHomeTabPresentation('guardian', false, 'study').titleKey)
    .toBe('tabs.myLearning');
  expect(resolveHomeTabPresentation('guardian', false, 'family').titleKey)
    .toBe('tabs.familyHub');
  expect(resolveHomeTabPresentation('guardian', false, null).titleKey)
    .toBe('tabs.familyHub'); // boot frame defaults to family-hub for guardian
  expect(resolveHomeTabPresentation('learner', false, 'study').titleKey)
    .toBe('tabs.myLearning');
});
```

- [ ] **Step 4.6: Run tests; verify green.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx src/app/\(app\)/_layout.test.tsx --no-coverage
```

- [ ] **Step 4.7: Typecheck + lint.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

- [ ] **Step 4.8: Commit via `/commit`.**

---

## Task 5: `own-learning.tsx` Route Survival

**Files:**
- Modify: `apps/mobile/src/app/(app)/own-learning.tsx`
- Create / modify: `apps/mobile/src/app/(app)/own-learning.test.tsx` (create if absent)

- [ ] **Step 5.1: Check for an existing test file.**

```bash
# If a co-located test file exists, edit it. Otherwise create.
```

- [ ] **Step 5.2: Write failing test.**

Create or extend `apps/mobile/src/app/(app)/own-learning.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
// Use the canonical pattern from index.test.tsx / _layout.test.tsx — build a
// test wrapper that supplies ProfileContext + AppContextProvider with the
// fixtures the screen needs. Do NOT jest.mock internal modules.

// Required cases:
// - family-capable adult in mode='family' lands on own-learning →
//   setMode('study') fires before render → no redirect, learner UI renders.
// - non-capable user → existing <Redirect href="/(app)/home"> still fires.
// - family-capable adult already in mode='study' → no setMode call, renders.
```

Concrete assertion shape (adapt setMode to a spy that captures calls into the wrapper's state):

```tsx
it('switches mode to "study" when a family-capable adult deep-links to own-learning', () => {
  const setModeSpy = jest.fn();
  // Render with mode='family', activeProfile=adultOwner, profiles=[adult, kid],
  // and an injected setMode spy (the test harness wraps AppContextProvider so
  // setMode is observable).
  // After render: expect(setModeSpy).toHaveBeenCalledWith('study');
});
```

- [ ] **Step 5.3: Run test; verify it fails.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/own-learning.tsx --no-coverage
```

- [ ] **Step 5.4: Implement Route Survival.**

Edit `apps/mobile/src/app/(app)/own-learning.tsx`. Add `useEffect` **before** the existing `<Redirect>` guard:

```tsx
import { useEffect } from 'react';
import { useAppContext } from '../../lib/app-context';
import { isFamilyCapableProfile } from '../../lib/profile';

// inside OwnLearningScreen, immediately after destructuring:
const { mode, setMode } = useAppContext();

useEffect(() => {
  if (isFamilyCapableProfile(activeProfile, profiles) && mode === 'family') {
    setMode('study');
  }
}, [mode, setMode, activeProfile, profiles]);
```

Keep the existing `resolveTabShape() !== 'guardian'` redirect for non-capable users — it handles solo-learner and child-on-parent-account cases.

**Tripwire note (Adversarial Review LOW-2).** After Route Survival fires `setMode('study')`, the user is on `/(app)/own-learning` with `returnToTab = OWN_LEARNING_RETURN_TO = 'own-learning'`. In Study mode the own-learning tab is hidden — deep navigations from this screen will return to a route whose tab button is invisible (home is still reachable). Existing behavior is identical for solo-learners that deep-link to `/(app)/own-learning`; v0 simply makes the path more reachable for family-capable adults. No fix in v0; v1 may want to normalize `returnToTab` to `'home'` after a mode-flip.

- [ ] **Step 5.5: Run tests; verify green.**

- [ ] **Step 5.6: Typecheck + lint.**

- [ ] **Step 5.7: Commit via `/commit`.**

---

## Task 6: Mode switch UI (chip in `home.tsx`)

**Files:**
- Modify: `apps/mobile/src/app/(app)/home.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx` (accept `mode` prop; mode-driven `showParentHome` branch)
- Modify: `apps/mobile/src/lib/analytics.ts` — no signature change; v0 simply adds a new event-name call site. (Listed in spec front-matter for traceability.)

- [ ] **Step 6.1: Read current `LearnerScreen` branch at lines 456-466.**

Confirm shape matches the spec quote. Plan adjustment to replace `(hasLinkedChildren || isFamilyPlanOwner)` with `mode === 'family'`.

- [ ] **Step 6.2: Write failing tests.**

In `apps/mobile/src/app/(app)/home.test.tsx` (create if missing) add:

```tsx
// Cases:
// 1. family-capable adult, mode='family' → chip renders with label "My Learning",
//    context label reads "Family". setMode('study') + router.replace fires on tap.
// 2. family-capable adult, mode='study' → chip renders with label "Family",
//    context label reads "My Learning".
// 3. non-family-capable user → no chip is rendered.
// 4. Boot frame (mode=null) → no chip, no Family chrome.
// 5. Rapid tap test (reentrancy guard) — two taps fire setMode only once.
// 6. Analytics: track('mode_switched', { from, to, profileIdHash, accountAgeBucket })
//    is called exactly once on tap.
```

Implementation tip: do not jest.mock the analytics module — read the breadcrumb buffer via a Sentry shim, or spy on the exported `track` import per repo convention. If unsure how analytics is tested in this repo, search for an existing analytics call-site test.

**Test mock posture (Adversarial Review MEDIUM-4).** `home.tsx` transitively pulls hooks (`useDashboard`, `useLearnerProfile`, celebration hooks) that touch SecureStore via `ProfileProvider`. Existing screen tests handle this with `jest.mock('../../lib/profile' /* gc1-allow: ProfileProvider uses SecureStore native storage */, ...)` — see canonical example at `apps/mobile/src/app/(app)/progress/reports/index.test.tsx:55` and `apps/mobile/src/app/(app)/library.test.tsx:304`. For v0 tests, prefer the same `<ProfileContext.Provider value={...}>` wrapper pattern used in Task 2 to inject fixtures directly — that avoids needing the `gc1-allow` exception. If you must mock an internal module, annotate the same line with `// gc1-allow: <reason>` and explain in the commit body. **Never** add a bare `jest.mock('./...')` without the annotation — GC1 ratchet will fail CI.

- [ ] **Step 6.3: Run; verify red.**

- [ ] **Step 6.4: Implement the chip in `home.tsx`.**

In `apps/mobile/src/app/(app)/home.tsx`:

```tsx
import { useRef } from 'react';
import { useAppContext } from '../../lib/app-context';
import { isFamilyCapableProfile } from '../../lib/profile';
import { bucketAccountAge, hashProfileId, track } from '../../lib/analytics';

// inside HomeScreen, after celebration setup:
const { mode, setMode } = useAppContext();
const familyCapable = isFamilyCapableProfile(activeProfile, profiles);
const switchingRef = useRef(false);

const onModeSwitch = () => {
  if (!mode || !activeProfile) return;
  if (switchingRef.current) return; // reentrancy guard
  switchingRef.current = true;
  const next = mode === 'family' ? 'study' : 'family';
  track('mode_switched', {
    from: mode,
    to: next,
    profileIdHash: hashProfileId(activeProfile.id),
    accountAgeBucket: bucketAccountAge(activeProfile.createdAt),
  });
  setMode(next);
  router.replace('/(app)/home');
  // Release the guard on next tick so navigation can settle.
  setTimeout(() => {
    switchingRef.current = false;
  }, 0);
};
```

Render the chip above `<LearnerScreen>` inside the existing return JSX, only when `familyCapable && mode !== null`. Pass `mode` to `<LearnerScreen mode={mode}>` as a new prop.

Visual shape (placeholder copy — match existing chip components for styling):

```tsx
{familyCapable && mode !== null ? (
  <View className="px-5 pt-3">
    <View className="flex-row items-center justify-between">
      <Text className="text-body-sm text-text-secondary">
        {mode === 'family' ? 'Family' : 'My Learning'}
      </Text>
      <Pressable
        onPress={onModeSwitch}
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${mode === 'family' ? 'My Learning' : 'Family'}`}
        testID="mode-switch-chip"
      >
        <Text className="text-body-sm text-primary">
          {mode === 'family' ? 'My Learning' : 'Family'}
        </Text>
      </Pressable>
    </View>
  </View>
) : null}
```

- [ ] **Step 6.5: Update `LearnerScreen.tsx` to accept `mode` and use it to drive `showParentHome`.**

In `apps/mobile/src/components/home/LearnerScreen.tsx` lines 456-466:

```tsx
// Add `mode?: 'study' | 'family' | null` to LearnerScreenProps.
// Replace the existing block with a flag-gated branch:

import { FEATURE_FLAGS } from '../../lib/feature-flags';

const showParentHomeForMode = FEATURE_FLAGS.MODE_NAV_V0_ENABLED
  ? mode === 'family'
  : hasLinkedChildren || isFamilyPlanOwner; // legacy fallback

if (showParentHome && !isParentProxy && showParentHomeForMode) {
  return <ParentHomeScreen activeProfile={activeProfile} now={now} />;
}
```

**Keep** the `isFamilyPlanOwner` variable AND the `hasLinkedChildren` lookup — they're consumed by the flag-off branch. Task 0 needs both code paths in the file so the flip works without a rebuild. Confirm no other callers expect either variable to be gone.

- [ ] **Step 6.6: Run tests; verify green.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/home.tsx src/components/home/LearnerScreen.tsx --no-coverage
```

- [ ] **Step 6.7: Typecheck + lint.**

- [ ] **Step 6.8: Commit via `/commit`.**

---

## Task 7: Family home — adult-study activation card

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: its co-located test file (or create)

- [ ] **Step 7.1: Write failing test.**

Cases:
1. Family-capable adult in Family mode → card renders, action labelled "Go to My Learning".
2. Tapping the card calls `setMode('study')` and `router.replace('/(app)/home')` — same path as the header chip.
3. Card is hidden in proxy mode and for Study mode users.

- [ ] **Step 7.2: Run; verify red.**

- [ ] **Step 7.3: Implement the card.**

In `ParentHomeScreen.tsx`, add a quiet card below the main child/family summary content. Use a shared switch handler that mirrors the header behavior. Suggested copy:

```tsx
import { useAppContext } from '../../lib/app-context';

const { mode, setMode } = useAppContext();
const router = useRouter();

const onGoToMyLearning = () => {
  setMode('study');
  router.replace('/(app)/home');
};

{mode === 'family' && !isParentProxy ? (
  <View className="mx-5 mt-4 p-4 bg-surface rounded-card border border-border">
    <Text className="text-body-sm font-semibold text-text-primary">
      Want to study too?
    </Text>
    <Text className="text-body-sm text-text-secondary mt-1">
      Build your own progress alongside your child.
    </Text>
    <Pressable
      onPress={onGoToMyLearning}
      className="mt-3 self-start"
      accessibilityRole="button"
      accessibilityLabel="Go to My Learning"
      testID="activation-card-go-my-learning"
    >
      <Text className="text-body text-primary">Go to My Learning</Text>
    </Pressable>
  </View>
) : null}
```

- [ ] **Step 7.4: Run tests; verify green.**

- [ ] **Step 7.5: Typecheck + lint.**

- [ ] **Step 7.6: Commit via `/commit`.**

---

## Task 8: Family home — Recent child activity section

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: its co-located test file

- [ ] **Step 8.1: Confirm `DashboardChild` shape.**

Read `packages/schemas/src/progress.ts:310-340`. Verify fields: `sessionsThisWeek`, `sessionsLastWeek`, `totalTimeThisWeek`, `totalTimeLastWeek`, `currentStreak`, `trend`. No `lastActivityAt`. No per-session array. **Do not add either** — that's v1.

- [ ] **Step 8.2: Write failing tests.**

Cases:
1. Family mode + children with `sessionsThisWeek > 0` → tiles render, ordered `sessionsThisWeek desc` then `totalTimeThisWeek desc`.
2. Family mode + all children `sessionsThisWeek === 0` → named empty state copy "waiting for first session this week".
3. Tile tap navigates to `/(app)/child/[profileId]`.
4. Study mode → section is not rendered.

**Test mock posture (Adversarial Review MEDIUM-4).** `ParentHomeScreen.tsx` calls `useDashboard()` at line 775, which touches the api-client + SecureStore. Prefer the `<ProfileContext.Provider value={...}>` + a mocked QueryClient with pre-seeded data over `jest.mock('../../lib/profile')`. If a `gc1-allow`-annotated mock is unavoidable, add `// gc1-allow: ProfileProvider uses SecureStore native storage` on the same `jest.mock(` line. Follow the canonical pattern at `apps/mobile/src/app/(app)/progress/reports/index.test.tsx:55`.

- [ ] **Step 8.3: Run; verify red.**

- [ ] **Step 8.4: Implement the section.**

In `ParentHomeScreen.tsx`:

```tsx
// `useDashboard()` is already called in this file. Read `dashboard?.children`.
const recentChildren = useMemo(() => {
  const children = dashboard?.children ?? [];
  return [...children].sort((a, b) => {
    if (b.sessionsThisWeek !== a.sessionsThisWeek) {
      return b.sessionsThisWeek - a.sessionsThisWeek;
    }
    return b.totalTimeThisWeek - a.totalTimeThisWeek;
  });
}, [dashboard?.children]);

const anyActivity = recentChildren.some((c) => c.sessionsThisWeek > 0);

{mode === 'family' ? (
  <View className="mx-5 mt-4" testID="recent-child-activity">
    <Text className="text-h3 font-semibold text-text-primary">
      Recent child activity
    </Text>
    {anyActivity ? (
      recentChildren.map((c) => (
        <Pressable
          key={c.profileId}
          onPress={() => router.push(`/(app)/child/${c.profileId}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${c.displayName} activity`}
          testID={`child-activity-tile-${c.profileId}`}
          className="mt-3 p-3 bg-surface rounded-card border border-border"
        >
          <Text className="text-body font-semibold text-text-primary">
            {c.displayName}
          </Text>
          {/*
            Adversarial Review Pass 2 MEDIUM-1: do NOT render `c.trend` raw —
            its enum values are 'up' | 'down' | 'stable', and "5 sessions this
            week · up" is broken UX. The trend visualization is deferred to
            v1 along with the rest of Recaps; v0's tile is intentionally
            minimal. Also avoids triggering `feedback_positive_framing_no_struggle`
            for the 'down' value.
           */}
          <Text className="text-body-sm text-text-secondary">
            {c.sessionsThisWeek} sessions this week
          </Text>
        </Pressable>
      ))
    ) : (
      <View className="mt-3 p-3 bg-surface rounded-card border border-border">
        <Text className="text-body-sm text-text-secondary">
          Waiting for first session this week.
        </Text>
      </View>
    )}
  </View>
) : null}
```

- [ ] **Step 8.5: Run tests; verify green.**

- [ ] **Step 8.6: Typecheck + lint.**

- [ ] **Step 8.7: Commit via `/commit`.**

---

## Task 9: Progress filtering by mode

**Files:**
- Modify: `apps/mobile/src/app/(app)/progress/index.tsx`
- Modify: its co-located test file

- [ ] **Step 9.1: Write failing tests.**

Cases:
1. Family mode → profile picker exposes child profiles only; default selection = most-recently-active child (by `sessionsThisWeek` or existing logic — read current picker behaviour).
2. Family mode → adult self profile is hidden.
3. Study mode → picker is hidden; data scope = adult self.
4. Boot frame (`mode === null`) → render a loading state; do not fetch.
5. **Mode flip Family→Study while `selectedProfileId` is a child id** (Adversarial Review Pass 2 CRITICAL-3) → `selectedProfileId` resets to `activeProfile.id` and the dashboard.children fetch never fires after the flip. Mock `client.dashboard.children[':profileId'].sessions.$get` and assert zero calls post-flip.
6. **Deep-link `?profileId=<childId>` in Study mode** (Adversarial Review Pass 2 CRITICAL-4) → `requestedProfileId` is ignored when `mode === 'study'` and `requestedProfileId !== activeProfile.id`. The screen renders adult-self data, not the child.

- [ ] **Step 9.2: Run; verify red.**

- [ ] **Step 9.3: Implement filtering.**

In `progress/index.tsx`, read `mode` from `useAppContext()`. Wrap the mode-aware behavior in a flag check so flag-off keeps today's picker:

```tsx
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

const { mode } = useAppContext();

// Task 0 kill-switch: when the flag is off, mode is always null. Skip the
// mode-aware filter, loading state, and resets entirely — fall through to
// today's behavior (selectableProfiles = self + linked children).
if (FEATURE_FLAGS.MODE_NAV_V0_ENABLED) {
  // While mode resolves, render the existing loading state.
  if (mode === null) return <LoadingState />; // adapt to current loading UI

  const selectableProfiles =
    mode === 'family'
      ? profiles.filter((p) => p.id !== activeProfile?.id && !p.isOwner)
      : profiles.filter((p) => p.id === activeProfile?.id);

  // Default-selection rule for Family mode: pick the child with the highest
  // sessionsThisWeek (fall back to first child if none have activity).
} else {
  // Legacy behavior: today's `selectableProfiles` derivation (self + all linked).
  // Leave the existing logic in place; do NOT delete it. The flag-off path
  // depends on it.
}
```

Hide the picker entirely when `selectableProfiles.length <= 1`.

**Note for implementer:** rather than literal `if/else` blocks around large sections, use a single derived `selectableProfiles` value with a ternary on `FEATURE_FLAGS.MODE_NAV_V0_ENABLED`, and gate the loading state + reset effects on the flag. Keep both paths in the same file so the OTA flip works without a rebuild.

**Reset `selectedProfileId` on Family→Study flip (Adversarial Review Pass 2 CRITICAL-3).** The existing `selectedProfileId` useState (`progress/index.tsx:512-519`) seeds from `requestedProfileId` or `activeProfile.id` and persists across renders. When the user flips from Family to Study with `selectedProfileId === childId`, the downstream `useProfileSessions(selectedProfileId)` will (a) include `mode='study'` in the queryKey AND (b) hit `client.dashboard.children[':profileId'].sessions.$get` because the existing `enabled` clause only checks `isOwner === true`. Result: child data fetched into Study cache. Fix at this layer by resetting `selectedProfileId` to self the moment mode flips out of Family:

```tsx
useEffect(() => {
  if (mode === 'study' && selectedProfileId && selectedProfileId !== activeProfile?.id) {
    setSelectedProfileId(activeProfile?.id ?? '');
  }
}, [mode, selectedProfileId, activeProfile?.id]);
```

**Reject deep-link `?profileId=<foreign>` in Study mode (Adversarial Review Pass 2 CRITICAL-4).** The two existing `requestedProfileId` seed paths at `progress/index.tsx:512-531` accept any linked-child id. In Study mode, reject the request:

```tsx
// In both useState initializer and the requestedProfileId useEffect:
const knownRequestedProfileId =
  requestedProfileId &&
  (requestedProfileId === activeProfile?.id ||
    (mode === 'family' && linkedChildren.some((child) => child.id === requestedProfileId)));
```

Add a defense-in-depth gate to the fetch hooks themselves (see Task 11b update below) so a future refactor that misses this reset still cannot leak.

- [ ] **Step 9.4: Run tests; verify green.**

- [ ] **Step 9.5: Typecheck + lint.**

- [ ] **Step 9.6: Commit via `/commit`.**

---

## Task 10: `MODE_SCOPED_KEYS` + extract `PROFILE_SCOPED_KEYS` to module-level

**Files:**
- Create: `apps/mobile/src/lib/mode-scoped-keys.ts`
- Create: `apps/mobile/src/lib/mode-scoped-keys.test.ts`
- Modify: `apps/mobile/src/lib/profile.ts` (move inline `PROFILE_SCOPED_KEYS` to module-level `const` and export it — see Adversarial Review Pass 2 CRITICAL-1: the four mode-scoped prefixes are **already present** in the existing list at `profile.ts:262, 264, 265, 294`. No additions needed. Earlier review-pass note "forward-only bug fix" was stale.)
- Modify: `apps/mobile/src/lib/profile.test.tsx` (guard test)

- [ ] **Step 10.1: Write the guard test.**

Create `apps/mobile/src/lib/mode-scoped-keys.test.ts`:

```ts
import { MODE_SCOPED_KEYS } from './mode-scoped-keys';
import { PROFILE_SCOPED_KEYS_FOR_TEST } from './profile';

describe('MODE_SCOPED_KEYS', () => {
  it('is non-empty', () => {
    expect(MODE_SCOPED_KEYS.length).toBeGreaterThan(0);
  });

  it('every mode-scoped key is also profile-scoped', () => {
    for (const key of MODE_SCOPED_KEYS) {
      expect(PROFILE_SCOPED_KEYS_FOR_TEST).toContain(key);
    }
  });

  it('includes the six required prefixes', () => {
    expect(MODE_SCOPED_KEYS).toEqual(
      expect.arrayContaining([
        'progress',
        'dashboard',
        'session',
        'session-transcript',
        'session-summary',
        'parking-lot',
      ]),
    );
  });
});
```

- [ ] **Step 10.2: Run test; verify red (file missing).**

- [ ] **Step 10.3: Create `mode-scoped-keys.ts`.**

```ts
// Single source of truth for which queryKey[0] prefixes get invalidated on a
// mode switch. See spec §Step 8 and §Hard Rule #7.
//
// The list intentionally uses singular 'session' (not plural). The plural
// 'sessions' in PROFILE_SCOPED_KEYS is a latent dead entry — out of scope to
// remove in v0.
export const MODE_SCOPED_KEYS = [
  'progress',
  'dashboard',
  'session',
  'session-transcript',
  'session-summary',
  'parking-lot',
] as const;

export type ModeScopedKey = (typeof MODE_SCOPED_KEYS)[number];
```

- [ ] **Step 10.4: Move `PROFILE_SCOPED_KEYS` to module-level in `profile.ts` and export for tests.**

In `apps/mobile/src/lib/profile.ts`:

1. **Copy the existing array verbatim** from `profile.ts:252-307` to module-level. Do not retype, trim, or reorder — the live list has 52 entries. **Do not add anything** — the four mode-scoped prefixes (`'session'`, `'session-summary'`, `'session-transcript'`, `'parking-lot'`) are already in the list (lines 262, 264, 265, 294). The plan revision history previously claimed they needed to be added; that claim was based on an out-of-date read of the file (Adversarial Review Pass 2 CRITICAL-1 / CRITICAL-2). Re-read the file before the move.

```ts
// Module-level so the test guard and consumers can import.
// SOURCE OF TRUTH: copy verbatim from the existing inline array in
// switchProfile (`profile.ts:252-307` pre-move). Do NOT retype — copy the
// literal so no entry is lost. Adversarial Review Pass 2 CRITICAL-2 caught
// an earlier draft that dropped ~27 entries (`all-notes`, `bookmarks`,
// `celebrations`, `consent`, `topic-notes`, `library`, `vocabulary`,
// `learner-profile`, `quiz-round*`, `language-progress`, `resume-nudge`, …).
// Each missing entry would silently regress profile-switch invalidation.
export const PROFILE_SCOPED_KEYS_FOR_TEST = [
  // ← paste the 52-entry array from profile.ts:252-307 here, unchanged.
] as const;
```

2. Inside `switchProfile`, replace the inline literal with a reference to the module-level constant.

3. After the move, run `git diff profile.ts` and visually confirm: (a) the inline array body is gone from `switchProfile`; (b) the module-level array has **exactly** the same entries — same count, same order, no additions, no removals.

The `_FOR_TEST` suffix communicates "this is exported only because a test needs the list" — production code reads it via `switchProfile`.

- [ ] **Step 10.5: Run tests; verify green.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/mode-scoped-keys.ts src/lib/profile.ts --no-coverage
```

- [ ] **Step 10.6: Typecheck + lint.**

- [ ] **Step 10.7: Commit via `/commit`.**

---

## Task 11: Query-key factory mode-segmentation

This task touches every mode-scoped factory in `query-keys.ts` and every consuming hook. It's mechanical but wide. Do it in three sub-commits to keep diffs reviewable.

**Files (Task 11 total):**
- Modify: `apps/mobile/src/lib/query-keys.ts`
- Modify: `apps/mobile/src/lib/query-keys.test.ts`
- Modify: `apps/mobile/src/hooks/use-progress.ts`
- Modify: `apps/mobile/src/hooks/use-dashboard.ts`
- Modify: `apps/mobile/src/hooks/use-sessions.ts` (Adversarial Review CRITICAL-2) — 7 `queryKeys.sessions.*` call sites at lines 530, 563, 657, 684, 727, 745. ALSO rewrite 2-element invalidations at lines 218 (`['session-transcript', sessionId]`) and 247 (`['session', sessionId]`) per CRITICAL-1.
- Modify: `apps/mobile/src/hooks/use-retry-filing.ts` (Adversarial Review CRITICAL-1) — 2-element invalidations at lines 27 and 29.
- Modify: any other callers found by grep before editing.

### Task 11a: Update `query-keys.ts` factories

- [ ] **Step 11a.1: Read the current factory definitions** in `apps/mobile/src/lib/query-keys.ts` (lines 26-210).

- [ ] **Step 11a.2: Write failing test updates.**

Edit `apps/mobile/src/lib/query-keys.test.ts`. For each factory in the table below, update the expected key shape:

| Factory | Old shape | New shape |
|---|---|---|
| `progress.subject` | `['progress', 'subject', subjectId, profileId]` | `['progress', mode, 'subject', subjectId, profileId]` |
| `progress.overview` | `['progress', 'overview', profileId]` | `['progress', mode, 'overview', profileId]` |
| `progress.continue` | `['progress', 'continue', profileId]` | `['progress', mode, 'continue', profileId]` |
| `progress.resumeTarget` | `['progress', 'resume-target', profileId, …]` | `['progress', mode, 'resume-target', profileId, …]` |
| `progress.activeSessionForTopic` | `['progress', 'topic', topicId, 'active-session', profileId]` | `['progress', mode, 'topic', topicId, 'active-session', profileId]` |
| `progress.resolveTopicSubject` | `['progress', 'topic', topicId, 'resolve', profileId]` | `['progress', mode, 'topic', topicId, 'resolve', profileId]` |
| `progress.reviewSummary` | `['progress', 'review-summary', profileId]` | `['progress', mode, 'review-summary', profileId]` |
| `progress.overdueTopics` | `['progress', 'overdue-topics', profileId]` | `['progress', mode, 'overdue-topics', profileId]` |
| `progress.topicProgress` | `['progress', 'topic', subjectId, topicId, profileId]` | `['progress', mode, 'topic', subjectId, topicId, profileId]` |
| `progress.inventory` | `['progress', 'inventory', profileId]` | `['progress', mode, 'inventory', profileId]` |
| `progress.history` | `['progress', 'history', profileId, query]` | `['progress', mode, 'history', profileId, query]` |
| `progress.milestones` | `['progress', 'milestones', profileId, limit]` | `['progress', mode, 'milestones', profileId, limit]` |
| `progress.profileSessions` | `['progress', 'profile', profileId, 'sessions', activeProfileId]` | `['progress', mode, 'profile', profileId, 'sessions', activeProfileId]` |
| `progress.profileReports` | same | `['progress', mode, 'profile', profileId, 'reports', activeProfileId]` |
| `progress.profileWeeklyReports` | same | `['progress', mode, 'profile', profileId, 'weekly-reports', activeProfileId]` |
| `progress.profileReportDetail` | `['progress', 'profile', activeProfileId, 'report', reportId]` | `['progress', mode, 'profile', activeProfileId, 'report', reportId]` |
| `progress.profileWeeklyReportDetail` | `['progress', 'profile', activeProfileId, 'weekly-report', reportId]` | `['progress', mode, 'profile', activeProfileId, 'weekly-report', reportId]` |
| `dashboard.root` | `['dashboard', profileId]` | `['dashboard', mode, profileId]` |
| `dashboard.childDetail` | `['dashboard', 'child', childProfileId]` | `['dashboard', mode, 'child', childProfileId]` |
| `dashboard.childSubject` | same shape, mode after `'dashboard'` |
| `dashboard.childSessions` | same |
| `dashboard.childSessionDetail` | same |
| `dashboard.childMemory` | same |
| `dashboard.childInventory` | same |
| `dashboard.childHistory` | same |
| `dashboard.childProgressSummary` | same |
| `dashboard.childReports` | same |
| `dashboard.childReportDetail` | same |
| `dashboard.childWeeklyReports` | same |
| `dashboard.childWeeklyReportDetail` | same |
| `sessions.detail` | `['session', sessionId, profileId]` | `['session', mode, sessionId, profileId]` |
| `sessions.transcript` | `['session-transcript', sessionId, profileId]` | `['session-transcript', mode, sessionId, profileId]` |
| `sessions.summary` | same shape, mode after the domain string |
| `sessions.parkingLot` | same |
| `sessions.topicParkingLot` | `['parking-lot', 'topic', subjectId, topicId, profileId]` | `['parking-lot', mode, 'topic', subjectId, topicId, profileId]` |

Note: `mode` here means the `AppMode | null` runtime value. When `mode === null`, the hook returns `{ enabled: false }` and the query never fires.

**Cold-refetch cost on every mode toggle (Adversarial Review Pass 2 MEDIUM-3).** Inserting `mode` at `queryKey[1]` partitions the cache between Family and Study. Each toggle dirties the new-mode key and forces a full refetch of `dashboard.root` (the parent dashboard with all child info) and every `progress.*` query the user has visited. For v0 this is an acceptable trade-off — the partition is what guarantees Hard Rule #6 (no cross-mode cache leak) without server work. Do NOT try to seed the new-mode key from the old-mode key via `setQueryData` in v0; the seed is only safe if you can prove the response shape is mode-independent for every factory, which the spec does not guarantee. v1 may pre-seed once the server-backed mode lands.

Test assertion example (apply to every changed factory):

```ts
it('progress.overview includes mode segment', () => {
  expect(queryKeys.progress.overview('family', 'p1')).toEqual([
    'progress', 'family', 'overview', 'p1',
  ]);
});
```

- [ ] **Step 11a.3: Run test; verify red.**

- [ ] **Step 11a.4: Update factory signatures.**

For each factory, prepend a `mode: 'study' | 'family' | null` argument **after** the leading domain string slot. Example:

```ts
overview: (mode: AppMode | null, profileId: string | undefined) =>
  ['progress', mode, 'overview', profileId] as const,
```

Define `AppMode` import at top of `query-keys.ts`:

```ts
import type { AppMode } from './app-context';
```

- [ ] **Step 11a.5: Run query-keys tests; verify green.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/query-keys.ts --no-coverage
```

This will leave many **consumer** call sites broken (typecheck failures). That's expected — fix in 11b.

- [ ] **Step 11a.6: Do NOT commit yet (Adversarial Review LOW-3).**

The factory signature change leaves consumer call sites broken at typecheck. The pre-commit hook runs `tsc --noEmit` — a typecheck-red commit will be blocked, and per `CLAUDE.md → feedback_precommit_typecheck` we never bypass the hook. Stage the factory edits but defer the commit until 11c is complete; commit Tasks 11a + 11b + 11c as a single unit at the end of Task 11c.5 (renumbered below). No commit on disk is typecheck-red.

### Task 11b: Thread `mode` through `use-progress.ts` and `use-dashboard.ts`

- [ ] **Step 11b.1: Read each hook in `use-progress.ts` and `use-dashboard.ts`.**

- [ ] **Step 11b.2: At the top of each consuming hook, read `mode` from `useAppContext()` and pass it into the factory.**

```ts
const { mode } = useAppContext();
// inside useQuery options:
useQuery({
  queryKey: queryKeys.progress.overview(mode, activeProfile?.id),
  enabled: mode !== null && Boolean(activeProfile?.id),
  // …
});
```

Apply the pattern across every consumer of factories in the §11a table.

- [ ] **Step 11b.2a: Tighten `enabled` for foreign-profile hooks (Adversarial Review Pass 2 CRITICAL-3 — defense in depth).**

The following hooks accept a `profileId` argument that can refer to a non-self profile and dispatch to `client.dashboard.children[':profileId'].*`. Today their `enabled` clause only checks `activeProfile.isOwner === true` — a Study-mode user with a stale `selectedProfileId === childId` (e.g., from a Family→Study flip or a `?profileId=<childId>` deep link) will fetch child data into the Study cache. Tighten each:

| Hook | File:line | Add to `enabled` |
|---|---|---|
| `useProfileSessions` | `use-progress.ts:449-452` | `&& (mode === 'family' \|\| profileId === activeProfile.id)` |
| `useProfileReports` | grep `enabled` in the same file | same |
| `useProfileWeeklyReports` | same | same |
| `useChildInventory` | same | `&& mode === 'family'` (child-only endpoint) |
| `useChildProgressSummary` | same | `&& mode === 'family'` (child-only endpoint) |

This is **defense in depth**: Task 9's `selectedProfileId` reset is the primary fix; this gate stops a future refactor that misses the reset from leaking data anyway. Add a test that primes `selectedProfileId=childId`, sets `mode='study'`, and asserts no call to `client.dashboard.children[':profileId'].*` is observed.

- [ ] **Step 11b.3: Run hook tests and typecheck.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-progress.ts src/hooks/use-dashboard.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

Typecheck will still be red at this point if `use-sessions.ts` consumer sites in Task 11c are not yet updated. That's expected. Do **not** commit yet — 11c follows immediately (Adversarial Review LOW-3).

### Task 11c: Thread `mode` through `sessions.*` callers + rewrite 2-element session invalidations

- [ ] **Step 11c.1: Grep for every call site.**

```bash
# Use Grep tool with:
# pattern: "queryKeys\\.sessions\\."
# This catches detail / transcript / summary / parkingLot / topicParkingLot.
# Expected hits include: apps/mobile/src/hooks/use-sessions.ts (7 sites at
# lines 530, 563, 657, 684, 727, 745).
```

- [ ] **Step 11c.2: Update each call site to pass `mode` from `useAppContext()`.**

Pattern repeats from 11b. Where the call site is outside a component (e.g. a service helper), the helper signature gets a `mode` argument and the caller threads it in.

- [ ] **Step 11c.3: Rewrite 2-element session-prefix invalidations (Adversarial Review CRITICAL-1).**

After `mode` is inserted at queryKey[1], the new session-domain keys are:
- `sessions.detail`: `['session', mode, sessionId, profileId]`
- `sessions.transcript`: `['session-transcript', mode, sessionId, profileId]`

There are existing **2-element prefix invalidations** in the codebase that match positionally — they will silently fail after the insertion because position 1 is now `mode`, not `sessionId`:

| File | Line | Current call | Why it breaks |
|---|---|---|---|
| `apps/mobile/src/hooks/use-retry-filing.ts` | 27 | `queryClient.invalidateQueries({ queryKey: ['session', sessionId] })` | After v0: `queryKey[1]` is the mode literal, not `sessionId`. No match. |
| `apps/mobile/src/hooks/use-retry-filing.ts` | 29 | `queryClient.invalidateQueries({ queryKey: ['session-transcript', sessionId] })` | Same. |
| `apps/mobile/src/hooks/use-sessions.ts` | 218 | `queryClient.invalidateQueries({ queryKey: ['session-transcript', sessionId] })` | Same. |
| `apps/mobile/src/hooks/use-sessions.ts` | 247 | `queryClient.invalidateQueries({ queryKey: ['session', sessionId] })` | Same. |

User-visible consequence if left untouched: after retry-filing or session-close, session detail + transcript caches are not invalidated; the screen continues showing stale data until the next manual refresh.

Rewrite each site to use a **factory-co-located predicate** so the position contract sits next to the factory definition (Adversarial Review Pass 2 MEDIUM-2). In `apps/mobile/src/lib/query-keys.ts`, alongside `sessions.detail` / `sessions.transcript`, export:

```ts
// Returns a TanStack Query predicate that matches the session-detail and/or
// session-transcript keys for a given sessionId across every mode segment.
// Co-located here so the "sessionId lives at queryKey[2] after the mode
// insertion at [1]" contract is enforced beside the factory that creates it.
sessions: {
  // … existing factories …
  matchAnyMode: (sessionId: string) =>
    (q: { queryKey: ReadonlyArray<unknown> }) =>
      (q.queryKey[0] === 'session' || q.queryKey[0] === 'session-transcript') &&
      q.queryKey[2] === sessionId,
  matchDetailAnyMode: (sessionId: string) =>
    (q: { queryKey: ReadonlyArray<unknown> }) =>
      q.queryKey[0] === 'session' && q.queryKey[2] === sessionId,
},
```

Then rewrite each call site to use the predicate:

```ts
// use-retry-filing.ts:26-31 — replace both invalidations with:
void queryClient.invalidateQueries({
  predicate: queryKeys.sessions.matchAnyMode(sessionId),
});

// use-sessions.ts:218 — replace with:
void queryClient.invalidateQueries({
  predicate: queryKeys.sessions.matchAnyMode(sessionId),
});

// use-sessions.ts:247 — `['session', sessionId]` only, so use the detail-only variant:
void queryClient.invalidateQueries({
  predicate: queryKeys.sessions.matchDetailAnyMode(sessionId),
});
```

The user-visible consequence if left untouched is the same as the previous-review note: after retry-filing or session-close, session detail + transcript caches are not invalidated and the screen continues showing stale data.

Add a test in `use-retry-filing.test.ts` (or extend an existing one) that primes the cache with `['session', 'study', sessionId, profileId]` and `['session', 'family', sessionId, profileId]` entries, fires the retry-filing mutation, and asserts both are invalidated regardless of mode.

- [ ] **Step 11c.4: `_layout.tsx` + `invalidateSessionDerivedQueries` broad invalidations are unchanged.**

The header comment in `query-keys.ts:10-12` notes:
> Broad-prefix invalidations (`['progress']`, `['dashboard']`, etc.) in `_layout.tsx` and `invalidateSessionDerivedQueries` are handled in PR 10 and remain as inline literals for now.

`invalidateSessionDerivedQueries` (`use-sessions.ts:45-60`) uses 1-element prefixes (`['progress']`, `['dashboard']`, `['retention']`, `['language-progress']`, `['resume-nudge']`). These match `queryKey[0]` only and **remain correct** after the `mode` insertion at `queryKey[1]`. Add a one-line comment at each broad-invalidation site:

```ts
// queryKey[0] === 'progress' still matches; mode segment added at [1] in v0.
```

This step is **only** for the 1-element prefixes. The 2-element `['session', sessionId]` invalidations are handled in 11c.3 above — they are NOT safe.

- [ ] **Step 11c.5: Run full validation, then commit Tasks 11a + 11b + 11c as ONE commit (Adversarial Review LOW-3).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-sessions.ts src/hooks/use-retry-filing.ts src/lib/query-keys.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

When all three are green, commit via `/commit` with a message that lists all three sub-tasks. No earlier commit was made; this is the single Task 11 commit.

---

## Task 12: Mode-switch query invalidation

**Files:**
- Modify: `apps/mobile/src/app/(app)/home.tsx` (extend the existing `onModeSwitch` handler from Task 6)
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx` (extend the activation-card handler from Task 7)

- [ ] **Step 12.1: Write failing test in `home.test.tsx`.**

```tsx
it('invalidates MODE_SCOPED_KEYS on switch', async () => {
  // Prime the queryClient with a query whose key[0] is 'progress' AND a query
  // whose key[0] is 'subjects' (NOT in MODE_SCOPED_KEYS).
  // Render home, tap the chip.
  // Assert: 'progress' query is in 'invalidated' state; 'subjects' query is not.
});
```

- [ ] **Step 12.2: Implement the invalidation predicate.**

Extend the `onModeSwitch` handler:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { MODE_SCOPED_KEYS } from '../../lib/mode-scoped-keys';

const queryClient = useQueryClient();

const onModeSwitch = () => {
  // … reentrancy guard, analytics …
  setMode(next);
  void queryClient.invalidateQueries({
    predicate: (q) =>
      MODE_SCOPED_KEYS.includes(
        String(q.queryKey[0]) as (typeof MODE_SCOPED_KEYS)[number],
      ),
  });
  router.replace('/(app)/home');
};
```

Apply the same call in the activation-card handler in `ParentHomeScreen.tsx`.

- [ ] **Step 12.3: Run tests; verify green.**

- [ ] **Step 12.4: Commit via `/commit`.**

---

## Task 13: Proxy normal-path hide-out

**Files:**
- Identify and remove user-facing `setProxyMode(true)` call sites.
- Preserve: the `setProxyMode` function itself, `signOutWithCleanup`'s `setProxyMode(false)`, `PARENT_PROXY_KEY` SecureStore handling, `PARENT_PROXY_TABS`, and `onSwitchBack` in `_layout.tsx:1685`.

- [ ] **Step 13.1: Enumerate call sites.**

```
Grep pattern: "setProxyMode\\(true\\)"
File scope: apps/mobile/src/**
```

- [ ] **Step 13.2: Classify each match.**

For each match, decide: is the call reachable from a user-visible tap (profile row, profile picker, More screen, Settings) — or is it internal/synthetic? Write the classification into a scratch note in the commit message.

- [ ] **Step 13.3: Write the forward-only guard test.**

Create `apps/mobile/src/lib/proxy-entry-guard.test.ts`:

```ts
import { readFileSync } from 'fs';
import { glob } from 'glob';

it('no user-facing component calls setProxyMode(true)', async () => {
  const files = await glob('apps/mobile/src/{components/profile,app/(app)/more}/**/*.{ts,tsx}');
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (src.includes('setProxyMode(true)')) offenders.push(f);
  }
  expect(offenders).toEqual([]);
});
```

(If the repo's existing forward-only-guard tests use a different harness — e.g. `persona-fossil-guard.test.ts` — match that shape.)

- [ ] **Step 13.4: Delete the identified user-facing call sites.**

For each user-facing match, remove the call (and the affordance that triggered it, e.g. a profile-row Pressable that previously offered "view as child").

- [ ] **Step 13.5: Run tests; verify green.**

- [ ] **Step 13.6: Typecheck + lint.**

- [ ] **Step 13.7: Commit via `/commit`.**

---

## Task 14: Family route guard at `child/[profileId]/_layout.tsx`

**Files:**
- Create: `apps/mobile/src/components/guards/RequireFamilyContext.tsx`
- Create: `apps/mobile/src/components/guards/RequireFamilyContext.test.tsx`
- Modify: `apps/mobile/src/lib/navigation.ts` (add `useGuardFamilyRoute`)
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`
- Modify: layout's co-located test

- [ ] **Step 14.1: Write failing test for `RequireFamilyContext`.**

```tsx
// Cases:
// 1. mode='family' → renders children immediately, no nav.
// 2. mode='study' AND family-capable adult → setMode('family') fires, then renders.
// 3. mode='study' AND non-capable user → renders a no-access fallback; never
//    renders children.
// 4. mode=null (boot) → renders nothing / a loading shim; defers decision.
```

- [ ] **Step 14.2: Run; verify red.**

- [ ] **Step 14.3: Implement `RequireFamilyContext.tsx`.**

```tsx
import { useEffect, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppContext } from '../../lib/app-context';
import { isFamilyCapableProfile, useProfile } from '../../lib/profile';

export function RequireFamilyContext({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Task 0 kill-switch: when MODE_NAV_V0_ENABLED is false, render children
  // as a no-op pass-through. Today's protection for child routes is the
  // existing `resolveTabShape() !== 'guardian'` redirect path on the
  // non-capable user, which continues to work without this guard.
  if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) return <>{children}</>;

  const { mode, setMode } = useAppContext();
  const { activeProfile, profiles } = useProfile();
  const router = useRouter();
  const capable = isFamilyCapableProfile(activeProfile, profiles);

  useEffect(() => {
    if (mode === 'study' && capable) {
      setMode('family');
    }
  }, [mode, capable, setMode]);

  if (mode === null) return null; // boot — defer
  if (mode === 'family') return <>{children}</>;
  if (capable) return null; // mid-switch; next render renders children
  // Non-capable user reached this route via deep link or notification:
  return (
    <View className="flex-1 items-center justify-center bg-background px-6" testID="require-family-fallback">
      <Text className="text-body text-text-secondary text-center">
        This view is only available in Family mode.
      </Text>
      <Pressable
        onPress={() => router.replace('/(app)/home')}
        className="mt-4 bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
        accessibilityRole="button"
        testID="require-family-go-home"
      >
        <Text className="text-text-inverse text-body font-semibold">Go to Home</Text>
      </Pressable>
    </View>
  );
}
```

Also add `useGuardFamilyRoute()` to `apps/mobile/src/lib/navigation.ts`:

```ts
import { useEffect } from 'react';
import { useAppContext } from './app-context';
import { isFamilyCapableProfile, useProfile } from './profile';

export function useGuardFamilyRoute(): { ready: boolean; capable: boolean } {
  const { mode, setMode } = useAppContext();
  const { activeProfile, profiles } = useProfile();
  const capable = isFamilyCapableProfile(activeProfile, profiles);

  useEffect(() => {
    if (mode === 'study' && capable) setMode('family');
  }, [mode, capable, setMode]);

  return { ready: mode === 'family', capable };
}
```

- [ ] **Step 14.4: Wrap the child layout.**

Edit `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';
import { RequireFamilyContext } from '../../../../components/guards/RequireFamilyContext';

export const unstable_settings = { initialRouteName: 'index' };

export default function ChildDetailLayout() {
  const colors = useThemeColors();
  return (
    <RequireFamilyContext>
      <Stack
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="session/[sessionId]" getId={({ params }) => params?.sessionId} />
        <Stack.Screen name="report/[reportId]" getId={({ params }) => params?.reportId} />
        <Stack.Screen name="weekly-report/[weeklyReportId]" getId={({ params }) => params?.weeklyReportId} />
        <Stack.Screen name="subjects/[subjectId]" getId={({ params }) => params?.subjectId} />
        <Stack.Screen name="topic/[topicId]" getId={({ params }) => params?.topicId} />
      </Stack>
    </RequireFamilyContext>
  );
}
```

- [ ] **Step 14.5: Update `_layout.test.tsx`.**

Add tests covering at least **three distinct nested routes** — **one static** (`index`, `mentor-memory`, or `reports`) **and at least one dynamic** (`session/[sessionId]`, `report/[reportId]`, `weekly-report/[weeklyReportId]`, `subjects/[subjectId]`, or `topic/[topicId]`). The guard's purpose is route-class coverage, not one-path proof. **Why both shapes (Adversarial Review Pass 2 LOW-1):** static routes are auto-detected by Expo Router and are NOT listed in the `<Stack.Screen>` children of `_layout.tsx` — a regression that wraps only the dynamic screens explicitly would still leave static routes unguarded if the layout wrap itself were broken. Picking one of each shape proves the layout-level wrap covers both auto-detection paths.

- [ ] **Step 14.6: Run tests; verify green.**

- [ ] **Step 14.7: Typecheck + lint.**

- [ ] **Step 14.8: Commit via `/commit`.**

---

## Task 15: Integration & cross-account safety tests

**Files:**
- Create/extend integration tests under `apps/mobile/src/lib/app-context.test.tsx` (or a dedicated `app-context.integration.test.tsx`).

- [ ] **Step 15.1: Identity-loss reset test (AC #27).**

```tsx
it('synchronously resets mode to null when activeProfile transitions to null', () => {
  // Render the hook with activeProfile=adult+kid → mode='family'.
  // Rerender with activeProfile=null → expect mode === null in the same render pass.
  // Then rerender with a NEW adultOwner (different id) + kid → expect mode='family'.
  // Asserts no value of 'family' from the previous user is observable.
});
```

- [ ] **Step 15.2: Cross-account safety test.**

```tsx
it('recomputes mode when activeProfile id changes without unmount', () => {
  // User A: adult+kid → mode='family'.
  // User B: solo adult → mode='study'.
  // Verify the React context never carries 'family' into User B.
});
```

- [ ] **Step 15.3: Rapid-toggle test (AC #21).**

**Test the guard directly, not via simulated UI taps (Adversarial Review MEDIUM-2).** RN's `Pressable.onPress` events arrive sequentially as separate React commits, so two `.press()` calls inside `act(() => { press(); press(); })` would pass even if the `useRef` guard were removed — the test would assert success on a property the guard doesn't actually provide. Exercise the guard at its actual reentry vector: call `onModeSwitch()` twice synchronously within the same JS microtask.

```tsx
it('reentrant onModeSwitch within one tick is a no-op on the second call', () => {
  const setModeSpy = jest.fn();
  const trackSpy = jest.fn();
  // Hoist onModeSwitch out of HomeScreen into a thin testable helper, OR
  // render HomeScreen and reach into the handler via a testID-keyed event
  // bus. Then:
  // 1) Fire onModeSwitch() — synchronously.
  // 2) BEFORE the setTimeout(() => switchingRef.current = false, 0) macrotask
  //    flushes, fire onModeSwitch() again — synchronously, in the same tick.
  // 3) Assert setModeSpy was called exactly once and trackSpy was called exactly once.
  // 4) jest.runAllTimers(); call onModeSwitch() a third time — assert it now
  //    fires (guard released).
});
```

If hoisting the handler isn't practical, the next-best test is to extract the `useRef` + reentrancy logic into a tiny `useReentrancyGuard()` hook and unit-test that hook in isolation. Either way, do NOT assert reentrancy via `fireEvent.press(...); fireEvent.press(...)` — that path doesn't reach the guard.

- [ ] **Step 15.4: Cache leak test.**

```tsx
it('switching from Family to Study invalidates MODE_SCOPED_KEYS and does not render stale child data', async () => {
  // Prime cache with a family-scoped query.
  // Switch mode.
  // Assert: invalidated; subsequent render in Study mode does not display
  //         any child data.
});
```

- [ ] **Step 15.5: Detail-back fallback test.**

```tsx
it('goBackOrReplace lands on /(app)/home when opening child session detail via deep link and pressing back', () => {
  // Mount detail directly; trigger back; assert router.replace called with /(app)/home.
});
```

- [ ] **Step 15.6: Direct-child-route-while-Study test (covering 3+ routes).**

For each of `child/[profileId]/index`, `child/[profileId]/session/[sessionId]`, `child/[profileId]/reports`:

```tsx
it('blocks child data render until mode flips to Family (route: <name>)', () => {
  // Start in mode='study', family-capable adult.
  // Mount the nested route.
  // Assert RequireFamilyContext fires setMode('family') BEFORE any child data renders.
});
```

- [ ] **Step 15.7: Boot-frame flicker test (AC #3).**

```tsx
it('does not flicker between Study and Family tab sets during initial profile load', () => {
  // While useProfile().isLoading === true, mode === null and computeModeVisibleTabs
  // returns ∅ — neither tab set is rendered.
});
```

- [ ] **Step 15.8: Run the full integration test file.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/app-context.test.tsx --no-coverage
```

- [ ] **Step 15.9: Run a broader sanity sweep.**

```bash
cd apps/mobile && pnpm exec jest --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

Any failure here is a real regression — fix root cause, never weaken the failing assertion (per CLAUDE.md "Tests Must Reflect Reality").

- [ ] **Step 15.10: Commit via `/commit`.**

---

## Task 16: Final acceptance criteria sweep

- [ ] **Step 16.1: Walk every AC in the spec (§Acceptance Criteria #1-#27).**

For each AC, locate the test that asserts it. Build a small AC → test mapping table in the PR description (or in a scratch note that lands in the `/commit` body).

- [ ] **Step 16.2: Verify no `jest.mock()` was added for internal modules in this branch.**

```
Grep across the diff for new "jest.mock\\(['\"]\\.{1,2}/" or "jest.mock\\(['\"]@eduagent/" — should be zero.
```

If anything appears, refactor to `jest.requireActual` with targeted overrides (canonical: `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`).

- [ ] **Step 16.3: Verify `MODE_SCOPED_KEYS ⊆ PROFILE_SCOPED_KEYS` guard still passes.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/mode-scoped-keys.test.ts --no-coverage
```

- [ ] **Step 16.4: Verify no SecureStore mode-state leak.**

```
Grep for SecureStore keys containing "mode" or "app-context". Expected: zero matches.
```

If a match exists, the spec's hard rule was violated — remove the persistence and document in PR body.

- [ ] **Step 16.5: Run change-class checker for the full branch diff.**

```bash
bash scripts/check-change-class.sh --branch
```

Address every reported validation step.

- [ ] **Step 16.6: Final commit / push via `/commit`** (only if any cleanup remains; otherwise nothing to commit).

---

## Out-of-scope tripwires (do not implement)

If any of the following come up during implementation, **stop and surface to the user** — they are deliberately deferred to v1:

- `profiles.default_app_context` column, migration, rollback markdown.
- `PATCH /profiles/:id` app-context mutation.
- `/recaps` route, service, or feed endpoint.
- First-run intent screen (`/(app)/onboarding/intent.tsx`).
- `Learn this too` bridge, `StudySourceContext`.
- Push notification routing rewrite (route-level guard at `child/[profileId]/_layout.tsx` is in scope; handler rewrite is not).
- Cross-device mode persistence (no SecureStore, no API).
- `X-App-Context` request header.
- Any `archivedAt`, `hasFamilyLinks`, or shortcut-capability field on `profileSchema`.
- `mode_intent_chosen`, `learn_this_too_*` analytics events.

---

## Self-Review Notes

- **Spec coverage:** Every spec §Step (1-10) and AC (#1-#27) maps to a task above. AC mapping summary:
  - AC #1 → Task 4 (tab visibility for non-family-capable)
  - AC #2 → Task 1 (`isFamilyCapableProfile` cases)
  - AC #3, #15 → Tasks 4, 6, 15.7
  - AC #4, #5 → Task 4.1
  - AC #6, #7 → Task 6
  - AC #8, #9 → Task 7
  - AC #10, #11 → Task 9
  - AC #12, #13 → Task 8
  - AC #14 → Task 15.5 + existing `goBackOrReplace`
  - AC #16 → Task 12
  - AC #17 → Tasks 2, 15.2
  - AC #18 → Task 13
  - AC #19, #20 → Task 5
  - AC #21 → Task 6 (reentrancy) + Task 15.3
  - AC #22 → Task 8
  - AC #23 → Task 14 (covers 3+ nested routes)
  - AC #24 → Task 4 (proxy precedence)
  - AC #25 → Task 10 (guard test)
  - AC #26 → Task 1 + Task 6 (`LearnerScreen` mode-driven branch)
  - AC #27 → Tasks 2, 15.1
  - **Kill-switch (Task 0, not in spec ACs):** verified via a dedicated test that asserts `MODE_NAV_V0_ENABLED=false` collapses the whole v0 path — `useAppContext().mode === null` for a family-capable adult, tab shell renders the legacy `computeVisibleTabs` set, `LearnerScreen` follows the `(hasLinkedChildren || isFamilyPlanOwner)` branch, no chip / activation card / Recent-child-activity / RequireFamilyContext fallback renders. Add this as `feature-flag.integration.test.tsx` alongside the Task 15 integration suite.

- **Type consistency check:**
  - `AppMode = 'study' | 'family'` defined in `app-context.tsx`, consumed by `query-keys.ts` and `mode-scoped-keys.ts`.
  - `mode: AppMode | null` is the runtime value everywhere except inside `MODE_SCOPED_KEYS` (which is a list of string prefixes only).
  - `computeModeVisibleTabs(mode: AppMode | null)` matches the call sites.
  - `isFamilyCapableProfile(activeProfile, profiles)` signature is identical in all consumers.

- **Placeholder scan:** No "TBD", no "add appropriate error handling", no "similar to Task N". Every code step shows the actual code.

---

## Handoff

After saving this plan, the user picks the execution path:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks (per `superpowers:subagent-driven-development`).
2. **Inline Execution** — batch execution with checkpoints (per `superpowers:executing-plans`).

---

## Adversarial Review Changes (2026-05-19)

Pass 1 + 2 of the `challenge` skill applied to this plan. Findings folded in:

| ID | Issue | Resolution |
|---|---|---|
| CRITICAL-1 | 2-element `['session'/'session-transcript', sessionId]` invalidations break after `mode` insertion at queryKey[1] — Task 11c.4 originally claimed "no edit needed" (false) | Added Step 11c.3 enumerating 4 broken call sites (`use-retry-filing.ts:27,29`, `use-sessions.ts:218,247`) with predicate-rewrite pattern; added `use-retry-filing.ts` to Task 11 Files; added regression test requirement |
| CRITICAL-2 | `use-sessions.ts` consumers (7 call sites) missing from Task 11 file inventory | Added `use-sessions.ts` and `use-retry-filing.ts` to top-level Modified files, to Task 11 Files block, and to the 11c.1 grep expectations |
| HIGH-1 | `resolveHomeTabPresentation` not made mode-aware — home tab title contradicts mode for guardian-shape Study-mode adults | New Step 4.5 extends signature to take `mode`, threads it at the call site `_layout.tsx:1415`, adds unit-test cases |
| HIGH-2 | Task 3.2 mount example wraps inside `<ProfileProvider>` — but ProfileProvider lives in root `app/_layout.tsx:570`, not `(app)/_layout.tsx` | Rewrote Task 3 with two structural options; chose Option B (split `AppLayout` into outer wrapper + `AppLayoutInner`) because Tasks 4 and 6 consume `useAppContext()` inside the same component |
| MEDIUM-1 | Step 4.4 told implementer to edit "inside the `screenOptions` callback" — but `visibleTabs` is a useMemo at `_layout.tsx:1411-1414` in the component body | Rewrote Step 4.4 to target the useMemo with corrected deps array; clarified the callback already reads `visibleTabs.has(route.name)` and needs no edit |
| MEDIUM-2 | Task 15.3 rapid-toggle test would pass even if the reentrancy guard were removed — `fireEvent.press()` calls already commit separately | Rewrote 15.3 to call `onModeSwitch()` synchronously twice within one tick; added option to extract `useReentrancyGuard()` for isolated unit testing |
| MEDIUM-3 | `enabled: mode !== null` strictly orders mode resolution before any mode-scoped fetch — one extra render delay vs. today | Added explicit note in Task 2 Notes block; suggested measurement-driven relaxation if it regresses Home/Progress load |
| MEDIUM-4 | Tests for `home.tsx` / `ParentHomeScreen.tsx` transitively pull SecureStore via ProfileProvider — mock posture not pinned | Added MEDIUM-4 implementation note to Task 6 Step 6.2 and Task 8 Step 8.2; referenced canonical `gc1-allow` pattern at `progress/reports/index.test.tsx:55` |
| LOW-1 | Task 2 test wrapper omitted 4 required `ProfileContextValue` fields (`switchProfile`, `profileLoadError`, `profileWasRemoved`, `acknowledgeProfileRemoval`) | Wrapper now pre-populates all 7 fields explicitly so the example typechecks as-written |
| LOW-2 | `OWN_LEARNING_RETURN_TO = 'own-learning'` after Route Survival returns to a tab-less surface in Study mode | Added tripwire note in Task 5.4; defers a v1 fix to normalize `returnToTab` on mode flip |
| LOW-3 | Step 11a.6 originally allowed a typecheck-red commit between 11a and 11c | Reworked 11a.6 / 11b.3 / 11c.5 so all three sub-tasks land as one commit; no commit on disk is typecheck-red, pre-commit hook never bypassed |

Either path: the coordinator (not the subagents) does the `/commit` at each task boundary per CLAUDE.md "Subagents must never run `git add`, `git commit`, or `git push`".

---

## Adversarial Review Pass 2 (2026-05-19)

Second adversarial pass — challenged Pass 1's output against current code. Findings applied:

| ID (Pass 2) | Issue | Evidence | Resolution |
|---|---|---|---|
| CRITICAL-1 | Task 10 claimed `'session'` / `'session-transcript'` / `'session-summary'` / `'parking-lot'` must be added to `PROFILE_SCOPED_KEYS` — all four are already in the live list | `profile.ts:262, 264, 265, 294` | Rewrote Task 10 header + Step 10.4 to "move, do not add"; updated File Inventory note |
| CRITICAL-2 | Step 10.4's example `PROFILE_SCOPED_KEYS_FOR_TEST` list undercounted reality by ~27 entries — applying as-written would delete `all-notes`, `bookmarks`, `celebrations`, `consent`, `topic-notes`, `library`, `vocabulary`, `learner-profile`, `quiz-round*`, `language-progress`, `resume-nudge`, etc. | `profile.ts:252-307` actual array vs plan's 29-line example | Replaced inline literal with "copy verbatim from profile.ts:252-307; do not retype" + post-move diff check |
| CRITICAL-3 | Hard Rule #2 leak — `useProfileSessions` (`use-progress.ts:421-454`) switches to `client.dashboard.children[':profileId'].sessions.$get` when `profileId !== activeProfile.id`; `enabled` only checks `isOwner === true`, NOT mode. Family→Study flip with stale `selectedProfileId === childId` fetches child data into the Study cache. Same hole in `useChildInventory`, `useChildProgressSummary`, `useProfileReports`, `useProfileWeeklyReports` | `use-progress.ts:421-454` | Task 9 now resets `selectedProfileId` on mode flip; Task 11b.2a adds a mode gate to every foreign-profile hook's `enabled` (defense in depth); File Inventory updated |
| CRITICAL-4 | Progress accepts `?profileId=<childId>` deep-link param (`progress/index.tsx:512-531`) and seeds `selectedProfileId` to a foreign profile even in Study mode — the picker filter alone doesn't block this | `progress/index.tsx:512-531` | Task 9 now rejects `requestedProfileId` when `mode === 'study'` and the id is not self |
| HIGH-1 | Task 2's `useState + useEffect` pattern produces a render where `mode === null` AFTER profiles have already loaded → Task 4.4's `mode === null → ∅` returns zero tabs → visible regression vs. today's least-privilege-learner fallback at `_layout.tsx:108`. The earlier review's "sub-frame" framing was wrong | Confirmed by reading `app-context.tsx` skeleton in Task 2 + composition in Task 4.4 | Mandated synchronous `useMemo`-based derivation in Task 2; rewrote Task 4.4 composition to fall through to legacy `computeVisibleTabs` when `mode === null` instead of returning ∅ |
| HIGH-2 | Conventions block told a reader (including subagents) "After each task: stage the files, run `/commit`, push" — direct contradiction of CLAUDE.md "Subagents must never commit" | Plan line 21 vs. CLAUDE.md | Rewrote Conventions to "Coordinator only" with explicit prohibition on subagent commits |
| MEDIUM-1 | Task 8.4 tile rendered raw `c.trend` enum → "5 sessions this week · up" UX bug; also conflicts with `feedback_positive_framing_no_struggle` for the `down` value | Plan Task 8.4 + `packages/schemas/src/progress.ts:307` | Dropped `c.trend` from v0 tile copy; defer trend visualization to v1 |
| MEDIUM-2 | Task 11c.3 hardcoded `q.queryKey[2] === sessionId` in two call sites — position contract lives away from the factory definition, brittle to refactor | Plan Task 11c.3 | Added co-located `queryKeys.sessions.matchAnyMode(sessionId)` + `matchDetailAnyMode(sessionId)` predicates; rewrote both call sites to use them |
| MEDIUM-3 | Mode-flip forces a `dashboard.root` cold refetch every toggle (cache partitioned at queryKey[1]); not documented as an accepted trade-off | Plan §Step 8 / Task 11a factory table | Added explicit "Cold-refetch cost" note in Task 11a; rejected `setQueryData` seeding in v0 |
| LOW-1 | Task 14.5 said "three distinct nested routes" but didn't distinguish static vs dynamic; static routes (`index`, `mentor-memory`, `reports`) aren't in the `<Stack.Screen>` children — explicit wrap-each-screen regression would leave them unguarded | `apps/(app)/child/[profileId]/_layout.tsx` lists only 5 dynamic screens; filesystem shows 3 static routes | Updated Step 14.5 to require at least one static + one dynamic route, with rationale |

**Carry-forward to the spec.** Pass 2 CRITICAL-1 (stale "add four prefixes" claim) and CRITICAL-3 (`selectedProfileId` reset + foreign-profile `enabled` gate) also affect the spec source-of-truth (`docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md` §Hard Rule #7 last sentence and §Step 7). Surface to the spec owner; per the plan preamble "when this plan and the spec disagree, the spec wins — pause and amend." The plan's Pass 2 edits are the implementation-side hardening; the spec should also drop the "forward-only bug fix" sentence in §Hard Rule #7 and add the `selectedProfileId` reset + foreign-profile `enabled` rules to §Hard Rule #2 / §Step 7.
