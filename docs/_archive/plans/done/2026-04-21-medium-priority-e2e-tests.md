# Medium Priority E2E Test Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Maestro E2E coverage for 11 screens across 4 feature groups that currently have unit tests only: progress analytics (3), parent child reports (2+empty), mentor memory (2), and onboarding extras (3).

**Architecture:** Two-phase approach. Phase 2 uses existing seed scenarios to cover 7 screens immediately (navigation + empty/minimal states). Phase 3 adds new seed scenarios + testIDs for the remaining 4 screens and data-rich happy paths. All tests run against the real app with real seeded data — zero mocks.

**Tech Stack:** Maestro (YAML flows), bash `seed-and-run.sh`, Hono `/__test/seed` endpoint, Android emulator

---

## File Structure

### New E2E flow files (Phase 2)

| File | Screens covered | Seed scenario |
|------|----------------|---------------|
| `apps/mobile/e2e/flows/progress/progress-analytics.yaml` | Progress index, progress detail, milestones | `learning-active` |
| `apps/mobile/e2e/flows/parent/child-reports-empty.yaml` | Reports list (empty state) | `parent-multi-child` |
| `apps/mobile/e2e/flows/account/learner-mentor-memory.yaml` | Learner mentor memory | `onboarding-complete` |
| `apps/mobile/e2e/flows/parent/child-mentor-memory.yaml` | Parent mentor memory | `parent-multi-child` |
| `apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml` | Language picker (settings path) | `onboarding-complete` |

### New E2E flow files (Phase 3)

| File | Screens covered | Seed scenario |
|------|----------------|---------------|
| `apps/mobile/e2e/flows/onboarding/onboarding-extras-flow.yaml` | Pronouns, interests-context | `onboarding-no-language` (new) |
| `apps/mobile/e2e/flows/progress/vocabulary-browser.yaml` | Vocabulary browser | `language-subject-active` (new) |
| `apps/mobile/e2e/flows/parent/child-report-detail.yaml` | Report detail | `parent-with-reports` (new) |
| `apps/mobile/e2e/flows/parent/child-mentor-memory-populated.yaml` | Parent mentor memory (with data) | `mentor-memory-populated` (new) |
| `apps/mobile/e2e/flows/account/learner-mentor-memory-populated.yaml` | Learner mentor memory (with data) | `mentor-memory-populated` (new) |

### Modified source files (Phase 3 only)

| File | Change |
|------|--------|
| `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx` | Add testIDs to hero card, metric cards, highlights, next steps, subject breakdown |
| `apps/api/src/services/test-seed.ts` | Add 4 new seed scenarios |

---

## Important: Dashboard & Library testID Drift

Two testIDs referenced in older E2E flows no longer exist:

- **`parent-dashboard-summary-primary`** — removed during dashboard refactor. The child card is now `ParentDashboardSummary` → `BaseCoachingCard` with testID `dashboard-child-${profileId}`. The "View details" button is `dashboard-child-${profileId}-primary`. For `parent-multi-child`, use env var `CHILD1_PROFILE_ID`; for seeds returning `childProfileId`, use `CHILD_PROFILE_ID`.

- **`add-subject-button`** — removed from the home screen. The library screen now has `library-add-subject` (when subjects exist) and `library-add-subject-empty` (empty state). Navigate via `"Library Tab"` first.

All flows in this plan use the corrected testIDs.

---

## Phase 2: Quick Coverage with Existing Seeds

These 5 tasks use existing seed scenarios and require zero source code changes.
They get us from 0% to 64% E2E coverage for the medium-priority screens (7 of 11).

---

### Task 1: Progress Analytics E2E Flow

Covers 3 screens: progress index → subject detail → milestones (empty state).
The vocabulary screen is NOT covered here because the vocab link only renders for language subjects, and `learning-active` seeds "World History" (not a language subject). Vocabulary coverage is in Phase 3, Task 8.

**Files:**
- Create: `apps/mobile/e2e/flows/progress/progress-analytics.yaml`

- [ ] **Step 1: Create the progress directory**

```bash
mkdir -p apps/mobile/e2e/flows/progress
```

- [ ] **Step 2: Write the Maestro flow**

