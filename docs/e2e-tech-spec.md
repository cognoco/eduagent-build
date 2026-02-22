# EduAgent — E2E Tech Spec

**Type:** Implementation Specification
**Date:** 2026-02-22
**Status:** Draft
**Companion:** `docs/e2e-testing-strategy.md` (strategy & rationale)

---

## 1. Scope

This spec covers the implementation of the E2E test suite defined in `e2e-testing-strategy.md`. It maps UX journeys and epics to concrete Maestro flows and API integration tests, defines the seeding/auth infrastructure, and provides flow-by-flow specifications with testID selectors.

### What This Spec Covers

| Area | Details |
|------|---------|
| **Maestro flows** | 12 flows (4 Tier 1 smoke + 8 Tier 2 nightly) with YAML specs |
| **Test data seeding** | API seeding endpoint + Maestro setup flows |
| **Authentication** | Test user auth flow for Maestro |
| **API integration tests** | Expansion of existing 3 tests to cover all critical chains |
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

**Route:** `POST /v1/__test/seed`
**Location:** `apps/api/src/routes/test-seed.ts`

**Seed Scenarios** (each returns credentials + IDs needed by flows):

| Scenario Key | Creates | Used By Flows |
|-------------|---------|---------------|
| `fresh-user` | Clerk test user (email/password), empty profile | Onboarding, Auth flows |
| `with-subject` | User + 1 subject + generated curriculum + coaching card | First Session, Core Learning |
| `with-sessions` | User + subject + 3 completed sessions + retention cards | Retention, Assessment |
| `with-failures` | User + subject + topic with 3+ failed recall tests | Failed Recall Remediation |
| `parent-with-child` | Parent profile + linked child profile + child sessions | Parent Dashboard |
| `multi-subject` | User + 3 subjects (1 active, 1 paused, 1 auto-archived) | Multi-Subject |
| `trial-user` | User on day 12 of 14-day trial | Subscription flows |
| `homework-ready` | User + subject + at least 1 session (homework mode available) | Homework Help |

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

### 2.2 Maestro Setup Flows

Maestro supports `runFlow` to compose flows. Create reusable setup flows in `_setup/`:

```
apps/mobile/e2e/flows/
  _setup/
    seed-and-sign-in.yaml     # Call seed API + sign in via UI
    sign-in-existing.yaml      # Sign in with known test credentials
    sign-out.yaml              # Sign out (clear auth state)
    navigate-to-home.yaml     # Ensure we're on home screen
```

**`_setup/seed-and-sign-in.yaml`** (template):

```yaml
# Seed test data via API, then sign in via the app UI.
# Called by other flows via: runFlow: _setup/seed-and-sign-in.yaml
#
# Environment variables (set by CI or .env.maestro):
#   SEED_SCENARIO: The seed scenario key (e.g., "with-subject")
#   API_URL: Base URL for the API (e.g., http://10.0.2.2:8787 for emulator)
appId: com.zwizzly.eduagent
---
# Step 1: Seed test data via API
- runScript:
    file: ../../scripts/seed.js
    env:
      API_URL: ${API_URL}
      SCENARIO: ${SEED_SCENARIO}
    outputVariable: seedResult

# Step 2: Launch app with clean state
- launchApp:
    clearState: true

# Step 3: Wait for auth screen
- assertVisible:
    text: "Welcome back"
    timeout: 15000

# Step 4: Sign in with seeded credentials
- tapOn:
    id: "sign-in-email"
- inputText: ${output.seedResult.email}
- tapOn:
    id: "sign-in-password"
- inputText: ${output.seedResult.password}
- tapOn:
    id: "sign-in-button"

# Step 5: Wait for home screen
- assertVisible:
    text: "Ready to learn"
    timeout: 15000
```

### 2.3 Maestro Helper Scripts

**`apps/mobile/e2e/scripts/seed.js`:**

```javascript
// Called by Maestro's runScript action.
// Calls the /v1/__test/seed endpoint and returns credentials.
const scenario = process.env.SCENARIO || 'fresh-user';
const apiUrl = process.env.API_URL || 'http://10.0.2.2:8787';

const res = await fetch(`${apiUrl}/v1/__test/seed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scenario }),
});

