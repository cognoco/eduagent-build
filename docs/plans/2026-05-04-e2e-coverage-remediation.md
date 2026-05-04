# E2E Coverage Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 17 outdated Maestro flow tests that no longer match current source, and add dedicated coverage for the 40 flows currently classified as Missing in `docs/flows/e2e-coverage-audit.md`.

**Architecture:** The work is a sequence of small, independent YAML changes against `apps/mobile/e2e/flows/` plus a small set of new server-side seed scenarios in `apps/api/src/services/test-seed.ts`. There is no shared library to refactor and no new infrastructure beyond the seed prerequisites. We sequence by impact: add the missing seed scenarios first (Stage 0), then fix outdated tests (Stage 1 — only depends on existing seeds), then write missing tests in priority order P1 → P4 from the audit (Stages 2-5).

**Tech Stack:** Maestro 1.x flows (YAML), `seed-and-sign-in.yaml` setup helper, `e2e/scripts/seed-and-run.sh` wrapper, Doppler-backed seed scenarios, Android dev-client emulator. No new dependencies.

**Source-of-truth references for every task:**
- Audit: `docs/flows/e2e-coverage-audit.md`
- Inventory: `docs/flows/mobile-app-flow-inventory.md`
- TestID integrity allowlist: `apps/mobile/src/lib/__tests__/e2e-testid-integrity.test.ts`
- Existing setup helpers: `apps/mobile/e2e/flows/_setup/`
- Seed scenario catalog: `apps/api/src/services/test-seed.ts` (`SCENARIO_MAP` near line 1918)

---

## Harness Conventions

These apply to every task — read once, then apply silently throughout.

### Running a flow (verification command)

**Always invoke flows through the wrapper script — never bare `maestro test`.** The wrapper handles seeding, app reset, dev-client launch, and exports the credential env vars (`${EMAIL}`, `${PASSWORD}`, `${ACCOUNT_ID}`, `${PROFILE_ID}`, plus scenario-specific IDs like `${SUBJECT_ID}`) that every flow expects. Bare `maestro test` skips seeding entirely; sign-in then receives empty strings and the flow fails at the landing-screen wait.

```bash
cd apps/mobile
./e2e/scripts/seed-and-run.sh <scenario> e2e/flows/<path>/<file>.yaml
# e.g. ./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/more-tab-navigation.yaml
```

For pre-auth flows (sign-up, COPPA), use `--no-seed` instead of a scenario.

### `SEED_SCENARIO:` inside `runFlow.env` is documentation only

Several existing YAMLs include `env: SEED_SCENARIO: "onboarding-complete"` when invoking `seed-and-sign-in.yaml`. The helper YAML never reads that value — the wrapper script is what actually selects the scenario. Keep the convention for readability, but understand it does not drive seeding.

### `optional: true` policy

`optional: true` is permitted only for:
1. **One-of-N landing-screen detection** — `seed-and-sign-in.yaml` uses it on `learner-screen`, `dashboard-scroll`, `parent-gateway` because exactly one is the post-auth landing per scenario and Maestro has no `assertAny`.
2. **UI gated by data presence** — retention pills, trial-end-at strings, badges that require populated data.
3. **Transient toasts** that may animate out before assertion.

It is **forbidden** as a workaround for assertions known to fail. If you find yourself reaching for `optional: true` to make a stale assertion pass, the assertion is wrong — fix or delete it.

### Tagging

Every flow file declares `tags:` for CI scheduling. Apply consistently:

- **Stage 1 (fix outdated)** → `tags: [pr-blocking, <area>]` once they pass cleanly. They guard merge.
- **Stage 2-5 P1 / P2** → `tags: [nightly, <area>]`. They run on the nightly Maestro Cloud job.
- **Stage 5 P4 edge cases / hardware-bound flows** → `tags: [weekly, <area>]`.

Where `<area>` is one of `auth`, `account`, `learning`, `practice`, `quiz`, `dictation`, `homework`, `parent`, `billing`, `retention`, `onboarding`, `edge`.

### Subagent commit protocol

**Subagents executing this plan must NOT run `git add`, `git commit`, or `git push`.** Per CLAUDE.md: only the coordinator (main conversation) commits.

When a task is done, report back with:

1. List of files modified (paths only).
2. Verification output (which `seed-and-run.sh` invocations passed).
3. Suggested commit message in the form `test(e2e): <summary> [<TASK-ID>]` — coordinator decides whether to use it.

The coordinator commits each task's changes sequentially using `/commit`.

### Other conventions

- Always seed via the wrapper; never assume prior app state.
- Prefer `id:` over `text:` for assertions — `text:` breaks under i18n.
- Take screenshots at each meaningful state change for debugging.
- Use `extendedWaitUntil` (timeout 10–15s) for screen transitions; bare `assertVisible` for static elements.

---

## Stage 0 — Seeder Prerequisites

Stage 1 only consumes seeds that already exist (`onboarding-complete`, `learning-active`, `retention-due`, `homework-ready`, `trial-active`, `parent-with-children`). Stages 2-5 introduce flows that depend on **15 seeders that do not yet exist** in `apps/api/src/services/test-seed.ts`. Build them first; otherwise dependent tasks block at the seed step.

The canonical scenario list lives in `SCENARIO_MAP` at `apps/api/src/services/test-seed.ts:1918`. Verify each new seeder builds, registers in the map, and returns the IDs the consumer flow needs.

| Seeder | Consumer task(s) | Required output (IDs / state) |
|---|---|---|
| `account-deletion-scheduled` | 1.2 (Step 2) | Account in stage 2 (`scheduled`); `${PROFILE_ID}`, family/sub flags set so warnings render. |
| `parent-proxy` | 1.12 (Step 2), 2.1 (Step 2) | Parent profile viewing a child's session; child must have a completed session with transcript. |
| `session-with-transcript` | 2.1 | Learner with one completed session whose `${SESSION_ID}` has a populated transcript blob. |
| `with-bookmarks` | 2.2 | Learner with ≥2 bookmarks. Returns `${BOOKMARK_ID}`. |
| `parent-with-weekly-report` | 2.4 | Parent + child + ≥1 weekly report. Returns `${CHILD_ID}`, `${REPORT_ID}`. (Distinct from existing `parent-with-reports`.) |
| `parent-session-with-recap` | 2.5 | Parent + child + completed session with backfilled recap (narrative, highlight, prompt, engagement chips). Returns `${CHILD_ID}`, `${SESSION_ID}`. |
| `parent-session-recap-empty` | 2.5 (Step 2) | Same shape but recap fields null (pre-backfill). |
| `parent-subject-with-retention` | 2.6 (Arm A) | Parent + child + subject with `retentionStatus` set and `totalSessions ≥ 1`. |
| `parent-subject-no-retention` | 2.6 (Arm B) | Same but no retention data. |
| `subscription-family-active` | 2.8, 2.9 | User on Family tier, RevenueCat offerings disabled (force fallback to static cards). |
| `subscription-pro-active` | 2.8 | User on Pro tier, offerings disabled. |
| `quota-exceeded` | 3.3 | User whose quiz launch returns `ApiResponseError.code === 'QUOTA_EXCEEDED'`. (Distinct from existing `daily-limit-reached`, which is the consumer-side daily cap; `quota-exceeded` is the monthly/server-side cap that blocks quiz specifically.) |
| `forbidden` | 3.3 | User whose quiz launch returns `FORBIDDEN`. |
| `quiz-malformed-round` | 3.4 | Round whose options dedupe to <2 (BUG-812). |
| `quiz-deterministic-wrong-answer` | 3.5 | Round with known-wrong option index for deterministic dispute test. |
| `quiz-answer-check-fails` | 3.6 | Seed where `POST /quiz/rounds/:id/check` returns 5xx. |

