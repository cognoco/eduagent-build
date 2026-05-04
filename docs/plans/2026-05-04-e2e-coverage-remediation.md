# E2E Coverage Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 17 outdated Maestro flow tests that no longer match current source, and add dedicated coverage for the 40 flows currently classified as Missing in `docs/flows/e2e-coverage-audit.md`.

**Architecture:** The work is a sequence of small, independent YAML changes against `apps/mobile/e2e/flows/`. There is no shared library to refactor and no new infrastructure. Each task touches one YAML file, can ship independently, and is verified by running the flow against the dev-client emulator. We sequence by impact: fix the outdated tests first (they currently silently pass via `optional: true` and provide false confidence), then write missing tests in priority order P1 → P4 from the audit.

**Tech Stack:** Maestro 1.x flows (YAML), `seed-and-sign-in.yaml` setup helpers, Doppler-backed seed scenarios, Android dev-client emulator. No new dependencies.

**Source-of-truth references for every task:**
- Audit: `docs/flows/e2e-coverage-audit.md`
- Inventory: `docs/flows/mobile-app-flow-inventory.md`
- TestID integrity allowlist: `apps/mobile/src/lib/__tests__/e2e-testid-integrity.test.ts`
- Existing setup helpers: `apps/mobile/e2e/flows/_setup/`

**General running command** (used in every task verification step):

```bash
cd apps/mobile
maestro test e2e/flows/<path>/<file>.yaml
```

**Convention notes** (apply to every task):
- Always seed with the appropriate `seed-and-sign-in.yaml` scenario; never assume prior state.
- Prefer `id:` over `text:` for assertions — `text:` breaks under i18n.
- Drop `optional: true` from any assertion of a testID known to exist; `optional` should only mark genuinely conditional UI.
- Take screenshots at each meaningful state change for debugging.
- Use `extendedWaitUntil` (timeout 10–15s) for screen transitions; bare `assertVisible` for static elements.

---

## Stage 1 — Fix Outdated Tests

These 17 tests assert removed testIDs or hardcoded English copy. Most pass today only because of `optional: true`. Fixing these is cheaper than writing new tests because the journey scaffolding already exists.

### Task 1.1: Fix `account/more-tab-navigation.yaml` — add Accommodation section

**Files:**
- Modify: `apps/mobile/e2e/flows/account/more-tab-navigation.yaml`
- Source of truth: `apps/mobile/src/app/(app)/more.tsx` (search for `learning-accommodation-section-header`)

**Drift:** test scrolls from `learning-mode-section-header` directly to `celebrations-section-header`, skipping the Accommodation section that commit `ea32d358` added between them.

- [ ] **Step 1: Confirm current section order in source**

```bash
grep -n "section-header" apps/mobile/src/app/(app)/more.tsx
```

Expected order: `learning-mode` → `learning-accommodation` → `mentor-memory` → `family` → `celebrations` → `notifications` → `account` → `other`.

- [ ] **Step 2: Insert Accommodation assertion in YAML**

Between the `learning-mode-section-header` and `celebrations-section-header` blocks, add:

```yaml
- scrollUntilVisible:
    element:
      id: "learning-accommodation-section-header"
    direction: DOWN
    timeout: 10000
- assertVisible:
    id: "accommodation-mode-none"
- assertVisible:
    id: "accommodation-mode-dyslexia"
- assertVisible:
    id: "accommodation-mode-adhd"
```

- [ ] **Step 3: Run flow and confirm pass**

```bash
cd apps/mobile && maestro test e2e/flows/account/more-tab-navigation.yaml
```

Expected: PASS, assertions on the three accommodation testIDs visible.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/e2e/flows/account/more-tab-navigation.yaml
git commit -m "test(e2e): assert Accommodation section in more-tab-navigation [ACCOUNT-06]"
```

### Task 1.2: Fix `account/delete-account.yaml` — extend to BUG-910 three-stage flow

**Files:**
- Modify: `apps/mobile/e2e/flows/account/delete-account.yaml`
- Source of truth: `apps/mobile/src/app/delete-account.tsx` (testIDs grep above)

**Drift:** YAML stops at stage 1 (`initial`). The `confirming` stage (typed-confirmation requiring exact `DELETE`) and `scheduled` stage with family/subscription warnings have no assertions.

- [ ] **Step 1: Add confirming-stage assertions after the existing `delete-account-confirm` tap**

Replace the current early-return (`tapOn: delete-account-cancel` then assert More) with:

```yaml
# Tap the initial confirm to advance to the typed-confirmation stage
- tapOn:
    id: "delete-account-confirm"

# Confirming stage assertions
- extendedWaitUntil:
    visible:
      id: "delete-account-confirming"
    timeout: 10000
- assertVisible:
    id: "delete-account-confirm-input"
- assertVisible:
    id: "delete-account-confirm-final"

# Type the wrong phrase — final button must remain disabled (no advance)
- tapOn:
    id: "delete-account-confirm-input"
- inputText: "delete"
- assertVisible:
    id: "delete-account-confirm-final"  # still on this screen
- takeScreenshot: delete-account-typed-wrong

# Clear and type the correct phrase
- eraseText: 10
- inputText: "DELETE"

# Cancel out via back-to-warning so we don't actually schedule deletion
- tapOn:
    id: "delete-account-back-to-warning"
- assertVisible:
    id: "delete-account-confirm"
```

- [ ] **Step 2: Add scheduled-stage smoke (optional path)**

If the seed scenario `account-deletion-scheduled` exists (check `apps/api/src/seed/`), add a second flow file `account/delete-account-scheduled.yaml` that boots that scenario and asserts:

```yaml
- assertVisible:
    id: "delete-account-scheduled"
