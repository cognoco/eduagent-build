---
title: App Shell Layout Decomposition — Implementation Plan
date: 2026-05-26
profile: change
spec: docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md (deferred row in "Next Route Candidates")
status: draft
---

# App Shell Layout Decomposition — Implementation Plan

**Goal:** Reduce `apps/mobile/src/app/(app)/_layout.tsx` from 2,652 LOC to under 700 LOC by extracting in-file gate components, the save wizard, and pure helpers into route-local underscore directories, with zero behavior, copy, navigation, analytics, LLM, or API changes.

**Approach:** Mechanical move-and-import. Group by responsibility (helpers / hooks / leaf components / gates / wizard) and extract in low-risk → high-risk order. Each step is a single PR-sized commit verified by the existing co-located test (`_layout.test.tsx`, 2,463 LOC) plus type-check. The file's remaining contents must be the `AppLayout` default export, top-level constants for the `Tabs` JSX (`FULL_SCREEN_ROUTES`, `HIDDEN_TAB_ROUTES`, `iconMap`, `PENDING_CONSENT_STATUSES`), and the `TabIcon` helper (kept inline because it is consumed only by `Tabs.Screen` options in this file).

## Scope

In scope (files this plan owns):
- `apps/mobile/src/app/(app)/_layout.tsx` (source of all extractions)
- New files under `apps/mobile/src/app/(app)/_components/`
- New files under `apps/mobile/src/app/(app)/_hooks/`
- New files under `apps/mobile/src/app/(app)/_lib/`
- `apps/mobile/src/app/(app)/_layout.test.tsx` — **no edits expected**. The test reaches the layout exclusively via `require('./_layout').default` (8 sites) and `require('./_layout').buildSwitchProfileConfirmation` (1 site, line 2388). All other imports point at `'../../lib/...'`, `'../../hooks/...'`, or external packages — none of which move. The `buildSwitchProfileConfirmation` re-export added in T2 preserves the named symbol on the same module ID, so `require('./_layout').buildSwitchProfileConfirmation` keeps resolving. Verification: `git diff -- apps/mobile/src/app/\(app\)/_layout.test.tsx` exits empty after T11.

Out of scope (must not change):
- `apps/mobile/src/app/(app)/_layout.test.tsx` test bodies, descriptions, `it.each` tables, or mock setup beyond import-path updates required by the moves.
- Any sibling route file (`home.tsx`, `session/`, `shelf/`, `subscription.tsx`, `progress/`, etc.).
- Any file under `apps/mobile/src/components/`, `apps/mobile/src/hooks/`, `apps/mobile/src/lib/`.
- Copy strings, translation keys, testIDs, accessibility labels, route names, `track()` event names, navigation paths, or `Tabs.Screen` ordering.
- The `useNavigationShellContract` / `resolveNavigationContract` contract and the V0/V1 flag matrix — preserving these is a hard constraint (see `feedback_profile_shapes.md`, `project_nav_contract_preserve_v0_off.md`).
- The exported `buildSwitchProfileConfirmation` symbol — keep it exported from a re-export barrel so `_layout.test.tsx` imports keep working without rewriting the test.
- The eslint persona-fossil-guard rules.

## Directory layout produced by this plan

```
apps/mobile/src/app/(app)/
├── _layout.tsx                              # ~500–700 LOC: AppLayout + Tabs JSX + tab constants
├── _layout.test.tsx                         # untouched bodies, updated import paths only
├── _components/
│   ├── ProxyBanner.tsx
│   ├── PostApprovalLanding.tsx
│   ├── CreateProfileGate.tsx
│   ├── ConsentWithdrawnGate.tsx
│   ├── ConsentPendingGate.tsx
│   ├── PreviewSubjectBrowser.tsx
│   ├── PreviewSampleCoaching.tsx
│   └── save-wizard/
│       ├── SaveWizardGate.tsx               # controller (Step 1 target select + step shell)
│       ├── ProfileBasicsStep.tsx            # Step 2
│       └── ConfirmStep.tsx                  # Step 3
├── _hooks/
│   └── use-post-approval-landing.ts
└── _lib/
    ├── auth-redirect.ts                     # resolveAuthRedirectPath
    ├── consent-gate-helpers.ts              # canSwitchFromConsentGate, buildSwitchProfileConfirmation, PENDING_CONSENT_STATUSES
    ├── proxy-chrome.ts                      # getProxyChromeColors
    ├── preview-subjects.ts                  # PREVIEW_SUBJECTS constant
    └── save-wizard-targets.ts               # WizardStep type, TargetOption, SAVE_TARGETS, defaultTargetFor
```

