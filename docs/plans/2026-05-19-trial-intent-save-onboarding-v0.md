# Trial Intent Save Onboarding v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pre-signup intent screen + post-signup save wizard that routes self / parent / both / not-sure users to the correct profile shape and landing surface, replacing today's learner-only "try it" path.

**Architecture:** Three preview routes outside `(app)/` (landing → intent → topic|value-prop), state held in-memory plus a single 1-hour SecureStore key for cold-start survival across the OAuth round-trip. The post-signup save wizard is an **inline gate component** co-located inside `(app)/_layout.tsx` (mirrors the existing `CreateProfileGate` at line 640) — NOT a nested route. [CRITICAL-A2] The layout's gate ordering is: probe-loading spinner → `SaveWizardGate` (`previewProbeState === 'present' && !wizardDone`) → `CreateProfileGate` (`!activeProfile`) → consent gates → Tabs. Whole feature lives behind `PREVIEW_ONBOARDING_ENABLED`; the `isFamilyCapableProfile()` helper and the SecureStore-key entry in sign-out-cleanup ship unconditionally because the sibling Study/Family v0 spec imports them.

**Tech Stack:** Expo Router (file-based routing), React Native, Clerk (auth), expo-secure-store, TanStack Query (`useProfiles` is `['profiles', userId]`-scoped), Hono RPC client, Jest co-located unit tests, Maestro E2E.

**Reference spec:** `docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md`. Read it once before starting Task 0.

---

## Adversarial Review Round 2 — Findings Applied (2026-05-19)

Second review pass after Round 1 missed two structural bugs in how the wizard mounts. Inline `[ID2]` markers below cite Round-2 findings.

- **[CRITICAL-A2]** Wizard reshaped from a nested route (`(app)/preview/save.tsx`) into an **inline gate component** co-located inside `(app)/_layout.tsx`, mirroring the existing `CreateProfileGate` (line 640). Reasons:
  - `(app)/_layout.tsx:1665-1671` no-profile branch returns `<FeedbackProvider><CreateProfileGate /></FeedbackProvider>` — it does NOT render `<Slot>`/`<Tabs>`, so any nested route under `(app)/preview/*` cannot mount. The Round-1 `<Redirect>` plan never had a destination to land on.
  - `ProfileProvider` at `profile.ts:154-174` auto-activates the first profile the moment `profiles.length > 0`. With the wizard as a route, the Step-2 POST would cause `!activeProfile` to flip to falsy mid-wizard, ejecting the user before Step 3 renders. As an inline gate the wizard outlives that transition.
- **[CRITICAL-B2]** The auto-cleanup effect (`if (activeProfile && profiles.length > 0) clearPreviewState()`) is REMOVED. It would wipe `createdOwnerProfileId` between the owner POST and the child POST, destroying the [HIGH-4] resume guard. Cleanup now relies on (a) TTL, (b) sign-out-cleanup, (c) the wizard's explicit `clearPreviewState()` on Step-3 success.
- **[HIGH-A2]** Wizard takes an `onComplete` callback from the layout. On final-step success the wizard calls `onComplete()`, which flips a local layout state (`wizardDone`) so the gate falls through to normal Tabs even though `previewProbeState` is still cached as `'present'`. The gate ordering is now: probe-loading → wizard branch (`previewProbeState === 'present' && !wizardDone`) → `!activeProfile` → consent gates → Tabs.
- **[HIGH-B2]** Adult-age gate added in Task 13: when `needsChild` (target ∈ {`child`, `both`}), the parent's birth-year input must put them at 18+ before Continue enables. Without this, a 13-year-old could complete the wizard as an `isOwner=true` profile with a child linked underneath (server allows 11+ as the floor; it does not enforce "parents must be adults").
- **[HIGH-C2]** `sign-up-preview-redirect.ts` helper + `sign-up.tsx` edit DROPPED. With CRITICAL-A2's inline architecture, the gate handles the post-signup branch directly — no pending-auth-redirect plumbing needed. Cleaner failure mode (no race between `setActive` and the redirect-replay window in `(app)/_layout.tsx:1423-1490`). [MEDIUM-A2] follows: the Round-1 HIGH-1 description of pending-auth-redirect as web-only was inaccurate (line 17 has an in-memory fallback that works on native too), but the helper is removed entirely so the framing is moot.
- **[MEDIUM-B2]** Deferred-sweep footnote in Task 17 expanded: `use-profiles.ts:65` (`useUpdateProfileName.onSuccess`) is the second bare-key-invalidation site alongside `create-profile.tsx:184`. Both are deferred sweeps, not blockers for this PR.
- **[MEDIUM-C2]** `bothPriority` is hardcoded to `'child_first'` in Task 7 with no UI to flip it. Spec re-read required to confirm intent; documented as deferred-to-v0.1 if the spec assumes child-first only.
- **[MEDIUM-D2]** Task 11 test no longer does `(FEATURE_FLAGS as any).X = false` — replaced with the `jest.doMock` + `jest.isolateModules` pattern already mandated by [HIGH-3] in Task 5.

---

## Adversarial Review Round 1 — Findings Applied (2026-05-19)

Round-1 findings (folded in earlier in the day). Inline `[ID]` markers below cite which finding drove each change.

- **[CRITICAL-1]** `forChild` body field removed — `profileCreateSchema` (`packages/schemas/src/profiles.ts:44`) does not accept it. Owner-vs-child is determined server-side by call order (`createProfileWithLimitCheck` in `apps/api/src/services/profile.ts:253`). See Task 13.
- **[CRITICAL-2]** Manual `<Tabs.Screen name="preview/save">` registration dropped — `(app)/_layout.tsx:1715-1768` already auto-hides any route not in `visibleTabs`. The wizard route is added to `FULL_SCREEN_ROUTES` so the tab bar disappears while it is mounted. See Task 11.
- **[CRITICAL-3]** Wizard now redirects home when `getPreviewState()` resolves null instead of rendering blank. See Task 12 + Failure Modes addendum.
- **[CRITICAL-4]** `isFamilyCapableProfile` no longer calls `computeAgeBracket` (CLAUDE.md forbids it for feature gating). It is now `isOwner + ≥1 linked non-owner`, identical to existing `isGuardianProfile`. The new name exists only for sibling-spec readability. See Task 2.
- **[HIGH-1]** Task 10 re-framed: the `(app)/_layout.tsx` gate is the source of truth on native; `rememberPendingAuthRedirect` is a web-only flash-avoidance optimization (`pending-auth-redirect.ts:19-27` is `window.sessionStorage`-only).
- **[HIGH-2]** Single call site for `rememberPreviewRedirectIfNeeded` — only inside `activateCreatedSession` before `setActive` (covers both email-code and OAuth paths). The post-`prepareEmailAddressVerification` call has been removed.
- **[HIGH-3]** Task 5 now begins with a discovery step to find the canonical flag-flip test pattern. No `jest.spyOn(...,'get')` against the `as const` literal; no `(FEATURE_FLAGS as any).X =` mutation.
- **[HIGH-4]** Created owner profile id is persisted to the preview-state record so a wizard remount mid-flight does not create a duplicate profile. See Task 13.
- **[MEDIUM-1]** Grep-based navigation-discipline test dropped; replaced with a behavioral assertion folded into existing tests. See Task 15.
- **[MEDIUM-2]** `sign-up-preview-redirect` helper moved out of `app/(auth)/` to `src/lib/` to avoid Expo Router pollution.
- **[MEDIUM-3]** Line-number references in Task 11 replaced with landmark anchors (`if (!activeProfile)`, `<Tabs screenOptions=...>`).
- **[MEDIUM-4]** `keychainAccessible` option imported directly from `expo-secure-store`; no `as never` cast.
- **[MEDIUM-5]** Topic max lowered from 200 → 80 chars (single-line topic) with a comment explaining the leak-surface rationale.
- **[MEDIUM-6]** Predicate invalidation made the project standard for `['profiles']` cache; a footnote in Task 17 calls out the `create-profile.tsx` site as a deferred sweep.
- **[LOW-1]** `seedPreviewStateForTesting(state, staleMs)` helper added in Task 3, mirroring `seedPendingAuthRedirectForTesting`. Task 16 Flow 5 now uses it.
- **[LOW-2]** Local `state` variable in `value-prop.tsx` renamed to `previewState` to avoid module shadow.

---

## File Map

**New files:**

- `apps/mobile/src/lib/preview-onboarding-state.ts` — state module (in-memory singleton + SecureStore TTL). Also exports `seedPreviewStateForTesting` [LOW-1].
- `apps/mobile/src/lib/preview-onboarding-state.test.ts`
- `apps/mobile/src/app/preview/_layout.tsx` — stack layout for preview routes (hides tab bar by being outside `(app)/`).
- `apps/mobile/src/app/preview/index.tsx` — "Try MentoMate" landing CTA.
- `apps/mobile/src/app/preview/intent.tsx` — 4-option intent question.
- `apps/mobile/src/app/preview/intent.test.tsx`
- `apps/mobile/src/app/preview/topic.tsx` — topic capture.
- `apps/mobile/src/app/preview/topic.test.tsx`
- `apps/mobile/src/app/preview/value-prop.tsx` — static value-prop, learner|parent variant.
- `apps/mobile/src/app/preview/value-prop.test.tsx`

> [CRITICAL-A2] The post-signup save wizard is NOT a route file. It is an inline component (`SaveWizardGate`) defined inside `apps/mobile/src/app/(app)/_layout.tsx` — same pattern as the existing `CreateProfileGate` (line 640). Tests for it co-locate inside `(app)/_layout.test.tsx` (or extract to `save-wizard-gate.test.tsx` if the layout test file balloons). The previously-planned `(app)/preview/save.tsx`, `(app)/preview/_layout.tsx`, and `(app)/preview/save.test.tsx` are NOT created.

**Modified files:**

- `apps/mobile/src/lib/feature-flags.ts` — add `PREVIEW_ONBOARDING_ENABLED`.
- `apps/mobile/src/lib/profile.ts` — add `isFamilyCapableProfile()` (unconditional, shared with Study/Family v0).
- `apps/mobile/src/lib/profile.test.ts` — new test cases for `isFamilyCapableProfile()`.
- `apps/mobile/src/lib/sign-out-cleanup.ts` — append `'mentomate_preview_intent'` to `GLOBAL_KEYS`.
- `apps/mobile/src/lib/sign-out-cleanup.test.ts` — assert the new key is wiped.
- `apps/mobile/src/app/(auth)/sign-in.tsx` — render "Try MentoMate" CTA when flag on.
- `apps/mobile/src/app/(auth)/sign-in.test.tsx` (or co-located) — assert CTA rendering under both flag states.
- `apps/mobile/src/app/(auth)/_layout.tsx` — no edit. (Read-only verification step.)
- `apps/mobile/src/app/(app)/_layout.tsx` — (a) async preview-state probe, (b) inline `SaveWizardGate` component (CreateProfileGate-style), (c) gate ordering: probe-loading → wizard → no-profile → consent gates → Tabs. NO addition to `FULL_SCREEN_ROUTES` (no route to hide). NO `<Tabs.Screen>` registration. The auto-cleanup effect (`activeProfile && profiles.length > 0 → clearPreviewState`) is NOT added — it would destroy the [HIGH-4] resume guard [CRITICAL-B2].
- `apps/mobile/src/app/(app)/_layout.test.tsx` — preview-state branch tests + SaveWizardGate behavior tests.

