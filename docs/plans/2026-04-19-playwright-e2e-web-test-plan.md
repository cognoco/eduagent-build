# Playwright E2E Web Test Plan

**Date:** 2026-04-19
**Status:** Strategy agreed, not yet scaffolded
**Source of truth:** `docs/flows/mobile-app-flow-inventory.md` (~100 flows, ~90% coverage of user-facing flows)

## Approach

**Option B + targeted Option A:**

1. **Option B — Role-Based Journey Tests (~15 journeys):** Test complete user journeys that cross role boundaries (parent ↔ learner ↔ child). These catch navigation/destination bugs that per-screen tests miss.
2. **Option A — Web-Specific Regression Tests (targeted):** Test flows where web rendering differs from native (layout bleed-through, `goBackOrReplace` with no history, navigation stack behavior).

**What we are NOT doing:** Mirroring all Maestro flows in Playwright. Native-specific behavior (gestures, hardware back, TTS) doesn't apply to web. Maestro stays the native E2E tool.

## Why This Approach

The existing test suite has a blind spot: **cross-role navigation transitions**. Maestro flows test one role at a time. Unit tests mock navigation. The flow inventory groups by feature, not by role transition.

Example bug caught by this approach but missed by existing tests:
> Parent taps "Start learning" → lands on subject screen instead of learner home.

The journey test asserts the **destination**, not just "something loaded."

## Infrastructure

### Stack

- **Playwright** (`@playwright/test`) targeting the Expo web build
- **Expo web** via `expo start --web` on port 8081 (Metro bundler, react-native-web)
- **Locator strategy:** `data-testid` (React Native `testID` → `data-testid` via react-native-web), with `getByRole`/`getByText` fallback for third-party components

### Directory Structure

```
apps/mobile/
├── e2e/                        # existing Maestro flows (native)
├── e2e-web/                    # new Playwright tests (web)
│   ├── flows/
│   │   ├── journeys/           # Option B — cross-role journey tests
│   │   ├── auth/               # Option A — web-specific auth regression
│   │   ├── navigation/         # Option A — web-specific nav regression
│   │   └── ...
│   ├── helpers/
│   │   ├── auth.ts             # sign-in + storageState reuse
│   │   └── navigation.ts       # goBackOrReplace, URL assertions
│   └── fixtures/
│       └── test-accounts.ts    # test user credentials per role
├── playwright.config.ts
```

### Auth Strategy

Use Playwright's `storageState` pattern:
1. One `auth.setup.ts` project signs in and saves cookies/tokens
2. All other tests load that state — no sign-in per test
3. Separate storage states for: parent account, solo learner, child profile

## Role × Action Matrix (Home Screens)

Every interactive element on the home screens mapped with expected destination and role context.

### ParentGateway (`parent-gateway`)

| Element | testID | Navigation Target | Role After | Notes |
|---------|--------|-------------------|------------|-------|
| Check child's progress | `gateway-check-progress` | `/(app)/dashboard` | Parent | |
| Learn something | `gateway-learn` | Shows LearnerScreen (state toggle) | Parent (viewing learner UI) | `onLearn()` sets `showLearnerView=true` |
| ProfileSwitcher chip | `profile-switcher-chip` | Opens dropdown | Same | |
| Profile option (child) | `profile-option-{id}` | Home re-renders as LearnerScreen | Child learner | Calls `switchProfile(childId)` |
| Profile option (self) | `profile-option-{id}` | Stays on ParentGateway | Parent | No-op if already active |
| Dashboard error retry | `parent-dashboard-error` | None (refetch) | Same | |

### LearnerScreen (`learner-screen`)

