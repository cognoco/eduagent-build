# Playwright E2E Web Test Plan

**Date:** 2026-04-19 (revised 2026-04-20 — review findings integrated)
**Status:** Strategy agreed, Step 0 prerequisites pending, not yet scaffolded
**Source of truth:** `docs/flows/mobile-app-flow-inventory.md` (~100 flows, ~90% coverage of user-facing flows)
**Test data source:** `apps/api/src/services/test-seed.ts` — 19 pre-built scenarios, invoked via `POST /v1/__test/seed`

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

## Failure Modes

Required by `~/.claude/CLAUDE.md` — every spec must enumerate failure modes and recovery paths. The suite itself is a test harness, so these cover *infrastructure* failure, not product failure (product failures are in §"State matrix for key screens").

| State | Trigger | User (CI / dev) sees | Recovery |
|-------|---------|----------------------|----------|
| Clerk sign-in fails in `auth.setup.ts` | Wrong testing token, rate limit, staging Clerk outage | Setup project fails with captured screenshot + network log | Re-run with `--project=setup`; fall back to recorded `storageState.json` from last green run |
| `storageState.json` expired (JWT rotated) | Session TTL exceeded between runs | Test lands on sign-in screen when it expected `/home` | `auth.setup.ts` detects this via URL probe + re-signs in; CI always re-runs setup |
| `testID` missing from DOM | RN component didn't forward `testID` → `data-testid` | Playwright timeout on `getByTestId` | Step 0 audit catches this before tests are written; fallback to `getByRole`/`getByText` |
| Expo web bundler cold-starts mid-run | First test after reboot / cache reset | 18s+ hang, tests flake on timeout | `webServer.reuseExistingServer: true` + `timeout: 60_000` on first page load |
| Seed endpoint 500 / Doppler secret missing | Staging API down, `TEST_SEED_SECRET` rotated | `globalSetup` throws before first test | Fail fast with actionable message; CI halts whole run (don't half-seed) |
| Orphaned test accounts accumulate | Run aborted before teardown | Clerk user count bloats; no functional break | `globalTeardown` sweeps by `integ-playwright-${runId}-*` prefix; nightly cron calls `/__test/reset` on matching prefix |
| Port 8081 collision | Native Metro already running on dev box | `expo start --web` fails | Pin web to port 19006; kill-first check in `webServer.command` |
| LLM endpoint returns non-deterministic content | Unmocked LLM call in asserted flow | Assertion on generated text flakes | Mock via `page.route('**/v1/llm/**')`; assert UI shape not content |
| Multi-context journey (J-13) fatally interleaves | Parent and child tabs race on consent approval | Test hangs or asserts pre-approval | Use explicit `await page.waitForResponse(...)` at each sync point |

## Infrastructure

### Stack

- **Playwright** (`@playwright/test`) targeting the Expo web build
- **Expo web** via `expo start --web` on **port 19006** (pin explicitly — 8081 collides with native Metro)
- **Locator strategy:** `data-testid` (React Native `testID` → `data-testid` via react-native-web), with `getByRole`/`getByText` fallback for third-party components
- **testID coverage is a prerequisite, not a given** — see §"Step 0: Prerequisites" below

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
│       └── scenarios.ts        # seed scenario → account mapping (NOT hardcoded credentials)
├── playwright.config.ts
```

**Why `scenarios.ts` not `test-accounts.ts`:** accounts are ephemeral per-run; scenarios are durable. The fixture file names seed scenarios, the `globalSetup` resolves them to fresh accounts at run time. Hardcoded credentials would collide across CI parallelism and across branches.

### Auth Strategy

**Critical correction from v1 of this plan:** children do not authenticate. A "child profile" is `switchProfile(childId)` on the parent's Clerk session, not a separate Clerk user. The suite therefore needs **two** Clerk sessions, not three, and child-role coverage comes from programmatic profile switching inside the parent session.

Playwright's `storageState` pattern, one file per Clerk session:

| storageState file | Seed scenario | Clerk session | Child-role coverage via |
|---|---|---|---|
| `.auth/solo-learner.json` | `onboarding-complete` (or `learning-active`) | Solo learner, no children | N/A — no role transitions |
| `.auth/owner-with-children.json` | `parent-multi-child` | Parent with ≥2 children | `switchProfile(childId)` inside tests |

Ad-hoc scenarios (consent gates, retention queue, trial-expired) seed fresh accounts per test — see §"Test Data & Teardown". They do not get a persistent storageState.

`auth.setup.ts` responsibilities:
1. Call `POST /v1/__test/seed` with the scenario name, capture the returned email + password
2. Sign in to Clerk via UI (or Clerk testing-tokens API when available — see §"Clerk testing mode" below)
3. Save `storageState` to `.auth/<scenario>.json`
4. Validate session by hitting `/home` and asserting the expected landing screen

**Clerk testing mode:** Clerk ships a testing-tokens API that bypasses CAPTCHA and rate limits in `test` mode. Commit to using it — set `CLERK_TESTING_TOKEN` in Doppler `stg` and wire it into `auth.setup.ts`. Don't leave this as a "may need" risk row.

## Step 0: Prerequisites (Blocking)

These must land **before Phase 1** — Phase 1 smoke tests cannot run without them. Grepped `apps/mobile/src` on 2026-04-20 to identify gaps.

### 0.1 — Add Missing testIDs

Present in code ✅: `parent-gateway`, `gateway-check-progress`, `gateway-learn`, `parent-dashboard-error`, `learner-screen`, `learner-back`, `profile-switcher-chip`, `profile-switcher-backdrop`, `profile-switcher-menu`, `add-first-child-screen`, `add-first-child-cta`, `home-loading-timeout`, `home-loading-retry`, `timeout-library-button`, `timeout-more-button`.

**Missing — must be added before writing tests:**

| testID | File | Element | Used by journey |
|---|---|---|---|
| `intent-continue` | [LearnerScreen.tsx](apps/mobile/src/components/home/LearnerScreen.tsx) | Continue card (all three variants — recovery, suggestion, relearn) | J-08, J-10 |
| `intent-quiz-discovery` | [LearnerScreen.tsx](apps/mobile/src/components/home/LearnerScreen.tsx) | Quiz discovery card | J-10 |
| `intent-learn` | [LearnerScreen.tsx](apps/mobile/src/components/home/LearnerScreen.tsx) | Learn intent card | J-09 |
| `intent-ask` | [LearnerScreen.tsx](apps/mobile/src/components/home/LearnerScreen.tsx) | Ask intent card | J-08 |
| `intent-practice` | [LearnerScreen.tsx](apps/mobile/src/components/home/LearnerScreen.tsx) | Practice intent card | J-10 |
| `intent-homework` | [LearnerScreen.tsx](apps/mobile/src/components/home/LearnerScreen.tsx) | Homework intent card | (future) |
| `profile-option-{id}` | [ProfileSwitcher.tsx](apps/mobile/src/components/common/ProfileSwitcher.tsx) | Each profile row in dropdown (dynamic — interpolate profile id) | J-04, J-05, J-06 |

**Verification:** a Jest test per component asserting `getByTestId(...)` finds each element in a rendered minimal state. Commit per component.

### 0.2 — react-native-web DOM audit

Not every RN component forwards `testID` → `data-testid` in web. Before writing Playwright tests, run Expo web locally and open DevTools for each screen in §"Role × Action Matrix":

- Confirm each `testID` appears as `data-testid` on a DOM node
- Confirm it's on the **click target**, not a wrapper that `pointer-events: none` might swallow
- Record exceptions in a new file `apps/mobile/e2e-web/testid-audit.md`

Acceptance: every testID in §"Role × Action Matrix" has a line in `testid-audit.md` reading `✅ present` or `⚠️ fallback to getByRole(...)`.

### 0.3 — Confirm Clerk testing token

Provision `CLERK_TESTING_TOKEN` in Doppler `stg`, verify with a one-shot curl against Clerk's `/v1/client/sign_ins` — fail the milestone if tokens aren't available.

### 0.4 — Confirm seed + reset endpoints on staging

- `POST /v1/__test/seed` with scenario `onboarding-complete` should return a usable account in <10s
- `POST /v1/__test/reset` should accept a prefix parameter and return a count of accounts deleted — if it doesn't, extend it before Phase 1

**Exit criteria for Step 0:** Phase 1 (J-01 to J-03) can be written using only testIDs that appear in `testid-audit.md` as ✅.

## Role × Action Matrix (Home Screens)

Every interactive element on the home screens mapped with expected destination and role context.

### ParentGateway (`parent-gateway`)

| Element | testID | Navigation Target | Role After | Notes |
|---------|--------|-------------------|------------|-------|
| Check child's progress | `gateway-check-progress` | `/(app)/dashboard` | Parent | |
| Learn something | `gateway-learn` | Shows LearnerScreen (state toggle) | Parent (viewing learner UI) | `onLearn()` sets `showLearnerView=true` |
| ProfileSwitcher chip | `profile-switcher-chip` | Opens dropdown | Same | |
| Profile option (child) | `profile-option-{id}` ⚠️ TO ADD (Step 0.1) | Home re-renders as LearnerScreen | Child learner | Calls `switchProfile(childId)` |
| Profile option (self) | `profile-option-{id}` ⚠️ TO ADD (Step 0.1) | Stays on ParentGateway | Parent | No-op if already active |
| Dashboard error retry | `parent-dashboard-error` | None (refetch) | Same | |

### LearnerScreen (`learner-screen`)

| Element | testID | Navigation Target | Role After | Notes |
|---------|--------|-------------------|------------|-------|
| Back arrow (parent only) | `learner-back` | Returns to ParentGateway | Parent (same profile) | Only shown when parent tapped "Learn something" |
| Continue (recovery) | `intent-continue` ⚠️ TO ADD (Step 0.1) | `/(app)/session` w/ sessionId | Same | Recovery marker variant |
| Continue (API suggestion) | `intent-continue` ⚠️ TO ADD (Step 0.1) | `/(app)/session` w/ mode=learning | Same | Mutually exclusive with recovery |
| Continue (overdue review) | `intent-continue` ⚠️ TO ADD (Step 0.1) | `/(app)/topic/relearn` | Same | Mutually exclusive with above |
| Quiz discovery | `intent-quiz-discovery` ⚠️ TO ADD (Step 0.1) | `/(app)/quiz` w/ activityType | Same | Dismissible |
| Learn | `intent-learn` ⚠️ TO ADD (Step 0.1) | `/create-subject` | Same | |
| Ask | `intent-ask` ⚠️ TO ADD (Step 0.1) | `/(app)/session?mode=freeform` | Same | |
| Practice | `intent-practice` ⚠️ TO ADD (Step 0.1) | `/(app)/practice` | Same | |
| Homework | `intent-homework` ⚠️ TO ADD (Step 0.1) | `/(app)/homework/camera` | Same | |
| ProfileSwitcher (child→parent) | `profile-option-{id}` ⚠️ TO ADD (Step 0.1) | Home re-renders as ParentGateway | Parent | |

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

## Test Data & Teardown

**Context:** the staging Neon DB has exactly **1 real user** (`key_to@yahoo.com`) and **42 orphaned integration-test accounts** (2026-04-20 audit). Those orphans are evidence that existing integration tests don't clean up. The Playwright suite must not repeat this pattern.

### Seed scenarios (canonical list)

All test accounts come from `apps/api/src/services/test-seed.ts`. Verified scenario names the suite relies on:

| Scenario | Journeys | Produces |
|---|---|---|
| `onboarding-complete` | J-01, J-02, J-08 | Solo learner, 1 subject, ready to chat |
| `learning-active` | J-08, J-10 | Solo learner with ongoing session + recovery marker |
| `parent-multi-child` | J-03, J-04, J-05, J-06, J-07, J-16, J-17 | Owner + 2+ children profiles |
| `parent-with-children` | (alt for single-child tests) | Owner + 1 child |
| `consent-pending` | J-13 | Child profile in `PENDING` / `PARENTAL_CONSENT_REQUESTED` |
| `consent-withdrawn` | (state matrix) | Child profile in `WITHDRAWN` |
| `retention-due` | J-11 | Learner with overdue review queue |
| `onboarding-no-subject` | J-09 | Fresh learner, forces `/create-subject` redirect |
| `pre-profile` | J-12 | Signed-in Clerk user with no profile yet |
| `homework-ready` | (future) | Learner with homework assignment |
| `multi-subject-practice` | J-10 | Learner with 2+ subjects for practice hub |

Any journey requiring a scenario not listed here must either (a) use an existing scenario, (b) extend an existing scenario with helper setup, or (c) add a new scenario to `test-seed.ts` *before* writing the test.

### Per-run isolation

Every Playwright run gets a unique `runId` (e.g. `playwright-${Date.now()}-${randomHex(4)}`). All emails created during the run use the prefix `integ-playwright-${runId}-<scenarioIdx>@test.invalid`. This lets `globalTeardown` (and a nightly cron fallback) sweep deterministically by prefix without touching the real `key_to@yahoo.com` account or other teams' test data.

**Forbidden:** hardcoded emails like `parent-multi-child@mentomate.test`. They collide across CI parallelism and across PR branches.

### Teardown

Three layers, in order of precedence:

1. **`globalTeardown` (primary):** `POST /v1/__test/reset?prefix=integ-playwright-${runId}-` at end of every run, pass or fail.
2. **`afterEach` ad-hoc:** for tests that create non-account data (subjects, sessions, quizzes beyond the seed), tag each with the `runId` and let the prefix sweep pick it up.
3. **Nightly cron (safety net):** runs `/__test/reset?prefix=integ-playwright-&olderThan=24h` — catches aborted runs whose teardown never fired.

**Implementation note:** before Step 0 ships, verify `/__test/reset` accepts a prefix filter. Grep confirmed the endpoint exists; confirm the filter param. If missing, extend the endpoint — do not ship the suite without it.

### Pre-flight reset

The 42 existing orphans (`clerk_integ_sess_*`, `integ-sess-*`) should be swept **once** before the suite goes live, then staging stays clean by the mechanisms above. This is a separate janitorial task, not part of the suite.

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
| J-13: Child with pending consent → consent gate blocks app → parent approves → child enters app | ACCOUNT-19→24 | Gate renders, post-approval landing, then learner home. **Seed: `consent-pending`. Requires two Playwright browser contexts** (parent's tab approves while child's tab polls). Sync points use `page.waitForResponse('**/v1/parent/consent**')`. |
| J-14: Loading timeout → fallback actions work | HOME-08 | Library and More fallback buttons navigate correctly |
| J-15: Parent with no children (family plan) → add-first-child screen → create profile | HOME-07, ACCOUNT-03 | `add-first-child-cta` navigates to `/create-profile` |

### Phase 5 — Parent Drill-Down Journeys

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-16: Parent → dashboard → child → subject → topic detail → back chain | PARENT-01→04, PARENT-10 | Deep drill-down and full back-navigation chain |
| J-17: Parent → dashboard → child → session recap with conversation prompt | PARENT-05, PARENT-11 | Recap block renders when populated, copy-to-clipboard works |

### Phase 6 — Silent State Machines

| Journey | Flows Covered | Key Assertions |
|---------|---------------|----------------|
| J-18: Saved profile deleted → ProfileProvider auto-fallback to owner | (none — matrix entry only) | Set `activeProfileId` to a non-existent id in storageState, reload, assert `parent-gateway` renders (not crash), assert `activeProfileId` now equals owner id in follow-up query |

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

0. **Step 0 (blocking):** complete 0.1–0.4 — testIDs instrumented, DOM audit recorded, Clerk testing token provisioned, seed + reset endpoints confirmed
1. Install `@playwright/test`, create `playwright.config.ts` (port 19006, `webServer.reuseExistingServer: true`, `runId`-based prefix)
2. Implement `globalSetup` (invoke `POST /v1/__test/seed` per scenario) + `auth.setup.ts` for both Clerk sessions (solo-learner, owner-with-children) + `globalTeardown` (reset by prefix)
3. J-01 through J-03 (smoke — prove infra works)
4. J-04 through J-07 (role transitions — the primary blind spot)
5. W-01 through W-05 (web-specific regressions)
6. J-08 through J-17 (remaining journeys, phased)
7. J-18 (silent state machine — auto-fallback)
8. Wire into CI — see §"CI Integration"

## CI Integration

The suite must have a defined home, a runtime budget, and a merge-gate role, or it will rot.

| Property | Value |
|---|---|
| Runner | GitHub Actions, separate workflow file `.github/workflows/e2e-web.yml` |
| Trigger | On PR to `main`, `develop`, or `improvements`; on manual `workflow_dispatch` |
| Environment | Against `api-stg.mentomate.com` (staging) with scoped `TEST_SEED_SECRET` + `CLERK_TESTING_TOKEN` from Doppler |
| Parallelism | Playwright `workers: 4` — per-run `runId` prefix keeps workers from colliding |
| Budget | Smoke (J-01 to J-03): under 2 min. Full suite: under 12 min. If either regresses 25%, open an issue. |
| Merge gate | **Smoke only** blocks PR merges in Phase 1. Full suite is informational until flake rate <2% over 50 consecutive runs, then promoted to required. |
| Artifacts | Playwright HTML report, trace viewer traces for failures, screenshots on failure — uploaded to GH Actions artifacts, 14-day retention |
| Flake policy | Any test flaking 2+ times in 7 days is auto-quarantined (`test.fixme`) and an issue is filed. No green-by-retry. |
| Teardown verification | Post-job step asserts `POST /v1/__test/reset?prefix=integ-playwright-${runId}-` returned a non-zero delete count (proves the suite actually cleaned up) |

## Open Questions / Deferred

- **POM (Page Object Model) or not?** 17 journeys is below the threshold where POM usually pays off. Start inline; refactor to POMs if duplication crosses ~3× in helpers.
- **Visual regression?** Explicitly out of scope for v1. Destination assertions catch *wrong screen*; visual regression would add CSS-level coverage but costs baseline maintenance. Revisit after suite stabilizes.
- **Mobile viewport coverage?** User tests on Galaxy S10e (5.8"). Add `devices['Pixel 5']` viewport to a Phase 7 smoke pass once Phase 1–5 are stable.
- **Does `/__test/reset` accept a `prefix` parameter today?** Must be confirmed in Step 0.4 — if not, extend the endpoint first.

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| `testID` not forwarded to DOM by some RN components | **Step 0.2 blocks Phase 1** — full DOM audit recorded in `e2e-web/testid-audit.md`. Fallback to `getByRole`/`getByText` only for components marked ⚠️ in the audit. |
| Clerk auth on web may behave differently | **Step 0.3 blocks Phase 1** — `CLERK_TESTING_TOKEN` provisioned in Doppler `stg` and wired into `auth.setup.ts`. Not a "may need" — a committed path. |
| Expo web Metro bundler slow cold start (~18s) | `webServer.reuseExistingServer: true`, port pinned to 19006, first page load timeout 60s. |
| LLM-dependent flows (chat, quiz generation) non-deterministic | Build a shared `mockLLMEndpoints(page, fixtures)` helper in `helpers/` — every test that asserts flow beyond a single LLM call calls it. Assert UI shape, not content. |
| Some native-only components won't render on web | Audit produces an explicit out-of-scope list (TTS playback, camera capture, native haptics). Note in test as `test.skip` with a link to the audit entry. |
| Staging DB is shared with other agents / manual QA | `runId` prefix on every account. `/__test/reset?prefix=` keeps isolation. Never call `/__test/reset` without a prefix. |
| Seeded real Clerk users accumulate in Clerk's user count | Teardown includes Clerk user deletion via admin API, not just DB row removal. If `/__test/reset` doesn't do this, extend it. |
| Port 8081 collision with native Metro | Web pinned to **19006**; `webServer.command` checks port is free or kills stale Metro first. |
| Multi-context test (J-13) races or deadlocks | Explicit `await page.waitForResponse()` at every inter-context sync point. No `sleep`. |
