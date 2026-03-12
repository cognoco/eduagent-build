# EduAgent — E2E Tech Spec

**Type:** Implementation Specification
**Date:** 2026-02-22
**Status:** Active (Phases 1-5 implemented, nightly validation in progress)
**Companion:** `docs/e2e-testing-strategy.md` (strategy & rationale)

---

## 1. Scope

This spec covers the implementation of the E2E test suite defined in `e2e-testing-strategy.md`. It maps UX journeys and epics to concrete Maestro flows and API integration tests, defines the seeding/auth infrastructure, and provides flow-by-flow specifications with testID selectors.

### What This Spec Covers

| Area | Details |
|------|---------|
| **Maestro flows** | 54 test flows + 18 setup helpers (72 YAML files total) |
| **Test data seeding** | API seeding endpoint + `seed-and-run.sh` shell wrapper |
| **Authentication** | ADB-automated app lifecycle + Maestro sign-in |
| **API integration tests** | 15 integration suites covering all critical chains |
| **Nx integration** | Mobile `e2e` target, `nx affected` support |
| **CI gaps** | EAS dev build caching, Expo dev server in emulator |

### What This Spec Does NOT Cover

- Language learning journey (deferred to v1.1, Epic 6)
- iOS CI testing (macOS runners deferred per strategy)
- Network condition simulation (post-MVP)
- Real device testing (emulator-only at MVP)

---

## 2. Infrastructure — Test Data Seeding

### 2.1 Test Seeding API Endpoint

**Problem:** Most Maestro flows require an authenticated user with pre-existing data (subjects, sessions, retention cards). Maestro is a black-box tool — it cannot call JavaScript setup functions. All state must be established through API calls or a dedicated seeding endpoint.

**Solution:** Add a test-only seeding controller guarded by `NODE_ENV=test`.

**Routes:**
- `POST /v1/__test/seed` — Create a pre-configured test scenario
- `POST /v1/__test/reset` — Delete seed-created data
- `GET /v1/__test/scenarios` — List valid scenario names
- `GET /v1/__test/debug/:email` — Trace account → profiles → subjects chain for an email
- `GET /v1/__test/debug-subjects/:clerkUserId` — Simulate exact subjects query path the app uses

**Location:** `apps/api/src/routes/test-seed.ts`

**Seed Scenarios** (each returns credentials + IDs needed by flows):

| Scenario Key | Creates | Used By Flows |
|-------------|---------|---------------|
| `onboarding-complete` | User with completed onboarding, 1 subject + curriculum | Account, settings, profile flows |
| `onboarding-no-subject` | User with completed onboarding, 0 subjects | Empty-first-user edge case flow |
| `learning-active` | User + subject + active learning sessions | Learning, session flows |
| `trial-active` | User on active trial period | Subscription, billing flows |
| `trial-expired` | User with expired trial | Trial expiry flows |
| `trial-expired-child` | Child profile with expired trial | Paywall, subscription flows |
| `parent-with-children` | Parent profile + linked child profiles + sessions | Parent dashboard, child detail flows |
| `parent-solo` | Parent profile without linked children | Parent onboarding flows |
| `retention-due` | User + subject + topics with due retention cards | Retention, recall review flows |
| `failed-recall-3x` | User + topic with 3+ failed recall tests | Failed recall remediation flows |
| `consent-withdrawn` | Parent+child with withdrawn GDPR consent | Consent management flows (multi-profile) |
| `consent-withdrawn-solo` | Single learner profile with withdrawn consent | Consent-withdrawn-gate flow (single-profile) |
| `multi-subject` | User + 3 subjects (various states) | Multi-subject management flows |
| `homework-ready` | User + subject configured for homework | Homework help flows |

**Request shape:**

```typescript
// POST /v1/__test/seed
{
  scenario: 'with-subject',
  overrides?: {
    email?: string,
    subjectName?: string,
    // scenario-specific overrides
  }
}
```

**Response shape:**

```typescript
{
  userId: string,
  profileId: string,
  email: string,
  password: string, // test password for Maestro sign-in
  subjectId?: string,
  sessionIds?: string[],
  // scenario-specific IDs
}
```

**Guard:** Route registered ONLY when `NODE_ENV === 'test'`. Production builds exclude this file entirely via conditional import.

**Route:** `POST /v1/__test/reset`
Truncates all user-created data. Used between flow runs in CI for isolation.

### 2.2 Test Runner Architecture (v3 — ADB Automation)

> **Note:** The original design used Maestro's `runScript` with GraalJS to call the seed API. This was blocked by Issue 13 (`__maestro` undefined in sub-flows). The architecture evolved through 3 iterations — see `docs/e2e-testing-strategy.md` Section 7 for the full evolution. The current v3 approach uses a shell wrapper with full ADB automation.

**Entry point:** `apps/mobile/e2e/scripts/seed-and-run.sh`

```
seed-and-run.sh (bash)
  ├── ADB: pm clear → pm grant → am start     (clear state, launch app)
  ├── ADB: am force-stop com.android.bluetooth (BUG-21: prevent dialog)
  ├── ADB: uiautomator dump polling            (wait for launcher, 120s)
  ├── ADB: input tap <parsed 8081 bounds>      (tap Metro server entry)
  ├── ADB: sleep + KEYCODE_BACK + verify loop  (dismiss Continue, 5min)
  ├── ADB: KEYCODE_BACK if "Reload" visible    (dismiss dev tools sheet)
  ├── API: curl POST /v1/__test/seed           (seed test data)
  ├── JSON: node -e parse response             (extract credentials)
  └── exec: maestro test -e EMAIL=... flow.yaml (run Maestro with env vars)
```