```yaml
# Progress analytics — progress index, subject detail, milestones (empty state)
# Tags: nightly, progress
# Seed: learning-active (subject "World History", 3 topics, 1 active session, streak)
# Covers: progress index rendering, subject detail drill-down, milestones empty state
# Usage: ./scripts/seed-and-run.sh learning-active flows/progress/progress-analytics.yaml
appId: com.mentomate.app
tags:
  - nightly
  - progress
---
# ── Sign in ─────────────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

# ── Navigate to Progress tab ────────────────────────────────────────
- tapOn: "Progress Tab"

# Wait for progress index — the seeded subject card appears.
# Env var SUBJECT_ID comes from the learning-active seed response.
- extendedWaitUntil:
    visible:
      id: "journey-subject-${SUBJECT_ID}"
    timeout: 15000

- takeScreenshot: 01-progress-index

# ── Subject detail ──────────────────────────────────────────────────
- tapOn:
    id: "journey-subject-${SUBJECT_ID}"

- extendedWaitUntil:
    visible:
      id: "progress-subject-back"
    timeout: 10000

# ProgressBar renders for the seeded subject
- assertVisible:
    id: "progress-subject-bar"

- takeScreenshot: 02-subject-detail

# Navigate back to progress index
- tapOn:
    id: "progress-subject-back"

- extendedWaitUntil:
    visible:
      id: "progress-milestones-see-all"
    timeout: 10000

# ── Milestones ──────────────────────────────────────────────────────
# The "See all" link renders when milestonesQuery.data is truthy
# (an empty array [] is truthy). learning-active has no milestones,
# so the milestones screen will show the empty state.
- tapOn:
    id: "progress-milestones-see-all"

- extendedWaitUntil:
    visible:
      id: "milestones-back"
    timeout: 10000

# No milestones seeded → empty state
- assertVisible:
    id: "milestones-empty"

- takeScreenshot: 03-milestones-empty

# Back to progress index
- tapOn:
    id: "milestones-back"

- extendedWaitUntil:
    visible:
      id: "journey-subject-${SUBJECT_ID}"
    timeout: 10000

- takeScreenshot: 04-back-to-index
```

- [ ] **Step 3: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh learning-active flows/progress/progress-analytics.yaml
```

Expected: PASS — signs in, navigates progress index → subject detail → milestones empty → back.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/e2e/flows/progress/progress-analytics.yaml
git commit -m "test(e2e): add progress analytics flow — index, detail, milestones"
```

---

### Task 2: Parent Child Reports Empty-State E2E Flow

Covers 1 screen: reports list in its empty state. The `parent-multi-child` seed has 3 children with sessions but no report rows, so the reports screen shows the "Your first report is on its way" empty state. Report detail coverage requires a new seed (Phase 3, Task 9).

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-reports-empty.yaml`

- [ ] **Step 1: Write the Maestro flow**

```yaml
# Parent child reports — empty state (no reports generated yet)
# Tags: nightly, parent
# Seed: parent-multi-child (parent + 3 children, Emma has sessions but no reports)
# Covers: dashboard → child detail → reports list empty state + navigation
# Usage: ./scripts/seed-and-run.sh parent-multi-child flows/parent/child-reports-empty.yaml
appId: com.mentomate.app
tags:
  - nightly
  - parent
---
# ── Sign in as parent ───────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

# Parent persona lands on dashboard (not home-scroll-view)
- extendedWaitUntil:
    visible:
      id: "dashboard-scroll"
    timeout: 15000

- takeScreenshot: 01-parent-dashboard

# ── Drill into first child (Emma) ───────────────────────────────────
# BaseCoachingCard generates testID: dashboard-child-${profileId}-primary
# for the "View details" button. CHILD1_PROFILE_ID comes from the
# parent-multi-child seed response (Emma is child 1).
- tapOn:
    id: "dashboard-child-${CHILD1_PROFILE_ID}-primary"

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000

- takeScreenshot: 02-child-detail

# ── Navigate to reports ─────────────────────────────────────────────
# Scroll to find the "Learning reports" link on child detail
- scrollUntilVisible:
    element:
      id: "child-reports-link"
    direction: DOWN
    timeout: 10000

- tapOn:
    id: "child-reports-link"

# ── Reports empty state ────────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "child-reports-back"
    timeout: 10000

# No reports seeded → empty state renders
- assertVisible:
    id: "child-reports-empty"

# Empty state shows timing context ("Your first report is on its way")
- assertVisible:
    id: "child-reports-empty-time-context"

# CTA button exists (navigate to child progress)
- assertVisible:
    id: "child-reports-empty-progress"

- takeScreenshot: 03-reports-empty-state

# ── Navigate back ───────────────────────────────────────────────────
- tapOn:
    id: "child-reports-back"

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000

- takeScreenshot: 04-back-to-child-detail
```

- [ ] **Step 2: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh parent-multi-child flows/parent/child-reports-empty.yaml
```

Expected: PASS — parent signs in → dashboard → child detail → reports empty state → back.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/e2e/flows/parent/child-reports-empty.yaml
git commit -m "test(e2e): add parent child reports empty-state flow"
```

---

### Task 3: Learner Mentor Memory E2E Flow

Covers 1 screen: the learner's "What My Mentor Knows" screen in its empty state. The `onboarding-complete` seed has a learner profile with no memory data, so the all-empty hero renders. The memory status toggle and controls are verified.

**Files:**
- Create: `apps/mobile/e2e/flows/account/learner-mentor-memory.yaml`

- [ ] **Step 1: Write the Maestro flow**

```yaml
# Learner mentor memory — empty state and controls
# Tags: nightly, account
# Seed: onboarding-complete (learner profile, no memory data)
# Covers: More → mentor memory screen, empty hero, status toggle, back navigation
# Usage: ./scripts/seed-and-run.sh onboarding-complete flows/account/learner-mentor-memory.yaml
appId: com.mentomate.app
tags:
  - nightly
  - account
