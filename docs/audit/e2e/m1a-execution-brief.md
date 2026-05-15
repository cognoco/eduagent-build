> **STATUS: ACTIVE** — execution brief for M1-A (Maestro drift repair). Structured agent execution, not /goal.

# M1-A Execution Brief — Maestro Drift Repair

**Phase:** M1-A (Mobile E2E trustworthiness — drift repair)
**Execution model:** Structured agent brief (Option 2). Execute steps in order; improvise on unexpected failures.
**Prerequisite:** PRs #262 and #273 merged to main.
**Execution environment:** Machine with Android SDK, Pixel API 34 emulator, Maestro CLI, ADB, Node.js, `rg`.
**Parent doc:** `docs/audit/e2e/scope-proposal.md` §5 (M1)
**Companion:** `docs/audit/e2e/m1b-execution-brief.md` (separate work package, runs after M1-A lands)

---

## Problem

Three categories of drift make Maestro flow pass/fail signals untrustworthy:

1. **Stale More-tab anchor (highest priority).** 23 files (pre-merge; ~51 post-merge) use `learning-accommodation-section-header` as a "More tab loaded" wait anchor. That testID lives on the Learning Preferences **sub-screen** (`apps/mobile/src/app/(app)/more/learning-preferences.tsx:53`), not the More index screen. The More index `SectionHeader` at `index.tsx:135` has **no testID**. Every usage is a wait for an element on a different screen.

2. **Deprecated launch patterns.** 18 files reference the deprecated `launchApp` command or `_setup/launch-devclient.yaml` helper.

3. **Masked assertions.** 294 `optional: true` occurrences across 78 files potentially hide real failures.

**Sanity check (verified 2026-05-15):**
- Zero usages are legitimate Learning Preferences navigation — all 30 occurrences (23 files) are "More tab loaded" waits.
- Replacement target `more-row-learning-preferences` exists in app source (`more/index.tsx:142`) and has zero existing usage in flows — no collision risk.
- Post-merge count will be ~51 files / ~59 occurrences; same pattern, same replacement.

---

## Step 0: Baseline sweep

Run on the execution machine AFTER PRs land on main. Record all outputs — these are the M1-A entry baseline.

```bash
cd apps/mobile/e2e

# Stale anchor count (expected: ~51 post-merge)
rg -l "learning-accommodation-section-header" flows | tee /tmp/m1a-stale-anchor.txt | wc -l

# Deprecated launch count (expected: ~18)
rg -l "launchApp|_setup/launch-devclient.yaml" flows | tee /tmp/m1a-deprecated-launch.txt | wc -l

# optional:true count (expected: ~294 across ~78 files)
rg -c "optional: true" flows | sort -t: -k2 -rn | tee /tmp/m1a-optional.txt
rg "optional: true" flows | wc -l
```

---

## Step 1: Create `_setup/nav-to-more.yaml` helper

**File:** `apps/mobile/e2e/flows/_setup/nav-to-more.yaml`

```yaml
# Navigate to the More tab and wait for it to load.
# Precondition: bottom tab bar visible (learner-screen, parent-home-screen, or dashboard-scroll).
# Postcondition: More index screen loaded, more-row-learning-preferences visible.
appId: com.mentomate.app
---
- tapOn:
    text: "More"

- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000
```

**Why `more-row-learning-preferences`:** First settings row on the More index (`more/index.tsx:142`), always above the fold. `more-scroll` (the ScrollView container) also works but is less specific — a scroll container existing doesn't prove content rendered.

---

## Step 2: Create sub-screen navigation helpers

Each helper calls `nav-to-more.yaml`, taps the appropriate row, waits for the sub-screen scroll container.

Create under `apps/mobile/e2e/flows/_setup/`:

| File | Tap target | Wait anchor | Source reference |
|---|---|---|---|
| `nav-to-more-account.yaml` | `more-row-account` | `more-account-scroll` | `more/account.tsx:67` |
| `nav-to-more-notifications.yaml` | `more-row-notifications` | `more-notifications-scroll` | `more/notifications.tsx:121` |
| `nav-to-more-privacy.yaml` | `more-row-privacy` | `more-privacy-scroll` | `more/privacy.tsx:93` |
| `nav-to-more-learning-preferences.yaml` | `more-row-learning-preferences` | `learning-preferences-scroll` | `more/learning-preferences.tsx:51` |
| `nav-to-more-help.yaml` | `more-row-help` | `more-help-scroll` | `more/help.tsx:33` |

Template (adapt per row):