> [HIGH-C2] **`sign-up.tsx` is NOT modified.** The Round-1 plan threaded `rememberPreviewRedirectIfNeeded()` into `activateCreatedSession`; with the inline-wizard architecture the gate handles the post-signup transition directly, so no pending-auth-redirect plumbing is needed for this feature. `sign-up-preview-redirect.ts` is not created. The line `import { rememberPreviewRedirectIfNeeded } from '../../lib/sign-up-preview-redirect';` is NEVER added.

**Read-only (no edits expected):**

- `apps/mobile/src/lib/pending-auth-redirect.ts` — NOT consumed by this feature. Round-1 framed it as web-only; Round-2 [MEDIUM-A2] notes that it has an in-memory native fallback at line 17, but neither path is wired here. With the inline-wizard architecture the gate replaces both.
- `apps/mobile/src/app/create-profile.tsx` — the save wizard's profile-basics step reuses the same fields conceptually but does not import the screen (it's a default-export route). Extract shared field components only if duplication grows past two callsites (YAGNI — start with inline form, refactor later if needed).

---

## Task 0: Session-Start Helper Spike (BLOCKER, do not skip)

**Why:** Spec §First Session Handoff requires a decision *before* implementation: either (a) lift the existing session-start call site into a reusable helper and add it to scope, or (b) defer the topic-prefill leg and update wizard CTA copy. This spike eliminates the "pause mid-implementation" loop.

**Files:**
- Read: `apps/mobile/src/app/(app)/home.tsx` (or whichever screen owns the "Start a new session" affordance)
- Read: `apps/mobile/src/hooks/use-create-session.ts` (or equivalent — discover via grep)

- [ ] **Step 1: Find every existing session-start entry point.**

Run from repo root:
```bash
grep -rn "sessions.\$post\|createSession\|startSession\|session-start" apps/mobile/src --include="*.ts" --include="*.tsx" -l
```
Open each hit. For each, note: (a) is it a hook/util or screen-local handler? (b) does it accept a topic string param? (c) does it `router.push` to the session route after success?

- [ ] **Step 2: Decide (a) or (b).**

Decision tree:
- If a reusable hook (e.g., `useCreateSession`) already accepts a topic and navigates → option (a), zero additional scope. Use it directly in Task 14.
- If the only call site is buried in a screen component → option (b) is the default to avoid scope creep. Add a one-line decision to spec §First Session Handoff.

- [ ] **Step 3: Record the decision in this plan.**

Open this file and replace the line below in Task 14:

> **Spike outcome (fill in before starting Task 14):** [option (a) — helper at `<path>` / option (b) — defer topic prefill, CTA reads "Go to my learning"]

- [ ] **Step 4: Commit the spike decision.**

```bash
git add docs/plans/2026-05-19-trial-intent-save-onboarding-v0.md
git commit -m "docs(plan): record session-start spike outcome for trial v0"
```

No code shipped in Task 0.

---

## Task 1: Feature Flag

**Files:**
- Modify: `apps/mobile/src/lib/feature-flags.ts`

- [ ] **Step 1: Add the flag.**

Edit `apps/mobile/src/lib/feature-flags.ts`:

```ts
export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  I18N_ENABLED: true,
  // Pre-signup intent + post-signup save wizard.
  // Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
  // When false:
  //   - sign-in.tsx: "Try MentoMate" CTA hidden, /preview/* unreachable via UI.
  //   - (app)/_layout.tsx: no-profile gate ignores preview state, falls through to CreateProfileGate.
  //   - (app)/_layout.tsx: preview/save tab entry not registered (defensive; route is unreachable anyway).
  // isFamilyCapableProfile() and the mentomate_preview_intent entry in sign-out-cleanup ship UNCONDITIONALLY.
  PREVIEW_ONBOARDING_ENABLED: true,
} as const;
```

- [ ] **Step 2: Typecheck.**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Commit.**

Use `/commit` (do NOT use raw `git commit`). Suggested message:
```
feat(mobile): add PREVIEW_ONBOARDING_ENABLED feature flag

Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
Gate sites listed in feature-flags.ts comment.
```

---

## Task 2: `isFamilyCapableProfile()` Helper (UNCONDITIONAL)

**Files:**
- Modify: `apps/mobile/src/lib/profile.ts`
- Modify: `apps/mobile/src/lib/profile.test.ts` (or create if absent)

> CRITICAL: This helper ships independent of `PREVIEW_ONBOARDING_ENABLED`. The sibling Study/Family v0 spec imports it. Do not wrap any callsite in a flag check.

> [CRITICAL-4] **Age gating REMOVED.** CLAUDE.md (Profile Shapes section) forbids using `computeAgeBracket` for feature gating. The shape of this predicate is therefore identical to the existing `isGuardianProfile` in `profile.ts:30` — `isOwner` + at least one linked non-owner. The new name exists ONLY so the sibling Study/Family v0 spec can import a name that matches its terminology. Adult-only affordances (e.g., "add child" button) keep their own checks at their own call sites; do NOT fold age gating into this predicate.

- [ ] **Step 1: Write failing tests.**

Append to `apps/mobile/src/lib/profile.test.ts` (or create the file with the import boilerplate matching neighboring tests in `apps/mobile/src/lib/`):

```ts
import { isFamilyCapableProfile } from './profile';
import type { Profile } from '@eduagent/schemas';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    displayName: 'Test',
    birthYear: 1985,
    isOwner: true,
    consentStatus: 'CONSENTED',
    createdAt: '2026-01-01T00:00:00.000Z',
    linkCreatedAt: null,
    parentEmail: null,
    // Add any other required Profile fields by reading packages/schemas/src/profiles.ts.
    ...overrides,
  } as Profile;
}

describe('isFamilyCapableProfile', () => {
  const owner = makeProfile({ id: 'p1', isOwner: true, birthYear: 1985 });
  const child = makeProfile({ id: 'p2', isOwner: false, birthYear: 2015 });

  it('returns true when owner has at least one linked non-owner', () => {
    expect(isFamilyCapableProfile(owner, [owner, child])).toBe(true);
  });

  it('returns false when owner has no linked non-owner', () => {
    expect(isFamilyCapableProfile(owner, [owner])).toBe(false);
  });

  it('returns false for non-owner active profile', () => {
    expect(isFamilyCapableProfile(child, [owner, child])).toBe(false);
  });

  it('returns false when activeProfile is null', () => {
    expect(isFamilyCapableProfile(null, [owner, child])).toBe(false);
  });

  // [CRITICAL-4] Explicit anti-test: this predicate must NOT consider age.
  // Age-based gating ("add child" button visibility) lives at its own
  // call sites, never inside the family-capable check.
  it('returns true for a minor owner with a linked non-owner (age is NOT part of this predicate)', () => {
    const minorOwner = makeProfile({ id: 'p1', isOwner: true, birthYear: 2015 });
    expect(isFamilyCapableProfile(minorOwner, [minorOwner, child])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests; confirm they fail (function not exported).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.test.ts --no-coverage
```
Expected: FAIL with "isFamilyCapableProfile is not a function" / undefined import.

- [ ] **Step 3: Implement.**

Open `apps/mobile/src/lib/profile.ts`. Add the helper next to `isGuardianProfile()`:

```ts
/**
 * Family-capable profile predicate. Shared verbatim with Study/Family v0 spec.
 * True iff active profile is an owner with at least one linked non-owner.
 *
 * [CRITICAL-4] Deliberately NO age check — CLAUDE.md forbids using
 * computeAgeBracket() for feature gating. Adult-only affordances (e.g.
 * "Add child") keep their own age checks at their own call sites.
 *
 * Shape is identical to isGuardianProfile() above; the alternate name
 * exists so sibling-spec readers find the term they expect.
 *
 * Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md §Implementation step 1
 * Sibling: docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md §Implementation step 1
 */
export function isFamilyCapableProfile(
  activeProfile: Profile | null | undefined,
  profiles: ReadonlyArray<Profile>,
): boolean {
  if (!activeProfile) return false;
  if (!activeProfile.isOwner) return false;
  return profiles.some((p) => p.id !== activeProfile.id && !p.isOwner);
}
```

> No `computeAgeBracket` import needed.

- [ ] **Step 4: Run tests; confirm pass.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.test.ts --no-coverage
```
Expected: 5 tests pass (including the explicit "age is NOT part of this predicate" anti-test).

- [ ] **Step 5: Commit via `/commit`.**

Suggested message:
```
feat(mobile): add isFamilyCapableProfile shared capability predicate

Shared with study-and-family-mode-navigation-v0 spec.
Owner + ≥1 linked non-owner = family-capable.
No age check — that gates "Add child" affordance only, at its own
call site, per CLAUDE.md "never for feature gating" rule.
```

---

## Task 3: Preview Onboarding State Module

**Files:**
- Create: `apps/mobile/src/lib/preview-onboarding-state.ts`
- Create: `apps/mobile/src/lib/preview-onboarding-state.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `apps/mobile/src/lib/preview-onboarding-state.test.ts`:

```ts
import * as SecureStore from './secure-storage';
import {
  getPreviewState,
  setPreviewState,
  clearPreviewState,
  PREVIEW_INTENT_KEY,
  PREVIEW_TTL_MS,
  type PreviewOnboardingStateV0,
} from './preview-onboarding-state';

describe('preview-onboarding-state', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(() => undefined);
    clearPreviewState();
  });

  const baseState: PreviewOnboardingStateV0 = {
    intent: 'self',
    path: 'learner_value_prop',
    topicText: 'algebra basics',
    createdAt: new Date().toISOString(),
  };

  it('returns null when no state set', async () => {
    expect(await getPreviewState()).toBeNull();
  });

  it('writes in-memory and to SecureStore', async () => {
    await setPreviewState(baseState);
    expect(await getPreviewState()).toEqual(baseState);
    const raw = await SecureStore.getItemAsync(PREVIEW_INTENT_KEY);
    expect(raw).not.toBeNull();
  });

  it('hydrates from SecureStore when memory empty (cold-start)', async () => {
    await setPreviewState(baseState);
    clearPreviewState(); // simulate process restart: memory wiped, key intact

    // Re-write the key directly to simulate the cold-start path
    await SecureStore.setItemAsync(
      PREVIEW_INTENT_KEY,
      JSON.stringify({ ...baseState, savedAt: Date.now() }),
    );

    const result = await getPreviewState();
    expect(result?.intent).toBe('self');
  });

  it('treats expired key as absent', async () => {
    const stale = { ...baseState, savedAt: Date.now() - (PREVIEW_TTL_MS + 1000) };
    await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(stale));
    clearPreviewState();

    expect(await getPreviewState()).toBeNull();
  });

  it('clearPreviewState wipes memory AND SecureStore', async () => {
    await setPreviewState(baseState);
    await clearPreviewState();

    expect(await getPreviewState()).toBeNull();
    expect(await SecureStore.getItemAsync(PREVIEW_INTENT_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test; confirm fail (module missing).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/preview-onboarding-state.test.ts --no-coverage
```
Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement the module.**

Create `apps/mobile/src/lib/preview-onboarding-state.ts`:

```ts
import * as SecureStore from './secure-storage';
// [MEDIUM-4] Import the keychain-accessible constant directly from the
// native module. The wrapper passes options through unchanged
// (secure-storage.ts:106), so a typed value works without `as never` casts.
import { WHEN_UNLOCKED_THIS_DEVICE_ONLY } from 'expo-secure-store';

export const PREVIEW_INTENT_KEY = 'mentomate_preview_intent';
export const PREVIEW_TTL_MS = 60 * 60_000; // 1 hour

export type PreviewIntent = 'self' | 'child' | 'both' | 'not_sure';
export type PreviewPath = 'learner_value_prop' | 'parent_value_prop';
export type SaveTarget = 'self' | 'child' | 'both';

export interface PreviewOnboardingStateV0 {
  intent: PreviewIntent;
  path: PreviewPath;
  topicText?: string;
  bothPriority?: 'child_first' | 'self_first';
  preferredSaveTarget?: SaveTarget;
  createdAt: string;
  // [HIGH-4] Set inside the save wizard after the owner POST succeeds, so a
  // wizard remount mid-flight (refresh, OOM-kill, app background) can resume
  // without double-creating profiles. Cleared by clearPreviewState() on
  // wizard completion or sign-out.
  createdOwnerProfileId?: string;
}

interface StoredRecord extends PreviewOnboardingStateV0 {
  savedAt: number;
}

let memoryState: PreviewOnboardingStateV0 | null = null;

function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < PREVIEW_TTL_MS;
}

export async function getPreviewState(): Promise<PreviewOnboardingStateV0 | null> {
  if (memoryState) return memoryState;

  try {
    const raw = await SecureStore.getItemAsync(PREVIEW_INTENT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    if (
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.intent !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(() => undefined);
      return null;
    }

    if (!isFresh(parsed.savedAt)) {
      await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(() => undefined);
      return null;
    }

    const { savedAt: _ignored, ...state } = parsed as StoredRecord;
    memoryState = state as PreviewOnboardingStateV0;
    return memoryState;
  } catch {
    return null;
  }
}

export async function setPreviewState(state: PreviewOnboardingStateV0): Promise<void> {
  memoryState = state;
  const record: StoredRecord = { ...state, savedAt: Date.now() };
  try {
    // [SEC] WHEN_UNLOCKED_THIS_DEVICE_ONLY excludes from iCloud Keychain sync
    // and device-to-device backups; bounds the topic-text leak surface to
    // the originating device. Spec §Preview State (Minimal).
    await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(record), {
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Non-fatal; in-memory state still survives the warm session.
  }
}

export async function clearPreviewState(): Promise<void> {
  memoryState = null;
  try {
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY);
  } catch {
    // Non-fatal.
  }
}

/**
 * [LOW-1] Dev/E2E only. Writes a preview-state record whose `savedAt` is
 * artificially backdated by `staleMs` milliseconds, so Maestro flows can
 * simulate a TTL-expired record without waiting an hour.
 *
 * Mirrors `seedPendingAuthRedirectForTesting` (pending-auth-redirect.ts:115).
 * Throws in production builds or when EXPO_PUBLIC_E2E !== 'true'.
 */
export async function seedPreviewStateForTesting(
  state: PreviewOnboardingStateV0,
  staleMs: number,
): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.EXPO_PUBLIC_E2E !== 'true'
  ) {
    throw new Error('seedPreviewStateForTesting is dev-only');
  }
  memoryState = state;
  const record: StoredRecord = { ...state, savedAt: Date.now() - staleMs };
  await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(record), {
    keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
```

- [ ] **Step 4: Run tests; confirm pass.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/preview-onboarding-state.test.ts --no-coverage
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 4: Register Preview Key in Sign-Out Cleanup

**Files:**
- Modify: `apps/mobile/src/lib/sign-out-cleanup.ts`
- Modify: `apps/mobile/src/lib/sign-out-cleanup.test.ts` (or co-located)

> This task ships UNCONDITIONALLY. Cleanup is harmless when no key exists, and keeping the entry registered means a future flag flip-on never leaves residue.

- [ ] **Step 1: Write failing test.**

Add to `apps/mobile/src/lib/sign-out-cleanup.test.ts` (or wherever the cleanup tests live — find via `grep -l "clearProfileSecureStorageOnSignOut" apps/mobile/src/lib`):

```ts
it('clears mentomate_preview_intent on sign-out', async () => {
  const spy = jest.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue(undefined);
  await clearProfileSecureStorageOnSignOut([]);
  expect(spy).toHaveBeenCalledWith('mentomate_preview_intent');
});
```

- [ ] **Step 2: Run test; confirm fail.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/sign-out-cleanup.ts --no-coverage
```
Expected: FAIL (key not in `GLOBAL_KEYS`).

- [ ] **Step 3: Edit `sign-out-cleanup.ts`.**

In `apps/mobile/src/lib/sign-out-cleanup.ts`, append to `GLOBAL_KEYS` (currently lines 79-88):

```ts
  'byok-waitlist-joined',
  // preview-onboarding-state.ts — pre-signup intent + topic (1h TTL).
  // Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
  'mentomate_preview_intent',
];
```

- [ ] **Step 4: Run cleanup test + the registry meta-test.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/sign-out-cleanup.ts src/lib/preview-onboarding-state.ts --no-coverage
```
Expected: pass. The companion meta-test (`sign-out-cleanup-registry.test.ts`, referenced at `sign-out-cleanup.ts:27`) must also pass — run:

```bash
cd apps/mobile && pnpm exec jest sign-out-cleanup-registry --no-coverage
```
Expected: pass (the new SecureStore writer is now registered).

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 5: Sign-In CTA Gate

**Files:**
- Modify: `apps/mobile/src/app/(auth)/sign-in.tsx`
- Modify or create: `apps/mobile/src/app/(auth)/sign-in.test.tsx`

- [ ] **Step 0 (Spike, BLOCKER): Discover the canonical flag-flip test pattern.** [HIGH-3]

`FEATURE_FLAGS` is exported `as const` (`feature-flags.ts:1`) — a plain literal with no getter. So `jest.spyOn(FEATURE_FLAGS, 'X', 'get')` THROWS, and `(FEATURE_FLAGS as any).X = false` mutates the global module export and leaks across parallel workers. Neither is acceptable.

Run:
```bash
grep -rn "FEATURE_FLAGS" apps/mobile/src --include "*.test.ts" --include "*.test.tsx" -l
```
Open each file. Identify the canonical pattern. There are three plausible answers; record which one applies before writing tests:

1. **`jest.doMock` + `jest.isolateModules`** — re-mocks the module per test, scoped via `isolateModules`. Cleanest; survives parallel workers.
2. **Top-of-file `jest.mock('../../lib/feature-flags', () => ({...}))`** — module-wide override; one flag value per test file.
3. **No existing pattern** — then introduce option (1) and document it in the plan.

Whichever applies, REPLACE the test sketch below before running it.

- [ ] **Step 1: Write failing test using the canonical pattern.**

Sketch (option 1 — `jest.doMock` + `isolateModules`):

```tsx
import { render, screen } from '@testing-library/react-native';

describe('SignInScreen — Try MentoMate CTA', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('renders the Try MentoMate CTA when flag is on', () => {
    jest.isolateModules(() => {
      jest.doMock('../../lib/feature-flags', () => ({
        FEATURE_FLAGS: {
          COACH_BAND_ENABLED: true,
          MIC_IN_PILL_ENABLED: true,
          I18N_ENABLED: true,
          PREVIEW_ONBOARDING_ENABLED: true,
        },
      }));
      const SignInScreen = require('./sign-in').default;
      render(<SignInScreen />);
      expect(screen.getByTestId('try-mentomate-cta')).toBeTruthy();
    });
  });

  it('hides the CTA when flag is off', () => {
    jest.isolateModules(() => {
      jest.doMock('../../lib/feature-flags', () => ({
        FEATURE_FLAGS: {
          COACH_BAND_ENABLED: true,
          MIC_IN_PILL_ENABLED: true,
          I18N_ENABLED: true,
          PREVIEW_ONBOARDING_ENABLED: false,
        },
      }));
      const SignInScreen = require('./sign-in').default;
      render(<SignInScreen />);
      expect(screen.queryByTestId('try-mentomate-cta')).toBeNull();
    });
  });
});
```

> If the spike found option (2) instead, mirror it. Do NOT invent new patterns — consistency with the rest of the test suite matters more than elegance.

- [ ] **Step 2: Run test; confirm fail.**

- [ ] **Step 3: Edit `sign-in.tsx`.**

Add import near the existing ones:

```tsx
import { FEATURE_FLAGS } from '../../lib/feature-flags';
```

Below the existing sign-in form (find the JSX in `sign-in.tsx` after primary form rendering — look for the section that renders the SSO buttons; the CTA goes just below), insert:

```tsx
{FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED && (
  <View className="w-full mt-6 pt-6 border-t border-border">
    <Text className="text-body-sm text-text-secondary text-center mb-3">
      New here?
    </Text>
    <Pressable
      onPress={() => router.push('/preview')}
      className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
      testID="try-mentomate-cta"
      accessibilityRole="button"
      accessibilityLabel="Try MentoMate"
    >
      <Text className="text-body font-semibold text-primary">
        Try MentoMate
      </Text>
    </Pressable>
  </View>
)}
```

(Adjust `Pressable` / `View` / `Text` imports — they likely already exist in sign-in.tsx.)

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 6: Preview Stack Layout + Landing

**Files:**
- Create: `apps/mobile/src/app/preview/_layout.tsx`
- Create: `apps/mobile/src/app/preview/index.tsx`

> Routes under `preview/*` are outside `(app)/`, so they render full-screen without the tab bar by default. The layout exists only to wrap the stack with theme tokens / safe-area handling consistent with other unauthenticated screens.

- [ ] **Step 1: Create `_layout.tsx`.**

```tsx
import { Stack } from 'expo-router';

export default function PreviewLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create `index.tsx` landing.**

```tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MentomateLogo } from '../../components/MentomateLogo';

export default function PreviewLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-landing"
    >
      <MentomateLogo size={96} />
      <Text className="text-h1 font-bold text-text-primary mt-8 mb-3 text-center">
        Try MentoMate
      </Text>
      <Text className="text-body text-text-secondary mb-10 text-center">
        See how it works — no sign-up needed yet.
      </Text>
      <Pressable
        onPress={() => router.push('/preview/intent')}
        className="bg-primary rounded-button py-3.5 px-10 items-center w-full"
        testID="preview-landing-continue"
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Continue
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit via `/commit`.**

---

## Task 7: Intent Screen

**Files:**
- Create: `apps/mobile/src/app/preview/intent.tsx`
- Create: `apps/mobile/src/app/preview/intent.test.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import IntentScreen from './intent';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

describe('Preview IntentScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('routes Me → topic with intent self', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-self'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'self', path: 'learner_value_prop' }),
    );
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });

  it('routes My child → value-prop parent variant', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-child'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'child', path: 'parent_value_prop' }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('routes Both → topic (child-first default recorded)', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-both'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'both',
        bothPriority: 'child_first',
        path: 'parent_value_prop',
      }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('routes Not sure → topic (lesson fork) with intent not_sure', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-not-sure'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'not_sure' }),
    );
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });
});
```