**Usage:**
```bash
./seed-and-run.sh onboarding-complete flows/account/settings-toggles.yaml
./seed-and-run.sh retention-due flows/retention/recall-review.yaml --debug-output
```

**Setup flows in `_setup/` (18 helpers):**

```
apps/mobile/e2e/flows/_setup/
  seed-and-sign-in.yaml      # Wait for sign-in screen, enter creds, wait for home
  sign-in-only.yaml          # Minimal sign-in — no post-auth navigation (edge cases: 0-subjects, consent-withdrawn)
  sign-out.yaml              # Sign out via More tab
  launch-devclient.yaml      # Launch app + connect to Metro (standalone flows)
  switch-to-parent.yaml      # More → "Parent (Light)" → parent dashboard
  dismiss-anr.yaml           # Tap "Wait" on ANR dialog
  dismiss-bluetooth.yaml     # Tap "Close app" on Bluetooth crash dialog (BUG-21)
  dismiss-devtools.yaml      # Press Back to dismiss dev tools sheet (BUG-14)
  dismiss-notifications.yaml # Tap "Allow" on notification permission dialog (BUG-22)
  dismiss-post-approval.yaml # Dismiss PostApprovalLanding screen
  return-to-home.yaml        # Navigate back to home screen
  return-to-home-safe.yaml   # Navigate back to home (with safety checks)
  connect-server.yaml        # Connect to Metro dev server
  nav-to-sign-in.yaml        # Navigate to sign-in screen
  launch-expogo.yaml         # Launch via Expo Go (pre-dev-client)
  tap-metro-server.yaml      # Tap 8081 Metro entry
  tap-metro-8081.yaml        # Tap 8081 Metro entry (alternate)
  tap-metro-8082.yaml        # Tap 8082 bundle proxy entry (BUG-7 workaround)
```

**`_setup/seed-and-sign-in.yaml`** (current):

```yaml
# By the time Maestro starts, seed-and-run.sh has already:
#   1. Cleared state + launched app via ADB
#   2. Navigated dev-client launcher + dismissed overlays via ADB
#   3. Seeded test data via API
# Maestro env vars: ${EMAIL}, ${PASSWORD}, ${ACCOUNT_ID}, ${PROFILE_ID}, etc.
appId: com.mentomate.app
---
- extendedWaitUntil:
    visible:
      text: "Welcome back"
    timeout: 120000

- tapOn:
    id: "sign-in-email"
- inputText: ${EMAIL}

# BUG-20: tap heading to dismiss keyboard (hideKeyboard fails on some configs)
- tapOn:
    text: "Welcome back"

- tapOn:
    id: "sign-in-password"
- inputText: ${PASSWORD}

- tapOn:
    text: "Welcome back"

- extendedWaitUntil:
    visible:
      id: "sign-in-button"
    timeout: 10000

- tapOn:
    id: "sign-in-button"

- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 30000

# BUG-22 safety net: dismiss notification permission dialog
- runFlow:
    when:
      visible: "send you notifications"
    file: dismiss-notifications.yaml
```

### 2.3 Shell Wrapper Details

**`apps/mobile/e2e/scripts/seed-and-run.sh`** handles seeding and Maestro invocation:

```bash
# Usage: ./seed-and-run.sh <scenario> <flow-file> [maestro-args...]
# Environment: API_URL, EMAIL, MAESTRO_PATH, METRO_URL, ADB_PATH

# 1. ADB automation (clear → launch → launcher → Metro → bundle → Continue)
# 2. Seed via API:
SEED_RESPONSE=$(curl -sf -X POST "${API_URL}/v1/__test/seed" \
  -H "Content-Type: application/json" \
  -d "{\"scenario\":\"${SCENARIO}\",\"email\":\"${EMAIL}\"}")

# 3. Parse JSON with Node.js (no jq on Windows):
SEED_EMAIL=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).email)" "$SEED_RESPONSE")
SEED_PASSWORD=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).password)" "$SEED_RESPONSE")

# 4. Run Maestro with credentials as env vars:
exec maestro test -e "EMAIL=${SEED_EMAIL}" -e "PASSWORD=${SEED_PASSWORD}" ... "${FLOW_FILE}"
```

> **Note:** `scripts/seed.js` (GraalJS) still exists but is unused — kept for reference. The shell wrapper replaced it due to Issue 13 (Maestro `runScript` `__maestro` undefined in sub-flows).

---

## 3. Maestro Flow Specifications

### 3.1 Selector Strategy

**Priority order:**
1. `testID` props (most stable): `id: "sign-in-button"`
2. `tabBarAccessibilityLabel` for tab navigation: `tapOn: "Learning Book Tab"` — maps to Android `contentDescription`, bypasses dev-client tab truncation (BUG-10) and position shifting
3. Accessibility labels: `label: "Sign in"`
4. Text content (fallback): `text: "Welcome back"`

**Tab navigation pattern (critical for dev-client):**
Dev-client builds show hidden Expo Router tabs (BUG-10), causing label truncation and position shifts. **Never use point-tap or text matching for tabs.** Instead:
```yaml
# GOOD — matches contentDescription, works regardless of tab count
- tapOn: "Learning Book Tab"
- tapOn: "Home Tab"
- tapOn: "More Tab"

# BAD — breaks when dev-client shows extra tabs
- tapOn:
    point: "50%,97%"
- tapOn:
    text: "Learning Book"
```
These labels are set via `tabBarAccessibilityLabel` in `(learner)/_layout.tsx` and `(parent)/_layout.tsx`.