```yaml
# Navigate to More tab → [Sub-screen name].
# Precondition: bottom tab bar visible.
# Postcondition: [Sub-screen] scroll container visible.
appId: com.mentomate.app
---
- runFlow:
    file: nav-to-more.yaml

- tapOn:
    id: "[more-row-*]"

- extendedWaitUntil:
    visible:
      id: "[*-scroll]"
    timeout: 10000
```

**After this step:** Run `nav-to-more.yaml` on the emulator to verify the helper works before proceeding. This is the foundation everything else builds on.

---

## Step 3: Bulk stale anchor replacement

For every file in the baseline list (`/tmp/m1a-stale-anchor.txt`), replace the wait anchor:

```yaml
# BEFORE:
- extendedWaitUntil:
    visible:
      id: "learning-accommodation-section-header"
    timeout: 10000    # (timeout varies per file)

# AFTER:
- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000
```

Also update associated comments. Common patterns:
- `"Learning Mode is always above the fold"` → `"First settings row is always above the fold"`
- `"Wait for settings screen"` → `"Wait for More tab index"`
- `"Wait for More screen"` → (keep, it's already correct)

**Important:** This step is the mechanical anchor swap only. Files that ALSO need routing corrections (Category B below) get the anchor swap here and the routing fix in step 4.

**Verification after bulk replacement:**
```bash
rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows | wc -l
# Must return 0 at this point (all replaced)
```

---

## Step 4: Routing corrections (Category B files)

These files need more than an anchor swap — they navigate to sub-screen content that has moved in the More tab restructure.

### 4a: `_setup/switch-to-child.yaml`

The Profile row moved from the More index to the Account sub-screen.

**Current (broken):**
```yaml
- tapOn:
    text: "More"
- extendedWaitUntil:
    visible:
      id: "learning-accommodation-section-header"    # ← stale (fixed in step 3)
    timeout: 10000
- scrollUntilVisible:
    element:
      text: "Profile"                                 # ← "Profile" text no longer on More index
    direction: DOWN
    timeout: 10000
- tapOn:
    text: "Profile"                                   # ← same problem
```

**Fix:**
```yaml
- tapOn:
    text: "More"
- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000

# Profile is now inside the Account sub-screen
- tapOn:
    id: "more-row-account"
- extendedWaitUntil:
    visible:
      id: "more-account-scroll"
    timeout: 10000
- tapOn:
    id: "more-row-profile"
```

**This is a widely-used setup helper** — changes here affect every flow that calls it. After fixing, grep for `switch-to-child.yaml` callers and verify at least one on the emulator.

### 4b: `account/app-language-edit.yaml`

Language picker moved to Account sub-screen. After the anchor swap (step 3), update the navigation to go through Account: tap `more-row-account` → wait `more-account-scroll` → tap `settings-app-language`.

### 4c: `account/export-data.yaml`

Export moved to Privacy sub-screen. Navigate through Privacy: tap `more-row-privacy` → wait `more-privacy-scroll` → tap `more-row-export`.

### 4d: `account/learner-mentor-memory.yaml` and `learner-mentor-memory-populated.yaml`

Mentor Memory is accessible via `more-row-mentor-memory` directly on the More index (no sub-screen detour needed). These files have 2 occurrences each — both are "return to More tab" waits. Fix both anchors and verify the tap target is `more-row-mentor-memory`.

### 4e: Other account flows

For each remaining account/ file with the stale anchor, check what it taps after landing on the More index. If the tap target still exists on the More index (e.g., `more-row-account`, `sign-out-button`), only the anchor swap from step 3 is needed. If the target moved to a sub-screen, add the sub-screen navigation.

---

## Step 5: Rewrite `more-tab-navigation.yaml` (pr-blocking)

**File:** `apps/mobile/e2e/flows/account/more-tab-navigation.yaml`
**Tags:** `pr-blocking`, `account`, `navigation`

This is the only `pr-blocking` flow among the stale files.

**Current structure:**
- Lines 9-18: Seed + sign in + wait for learner-screen ✅
- Lines 20-26: Tap More + wait for stale anchor ❌
- Lines 28-50: Assert `accommodation-mode-*` testIDs ❌ (these live on the Accommodation sub-screen, two levels deep: More → Learning Preferences → Accommodation)
- Lines 52-198: Navigate sub-screens with correct testIDs ✅

**Fix — replace lines 20-50 with:**

```yaml
- tapOn:
    text: "More"

# Wait for More tab index — first settings row is always above the fold
- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000

# Assert all More index navigation rows
- assertVisible:
    id: "more-row-mentor-memory"
- assertVisible:
    id: "more-row-mentor-language"
- scrollUntilVisible:
    element:
      id: "more-row-notifications"
    direction: DOWN
    timeout: 15000
    speed: 50
    visibilityPercentage: 40
- assertVisible:
    id: "more-row-account"
- assertVisible:
    id: "more-row-privacy"
- assertVisible:
    id: "more-row-help"
- assertVisible:
    id: "sign-out-button"
```

Lines 52-198 remain unchanged (sub-screen navigation is already correct).

The accommodation mode checks (old lines 28-50) are dropped — they test Accommodation sub-screen content, not More-tab structure. If no dedicated accommodation flow exists, create `account/accommodation-modes.yaml` to cover that screen.

**After rewriting:** Run this flow on the emulator immediately — it's `pr-blocking` and must pass.

---

## Step 6: Deprecated launch sweep

### 6a: Create `apps/mobile/e2e/launch-legacy-allowlist.txt`

```
# Flows that legitimately use launchApp or _setup/launch-devclient.yaml
# because they test cold-start behavior, release builds, or ExpoGo.
flows/_setup/launch-devclient.yaml
flows/_setup/launch-expogo.yaml
flows/_setup/launch-release.yaml
flows/edge/animated-splash.yaml
flows/auth/sign-in-mfa-phone.yaml
flows/auth/sign-in-mfa-totp.yaml
flows/auth/sign-in-mfa-backup-code.yaml
flows/auth/sign-in-mfa-email-code.yaml
```

### 6b: Migrate non-allowlisted files

Files referencing `_setup/launch-devclient.yaml` that need migration:
- `app-launch-devclient.yaml`, `app-launch.yaml`
- `auth/forgot-password.yaml`, `auth/sign-in-navigation.yaml`, `auth/welcome-text-first-time.yaml`
- `regression/bug-236-*.yaml`, `regression/bug-237-*.yaml`, `regression/bug-240-*.yaml`

Files using bare `launchApp` that need migration:
- `billing/top-up.yaml`
- `post-auth-comprehensive-devclient.yaml`

**Migration pattern:** Replace `runFlow: _setup/launch-devclient.yaml` with `runFlow: _setup/seed-and-sign-in.yaml` (adding `SEED_SCENARIO` env), or convert the flow to be invoked via `seed-and-run.sh`.

For pre-auth flows (no seed needed), use `seed-and-run.sh --no-seed`.

### 6c: Verify

```bash
rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows \
  | while read f; do
      grep -qF "$(echo "$f" | sed 's|.*/flows/|flows/|')" apps/mobile/e2e/launch-legacy-allowlist.txt \
        && continue
      echo "NOT ALLOWLISTED: $f"
    done
# Must return zero lines
```

---

## Step 7: `optional: true` audit

### 7a: Create `apps/mobile/e2e/optional-allowlist.txt`

Systematic patterns that are always justified:

```
# System-level dialog dismissals (Android 13+ permissions, ANR, Bluetooth)
# These vary by device state and OS version — optional is correct.
flows/_setup/dismiss-notifications.yaml
flows/_setup/dismiss-anr.yaml
flows/_setup/dismiss-bluetooth.yaml
flows/_setup/dismiss-devtools.yaml
flows/_setup/dismiss-post-approval.yaml

# Persona routing in seed-and-sign-in.yaml
# Post-auth landing can be one of 3 screens (learner-screen, dashboard-scroll,
# parent-home-screen) depending on seed scenario — optional waits are by design.
flows/_setup/seed-and-sign-in.yaml
```

### 7b: Audit top offenders first

Start with the files that have the most `optional: true`:

| File | Count | Notes |
|---|---|---|
| `homework/camera-ocr.yaml` | 29 | Camera/OCR permission + HW variation |
| `quiz/quiz-dispute.yaml` | 17 | Quiz response timing |
| `parent/child-drill-down.yaml` | 16 | Persona-dependent UI |
| `onboarding/sign-up-flow.yaml` | 12 | Onboarding step variations |
| `quiz/quiz-malformed-round.yaml` | 9 | Error state timing |

For each occurrence, classify:
- **Remove:** Assertion should be mandatory. `optional: true` was masking a failure.
- **Justify:** Add `# justified: <reason>` on the same or immediately preceding line.
- **Allowlist:** Pattern is systematic → add to `optional-allowlist.txt`.

### 7c: Process remaining files

Apply the same classification to the remaining ~73 files. Most will be straightforward once the top offenders establish the heuristics.

### 7d: Verify

```bash
rg "optional: true" apps/mobile/e2e/flows | rg -v "# justified:" | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  basename=$(echo "$file" | sed 's|.*/flows/|flows/|')
  grep -qF "$basename" apps/mobile/e2e/optional-allowlist.txt && continue
  echo "UNJUSTIFIED: $line"
done
# Must return zero lines
```

---

## Step 8: Handle `post-auth-comprehensive-devclient.yaml`

This flow has 5 stale anchor occurrences and references theme sections (`"Teen (Dark)"`, `"Parent (Light)"`) that may not exist in the current UI. It uses bare `launchApp` (deprecated).

**Decision tree:**
1. If the theme references still exist in the app → fix anchors (step 3) + migrate launch (step 6) + verify on emulator.
2. If the theme references are stale → the flow needs a full rewrite. If rewrite is feasible within session scope, do it. If not, tag as `DEFERRED:M1-COMPREHENSIVE` and create a ticket.

Check:
```bash
rg "Teen.*Dark\|Parent.*Light" apps/mobile/src/ --include='*.tsx'
```

---

## Step 9: Verification runs

After all repairs:

```bash
# 1. Confirm stale anchors eliminated
rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows | wc -l
# Must return 0

# 2. Confirm deprecated launches within allowlist
rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows \
  | grep -v release | grep -v expogo | wc -l
# Must return only allowlisted files

# 3. Confirm optional:true justified or allowlisted
rg "optional: true" apps/mobile/e2e/flows | rg -v "# justified:" | wc -l
# Must return 0 (or all in allowlist)

# 4. Run all repaired flows on clean Pixel API 34 emulator — FIRST PASS
# Start with pr-blocking flow:
cd apps/mobile/e2e/scripts
./seed-and-run.sh onboarding-complete ../flows/account/more-tab-navigation.yaml
# Then run each repaired flow

# 5. SECOND PASS — no intervention between runs
# Repeat all repaired flows. Both passes must be green.
```

---

## Exit criteria (from scope proposal §5)

All four must hold in-session:

1. `rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows` → ≤ 2 results, each with inline comment justifying intentional Learning Preferences sub-screen navigation.
2. `rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows | grep -v release | grep -v expogo` → zero (after allowlist filtering).
3. `rg "optional: true" apps/mobile/e2e/flows | rg -v "# justified:"` → zero, OR every remaining match is in `optional-allowlist.txt`.
4. All repaired flows pass twice consecutively on clean Pixel API 34 emulator without intervention between runs.

---

## Risks

| Risk | Mitigation |
|---|---|
| `switch-to-child.yaml` routing fix breaks downstream flows | It's a widely-used helper — after fixing, grep callers and verify ≥1 on emulator before bulk-proceeding |
| `more-tab-navigation.yaml` rewrite introduces new failures | Run it immediately after rewriting — it's `pr-blocking`, don't batch it |
| `post-auth-comprehensive-devclient.yaml` unrepairable | Tag `DEFERRED:M1-COMPREHENSIVE`, create ticket, move on |
| Emulator instability during verification | `seed-and-run.sh` runs `pm clear`; between runs: `adb emu kill && emulator -avd Pixel_API_34 -no-snapshot` |
| Second consecutive run fails (state leakage) | Investigate emulator-level state (granted permissions persist across `pm clear`) |

---

## Source-of-truth files (read-only reference)

| File | What it provides |
|---|---|
| `apps/mobile/src/app/(app)/more/index.tsx` | More tab testIDs (`more-scroll`, `more-row-*`, `sign-out-button`) |
| `apps/mobile/src/app/(app)/more/account.tsx` | Account sub-screen testIDs (`more-account-scroll`, `more-row-profile`, `more-row-subscription`, `settings-app-language`) |
| `apps/mobile/src/app/(app)/more/learning-preferences.tsx` | Learning Prefs testIDs (`learning-preferences-scroll`, `learning-accommodation-section-header`, `accommodation-link`) |
| `apps/mobile/src/app/(app)/more/notifications.tsx` | Notifications testIDs (`more-notifications-scroll`, `push-notifications-toggle`, etc.) |
| `apps/mobile/src/app/(app)/more/privacy.tsx` | Privacy testIDs (`more-privacy-scroll`, `more-row-export`, `more-row-delete-account`) |
| `apps/mobile/src/app/(app)/more/help.tsx` | Help testIDs (`more-help-scroll`, `more-row-help-support`, `more-row-report-problem`) |
| `apps/mobile/src/components/more/settings-rows.tsx` | `SectionHeader` component — accepts optional `testID`; More index SectionHeaders have none |
| `apps/api/src/services/test-seed.ts` | Seed scenario names (45 scenarios) |