> The Not-Sure routing in the spec has a low-commitment fork ("Try a quick lesson" vs "See how parent setup works"). v0 default: route to topic (lesson fork). If product wants the explicit fork screen, add it as a follow-up — recording the intent is what matters for AC 1.

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `intent.tsx`.**

```tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setPreviewState, type PreviewIntent } from '../../lib/preview-onboarding-state';

interface Option {
  intent: PreviewIntent;
  label: string;
  description: string;
  testID: string;
}

const OPTIONS: ReadonlyArray<Option> = [
  { intent: 'self', label: 'Me', description: "I'm setting this up for myself.", testID: 'intent-self' },
  { intent: 'child', label: 'My child', description: 'I want to help my child.', testID: 'intent-child' },
  { intent: 'both', label: 'Both', description: 'For me and my child.', testID: 'intent-both' },
  { intent: 'not_sure', label: 'Not sure', description: "Show me how it works first.", testID: 'intent-not-sure' },
];

export default function PreviewIntentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onSelect = async (intent: PreviewIntent) => {
    const createdAt = new Date().toISOString();

    if (intent === 'self') {
      await setPreviewState({ intent: 'self', path: 'learner_value_prop', createdAt });
      router.push('/preview/topic');
      return;
    }
    if (intent === 'child') {
      await setPreviewState({ intent: 'child', path: 'parent_value_prop', createdAt });
      router.push({ pathname: '/preview/value-prop', params: { variant: 'parent' } });
      return;
    }
    if (intent === 'both') {
      await setPreviewState({
        intent: 'both',
        path: 'parent_value_prop',
        bothPriority: 'child_first',
        createdAt,
      });
      router.push({ pathname: '/preview/value-prop', params: { variant: 'parent' } });
      return;
    }
    // not_sure → lesson fork (v0: same as self)
    await setPreviewState({ intent: 'not_sure', path: 'learner_value_prop', createdAt });
    router.push('/preview/topic');
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom }}
      testID="preview-intent"
    >
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        Who are you setting this up for?
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        We&apos;ll tailor what you see next.
      </Text>
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.intent}
          onPress={() => void onSelect(opt.intent)}
          className="bg-surface rounded-card px-4 py-4 mb-3"
          testID={opt.testID}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            {opt.label}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {opt.description}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 8: Topic Screen

**Files:**
- Create: `apps/mobile/src/app/preview/topic.tsx`
- Create: `apps/mobile/src/app/preview/topic.test.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import TopicScreen from './topic';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

describe('Preview TopicScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('stores topic and navigates to value-prop learner variant', async () => {
    render(<TopicScreen />);
    fireEvent.changeText(screen.getByTestId('preview-topic-input'), 'algebra basics');
    fireEvent.press(screen.getByTestId('preview-topic-continue'));

    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({ topicText: 'algebra basics', intent: 'self' }),
      );
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'learner' },
    });
  });

  it('disables continue when topic is empty', () => {
    render(<TopicScreen />);
    const cta = screen.getByTestId('preview-topic-continue');
    expect(cta.props.accessibilityState?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `topic.tsx`.**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import {
  getPreviewState,
  setPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';

// [MEDIUM-5] Single-line topic cap. The value is persisted to SecureStore for
// up to 1h pre-signup, so it WILL outlive the screen. Keeping the field short
// discourages users from pasting longer free text that may contain PII (child
// names, school names, learning disability descriptions), and the parent-vs-
// learner branch never needs more than a couple of words to tailor copy.
// Spec §Preview State (Minimal) accepts the truncated cap.
const MAX_TOPIC_LEN = 80;

export default function PreviewTopicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [current, setCurrent] = useState<PreviewOnboardingStateV0 | null>(null);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    void getPreviewState().then((s) => {
      if (s) {
        setCurrent(s);
        if (s.topicText) setTopic(s.topicText);
      }
    });
  }, []);

  const trimmed = topic.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_TOPIC_LEN;

  const onContinue = async () => {
    if (!canSubmit || !current) return;
    await setPreviewState({ ...current, topicText: trimmed });
    router.push({ pathname: '/preview/value-prop', params: { variant: 'learner' } });
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }}
      testID="preview-topic"
    >
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        What should we help with?
      </Text>
      <Text className="text-body text-text-secondary mb-6 text-center">
        A topic, a question, anything you&apos;re working on.
      </Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        maxLength={MAX_TOPIC_LEN}
        placeholder="e.g. quadratic equations"
        placeholderTextColor={colors.muted}
        className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
        autoFocus
        testID="preview-topic-input"
        accessibilityLabel="Topic"
      />
      <Pressable
        onPress={() => void onContinue()}
        disabled={!canSubmit}
        className={`rounded-button py-3.5 items-center ${canSubmit ? 'bg-primary' : 'bg-primary/40'}`}
        testID="preview-topic-continue"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        accessibilityLabel="Continue"
      >
        <Text className="text-body font-semibold text-text-inverse">Continue</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 9: Value-Prop Screen (Learner + Parent Variants)

**Files:**
- Create: `apps/mobile/src/app/preview/value-prop.tsx`
- Create: `apps/mobile/src/app/preview/value-prop.test.tsx`

> Hard Rules 1, 2, 3, 6: no LLM call, no "I will remember this" / "Saving your progress" copy, no "profile" word, sample data marked as sample.

- [ ] **Step 1: Write failing tests.**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ValuePropScreen from './value-prop';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

describe('Preview ValuePropScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'algebra',
      createdAt: new Date().toISOString(),
    });
  });

  it('learner variant renders sample dialogue marked as sample', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    expect(screen.getByTestId('preview-value-prop-learner')).toBeTruthy();
    expect(screen.getByTestId('preview-sample-marker')).toBeTruthy();
  });

  it('parent variant renders sample weekly insight marked as sample', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'parent' });
    render(<ValuePropScreen />);
    expect(screen.getByTestId('preview-value-prop-parent')).toBeTruthy();
    expect(screen.getByTestId('preview-sample-marker')).toBeTruthy();
  });

  it('does not render a chat shell or any LLM-driven element', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    expect(screen.queryByTestId('chat-shell')).toBeNull();
    expect(screen.queryByTestId('message-input')).toBeNull();
  });

  it('CTA routes to sign-up', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    fireEvent.press(screen.getByTestId('preview-signup-cta'));
    expect(push).toHaveBeenCalledWith('/sign-up');
  });
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `value-prop.tsx`.**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';

type Variant = 'learner' | 'parent';