| Element | testID | Navigation Target | Role After | Notes |
|---------|--------|-------------------|------------|-------|
| Back arrow (parent only) | `learner-back` | Returns to ParentGateway | Parent (same profile) | Only shown when parent tapped "Learn something" |
| Continue (recovery) | `intent-continue` | `/(app)/session` w/ sessionId | Same | Recovery marker variant |
| Continue (API suggestion) | `intent-continue` | `/(app)/session` w/ mode=learning | Same | Mutually exclusive with recovery |
| Continue (overdue review) | `intent-continue` | `/(app)/topic/relearn` | Same | Mutually exclusive with above |
| Quiz discovery | `intent-quiz-discovery` | `/(app)/quiz` w/ activityType | Same | Dismissible |
| Learn | `intent-learn` | `/create-subject` | Same | |
| Ask | `intent-ask` | `/(app)/session?mode=freeform` | Same | |
| Practice | `intent-practice` | `/(app)/practice` | Same | |
| Homework | `intent-homework` | `/(app)/homework/camera` | Same | |
| ProfileSwitcher (child→parent) | `profile-option-{id}` | Home re-renders as ParentGateway | Parent | |

### AddFirstChildScreen (`add-first-child-screen`)

| Element | testID | Navigation Target | Role After | Notes |
|---------|--------|-------------------|------------|-------|
| Add Child Profile | `add-first-child-cta` | `/create-profile` | Same (parent) | Family/pro owners only |

### Loading Timeout (`home-loading-timeout`)

| Element | testID | Navigation Target | Role After |
|---------|--------|-------------------|------------|
| Retry | `home-loading-retry` | None (resets timeout) | Same |
| Go to Library | `timeout-library-button` | `/(app)/library` | Same |
| More options | `timeout-more-button` | `/(app)/more` | Same |

### Consent Gates (in `_layout.tsx`, block all app content)

| Gate | Condition | Interactive Elements | Role Switch Available? |
|------|-----------|---------------------|----------------------|
| No profile | `!activeProfile` | Create profile + Sign out | No |
| Consent pending | `PENDING` or `PARENTAL_CONSENT_REQUESTED` | Send to parent / Resend / Change email / Switch profile (adults 18+ only) | Conditional |
| Consent withdrawn | `WITHDRAWN` | Refresh status / Switch profile (adults 18+ only) / Sign out | Conditional |
| Post-approval | One-time after `CONSENTED` | "Let's Go" button | No |

### Profile Switching Entry Points (all call `switchProfile()`)

| Entry Point | Location | Context |
|-------------|----------|---------|
| ProfileSwitcher dropdown | Home screen header (ParentGateway + LearnerScreen) | Quick switch |
| ProfilesScreen row tap | `/profiles` modal (from More → Profile) | Full profile list |
| ConsentPendingGate button | `(app)/_layout.tsx` | Adults escaping child consent gate |
| ConsentWithdrawnGate button | `(app)/_layout.tsx` | Adults escaping child withdrawal gate |
| Auto-fallback | ProfileProvider | Saved profile no longer exists → silent switch to owner |

## Journey Tests (Option B)

### Phase 1 — Smoke (prove infra works)

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-01: Sign in → learner home | AUTH-04, HOME-01 | Lands on `learner-screen`, intent cards visible |
| J-02: Auth screen navigation | AUTH-07 | sign-in ↔ sign-up ↔ forgot-password links work |
| J-03: Sign in → parent gateway | AUTH-04, HOME-02 | Owner with children sees `parent-gateway` |

### Phase 2 — Role Transitions (the blind spot)

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-04: Parent → "Learn something" → learner view → back to parent | HOME-02, HOME-01 | `gateway-learn` → `learner-screen` visible, `learner-back` → `parent-gateway` visible |
| J-05: Parent → switch to child profile → child learner home | ACCOUNT-04 | `profile-option-{childId}` → `learner-screen` renders (no ParentGateway), intent cards correct |
| J-06: Child → switch to parent profile → parent gateway | ACCOUNT-04 | `profile-option-{parentId}` → `parent-gateway` renders |
| J-07: Parent → dashboard → child detail → back to dashboard → back to home | HOME-02, PARENT-01, PARENT-03 | Each back navigation lands on correct screen (not dead-end) |

### Phase 3 — Core Learning Journeys

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-08: Learner → Ask → freeform chat → send message → end session → summary → home | LEARN-01, LEARN-07, HOME-01 | Full cycle, returns to home |
| J-09: Learner → Learn → create subject → interview → curriculum → start session | SUBJECT-01, SUBJECT-07, SUBJECT-09, SUBJECT-11 | Full onboarding-to-learning flow |
| J-10: Learner → Practice hub → Quiz → launch → play → results → home | PRACTICE-01, QUIZ-01→07 | Full quiz cycle with destination assertions at every step |
| J-11: Learner → Library → shelf → book → start learning | LEARN-08, LEARN-09, LEARN-10, LEARN-02 | Library navigation chain |