`_components/`, `_hooks/`, `_lib/` are underscore-prefixed so Expo Router ignores them (same rule that protects `session/_view-models/`, `session/_hooks/`, `session/_components/` — see `2026-05-14-telemetry-sweep-and-route-shrink.md` Phase B2 Failure Modes row 1).

## Source-line map (current `_layout.tsx`, 2026-05-26)

| Lines | Symbol | Destination |
|---:|---|---|
| 1-72 | imports + `clearPreviewState` ownership comment | stays (imports trimmed to what `AppLayout` still references) |
| 73 | `initNotificationHandler()` side effect | **stays** (must run at module load) |
| 80-91 | `FULL_SCREEN_ROUTES` | stays |
| 104-122 | `HIDDEN_TAB_ROUTES` | stays |
| 124-125 | `PENDING_AUTH_REDIRECT_SETTLE_MS`, `DEFAULT_AUTH_REDIRECT_PATH` | stays |
| 127-155 | `iconMap`, `TabIcon` | stays |
| 157-164 | `getProxyChromeColors` | `_lib/proxy-chrome.ts` |
| 166-224 | `ProxyBanner` | `_components/ProxyBanner.tsx` |
| 227-230 | `PENDING_CONSENT_STATUSES` | `_lib/consent-gate-helpers.ts` |
| 232-252 | `resolveAuthRedirectPath` | `_lib/auth-redirect.ts` |
| 266-278 | `canSwitchFromConsentGate` | `_lib/consent-gate-helpers.ts` |
| 288-326 | `buildSwitchProfileConfirmation` (exported) | `_lib/consent-gate-helpers.ts` (re-export from `_layout.tsx` for test compatibility — see T2 done-when) |
| 332-398 | `usePostApprovalLanding` | `_hooks/use-post-approval-landing.ts` |
| 400-447 | `PostApprovalLanding` | `_components/PostApprovalLanding.tsx` |
| 449-454 | `PREVIEW_SUBJECTS` | `_lib/preview-subjects.ts` |
| 456-517 | `PreviewSubjectBrowser` | `_components/PreviewSubjectBrowser.tsx` |
| 519-604 | `PreviewSampleCoaching` | `_components/PreviewSampleCoaching.tsx` |
| 611-689 | `CreateProfileGate` | `_components/CreateProfileGate.tsx` |
| 691-707 | `WizardStep`, `TargetOption`, `SAVE_TARGETS` | `_lib/save-wizard-targets.ts` |
| 709-723 | `defaultTargetFor` | `_lib/save-wizard-targets.ts` |
| 727-1010 | `ProfileBasicsStep` | `_components/save-wizard/ProfileBasicsStep.tsx` |
| 1024-1129 | `ConfirmStep` | `_components/save-wizard/ConfirmStep.tsx` |
| 1141-1314 | `SaveWizardGate` | `_components/save-wizard/SaveWizardGate.tsx` |
| 1321-1453 | `ConsentWithdrawnGate` | `_components/ConsentWithdrawnGate.tsx` |
| 1455-1987 | `ConsentPendingGate` | `_components/ConsentPendingGate.tsx` |
| 1989-2652 | `AppLayout` default export | stays |

## Tasks