export default function ValuePropScreen() {
  const params = useLocalSearchParams<{ variant?: Variant }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // [LOW-2] Named `previewState` (not `state`) to avoid shadowing the
  // `import * as state from '../../lib/preview-onboarding-state'` pattern
  // used in tests, and to match save.tsx conventions.
  const [previewState, setPreviewStateLocal] = useState<PreviewOnboardingStateV0 | null>(null);

  useEffect(() => {
    void getPreviewState().then(setPreviewStateLocal);
  }, []);

  const variant: Variant = params.variant === 'parent' ? 'parent' : 'learner';
  const topic = previewState?.topicText ?? '';

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
      testID={variant === 'learner' ? 'preview-value-prop-learner' : 'preview-value-prop-parent'}
    >
      {variant === 'learner' ? (
        <LearnerVariant topic={topic} />
      ) : (
        <ParentVariant />
      )}
      <Pressable
        onPress={() => router.push('/sign-up')}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full mt-8"
        testID="preview-signup-cta"
        accessibilityRole="button"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {variant === 'learner'
            ? topic
              ? `Sign up to start your first lesson on ${topic}`
              : 'Sign up to start your first lesson'
            : 'Sign up to set up your child'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SampleMarker() {
  return (
    <View
      className="self-start bg-surface rounded-full px-3 py-1 mb-4"
      testID="preview-sample-marker"
    >
      <Text className="text-caption text-text-muted uppercase tracking-wider">
        Sample
      </Text>
    </View>
  );
}

function LearnerVariant({ topic }: { topic: string }) {
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        Here&apos;s how MentoMate teaches
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        A back-and-forth conversation that follows what you actually need —
        not a fixed lesson plan.
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-4 mb-3 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          {topic
            ? `Let's work on ${topic}. What part is tripping you up?`
            : "What are you working on today?"}
        </Text>
      </View>
      <View className="bg-primary/10 rounded-card p-4 mb-3 self-end max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          I get the formula but I don&apos;t know when to use it.
        </Text>
      </View>
      <View className="bg-surface rounded-card p-4 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          Good — that&apos;s the most useful question. Let me show you with a
          concrete example…
        </Text>
      </View>
    </View>
  );
}

function ParentVariant() {
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        Here&apos;s how MentoMate helps families
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        You set up your child, they learn, and you get a short weekly read on
        what they&apos;re working on. No surveillance, just signal.
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-5 mb-3">
        <Text className="text-body font-semibold text-text-primary mb-2">
          Weekly highlight
        </Text>
        <Text className="text-body-sm text-text-secondary mb-3">
          Practiced quadratic equations for 45 minutes across three sessions.
          Getting comfortable with factoring; working on completing the square.
        </Text>
        <Text className="text-caption text-text-muted">
          Sample data — your child&apos;s real insights appear after their first
          session.
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 10: ~~Sign-Up Integration — Remember Pending Redirect~~ — SKIPPED [HIGH-C2]

> [CRITICAL-A2 / HIGH-C2] **This task is no longer needed.** With the inline-wizard architecture (Task 11 / Task 12 below), the `(app)/_layout.tsx` gate detects preview state on mount and renders the wizard directly. There is no destination route to push to from sign-up.tsx, so no pending-auth-redirect plumbing is required.
>
> What this means concretely:
> - `apps/mobile/src/lib/sign-up-preview-redirect.ts` is NOT created.
> - `apps/mobile/src/app/(auth)/sign-up.tsx` is NOT modified.
> - No tests are added for "sign-up records preview-wizard redirect" — the integration is implicit (sign-up completes → setActive fires → root layout admits user into `(app)/` → AppLayout mounts → preview probe sees state → SaveWizardGate renders).
>
> Round-1 framed pending-auth-redirect as load-bearing on web; verify in dev that the web path also renders the wizard without flashing CreateProfileGate. If a web-only flash IS observed (a few hundred ms between `setActive` resolving and `getPreviewState()` resolving), the layout's `previewProbeState === 'loading'` branch (Task 11) already covers it by rendering a spinner instead of falling through to CreateProfileGate.

The remainder of this section is intentionally left as historical context; all checkboxes below should be considered no-ops.

### Historical (do not implement)

- [ ] **Step 1: Write failing test.**

```tsx
import { rememberPendingAuthRedirect, clearPendingAuthRedirect, peekPendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { setPreviewState, clearPreviewState } from '../../lib/preview-onboarding-state';

describe('sign-up preview redirect integration', () => {
  beforeEach(() => {
    clearPendingAuthRedirect();
    void clearPreviewState();
  });

  it('records save-wizard redirect when preview state is set', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    // Simulate the integration point: in sign-up, before calling setActive,
    // we check preview state and remember the redirect. Test that the
    // helper is wired by running the real branch.
    // (Component-level integration test: render SignUpScreen and drive
    //  through email verify. Pattern depends on existing sign-up test setup;
    //  if no existing test exists, this can be a lightweight unit test of
    //  the small helper function extracted in step 3.)

    // Recommended: extract the conditional into a small helper for testability.
    const { rememberPreviewRedirectIfNeeded } = await import('../../lib/sign-up-preview-redirect');
    await rememberPreviewRedirectIfNeeded();

    expect(peekPendingAuthRedirect()).toBe('/(app)/preview/save');
  });

  it('is a no-op when preview state is absent', async () => {
    const { rememberPreviewRedirectIfNeeded } = await import('../../lib/sign-up-preview-redirect');
    await rememberPreviewRedirectIfNeeded();
    expect(peekPendingAuthRedirect()).toBeNull();
  });
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Create helper in `lib/` (NOT under `app/(auth)/`).** [MEDIUM-2]

Create `apps/mobile/src/lib/sign-up-preview-redirect.ts`:

```ts
import { FEATURE_FLAGS } from './feature-flags';
import { rememberPendingAuthRedirect } from './pending-auth-redirect';
import { getPreviewState } from './preview-onboarding-state';

const SAVE_WIZARD_PATH = '/(app)/preview/save';

export async function rememberPreviewRedirectIfNeeded(): Promise<void> {
  if (!FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED) return;
  const state = await getPreviewState();
  if (!state) return;
  rememberPendingAuthRedirect(SAVE_WIZARD_PATH);
}
```

> Helper is in `lib/`, NOT under `app/(auth)/`. Expo Router treats unknown `.ts` files inside routed groups as routes (memory: `project_expo_router_pollution.md`).

- [ ] **Step 4: Wire the single chokepoint in `sign-up.tsx`.** [HIGH-2]

Add import:
```ts
import { rememberPreviewRedirectIfNeeded } from '../../lib/sign-up-preview-redirect';
```

Inside `activateCreatedSession`, immediately before `await setActive({ session: sessionId });`:

```ts
await rememberPreviewRedirectIfNeeded();
await setActive({ session: sessionId });
```

That is the ONLY edit to `sign-up.tsx`. Do not add a call after `prepareEmailAddressVerification`. Both the email-code verification and OAuth paths flow through `activateCreatedSession`.

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 11: AppLayout — Probe + Inline SaveWizardGate Branch [CRITICAL-A2 / CRITICAL-B2]

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx`

> Critical: async resolution. The gate must hold a loading state until preview-state resolution settles. Without this, `CreateProfileGate` mount effects could fire a transient POST and cause a visible flash. Spec §Implementation step 5.

> [CRITICAL-A2] **Architecture:** the wizard is rendered INLINE as a gate component (mirrors `CreateProfileGate` at `_layout.tsx:640`). The gate ordering is:
>
> 1. `previewProbeState === 'loading'` → spinner
> 2. `previewProbeState === 'present' && !wizardDone` → `<SaveWizardGate onComplete={() => setWizardDone(true)} />` (defined in Task 12)
> 3. `!activeProfile` → `<CreateProfileGate />` (existing)
> 4. consent gates / Tabs (existing)
>
> The wizard branch sits ABOVE `!activeProfile` so the wizard stays mounted across the profile-creation transition (ProfileProvider auto-activates the first profile via `profile.ts:154-174` — without the ordering above, the wizard would unmount mid-flow before Step 3).
>
> [CRITICAL-B2] **The auto-cleanup effect (`activeProfile && profiles.length > 0 → clearPreviewState()`) is NOT added.** It would race the wizard's owner POST → child POST sequence and wipe `createdOwnerProfileId` from SecureStore between the two calls, breaking the [HIGH-4] resume guard. Cleanup is owned by (a) TTL inside `getPreviewState`, (b) sign-out-cleanup (Task 4), (c) the wizard's explicit `clearPreviewState()` call on Step-3 success (Task 14).

- [ ] **Step 1: Write failing tests.**

Find the existing `_layout.test.tsx` (or create alongside `_layout.tsx`). Add:

```tsx
import { setPreviewState, clearPreviewState } from '../../lib/preview-onboarding-state';
import { FEATURE_FLAGS } from '../../lib/feature-flags';

describe('AppLayout no-profile gate — preview branch', () => {
  beforeEach(async () => {
    await clearPreviewState();
  });

  it('renders the SaveWizardGate when preview state exists and flag is on', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    // Render AppLayout under mocked auth (isSignedIn=true) and ProfileProvider
    // with profiles=[], activeProfile=null. Pattern: copy the harness used by
    // the existing _layout test for CreateProfileGate flashes.
    const { findByTestId, queryByTestId } = renderAppLayoutWithNoProfile();

    // The async probe should resolve before either gate or wizard renders.
    // [CRITICAL-A2] The wizard is INLINE — no route navigation; assert the
    // SaveWizardGate testID is present in the same render tree.
    expect(await findByTestId('save-wizard-gate')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
  });

  // [MEDIUM-D2] Use jest.doMock + jest.isolateModules, NOT
  // `(FEATURE_FLAGS as any).X = false` (which leaks across parallel workers).
  // Mirrors the canonical pattern picked up by Task 5's spike step.
  it('falls through to CreateProfileGate when flag is off, even with stale preview state', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../lib/feature-flags', () => ({
        FEATURE_FLAGS: {
          COACH_BAND_ENABLED: true,
          MIC_IN_PILL_ENABLED: true,
          I18N_ENABLED: true,
          PREVIEW_ONBOARDING_ENABLED: false,
        },
      }));
      const { renderAppLayoutWithNoProfile } = await import('./__test-harness');
      const { findByTestId, queryByTestId } = renderAppLayoutWithNoProfile();
      expect(await findByTestId('create-profile-gate')).toBeTruthy();
      expect(queryByTestId('save-wizard-gate')).toBeNull();
    });
  });

  it('renders loading state during preview-state async probe', () => {
    // Spy getPreviewState to return a pending promise. Assert loading testID
    // is rendered; assert neither gate nor wizard is in the tree.
    let resolve!: (v: null) => void;
    jest.spyOn(require('../../lib/preview-onboarding-state'), 'getPreviewState').mockReturnValue(
      new Promise<null>((r) => { resolve = r; }),
    );

    const { getByTestId, queryByTestId } = renderAppLayoutWithNoProfile();
    expect(getByTestId('preview-state-loading')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
    expect(queryByTestId('save-wizard-gate')).toBeNull();

    resolve(null);
  });

  // [CRITICAL-A2 / HIGH-A2] Wizard outlives the auto-activation transition.
  // First-profile POST flips profiles to non-empty; ProfileProvider auto-sets
  // activeProfile (profile.ts:154-174). The wizard branch must remain above
  // !activeProfile in the gate ordering so the wizard stays mounted.
  it('keeps SaveWizardGate mounted after ProfileProvider auto-activates the first profile', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    const { findByTestId, simulateProfileCreated } = renderAppLayoutWithNoProfile();
    await findByTestId('save-wizard-gate');
    // Drive the harness to inject a created profile and let the provider
    // auto-activate it (mirrors what happens at runtime after the owner POST
    // resolves and the cache is updated).
    simulateProfileCreated({ id: 'p1', isOwner: true });
    // Wizard MUST still be mounted; we have NOT signalled wizardDone yet.
    expect(await findByTestId('save-wizard-gate')).toBeTruthy();
  });

  // [CRITICAL-B2] Verify the layout does NOT install the auto-cleanup effect.
  it('does NOT clear preview state automatically when activeProfile becomes truthy', async () => {
    await setPreviewState({
      intent: 'self', path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    renderAppLayoutWithActiveProfile();
    await Promise.resolve();
    const { getPreviewState } = await import('../../lib/preview-onboarding-state');
    // Round-1 plan would have expected null here. Round-2: the layout must
    // leave the key intact; cleanup is the wizard's job (or TTL/sign-out).
    expect(await getPreviewState()).not.toBeNull();
  });
});
```

> `renderAppLayoutWithNoProfile` / `renderAppLayoutWithActiveProfile` — adapt from existing test harnesses in the file. If none exist, this is the right time to extract a small helper since multiple tests need it.

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Edit `(app)/_layout.tsx`.**

Add imports:

```ts
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { getPreviewState } from '../../lib/preview-onboarding-state';
// Note: clearPreviewState is NOT imported here. [CRITICAL-B2] cleanup is
// owned by the wizard's Step-3 success path (Task 14) and by sign-out.
```

Inside the default `AppLayout` component, after the existing profile-loading state and immediately BEFORE the `if (!activeProfile)` branch (landmark — search for that exact conditional; line numbers drift) [MEDIUM-3], introduce the preview-state probe AND a wizard-done sentinel:

```tsx
const [previewProbeState, setPreviewProbeState] = React.useState<
  'loading' | 'present' | 'absent'
>('loading');
// [HIGH-A2] Wizard signals completion via onComplete → setWizardDone(true).
// Required because previewProbeState alone never flips back to 'absent'
// (we don't re-probe after mount, and clearPreviewState() inside the wizard
// only affects future mounts).
const [wizardDone, setWizardDone] = React.useState(false);

React.useEffect(() => {
  if (!FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED) {
    setPreviewProbeState('absent');
    return;
  }
  let cancelled = false;
  void getPreviewState().then((s) => {
    if (cancelled) return;
    setPreviewProbeState(s ? 'present' : 'absent');
  });
  return () => {
    cancelled = true;
  };
}, []);

// [CRITICAL-B2] DELIBERATELY no auto-cleanup effect here. Round-1 had
//   useEffect(() => { if (activeProfile && profiles.length > 0) clearPreviewState() })
// — that would race the wizard's owner-POST → child-POST sequence and wipe
// `createdOwnerProfileId` between the calls, destroying the [HIGH-4] resume
// guard. Cleanup is owned by:
//   (a) TTL inside getPreviewState (1h)
//   (b) sign-out-cleanup (Task 4)
//   (c) wizard's explicit clearPreviewState() on Step-3 success (Task 14)
```

Then INSERT the wizard branch ABOVE the `!activeProfile` branch (NOT inside it):

```tsx
// [CRITICAL-A2] Wizard gate sits ABOVE !activeProfile so it stays mounted
// when ProfileProvider auto-activates the first profile mid-wizard
// (profile.ts:154-174). Without this ordering, the wizard would unmount
// after Step 2's POST succeeds.
if (
  FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
  previewProbeState === 'loading'
) {
  return (
    <View
      className="flex-1 bg-background items-center justify-center"
      testID="preview-state-loading"
    >
      <ActivityIndicator size="large" />
    </View>
  );
}

if (
  FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
  previewProbeState === 'present' &&
  !wizardDone
) {
  return (
    <FeedbackProvider>
      <SaveWizardGate onComplete={() => setWizardDone(true)} />
    </FeedbackProvider>
  );
}

// Existing branch — unchanged shape.
if (!activeProfile) {
  return (
    <FeedbackProvider>
      <CreateProfileGate />
    </FeedbackProvider>
  );
}
```

`SaveWizardGate` is defined in this same file (see Task 12), alongside `CreateProfileGate` at line 640.

- [ ] **Tab-bar handling.** [CRITICAL-A2]

NO addition to `FULL_SCREEN_ROUTES`. The Round-1 plan added `'preview'` because the wizard was a nested route; the inline-gate architecture replaces the entire layout body during the wizard's life (the gate `return`s before the `<Tabs>` JSX is reached), so there's no tab bar to hide. Leave `FULL_SCREEN_ROUTES` untouched.

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 12: SaveWizardGate Component — Skeleton + Step 1 (Where to Save) [CRITICAL-A2]

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` — add inline `SaveWizardGate` component (NOT a route file).
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx` — co-located wizard tests.

> [CRITICAL-A2] **No `(app)/preview/save.tsx`, no `(app)/preview/_layout.tsx`, no `(app)/preview/save.test.tsx`.** The Round-1 route-based plan does not work — see the architecture section at the top. `SaveWizardGate` is defined in the same file as `CreateProfileGate` (line 640), takes an `onComplete` callback, and is rendered by the gate-ordering block introduced in Task 11.

- [ ] **Step 1: ~~`_layout.tsx` for `(app)/preview/`~~ — SKIPPED.** No route file is created.

- [ ] **Step 2: Write failing test for Step 1 (where-to-save selection).**

> Use the `(app)/_layout.test.tsx` harness from Task 11. The wizard is mounted by the layout's gate ordering (preview state present + wizardDone false), so tests render the layout, not a standalone `<SaveWizard />`. Imports adjust accordingly: `import { setPreviewState, clearPreviewState } from '../../lib/preview-onboarding-state';` (NOT `'../../../lib/...'`).

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { setPreviewState, clearPreviewState } from '../../../lib/preview-onboarding-state';
import SaveWizard from './save';

describe('SaveWizard — Step 1', () => {
  beforeEach(async () => {
    await clearPreviewState();
  });

  // [CRITICAL-3] No dead-end on empty state.
  it('redirects to /(app)/home when no preview state exists', async () => {
    const replace = jest.fn();
    (require('expo-router').useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
    render(<SaveWizard />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/(app)/home');
    });
    expect(screen.queryByTestId('save-wizard-step-1')).toBeNull();
  });

  it('preselects "My learning" when intent was self', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 't',
      createdAt: new Date().toISOString(),
    });
    render(<SaveWizard />);
    await screen.findByTestId('save-wizard-step-1');
    expect(screen.getByTestId('save-target-self').props.accessibilityState?.selected).toBe(true);
  });

  it('preselects "My child" when intent was child', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    render(<SaveWizard />);
    await screen.findByTestId('save-wizard-step-1');
    expect(screen.getByTestId('save-target-child').props.accessibilityState?.selected).toBe(true);
  });

  it('overrides intent when user picks a different target', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    render(<SaveWizard />);
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-target-self'));
    expect(screen.getByTestId('save-target-self').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('save-target-child').props.accessibilityState?.selected).toBe(false);
  });
});
```

- [ ] **Step 3: Run; confirm fail.**

- [ ] **Step 4: Implement Step 1 inside `(app)/_layout.tsx`.** [CRITICAL-A2]

> Co-locate next to `CreateProfileGate` (line 640). The component is named `SaveWizardGate` to mirror that convention. Imports use the same `../../lib/...` depth as the surrounding layout file, NOT `../../../lib/...`.

```tsx
// At the top of (app)/_layout.tsx — only the new imports.
import {
  getPreviewState,
  clearPreviewState,
  type PreviewOnboardingStateV0,
  type SaveTarget,
} from '../../lib/preview-onboarding-state';