---
# ── Sign in ─────────────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── Navigate to More tab ────────────────────────────────────────────
- tapOn: "More Tab"

# Wait for settings screen — sign-out button is always present
- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000

# ── Find and tap "What My Mentor Knows" ─────────────────────────────
# NOTE: This navigates to the LEARNER view at /(app)/mentor-memory.tsx —
# distinct from the PARENT view at /(app)/child/[profileId]/mentor-memory.tsx
# tested in Task 4.
# SettingsRow uses accessibilityLabel={label} so text match works.
# The row is in the Account section, may need scroll.
- scrollUntilVisible:
    element:
      text: "What My Mentor Knows"
    direction: DOWN
    timeout: 10000

- tapOn: "What My Mentor Knows"

# ── Mentor memory empty state ───────────────────────────────────────
# No memory data seeded → all-empty hero renders
- extendedWaitUntil:
    visible:
      id: "mentor-memory-all-empty"
    timeout: 10000

- takeScreenshot: 01-mentor-memory-empty

# Memory status text is present (shows consent status)
- assertVisible:
    id: "memory-status-text"

- takeScreenshot: 02-mentor-memory-status

# ── Navigate back ───────────────────────────────────────────────────
- pressKey: back

- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000

- takeScreenshot: 03-back-to-more
```

- [ ] **Step 2: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh onboarding-complete flows/account/learner-mentor-memory.yaml
```

Expected: PASS — signs in → More tab → mentor memory empty state → back.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/e2e/flows/account/learner-mentor-memory.yaml
git commit -m "test(e2e): add learner mentor memory empty-state flow"
```

---

### Task 4: Parent Mentor Memory E2E Flow

Covers 1 screen: the parent view of a child's mentor memory. `parent-multi-child` seed has children but no memory data, so the empty state ("No learning observations yet") renders. Verifies controls (toggle switches) and the "Something else is wrong?" correction input.

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-mentor-memory.yaml`

- [ ] **Step 1: Write the Maestro flow**

```yaml
# Parent child mentor memory — empty state and controls
# Tags: nightly, parent
# Seed: parent-multi-child (parent + 3 children, no memory data)
# Covers: dashboard → child detail → mentor memory empty state, controls, correction input
# Usage: ./scripts/seed-and-run.sh parent-multi-child flows/parent/child-mentor-memory.yaml
appId: com.mentomate.app
tags:
  - nightly
  - parent
---
# ── Sign in as parent ───────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

# Parent persona lands on dashboard
- extendedWaitUntil:
    visible:
      id: "dashboard-scroll"
    timeout: 15000

# ── Drill into first child (Emma) ───────────────────────────────────
# NOTE: This is the PARENT view of mentor memory at
# /(app)/child/[profileId]/mentor-memory.tsx — distinct from the
# LEARNER view at /(app)/mentor-memory.tsx tested in Task 3.
- tapOn:
    id: "dashboard-child-${CHILD1_PROFILE_ID}-primary"

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000

# ── Navigate to mentor memory ───────────────────────────────────────
# Scroll to find the mentor-memory-link on child detail
- scrollUntilVisible:
    element:
      id: "mentor-memory-link"
    direction: DOWN
    timeout: 10000

- tapOn:
    id: "mentor-memory-link"

# ── Mentor memory empty state ───────────────────────────────────────
# No memory data seeded → "No learning observations yet."
- extendedWaitUntil:
    visible:
      text: "No learning observations yet."
    timeout: 10000

- takeScreenshot: 01-parent-mentor-memory-empty

# ── Scroll to verify controls and correction input ──────────────────
- scrollUntilVisible:
    element:
      id: "something-wrong-button"
    direction: DOWN
    timeout: 10000

- takeScreenshot: 02-controls-section

# Tap "Something else is wrong?" to expand correction input
- tapOn:
    id: "something-wrong-button"

- extendedWaitUntil:
    visible:
      id: "correction-input"
    timeout: 5000

- takeScreenshot: 03-correction-input-expanded

# ── Navigate back ───────────────────────────────────────────────────
- pressKey: back

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000

- takeScreenshot: 04-back-to-child-detail
```

- [ ] **Step 2: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh parent-multi-child flows/parent/child-mentor-memory.yaml
```

Expected: PASS — parent signs in → dashboard → child detail → mentor memory empty state → correction input → back.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/e2e/flows/parent/child-mentor-memory.yaml
git commit -m "test(e2e): add parent child mentor memory empty-state flow"
```

---

### Task 5: Language Picker Settings Edit E2E Flow

Covers 1 screen: the language picker accessed from Settings (the `returnTo=settings` path). The `onboarding-complete` seed has a learner with `conversationLanguage` already set, so we're testing the "change language" flow, not the onboarding flow.

Pronouns and interests-context are NOT accessible from Settings — they only appear during onboarding. Those are covered in Phase 3, Task 7.

**Files:**
- Create: `apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml`

- [ ] **Step 1: Write the Maestro flow**