- [ ] **T1: Capture pre-extraction baseline. (No code changes; no directory creation.)**
  Run the validation gates that T9/T10 will rerun, so any pre-existing failure or warning is attributed to the starting state — not to the extraction. The underscore subdirectories (`_components/`, `_hooks/`, `_lib/`, `_components/save-wizard/`) are created implicitly when T2–T8 write their first file into each one; `.gitkeep` files are not used.

  Commands:
  ```powershell
  cd apps/mobile
  pnpm exec tsc --noEmit
  pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage
  pnpm exec eslint "src/app/(app)/_layout.tsx" --max-warnings 0
  (Get-Content -LiteralPath 'src/app/(app)/_layout.tsx').Count   # record starting LOC (expect 2652)
  ```

  Done when:
  - All three commands exit 0. If `eslint --max-warnings 0` reports pre-existing warnings, fix them in this step or downgrade the T9 assertion to "no NEW warnings vs. baseline" (record the baseline warning count here).
  - Starting LOC recorded (expected: 2652). Used as the reference for the per-task LOC-delta done-when in T2/T3/T5/T7/T8.

- [ ] **T2: Extract pure helpers + constants into `_lib/`.**
  Move, byte-for-byte unchanged:
  - `getProxyChromeColors` → `_lib/proxy-chrome.ts` (named export). It still needs `ThemeColors` from `../../../lib/theme`.
  - `resolveAuthRedirectPath` → `_lib/auth-redirect.ts` (named export). Imports `Platform` from `react-native` and `toInternalAppRedirectPath` from `../../../lib/normalize-redirect-path`.
  - `PENDING_CONSENT_STATUSES`, `canSwitchFromConsentGate`, `buildSwitchProfileConfirmation` → `_lib/consent-gate-helpers.ts`. `buildSwitchProfileConfirmation` keeps its `export` keyword.
  - `PREVIEW_SUBJECTS` → `_lib/preview-subjects.ts`.
  - `WizardStep`, `TargetOption`, `SAVE_TARGETS`, `defaultTargetFor` → `_lib/save-wizard-targets.ts`. Imports `PreviewOnboardingStateV0`, `SaveTarget` from `../../../lib/preview-onboarding-state`.

  In `_layout.tsx`, after deleting the inline definitions, add this exact import + re-export block (replaces all five symbols at once). All three named imports are required because `_layout.tsx` still contains `ConsentWithdrawnGate` (calls `canSwitchFromConsentGate` + `buildSwitchProfileConfirmation` at lines 1403/1407), `ConsentPendingGate` (same at 1651/1655 and 1937/1941), and `AppLayout` (uses `PENDING_CONSENT_STATUSES` at line 2439). They become unused only after T8.

  ```ts
  import {
    PENDING_CONSENT_STATUSES,
    canSwitchFromConsentGate,
    buildSwitchProfileConfirmation,
  } from './_lib/consent-gate-helpers';
  // Re-export so `require('./_layout').buildSwitchProfileConfirmation`
  // (used by _layout.test.tsx line 2388) keeps resolving.
  export { buildSwitchProfileConfirmation } from './_lib/consent-gate-helpers';
  ```

  Also add `import { getProxyChromeColors } from './_lib/proxy-chrome';` (consumed by `ProxyBanner` which still lives inline until T3) and `import { resolveAuthRedirectPath } from './_lib/auth-redirect';` (consumed by `AppLayout`). `PREVIEW_SUBJECTS`, `WizardStep`, `TargetOption`, `SAVE_TARGETS`, `defaultTargetFor` do not need a `_layout.tsx` import yet — their only consumers (`PreviewSubjectBrowser`, save-wizard components) leave the file in T5/T7. They are imported by those files directly from `_lib/`.

  Drop the now-unused `TFunction` import from `_layout.tsx`.

  Done when:
  - `rg -n "function (getProxyChromeColors|resolveAuthRedirectPath|canSwitchFromConsentGate|buildSwitchProfileConfirmation|defaultTargetFor)" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `rg -n "(PENDING_CONSENT_STATUSES|PREVIEW_SUBJECTS|SAVE_TARGETS) =" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `rg -n "buildSwitchProfileConfirmation" apps/mobile/src/app/\(app\)/_layout.tsx` returns exactly two lines: one in the `import { … }` block and one in the `export { … }` re-export.
  - `rg -n "from ['\"]\\./_lib/consent-gate-helpers['\"]" apps/mobile/src/app/\(app\)/_layout.tsx` returns exactly two lines (one `import`, one `export`).
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0 — including the `buildSwitchProfileConfirmation` table tests that import the symbol from `./_layout`.
  - `_layout.tsx` LOC drops by ≥ 250.