type Step = 1 | 2 | 3;

interface TargetOption {
  target: SaveTarget;
  label: string;
  testID: string;
}

const TARGETS: ReadonlyArray<TargetOption> = [
  { target: 'self', label: 'My learning', testID: 'save-target-self' },
  { target: 'child', label: "My child's learning", testID: 'save-target-child' },
  { target: 'both', label: 'Both', testID: 'save-target-both' },
];

function defaultTargetFor(state: PreviewOnboardingStateV0 | null): SaveTarget | null {
  if (!state) return null;
  switch (state.intent) {
    case 'self':
      return 'self';
    case 'child':
      return 'child';
    case 'both':
      return 'both';
    case 'not_sure':
      return null; // ask explicitly per spec Routing And Landing Rules
  }
}

// [CRITICAL-A2] Co-located component, NOT a default export, NOT a route.
// Imported by AppLayout's gate ordering (Task 11).
function SaveWizardGate({ onComplete }: { onComplete: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [previewState, setPreviewStateLocal] = useState<PreviewOnboardingStateV0 | null>(null);
  const [probeDone, setProbeDone] = useState(false);
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const [step, setStep] = useState<Step>(1);

  useEffect(() => {
    void getPreviewState().then((s) => {
      setPreviewStateLocal(s);
      setTarget(defaultTargetFor(s));
      setProbeDone(true);
    });
  }, []);

  // [CRITICAL-3] Recovery path for "wizard mounted with no state" — happens
  // when the 1h TTL expires between the layout's initial probe and the
  // wizard's second probe inside this component, or when SecureStore is
  // wiped externally (sign-out raced with mount). Without this, the wizard
  // would render `null` and trap the user.
  // [HIGH-A2] Signal completion to the layout BEFORE navigating, so the
  // wizard branch in AppLayout exits cleanly and the next render falls
  // through to CreateProfileGate / Tabs / consent gates as appropriate.
  useEffect(() => {
    if (probeDone && !previewState) {
      onComplete();
      router.replace('/(app)/home');
    }
  }, [probeDone, previewState, router, onComplete]);

  if (!previewState) {
    return (
      <View testID="save-wizard-gate" className="flex-1 bg-background" />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
      testID="save-wizard-gate"  /* [CRITICAL-A2] outer gate identity */
    >
      <View testID={`save-wizard-step-${step}`} />
      <Text className="text-h1 font-bold text-text-primary mb-2">
        Great, let&apos;s save this and get you started.
      </Text>

      {step === 1 && (
        <View>
          <Text className="text-body text-text-secondary mb-6">
            Where should we save this?
          </Text>
          {TARGETS.map((opt) => {
            const selected = target === opt.target;
            return (
              <Pressable
                key={opt.target}
                onPress={() => setTarget(opt.target)}
                className={`rounded-card px-4 py-4 mb-3 ${selected ? 'bg-primary/10 border border-primary' : 'bg-surface'}`}
                testID={opt.testID}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => target && setStep(2)}
            disabled={!target}
            className={`rounded-button py-3.5 items-center mt-4 ${target ? 'bg-primary' : 'bg-primary/40'}`}
            testID="save-wizard-step-1-continue"
            accessibilityRole="button"
            accessibilityState={{ disabled: !target }}
          >
            <Text className="text-body font-semibold text-text-inverse">
              Continue
            </Text>
          </Pressable>
        </View>
      )}

      {step === 2 && (
        <ProfileBasicsStep
          target={target!}
          previewState={previewState}
          onComplete={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ConfirmStep
          target={target!}
          previewState={previewState}
          router={router}
          onComplete={onComplete}  /* [HIGH-A2] forwarded from layout */
        />
      )}
    </ScrollView>
  );
}

function ProfileBasicsStep(_props: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  onComplete: (created: { parent: Profile; child?: Profile }) => void;
}) {
  // Implemented in Task 13.
  return <Text>TODO step 2</Text>;
}

function ConfirmStep(_props: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  router: ReturnType<typeof useRouter>;
  onComplete: () => void;  /* [HIGH-A2] layout-level wizard-done signal */
}) {
  // Implemented in Task 14.
  return <Text>TODO step 3</Text>;
}
```

- [ ] **Step 5: Run tests; confirm pass.**

- [ ] **Step 6: Commit via `/commit`.**

---

## Task 13: Save Wizard — Step 2 (Profile Basics)

**Files:**
- Modify: `apps/mobile/src/app/(app)/preview/save.tsx`
- Modify: `apps/mobile/src/app/(app)/preview/save.test.tsx`

> Step 2 collects owner basics, then conditional child basics. v0 inlines a minimal form rather than importing `create-profile.tsx` (a default-export route). If the form duplicates more than ~30 LOC of create-profile field components, extract to a shared component then; not now.

> [CRITICAL-1] **Request body is `{ displayName, birthYear }` only.** `profileCreateSchema` (`packages/schemas/src/profiles.ts:44`) does NOT accept `forChild` and Hono's typed RPC body will reject any extra fields at the TypeScript layer. The server determines owner-vs-child purely from "is this the first profile on the account?" — `createProfileWithLimitCheck` in `apps/api/src/services/profile.ts:253-317`. So for a `target='child'` or `target='both'` flow we POST `/profiles` TWICE in sequence: first call creates the owner, second call (with the child's name + birthYear) is auto-classified as a child because the owner now exists.

> [HIGH-4] **Persist `createdOwnerProfileId` to the preview-state record before issuing the second POST.** Without this, a wizard remount mid-flight (app backgrounded, refresh, OOM-kill) re-runs the form and double-creates: the second mount's "owner" POST becomes a child, the "child" POST becomes a second child — net result, 1 owner + 2 children for one expected flow. Resume logic: if the persisted id is non-null AND maps to an already-fetched profile, skip the owner POST.

- [ ] **Step 1: Write failing tests.**

```tsx
it('self target: collects display name + birth year and creates owner profile', async () => {
  await setPreviewState({
    intent: 'self', path: 'learner_value_prop',
    topicText: 'algebra', createdAt: new Date().toISOString(),
  });
  // Mock API client profiles.$post to resolve with a fake owner profile.
  const apiSpy = mockProfilesPost({ profile: makeOwnerProfile() });

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  fireEvent.changeText(screen.getByTestId('save-basics-display-name'), 'Alex');
  fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '1990');
  fireEvent.press(screen.getByTestId('save-basics-continue'));

  await waitFor(() => {
    expect(apiSpy).toHaveBeenCalledWith({
      json: { displayName: 'Alex', birthYear: 1990 },
    });
  });
});

it('child target: creates parent first, then child (sequence assertion)', async () => {
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  const apiSpy = mockProfilesPostSequence([
    { profile: makeOwnerProfile({ id: 'parent-1' }) },
    { profile: makeChildProfile({ id: 'child-1' }) },
  ]);

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  // Parent basics
  fireEvent.changeText(screen.getByTestId('save-basics-parent-name'), 'Pat');
  fireEvent.changeText(screen.getByTestId('save-basics-parent-birth-year'), '1985');
  // Child basics on same step (per spec)
  fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
  fireEvent.changeText(screen.getByTestId('save-basics-child-birth-year'), '2014');
  fireEvent.press(screen.getByTestId('save-basics-continue'));

  // [CRITICAL-1] Assert call ORDER and bodies. Server derives owner-vs-child
  // from call position; the body must NOT include forChild (schema rejects it).
  await waitFor(() => {
    expect(apiSpy.mock.calls[0]?.[0].json).toEqual({ displayName: 'Pat', birthYear: 1985 });
    expect(apiSpy.mock.calls[1]?.[0].json).toEqual({ displayName: 'Sam', birthYear: 2014 });
    expect(apiSpy.mock.calls.length).toBe(2);
  });
});

it('child failure after parent success keeps parent and shows retry', async () => {
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  mockProfilesPostSequence([
    { profile: makeOwnerProfile({ id: 'parent-1' }) },
    new Error('NetworkError'),
  ]);
  render(<SaveWizard />);
  // Drive through step 1 + step 2; assert:
  // - error toast / inline error visible (testID="save-basics-child-error")
  // - retry button visible (testID="save-basics-retry-child")
  // - parent profile creation NOT rolled back (no DELETE call).
  // ...
});
```

> Adapt the `mockProfilesPost` / sequence helpers to whatever pattern the codebase already uses for `client.profiles.$post`. Check existing tests for `apps/mobile/src/app/create-profile.test.tsx` if present, or `apps/mobile/src/lib/api-client.test.ts` for the canonical mock pattern.

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Replace `ProfileBasicsStep` in `save.tsx`.**

```tsx
import { useState, useCallback } from 'react';
import { TextInput, ActivityIndicator } from 'react-native';
import { useApiClient } from '../../../lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { assertOk } from '../../../lib/assert-ok';
import { formatApiError } from '../../../lib/format-api-error';
import { setPreviewState } from '../../../lib/preview-onboarding-state';
import type { Profile } from '@eduagent/schemas';

function ProfileBasicsStep({
  target,
  previewState,
  onComplete,
}: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  onComplete: (created: { parent: Profile; child?: Profile }) => void;
}) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const [parentName, setParentName] = useState('');
  const [parentBirthYear, setParentBirthYear] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthYear, setChildBirthYear] = useState('');

  const [createdParent, setCreatedParent] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [childError, setChildError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsChild = target === 'child' || target === 'both';
  const needsOwner = target === 'self' || target === 'child' || target === 'both';

  const ownerName = target === 'self' ? parentName : parentName; // both branches share the owner-basics
  const ownerYear = target === 'self' ? parentBirthYear : parentBirthYear;

  const isValidYear = (s: string) => /^\d{4}$/.test(s) && Number(s) > 1900 && Number(s) <= new Date().getFullYear();

  const canSubmit =
    !loading &&
    (needsOwner ? ownerName.trim().length > 0 && isValidYear(ownerYear) : true) &&
    (needsChild ? childName.trim().length > 0 && isValidYear(childBirthYear) : true);

  const submit = useCallback(async () => {
    setError(null);
    setChildError(null);
    setLoading(true);
    try {
      let parent = createdParent;

      // [HIGH-4] Resume guard: if the preview state already records a created
      // owner profile id (set on a prior submit that crashed mid-flight), and
      // that profile exists in the current cache, skip the owner POST and
      // continue with that profile as the parent. Prevents duplicate creation.
      if (!parent && needsOwner && previewState.createdOwnerProfileId) {
        const cached = queryClient.getQueriesData<Profile[]>({
          predicate: (q) => String(q.queryKey[0]) === 'profiles',
        });
        for (const [, list] of cached) {
          const match = list?.find((p) => p.id === previewState.createdOwnerProfileId);
          if (match) {
            parent = match;
            setCreatedParent(match);
            break;
          }
        }
      }

      if (!parent && needsOwner) {
        const res = await client.profiles.$post({
          json: { displayName: ownerName.trim(), birthYear: Number(ownerYear) },
        });
        await assertOk(res);
        const data = (await res.json()) as { profile: Profile };
        parent = data.profile;
        setCreatedParent(parent);

        // [HIGH-4] Persist the new owner id BEFORE issuing the second POST.
        // If we crash between this line and the child POST succeeding, the
        // resume guard above will pick up the parent and not double-create.
        await setPreviewState({ ...previewState, createdOwnerProfileId: parent.id });

        queryClient.setQueriesData<Profile[]>(
          { predicate: (q) => String(q.queryKey[0]) === 'profiles' },
          (old) => (old ? [...old, parent!] : [parent!]),
        );
      }

      let child: Profile | undefined;
      if (needsChild) {
        try {
          // [CRITICAL-1] No `forChild` field. profileCreateSchema rejects it;
          // server auto-classifies non-first POST as child via
          // createProfileWithLimitCheck (apps/api/src/services/profile.ts:253).
          const res = await client.profiles.$post({
            json: {
              displayName: childName.trim(),
              birthYear: Number(childBirthYear),
            },
          });
          await assertOk(res);
          const data = (await res.json()) as { profile: Profile };
          child = data.profile;

          queryClient.setQueriesData<Profile[]>(
            { predicate: (q) => String(q.queryKey[0]) === 'profiles' },
            (old) => (old ? [...old, child!] : [child!]),
          );
        } catch (childErr) {
          // [AC 9] Keep parent. Surface retryable child error inline.
          setChildError(formatApiError(childErr));
          setLoading(false);
          return;
        }
      }

      // Predicate-invalidate (spec: ['profiles'] is userId-scoped).
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]) === 'profiles',
      });

      if (parent) {
        onComplete({ parent, child });
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [
    client, queryClient, createdParent, needsOwner, needsChild,
    ownerName, ownerYear, childName, childBirthYear, onComplete,
  ]);

  return (
    <View>
      {needsOwner && (
        <View className="mb-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            {target === 'self' ? 'Tell us about you' : 'About you (the parent)'}
          </Text>
          <TextInput
            placeholder="Your name"
            value={parentName}
            onChangeText={setParentName}
            className="bg-surface text-text-primary rounded-input px-4 py-3 mb-3"
            testID={target === 'self' ? 'save-basics-display-name' : 'save-basics-parent-name'}
          />
          <TextInput
            placeholder="Birth year (e.g. 1985)"
            value={parentBirthYear}
            onChangeText={setParentBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            className="bg-surface text-text-primary rounded-input px-4 py-3"
            testID={target === 'self' ? 'save-basics-birth-year' : 'save-basics-parent-birth-year'}
          />
        </View>
      )}

      {needsChild && (
        <View className="mb-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            About your child
          </Text>
          <TextInput
            placeholder="Their name or nickname"
            value={childName}
            onChangeText={setChildName}
            className="bg-surface text-text-primary rounded-input px-4 py-3 mb-3"
            testID="save-basics-child-name"
          />
          <TextInput
            placeholder="Birth year"
            value={childBirthYear}
            onChangeText={setChildBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            className="bg-surface text-text-primary rounded-input px-4 py-3"
            testID="save-basics-child-birth-year"
          />
        </View>
      )}

      {error && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3" testID="save-basics-error">
          <Text className="text-danger text-body-sm">{error}</Text>
        </View>
      )}
      {childError && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3" testID="save-basics-child-error">
          <Text className="text-danger text-body-sm mb-2">
            We saved your account, but couldn&apos;t add your child yet: {childError}
          </Text>
          <Pressable
            onPress={() => void submit()}
            testID="save-basics-retry-child"
            accessibilityRole="button"
          >
            <Text className="text-primary font-semibold">Retry</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => void submit()}
        disabled={!canSubmit}
        className={`rounded-button py-3.5 items-center ${canSubmit ? 'bg-primary' : 'bg-primary/40'}`}
        testID="save-basics-continue"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
      >
        {loading ? <ActivityIndicator color="white" /> : (
          <Text className="text-body font-semibold text-text-inverse">Continue</Text>
        )}
      </Pressable>
    </View>
  );
}
```

> [CRITICAL-1] Schema is verified: `POST /profiles` accepts `{ displayName, birthYear, avatarUrl?, location?, conversationLanguage?, pronouns? }` only (`packages/schemas/src/profiles.ts:44`). Server determines owner-vs-child via `createProfileWithLimitCheck`'s `isFirstProfile` check (`apps/api/src/services/profile.ts:253-317`). Do NOT add a `forChild`/`addingChild` field; do NOT invent route params.

- [ ] **Step 4: Update `SaveWizardScreen` to pass `onComplete` typed correctly + advance to Step 3.**

```tsx
{step === 2 && target && (
  <ProfileBasicsStep
    target={target}
    previewState={previewState}
    onComplete={(created) => {
      setCreated(created);
      setStep(3);
    }}
  />
)}
```

Add `const [created, setCreated] = useState<{ parent: Profile; child?: Profile } | null>(null);` to parent state.

- [ ] **Step 5: Run tests; confirm pass.**

- [ ] **Step 6: Commit via `/commit`.**

---

## Failure Modes Addendum (referenced from spec)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Wizard mounted with empty preview state | TTL expired between auth and gate render; cleanup race; manual deep-link | Brief blank frame (~1 RAF) | `useEffect` redirects `router.replace('/(app)/home')`. [CRITICAL-3] |
| Wizard remount after owner POST succeeded, child POST never fired | App OOM-killed, force-close, or refresh after parent created | Form re-prefills with cached entries | Resume guard reads `previewState.createdOwnerProfileId`, finds match in `['profiles']` cache, skips owner POST and proceeds to child POST. [HIGH-4] |
| Child POST fails after owner POST succeeded | Network error mid-flight | Inline error banner + Retry button | Retry hits the same `submit()` — resume guard skips re-creating the owner; child POST retried. [HIGH-4] |
| `setActive` succeeds but gate has stale preview state, user already has a profile | Sign-out → sign-in cycle with the same browser/session | Tabs render normally | `(app)/_layout.tsx` cleanup effect clears the SecureStore key when `activeProfile && profiles.length > 0`. Wizard is not reached. |
| `pending-auth-redirect` lost on native cold-start | Process killed during OAuth round-trip | CreateProfileGate flash possible | Gate's async preview-state probe resolves `present` → `<Redirect>` to wizard. The pending-auth-redirect is a web-only optimization; native does not depend on it. [HIGH-1] |

---

## Task 14: Save Wizard — Step 3 (Confirm + Landing + First Session Handoff)

**Files:**
- Modify: `apps/mobile/src/app/(app)/preview/save.tsx`
- Modify: `apps/mobile/src/app/(app)/preview/save.test.tsx`

> **Spike outcome (fill in before starting Task 14):** [option (a) — helper at `<path>` / option (b) — defer topic prefill, CTA reads "Go to my learning"]

> Hard Rule: use `router.replace` on landing so the preview stack is cleared (AC 13). Intra-wizard hops earlier are `setStep(...)` state changes, not router pushes.

- [ ] **Step 1: Write failing tests.**

```tsx
it('self target: replaces history with first session route on success', async () => {
  // After step 2 completes for self target, step 3 fires:
  //   - switchProfile(parent.id)
  //   - clearPreviewState
  //   - start session with topicText (per spike outcome)
  //   - router.replace(sessionRoute)
  // OR (option b): router.replace('/(app)/own-learning' or wherever) + topic dropped.

  const replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
  await setPreviewState({
    intent: 'self', path: 'learner_value_prop',
    topicText: 'algebra', createdAt: new Date().toISOString(),
  });
  mockProfilesPost({ profile: makeOwnerProfile({ id: 'p1' }) });
  // ...drive through steps 1 + 2...

  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/\(app\)\//));
  });
});