if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
const data = await res.json();

// Maestro captures this as outputVariable
output(JSON.stringify(data));
```

---

## 3. Maestro Flow Specifications

### 3.1 Selector Strategy

**Priority order:**
1. `testID` props (most stable): `id: "sign-in-button"`
2. Accessibility labels: `label: "Sign in"`
3. Text content (fallback): `text: "Welcome back"`

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
| Learning Book | `book-topic-list`, `book-filter-tabs`, `subject-filter-tabs` | `(learner)/book/index.tsx` |
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

| Component | Missing testIDs | Priority |
|-----------|----------------|----------|
| `RecallCheckScreen` (if exists) | `recall-question`, `recall-answer-input`, `recall-submit` | Tier 1 (Retention flow) |
| `RetentionCard` (in recall list) | `retention-card-*`, `review-now-button` | Tier 1 |
| Interleaved session components | `interleaved-topic-*`, `interleaved-answer` | Tier 2 |
| Subscription/billing screens | `subscribe-button`, `plan-card-*`, `trial-banner` | Tier 2 |
| Streak display | `streak-count`, `streak-badge` | Tier 2 |

> **Action:** Add missing testIDs as part of each flow's implementation story. Don't pre-add them all — add as needed per flow.

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
        maestro test apps/mobile/e2e/flows/ --include-tags=smoke
    env:
      API_URL: http://10.0.2.2:8787
```

---

## 7. File Structure (Target State)

```
apps/
  api/
    src/
      routes/
        test-seed.ts              # POST /v1/__test/seed + /v1/__test/reset
  mobile/
    e2e/
      config.yaml
      README.md
      scripts/
        seed.js                   # Maestro helper: call seed API
      flows/
        _setup/
          seed-and-sign-in.yaml   # Reusable: seed + authenticate
          sign-in-existing.yaml   # Reusable: sign in with known creds
          sign-out.yaml           # Reusable: clear auth state
        app-launch.yaml           # (exists) App boot + auth gate
        onboarding/
          sign-up-flow.yaml       # S1: Sign-up → profile → subject
          create-subject.yaml     # (exists) Create subject → interview
          view-curriculum.yaml    # (exists) Home nav + curriculum
          consent-flow.yaml       # N7 variant: age gate + consent
        learning/
          first-session.yaml      # S2: Coaching card → session
          core-learning.yaml      # S3: 3 exchanges → close → summary
          start-session.yaml      # (exists) Basic session start
          homework-help.yaml      # N3: Type-input homework path
          adaptive-teaching.yaml  # N8: Three-strike → direct instruction
        retention/
          recall-review.yaml      # S4: Recall prompt → score
          assessment-cycle.yaml   # N1: Full assessment chain
          failed-recall.yaml      # N2: 3+ failures → relearn
        parent/
          dashboard.yaml          # N4: Parent overview + drill-down
        subjects/
          multi-subject.yaml      # N5: Create/pause/archive/restore
        billing/
          subscription.yaml       # N6: Trial → upgrade → quota
        account/
          deletion.yaml           # N7: Delete → grace → cancel
tests/
  integration/
    auth-chain.integration.test.ts          # (exists)
    health-cors.integration.test.ts         # (exists)
    onboarding.integration.test.ts          # (exists)
    learning-session.integration.test.ts    # NEW
    retention-lifecycle.integration.test.ts # NEW
    homework.integration.test.ts            # NEW
    parent-dashboard.integration.test.ts    # NEW
    billing-lifecycle.integration.test.ts   # NEW
    subject-management.integration.test.ts  # NEW
    account-deletion.integration.test.ts    # NEW
    inngest-session-completed.integration.test.ts  # NEW
    inngest-trial-expiry.integration.test.ts       # NEW
    jest.config.cjs                         # (exists)
    setup.ts                                # (exists)
```

---

## 8. Implementation Sequence

Ordered by dependency chain and value:

### Phase 1: Foundation (Sprint 1)

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 1.1 | Create seed endpoint (`/v1/__test/seed`) | — | `routes/test-seed.ts` with `fresh-user` + `with-subject` scenarios |
| 1.2 | Create reset endpoint (`/v1/__test/reset`) | — | Same file, truncate tables |
| 1.3 | Create `seed.js` Maestro helper | 1.1 | `e2e/scripts/seed.js` |
| 1.4 | Create `_setup/seed-and-sign-in.yaml` | 1.1, 1.3 | Reusable auth setup flow |
| 1.5 | Add mobile `e2e` Nx target | — | `nx.json` or `project.json` update |
| 1.6 | Verify existing 4 flows still pass | 1.4 | Green run on local emulator |

### Phase 2: Tier 1 Smoke Flows (Sprint 1-2)

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 2.1 | Expand onboarding flow (S1) | 1.4 | `onboarding/sign-up-flow.yaml` |
| 2.2 | Write first session flow (S2) | 1.4 | `learning/first-session.yaml` |
| 2.3 | Write core learning flow (S3) | 1.4 | `learning/core-learning.yaml` |
| 2.4 | Add `with-sessions` seed scenario | 1.1 | Update `test-seed.ts` |
| 2.5 | Add testIDs to recall/retention screens | — | Component updates |
| 2.6 | Write retention flow (S4) | 2.4, 2.5 | `retention/recall-review.yaml` |

### Phase 3: CI Integration (Sprint 2)

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 3.1 | Add PostgreSQL + API to mobile-maestro CI job | — | `e2e-ci.yml` update |
| 3.2 | Add Expo dev server to CI | — | `e2e-ci.yml` update |
| 3.3 | Validate Tier 1 flows pass in CI | 2.1-2.6, 3.1-3.2 | Green CI run |

### Phase 4: API Integration Expansion (Sprint 2-3)

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 4.1 | Learning session integration test | — | `learning-session.integration.test.ts` |
| 4.2 | Retention lifecycle integration test | — | `retention-lifecycle.integration.test.ts` |
| 4.3 | Inngest session-completed chain test | — | `inngest-session-completed.integration.test.ts` |

### Phase 5: Tier 2 Nightly Flows (Sprint 3-4)

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 5.1 | Add remaining seed scenarios | 1.1 | `with-failures`, `parent-with-child`, etc. |
| 5.2 | Write Tier 2 flows (N1-N8) | 5.1 | 8 flow files |
| 5.3 | Add nightly scheduled CI workflow | 5.2 | `e2e-ci.yml` schedule trigger |
| 5.4 | Remaining API integration tests | — | 6 more test files |

---

## 9. Acceptance Criteria

### Phase 1 Complete When:
- [ ] `POST /v1/__test/seed` returns credentials for `fresh-user` and `with-subject` scenarios
- [ ] `POST /v1/__test/reset` truncates all user data
- [ ] `seed.js` successfully calls seed endpoint and returns credentials
- [ ] `_setup/seed-and-sign-in.yaml` authenticates via UI with seeded credentials
- [ ] `pnpm exec nx run mobile:e2e` works (Nx target exists)
- [ ] Existing 4 Maestro flows pass on local emulator

### Phase 2 Complete When:
- [ ] All 4 Tier 1 smoke flows pass on local emulator
- [ ] Each flow tagged with `smoke` + domain tag
- [ ] Each flow uses setup/seed for authentication (no hardcoded credentials)

### Phase 3 Complete When:
- [ ] `e2e-ci.yml` mobile-maestro job runs with PostgreSQL + API server
- [ ] Tier 1 smoke flows pass in GitHub Actions (Android emulator)
- [ ] CI time impact <12 minutes total for E2E job

### Phase 4 Complete When:
- [ ] 3 new API integration tests pass (`learning-session`, `retention-lifecycle`, `inngest-session-completed`)
- [ ] Tests use transaction rollback for isolation
- [ ] `pnpm exec nx run api:test:integration` runs all integration tests

### Phase 5 Complete When:
- [ ] All 8 Tier 2 nightly flows pass on local emulator
- [ ] Nightly scheduled workflow runs in CI
- [ ] Flake rate <5% over 5 consecutive nightly runs
- [ ] All 9 API integration tests pass

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