- [ ] **T3: Extract `ProxyBanner` and `PostApprovalLanding` leaf components.**
  Create `_components/ProxyBanner.tsx` and `_components/PostApprovalLanding.tsx` as named exports. Each receives the same props it currently accepts; do not change prop names, testIDs, copy keys, or styling. `ProxyBanner` imports `getProxyChromeColors` from `../_lib/proxy-chrome`.

  In `_layout.tsx`, replace inline definitions with named imports. Keep `proxyColors` derivation in `AppLayout` unchanged (it stays inline because the `Tabs.screenOptions` callback consumes it).

  Done when:
  - `rg -n "function (ProxyBanner|PostApprovalLanding)" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0. The existing tests with `testID="proxy-banner"`, `testID="proxy-banner-switch-back"`, `testID="post-approval-landing"` continue to render through the layout.
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.
  - LOC delta in `_layout.tsx` ≈ −110.

- [ ] **T4: Extract `usePostApprovalLanding` hook.**
  Move `usePostApprovalLanding` to `_hooks/use-post-approval-landing.ts` as a named export. Imports needed: React, `SecureStore` (from `../../../lib/secure-storage`), `useConsentStatus` (from `../../../hooks/use-consent`), `useSubjects` (from `../../../hooks/use-subjects`), `ActiveProfileRole` (from `../../../hooks/use-active-profile-role`).

  In `_layout.tsx`, replace inline hook with a named import.

  Done when:
  - `rg -n "function usePostApprovalLanding" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0 — including post-approval celebration / suppression tests.
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.

- [ ] **T5: Extract `PreviewSubjectBrowser` and `PreviewSampleCoaching`.**
  Move both into `_components/PreviewSubjectBrowser.tsx` and `_components/PreviewSampleCoaching.tsx` as named exports. `PreviewSubjectBrowser` imports `PREVIEW_SUBJECTS` from `../_lib/preview-subjects`.

  Done when:
  - `rg -n "function (PreviewSubjectBrowser|PreviewSampleCoaching)" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0.
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.
  - LOC delta in `_layout.tsx` ≈ −160.

- [ ] **T6: Extract `CreateProfileGate`.**
  Move to `_components/CreateProfileGate.tsx` as a named export. Component is self-contained — it pulls its own hooks (`useRouter`, `useClerk`, `useUser`, `useQueryClient`, `useProfile`, `useTranslation`) and imports `signOutWithCleanup`, `platformAlert`, `useSafeAreaInsets`, plus React Native primitives (`View`, `Text`, `Pressable`) and `GateContent` from `components/common`.

  **Relative-import depth rule (applies to every extracted file under `_components/`, `_components/save-wizard/`, `_hooks/`, `_lib/`):** files at `(app)/_components/X.tsx`, `(app)/_hooks/X.ts`, `(app)/_lib/X.ts` sit exactly **one directory deeper** than `_layout.tsx`. So every relative import in the original becomes `../` + the original path. Concretely:
  - `'../../lib/sign-out'` → `'../../../lib/sign-out'`
  - `'../../lib/platform-alert'` → `'../../../lib/platform-alert'`
  - `'../../components/common'` → `'../../../components/common'`
  - `'../../hooks/use-consent'` → `'../../../hooks/use-consent'`

  Files inside `_components/save-wizard/` sit **two** directories deeper than `_layout.tsx`, so every `'../../X'` becomes `'../../../../X'` and every `'../../../X'` becomes `'../../../../../X'`. Bare-specifier imports (`react`, `react-native`, `expo-router`, `@clerk/clerk-expo`, `@eduagent/schemas`, etc.) do not change.

  Done when:
  - `rg -n "function CreateProfileGate" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0 — the existing `testID="create-profile-gate"` rendering paths still mount through the layout.
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.