> **`consent-pending` already exists** at `test-seed.ts:1471` — Task 3.3 reuses it.

### Task 0.1: Add the missing seed scenarios

**Files:**
- Modify: `apps/api/src/services/test-seed.ts` (add seeder fns + register in `SCENARIO_MAP`)
- Modify: `apps/api/src/services/test-seed.ts` (extend `SeedScenario` union near line 63)
- Add tests: extend `apps/api/src/services/test-seed.test.ts` and integration tests where existing pattern requires.

- [ ] **Step 1: Implement seeders.** For each row in the table above, write a seeder fn following the pattern of an adjacent existing seeder (e.g. `parent-with-reports` at line 1740 for the parent-* family). Return the IDs the consumer flow expects.
- [ ] **Step 2: Register in `SCENARIO_MAP`** and extend the `SeedScenario` union type so type-checking enforces completeness.
- [ ] **Step 3: Add unit tests** that invoke each seeder and assert the returned IDs are non-empty UUIDs and the DB rows exist.
- [ ] **Step 4: Run** `pnpm exec nx run api:test --testPathPattern=test-seed` and `pnpm exec nx run api:typecheck`.
- [ ] **Step 5: Smoke** — for each new scenario, run `./e2e/scripts/seed-and-run.sh <scenario> e2e/flows/auth/sign-in-navigation.yaml` (or the simplest existing flow) and confirm it lands on home/dashboard. Catches consumer-shape mismatches before Stage 2-5 hits them.

**Reporting back:** list which scenarios are wired and which IDs each one returns. Coordinator commits.

---

## Stage 1 — Fix Outdated Tests

These 17 tests assert removed testIDs or hardcoded English copy. Most pass today only because of `optional: true`. Fixing these is cheaper than writing new tests because the journey scaffolding already exists.

> **Sequencing note — library-v3 cluster:** Tasks 1.3, 1.4, 1.5, 1.6, 1.7 all touch the v3 single-pane library entry pattern (`tab-library` → `shelves-list`). Run them sequentially under one agent to avoid duplicate edits to `subject-card-${SUBJECT_ID}` conventions. Tasks 1.1, 1.2, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14 are independent and can parallelize.

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
cd apps/mobile && ./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/more-tab-navigation.yaml
```

Expected: PASS, assertions on the three accommodation testIDs visible.

- [ ] **Step 4: Report back** — file list + verification output + suggested commit message:
`test(e2e): assert Accommodation section in more-tab-navigation [ACCOUNT-06]`

### Task 1.2: Fix `account/delete-account.yaml` — extend to BUG-910 three-stage flow

**Files:**
- Modify: `apps/mobile/e2e/flows/account/delete-account.yaml`
- (Conditional) Add: `apps/mobile/e2e/flows/account/delete-account-scheduled.yaml`
- Source of truth: `apps/mobile/src/app/delete-account.tsx`

**Drift:** YAML stops at stage 1 (`initial`). The `confirming` stage (typed-confirmation requiring exact `DELETE`) and `scheduled` stage with family/subscription warnings have no assertions.

**Prerequisite:** Stage 0 must land `account-deletion-scheduled` before Step 2 of this task can run. Step 1 (confirming-stage) only needs `onboarding-complete`.

- [ ] **Step 1: Add confirming-stage assertions after the existing `delete-account-confirm` tap.** Replace the current early-return (`tapOn: delete-account-cancel` then assert More) with:

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

Verify with: `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/delete-account.yaml`.

- [ ] **Step 2: Add scheduled-stage smoke (depends on Stage 0 `account-deletion-scheduled`).** Create `apps/mobile/e2e/flows/account/delete-account-scheduled.yaml` that boots the scenario and asserts:

```yaml
- assertVisible:
    id: "delete-account-scheduled"
- assertVisible:
    id: "delete-account-keep"
- assertVisible:
    id: "delete-account-sign-out"
```

Tap `delete-account-keep` and verify return to More with `sign-out-button` visible. Verify with: `./e2e/scripts/seed-and-run.sh account-deletion-scheduled e2e/flows/account/delete-account-scheduled.yaml`.

- [ ] **Step 3: Report back** with both verification outputs and commit message:
`test(e2e): assert typed-confirmation + scheduled stages in delete-account [ACCOUNT-11, BUG-910]`

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

- [ ] **Step 3: Verify** — `./e2e/scripts/seed-and-run.sh multi-subject-practice e2e/flows/subjects/practice-subject-picker.yaml` (confirm scenario in source first; fall back to `multi-subject` if needed).

- [ ] **Step 4: Report back** — commit message:
`test(e2e): drop pre-redesign assertions in practice-subject-picker [SUBJECT-06]`

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

- [ ] **Step 3: Verify** — `./e2e/scripts/seed-and-run.sh multi-subject e2e/flows/subjects/multi-subject.yaml`.

- [ ] **Step 4: Report back** — commit message:
`test(e2e): use v3 library entry in multi-subject [LEARN-09]`

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

- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/onboarding/view-curriculum.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): use v3 library entry in view-curriculum [SUBJECT-12]`

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
    optional: true   # gated on retention data — permitted use of optional