- assertVisible:
    id: "delete-account-keep"
- assertVisible:
    id: "delete-account-sign-out"
```

Tap `delete-account-keep` and verify return to More with `sign-out-button` visible. If the seed scenario does not exist, skip Step 2 and add `account-deletion-scheduled` to the missing-seed list reported back to the coordinator.

- [ ] **Step 3: Run and verify both flows pass**

```bash
cd apps/mobile && maestro test e2e/flows/account/delete-account.yaml
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/e2e/flows/account/delete-account*.yaml
git commit -m "test(e2e): assert typed-confirmation + scheduled stages in delete-account [ACCOUNT-11, BUG-910]"
```

### Task 1.3: Fix `subjects/practice-subject-picker.yaml` — drop pre-redesign assertions

**Files:**
- Modify: `apps/mobile/e2e/flows/subjects/practice-subject-picker.yaml`
- Source of truth: `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/app/(app)/practice.tsx`

**Drift:** asserts `text: "Practice for a test"` (old `AdaptiveEntryCard` footer) and `text: "Your subjects"` (now rendered uppercase).

- [ ] **Step 1: Replace the `Practice for a test` block with the redesigned quick-action**

```yaml
- tapOn:
    id: "home-action-practice"
- extendedWaitUntil:
    visible:
      id: "practice-screen"
    timeout: 10000
```

- [ ] **Step 2: Replace `text: "Your subjects"` assertions with the testID**

```yaml
- assertVisible:
    id: "home-subject-carousel"
```

(Drop any case-sensitive text matches.)

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/subjects/practice-subject-picker.yaml
git add apps/mobile/e2e/flows/subjects/practice-subject-picker.yaml
git commit -m "test(e2e): drop pre-redesign assertions in practice-subject-picker [SUBJECT-06]"
```

### Task 1.4: Fix `subjects/multi-subject.yaml` — match v3 library entry

**Files:**
- Modify: `apps/mobile/e2e/flows/subjects/multi-subject.yaml`
- Source of truth: `apps/mobile/src/app/(app)/library.tsx`

**Drift:** uses pre-v3 shelf-tab navigation and `text: "Your subjects"` lowercase.

- [ ] **Step 1: Replace any tapOn `library-tab-shelves` / `library-tab-books` with the v3 single-pane entry**

```yaml
- tapOn:
    id: "tab-library"
- extendedWaitUntil:
    visible:
      id: "shelves-list"
    timeout: 10000
```

- [ ] **Step 2: Replace text matches on subject names with `subject-card-${SUBJECT_ID}` testIDs (the seed scenario provides stable IDs).**

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/subjects/multi-subject.yaml
git add apps/mobile/e2e/flows/subjects/multi-subject.yaml
git commit -m "test(e2e): use v3 library entry in multi-subject [LEARN-09]"
```

### Task 1.5: Fix `onboarding/view-curriculum.yaml` — drop removed `library-tab-shelves`

**Files:**
- Modify: `apps/mobile/e2e/flows/onboarding/view-curriculum.yaml`

**Drift:** asserts `id: "library-tab-shelves"` which is gone in Library v3.

- [ ] **Step 1: Replace the library section assertion**

```yaml
- tapOn:
    id: "tab-library"
- extendedWaitUntil:
    visible:
      id: "shelves-list"
    timeout: 10000
- scrollUntilVisible:
    element:
      id: "subject-card-${SUBJECT_ID}"
    direction: DOWN
```

- [ ] **Step 2: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/onboarding/view-curriculum.yaml
git add apps/mobile/e2e/flows/onboarding/view-curriculum.yaml
git commit -m "test(e2e): use v3 library entry in view-curriculum [SUBJECT-12]"
```

### Task 1.6: Rewrite `learning/library-navigation.yaml` for Library v3

**Files:**
- Modify: `apps/mobile/e2e/flows/learning/library-navigation.yaml`
- Source of truth: `apps/mobile/src/app/(app)/library.tsx`, `apps/mobile/src/components/library/*`

**Drift:** test enters via `home-coach-band-continue` (sidesteps the library); does not exercise expandable shelves, retention pills, or `LibrarySearchBar`.

- [ ] **Step 1: Drop the coach-band entry; enter library via the tab**

```yaml
- tapOn:
    id: "tab-library"
- extendedWaitUntil:
    visible:
      id: "shelves-list"
    timeout: 10000
```

- [ ] **Step 2: Expand a shelf and assert inline book card**

```yaml
- tapOn:
    id: "shelf-row-${SUBJECT_ID}"  # toggles expanded
- assertVisible:
    id: "shelf-row-${SUBJECT_ID}-book-${BOOK_ID}"
- assertVisible:
    id: "retention-pill-${SUBJECT_ID}"
    optional: true   # gated on retention data
```

- [ ] **Step 3: Drop the obsolete `subject-filter-tabs` references in the header comment.**

- [ ] **Step 4: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/learning/library-navigation.yaml
git add apps/mobile/e2e/flows/learning/library-navigation.yaml
git commit -m "test(e2e): rewrite library-navigation for v3 single-pane [LEARN-08]"
```

### Task 1.7: Fix `learning/book-detail.yaml` — drop `ShelvesTab` reference

**Files:**
- Modify: `apps/mobile/e2e/flows/learning/book-detail.yaml`

**Drift:** header comment references removed `ShelvesTab.tsx`; verify `subject-card-${SUBJECT_ID}` resolves through v3's `ShelfRow`.

- [ ] **Step 1: Update header comment to reference current source path** `apps/mobile/src/app/(app)/library.tsx` and `components/library/ShelfRow.tsx`.

- [ ] **Step 2: Verify navigation to `shelf-screen` and `book-screen` still resolves; if v3 routes book details directly without the shelf intermediary, update the path.**

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/learning/book-detail.yaml
git add apps/mobile/e2e/flows/learning/book-detail.yaml
git commit -m "test(e2e): align book-detail with v3 library [LEARN-10]"
```