**Existing testID coverage:** 214 testIDs across 42 component files. Key selectors per screen:

| Screen | Key testIDs | File |
|--------|------------|------|
| Sign In | `sign-in-email`, `sign-in-password`, `sign-in-button`, `google-sso-button` | `(auth)/sign-in.tsx` |
| Sign Up | `sign-up-email`, `sign-up-password`, `sign-up-button` | `(auth)/sign-up.tsx` |
| Forgot Password | `forgot-email`, `forgot-submit` | `(auth)/forgot-password.tsx` |
| Home | `home-scroll-view`, `coaching-card`, `coaching-card-primary`, `add-subject-button`, `subject-card-*` | `(learner)/home.tsx` |
| Create Subject | `create-subject-name`, `create-subject-submit` | `create-subject.tsx` |
| Create Profile | `profile-name-input`, `profile-age-input`, `profile-persona-*`, `profile-submit` | `create-profile.tsx` |
| Consent | `parent-email-input`, `consent-submit`, `consent-skip` | `consent.tsx` |
| Profiles | `profile-card-*`, `add-profile-button` | `profiles.tsx` |
| Chat/Session | `chat-input`, `send-button` | `ChatShell.tsx` |
| Session Summary | `summary-score`, `summary-topics`, `summary-next`, `summary-close` | `session-summary/[sessionId].tsx` |
| Coaching Card | `coaching-card-primary`, `coaching-card-secondary` | `BaseCoachingCard.tsx` |
| Curriculum Review | `curriculum-topic-*`, `curriculum-start-button`, `curriculum-skip` | `onboarding/curriculum-review.tsx` |
| Learning Book | `book-topic-list`, `book-filter-tabs`, `subject-filter-tabs` | `(learner)/book.tsx` (flattened from `book/index.tsx` — directory routes break tab bar labels in dev-client) |
| Topic Detail | `topic-summary`, `topic-retention`, `topic-review-btn`, `topic-relearn-btn` | `(learner)/topic/[topicId].tsx` |
| Relearn | `relearn-method-same`, `relearn-method-different`, `relearn-start`, `relearn-explain` | `(learner)/topic/relearn.tsx` |
| Homework Camera | Multiple camera testIDs (24 total) | `(learner)/homework/camera.tsx` |
| Parent Dashboard | `dashboard-children-list`, `dashboard-child-card`, `dashboard-summary` | `(parent)/dashboard.tsx` |
| Parent Child Detail | `child-subjects`, `child-sessions`, `child-retention` | `(parent)/child/[profileId]/index.tsx` |
| Delete Account | `delete-confirm`, `delete-cancel`, `delete-reason`, `delete-password` | `delete-account.tsx` |
| More (Learner) | `more-settings`, `more-profile`, `more-notifications`, `more-subscription` | `(learner)/more.tsx` |
| Profile Switcher | `profile-switcher`, `profile-option-*` | `ProfileSwitcher.tsx` |

### 3.2 testIDs Needed (Gaps)

The following screens/components need `testID` props added before flows can target them:

| Component | Missing testIDs | Priority | Status |
|-----------|----------------|----------|--------|
| `RecallCheckScreen` | `recall-test-screen` (wrapper), `recall-messages` (via ChatShell `messagesTestID`). Uses `chat-input` + `send-button` from ChatShell. | Tier 1 (Retention flow) | **DONE** |
| `RetentionSignal` | `retention-signal-{status}` (e.g., `retention-signal-strong`, `retention-signal-fading`) | Tier 1 | **DONE** |
| `TopicDetailScreen` retention section | `retention-card` (retention info card) | Tier 1 | **DONE** |
| `ChatShell` | `chat-messages` (default) or custom via `messagesTestID` prop | Tier 1 | **DONE** |
| Interleaved session components | `interleaved-topic-*`, `interleaved-answer` | Tier 2 | Pending |
| Subscription/billing screens | `subscribe-button`, `plan-card-*`, `trial-banner` | Tier 2 | Pending |
| Streak display | `streak-count`, `streak-badge` | Tier 2 | Pending |

> **Action:** Add remaining Tier 2 testIDs as part of each flow's implementation story.

---

### 3.3 Tier 1: Smoke Flows (PR-level)

#### Flow S1: Onboarding — Sign-Up to First Subject

**Journey:** UX Journey 1 (Onboarding)
**Epics:** Epic 0 (FR1-FR9), Epic 1 (FR13)
**Expands:** existing `app-launch.yaml` + `create-subject.yaml`
**Tag:** `smoke, onboarding`

```
Step                              Selector / Action                   Assertion
─────────────────────────────────────────────────────────────────────────────────
1. Launch app (clear state)       launchApp: clearState: true
2. Auth gate visible              assertVisible: "Welcome back"
3. Navigate to sign-up            tapOn: "Sign up"
4. Sign-up screen visible         assertVisible: "Create your account"
5. Enter email                    tapOn: id: sign-up-email
                                  inputText: test-{uuid}@example.com
6. Enter password                 tapOn: id: sign-up-password
                                  inputText: TestPass123!
7. Submit sign-up                 tapOn: id: sign-up-button
8. Profile creation visible       assertVisible: id: profile-name-input       OR redirect to home
9. Enter profile name             tapOn: id: profile-name-input
                                  inputText: "Test Learner"
10. Select age/persona            tapOn: id: profile-persona-learner
11. Submit profile                tapOn: id: profile-submit
12. Home screen reached           assertVisible: "Ready to learn"
13. Add subject                   tapOn: id: add-subject-button
14. Subject modal visible         assertVisible: "What would you like to learn?"
15. Enter subject name            tapOn: id: create-subject-name
                                  inputText: "Mathematics"
16. Submit subject                tapOn: id: create-subject-submit
17. Interview screen reached      assertVisible: "Interview"
18. Screenshot                    takeScreenshot: onboarding-complete
```