```yaml
# Language picker via Settings — edit tutor language from More screen
# Tags: nightly, onboarding
# Seed: onboarding-complete (learner with conversationLanguage already set)
# Covers: More → tutor language → language picker, select, save, return
# Usage: ./scripts/seed-and-run.sh onboarding-complete flows/onboarding/settings-language-edit.yaml
appId: com.mentomate.app
tags:
  - nightly
  - onboarding
---
# ── Sign in ─────────────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── Navigate to More tab ────────────────────────────────────────────
- tapOn: "More Tab"

- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000

# ── Find and tap "Tutor language" setting ───────────────────────────
# SettingsRow renders label as both Text content and accessibilityLabel.
- scrollUntilVisible:
    element:
      text: "Tutor language"
    direction: DOWN
    timeout: 10000

- tapOn: "Tutor language"

# ── Language picker screen ──────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "language-picker-continue"
    timeout: 10000

# Settings path shows the Cancel button (onboarding path does not)
- assertVisible:
    id: "language-picker-cancel"

# The "Don't see your language?" hint is present
- assertVisible:
    id: "language-picker-other-hint"

- takeScreenshot: 01-language-picker-settings-path

# ── Select a different language ─────────────────────────────────────
# Select Czech to change from the default
- tapOn:
    id: "language-option-cs"

- takeScreenshot: 02-czech-selected

# ── Save and return to More screen ──────────────────────────────────
- tapOn:
    id: "language-picker-continue"

# After save, the picker navigates back to the More screen
- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000

- takeScreenshot: 03-back-to-more-after-save

# ── Verify: re-enter picker shows the saved language ────────────────
- scrollUntilVisible:
    element:
      text: "Tutor language"
    direction: DOWN
    timeout: 10000

- tapOn: "Tutor language"

- extendedWaitUntil:
    visible:
      id: "language-picker-continue"
    timeout: 10000

# Czech should still be selected after re-opening
- takeScreenshot: 04-czech-persisted

# Cancel to go back without changing
- tapOn:
    id: "language-picker-cancel"

- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000
```

- [ ] **Step 2: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh onboarding-complete flows/onboarding/settings-language-edit.yaml
```

Expected: PASS — signs in → More → tutor language → picker → select Czech → save → re-enter → Czech persisted → cancel.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml
git commit -m "test(e2e): add language picker settings edit flow"
```

---

## Phase 3: Full Coverage — New Seeds + Data-Rich Flows

These tasks require new seed scenarios and (for Task 6) testID additions.
They cover the remaining 4 screens and add data-rich paths for previously-covered screens.

**Before starting Phase 3**, read the database schema to understand the tables for:
- Reports: `packages/database/src/schema/` — look for `childReports` / `weeklyReports` or similar
- Milestones: check if `milestones` is a table or computed from session/topic data
- Vocabulary: check `vocabulary` table structure and CEFR level fields
- Mentor memory / learner profile: check which columns store interests, strengths, struggles, learningStyle, communicationNotes, suppressedInferences

Use `apps/api/src/services/test-seed.ts` as the template for new scenarios — follow the exact pattern of existing scenarios (insert into tables via `db.insert(tableName).values(...)`, return `ids` object).

---

### Task 6: Add testIDs to Report Detail Screen