### Task 1.8: Fix retention testID drift across 5 files

**Files (one commit per file, but tackled together because they share the same drift):**
- `apps/mobile/e2e/flows/retention/topic-detail.yaml`
- `apps/mobile/e2e/flows/retention/topic-detail-adaptive-buttons.yaml`
- `apps/mobile/e2e/flows/retention/recall-review.yaml`
- `apps/mobile/e2e/flows/retention/failed-recall.yaml`
- `apps/mobile/e2e/flows/retention/library.yaml`

**Drift:** all assert removed testIDs `retention-card`, `primary-action-button`, `more-ways-toggle`, `secondary-recall-check`, `library-tab-shelves`, `library-tab-books`. Currently silently pass via `optional: true`.

- [ ] **Step 1: Confirm the new testIDs in source**

```bash
grep -rn "study-cta\|topic-detail-" apps/mobile/src/app/\(app\)/topic/
```

- [ ] **Step 2: Per file, replace stale assertions with current ones**

Replacement table:
- `retention-card` → drop or replace with `topic-detail-screen`
- `primary-action-button` → `study-cta`
- `more-ways-toggle` → drop (no equivalent in current design; verify with source)
- `secondary-recall-check` → drop
- `library-tab-shelves` / `library-tab-books` → `shelves-list`

- [ ] **Step 3: Remove the affected entries from the known-stale allowlist in `apps/mobile/src/lib/__tests__/e2e-testid-integrity.test.ts` once their YAML references are gone.**

- [ ] **Step 4: Run all five flows**

```bash
cd apps/mobile
for f in topic-detail topic-detail-adaptive-buttons recall-review failed-recall library; do
  maestro test e2e/flows/retention/$f.yaml
done
```

- [ ] **Step 5: Commit per file**

```bash
git add apps/mobile/e2e/flows/retention/topic-detail.yaml
git commit -m "test(e2e): use current testIDs in topic-detail [LEARN-12]"
# Repeat for each file
```

### Task 1.9: Fix relearn flow drift

**Files:**
- `apps/mobile/e2e/flows/retention/relearn-flow.yaml`
- `apps/mobile/e2e/flows/retention/relearn-child-friendly.yaml`
- Source of truth: `apps/mobile/src/app/(app)/topic/relearn/*` (phase pickers)

**Drift:** assert `relearn-different-method`, `relearn-same-method`, `relearn-back-to-choice`. Replaced by phase-picker testIDs `relearn-subjects-phase`, `relearn-topics-phase`, `relearn-method-phase`.

- [ ] **Step 1: Inspect the relearn route**

```bash
grep -rn "testID" apps/mobile/src/app/\(app\)/topic/relearn/
```

- [ ] **Step 2: Update assertions to traverse the three phases (subjects → topics → method) using the new testIDs.**

- [ ] **Step 3: Run + commit per file**

```bash
cd apps/mobile && maestro test e2e/flows/retention/relearn-flow.yaml
git commit -m "test(e2e): use phase-picker testIDs in relearn-flow [LEARN-15]"
```

### Task 1.10: Fix `dictation/dictation-full-flow.yaml` — drop hardcoded "Leave"

**Files:**
- Modify: `apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml`
- Source of truth: `apps/mobile/src/app/(app)/dictation/playback.tsx`, `apps/mobile/src/i18n/locales/en/translation.json`

**Drift:** taps `text: "Leave"` for the mid-dictation exit confirm; that string is now `t()`-keyed so non-en locales fail.

- [ ] **Step 1: Find the testID for the Leave button**

```bash
grep -n "Leave\|exit-confirm" apps/mobile/src/app/\(app\)/dictation/playback.tsx
```

If no testID exists, add one in source: `testID="dictation-exit-confirm"` on the Leave button. Treat that source change as part of this task.

- [ ] **Step 2: Replace the YAML tap**

```yaml
- tapOn:
    id: "dictation-exit-confirm"
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/dictation/dictation-full-flow.yaml
git add apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml apps/mobile/src/app/\(app\)/dictation/playback.tsx
git commit -m "test(e2e): use testID for dictation exit confirm to survive i18n [DICT-05]"
```

### Task 1.11: Fix `homework/camera-ocr.yaml` — assert both permission sub-states

**Files:**
- Modify: `apps/mobile/e2e/flows/homework/camera-ocr.yaml`
- Source of truth: `apps/mobile/src/app/(app)/homework/camera.tsx`

**Drift:** only `grant-permission-button` (first-request) is exercised; `open-settings-button` (permanently-denied) is not.

- [ ] **Step 1: Add an assertion branch for the denied state**

Add a parallel flow file `homework/camera-permission-denied.yaml` that uses a seed scenario or pre-denies camera permission via `adb shell pm revoke`:

```yaml
- runScript: |
    adb shell pm revoke com.mentomate.app android.permission.CAMERA
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "homework-ready"
- tapOn:
    id: "home-action-homework"
- extendedWaitUntil:
    visible:
      id: "open-settings-button"
    timeout: 10000
- assertVisible:
    id: "close-button"
- takeScreenshot: camera-permanently-denied
```