**Notes:**
- Steps 7-11 depend on Clerk test mode configuration. If Clerk doesn't allow programmatic sign-up in test builds, use the seed endpoint + sign-in instead.
- Consent flow (FR7-FR9) requires a child profile with age 11-15. Create a separate variant: `onboarding-consent.yaml` (Tier 2).

---

#### Flow S2: First Session — Interview to Coaching Card

**Journey:** UX Journey 1 → 2 transition
**Epics:** Epic 1 (FR14-FR16)
**Expands:** existing `create-subject.yaml`
**Tag:** `smoke, learning`
**Prerequisite:** Seeded user with 1 subject (scenario: `with-subject`)

```
Step                              Selector / Action                   Assertion
─────────────────────────────────────────────────────────────────────────────────
1. Seed & sign in                 runFlow: _setup/seed-and-sign-in.yaml
                                  env: SEED_SCENARIO=with-subject
2. Home screen visible            assertVisible: "Ready to learn"
3. Coaching card present          assertVisible: id: coaching-card
4. Coaching card has content      assertVisible: id: coaching-card-primary
5. Tap primary action             tapOn: id: coaching-card-primary
6. Session screen loads           assertVisible: id: chat-input
                                  timeout: 10000
7. AI opening message visible     assertVisible: id: chat-input              (session loaded)
8. Send a message                 tapOn: id: chat-input
                                  inputText: "I want to learn the basics"
9. Tap send                       tapOn: id: send-button
10. AI responds                   assertVisible: id: chat-input
                                  timeout: 15000                             (streaming done)
11. Screenshot                    takeScreenshot: first-session-started
```

---

#### Flow S3: Core Learning — Session to Summary

**Journey:** UX Journey 2 (Daily Learning Loop)
**Epics:** Epic 2 (FR23-FR26, FR41)
**Expands:** existing `start-session.yaml`
**Tag:** `smoke, learning`
**Prerequisite:** Seeded user with subject + coaching card (scenario: `with-subject`)

```
Step                              Selector / Action                   Assertion
─────────────────────────────────────────────────────────────────────────────────
1. Seed & sign in                 runFlow: _setup/seed-and-sign-in.yaml
                                  env: SEED_SCENARIO=with-subject
2. Home screen                    assertVisible: "Ready to learn"
3. Start session                  tapOn: id: coaching-card-primary
4. Session active                 assertVisible: id: chat-input
5. Exchange 1: user question      inputText: "Explain the concept to me"
                                  tapOn: id: send-button
6. Wait for AI response           assertVisible: id: chat-input, timeout: 15000
7. Exchange 2: follow-up          inputText: "Can you give me an example?"
                                  tapOn: id: send-button
8. Wait for response              assertVisible: id: chat-input, timeout: 15000
9. Exchange 3: clarification      inputText: "I think I understand, let me try"
                                  tapOn: id: send-button
10. Wait for response             assertVisible: id: chat-input, timeout: 15000
11. Session close (if auto)       OR manually close session
12. Summary screen                assertVisible: id: summary-score
                                  OR assertVisible: "Session complete"
13. Summary content               assertVisible: id: summary-topics
14. Close summary                 tapOn: id: summary-close
15. Back to home                  assertVisible: "Ready to learn"
16. Screenshot                    takeScreenshot: core-learning-complete
```

**Notes:**
- Session close may require waiting for the AI to initiate close (session cap) or manually triggering close. The exact mechanism depends on exchange count vs. time cap implementation.
- Step 12: If session close doesn't trigger automatically after 3 exchanges, the flow should navigate back and verify the session summary is accessible via the session history.

---

#### Flow S4: Retention — Recall Prompt to Score

**Journey:** UX Journey 2 (recall phase)
**Epics:** Epic 3 (FR43, FR48, FR49)
**Tag:** `smoke, retention`
**Prerequisite:** Seeded user with completed sessions + due retention cards (scenario: `with-sessions`)

```
Step                              Selector / Action                   Assertion
─────────────────────────────────────────────────────────────────────────────────
1. Seed & sign in                 runFlow: _setup/seed-and-sign-in.yaml
                                  env: SEED_SCENARIO=with-sessions
2. Home screen                    assertVisible: "Ready to learn"
3. Coaching card shows recall     assertVisible: text containing "fading" OR "review"
                                  (coaching card adapts to due retention)
4. Tap recall action              tapOn: id: coaching-card-primary
                                  OR tapOn: text: "Review"
5. Recall screen loads            assertVisible: id: recall-question
                                  OR assertVisible: text: "What do you remember"
6. Enter recall answer            tapOn: id: recall-answer-input
                                  inputText: "I remember the key concept is..."
7. Submit answer                  tapOn: id: recall-submit
8. Score/feedback visible         assertVisible: text containing "score" OR "retention"
9. Next review scheduled          assertVisible: text containing "next" OR "come back"
10. Return to home                tapOn: back OR assertVisible: "Ready to learn"
11. Screenshot                    takeScreenshot: retention-recall-complete
```

**Notes:**
- This flow has the most uncertainty — the exact UI for recall prompts/answers depends on implementation. testIDs will need to be added to recall-related screens.
- The seed scenario must create retention cards with `nextReviewAt` in the past so they appear as "due."

---

### 3.4 Tier 2: Nightly Flows