### Phase 4 — Edge & Error Journeys

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-12: New user → sign up → create profile → lands on learner home | AUTH-02, ACCOUNT-01, HOME-01 | Full first-time experience |
| J-13: Child with pending consent → consent gate blocks app → parent approves → child enters app | ACCOUNT-19→24 | Gate renders, post-approval landing, then learner home |
| J-14: Loading timeout → fallback actions work | HOME-08 | Library and More fallback buttons navigate correctly |
| J-15: Parent with no children (family plan) → add-first-child screen → create profile | HOME-07, ACCOUNT-03 | `add-first-child-cta` navigates to `/create-profile` |

### Phase 5 — Parent Drill-Down Journeys

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-16: Parent → dashboard → child → subject → topic detail → back chain | PARENT-01→04, PARENT-10 | Deep drill-down and full back-navigation chain |
| J-17: Parent → dashboard → child → session recap with conversation prompt | PARENT-05, PARENT-11 | Recap block renders when populated, copy-to-clipboard works |

## Web-Specific Regression Tests (Option A)

| Test | Why Web-Specific | Assertion |
|------|-----------------|-----------|
| W-01: No screen bleed-through on nested navigators | CC-09 — native unaffected, web needs opaque backgrounds | No transparent gaps between stacked screens |
| W-02: `goBackOrReplace` with empty history | CC-04 — web can have empty history (direct URL, refresh) | Fallback route loads instead of blank screen |
| W-03: Deep link to authenticated route without session | Web allows direct URL entry | Redirects to sign-in, then back to intended route |
| W-04: Browser back/forward through navigation stack | Web-only behavior | Each step renders correctly, no stale state |
| W-05: Tab navigation via URL | Web-only — tabs have URL routes | `/home`, `/library`, `/progress`, `/more` all render correct tab |

## Test Design Principles

### Every navigation tap asserts destination

```typescript
// BAD — passes even when destination is wrong
await page.getByTestId('gateway-learn').click();
await expect(page.locator('body')).not.toBeEmpty(); // "something loaded"

// GOOD — catches wrong destination
await page.getByTestId('gateway-learn').click();
await expect(page.getByTestId('learner-screen')).toBeVisible();
await expect(page.getByTestId('intent-learn')).toBeVisible();
```

### Test by role × action, not by screen

For every interactive element, ask: "who tapped it, and where should THEY land?"

### State matrix for key screens

For screens that vary by user state, enumerate all valid states:
- Learner (no subjects) → empty guidance
- Learner (with subjects) → intent cards + continue card
- Parent (with children) → ParentGateway
- Parent (no children, family plan) → AddFirstChildScreen
- Child (consent pending) → ConsentPendingGate
- Child (consent withdrawn) → ConsentWithdrawnGate

### Error states always have recovery

Every error assertion checks for at least one actionable element (retry, go back, go home).

## Execution Order

1. Install `@playwright/test`, create `playwright.config.ts`
2. Implement `auth.setup.ts` with storageState for parent + learner
3. J-01 through J-03 (smoke — prove infra works)
4. J-04 through J-07 (role transitions — the primary blind spot)
5. W-01 through W-05 (web-specific regressions)
6. J-08 through J-17 (remaining journeys, phased)

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| `testID` not forwarded to DOM by some RN components | Audit key screens in browser DevTools before writing tests. Fallback to `getByRole`/`getByText`. |
| Clerk auth on web may behave differently | Test auth.setup.ts early. May need Clerk's testing tokens or a test-mode bypass. |
| Expo web Metro bundler slow cold start (~18s) | Use Playwright's `webServer` config with `reuseExistingServer: true` |
| LLM-dependent flows (chat, quiz generation) non-deterministic | Mock API responses with `page.route()` for LLM endpoints. Assert UI behavior, not LLM output. |
| Some native-only components won't render on web | Skip flows that depend on native modules (TTS playback, camera capture). Note in test as `test.skip`. |