```

- [ ] **Step 3: Drop the obsolete `subject-filter-tabs` references in the header comment.**

- [ ] **Step 4: Verify** — `./e2e/scripts/seed-and-run.sh retention-due e2e/flows/learning/library-navigation.yaml`.

- [ ] **Step 5: Report back** — commit message:
`test(e2e): rewrite library-navigation for v3 single-pane [LEARN-08]`

### Task 1.7: Fix `learning/book-detail.yaml` — drop `ShelvesTab` reference

**Files:**
- Modify: `apps/mobile/e2e/flows/learning/book-detail.yaml`

**Drift:** header comment references removed `ShelvesTab.tsx`; verify `subject-card-${SUBJECT_ID}` resolves through v3's `ShelfRow`.

- [ ] **Step 1: Update header comment to reference current source path** `apps/mobile/src/app/(app)/library.tsx` and `components/library/ShelfRow.tsx`.

- [ ] **Step 2: Verify navigation to `shelf-screen` and `book-screen` still resolves; if v3 routes book details directly without the shelf intermediary, update the path.**

- [ ] **Step 3: Verify** — `./e2e/scripts/seed-and-run.sh learning-active e2e/flows/learning/book-detail.yaml`.

- [ ] **Step 4: Report back** — commit message:
`test(e2e): align book-detail with v3 library [LEARN-10]`

### Task 1.8: Fix retention testID drift across 5 files (single bundled commit)

**Files:**
- `apps/mobile/e2e/flows/retention/topic-detail.yaml`
- `apps/mobile/e2e/flows/retention/topic-detail-adaptive-buttons.yaml`
- `apps/mobile/e2e/flows/retention/recall-review.yaml`
- `apps/mobile/e2e/flows/retention/failed-recall.yaml`
- `apps/mobile/e2e/flows/retention/library.yaml`

**Drift:** all assert removed testIDs `retention-card`, `primary-action-button`, `more-ways-toggle`, `secondary-recall-check`, `library-tab-shelves`, `library-tab-books`. Currently silently pass via `optional: true`.

> **Allowlist note:** This task does **not** edit `e2e-testid-integrity.test.ts`. Allowlist tightening is centralized in Task 6.2 to avoid breaking the integrity test mid-stage when entries are removed before all referencing YAMLs are updated.

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

- [ ] **Step 3: Run all five flows** (using the scenarios already wired into each YAML — typically `retention-due` or `failed-recall-3x`)

```bash
cd apps/mobile
for f in topic-detail topic-detail-adaptive-buttons recall-review failed-recall library; do
  ./e2e/scripts/seed-and-run.sh retention-due e2e/flows/retention/$f.yaml