#### Flow N1: Assessment Cycle

**Journey:** UX Journey 2 (assessment phase)
**Epics:** Epic 3 (FR43-FR51)
**Tag:** `full, assessment`
**Prerequisite:** `with-sessions` scenario

```
Steps (high-level):
1. Sign in with seeded user who has completed topics
2. Navigate to a topic with pending assessment
3. Take recall test (answer correctly)
4. AI asks for reasoning explanation
5. AI asks transfer question (apply to new context)
6. XP awarded (pending status)
7. Verify delayed recall schedule created
8. Assert: topic shows "verified" or XP pending state
```

---

#### Flow N2: Failed Recall Remediation

**Epics:** Epic 3 (FR52-FR58)
**Tag:** `full, remediation`
**Prerequisite:** `with-failures` scenario

```
Steps (high-level):
1. Sign in with user who has 3+ recall failures on a topic
2. Topic shows "Blocked" or "Needs relearning" status
3. Navigate to Learning Book → topic detail
4. See previous scores, "Your Words" summary, decay status
5. Choose "Relearn Topic"
6. Choose "Different method" (id: relearn-method-different)
7. AI asks what would help (id: relearn-explain)
8. Enter preference, start relearn session
9. Verify new session created with different method flag
```

---

#### Flow N3: Homework Help

**Journey:** UX Journey 4 (Homework Help)
**Epics:** Epic 2 (FR30-FR33), UX-1, UX-2, UX-3
**Tag:** `full, homework`
**Prerequisite:** `homework-ready` scenario

```
Steps (high-level):
1. Sign in with seeded user
2. Navigate to homework mode (tap homework entry point)
3. Camera screen opens (id: homework-camera-*)
4. Skip camera (type input fallback) — camera testing is device-dependent
5. Type a homework question
6. AI responds with Socratic guidance (not direct answer)
7. Exchange 2-3 messages following Parallel Example pattern
8. Session marked as "guided" in close
9. Recall bridge offered after completion
```

**Notes:**
- Camera capture is not testable in emulator (no physical camera). The flow should test the "type input" fallback path.
- The camera UI itself (24 testIDs) can be tested via a separate visual-only flow that opens the camera screen and verifies UI elements exist.

---

#### Flow N4: Parent Dashboard

**Journey:** UX Journey 3 (Parent Oversight)
**Epics:** Epic 4 (FR67-FR76)
**Tag:** `full, parent`
**Prerequisite:** `parent-with-child` scenario

```
Steps (high-level):
1. Sign in as PARENT user
2. Dashboard screen loads (id: dashboard-children-list)
3. Child card visible with summary (id: dashboard-child-card)
4. Traffic light indicators visible (retention signals)
5. Tap child card → drill down to child detail (id: child-subjects)
6. Subject visible with session count
7. Tap subject → topic list with retention bars
8. Navigate back to dashboard
9. Verify notification settings accessible
```

---

#### Flow N5: Multi-Subject Management

**Epics:** Epic 4 (FR77-FR85)
**Tag:** `full, subjects`
**Prerequisite:** `multi-subject` scenario

```
Steps (high-level):
1. Sign in with user who has 3 subjects
2. Home shows active subjects with progress
3. Navigate to Learning Book
4. Subject filter tabs visible (id: subject-filter-tabs)
5. Switch between subjects
6. Navigate to More → find subject management
7. Pause a subject
8. Verify subject hidden from home, visible in book
9. Restore paused subject
10. Verify auto-archived subject visible in settings
```

---

#### Flow N6: Subscription Lifecycle

**Epics:** Epic 5 (FR108-FR117)
**Tag:** `full, billing`
**Prerequisite:** `trial-user` scenario

```
Steps (high-level):
1. Sign in with trial user (day 12 of 14)
2. Trial banner visible with days remaining
3. Navigate to More → Subscription
4. Subscription status visible (trial, days left)
5. Tap upgrade → Stripe checkout (verify redirect)
6. Verify quota display visible
```

**Notes:**
- Stripe checkout is an external web view — Maestro cannot interact with it. Test up to the redirect, then verify return state with a separately seeded "subscribed" user.

---

#### Flow N7: Account Lifecycle (GDPR)

**Epics:** Epic 0 (FR11-FR12)
**Tag:** `full, gdpr`
**Prerequisite:** `fresh-user` scenario (or `with-subject` — needs data to delete)

```
Steps (high-level):
1. Sign in with seeded user
2. Navigate to More → Delete Account (id: delete-account)
3. Delete account screen visible
4. Confirm deletion intent (id: delete-confirm)
5. Enter password or confirm (id: delete-password)
6. Grace period message visible ("7-day grace period")
7. Cancel deletion (id: delete-cancel) — verify account still active
8. Re-initiate deletion
9. Verify confirmation message
```

---

#### Flow N8: Adaptive Teaching

**Epics:** Epic 3 (FR59-FR66)
**Tag:** `full, adaptive`
**Prerequisite:** `with-sessions` scenario

```
Steps (high-level):
1. Sign in with seeded user
2. Start a learning session
3. Provide 3 wrong answers in sequence
4. AI switches to direct instruction (no more Socratic)
5. AI explains with examples
6. Session close marks topic as "Needs Deepening"
7. Navigate to Learning Book → verify "Needs Deepening" section
8. Verify topic appears in Needs Deepening filter
```

**Notes:**
- This flow depends on LLM behavior — the AI must actually switch modes after 3 wrong answers. This may require a test-mode LLM that follows the three-strike rule predictably. Consider using a deterministic mock LLM in CI.

---

## 4. API Integration Tests — Expansion Plan