- [ ] **Step 2: In the original `camera-ocr.yaml`, drop the permanently-denied comment-only block; keep only the first-request path so each flow has one purpose.**

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/homework/camera-permission-denied.yaml
git add apps/mobile/e2e/flows/homework/camera-permission-denied.yaml apps/mobile/e2e/flows/homework/camera-ocr.yaml
git commit -m "test(e2e): cover permanently-denied camera permission [HOMEWORK-02, HOMEWORK-07]"
```

### Task 1.12: Fix `parent/child-drill-down.yaml` — assert `topic-understanding-card`

**Files:**
- Modify: `apps/mobile/e2e/flows/parent/child-drill-down.yaml`
- Source of truth: `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:169`

**Drift:** asserts `topic-status-card` but never the renamed `topic-understanding-card`.

- [ ] **Step 1: Add an assertion after the existing `topic-detail-screen` wait**

```yaml
- assertVisible:
    id: "topic-understanding-card"
- assertVisible:
    id: "topic-retention-card"
    optional: true   # gated on data presence
```

- [ ] **Step 2: Add transcript-link gating check by switching to a parent-proxy session**

If a `parent-proxy` seed scenario is available, add an assertion that the transcript link is NOT visible. Otherwise note as a follow-up in the audit and proceed.

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/parent/child-drill-down.yaml
git add apps/mobile/e2e/flows/parent/child-drill-down.yaml
git commit -m "test(e2e): assert topic-understanding-card in child-drill-down [PARENT-10, PARENT-05]"
```

### Task 1.13: Fix `billing/subscription-details.yaml` — assert `trial-banner` testID

**Files:**
- Modify: `apps/mobile/e2e/flows/billing/subscription-details.yaml`
- Source of truth: `apps/mobile/src/app/(app)/subscription.tsx` (search `trial-banner`)

**Drift:** asserts `text: "Trial active"` instead of the testID; doesn't assert `trialEndsAt`.

- [ ] **Step 1: Replace the text assertion**

```yaml
- assertVisible:
    id: "trial-banner"
- assertVisible:
    id: "trial-banner-ends-at"
    optional: true   # only when subscription.trialEndsAt is set
```

- [ ] **Step 2: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/billing/subscription-details.yaml
git add apps/mobile/e2e/flows/billing/subscription-details.yaml
git commit -m "test(e2e): assert trial-banner testID + ends-at [BILLING-11, BUG-966]"
```

### Task 1.14: Rename `onboarding/settings-language-edit.yaml` to clarify scope

**Files:**
- Rename: `apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml` → `apps/mobile/e2e/flows/account/tutor-language-edit.yaml`
- Update: `docs/flows/mobile-app-flow-inventory.md` ACCOUNT-29 row

**Drift:** the inventory cites this file as ACCOUNT-28 (App language) coverage but it actually tests ACCOUNT-29 (Tutor language). The App language test is missing — Task 4.1 below writes it.

- [ ] **Step 1: Rename file + update inventory**

```bash
git mv apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml apps/mobile/e2e/flows/account/tutor-language-edit.yaml
```

Update `docs/flows/mobile-app-flow-inventory.md` ACCOUNT-29 cell to point at the new path.

- [ ] **Step 2: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/account/tutor-language-edit.yaml
git add apps/mobile/e2e/flows/account/tutor-language-edit.yaml apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml docs/flows/mobile-app-flow-inventory.md
git commit -m "test(e2e): rename to clarify scope is tutor language not app language [ACCOUNT-29]"
```

---

## Stage 2 — Add Missing P1 Tests (Recently Shipped Flows)

These are flows that shipped in the last ~2 weeks with zero E2E coverage. Highest leverage: each one is the entry point of a new feature.

### Task 2.1: LEARN-23 — Session transcript view

**Files:**
- Create: `apps/mobile/e2e/flows/learning/session-transcript.yaml`
- Source: `apps/mobile/src/app/session-transcript/[sessionId].tsx`

**testIDs to assert:** `session-transcript-screen`, `transcript-message-${idx}`, `transcript-back`. Also verify the `View full transcript` link from session-summary navigates here.

- [ ] **Step 1: Write the flow**

```yaml
appId: com.mentomate.app
tags: [nightly, learning, transcript]
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "session-with-transcript"
- extendedWaitUntil:
    visible:
      id: "learner-screen"
    timeout: 15000
# Open session-summary for a completed session
- tapOn:
    id: "tab-progress"
- tapOn:
    id: "completed-session-${SESSION_ID}"
- extendedWaitUntil:
    visible:
      id: "session-summary-screen"
    timeout: 10000
- tapOn:
    id: "view-full-transcript-link"
- extendedWaitUntil:
    visible:
      id: "session-transcript-screen"
    timeout: 10000
- assertVisible:
    id: "transcript-message-0"
- takeScreenshot: session-transcript-loaded
- tapOn:
    id: "transcript-back"
- assertVisible:
    id: "session-summary-screen"
```

- [ ] **Step 2: Add a parent-proxy variant** `session-transcript-parent-proxy.yaml` that switches to a parent profile viewing a child's session and asserts the `view-full-transcript-link` is NOT visible.

- [ ] **Step 3: Run + commit**

```bash
cd apps/mobile && maestro test e2e/flows/learning/session-transcript.yaml
git add apps/mobile/e2e/flows/learning/session-transcript*.yaml
git commit -m "test(e2e): add session transcript + parent-proxy gate [LEARN-23, BUG-889]"
```

### Task 2.2: LEARN-24 — Saved bookmarks screen

**Files:**
- Create: `apps/mobile/e2e/flows/progress/saved-bookmarks.yaml`
- Source: `apps/mobile/src/app/(app)/progress/saved.tsx`