done
```

(Adjust scenario per file if its current `SEED_SCENARIO:` documentation differs.)

- [ ] **Step 4: Report back** — file list + verification output + single commit message:
`test(e2e): retire stale retention testIDs across topic-detail/recall-review/failed-recall/library [LEARN-12, LEARN-13, LEARN-14, LEARN-16]`

### Task 1.9: Fix relearn flow drift

**Files:**
- `apps/mobile/e2e/flows/retention/relearn-flow.yaml`
- `apps/mobile/e2e/flows/retention/relearn-child-friendly.yaml`
- Source of truth: `apps/mobile/src/app/(app)/topic/relearn/*` (phase pickers)

**Drift:** assert `relearn-different-method`, `relearn-same-method`, `relearn-back-to-choice`. Replaced by phase-picker testIDs `relearn-subjects-phase`, `relearn-topics-phase`, `relearn-method-phase`.

- [ ] **Step 1: Inspect the relearn route and capture exact current testIDs**

```bash
grep -rn "testID=\"relearn-" apps/mobile/src/app/\(app\)/topic/relearn/
```

Quote the actual testIDs into the test before continuing — do not assume the names listed above are current.

- [ ] **Step 2: Update assertions to traverse the three phases (subjects → topics → method) using the new testIDs.**

- [ ] **Step 3: Verify**

```bash
./e2e/scripts/seed-and-run.sh failed-recall-3x e2e/flows/retention/relearn-flow.yaml
./e2e/scripts/seed-and-run.sh failed-recall-3x e2e/flows/retention/relearn-child-friendly.yaml
```

- [ ] **Step 4: Report back** — single commit message:
`test(e2e): use phase-picker testIDs in relearn flows [LEARN-15]`

### Task 1.10: Fix `dictation/dictation-full-flow.yaml` — drop hardcoded "Leave"

**Two commits.** A source change to add a testID, then the YAML change that uses it. These travel under different commit prefixes.

**Files:**
- (Commit A) Modify: `apps/mobile/src/app/(app)/dictation/playback.tsx`
- (Commit B) Modify: `apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml`
- Source of truth: `apps/mobile/src/app/(app)/dictation/playback.tsx`, `apps/mobile/src/i18n/locales/en/translation.json`

**Drift:** taps `text: "Leave"` for the mid-dictation exit confirm; that string is now `t()`-keyed so non-en locales fail.

- [ ] **Step 1: Find the testID for the Leave button**

```bash
grep -n "Leave\|exit-confirm" apps/mobile/src/app/\(app\)/dictation/playback.tsx
```

- [ ] **Step 2 (Commit A — source):** If no testID exists, add `testID="dictation-exit-confirm"` to the Leave button. Run targeted tests:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/dictation/playback.tsx --no-coverage
pnpm exec tsc --noEmit
```

Report file: `apps/mobile/src/app/(app)/dictation/playback.tsx`. Commit message:
`feat(mobile): add testID for dictation exit confirm [DICT-05]`

- [ ] **Step 3 (Commit B — YAML):** After Commit A lands, replace the YAML tap:

```yaml
- tapOn:
    id: "dictation-exit-confirm"
```

Verify: `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/dictation/dictation-full-flow.yaml`.

Commit message:
`test(e2e): use testID for dictation exit confirm to survive i18n [DICT-05]`

### Task 1.11: Fix `homework/camera-ocr.yaml` — assert both permission sub-states

**Files:**
- Modify: `apps/mobile/e2e/flows/homework/camera-ocr.yaml`
- Add: `apps/mobile/e2e/flows/homework/camera-permission-denied.yaml`
- Add: `apps/mobile/e2e/scripts/seed-and-run-permdenied.sh` (small wrapper around `seed-and-run.sh` that revokes camera permission first)
- Source of truth: `apps/mobile/src/app/(app)/homework/camera.tsx`

**Drift:** only `grant-permission-button` (first-request) is exercised; `open-settings-button` (permanently-denied) is not.

> **Why a wrapper script:** `seed-and-run.sh` documents *"Issue 13 (Maestro 2.2.0 `runScript __maestro undefined`)"* — the entire harness exists because in-flow `runScript` is unreliable. Don't reintroduce that bug. Drive ADB-side state changes from the wrapper.

- [ ] **Step 1: Add `seed-and-run-permdenied.sh`** — a thin wrapper that runs:

```bash
#!/usr/bin/env bash
set -euo pipefail
ADB="${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}"
"$ADB" shell pm clear com.mentomate.app    # ensures permission state is reset
"$ADB" shell pm revoke com.mentomate.app android.permission.CAMERA || true
exec "$(dirname "$0")/seed-and-run.sh" "$@"
```

- [ ] **Step 2: Write `camera-permission-denied.yaml`** — flow asserts the permanently-denied state:

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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

- [ ] **Step 3: In the original `camera-ocr.yaml`, drop the permanently-denied comment-only block; keep only the first-request path so each flow has one purpose.**

- [ ] **Step 4: Verify**

```bash
./e2e/scripts/seed-and-run-permdenied.sh homework-ready e2e/flows/homework/camera-permission-denied.yaml
./e2e/scripts/seed-and-run.sh homework-ready e2e/flows/homework/camera-ocr.yaml
```

- [ ] **Step 5: Report back** — commit message:
`test(e2e): cover permanently-denied camera permission via wrapper script [HOMEWORK-02, HOMEWORK-07]`

### Task 1.12: Fix `parent/child-drill-down.yaml` — assert `topic-understanding-card`

**Files:**
- Modify: `apps/mobile/e2e/flows/parent/child-drill-down.yaml`
- Source of truth: `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:169`

**Drift:** asserts `topic-status-card` but never the renamed `topic-understanding-card`.

**Prerequisite:** Step 2 depends on Stage 0 `parent-proxy` seed.

- [ ] **Step 1: Add an assertion after the existing `topic-detail-screen` wait**

```yaml
- assertVisible:
    id: "topic-understanding-card"
- assertVisible:
    id: "topic-retention-card"
    optional: true   # gated on data presence — permitted use of optional
```

Verify with the existing parent scenario: `./e2e/scripts/seed-and-run.sh parent-with-children e2e/flows/parent/child-drill-down.yaml`.

- [ ] **Step 2: Add transcript-link gating check via `parent-proxy` seed.** Once Stage 0 `parent-proxy` lands, append an assertion that the transcript link is NOT visible to the parent in proxy mode:

```yaml
- assertNotVisible:
    id: "view-full-transcript-link"
```

Verify: `./e2e/scripts/seed-and-run.sh parent-proxy e2e/flows/parent/child-drill-down.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): assert topic-understanding-card + parent-proxy transcript gate [PARENT-10, PARENT-05]`

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
    optional: true   # only when subscription.trialEndsAt is set — permitted use of optional
```

- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh trial-active e2e/flows/billing/subscription-details.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): assert trial-banner testID + ends-at [BILLING-11, BUG-966]`

### Task 1.14: Rename `onboarding/settings-language-edit.yaml` to clarify scope

**Files:**
- Rename: `apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml` → `apps/mobile/e2e/flows/account/tutor-language-edit.yaml`
- Update: `docs/flows/mobile-app-flow-inventory.md` ACCOUNT-29 row

**Drift:** the inventory cites this file as ACCOUNT-28 (App language) coverage but it actually tests ACCOUNT-29 (Tutor language). The App language test is missing — Task 2.7 below writes it.

- [ ] **Step 1: Rename file** — `git mv apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml apps/mobile/e2e/flows/account/tutor-language-edit.yaml`. Update `docs/flows/mobile-app-flow-inventory.md` ACCOUNT-29 cell to point at the new path.

- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/tutor-language-edit.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): rename to clarify scope is tutor language not app language [ACCOUNT-29]`

---

## Stage 2 — Add Missing P1 Tests (Recently Shipped Flows)

These are flows that shipped in the last ~2 weeks with zero E2E coverage. Highest leverage: each one is the entry point of a new feature.

> **Stage 0 dependency:** all tasks in this stage consume new seed scenarios. Do not start a task until its required seed is wired and smoke-tested per Stage 0.

### Task 2.1: LEARN-23 — Session transcript view

**Prerequisite seeders (Stage 0):** `session-with-transcript`, `parent-proxy`.

**Files:**
- Create: `apps/mobile/e2e/flows/learning/session-transcript.yaml`
- Create: `apps/mobile/e2e/flows/learning/session-transcript-parent-proxy.yaml`
- Source: `apps/mobile/src/app/session-transcript/[sessionId].tsx`

**testIDs to assert:** `session-transcript-screen`, `transcript-message-${idx}`, `transcript-back`. Also verify the `View full transcript` link from session-summary navigates here.

- [ ] **Step 1: Write `session-transcript.yaml`**

```yaml
appId: com.mentomate.app
tags: [nightly, learning]
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
- extendedWaitUntil:
    visible:
      id: "learner-screen"
    timeout: 15000
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

Verify: `./e2e/scripts/seed-and-run.sh session-with-transcript e2e/flows/learning/session-transcript.yaml`.

- [ ] **Step 2: Write `session-transcript-parent-proxy.yaml`** — parent profile viewing a child's session, asserts `view-full-transcript-link` is **NOT** visible (privacy gate). Use `_setup/switch-to-parent.yaml` if the seed lands on the child profile.

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
- runFlow:
    file: ../_setup/switch-to-parent.yaml
- tapOn:
    id: "child-card-${CHILD_ID}"
- tapOn:
    id: "session-card-${SESSION_ID}"
- extendedWaitUntil:
    visible:
      id: "session-summary-screen"
    timeout: 10000
- assertNotVisible:
    id: "view-full-transcript-link"
```

Verify: `./e2e/scripts/seed-and-run.sh parent-proxy e2e/flows/learning/session-transcript-parent-proxy.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): add session transcript + parent-proxy gate [LEARN-23, BUG-889]`

### Task 2.2: LEARN-24 — Saved bookmarks screen

**Prerequisite seeders (Stage 0):** `with-bookmarks`. Parent-proxy variant additionally needs `parent-proxy`.

**Files:**
- Create: `apps/mobile/e2e/flows/progress/saved-bookmarks.yaml`
- Create: `apps/mobile/e2e/flows/progress/saved-bookmarks-parent-proxy.yaml`
- Source: `apps/mobile/src/app/(app)/progress/saved.tsx`

**testIDs to assert:** `saved-bookmarks-screen`, `bookmark-row-${id}`, `bookmark-delete-${id}`, `bookmark-empty-state`.

- [ ] **Step 1: Write flow exercising list, expand-on-tap, swipe-delete with confirm**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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

Verify: `./e2e/scripts/seed-and-run.sh with-bookmarks e2e/flows/progress/saved-bookmarks.yaml`.

- [ ] **Step 2: Add parent-proxy variant** asserting `bookmark-delete-${id}` is NOT visible. Verify: `./e2e/scripts/seed-and-run.sh parent-proxy e2e/flows/progress/saved-bookmarks-parent-proxy.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): saved bookmarks list + swipe-delete + parent-proxy [LEARN-24]`

### Task 2.3: LEARN-25 — Library inline search

**Prerequisite seeders:** `learning-active` (existing) suffices — book IDs come from the seed.

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

Verify: `./e2e/scripts/seed-and-run.sh learning-active e2e/flows/learning/library-search.yaml`.

- [ ] **Step 2: Report back** — commit message:
`test(e2e): library inline search debounce + empty state [LEARN-25]`

### Task 2.4: PARENT-13 — Child weekly report detail

**Prerequisite seeder (Stage 0):** `parent-with-weekly-report`.

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-weekly-report.yaml`
- Source: `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx`

**testIDs:** `child-weekly-report-hero`, `child-weekly-report-metric-sessions`, `child-weekly-report-metric-minutes`, `child-weekly-report-metric-topics`, `child-weekly-report-back`.

- [ ] **Step 1: Write flow that deep-links into the route via the parent reports list**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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

Verify: `./e2e/scripts/seed-and-run.sh parent-with-weekly-report e2e/flows/parent/child-weekly-report.yaml`.

- [ ] **Step 2: Add error-retry variant** asserting `child-weekly-report-error-retry` (defer if no failure-injection seed exists; track as follow-up).

- [ ] **Step 3: Report back** — commit message:
`test(e2e): child weekly report detail [PARENT-13]`

### Task 2.5: PARENT-11 — Session recap block

**Prerequisite seeders (Stage 0):** `parent-session-with-recap` (populated arm), `parent-session-recap-empty` (empty arm).

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-session-recap.yaml`
- Create: `apps/mobile/e2e/flows/parent/child-session-recap-empty.yaml`
- Source: `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`

**testIDs:** `session-recap-narrative`, `session-recap-highlight`, `session-recap-conversation-prompt`, `session-recap-copy-prompt`, `session-recap-copy-prompt-toast`, `engagement-chip-${signal}`.

> **Toast assertion:** before writing the YAML, grep source for the testID of the "Copied" toast (`grep -rn "Copied\|copy-prompt-toast" apps/mobile/src/app/\(app\)/child/`). If the toast has no testID, add one in a separate source-only commit (per Task 1.10's pattern). Do not assert `text: "Copied"` against a transient toast.

- [ ] **Step 1: Write populated recap flow**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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
    id: "session-recap-copy-prompt-toast"
    optional: true   # transient toast — permitted use of optional
- assertVisible:
    id: "engagement-chip-curious"
```

Verify: `./e2e/scripts/seed-and-run.sh parent-session-with-recap e2e/flows/parent/child-session-recap.yaml`.

- [ ] **Step 2: Empty-recap variant** for pre-backfill sessions: assert metrics render but `session-recap-narrative` is NOT visible. Verify: `./e2e/scripts/seed-and-run.sh parent-session-recap-empty e2e/flows/parent/child-session-recap-empty.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): parent session recap populated + empty [PARENT-11]`

### Task 2.6: PARENT-12 — Subject retention badge gating

**Prerequisite seeders (Stage 0):** `parent-subject-with-retention`, `parent-subject-no-retention`.

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-subject-retention.yaml` (Arm A — has retention)
- Create: `apps/mobile/e2e/flows/parent/child-subject-no-retention.yaml` (Arm B — no retention)
- Source: `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx`

**Behaviour:** retention badge should only render when `retentionStatus` is present AND `totalSessions >= 1`. Unknown retention must NOT render "At risk".

- [ ] **Step 1: Arm A** — assert badge present.

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
- runFlow:
    file: ../_setup/switch-to-parent.yaml
# ... navigate to child subject ...
- assertVisible:
    id: "subject-retention-badge"
```

Verify: `./e2e/scripts/seed-and-run.sh parent-subject-with-retention e2e/flows/parent/child-subject-retention.yaml`.

- [ ] **Step 2: Arm B** — assert badge absent and "At risk" copy not rendered.

```yaml
- assertNotVisible:
    id: "subject-retention-badge"
- assertNotVisible:
    text: "At risk"
```

Verify: `./e2e/scripts/seed-and-run.sh parent-subject-no-retention e2e/flows/parent/child-subject-no-retention.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): parent subject retention badge gating [PARENT-12]`

### Task 2.7: ACCOUNT-28 — App language (UI locale) edit

**Prerequisite seeders:** `onboarding-complete` (existing).

**Files:**
- Create: `apps/mobile/e2e/flows/account/app-language-edit.yaml`
- Source: `apps/mobile/src/app/(app)/more.tsx` (search `settings-app-language`)

**testIDs:** `settings-app-language`, `language-picker-backdrop`, `language-option-en`, `language-option-nb`, `language-option-de`, `language-option-es`, `language-option-pl`, `language-option-pt`, `language-option-ja`.

- [ ] **Step 1: Write flow that opens the bottom sheet, selects nb, asserts a known nb string is rendered, then resets to en.**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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

Verify: `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/app-language-edit.yaml`.

- [ ] **Step 2: Report back** — commit message:
`test(e2e): app language bottom sheet picker [ACCOUNT-28]`

### Task 2.8: BILLING-12 — Pro/Family static comparison cards

**Prerequisite seeders (Stage 0):** `subscription-family-active`, `subscription-pro-active`.

**Files:**
- Create: `apps/mobile/e2e/flows/billing/static-comparison-family.yaml`
- Create: `apps/mobile/e2e/flows/billing/static-comparison-pro.yaml`
- Source: `apps/mobile/src/app/(app)/subscription.tsx` (`getTiersToCompare`)

**testIDs:** `static-tier-family`, `static-tier-pro`.

- [ ] **Step 1: Family-tier user — should see Pro card, NOT Family card**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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
    id: "static-tier-family"
```

Verify: `./e2e/scripts/seed-and-run.sh subscription-family-active e2e/flows/billing/static-comparison-family.yaml`.

- [ ] **Step 2: Mirror flow** — Pro-tier user should see Family card, NOT Pro card. Verify: `./e2e/scripts/seed-and-run.sh subscription-pro-active e2e/flows/billing/static-comparison-pro.yaml`.

- [ ] **Step 3: Report back** — commit message:
`test(e2e): pro/family static comparison cards [BILLING-12, BUG-917]`

### Task 2.9: BILLING-08 — Family pool section

**Prerequisite seeder (Stage 0):** `subscription-family-active`.

**Files:**
- Create: `apps/mobile/e2e/flows/billing/family-pool.yaml`
- Source: `apps/mobile/src/app/(app)/subscription.tsx` (`family-pool-section`)

- [ ] **Step 1: Write flow seeded with a family-tier user that asserts `family-pool-section` is visible.**

```yaml
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
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

Verify: `./e2e/scripts/seed-and-run.sh subscription-family-active e2e/flows/billing/family-pool.yaml`.

- [ ] **Step 2: Report back** — commit message:
`test(e2e): family pool section visibility [BILLING-08]`

---

## Stage 3 — Add Missing P2 Tests (Practice / Quiz / Dictation Gaps)

### Task 3.1: PRACTICE-01..04 — Practice hub navigation + recitation + empty state

**Prerequisite seeders:** existing `learning-active` for hub navigation + recitation; need a new `review-empty` seed for the all-caught-up state (totalOverdue === 0). Add to Stage 0 if not present.

**Files:**
- Create: `apps/mobile/e2e/flows/practice/practice-hub-navigation.yaml`
- Create: `apps/mobile/e2e/flows/practice/recitation-session.yaml`
- Create: `apps/mobile/e2e/flows/practice/all-caught-up.yaml`
- Source: `apps/mobile/src/app/(app)/practice.tsx`, `apps/mobile/src/app/(app)/session/index.tsx`

- [ ] **Step 1: `practice-hub-navigation.yaml`** — taps every menu item in turn (`practice-review`, `practice-recitation`, `practice-dictation`, `practice-quiz`, `practice-quiz-history`) and asserts the destination screen. Verify: `./e2e/scripts/seed-and-run.sh learning-active ...`.
- [ ] **Step 2: `recitation-session.yaml`** — taps `practice-recitation`, asserts session screen with `mode=recitation`, sends one chat message, exits.
- [ ] **Step 3: `all-caught-up.yaml`** — uses a seed where `totalOverdue === 0`; asserts `review-empty-state` and `review-empty-browse` deep-link to library.
- [ ] **Step 4: Report back** — single commit message:
`test(e2e): practice hub navigation + recitation + all-caught-up [PRACTICE-01..04]`

### Task 3.2: QUIZ-05 — Mid-round quit Modal

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-quit-modal.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/play.tsx` (`quiz-quit-modal-backdrop`)

- [ ] **Step 1: Start a round, tap the close icon, assert backdrop, tap cancel, confirm round still active. Then close again, tap confirm, assert return to quiz index.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh learning-active e2e/flows/quiz/quiz-quit-modal.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): mid-round quit modal [QUIZ-05]`

### Task 3.3: QUIZ-08 — Quota / consent / forbidden errors

**Prerequisite seeders (Stage 0):** `quota-exceeded`, `forbidden`. `consent-pending` already exists.

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-error-quota.yaml`
- Create: `apps/mobile/e2e/flows/quiz/quiz-error-consent.yaml`
- Create: `apps/mobile/e2e/flows/quiz/quiz-error-forbidden.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/launch.tsx` (typed `ApiResponseError.code`)

- [ ] **Step 1: Each flow asserts the error message renders and Retry is suppressed.**
- [ ] **Step 2: Verify with each scenario** (`quota-exceeded`, `consent-pending`, `forbidden`).
- [ ] **Step 3: Report back** — commit message: `test(e2e): quiz launch error states [QUIZ-08]`

### Task 3.4: QUIZ-11 — Malformed-round guard

**Prerequisite seeder (Stage 0):** `quiz-malformed-round`.

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-malformed-round.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/play.tsx` (BUG-812 / F-015)

- [ ] **Step 1: Assert `quiz-play-malformed` and tap `quiz-play-malformed-back`.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh quiz-malformed-round e2e/flows/quiz/quiz-malformed-round.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): malformed-round guard [QUIZ-11]`

### Task 3.5: QUIZ-12 — Wrong-answer dispute

**Prerequisite seeder (Stage 0):** `quiz-deterministic-wrong-answer`.

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-dispute.yaml`
- Source: `apps/mobile/src/app/(app)/quiz/play.tsx` (BUG-927)

- [ ] **Step 1: Force a wrong answer (deterministic seed); tap `quiz-dispute-button`; assert `quiz-dispute-noted`.**
- [ ] **Step 2: Also assert `quiz-dispute-button` is NOT visible after a correct answer.**
- [ ] **Step 3: Verify** — `./e2e/scripts/seed-and-run.sh quiz-deterministic-wrong-answer e2e/flows/quiz/quiz-dispute.yaml`.
- [ ] **Step 4: Report back** — commit message: `test(e2e): wrong-answer dispute [QUIZ-12, BUG-927]`

### Task 3.6: QUIZ-13 — Answer-check failure warning

**Prerequisite seeder (Stage 0):** `quiz-answer-check-fails`.

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-answer-check-failure.yaml`

- [ ] **Step 1: Assert the inline warning renders and the round continues.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh quiz-answer-check-fails e2e/flows/quiz/quiz-answer-check-failure.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): answer-check failure warning [QUIZ-13]`

### Task 3.7: DICT-07..10 — Photo review + remediation + perfect-score + result recording

**Prerequisite seeders:** likely need `dictation-with-mistakes` and `dictation-perfect-score` seeders. Add to Stage 0 if absent.

**Files:**
- Create: `apps/mobile/e2e/flows/dictation/dictation-review-flow.yaml`
- Create: `apps/mobile/e2e/flows/dictation/dictation-perfect-score.yaml`
- Source: `apps/mobile/src/app/(app)/dictation/review.tsx`, `apps/mobile/src/hooks/use-record-dictation-result.ts`

- [ ] **Step 1: `dictation-review-flow.yaml`** — completes a dictation, taps `complete-check-writing`, captures a photo (or uses gallery seed), asserts `review-remediation-screen`, taps `review-mistake-card`, types a correction in `review-correction-input`, taps `review-submit-correction`.
- [ ] **Step 2: `dictation-perfect-score.yaml`** — uses seed where `mistakes.length === 0`; asserts `review-celebration`.
- [ ] **Step 3: Verify** with the appropriate seeds.
- [ ] **Step 4: Report back** — commit message: `test(e2e): dictation review remediation + perfect-score [DICT-07..10]`

---

## Stage 4 — Add Missing P3 Tests (Auth / Account Hardening)

> **Investigate-before-code tasks:** AUTH-11, AUTH-13, AUTH-14 (Tasks 4.3, 4.4, 4.5) require harness pieces that do not exist. Each task starts with a **Step 0 — investigate and decide mechanism**. If no viable mechanism exists, defer the task to a follow-up plan and document the reason. Do not paper over with `runScript` or speculative ADB commands.

### Task 4.1: AUTH-05 — Additional sign-in verification branches

**Files:**
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-email-code.yaml`
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-totp.yaml`
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-phone.yaml`
- Create: `apps/mobile/e2e/flows/auth/sign-in-mfa-backup-code.yaml`

- [ ] **Step 1: For each MFA branch, write a seed-driven flow** (Clerk testing tokens; see `feedback_doppler_secrets`). If the testing-token environment is incomplete (CLERK_TESTING_TOKEN is currently a placeholder per CLAUDE.md), document which branch is blocked and skip — do not commit a flaky test.
- [ ] **Step 2: Verify each** — `./e2e/scripts/seed-and-run.sh --no-seed e2e/flows/auth/<file>.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): sign-in MFA branches [AUTH-05]`

### Task 4.2: AUTH-09 — SSO callback fallback

**Files:**
- Create: `apps/mobile/e2e/flows/auth/sso-callback-fallback.yaml`

- [ ] **Step 0: Investigate** — how to deterministically trigger an SSO callback failure on the dev-client. Options: (a) airplane-mode toggle via ADB during the callback; (b) Clerk testing-token rejection. Document chosen mechanism in the YAML header.
- [ ] **Step 1: Trigger the failure; assert the 10s timeout reveals `sso-fallback-back`; tap it and confirm return to sign-in.**
- [ ] **Step 2: Report back** — commit message: `test(e2e): SSO callback fallback [AUTH-09]`

### Task 4.3: AUTH-11 — Session-expired forced sign-out **(deferred pending mechanism decision)**

**Status:** **DEFERRED**. Clerk-Expo persists the session via `expo-secure-store` (Android Keystore-backed). `pm clear` wipes it but only takes effect at next launch — there is no documented mid-app primitive that produces Clerk's reactive session-expired path without a server-side token revocation.

- [ ] **Step 0: Pick a mechanism before writing any flow.** Two candidates:
  - **(a) Server-side revoke** via Clerk Admin API (sets the session invalid; next refresh fails). Needs a test endpoint on the API or a script that hits Clerk directly with the test backend secret.
  - **(b) Sub-second JWT TTL seed** — seed a profile whose Clerk JWT TTL is short enough that the next refresh fails reactively.
- [ ] **Step 1: Document the chosen mechanism** in this plan (edit this task) before scoping the flow. If neither option is feasible, mark AUTH-11 as code-only-tested and remove from this plan.
- [ ] **Step 2: Once mechanism lands, write `auth/session-expired-banner.yaml`** asserting forced sign-out occurs and the re-entry banner is consumed by sign-in.

### Task 4.4: AUTH-13 — Deep-link auth redirect preservation **(spec required before coding)**

**Status:** **NEEDS DESIGN** — the original task body is one bullet. Expand before scheduling.

- [ ] **Step 0: Specify the test before writing it.** Fill in the unknowns:
  - URI scheme to test (`com.mentomate.app://...` or universal link)
  - Concrete gated route (e.g. `/(app)/topic/<topicId>`)
  - ADB command used to trigger the deep link (`adb shell am start -a android.intent.action.VIEW -d "<uri>" com.mentomate.app`) — wrap in a small `seed-and-run-deeplink.sh` per Task 1.11's pattern; do **not** use Maestro `runScript`.
  - testID asserted on the deep-link landing screen.
- [ ] **Step 1: Write the flow** once Step 0 is filled in.
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run-deeplink.sh <scenario> <uri> e2e/flows/auth/deep-link-redirect.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): deep-link auth redirect preservation [AUTH-13]`

### Task 4.5: AUTH-14 — Sign-in transition stuck-state recovery **(deferred pending seed-side delay knob)**

**Status:** **DEFERRED**. The required seed (an environment where the auth-layout redirect is delayed > `SESSION_TRANSITION_MS`) does not exist in `test-seed.ts` and is non-trivial to inject because the delay lives in the mobile auth layout, not on the server. Two options:

- [ ] **Step 0: Choose a feasibility path:**
  - **(a)** Add a debug knob in the mobile auth layout that, when a SecureStore key is present, simulates a stuck transition. Set the key via the `seed-and-run-permdenied.sh`-style wrapper (`adb shell run-as`).
  - **(b)** Defer permanently and rely on unit-test coverage; remove this task from the plan.
- [ ] **Step 1+: Once a path is chosen, expand and write the flow.**

### Task 4.6: ACCOUNT-09 — Change password

**Files:**
- Create: `apps/mobile/e2e/flows/account/change-password.yaml`

- [ ] **Step 1: From More → Account Security → Change Password, type the current and new password, submit, assert success.** Use Clerk testing-token credentials (skip with a documented reason if CLERK_TESTING_TOKEN is still a placeholder).
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/change-password.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): change password [ACCOUNT-09]`

### Task 4.7: ACCOUNT-10 — Export my data (full flow)

**Files:**
- Create: `apps/mobile/e2e/flows/account/export-data.yaml`

- [ ] **Step 0: Read the current handler at `apps/api/src/routes/account.ts` (or wherever export lives) and quote the actual response shape into the plan.** Per CLAUDE.md "Match assertions to current behavior, not desired behavior" — do not assert on hypothesized email-only copy.
- [ ] **Step 1: From More → Export my data, accept the alert, assert the actual current success state (whatever Step 0 confirms).**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh onboarding-complete e2e/flows/account/export-data.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): export my data full flow [ACCOUNT-10]`

### Task 4.8: ACCOUNT-17 — Child memory consent prompt

**Files:**
- Create: `apps/mobile/e2e/flows/parent/child-memory-consent-prompt.yaml`

- [ ] **Step 1: Navigate to a child's mentor-memory; assert the consent prompt; tap accept; assert the memory list becomes interactive.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh parent-with-children e2e/flows/parent/child-memory-consent-prompt.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): child memory consent prompt [ACCOUNT-17]`

### Task 4.9: ACCOUNT-18 — Subject analogy preference after setup

**Files:**
- Create: `apps/mobile/e2e/flows/account/subject-analogy-preference.yaml`

- [ ] **Step 1: From a non-language subject, navigate to subject settings; assert the analogy-preference toggle is visible and persists.**
- [ ] **Step 2: Repeat against a language subject (`pedagogyMode === 'four_strands'`) and assert the toggle is hidden (BUG-939).** Use existing `language-subject-active` seed.
- [ ] **Step 3: Report back** — commit message: `test(e2e): subject analogy preference [ACCOUNT-18, BUG-939]`

### Task 4.10: ACCOUNT-30 — Impersonated-child More guard

**Files:**
- Create: `apps/mobile/e2e/flows/account/more-impersonated-child.yaml`

- [ ] **Step 1: Switch to a child profile via `_setup/switch-to-child.yaml`; navigate to More; assert `sign-out-button`, `delete-account-row`, `export-data-row`, `subscription-link` are all NOT visible.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh parent-with-children e2e/flows/account/more-impersonated-child.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): impersonated-child More guard [ACCOUNT-30]`

---

## Stage 5 — Add Missing P4 Tests (Home / Billing Edge Cases)

### Task 5.1: HOME-01 — Dedicated test of redesigned home

**Files:**
- Create: `apps/mobile/e2e/flows/learning/home-layout.yaml`

- [ ] **Step 1: One flow that asserts every redesigned home element in sequence:** `home-subject-carousel`, `home-add-subject-tile`, `home-ask-anything`, `home-action-study-new`, `home-action-homework`, `home-action-practice`, and the conditional `home-coach-band-continue` when feature flag is on.
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh learning-active e2e/flows/learning/home-layout.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): redesigned home layout [HOME-01]`

### Task 5.2: HOME-06 — Resume interrupted session

**Files:**
- Create: `apps/mobile/e2e/flows/learning/resume-interrupted-session.yaml`

- [ ] **Step 0: Decide injection mechanism** — SecureStore session-recovery marker via `adb shell run-as com.mentomate.app` write to the app's storage, or a server-side seed that produces an in-progress session. Pick one and document in the YAML header.
- [ ] **Step 1: Apply the chosen mechanism via wrapper script (not `runScript`); relaunch; assert the Continue affordance and tap to resume.**
- [ ] **Step 2: Report back** — commit message: `test(e2e): resume interrupted session [HOME-06]`

### Task 5.3: HOME-07 — Add-first-child gate (parent owners)

**Prerequisite seeder:** likely existing `parent-solo` covers a parent on family/pro plan with no child profiles. Verify in test-seed.ts at line 1410 before writing the flow.

**Files:**
- Create: `apps/mobile/e2e/flows/parent/add-first-child-gate.yaml`

- [ ] **Step 1: Assert "Add a child to get started" branch; tap CTA → `/create-profile`.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh parent-solo e2e/flows/parent/add-first-child-gate.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): add-first-child gate [HOME-07]`

### Task 5.4: HOME-08 — Home loading-timeout fallback

**Status:** **DEFERRED pending API-stub harness.** No documented stubbing infrastructure exists for "delay profile load > 10s." Two paths:

- [ ] **Step 0: Choose a feasibility path:**
  - **(a)** Add a server-side seed knob that delays GET `/me` by N seconds when a header is set. Trigger the header from a wrapper script.
  - **(b)** Use Maestro to airplane-mode the device after sign-in to force a network timeout — but this is flaky and may not exercise the same code path.
- [ ] **Step 1+: Once a path is chosen, write the flow** asserting `home-loading-timeout`, `home-loading-retry`, `timeout-library-button`, `timeout-more-button`.

### Task 5.5: LEARN-11 — Manage subject status

**Files:**
- Create: `apps/mobile/e2e/flows/learning/manage-subject-status.yaml`

- [ ] **Step 1: Open the manage-subject modal from library; toggle through active → paused → archived; assert each transition is reflected on the library shelf.**
- [ ] **Step 2: Verify** — `./e2e/scripts/seed-and-run.sh learning-active e2e/flows/learning/manage-subject-status.yaml`.
- [ ] **Step 3: Report back** — commit message: `test(e2e): manage subject status [LEARN-11]`

### Task 5.6: BILLING-02 — Upgrade purchase + polling indicator **(rescoped to seeded state machine)**

**Original scope** ("RevenueCat sandbox + mock receipt webhook") is rescoped because: (a) no precedent flow performs an actual sandbox purchase on the dev-client, (b) emulator dev-client may not have Play Store entitlement, (c) no webhook-mock infrastructure exists. Test the **state machine**, not the live purchase.

**Prerequisite seeders (Stage 0 if not present):** `purchase-pending` (subscription state in pending/polling), `purchase-confirmed` (post-webhook).

**Files:**
- Create: `apps/mobile/e2e/flows/billing/upgrade-pending-state.yaml`
- Create: `apps/mobile/e2e/flows/billing/upgrade-confirmed-state.yaml`

- [ ] **Step 1: `upgrade-pending-state.yaml`** — boot with `purchase-pending` seed; assert `purchase-polling-indicator` visible.
- [ ] **Step 2: `upgrade-confirmed-state.yaml`** — boot with `purchase-confirmed` seed; assert tier upgrade is reflected on subscription screen.
- [ ] **Step 3: Verify** with each scenario.
- [ ] **Step 4: Live RevenueCat sandbox purchase** — out of scope for this plan. Track as separate followup once a sandbox automation harness exists.
- [ ] **Step 5: Report back** — commit message: `test(e2e): upgrade pending + confirmed state machine [BILLING-02]`

### Task 5.7: BILLING-09 — Top-up flow **(scope check before coding)**

**Files:**
- Create: `apps/mobile/e2e/flows/billing/top-up.yaml`

- [ ] **Step 0: Verify whether top-up uses live RevenueCat sandbox or a server-side credit grant.** If it requires a live sandbox purchase, defer (same reason as BILLING-02). If it can be tested against a seeded balance, proceed.
- [ ] **Step 1: From subscription screen, scroll to top-up section; tap top-up; complete sandbox purchase (or seed-driven credit grant); assert credit balance updated.**
- [ ] **Step 2: Report back** — commit message: `test(e2e): top-up flow [BILLING-09]`

### Task 5.8: BILLING-10 — BYOK waitlist (deferred)

- [ ] **Step 1: Skip — BYOK UI is currently commented out in source.** Add this task to the audit's deferred list and revisit once the feature un-comments.

---

## Stage 6 — Audit Doc Maintenance

### Task 6.1: Update inventory + audit after each stage

**Files:**
- Modify: `docs/flows/mobile-app-flow-inventory.md`
- Modify: `docs/flows/e2e-coverage-audit.md`

- [ ] **Step 1: After each stage, update the Coverage column in the inventory and the Status column in the audit so future readers see current truth.**
- [ ] **Step 2: Report back per stage** — commit message: `docs(flows): refresh inventory + audit after Stage N`

### Task 6.2: Tighten testID integrity allowlist (after Stage 1 fully lands)

**Files:**
- Modify: `apps/mobile/src/lib/__tests__/e2e-testid-integrity.test.ts`

> This task owns **all** allowlist edits to avoid breaking the integrity test mid-Stage-1. Do not run until every Stage 1 task has merged.

- [ ] **Step 1: Remove the now-unused entries** from the known-stale allowlist (`retention-card`, `primary-action-button`, `more-ways-toggle`, `secondary-recall-check`, `relearn-different-method`, `relearn-same-method`, `relearn-back-to-choice`, `library-tab-shelves`, `library-tab-books`, `streak-badge`).
- [ ] **Step 2: Run the integrity test** — `cd apps/mobile && pnpm exec jest src/lib/__tests__/e2e-testid-integrity.test.ts --no-coverage`. Fix any new mismatches by updating the YAML, **not** by re-allowlisting. Per CLAUDE.md: *"Failing test = bug in code, not test."*
- [ ] **Step 3: Report back** — commit message: `chore(e2e): tighten testID integrity allowlist after Stage 1`

### Task 6.3: Wire Stage 1 flows into nightly Maestro Cloud job

**Files:**
- Modify: CI config that drives the nightly Maestro Cloud run (verify location: `.github/workflows/*.yml` or Maestro Cloud project config).

- [ ] **Step 1: Once Stage 1 flows pass cleanly, ensure they are tagged `[pr-blocking, <area>]`** per the Tagging convention above.
- [ ] **Step 2: Update the nightly job's flow filter** to include the new tags.
- [ ] **Step 3: Report back** — commit message: `ci(e2e): include Stage 1 fixed flows in nightly Maestro Cloud run`

---

## Notes for Executor

- **Subagents do NOT commit.** Per CLAUDE.md `feedback_agents_commit_push.md` and `feedback_concurrent_agent_commits.md`. Each task ends with a "Report back" step that lists files changed and a suggested commit message. The coordinator commits sequentially via `/commit`. If you find yourself reaching for `git add` or `git commit`, stop — that's the coordinator's job.

- **Seed scenarios:** Stage 0 must land before Stages 2-5. Stage 1 only depends on existing seeds (`onboarding-complete`, `learning-active`, `retention-due`, `homework-ready`, `trial-active`, `parent-with-children`, `failed-recall-3x`, `multi-subject`, `multi-subject-practice`, `language-subject-active`, `parent-solo`, `consent-pending`). Verify any scenario name against `SCENARIO_MAP` in `apps/api/src/services/test-seed.ts:1918` before invoking it.

- **Always invoke flows through `seed-and-run.sh`** — never bare `maestro test`. The wrapper handles seeding, app reset, and credential env vars. For pre-auth flows, use `--no-seed`.

- **`runScript` is unreliable** on Maestro 2.2.0 (Issue 13). For ADB-side state changes (revoke permission, set SecureStore key, send deep-link intent), wrap in a small shell script alongside `seed-and-run.sh`.

- **`optional: true` is forbidden as a workaround.** Permitted only for landing-screen branches, data-gated UI, and transient toasts.

- **Run order:** stages are sequenced by dependency (Stage 0 → 1 in parallel → 2-5 in parallel after 0 → 6). Within Stage 1, the library-v3 cluster (1.3, 1.4, 1.5, 1.6, 1.7) runs sequentially under one agent. Other tasks within a stage are independent and can parallelize.

- **CI integration:** Task 6.3 wires Stage 1 flows into the nightly Maestro Cloud job once they pass cleanly, so silent-pass regressions can't return.
