# M1 Execution Spec — Maestro E2E Trustworthiness

## Context

The E2E quality uplift initiative follows this sequence: Phase 0 (done) → P1 (merging PRs #262 + #273) → **M1 (this spec)** → P3 → P4. M1 repairs the Maestro mobile E2E suite so its pass/fail signals are trustworthy.

The Maestro flows have three categories of drift:
1. **23+ flows** use `learning-accommodation-section-header` as a "More tab loaded" anchor — but that testID lives on the Learning Preferences **sub-screen** (`more/learning-preferences.tsx:53`), not the More index. After #262/#273 merge, this grows to ~51 files.
2. **18 flows** reference the deprecated `launchApp` / `_setup/launch-devclient.yaml` pattern.
3. **294 `optional: true`** occurrences across 78 files mask potential real failures.

This spec is planned on a headless machine and will be **executed on a separate machine** with Android SDK, Pixel API 34 emulator, and Maestro CLI.

---

## Sequencing: M1-A then M1-B (with partial overlap)

- **M1-A** (drift repair) must land first — M1-B's tag-set definition and inventory close-out depend on flows actually passing.
- **M1-B validator implementation (checks C1-C5)** can start in parallel with M1-A since those checks don't depend on the repairs.
- **M1-B checks C6-C7, tag set, inventory** require M1-A to be complete.

---

## M1-A — Drift Repair

### Step 0: Baseline sweep (post-merge, pre-work)

Re-verify all metrics on the execution machine after PRs land on main:

```bash
cd apps/mobile/e2e
rg -l "learning-accommodation-section-header" flows | tee /tmp/m1a-stale-anchor.txt | wc -l
rg -l "launchApp|_setup/launch-devclient.yaml" flows | tee /tmp/m1a-deprecated-launch.txt | wc -l
rg -c "optional: true" flows | sort -t: -k2 -rn | tee /tmp/m1a-optional.txt
rg "optional: true" flows | wc -l
```

Record these as the M1-A entry baseline. All exit criteria are measured against this snapshot.

### Step 1: Create `_setup/nav-to-more.yaml` helper

The foundational navigation helper. All stale-anchor repairs will reference this.

**File:** `apps/mobile/e2e/flows/_setup/nav-to-more.yaml`

```yaml
# Navigate to the More tab and wait for it to load.
# Precondition: bottom tab bar is visible (learner-screen, parent-home-screen, or dashboard-scroll).
# Postcondition: More index screen is loaded, more-row-learning-preferences is visible.
appId: com.mentomate.app
---
- tapOn:
    text: "More"

- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000
```

**Why `more-row-learning-preferences`:** It's the first settings row on the More index (`more/index.tsx:142`), always above the fold, semantically meaningful. The container `more-scroll` also works but is less specific.

### Step 2: Create sub-screen navigation helpers

Create under `apps/mobile/e2e/flows/_setup/`:

| Helper | Navigates to | Wait anchor |
|---|---|---|
| `nav-to-more-account.yaml` | Account sub-screen | `more-account-scroll` |
| `nav-to-more-notifications.yaml` | Notifications | `more-notifications-scroll` |
| `nav-to-more-privacy.yaml` | Privacy & Data | `more-privacy-scroll` |
| `nav-to-more-learning-preferences.yaml` | Learning Preferences | `learning-preferences-scroll` |
| `nav-to-more-help.yaml` | Help & Feedback | `more-help-scroll` |

Each helper: calls `nav-to-more.yaml` → taps the appropriate `more-row-*` → waits for the sub-screen scroll container.

### Step 3: Stale anchor replacement (bulk)

Two categories of files to repair:

**Category A — Inline anchor swap (simple):** Files that tap "More" and wait for the stale ID, then interact with elements on the More index. Replace the wait with `more-row-learning-preferences`:

```yaml
# BEFORE:
- extendedWaitUntil:
    visible:
      id: "learning-accommodation-section-header"
    timeout: 10000

# AFTER:
- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000
```

Also update the associated comment (e.g., "Learning Mode is always above the fold" → "First settings row is always above the fold").

Applies to: billing flows, `learning/core-learning.yaml`, `onboarding/create-profile-standalone.yaml`, `regression/bug-239-parent-add-child.yaml`, and others that only need the More index.

**Category B — Routing corrections:** Files that use the stale anchor AND then navigate to sub-screen content that has moved. These need both the anchor fix AND updated navigation steps.

Key examples:
- `account/app-language-edit.yaml` — language picker moved to Account sub-screen. After fix: nav to More → tap `more-row-account` → wait for `more-account-scroll` → tap `settings-app-language`.
- `account/export-data.yaml` — export moved to Privacy sub-screen.
- `account/learner-mentor-memory.yaml` — mentor memory accessible via `more-row-mentor-memory` on the More index (no sub-screen needed).

### Step 4: Fix `_setup/switch-to-child.yaml`

This setup helper is used by multiple flows. Current issues:
- Line 22: waits for stale `learning-accommodation-section-header`
- Lines 28-29: taps text "Profile" — but Profile row is now inside the Account sub-screen

**Fix:**
```yaml
# 1. Navigate to More tab
- tapOn:
    text: "More"

# 2. Wait for More screen to load
- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000

# 3. Navigate to Account sub-screen to find Profile
- tapOn:
    id: "more-row-account"
- extendedWaitUntil:
    visible:
      id: "more-account-scroll"
    timeout: 10000

# 4. Tap Profile row
- tapOn:
    id: "more-row-profile"
```

### Step 5: Rewrite `more-tab-navigation.yaml` (pr-blocking flow)

This is the only `pr-blocking` flow among the stale files. Current state:
- Lines 23-50 are broken: wait for stale anchor, then assert `accommodation-mode-*` testIDs that live on the Accommodation sub-screen (two levels deep: More → Learning Preferences → Accommodation).
- Lines 52-198 are correct: they navigate sub-screens using correct testIDs.

**Fix:** Replace lines 23-50 with correct More index assertions:

```yaml
# Wait for More tab to load
- extendedWaitUntil:
    visible:
      id: "more-row-learning-preferences"
    timeout: 15000

# Assert all More index rows
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

The accommodation mode checks (lines 28-50) should be dropped from this flow — they belong in a dedicated accommodation flow, not the master navigation test. If no dedicated accommodation flow exists, create one as part of this step.

Lines 52-198 remain unchanged (sub-screen navigation is already correct).

### Step 6: Deprecated launch sweep

**Migrate these files** from `_setup/launch-devclient.yaml` to `seed-and-sign-in.yaml`:
- `app-launch-devclient.yaml`, `app-launch.yaml`
- `auth/forgot-password.yaml`, `auth/sign-in-navigation.yaml`, `auth/welcome-text-first-time.yaml`
- `regression/bug-236-*.yaml`, `regression/bug-237-*.yaml`, `regression/bug-240-*.yaml`

**Keep on allowlist** (legitimate `launchApp` usage):
- `_setup/launch-*.yaml` (3 setup files)
- `edge/animated-splash.yaml` (tests restart behavior)
- `auth/sign-in-mfa-*.yaml` (4 MFA files)

**Create:** `apps/mobile/e2e/launch-legacy-allowlist.txt` listing the kept files.

### Step 7: `optional: true` audit

For each of the ~294 occurrences, classify as:
- **Remove:** assertion should be mandatory (was masking a failure)
- **Justify:** add `# justified: <reason>` on same/preceding line
- **Allowlist:** systematic pattern → add to `apps/mobile/e2e/optional-allowlist.txt`

**Systematic allowlist patterns** (create `optional-allowlist.txt`):
- System dialog dismissals (ANR, Bluetooth, notifications, devtools)
- Persona routing in `seed-and-sign-in.yaml` (3 possible post-auth screens)
- Permission gate `optional: true` on "Skip for now" buttons

Start with the top-5 offenders: `camera-ocr.yaml` (29), `quiz-dispute.yaml` (17), `child-drill-down.yaml` (16), `sign-up-flow.yaml` (12), `quiz-malformed-round.yaml` (9).

### M1-A Exit Criteria

All four from scope proposal §5 (M1-A):

1. `rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows` returns ≤ 2 results (intentional Learning Preferences sub-screen navigation, commented).
2. `rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows | grep -v release | grep -v expogo` returns zero (after allowlist exclusions).
3. `rg "optional: true" apps/mobile/e2e/flows | rg -v "# justified:"` returns zero, OR every match is in `optional-allowlist.txt`.
4. All repaired flows pass twice consecutively on clean Pixel API 34 emulator.

---

## M1-B — Validator + Tag Set + Inventory

### Step 1: Implement validator (`scripts/validate-maestro-flows.sh`)

Design spec: `docs/audit/e2e/validator-spec.md` (184 lines, 7 checks C1-C7).

**Implementation order** (simplest / fewest dependencies first):

| Order | Check | What it does | Dependencies |
|---|---|---|---|
| 1 | C1 | Missing `runFlow:` targets | None |
| 2 | C7 | Untagged flow files | Tag registry in CONVENTIONS.md |
| 3 | C4 | Invalid seed scenarios | None (reads `test-seed.ts`) |
| 4 | C5 | Legacy `launchApp` outside allowlist | `launch-legacy-allowlist.txt` (M1-A) |
| 5 | C2 | Deprecated `_setup/` helpers | Allowlist of current helpers |
| 6 | C3 | Stale testID references | `testid-allowlist.txt` (new) |
| 7 | C6 | Unjustified `optional: true` in pr-blocking/smoke | `optional-allowlist.txt` (M1-A), tag set defined |

**Key implementation note:** Bash + `rg` for v1. Must complete in < 5 seconds. Per-check env-var toggling for incremental adoption.

**Note:** Validator spec lists 31 seed scenarios; actual count is 45 (as of `test-seed.ts` current state). The validator should extract from source dynamically, not from a hardcoded list. Update spec accordingly.

**Create:** `apps/mobile/e2e/testid-allowlist.txt` for runtime-assembled testIDs (e.g., `subject-card-${subjectId}`, dynamic list indices).

### Step 2: Define `pr-blocking` tag set

**Criteria:**
1. Flow currently passes on clean emulator (verified post-M1-A)
2. Covers top-of-funnel or critical user path
3. Deterministic (no AI/timing flakiness)
4. Runs in < 90 seconds individually
5. Combined set runs in < 8 minutes total

**Starting candidates** — current 7 `pr-blocking` flows (post-repair) plus ~8-18 from `smoke`:

Current `pr-blocking`: `more-tab-navigation`, `delete-account`, `delete-account-scheduled`, `library-navigation`, `book-detail`, `multi-subject`, `practice-subject-picker`

Evaluate from `smoke`: `create-subject`, `view-curriculum`, `start-session`, `core-learning`, `first-session`, `consent-deny-confirmation`, `parent-dashboard`/`parent-tabs`, `recall-review`, `retention-review`, `subscription`, `bug-238-tab-bar-no-leak`

**Final set decided during execution** — only include flows verified green twice consecutively.

### Step 3: Update CONVENTIONS.md with tag registry

Add a "Tag Registry" section defining:
- **Execution tiers:** `pr-blocking`, `smoke`, `nightly`, `weekly`, `manual`
- **Domain tags:** `account`, `auth`, `billing`, `consent`, etc.
- **Special tags:** `devclient`, `gdpr`, `coppa`, `critical`, `visual`

### Step 4: Wire validator into CI

Add to `.github/workflows/docs-checks.yml`:
- New `maestro-validator` job
- Path triggers: `apps/mobile/e2e/flows/**/*.yaml`, `apps/mobile/e2e/*.txt`, `scripts/validate-maestro-flows.sh`
- `continue-on-error: true` initially (advisory)

### Step 5: Inventory close-out

For every row in `docs/flows/e2e-flow-coverage-audit-2026-05-13.md`:
- Map to existing flow file → mark as passing (if verified post-M1-A)
- Failing flow → investigate, fix, or annotate `DEFERRED:<ticket-id>`
- No flow exists → classify as `DEFERRED:INFRA-<n>` / `DEFERRED:CLERK-<n>` / `DEFERRED:DEVICE-<n>` (with reason)

### M1-B Exit Criteria

1. `bash scripts/validate-maestro-flows.sh` exits 0
2. Validator wired into `docs-checks.yml`
3. `pr-blocking` tag set defined in `CONVENTIONS.md`; 15-25 flows carry the tag
4. Every flow file has ≥ 1 tag (validator C7 enforces) — **already true** (verified: all 139 flows have frontmatter `tags:`)
5. Every inventory row → passing flow OR `DEFERRED:<ticket>` annotation

---

## Files Created / Modified

### New files
- `apps/mobile/e2e/flows/_setup/nav-to-more.yaml`
- `apps/mobile/e2e/flows/_setup/nav-to-more-account.yaml`
- `apps/mobile/e2e/flows/_setup/nav-to-more-notifications.yaml`
- `apps/mobile/e2e/flows/_setup/nav-to-more-privacy.yaml`
- `apps/mobile/e2e/flows/_setup/nav-to-more-learning-preferences.yaml`
- `apps/mobile/e2e/flows/_setup/nav-to-more-help.yaml`
- `apps/mobile/e2e/optional-allowlist.txt`
- `apps/mobile/e2e/testid-allowlist.txt`
- `apps/mobile/e2e/launch-legacy-allowlist.txt`
- `scripts/validate-maestro-flows.sh`

### Modified files
- ~51 flow files (stale anchor replacement — exact count from post-merge baseline)
- ~9 flow files (deprecated launch migration)
- ~78 flow files (`optional: true` justification/removal)
- `apps/mobile/e2e/flows/_setup/switch-to-child.yaml` (routing fix)
- `apps/mobile/e2e/flows/account/more-tab-navigation.yaml` (pr-blocking rewrite)
- `apps/mobile/e2e/CONVENTIONS.md` (tag registry)
- `.github/workflows/docs-checks.yml` (validator CI job)
- `docs/audit/e2e/validator-spec.md` (update scenario count 31→45)
- `docs/flows/e2e-flow-coverage-audit-2026-05-13.md` (inventory close-out)

### Key source-of-truth files (read-only reference during execution)
- `apps/mobile/src/app/(app)/more/index.tsx` — More tab testIDs
- `apps/mobile/src/app/(app)/more/account.tsx` — Account sub-screen testIDs
- `apps/mobile/src/app/(app)/more/learning-preferences.tsx` — Learning Prefs testIDs
- `apps/api/src/services/test-seed.ts` — seed scenario names

---

## Risks

| Risk | Mitigation |
|---|---|
| Stale anchor count ~51 after merge (2x planning estimate) | Replacement is mechanical `rg`/`sed`; same work per file |
| `post-auth-comprehensive-devclient.yaml` unrepairable (references removed theme sections) | Tag as `DEFERRED:M1-COMPREHENSIVE`, create ticket |
| Emulator instability during verification | `seed-and-run.sh` handles cleanup; between runs: `adb emu kill && emulator -avd Pixel_API_34 -no-snapshot` |
| Second consecutive run fails (state leakage) | `seed-and-run.sh` runs `pm clear`; investigate emulator-level state if persists |
| Validator false positives on C3 (testID matching) | Populate `testid-allowlist.txt` with runtime-assembled IDs; run in report mode first |

---

## Verification

After M1-A + M1-B complete:

```bash
# M1-A checks
rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows | wc -l  # ≤ 2
rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows \
  | grep -v release | grep -v expogo | wc -l                                  # 0
rg "optional: true" apps/mobile/e2e/flows | rg -v "# justified:" | wc -l     # 0 (or all in allowlist)

# M1-B checks
bash scripts/validate-maestro-flows.sh                                         # exit 0
grep -q "pr-blocking" apps/mobile/e2e/CONVENTIONS.md                          # tag registry exists
rg -l "pr-blocking" apps/mobile/e2e/flows | wc -l                            # 15-25

# Full suite: all repaired flows pass 2x consecutively on Pixel API 34 emulator
```