**testIDs to assert:** `saved-bookmarks-screen`, `bookmark-row-${id}`, `bookmark-delete-${id}`, `bookmark-empty-state`.

- [ ] **Step 1: Write flow exercising list, expand-on-tap, swipe-delete with confirm**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "with-bookmarks"
- tapOn:
    id: "tab-progress"
- tapOn:
    id: "progress-saved-link"
- assertVisible:
    id: "saved-bookmarks-screen"
- assertVisible:
    id: "bookmark-row-${BOOKMARK_ID}"
- swipe:
    direction: LEFT
    from:
      id: "bookmark-row-${BOOKMARK_ID}"
- tapOn:
    id: "bookmark-delete-${BOOKMARK_ID}"
- tapOn:
    id: "bookmark-delete-confirm"
- assertNotVisible:
    id: "bookmark-row-${BOOKMARK_ID}"
```

- [ ] **Step 2: Add parent-proxy variant** asserting `bookmark-delete-${id}` is NOT visible.

- [ ] **Step 3: Run + commit**

```bash
git commit -m "test(e2e): saved bookmarks list + swipe-delete + parent-proxy [LEARN-24]"
```

### Task 2.3: LEARN-25 — Library inline search

**Files:**
- Create: `apps/mobile/e2e/flows/learning/library-search.yaml`
- Source: `apps/mobile/src/components/library/LibrarySearchBar.tsx`, `apps/mobile/src/hooks/use-library-search.ts`

**testIDs:** `library-search-input`, `library-search-empty`, `library-search-server-loading`, `library-search-clear-results`, `library-search-result-${id}`.

- [ ] **Step 1: Write flow exercising debounce + auto-expand of matching shelf**

```yaml
- tapOn:
    id: "tab-library"
- tapOn:
    id: "library-search-input"
- inputText: "ada"
# Wait past 300 ms debounce + server response
- extendedWaitUntil:
    visible:
      id: "library-search-result-${BOOK_ID}"
    timeout: 5000
- tapOn:
    id: "library-search-clear-results"
- assertNotVisible:
    id: "library-search-result-${BOOK_ID}"
- inputText: "zzzznoresults"
- extendedWaitUntil:
    visible:
      id: "library-search-empty"
    timeout: 5000
```

- [ ] **Step 2: Run + commit**

```bash
git commit -m "test(e2e): library inline search debounce + empty state [LEARN-25]"
```

### Task 2.4: PARENT-13 — Child weekly report detail

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-weekly-report.yaml`
- Source: `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx`

**testIDs:** `child-weekly-report-hero`, `child-weekly-report-metric-sessions`, `child-weekly-report-metric-minutes`, `child-weekly-report-metric-topics`, `child-weekly-report-back`.

- [ ] **Step 1: Write flow that deep-links into the route via the parent reports list (or a push-notification simulator if available)**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "parent-with-weekly-report"
- runFlow:
    file: ../_setup/switch-to-parent.yaml
- tapOn:
    id: "child-card-${CHILD_ID}"
- tapOn:
    id: "child-reports-link"
- tapOn:
    id: "weekly-snapshot-${REPORT_ID}"
- extendedWaitUntil:
    visible:
      id: "child-weekly-report-hero"
    timeout: 10000
- assertVisible:
    id: "child-weekly-report-metric-sessions"
- assertVisible:
    id: "child-weekly-report-metric-minutes"
- assertVisible:
    id: "child-weekly-report-metric-topics"
- tapOn:
    id: "child-weekly-report-back"
- assertVisible:
    id: "child-reports-screen"
```

- [ ] **Step 2: Add error-retry variant** asserting `child-weekly-report-error-retry`.

- [ ] **Step 3: Run + commit**

```bash
git commit -m "test(e2e): child weekly report detail [PARENT-13]"
```

### Task 2.5: PARENT-11 — Session recap block

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-session-recap.yaml`
- Source: `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`

**testIDs:** `session-recap-narrative`, `session-recap-highlight`, `session-recap-conversation-prompt`, `session-recap-copy-prompt`, `engagement-chip-${signal}`.

- [ ] **Step 1: Write flow exercising the populated recap**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "parent-session-with-recap"
- runFlow:
    file: ../_setup/switch-to-parent.yaml
- tapOn:
    id: "child-card-${CHILD_ID}"
- tapOn:
    id: "session-card-${SESSION_ID}"
- assertVisible:
    id: "session-recap-narrative"
- assertVisible:
    id: "session-recap-highlight"
- assertVisible:
    id: "session-recap-conversation-prompt"
- tapOn:
    id: "session-recap-copy-prompt"
- assertVisible:
    text: "Copied"   # transient; or use id if available
- assertVisible:
    id: "engagement-chip-curious"
```

- [ ] **Step 2: Add empty-recap variant** for pre-backfill sessions: assert metrics render but `session-recap-narrative` is NOT visible.

- [ ] **Step 3: Run + commit**

```bash
git commit -m "test(e2e): parent session recap populated + empty [PARENT-11]"
```

### Task 2.6: PARENT-12 — Subject retention badge gating

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-subject-retention.yaml`
- Source: `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx`

**Behaviour:** retention badge should only render when `retentionStatus` is present AND `totalSessions >= 1`. Unknown retention must NOT render "At risk".

- [ ] **Step 1: Write two-arm flow — one with retention data, one without — and assert presence/absence accordingly.**

```yaml
# Arm A: subject with retention data
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "parent-subject-with-retention"
- ... navigate to subject ...
- assertVisible:
    id: "subject-retention-badge"
# Arm B (separate flow file, same scaffold)
# - assertNotVisible:
#     id: "subject-retention-badge"
- assertNotVisible:
    text: "At risk"
```