- [ ] **T7: Extract the save wizard (3 components).**
  Move, in this order, to `_components/save-wizard/`:
  1. `ProfileBasicsStep.tsx` (lines 727-1010).
  2. `ConfirmStep.tsx` (lines 1024-1129).
  3. `SaveWizardGate.tsx` (lines 1141-1314).

  `SaveWizardGate.tsx` imports `ProfileBasicsStep` and `ConfirmStep` from sibling files, and `WizardStep`, `SaveTarget`, `SAVE_TARGETS`, `defaultTargetFor` from `../../_lib/save-wizard-targets`. Preserve every comment marker (`[CRITICAL-A2]`, `[CRITICAL-A3]`, `[HIGH-A2]`, `[HIGH-A3]`, `[HIGH-4]`, `[HIGH-B2]`, `[OPT-C]`, `[CRITICAL-1]`, `[CRITICAL-3]`, `[AC 9]`, `[BUG-…]`) — they encode incident history (see `feedback_check_git_history_before_ux_redesign.md`).

  In `_layout.tsx`, replace inline definitions with one named import for `SaveWizardGate`. Drop direct imports for `useApiClient`, `assertOk`, `setPreviewState`, `Profile`, `computeAgeBracket`, `TextInput`, `ScrollView`, `Ionicons` *if and only if* they have no other consumer in `AppLayout`. Verify by grep before deleting each import — `clearPreviewState`, `getPreviewState`, `setPreviewState`, `PreviewOnboardingStateV0`, `SaveTarget` all still appear in `AppLayout`'s effects (line 2145+), so keep those imports.

  Done when:
  - `rg -n "function (ProfileBasicsStep|ConfirmStep|SaveWizardGate)" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `rg -n "(\\[CRITICAL-A2\\]|\\[HIGH-A2\\]|\\[HIGH-A3\\]|\\[HIGH-4\\]|\\[OPT-C\\]|\\[CRITICAL-1\\]|\\[CRITICAL-3\\])" apps/mobile/src/app/\(app\)/_components/save-wizard/ | wc -l` returns ≥ 7 (the inline markers carry over).
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0 — all save-wizard tests (`testID="save-wizard-gate"`, `testID="save-wizard-step-1-continue"`, `testID="save-basics-continue"`, `testID="save-confirm-land"`, etc.) still pass.
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.
  - LOC delta in `_layout.tsx` ≈ −624.

- [ ] **T8: Extract `ConsentWithdrawnGate` and `ConsentPendingGate`.**
  Move both to `_components/ConsentWithdrawnGate.tsx` and `_components/ConsentPendingGate.tsx` as named exports. Each imports `canSwitchFromConsentGate` and `buildSwitchProfileConfirmation` from `../_lib/consent-gate-helpers` instead of using the inline definitions. Preserve every `BUG-…` and `[M-…]` marker comment.

  `ConsentPendingGate` is the largest block (~533 LOC) — extract it in a separate commit from `ConsentWithdrawnGate` if the diff gets unwieldy for review, but the plan task is one logical unit.

  In `_layout.tsx`, no helper-import changes are required in this step. T2 already moved `PENDING_CONSENT_STATUSES`, `canSwitchFromConsentGate`, and `buildSwitchProfileConfirmation` to `_lib/consent-gate-helpers.ts` and added the import block. After this task removes `ConsentWithdrawnGate` and `ConsentPendingGate`, the only remaining `_layout.tsx` consumer of `PENDING_CONSENT_STATUSES` is `AppLayout`'s gate-selection conditional at line 2439 (`PENDING_CONSENT_STATUSES.has(activeProfile.consentStatus)`) — unchanged. `canSwitchFromConsentGate` and `buildSwitchProfileConfirmation` become unused by `_layout.tsx` body in this step; T9's import-trim removes them from the `import { … }` line, but the `export { buildSwitchProfileConfirmation } from './_lib/consent-gate-helpers';` re-export stays (the test still requires it).

  The extracted gate files import `canSwitchFromConsentGate` and `buildSwitchProfileConfirmation` from `../_lib/consent-gate-helpers` — NOT from `'../_layout'`.

  Done when:
  - `rg -n "function (ConsentWithdrawnGate|ConsentPendingGate)" apps/mobile/src/app/\(app\)/_layout.tsx` returns no matches.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0 — all consent-gate tests (`testID="consent-withdrawn-gate"`, `testID="consent-pending-gate"`, refresh / sign-out / switch-profile flows) still pass.
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.
  - LOC delta in `_layout.tsx` ≈ −670.

- [ ] **T9: Trim now-orphaned imports and verify final shape.**
  Walk the `_layout.tsx` import block from top to bottom; for each named import, `rg` for its symbol in the remaining file body and remove the import if it is unused. Expected survivors: React, `Tabs`, `Redirect`, `usePathname`, `useRouter`, `View`, `Text`, `Pressable`, `ActivityIndicator`, `Platform`, `useTranslation`, `Ionicons`, `useAuth`, `useClerk`, `useUser`, `useQueryClient`, `useSafeAreaInsets`, `SecureStore` (for the welcome-intro probe), `hasSeenIntro`, `introSecureStoreKey`, `useProfile`, `useThemeColors`, `useTokenVars`, `ThemeColors`, consent hooks, notification hooks, push token hook, RevenueCat identity hook, Sentry helper, format-api-error helper, sign-out helper, redirect-path helper, pending-auth-redirect helpers, feedback provider, common (`ErrorFallback`, `GateContent`), `ModeSwitcher`, `goBackOrReplace`, `useSubjects` (still used by `usePostApprovalLanding`? — verify; if hook moved cleanly it should be importable inside that file instead), `useActiveProfileRole`, `useMentorLanguageSync`, `useNavigationShellContract`, `FEATURE_FLAGS`, preview-state helpers (`getPreviewState`, `setPreviewState`, `clearPreviewState`, `PreviewOnboardingStateV0`), and the new local imports for the extracted components/helpers.

  Done when:
  - `cd apps/mobile && pnpm exec eslint "src/app/(app)/_layout.tsx" --max-warnings 0` exits 0 (no unused-import warnings).
  - `cd apps/mobile && pnpm exec tsc --noEmit` exits 0.
  - `wc -l "apps/mobile/src/app/(app)/_layout.tsx"` reports a value ≤ 700.
  - `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage` exits 0.

- [ ] **T10: Full mobile validation pass.**
  - Run the related-tests sweep for every extracted file in one command:
    ```powershell
    cd apps/mobile
    pnpm exec jest --findRelatedTests `
      "src/app/(app)/_layout.tsx" `
      "src/app/(app)/_components/ProxyBanner.tsx" `
      "src/app/(app)/_components/PostApprovalLanding.tsx" `
      "src/app/(app)/_components/PreviewSubjectBrowser.tsx" `
      "src/app/(app)/_components/PreviewSampleCoaching.tsx" `
      "src/app/(app)/_components/CreateProfileGate.tsx" `
      "src/app/(app)/_components/ConsentWithdrawnGate.tsx" `
      "src/app/(app)/_components/ConsentPendingGate.tsx" `
      "src/app/(app)/_components/save-wizard/SaveWizardGate.tsx" `
      "src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx" `
      "src/app/(app)/_components/save-wizard/ConfirmStep.tsx" `
      "src/app/(app)/_hooks/use-post-approval-landing.ts" `
      "src/app/(app)/_lib/consent-gate-helpers.ts" `
      "src/app/(app)/_lib/auth-redirect.ts" `
      --no-coverage
    ```
  - `cd apps/mobile && pnpm exec tsc --noEmit`
  - `pnpm exec nx lint mobile`
  - `pnpm exec nx reset` (defensive — Nx cache has known phantom `enforce-module-boundaries` errors in this repo; see `feedback_nx_reset_before_commit.md`).
  - Start the mobile dev server (`pnpm dev:mobile`) and confirm no Expo Router warning about missing default exports for any `_components/`, `_hooks/`, or `_lib/` path. (Underscore-prefixed dirs are ignored by the router by convention; this is the same guard `session/_components/` relies on.)
  - Manual smoke on the Android dev-client emulator:
    1. Sign in → land on Home tab (no preview state).
    2. Force-reset preview state with `await setPreviewState({ … })` via dev-only DevTools or by replaying the preview flow → SaveWizardGate Steps 1→2→3 → land on session.
    3. Switch to a child profile → confirm proxy banner appears and `Switch back` returns to the parent.
    4. Set `consentStatus = 'PENDING'` on the active profile via Drizzle Studio → confirm `ConsentPendingGate` renders and the "Switch profile" button only appears for 18+ owners with a minor in `profiles[]`.

  Done when:
  - All four jest / tsc / lint / nx-lint commands above exit 0.
  - Manual smoke flows 1-4 land on the expected screen with no console errors and no visual change versus pre-refactor.