### 4.1 Existing Tests (3)

| Test File | Coverage |
|-----------|----------|
| `auth-chain.integration.test.ts` | Auth middleware, JWT validation |
| `health-cors.integration.test.ts` | Health endpoint, CORS headers |
| `onboarding.integration.test.ts` | Register → profile → consent flow |

### 4.2 New Integration Tests Needed

| Test File | Coverage | Priority |
|-----------|----------|----------|
| `learning-session.integration.test.ts` | Create session → exchange messages → close → summary | High |
| `retention-lifecycle.integration.test.ts` | SM-2 calculation → recall test → score → next review | High |
| `inngest-session-completed.integration.test.ts` | Session completed chain (SM-2 → coaching card → dashboard → embeddings) | High |
| `homework.integration.test.ts` | Homework session → OCR stub → Socratic response → guided close | Medium |
| `parent-dashboard.integration.test.ts` | Family link → child sessions → dashboard aggregation | Medium |
| `billing-lifecycle.integration.test.ts` | Trial → subscription → quota → metering | Medium |
| `subject-management.integration.test.ts` | Create → pause → archive → auto-archive → restore | Low |
| `account-deletion.integration.test.ts` | Deletion request → grace period → cancel → execute | Low |
| `inngest-trial-expiry.integration.test.ts` | Trial expiry warning → expiration → access gating | Low |

### 4.3 Inngest Chain Tests

Use `inngest/test` mode for event-driven chains:

```typescript
// tests/integration/inngest-session-completed.integration.test.ts
import { inngest } from '../../apps/api/src/inngest/client';

test('session.completed → SM-2 + coaching card + dashboard + embeddings', async () => {
  // Seed: user + subject + session with exchanges
  const { profileId, sessionId } = await seedScenario('with-sessions');

  const { result } = await inngest.test(
    'app/session.completed',
    { sessionId, profileId }
  );

  expect(result.steps).toContain('update-sm2-schedule');
  expect(result.steps).toContain('write-coaching-card');
  expect(result.steps).toContain('update-dashboard');
  expect(result.steps).toContain('generate-embeddings');
});
```

---

## 5. Nx Integration

### 5.1 Mobile E2E Target