- [ ] **Step 2: Run + commit**

```bash
git commit -m "test(e2e): parent subject retention badge gating [PARENT-12]"
```

### Task 2.7: ACCOUNT-28 — App language (UI locale) edit

**Files:**
- Create: `apps/mobile/e2e/flows/account/app-language-edit.yaml`
- Source: `apps/mobile/src/app/(app)/more.tsx` (search `settings-app-language`)

**testIDs:** `settings-app-language`, `language-picker-backdrop`, `language-option-en`, `language-option-nb`, `language-option-de`, `language-option-es`, `language-option-pl`, `language-option-pt`, `language-option-ja`.

- [ ] **Step 1: Write flow that opens the bottom sheet, selects nb, asserts a known nb string is rendered, then resets to en.**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "onboarding-complete"
- tapOn:
    id: "tab-more"
- scrollUntilVisible:
    element:
      id: "settings-app-language"
- tapOn:
    id: "settings-app-language"
- assertVisible:
    id: "language-picker-backdrop"
- tapOn:
    id: "language-option-nb"
- assertNotVisible:
    id: "language-picker-backdrop"
# Verify locale changed by asserting a Norwegian-only string from More
- assertVisible:
    text: "Logg ut"   # or use the testID for sign-out and check label via accessibility
- tapOn:
    id: "settings-app-language"
- tapOn:
    id: "language-option-en"
```

- [ ] **Step 2: Run + commit**

```bash
git commit -m "test(e2e): app language bottom sheet picker [ACCOUNT-28]"
```

### Task 2.8: BILLING-12 — Pro/Family static comparison cards

**Files:**
- Create: `apps/mobile/e2e/flows/billing/static-comparison-cards.yaml`
- Source: `apps/mobile/src/app/(app)/subscription.tsx` (`getTiersToCompare`)

**testIDs:** `static-tier-family`, `static-tier-pro`. Seed must place the user on Pro or Family tier and force RevenueCat offerings to be unavailable.

- [ ] **Step 1: Confirm a seed scenario exists for `subscription-family-active` and `subscription-pro-active`. If not, ask backend team to add them; pause this task until ready.**

- [ ] **Step 2: Write the flow once seeds exist**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "subscription-family-active"
- tapOn:
    id: "tab-more"
- tapOn:
    id: "subscription-link"
- scrollUntilVisible:
    element:
      id: "static-tier-pro"
    direction: DOWN
- assertVisible:
    id: "static-tier-pro"
- assertNotVisible:
    id: "static-tier-family"   # Family customer doesn't see Family card
```

- [ ] **Step 3: Mirror flow for `subscription-pro-active` asserting `static-tier-family` is visible and `static-tier-pro` is not.**

- [ ] **Step 4: Run + commit**

```bash
git commit -m "test(e2e): pro/family static comparison cards [BILLING-12, BUG-917]"
```

### Task 2.9: BILLING-08 — Family pool section

**Files:**
- Create: `apps/mobile/e2e/flows/billing/family-pool.yaml`
- Source: `apps/mobile/src/app/(app)/subscription.tsx` (`family-pool-section`)

- [ ] **Step 1: Write flow seeded with a family-tier user that asserts `family-pool-section` is visible.**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "subscription-family-active"
- tapOn:
    id: "tab-more"
- tapOn:
    id: "subscription-link"
- scrollUntilVisible:
    element:
      id: "family-pool-section"
    direction: DOWN
- assertVisible:
    id: "family-pool-section"
```

- [ ] **Step 2: Run + commit**

```bash
git commit -m "test(e2e): family pool section visibility [BILLING-08]"
```

---

## Stage 3 — Add Missing P2 Tests (Practice / Quiz / Dictation Gaps)

### Task 3.1: PRACTICE-01..04 — Practice hub navigation + recitation + empty state

**Files:**
- Create: `apps/mobile/e2e/flows/practice/practice-hub-navigation.yaml`
- Create: `apps/mobile/e2e/flows/practice/recitation-session.yaml`
- Create: `apps/mobile/e2e/flows/practice/all-caught-up.yaml`
- Source: `apps/mobile/src/app/(app)/practice.tsx`, `apps/mobile/src/app/(app)/session/index.tsx`

- [ ] **Step 1: `practice-hub-navigation.yaml`** — taps every menu item in turn (`practice-review`, `practice-recitation`, `practice-dictation`, `practice-quiz`, `practice-quiz-history`) and asserts the destination screen.
- [ ] **Step 2: `recitation-session.yaml`** — taps `practice-recitation`, asserts session screen with `mode=recitation`, sends one chat message, exits.
- [ ] **Step 3: `all-caught-up.yaml`** — uses a seed where `totalOverdue === 0`; asserts `review-empty-state` and `review-empty-browse` deep-link to library.
- [ ] **Step 4: Run + commit each**

### Task 3.2: QUIZ-05 — Mid-round quit Modal

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-quit-modal.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/play.tsx` (`quiz-quit-modal-backdrop`)

- [ ] **Step 1: Start a round, tap the close icon, assert backdrop, tap cancel, confirm round still active. Then close again, tap confirm, assert return to quiz index.**
- [ ] **Step 2: Run + commit**

### Task 3.3: QUIZ-08 — Quota / consent / forbidden errors

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-error-states.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/launch.tsx` (typed `ApiResponseError.code`)

- [ ] **Step 1: Three-arm flow using seeds `quota-exceeded`, `consent-pending`, `forbidden`.** Each arm asserts the error message renders and Retry is suppressed.
- [ ] **Step 2: Run + commit**

### Task 3.4: QUIZ-11 — Malformed-round guard

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-malformed-round.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/play.tsx` (BUG-812 / F-015)