- [ ] **T11: Update the parent telemetry-sweep plan to reference this plan.**
  In `docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md`, the deferred-routes table (around line 266-272) currently says: `Needs an app-shell decomposition plan, not a learning-route cleanup.` Change that cell to point at this plan: `Tracked in docs/plans/2026-05-26-app-shell-layout-decomposition.md.`

  Done when:
  - `rg -n "2026-05-26-app-shell-layout-decomposition" docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md` returns exactly one match.
  - `git diff -- docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md` shows only the single-line table update.

## Verification (end-to-end)

```powershell
cd apps/mobile
pnpm exec tsc --noEmit
pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage
cd ../..
pnpm exec nx lint mobile
(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/_layout.tsx').Count   # expect ≤ 700
```

Integration tests are not required because nothing in `apps/api/` or `tests/integration/` changes. No schema, migration, or Doppler change is in scope.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Expo Router auto-discovers an extracted file as a route | A new component file is placed directly under `app/(app)/` without an underscore directory | Phantom tab in the dev menu, console warning `Route ".../X" is missing the required default export` | Move the file under `_components/`, `_hooks/`, or `_lib/`. The `HIDDEN_TAB_ROUTES` whitelist is the belt-and-braces fallback but is not the right fix here. |
| Test file fails to import `buildSwitchProfileConfirmation` | T2 moved the helper but did not add the `export { buildSwitchProfileConfirmation } from './_lib/consent-gate-helpers';` re-export to `_layout.tsx` | Jest fails with `Cannot find name 'buildSwitchProfileConfirmation'` in `_layout.test.tsx` | Add the re-export line in `_layout.tsx`. The test file imports from `./_layout` (line 1 of `_layout.test.tsx`); preserving the re-export keeps the test untouched. |
| `clearPreviewState` ownership comment loses its in-file referent | T7 removed the wizard but left the line-68 comment that says `clearPreviewState is now imported here — ownership is Task 14's Step-3 success path (this file) and sign-out` | Comment becomes misleading because Step-3 success now lives in `_components/save-wizard/ConfirmStep.tsx` | Update the comment to: `// clearPreviewState ownership: SaveWizardGate Step-3 success (./\_components/save-wizard/ConfirmStep.tsx) and signOutWithCleanup. The AppLayout effect at lines ~2201-2213 clears stale preview state when an active profile already exists.` |
| V0 5-tab production mode breaks | An extraction accidentally touches `useNavigationShellContract`, `navigationShell.visibleTabs`, `homeTabPresentation`, or the `Tabs.screenOptions` callback | Wrong tab set or wrong home presentation under `MODE_NAV_V0_ENABLED=false` | The Tabs JSX and `navigationShell` derivation must NOT move. T9's import-trim step explicitly keeps `useNavigationShellContract`. Re-run the nav contract tests (`pnpm exec jest --findRelatedTests src/hooks/use-navigation-contract.ts --no-coverage`) if any line touching `navigationShell.*` changes. Hard constraint per `project_nav_contract_preserve_v0_off.md`. |
| Persona fossils sneak back in via the extracted gates | A reviewer "tidies up" `computeAgeBracket` usage in `ConsentPendingGate` / `ConsentWithdrawnGate` by re-introducing `personaFromBirthYear` or local `Persona` type | `persona-fossil-guard.test.ts` fails | Keep the gate code byte-for-byte equivalent. Run `pnpm exec jest persona-fossil-guard --no-coverage` after T8 if any non-mechanical change touched age logic. |
| `_layout.test.tsx` mock setup hits the wrong module path | T6/T7/T8 extractions moved a component that the test currently mocks via `jest.mock('./...', …)` against `./_layout` indirectly | Tests fail with `Cannot find module './_components/...'` or mocks no-op silently | Audit `_layout.test.tsx` mocks once after T9: `rg -n "jest.mock" apps/mobile/src/app/\(app\)/_layout.test.tsx`. The existing test mocks library code (`useClerk`, `useProfile`, `useConsentStatus`, etc.), not in-file components, so this should not trigger — but verify before declaring T10 done. Internal mocks must not be added; if a mock of an extracted component is tempting, the right answer is to render through the real component (GC1 / GC6 — see `CLAUDE.md` Code Quality Guards). |
| Pre-commit hook surfaces internal-mock warnings on the extracted test paths | T7/T8 leave `jest.mock('./_components/...')` calls behind because the test was extended to mock the newly-extracted file | `~/.claude/hooks/post-edit-jest-mock-check.sh` flags the file | Do not mock the extracted components. The whole point of the move is that the real component still renders through `_layout.test.tsx`. Convert to `jest.requireActual()` with targeted overrides if a stub is strictly necessary. |
| Reviewer/follow-up PR adds `jest.mock('./_components/...')` after extraction | Tempting shortcut to stub a heavy extracted component (e.g. `SaveWizardGate`, `ConsentPendingGate`) once it has a discrete module path | GC1 pre-commit ratchet fails the PR with a new internal-mock violation; CI red | Render through the real component (the whole point of the extraction — `_layout.test.tsx` still mounts the full tree). If a stub is strictly necessary, use `jest.requireActual('./_components/...')` with targeted named-export overrides — canonical pattern in `apps/api/src/inngest/functions/archive-cleanup.test.ts`. The `// gc1-allow: <reason>` escape is only for code that genuinely cannot run in the test environment, not for convenience. See `CLAUDE.md` Code Quality Guards → GC1/GC6. |
| `_layout.tsx` LOC target is missed | After T9 the file is still > 700 LOC | T10 LOC assertion fails | Reasons in priority order: (a) imports were not trimmed; (b) a chunk listed in the source-line map was kept inline by mistake; (c) `Tabs.Screen` JSX or `AppLayout` effects are larger than estimated. Do not attempt to shrink `AppLayout` itself in this plan — its effects encode the gate ordering contract documented at lines 2356-2376 and must stay together. If the file lands at 720 LOC because of `AppLayout`, accept it and amend the target in this plan's success criteria; do not split the effects. |