The report detail screen (`apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx`) currently has only 3 testIDs: `child-report-back`, `child-report-gone`, `child-report-gone-back`. The data-rendering elements have none, making E2E assertions impossible.

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx`

- [ ] **Step 1: Add testID to MetricCard component**

In the `MetricCard` function (line 12), add `testID` prop:

```tsx
function MetricCard({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}): React.ReactElement {
  return (
    <View className="bg-background rounded-card p-4 flex-1" testID={testID}>
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Add testIDs to the hero card and metric card instances**

Add `testID="child-report-hero"` to the hero coaching card View (line 90):

```tsx
<View className="bg-coaching-card rounded-card p-5 mt-4" testID="child-report-hero">
```

Add testIDs to the four MetricCard instances (lines 104-126):

```tsx
<MetricCard
  label="Sessions"
  value={String(report.reportData.thisMonth.totalSessions)}
  testID="child-report-metric-sessions"
/>
<MetricCard
  label="Active minutes"
  value={String(report.reportData.thisMonth.totalActiveMinutes)}
  testID="child-report-metric-minutes"
/>
```

```tsx
<MetricCard
  label="Topics mastered"
  value={String(report.reportData.thisMonth.topicsMastered)}
  testID="child-report-metric-topics"
/>
<MetricCard
  label="Total words"
  value={String(report.reportData.thisMonth.vocabularyTotal)}
  testID="child-report-metric-words"
/>
```

- [ ] **Step 3: Add testIDs to highlights, next steps, and subject breakdown**

Highlights card wrapper (line 129):

```tsx
<View className="bg-surface rounded-card p-4 mt-4" testID="child-report-highlights">
```

Next steps card wrapper (line 147):

```tsx
<View className="bg-surface rounded-card p-4 mt-4" testID="child-report-next-steps">
```

Subject breakdown card wrapper (line 164):

```tsx
<View className="bg-surface rounded-card p-4 mt-4" testID="child-report-subjects">
```

- [ ] **Step 4: Run related tests and typecheck**

```bash
cd apps/mobile
pnpm exec tsc --noEmit
```

Note: this screen has no unit tests, so only typecheck verifies the changes.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx"
git commit -m "feat(mobile): add testIDs to report detail screen for E2E coverage"
```

---

### Task 7: Seed `onboarding-no-language` + Onboarding Extras Flow

Covers 2 screens: pronouns and interests-context. These only appear during the onboarding funnel when creating a subject, and only if:
- The profile has no `conversationLanguage` set (triggers language picker → pronouns)
- The interview extracts interest labels (triggers interests-context)

**Seed scenario:** `onboarding-no-language` — same as `onboarding-complete` but with `conversationLanguage: null` on the profile. This ensures adding a subject triggers the language picker → pronouns → interview chain.

**Interests-context caveat:** This screen only appears if the LLM interview extracts interests from the student's response. This makes it non-deterministic in E2E. Two approaches:
1. Mark the interests-context assertions as `optional: true` (pragmatic)
2. Seed a mock interview response that includes interests (requires API changes)

Recommended: approach 1 for now, track interests-context as a known gap.

**Files:**
- Modify: `apps/api/src/services/test-seed.ts` — add `onboarding-no-language` scenario
- Create: `apps/mobile/e2e/flows/onboarding/onboarding-extras-flow.yaml`

- [ ] **Step 1: Read the existing `onboarding-complete` scenario in test-seed.ts**

Find the `onboarding-complete` case and understand how it creates the profile. The new scenario is identical but sets `conversationLanguage: null`.

- [ ] **Step 2: Add the `onboarding-no-language` scenario**

In `apps/api/src/services/test-seed.ts`, add a new case inside the scenario switch. Copy the `onboarding-complete` case but change the profile insert to set `conversationLanguage: null`:

```typescript
case 'onboarding-no-language': {
  // Same as onboarding-complete but conversationLanguage is null,
  // so adding a subject triggers the language picker → pronouns chain.
  // ... (copy onboarding-complete body, change conversationLanguage to null)
  break;
}
```

Return the same `ids` shape as `onboarding-complete`.

- [ ] **Step 3: Write the Maestro flow**

```yaml
# Onboarding extras — language picker, pronouns during subject creation
# Tags: nightly, onboarding
# Seed: onboarding-no-language (profile with null conversationLanguage)
# Covers: language picker (onboarding path), pronouns screen
# Note: interests-context is non-deterministic (depends on LLM output) — marked optional
# Usage: ./scripts/seed-and-run.sh onboarding-no-language flows/onboarding/onboarding-extras-flow.yaml
appId: com.mentomate.app
tags:
  - nightly
  - onboarding
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── Trigger subject creation via Library tab ────────────────────────
# add-subject-button was removed from home. Use library-add-subject
# on the Library tab instead.
- tapOn: "Library Tab"

- extendedWaitUntil:
    visible:
      id: "library-add-subject"
    timeout: 10000

- tapOn:
    id: "library-add-subject"

- extendedWaitUntil:
    visible:
      id: "create-subject-name"
    timeout: 10000

- tapOn:
    id: "create-subject-name"
- inputText: "European History"
- tapOn:
    id: "create-subject-submit"

# ── Language picker (onboarding path) ───────────────────────────────
# conversationLanguage is null → language picker appears before interview
- extendedWaitUntil:
    visible:
      id: "language-picker-continue"
    timeout: 15000

# No cancel button in onboarding path (only in settings path)
- takeScreenshot: 01-language-picker-onboarding

# Select English
- tapOn:
    id: "language-option-en"

- tapOn:
    id: "language-picker-continue"

# ── Pronouns screen ────────────────────────────────────────────────
# Appears after language picker for users aged 13+.
# onboarding-no-language seed has age 17, so pronouns renders.
- extendedWaitUntil:
    visible:
      id: "pronouns-continue"
    timeout: 10000

# Verify all preset options are visible
- assertVisible:
    id: "pronouns-option-she-her"
- assertVisible:
    id: "pronouns-option-he-him"
- assertVisible:
    id: "pronouns-option-they-them"
- assertVisible:
    id: "pronouns-option-other"

# Skip button is present
- assertVisible:
    id: "pronouns-skip"

- takeScreenshot: 02-pronouns-screen

# Select "they/them" and continue
- tapOn:
    id: "pronouns-option-they-them"

- tapOn:
    id: "pronouns-continue"

# ── Interview screen ────────────────────────────────────────────────
# After pronouns, the interview screen loads (chat-input visible)
- extendedWaitUntil:
    visible:
      id: "chat-input"
    timeout: 15000

- takeScreenshot: 03-interview-reached

# We've verified the language picker → pronouns → interview chain.
# interests-context only appears if the LLM extracts interests from the
# interview response, which is non-deterministic. Stop here.
```

- [ ] **Step 4: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh onboarding-no-language flows/onboarding/onboarding-extras-flow.yaml
```

Expected: PASS — signs in → add subject → language picker → pronouns → interview.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/test-seed.ts
git add apps/mobile/e2e/flows/onboarding/onboarding-extras-flow.yaml
git commit -m "test(e2e): add onboarding extras flow — language picker + pronouns"
```

---

### Task 8: Seed `language-subject-active` + Vocabulary Browser Flow

Covers 1 screen: vocabulary browser. The vocabulary link on the progress index only renders for subjects with `four_strands` pedagogy (language subjects). No existing seed creates a language subject.

**Seed scenario:** `language-subject-active` — a learner with a language subject (pedagogy: `four_strands`), at least 5 completed sessions, and vocabulary data (words with CEFR levels).

**Files:**
- Modify: `apps/api/src/services/test-seed.ts` — add `language-subject-active` scenario
- Create: `apps/mobile/e2e/flows/progress/vocabulary-browser.yaml`

- [ ] **Step 1: Read the database schema for vocabulary**

Check `packages/database/src/schema/` for the vocabulary table structure. Understand what fields are needed: word, definition, CEFR level, subject association, etc.

- [ ] **Step 2: Add the `language-subject-active` scenario**

In `apps/api/src/services/test-seed.ts`, create a scenario that:
1. Creates an account + learner profile (age 17)
2. Creates a subject with `pedagogyMode: 'four_strands'` (e.g., "Spanish")
3. Creates 5+ completed sessions
4. Inserts vocabulary rows with CEFR levels (A1, A2, B1 mix)
5. Returns `ids: { subjectId }`

- [ ] **Step 3: Write the Maestro flow**

```yaml
# Vocabulary browser — navigate from progress index to vocabulary screen
# Tags: nightly, progress
# Seed: language-subject-active (language subject with vocabulary data)
# Covers: progress index vocab link → vocabulary browser with CEFR breakdown
# Usage: ./scripts/seed-and-run.sh language-subject-active flows/progress/vocabulary-browser.yaml
appId: com.mentomate.app
tags:
  - nightly
  - progress
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

# Navigate to Progress tab
- tapOn: "Progress Tab"

- extendedWaitUntil:
    visible:
      id: "journey-subject-${SUBJECT_ID}"
    timeout: 15000

# ── Vocabulary link ─────────────────────────────────────────────────
# The vocab stat pill renders because this is a four_strands subject.
- scrollUntilVisible:
    element:
      id: "progress-vocab-stat"
    direction: DOWN
    timeout: 10000

- tapOn:
    id: "progress-vocab-stat"

# ── Vocabulary browser screen ───────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "vocab-browser-back"
    timeout: 10000

- takeScreenshot: 01-vocabulary-browser

# Navigate back
- tapOn:
    id: "vocab-browser-back"

- extendedWaitUntil:
    visible:
      id: "journey-subject-${SUBJECT_ID}"
    timeout: 10000

- takeScreenshot: 02-back-to-progress
```

- [ ] **Step 4: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh language-subject-active flows/progress/vocabulary-browser.yaml
```

Expected: PASS — signs in → Progress tab → vocab stat link → vocabulary browser → back.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/test-seed.ts
git add apps/mobile/e2e/flows/progress/vocabulary-browser.yaml
git commit -m "test(e2e): add vocabulary browser flow with language-subject seed"
```

---

### Task 9: Seed `parent-with-reports` + Report Detail Flow

Covers 1 screen: report detail. Requires seeded report data so the reports list shows real cards and we can drill into a report.

**Seed scenario:** `parent-with-reports` — extends `parent-with-children` with monthly report rows for the child. The seed must insert into the reports table (check schema in Step 1) with realistic `reportData` JSON.

**Files:**
- Modify: `apps/api/src/services/test-seed.ts` — add `parent-with-reports` scenario
- Create: `apps/mobile/e2e/flows/parent/child-report-detail.yaml`

**Prerequisite:** Task 6 (Report Detail testIDs) must be completed first.

- [ ] **Step 1: Read the database schema for reports**

Check `packages/database/src/schema/` for the child reports table. Understand the `reportData` JSON structure: `month`, `childName`, `headlineStat`, `thisMonth`, `highlights`, `nextSteps`, `subjects`.

- [ ] **Step 2: Add the `parent-with-reports` scenario**

In `apps/api/src/services/test-seed.ts`, create a scenario that:
1. Creates parent + child (same as `parent-with-children`)
2. Inserts a child report with `reportData` containing:
   - `month: "March 2026"`, `childName: "Test Teen"`
   - `headlineStat: { value: "12", label: "Topics mastered", comparison: "Up from 8 last month" }`
   - `thisMonth: { totalSessions: 15, totalActiveMinutes: 180, topicsMastered: 12, vocabularyTotal: 45 }`
   - `highlights: ["Completed the geometry unit", "Consistent daily practice"]`
   - `nextSteps: ["Start algebra fundamentals", "Review weak areas in fractions"]`
   - `subjects: [{ subjectName: "Mathematics", topicsMastered: 12, vocabularyTotal: 45, activeMinutes: 180 }]`
3. Returns `ids: { parentProfileId, childProfileId, reportId }`

- [ ] **Step 3: Write the Maestro flow**

```yaml
# Parent child report detail — drill from reports list into a report
# Tags: nightly, parent
# Seed: parent-with-reports (parent + child + monthly report)
# Covers: reports list with data → report detail (hero, metrics, highlights, subjects)
# Prereq: Task 6 testIDs must be present on report detail screen
# Usage: ./scripts/seed-and-run.sh parent-with-reports flows/parent/child-report-detail.yaml
appId: com.mentomate.app
tags:
  - nightly
  - parent
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

# Parent dashboard
- extendedWaitUntil:
    visible:
      id: "dashboard-scroll"
    timeout: 15000

# Drill into child — parent-with-reports seed returns CHILD_PROFILE_ID
- tapOn:
    id: "dashboard-child-${CHILD_PROFILE_ID}-primary"

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000

# Navigate to reports
- scrollUntilVisible:
    element:
      id: "child-reports-link"
    direction: DOWN
    timeout: 10000

- tapOn:
    id: "child-reports-link"

# ── Reports list with data ──────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "child-reports-back"
    timeout: 10000

# Report card should be visible (not empty state)
# The card testID is report-card-${report.id}, use the seeded REPORT_ID
- assertVisible:
    id: "report-card-${REPORT_ID}"

- takeScreenshot: 01-reports-list-with-data

# Tap the report card to drill into detail
- tapOn:
    id: "report-card-${REPORT_ID}"

# ── Report detail screen ────────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "child-report-back"
    timeout: 10000

# Hero coaching card
- assertVisible:
    id: "child-report-hero"

# Metric cards
- assertVisible:
    id: "child-report-metric-sessions"

- assertVisible:
    id: "child-report-metric-minutes"

# Scroll to see more content
- scrollUntilVisible:
    element:
      id: "child-report-subjects"
    direction: DOWN
    timeout: 10000

# Highlights card
- assertVisible:
    id: "child-report-highlights"

# Next steps card
- assertVisible:
    id: "child-report-next-steps"

# Subject breakdown
- assertVisible:
    id: "child-report-subjects"

- takeScreenshot: 02-report-detail-full

# ── Navigate back ───────────────────────────────────────────────────
# IMPORTANT: Do NOT use child-report-back here — it calls
# goBackOrReplace(router, '/(app)/more') which lands on the More tab,
# not the reports list. Use Android hardware back to pop the stack.
- pressKey: back

- extendedWaitUntil:
    visible:
      id: "child-reports-back"
    timeout: 10000

- takeScreenshot: 03-back-to-reports-list
```

- [ ] **Step 4: Run the flow**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh parent-with-reports flows/parent/child-report-detail.yaml
```

Expected: PASS — parent signs in → dashboard → child detail → reports list (card visible) → report detail (hero, metrics, highlights, next steps, subjects) → back.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/test-seed.ts
git add apps/mobile/e2e/flows/parent/child-report-detail.yaml
git commit -m "test(e2e): add parent report detail flow with parent-with-reports seed"
```

---

### Task 10: Seed `mentor-memory-populated` + Populated Memory Flows

Covers 2 screens with data: learner mentor memory and parent mentor memory — both with real memory categories, interests, strengths, struggles, and communication notes populated.

**Seed scenario:** `mentor-memory-populated` — creates both a parent and a child profile (like `parent-with-children`) with populated learner profile memory fields. Check the learner profiles table/columns in the schema to understand what fields to seed: interests, strengths, struggles, learningStyle, communicationNotes, suppressedInferences, memoryConsentStatus, memoryInjectionEnabled.

**Files:**
- Modify: `apps/api/src/services/test-seed.ts` — add `mentor-memory-populated` scenario
- Create: `apps/mobile/e2e/flows/account/learner-mentor-memory-populated.yaml`
- Create: `apps/mobile/e2e/flows/parent/child-mentor-memory-populated.yaml`

- [ ] **Step 1: Read the database schema for learner profile memory fields**

Check `packages/database/src/schema/` for how interests, strengths, struggles, learningStyle, communicationNotes, and suppressedInferences are stored. They may be JSON columns on the profiles table or a separate learner_profiles table.

- [ ] **Step 2: Add the `mentor-memory-populated` scenario**

In `apps/api/src/services/test-seed.ts`, create a scenario that:
1. Creates parent + child (same as `parent-with-children`)
2. Sets child profile memory fields:
   - `memoryConsentStatus: 'granted'`
   - `memoryInjectionEnabled: true`
   - `interests: [{ label: "Soccer", context: "free_time" }, { label: "History", context: "school" }]`
   - `strengths: [{ text: "Strong critical thinking" }]`
   - `struggles: [{ text: "Difficulty with long reading passages" }]`
   - `learningStyle: "Visual learner, prefers diagrams and charts"`
   - `communicationNotes: "Responds well to encouragement"`
3. Also creates a standalone learner profile for the learner flow (or reuse the child profile by signing in as the child)
4. Returns `ids: { parentProfileId, childProfileId, subjectId }`

- [ ] **Step 3: Write the learner mentor memory populated flow**

```yaml
# Learner mentor memory — populated with real memory data
# Tags: nightly, account
# Seed: mentor-memory-populated
# Covers: mentor memory screen with interests, strengths, struggles, learning style
# Usage: ./scripts/seed-and-run.sh mentor-memory-populated flows/account/learner-mentor-memory-populated.yaml
appId: com.mentomate.app
tags:
  - nightly
  - account
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

- tapOn: "More Tab"

- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000

- scrollUntilVisible:
    element:
      text: "What My Mentor Knows"
    direction: DOWN
    timeout: 10000

- tapOn: "What My Mentor Knows"

# ── Populated mentor memory ─────────────────────────────────────────
# Memory data is seeded → all-empty hero should NOT appear
- extendedWaitUntil:
    visible:
      id: "memory-status-text"
    timeout: 10000

- takeScreenshot: 01-mentor-memory-populated

# Scroll through the memory sections to verify they rendered
- scrollUntilVisible:
    element:
      text: "Interests"
    direction: DOWN
    timeout: 10000

- takeScreenshot: 02-interests-section

- scrollUntilVisible:
    element:
      text: "Strengths"
    direction: DOWN
    timeout: 10000

- takeScreenshot: 03-strengths-section

# Navigate back
- pressKey: back

- extendedWaitUntil:
    visible:
      id: "sign-out-button"
    timeout: 10000
```

- [ ] **Step 4: Write the parent mentor memory populated flow**

```yaml
# Parent child mentor memory — populated with real memory data
# Tags: nightly, parent
# Seed: mentor-memory-populated (parent + child with populated memory)
# Covers: parent mentor memory with categories, toggle controls, correction input
# Usage: ./scripts/seed-and-run.sh mentor-memory-populated flows/parent/child-mentor-memory-populated.yaml
appId: com.mentomate.app
tags:
  - nightly
  - parent
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml

# Parent dashboard
- extendedWaitUntil:
    visible:
      id: "dashboard-scroll"
    timeout: 15000

# mentor-memory-populated seed returns CHILD_PROFILE_ID
- tapOn:
    id: "dashboard-child-${CHILD_PROFILE_ID}-primary"

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000

- scrollUntilVisible:
    element:
      id: "mentor-memory-link"
    direction: DOWN
    timeout: 10000

- tapOn:
    id: "mentor-memory-link"

# ── Populated mentor memory ─────────────────────────────────────────
# Memory data is seeded → categories should render (not empty state)
- extendedWaitUntil:
    visible:
      text: "What the mentor knows"
    timeout: 10000

- takeScreenshot: 01-parent-mentor-memory-populated

# Scroll to see memory categories
- scrollUntilVisible:
    element:
      id: "something-wrong-button"
    direction: DOWN
    timeout: 10000

- takeScreenshot: 02-memory-categories-and-controls

# Navigate back
- pressKey: back

- extendedWaitUntil:
    visible:
      id: "child-detail-scroll"
    timeout: 10000
```

- [ ] **Step 5: Run both flows**

```bash
cd apps/mobile/e2e
./scripts/seed-and-run.sh mentor-memory-populated flows/account/learner-mentor-memory-populated.yaml
./scripts/seed-and-run.sh mentor-memory-populated flows/parent/child-mentor-memory-populated.yaml
```

Expected: PASS for both — memory sections render with seeded data.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/test-seed.ts
git add apps/mobile/e2e/flows/account/learner-mentor-memory-populated.yaml
git add apps/mobile/e2e/flows/parent/child-mentor-memory-populated.yaml
git commit -m "test(e2e): add populated mentor memory flows with new seed scenario"
```

---

## Coverage Summary

| Phase | Screens covered | Coverage |
|-------|----------------|----------|
| Phase 2 (Tasks 1-5) | Progress index, progress detail, milestones, reports list (empty), learner memory (empty), parent memory (empty), language picker | 7/11 (64%) |
| Phase 3 (Tasks 6-10) | Pronouns, interests-context, vocabulary browser, report detail | +4/11 (36%) |
| **Total** | **All 11 screens** | **11/11 (100%)** |

### Known Gaps After Full Implementation

1. **Interests-context determinism:** The interests-context screen only appears when the LLM interview extracts interests. This is non-deterministic in E2E. The flow reaches the interview but can't guarantee interests-context renders. Consider a test-mode API flag that forces interests extraction.

2. **Progress with milestones data:** Phase 2 tests milestones empty state. For a data-rich milestones flow (cards rendering), investigate whether milestones are stored in a table or computed — if computed, seeding enough sessions/topics may auto-generate milestones.

3. **Weekly reports:** The reports list screen shows weekly snapshots above monthly reports (testID pattern: `weekly-report-card-${report.id}` vs `report-card-${report.id}` for monthly). The `parent-with-reports` seed in Task 9 only covers monthly reports. Add weekly report rows to the seed for full weekly section coverage.