- [ ] **Step 1: Seed a round whose options dedupe to <2; assert `quiz-play-malformed` and tap `quiz-play-malformed-back`.**
- [ ] **Step 2: Run + commit**

### Task 3.5: QUIZ-12 — Wrong-answer dispute

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-dispute.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/play.tsx` (BUG-927)

- [ ] **Step 1: Force a wrong answer (deterministic seed with known wrong option index); tap `quiz-dispute-button`; assert `quiz-dispute-noted`.**
- [ ] **Step 2: Also assert `quiz-dispute-button` is NOT visible after a correct answer.**
- [ ] **Step 3: Run + commit**

### Task 3.6: QUIZ-13 — Answer-check failure warning

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-answer-check-failure.yaml`

- [ ] **Step 1: Use a seed that fails `POST /quiz/rounds/:id/check`; assert the inline warning renders and the round continues.**
- [ ] **Step 2: Run + commit**

### Task 3.7: DICT-07..10 — Photo review + remediation + perfect-score + result recording

**Files:**
- Create: `apps/mobile/e2e/flows/dictation/dictation-review-flow.yaml`
- Create: `apps/mobile/e2e/flows/dictation/dictation-perfect-score.yaml`
- Source: `apps/mobile/src/app/(app)/dictation/review.tsx`, `apps/mobile/src/hooks/use-record-dictation-result.ts`

- [ ] **Step 1: `dictation-review-flow.yaml`** — completes a dictation, taps `complete-check-writing`, captures a photo (or uses gallery seed), asserts `review-remediation-screen`, taps `review-mistake-card`, types a correction in `review-correction-input`, taps `review-submit-correction`.
- [ ] **Step 2: `dictation-perfect-score.yaml`** — uses seed where `mistakes.length === 0`; asserts `review-celebration`.
- [ ] **Step 3: Run + commit**

---

## Stage 4 — Add Missing P3 Tests (Auth / Account Hardening)

### Task 4.1: AUTH-05 — Additional sign-in verification branches

**Files:**
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-email-code.yaml`
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-totp.yaml`
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-phone.yaml`
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-backup-code.yaml`

- [ ] **Step 1: For each MFA branch, write a seed-driven flow** (Clerk testing tokens; see `feedback_doppler_secrets`). If the testing-token environment is incomplete, document which branch is blocked and skip.
- [ ] **Step 2: Run + commit each**

### Task 4.2: AUTH-09 — SSO callback fallback

**Files:**
- Create: `apps/mobile/e2e/flows/auth/sso-callback-fallback.yaml`

- [ ] **Step 1: Trigger an SSO callback that fails (network off mid-callback or invalid state token); assert the 10s timeout reveals `sso-fallback-back`; tap it and confirm return to sign-in.**

### Task 4.3: AUTH-11 — Session-expired forced sign-out

**Files:**
- Create: `apps/mobile/e2e/flows/auth/session-expired-banner.yaml`

- [ ] **Step 1: Use `adb shell` to clear Clerk session storage mid-app; assert forced sign-out occurs; assert the re-entry banner is consumed by sign-in.**

### Task 4.4: AUTH-13 — Deep-link auth redirect preservation

**Files:**
- Create: `apps/mobile/e2e/flows/auth/deep-link-redirect.yaml`

- [ ] **Step 1: Sign out; trigger a deep link to a gated route; sign in; assert landing is the deep-link target, not Home.**

### Task 4.5: AUTH-14 — Sign-in transition stuck-state recovery

**Files:**
- Create: `apps/mobile/e2e/flows/auth/sign-in-stuck-recovery.yaml`

- [ ] **Step 1: Seed an environment where the auth-layout redirect is delayed >`SESSION_TRANSITION_MS`; assert `sign-in-transitioning-stuck`; tap `sign-in-stuck-retry`; verify recovery.**

### Task 4.6: ACCOUNT-09 — Change password

**Files:**
- Create: `apps/mobile/e2e/flows/account/change-password.yaml`

- [ ] **Step 1: From More → Account Security → Change Password, type the current and new password, submit, assert success.** Use Clerk testing-token credentials.

### Task 4.7: ACCOUNT-10 — Export my data (full flow)

**Files:**
- Create: `apps/mobile/e2e/flows/account/export-data.yaml`

- [ ] **Step 1: From More → Export my data, accept the alert, assert success state.** If the API stubs the export with an email-only response, assert that copy.