Add to `apps/mobile/project.json` (create if it doesn't exist as an Nx target override):

```jsonc
// nx.json targetDefaults or apps/mobile project.json
{
  "e2e": {
    "executor": "nx:run-commands",
    "options": {
      "command": "maestro test e2e/flows/",
      "cwd": "apps/mobile"
    },
    "configurations": {
      "smoke": {
        "command": "maestro test e2e/flows/ --include-tags=smoke"
      }
    }
  }
}
```

### 5.2 Affected Support

Update `nx.json` to include E2E in the affected graph:

```jsonc
{
  "targetDefaults": {
    "e2e": {
      "dependsOn": ["build"],
      "inputs": [
        "{projectRoot}/e2e/**",
        "{projectRoot}/src/**",
        "{workspaceRoot}/packages/schemas/src/**"
      ]
    }
  }
}
```

---

## 6. CI Enhancements

### 6.1 Current CI Gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| No Expo dev server in emulator job | Maestro can't launch app without Metro | Add `npx expo start --android` step before Maestro |
| No EAS dev build cache | Every CI run rebuilds the APK | Cache EAS dev build artifact between runs |
| No test data seeding in CI | Flows requiring auth fail | Deploy seed endpoint + call before Maestro |
| No API running for mobile tests | Flows making API calls fail | Start API server in mobile-maestro job |

### 6.2 Updated CI Workflow

The `mobile-maestro` job needs these additions:

```yaml
# In e2e-ci.yml, mobile-maestro job:
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: eduagent
      POSTGRES_PASSWORD: eduagent
      POSTGRES_DB: tests
    ports:
      - 5432:5432

steps:
  # ... existing setup steps ...

  - name: Apply database schema
    run: pnpm --filter @eduagent/database db:push
    env:
      DATABASE_URL: postgresql://eduagent:eduagent@localhost:5432/tests

  - name: Start API server (background)
    run: |
      NODE_ENV=test pnpm exec nx dev api &
      sleep 5  # Wait for server to start
    env:
      DATABASE_URL: postgresql://eduagent:eduagent@localhost:5432/tests

  - name: Build and start Expo (background)
    run: |
      pnpm exec nx start mobile &
      sleep 10  # Wait for Metro bundler

  - name: Run Maestro smoke tests
    uses: reactivecircus/android-emulator-runner@v2
    with:
      api-level: 34
      arch: x86_64
      script: |
        # Each flow is run via seed-and-run.sh which handles:
        # ADB app lifecycle + API seeding + Maestro invocation
        cd apps/mobile/e2e
        ./scripts/seed-and-run.sh onboarding-complete flows/account/settings-toggles.yaml
        ./scripts/seed-and-run.sh learning-active flows/learning/core-learning.yaml
        # ... etc
    env:
      API_URL: http://10.0.2.2:8787
```

---

## 7. File Structure (Current State)

```
apps/
  api/
    src/
      routes/
        test-seed.ts              # POST /v1/__test/seed (14 scenarios)
      services/
        test-seed.ts              # Seeding logic with @eduagent/factory
  mobile/
    e2e/
      config.yaml
      scripts/
        seed.js                   # (legacy, unused — replaced by seed-and-run.sh)
        seed-and-run.sh           # Entry point: ADB automation + seed + Maestro
        run-all-untested.sh       # Batch runner for all untested flows
        rerun-failed.sh           # Retry runner for failed flows
      flows/
        _setup/                   # 18 setup helpers
          seed-and-sign-in.yaml   # Wait for sign-in screen, enter creds, wait for home
          sign-out.yaml           # Sign out via More tab
          launch-devclient.yaml   # Launch app + connect Metro (standalone flows)
          switch-to-parent.yaml   # More → Parent theme → parent dashboard
          dismiss-anr.yaml        # Tap "Wait" on ANR dialog
          dismiss-bluetooth.yaml  # Tap "Close app" on Bluetooth dialog (BUG-21)
          dismiss-devtools.yaml   # Press Back to dismiss dev tools (BUG-14)
          dismiss-notifications.yaml # Tap "Allow" on notification dialog (BUG-22)
          tap-metro-server.yaml   # Tap 8081 Metro entry
          tap-metro-8082.yaml     # Tap 8082 bundle proxy entry (BUG-7)
        account/                  # Account management flows
        billing/                  # Subscription/trial flows
        consent/                  # GDPR consent flows
        learning/                 # Session, homework, adaptive flows
        onboarding/               # Sign-up, subject creation, consent
        parent/                   # Parent dashboard, child detail
        retention/                # Recall review, failed recall, relearn
        subjects/                 # Multi-subject management
        standalone/               # Pre-auth flows (no seed required)
tests/
  integration/                    # 15 API integration test suites
    auth-chain.integration.test.ts
    health-cors.integration.test.ts
    onboarding.integration.test.ts
    learning-session.integration.test.ts
    retention-lifecycle.integration.test.ts
    session-completed-chain.integration.test.ts
    stripe-webhook.integration.test.ts
    account-deletion.integration.test.ts
    profile-isolation.integration.test.ts
    test-seed.integration.test.ts
    jest.config.cjs
    setup.ts
    mocks.ts
```

**Flow inventory:** 54 unique test flows + 18 setup helpers = 72 YAML files total.

---

## 8. Implementation Sequence

Ordered by dependency chain and value. Status as of 2026-03-10:

### Phase 1: Foundation — **DONE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Seed endpoint (`/v1/__test/seed`) | **DONE** | 10 scenarios implemented |
| 1.2 | Reset endpoint (`/v1/__test/reset`) | **DONE** | Truncates user data |
| 1.3 | `seed-and-run.sh` shell wrapper | **DONE** | Replaced `seed.js` (Issue 13 workaround) |
| 1.4 | `_setup/seed-and-sign-in.yaml` | **DONE** | v3: sign-in only (ADB handles lifecycle) |
| 1.5 | Mobile `e2e` Nx target | **DONE** | `nx.json` + `project.json` |
| 1.6 | Verify flows on emulator | **DONE** | 16 flows confirmed passing |

### Phase 2: Tier 1 Smoke Flows — **DONE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1-2.6 | All 4 Tier 1 smoke flows | **DONE** | Written and tagged |
| — | testIDs for recall/retention | **DONE** | Added to all screens |

### Phase 3: CI Integration — **DONE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | PostgreSQL + API in CI | **DONE** | `e2e-ci.yml` with service container |
| 3.2 | Expo dev server in CI | **DONE** | Background startup + health check |
| 3.3 | CI validation | **DONE** | Advisory mode (`continue-on-error: true`) |

### Phase 4: API Integration Expansion — **DONE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1-4.3 | All integration tests | **DONE** | 15 suites, all passing |

### Phase 5: Tier 2 Nightly Flows — **NEAR COMPLETE**

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | All seed scenarios | **DONE** | 14 scenarios in `test-seed.ts` |
| 5.2 | All Tier 2 flows | **DONE** | 54 flows written |
| 5.3 | ADB automation (seed-and-run.sh v3) | **DONE** | Full lifecycle via ADB |
| 5.4 | BUG-25: profileScope middleware fix | **DONE** | Auto-resolve owner profile when X-Profile-Id absent (commit `35ef433`) |
| 5.5 | BUG-10/BUG-30: tab navigation fix | **DONE** | Flattened book route, added `tabBarAccessibilityLabel`, updated 7 flows. Also fixed BUG-24 (KAV), BUG-29 (dashboard), BUG-32 (scroll) |
| 5.6 | seed-and-run.sh v3 bugfixes | **DONE** | Session 9: fixed 3 bugs — `set -euo pipefail` crash on grep pipeline, dev-tools Close button (added `input tap` fallback), grep pipeline `set -e` interaction |
| 5.7 | BUG-31 verification | **DONE** | Session 9: `useProfiles()` auth guard fix verified working via Maestro sign-in flow |
| 5.8 | BUG-34/BUG-35 fixes | **DONE** | BUG-34 fixed (PR #72: subjects added to seed). BUG-35 workaround (pressKey: Enter). BUG-33 fixed (Session 11). |
| 5.9 | BUG-49/50/51 fixes (Session 15) | **DONE** | Maestro text matching patterns (testID selectors), consent-withdrawn-solo seed, sign-in-only.yaml |
| 5.10 | Emulator validation | **NEAR COMPLETE** | 43/53 passing (81%). 3 LLM-dependent, 1 needs custom sign-in, 4 need launch-devclient, 1 partial, 1 deferred |
| 5.11 | Nightly scheduled CI workflow | **TODO** | Awaiting LLM mock mode for deterministic CI runs |

---

## 9. Acceptance Criteria

### Phase 1 Complete When: **DONE**
- [x] `POST /v1/__test/seed` returns credentials for 10 scenarios
- [x] `POST /v1/__test/reset` truncates all user data
- [x] `seed-and-run.sh` seeds via API + launches Maestro with env vars
- [x] `_setup/seed-and-sign-in.yaml` authenticates via UI with seeded credentials
- [x] `pnpm exec nx run mobile:e2e` works (Nx target exists)
- [x] 16 Maestro flows pass on local Android emulator (WHPX)

### Phase 2 Complete When: **DONE**
- [x] All 4 Tier 1 smoke flows written and tagged
- [x] Each flow tagged with `smoke` + domain tag
- [x] Each flow uses `seed-and-run.sh` for seeding + authentication
- [x] testIDs added to all recall/retention/session screens

### Phase 3 Complete When: **DONE**
- [x] `e2e-ci.yml` mobile-maestro job runs with PostgreSQL + API server
- [x] Advisory mode enabled (`continue-on-error: true`)
- [ ] CI Android emulator validation *(deferred: needs self-hosted runner for WHPX)*

### Phase 4 Complete When: **DONE**
- [x] 15 API integration test suites passing
- [x] `pnpm exec nx run api:test:integration` runs all integration tests

### Phase 5 Complete When: **NEAR COMPLETE**
- [x] All 54 test flows written (8 Tier 2 + 46 additional)
- [x] 18 setup helper flows created
- [x] `seed-and-run.sh` v3 with full ADB automation
- [x] 14 seed scenarios in `test-seed.ts`
- [x] BUG-31 fixed — `useProfiles()` auth guard (Session 8, verified Session 9)
- [x] BUG-33 fixed — SVG + Fabric crash (Session 11)
- [x] BUG-34 fixed — onboarding-complete seed (PR #72)
- [x] BUG-35 workaround — `pressKey: Enter` for ChatShell (PR #72)
- [x] BUG-49 fixed — Maestro text matching patterns (Session 15: testID selectors)
- [x] BUG-50 fixed — consent-withdrawn multi-profile (Session 15: `consent-withdrawn-solo` seed)
- [x] BUG-51 fixed — empty-first-user (Session 15: `sign-in-only.yaml`)
- [x] 43/53 flows validated on emulator (81% pass rate, Session 15)
- [x] SSE streaming fixed — `streamSSEViaXHR()` replaces `parseSSEStream()` for React Native (Session 16)
- [x] session-summary flow passes end-to-end (Session 16)
- [x] 44/53 flows validated on emulator (83% pass rate, Session 16)
- [ ] 2 LLM-dependent flows need re-test (analogy-preference-flow, curriculum-review-flow — may now pass with streaming fix)
- [ ] 1 flow needs custom sign-in mechanism (child-paywall — BUG-52 fix ready, awaiting re-test)
- [ ] 4 flows need `launch-devclient.yaml` mechanism (coppa-flow, profile-creation-consent, consent-pending-gate, sign-up-flow)
- [ ] Nightly scheduled workflow runs in CI
- [ ] Flake rate <5% over 5 consecutive nightly runs

### Current Blockers (as of Session 16, 2026-03-12)
| Bug | Severity | Flows Blocked | Fix Status |
|-----|----------|---------------|------------|
| ~~LLM connectivity~~ | ~~High~~ | ~~3 flows~~ | **FIXED (Session 16)** — Root cause: React Native Hermes `fetch` returns `response.body = null` (no ReadableStream). Fix: `streamSSEViaXHR()` using XMLHttpRequest `onprogress`. session-summary passes; analogy-preference and curriculum-review need re-test. |
| child-paywall sign-in | Medium | 1 flow | Fixed (BUG-52: `switch-to-child.yaml`), awaiting re-test on emulator. |
| launch-devclient.yaml | Medium | 4 flows (pre-auth flows) | Open — these flows need app launch without prior seed (sign-up, COPPA, consent-pending). Need ADB-only launch mechanism without seed. |
| BUG-18 (settings-toggles partial) | Low | 1 flow partial | Known — camera/storage permissions toggle requires native permission dialog handling |
| BUG-53 (missing icons) | Low | 0 flows | Open — Ionicons font not loading on emulator. Visual only, no E2E impact. |

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Clerk test mode doesn't support programmatic sign-up | Medium | High (blocks S1) | Use seed endpoint to create Clerk test users via Clerk Backend API. Test sign-in only in Maestro (skip UI sign-up). |
| LLM responses non-deterministic in E2E | High | Medium (flaky flows) | Use deterministic mock LLM in CI (`NODE_ENV=test` → fixed responses). Real LLM only in local runs. |
| Android emulator boot time in CI >3min | Medium | Low (time, not correctness) | Cache emulator system images. Use `reactivecircus/android-emulator-runner` with snapshot. |
| Expo dev build in CI is slow | Medium | Medium (CI time) | Cache EAS dev build artifact. Only rebuild when `apps/mobile/` changes. |
| Maestro can't interact with Stripe checkout | Certain | Low (known limitation) | Test up to redirect. Verify post-payment state with separately seeded user. |
| Retention flow timing (next review in future) | Medium | Medium (flow can't verify) | Seed with `nextReviewAt` in the past. Override SM-2 interval in test mode. |

---

## 11. Dependencies on Existing Code

| Dependency | Status | Action Needed |
|-----------|--------|---------------|
| `@eduagent/factory` builders | Exists | Add new builders for seed scenarios |
| Clerk Backend API (test user creation) | Available | Implement in seed endpoint |
| `inngest/test` mode | Available (v3) | Import and configure in integration tests |
| Hono `app.request()` | Used in existing tests | No change |
| React Native `testID` props | 214 exist across 42 files | Add ~15 more for retention/billing screens |
| `NODE_ENV` conditional routing | Partially exists | Add route guard for `/v1/__test/*` |