it('parent target: replaces history with parent home', async () => {
  const replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  // ...drive to step 3...
  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith('/(app)/home');
  });
});

it('clears preview state on save completion', async () => {
  await setPreviewState({ intent: 'self', path: 'learner_value_prop', createdAt: new Date().toISOString() });
  // ...drive to landing...
  await waitFor(async () => {
    const { getPreviewState } = await import('../../../lib/preview-onboarding-state');
    expect(await getPreviewState()).toBeNull();
  });
});

it('session-start failure falls through to home with error surfaced', async () => {
  // Only meaningful in option (a). Skip if option (b) was chosen.
  // ...
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `ConfirmStep`.**

Pseudocode for option (a) — adjust to actual helper:

```tsx
function ConfirmStep({
  target,
  previewState,
  created,
  router,
}: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  created: { parent: Profile; child?: Profile };
  router: ReturnType<typeof useRouter>;
}) {
  const { switchProfile } = useProfile();
  const [landing, setLanding] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);

  const cta = target === 'self' || (target === 'both' && previewState.bothPriority === 'self_first')
    ? 'Start lesson'
    : 'Open parent home';

  const onLand = useCallback(async () => {
    if (landing) return;
    setLanding(true);
    try {
      const sw = await switchProfile(created.parent.id);
      if (!sw.success) {
        setLandingError(sw.error ?? 'Could not switch profile.');
        return;
      }

      await clearPreviewState();

      if (target === 'self' || (target === 'both' && previewState.bothPriority === 'self_first')) {
        // OPTION (A): call shared session-start helper with previewState.topicText.
        // OPTION (B): router.replace('/(app)/home') and let the user start a session manually.
        // FILL IN BASED ON TASK 0 SPIKE OUTCOME.
      } else {
        router.replace('/(app)/home');
      }
    } catch (err) {
      setLandingError(formatApiError(err));
    } finally {
      setLanding(false);
    }
  }, [landing, switchProfile, created.parent.id, target, previewState, router]);

  return (
    <View>
      <Text className="text-h3 font-semibold text-text-primary mb-2">
        {target === 'self' || target === 'both'
          ? `Your first lesson is ready${previewState.topicText ? `: ${previewState.topicText}` : ''}.`
          : "Your child's profile is set up. Let's open parent home."}
      </Text>
      {landingError && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3">
          <Text className="text-danger text-body-sm">{landingError}</Text>
        </View>
      )}
      <Pressable
        onPress={() => void onLand()}
        disabled={landing}
        className={`rounded-button py-3.5 items-center ${landing ? 'bg-primary/40' : 'bg-primary'}`}
        testID="save-confirm-land"
        accessibilityRole="button"
      >
        {landing ? <ActivityIndicator color="white" /> : (
          <Text className="text-body font-semibold text-text-inverse">{cta}</Text>
        )}
      </Pressable>
    </View>
  );
}
```

Add imports: `clearPreviewState` from `preview-onboarding-state`, `useProfile` from `../../../lib/profile`, `formatApiError` (already imported).

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Manual smoke (one of the two paths in the Expo web preview).**

```bash
cd apps/mobile && pnpm run dev:web   # or whatever the project's dev command is
```

Walk: sign-in → Try MentoMate → Me → topic "algebra" → learner value-prop → Sign up → verify → save wizard → name + year → Continue → confirm → Start lesson. Assert lands on session/home appropriately.

- [ ] **Step 6: Commit via `/commit`.**

---

## Task 15: Wire All Acceptance Criteria With a Coverage Sweep

**Files:**
- Re-read: `docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md` §Acceptance Criteria
- All tests added in Tasks 1-14.

- [ ] **Step 1: Map every AC to a test (or note "covered by E2E in Task 16").**

Open the spec. For each numbered AC, list the test name covering it. AC list:

1. Intent screen renders 4 options + no chat shell → `preview/intent.test.tsx`
2. Self → learner value-prop with sample marker, no LLM → `value-prop.test.tsx`
3. Child → parent value-prop, CTA copy → `value-prop.test.tsx`
4. Auth returns to save wizard → `(app)/_layout.test.tsx` preview branch
5. Wizard child→self override → `save.test.tsx`
6. Wizard self→child override → `save.test.tsx`
7. Parent lands on parent home + `isFamilyCapableProfile` true → `save.test.tsx` (parent target landing)
8. Solo owner lands on learner home → `_layout.test.tsx` (resolveTabShape) + `save.test.tsx` (self target landing)
9. Parent ok, child fails, no rollback → `save.test.tsx` (child failure case)
10. 1-hour expiry → `preview-onboarding-state.test.tsx`
11. Sign-out clears key → `sign-out-cleanup.test.ts`
12. No preview state → CreateProfileGate unchanged → `_layout.test.tsx`
13. `router.replace` on landing → `save.test.tsx`
14. Back returns to topic/intent + topic preserved → manual + E2E (Task 16)
15. Flag off: no CTA, no route, gate falls through → `sign-in.test.tsx` + `_layout.test.tsx`
16. Navigation discipline: push for hops, replace for landing → grep assertion test (see step 2)

- [ ] **Step 2: Cover AC 16 behaviorally inside existing route tests.** [MEDIUM-1]

NO grep-over-source test. Source-scanning tests are fragile under different Jest CWDs, over-enforce (block any future legitimate `router.replace` in retry/recovery branches), and add no behavioral signal beyond what the existing render tests already cover.

Instead, the existing route tests already assert the correct method:
- `preview/intent.test.tsx`, `preview/topic.test.tsx`, `preview/value-prop.test.tsx` — all assert `push` was called with the expected target (added in Tasks 7, 8, 9).
- `(app)/preview/save.test.tsx` — Task 14 already asserts `replace` was called with the landing route.

Sweep those tests once: confirm every navigation assertion uses the matching method (`push` for hops, `replace` for landing). If any test was written with the wrong assertion, fix it now — that is the AC-16 verification step.

- [ ] **Step 3: Run full mobile test sweep for changed files.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/lib/feature-flags.ts \
  src/lib/profile.ts \
  src/lib/preview-onboarding-state.ts \
  src/lib/sign-out-cleanup.ts \
  src/app/preview/index.tsx \
  src/app/preview/intent.tsx \
  src/app/preview/topic.tsx \
  src/app/preview/value-prop.tsx \
  'src/app/(auth)/sign-up.tsx' \
  'src/app/(auth)/sign-in.tsx' \
  'src/app/(app)/_layout.tsx' \
  'src/app/(app)/preview/save.tsx' \
  --no-coverage
```
Expected: all pass.

- [ ] **Step 4: Typecheck + lint.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 16: E2E Smoke Flows (Maestro)

**Files:**
- Create: `apps/mobile/e2e/preview-self.yaml`
- Create: `apps/mobile/e2e/preview-parent.yaml`
- Create: `apps/mobile/e2e/preview-both-child-first.yaml`
- Create: `apps/mobile/e2e/preview-override-target.yaml`
- Create: `apps/mobile/e2e/preview-expired-state.yaml`

> If the E2E directory layout differs, find existing flows via `ls apps/mobile/e2e` or wherever `.yaml` Maestro flows live. Mirror their structure (waitForAnimationToEnd, testID selectors, adb reverse setup) rather than copying from this plan literally.

- [ ] **Step 1: Bring up E2E infra.**

Memory pointer: `project_e2e_emulator_infra.md` / `feedback_agent_owns_e2e_infra.md`. Agent owns emulator + Metro + proxy + adb-reverse. Start the device, install the app, point at the staging API as configured in existing E2E flows.

- [ ] **Step 2: Write each flow.**

Flow 1 — Self learner:
- Launch app
- Tap testID `try-mentomate-cta`
- Tap testID `preview-landing-continue`
- Tap testID `intent-self`
- Input "algebra basics" into testID `preview-topic-input`
- Tap testID `preview-topic-continue`
- Assert testID `preview-value-prop-learner` visible
- Assert testID `preview-sample-marker` visible
- Tap testID `preview-signup-cta`
- Drive Clerk signup with a fresh email seeded via test helper
- After auth, assert testID `save-wizard-step-1`
- Assert testID `save-target-self` is selected
- Tap testID `save-wizard-step-1-continue`
- Input name + birth year
- Tap testID `save-basics-continue`
- Tap testID `save-confirm-land`
- Assert lands on the session route (whatever the topic-prefill spike resolved to) OR `/(app)/home` per option (b).

Flow 2 — Parent:
- ...intent-child, value-prop parent variant, signup, save wizard with `save-target-child` preselected, parent + child basics, lands on `/(app)/home` rendered as parent home.

Flow 3 — Both child-first: as spec §User Flow → Both.

Flow 4 — Save target overrides intent: pick `child` pre-signup, switch to `save-target-self` in wizard, assert only owner profile created (query API or assert UI shows learner home + no children).

Flow 5 — Expired state: requires a dev/E2E-only seed mechanism. [LOW-1] Use `seedPreviewStateForTesting(state, staleMs)` from Task 3 (mirrors the existing `seedPendingAuthRedirectForTesting` pattern, gated by `EXPO_PUBLIC_E2E === 'true'`). Expose it through a debug-only screen or RN dev-menu hook so a Maestro flow can trigger it; then launch app, assert lands at intent screen (key deleted lazily on read).

- [ ] **Step 3: Run smoke locally.**

```bash
# Use the project's Maestro invocation — check existing scripts.
# Example shape:
# maestro test apps/mobile/e2e/preview-self.yaml
```

- [ ] **Step 4: Fix selector mismatches and stabilization issues.**

Common: missing `waitForAnimationToEnd`, missing testIDs (add them to source if forgotten). Do not loosen assertions — fix the code or the selector chain.

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 17: Run Required Validation

> CLAUDE.md "Required Validation": integration tests when changing auth/profile scoping. Pre-commit hooks cover lint/typecheck/surgical tests automatically.

- [ ] **Step 1: Run API integration tests (auth/profile-scoping changed via new flow that hits `POST /profiles`).**

```bash
pnpm exec nx run api:test -- --testPathPattern integration
```
Expected: pass (no API changes, but the flow exercises the existing route).

- [ ] **Step 2: Run cross-package integration tests.**

```bash
pnpm exec nx run-many -t test -- --testPathPattern integration --no-coverage
```
Expected: pass.

- [ ] **Step 3: Run `bash scripts/check-change-class.sh --run --fast`.**

```bash
bash scripts/check-change-class.sh --run --fast
```
Expected: clean.

- [ ] **Step 4: Self-review the diff.**

```bash
git diff main..HEAD --stat
```

For each non-trivial file in the diff, open it and verify:
- No `eslint-disable` snuck in.
- No `jest.mock('./...')` of internal modules (GC1 / GC6).
- No bare `['profiles']` invalidations — must use predicate (`q.queryKey[0] === 'profiles'`). [MEDIUM-6] Note: `apps/mobile/src/app/create-profile.tsx:184` currently uses a bare-key invalidation; it works because the `useProfiles` query key is currently `['profiles', userId]` and the bare key still matches a prefix. This plan adopts the predicate convention for new code. The existing site is a deferred sweep, not blocked by this PR.
- No `key={themeKey}` on root layouts.
- No persona checks or hardcoded hex colors in shared components.

- [ ] **Step 5: Final commit (if any review fixes needed) via `/commit`.**

---

## Done Criteria

- All Tasks 1-17 boxes ticked.
- Spec ACs 1-16 each have a passing test (unit or E2E).
- `PREVIEW_ONBOARDING_ENABLED = false` flip verified: CTA gone, save wizard not reachable, `CreateProfileGate` unchanged.
- Sibling Study/Family v0 spec can import `isFamilyCapableProfile` without code changes.
- No new `jest.mock('./...')` (GC1 ratchet).
- Pre-commit + pre-push hooks pass on every commit (do NOT use `--no-verify`).

Do NOT open a PR unless the user explicitly asks (memory: `feedback_no_pr_unless_asked.md`).
Do NOT push an OTA update (memory: `feedback_no_ota_unless_asked.md`).