### Task 4.8: ACCOUNT-17 — Child memory consent prompt

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-memory-consent-prompt.yaml`

- [ ] **Step 1: Navigate to a child's mentor-memory; assert the consent prompt; tap accept; assert the memory list becomes interactive.**

### Task 4.9: ACCOUNT-18 — Subject analogy preference after setup

**Files:**
- Create: `apps/mobile/e2e/flows/account/subject-analogy-preference.yaml`

- [ ] **Step 1: From a non-language subject, navigate to subject settings; assert the analogy-preference toggle is visible and persists.**
- [ ] **Step 2: Repeat against a language subject (`pedagogyMode === 'four_strands'`) and assert the toggle is hidden (BUG-939).**

### Task 4.10: ACCOUNT-30 — Impersonated-child More guard

**Files:**
- Create: `apps/mobile/e2e/flows/account/more-impersonated-child.yaml`

- [ ] **Step 1: Switch to a child profile via `_setup/switch-to-child.yaml`; navigate to More; assert `sign-out-button`, `delete-account-row`, `export-data-row`, `subscription-link` are all NOT visible.**

---

## Stage 5 — Add Missing P4 Tests (Home / Billing Edge Cases)

### Task 5.1: HOME-01 — Dedicated test of redesigned home

**Files:**
- Create: `apps/mobile/e2e/flows/learning/home-layout.yaml`

- [ ] **Step 1: One flow that asserts every redesigned home element in sequence:** `home-subject-carousel`, `home-add-subject-tile`, `home-ask-anything`, `home-action-study-new`, `home-action-homework`, `home-action-practice`, and the conditional `home-coach-band-continue` when feature flag is on.

### Task 5.2: HOME-06 — Resume interrupted session

**Files:**
- Create: `apps/mobile/e2e/flows/learning/resume-interrupted-session.yaml`

- [ ] **Step 1: Seed a SecureStore session-recovery marker via `adb shell` write to the app's storage; relaunch; assert the Continue affordance and tap to resume.**

### Task 5.3: HOME-07 — Add-first-child gate (parent owners)

**Files:**
- Create: `apps/mobile/e2e/flows/parent/add-first-child-gate.yaml`

- [ ] **Step 1: Seed a parent account on family/pro plan with no child profiles; assert "Add a child to get started" branch; tap CTA → `/create-profile`.**

### Task 5.4: HOME-08 — Home loading-timeout fallback

**Files:**
- Create: `apps/mobile/e2e/flows/edge/home-loading-timeout.yaml`

- [ ] **Step 1: Seed a state where profile load hangs >10s (slow API stub); assert `home-loading-timeout`, `home-loading-retry`, `timeout-library-button`, `timeout-more-button`.**

### Task 5.5: LEARN-11 — Manage subject status

**Files:**
- Create: `apps/mobile/e2e/flows/learning/manage-subject-status.yaml`

- [ ] **Step 1: Open the manage-subject modal from library; toggle through active → paused → archived; assert each transition is reflected on the library shelf.**

### Task 5.6: BILLING-02 — Upgrade purchase + polling indicator

**Files:**
- Create: `apps/mobile/e2e/flows/billing/upgrade-purchase.yaml`

- [ ] **Step 1: Use RevenueCat sandbox; tap upgrade; mock the receipt webhook to delay so the indicator shows; assert `purchase-polling-indicator`, then assert tier upgrade reflects.**
- [ ] **Step 2: Add a second variant** that triggers the already-purchased error and asserts the Restore prompt.

### Task 5.7: BILLING-09 — Top-up flow

**Files:**
- Create: `apps/mobile/e2e/flows/billing/top-up.yaml`

- [ ] **Step 1: From subscription screen, scroll to top-up section; tap top-up; complete sandbox purchase; assert credit balance updated.**

### Task 5.8: BILLING-10 — BYOK waitlist (deferred)

- [ ] **Step 1: Skip — BYOK UI is currently commented out in source. Add this task to the audit's deferred list and revisit once the feature un-comments.**

---

## Stage 6 — Audit Doc Maintenance

### Task 6.1: Update inventory + audit after each stage

**Files:**
- Modify: `docs/flows/mobile-app-flow-inventory.md`
- Modify: `docs/flows/e2e-coverage-audit.md`

- [ ] **Step 1: After each stage, update the Coverage column in the inventory and the Status column in the audit so future readers see current truth.**
- [ ] **Step 2: Commit per stage**

```bash
git commit -m "docs(flows): refresh inventory + audit after Stage N"
```

### Task 6.2: Tighten testID integrity allowlist

**Files:**
- Modify: `apps/mobile/src/lib/__tests__/e2e-testid-integrity.test.ts`

- [ ] **Step 1: After Stage 1 lands, remove the now-unused entries from the known-stale allowlist (`retention-card`, `primary-action-button`, `more-ways-toggle`, `secondary-recall-check`, `relearn-different-method`, `relearn-same-method`, `relearn-back-to-choice`, `library-tab-shelves`, `library-tab-books`, `streak-badge`).**
- [ ] **Step 2: Run the integrity test** `pnpm --filter mobile test src/lib/__tests__/e2e-testid-integrity.test.ts` and fix any new mismatches.
- [ ] **Step 3: Commit**

```bash
git commit -m "chore(e2e): tighten testID integrity allowlist after Stage 1"
```

---

## Notes for Executor

- **Seed scenarios:** several tasks above assume seed scenarios that may not exist yet (`session-with-transcript`, `with-bookmarks`, `parent-with-weekly-report`, `parent-session-with-recap`, `parent-subject-with-retention`, `subscription-family-active`, `subscription-pro-active`, `quota-exceeded`, `consent-pending`, `forbidden`, `quiz-malformed-round`, `quiz-deterministic-wrong-answer`, `daily-limit-reached` already exists). Before starting a task that needs a missing seed, check `apps/api/src/seed/scenarios/` (or wherever seed scenarios live). If missing, pause and ask the coordinator to add the scenario; do not invent client-side workarounds.

- **Subagents must not commit.** Per `feedback_agents_commit_push.md` and `feedback_concurrent_agent_commits.md`, subagents executing this plan should report which YAML files they changed; the coordinator commits sequentially.

- **Follow `feedback_e2e_never_skip.md`:** never use `optional: true` to mask a real failure. Only use it for genuinely conditional UI (loading spinners, transient toasts, gated retention badges).

- **Run order independence:** stages are ordered by impact, but tasks within a stage are independent and can run in parallel by separate agents on the same tree (per `feedback_parallel_agents.md`).

- **CI integration:** once Stage 1 lands, add the fixed flows to the nightly Maestro Cloud job so silent-pass regressions can't return.