## Rollback

This is a mobile-only refactor with no schema, migration, data, contract, or API change. Roll back by reverting each task's commit in reverse order (T11 → T1). Because every task is a mechanical move with the byte-identical body re-imported, any failing behavior test after a partial revert can be fixed by restoring the exact previous inline block in `_layout.tsx` and deleting the corresponding `_components/` / `_hooks/` / `_lib/` file. Data loss is not possible — no SecureStore key, query-key, or analytics event name changes.

## Out Of Scope

- Splitting `_layout.test.tsx` itself, even though it is now 2,463 LOC. That is a separate maintainability question; this plan deliberately leaves the test file as the single guarantor of behavioral equivalence so a side-by-side `git log -p` review is straightforward.
- Touching `AppLayout`'s gate-ordering logic, effects, or the `Tabs` JSX. The ordering contract at lines 2356-2376 is load-bearing across V0 and V1 nav flows.
- Introducing new abstractions (e.g., a "gate selector" helper) — every change must be a mechanical move.
- Migrating to V1 nav contract (`MODE_NAV_V1_ENABLED`), removing V0 helpers, or changing `resolveNavigationContract`. See `docs/specs/2026-05-21-navigation-contract.md` and the hard-constraint note in `CLAUDE.md`.
- Adding tests for the extracted files beyond what `_layout.test.tsx` already exercises. If a follow-up plan wants pure unit tests for the new `_lib/` helpers, that is a separate, additive piece of work.
- Touching `apps/mobile/src/app/_layout.tsx` (the root router layout). Only `(app)/_layout.tsx` is in scope.
