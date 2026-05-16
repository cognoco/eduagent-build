> **STATUS: ACTIVE** — execution brief for M1-B (validator, tag set, inventory close-out). Human-supervised, light agent assist.

# M1-B Execution Brief — Validator + Tag Set + Inventory

**Phase:** M1-B (Mobile E2E trustworthiness — tooling and classification)
**Execution model:** Human-supervised with light agent assist. Not autonomous.
**Prerequisite:** M1-A drift repair landed on main (stale anchors fixed, deprecated launches migrated, `optional: true` audit complete).
**Execution environment:** Any machine with `rg`, `bash`, Node.js. Emulator NOT required (static analysis only).
**Parent doc:** `docs/audit/e2e/scope-proposal.md` §5 (M1-B)
**Design spec:** `docs/audit/e2e/validator-spec.md` (7 checks, C1-C7)
**Companion:** `docs/audit/e2e/m1a-execution-brief.md` (must complete first)

---

## Problem

The Maestro flow suite has no static integrity checking. Stale references, missing files, invalid seed scenarios, and policy violations (unjustified `optional: true`, untagged flows) are only caught at runtime — if at all. The `pr-blocking` tag set is too small (7 flows) and undefined in CONVENTIONS.md.

---

## Step 1: Implement validator (`scripts/validate-maestro-flows.sh`)

Full design spec at `docs/audit/e2e/validator-spec.md`. Implementation summary:

### Checks in implementation order

| # | Check | What it validates | Inputs |
|---|---|---|---|
| C1 | Missing flow refs | Every `runFlow:` target resolves to an existing file | Flow YAML files |
| C7 | Untagged flows | Every non-setup YAML has a `tags:` block with ≥1 recognised tag | Flow YAML + tag registry in CONVENTIONS.md |
| C4 | Invalid seed scenarios | Every `SEED_SCENARIO` value matches the `SeedScenario` type | Flow YAML + `apps/api/src/services/test-seed.ts` |
| C5 | Legacy launch usage | `launchApp` / `launch-devclient.yaml` only in allowlisted flows | Flow YAML + `launch-legacy-allowlist.txt` (created by M1-A) |
| C2 | Deprecated helpers | `runFlow:` to `_setup/` paths only if helper exists | Flow YAML + `_setup/` directory listing |
| C3 | Stale testIDs | Every `id:` value exists in app source or allowlist | Flow YAML + `apps/mobile/src/**/*.{tsx,ts}` + `testid-allowlist.txt` |
| C6 | Unjustified `optional: true` | In `pr-blocking`/`smoke` flows: `optional: true` must be justified or allowlisted | Flow YAML + `optional-allowlist.txt` (created by M1-A) |

### Implementation constraints

- **Language:** Bash + `rg` for v1. TypeScript OK if complexity warrants.
- **Performance:** < 5 seconds on full ~139-flow corpus.
- **No network calls.** All local file reads.
- **Incremental adoption:** Per-check env vars (`VALIDATE_C1=1`, etc.) — all on by default.
- **Output format:** `[PASS]`/`[FAIL]` per check with violation count; violations list file, line, and specific reason.

### Spec correction

The validator spec lists 31 seed scenarios at §C4. Actual count is **45** (verified against `SeedScenario` type in `test-seed.ts`). The validator must extract scenarios dynamically from source, not from a hardcoded list. Update the spec accordingly.

### Test strategy

1. Run against current repo → expect known violations matching baseline.
2. Create a temporary flow with all 7 violation types → verify each is caught.
3. Add allowlist entries → verify violations clear.
4. Time the full run → must be < 5 seconds.

---

## Step 2: Create `apps/mobile/e2e/testid-allowlist.txt`

For C3 (stale testID check). Contains runtime-assembled testIDs that can't be statically extracted from source:

```
# Runtime-assembled testIDs — constructed from database values or dynamic indices.
# Pattern: the testID template in source uses ${variable}, which static extraction misses.
# Add entries here when the validator flags a testID that IS correct at runtime.
```

Populate by running C3 in report mode and triaging false positives. Each entry should have an inline comment explaining why static extraction misses it.

---

## Step 3: Define `pr-blocking` tag set

### Criteria

A flow qualifies for `pr-blocking` if ALL of:
1. Currently passes on clean Pixel API 34 emulator (verified in M1-A)
2. Covers a top-of-funnel or critical user path
3. Deterministic — no flakiness from AI responses, timing, or network
4. Runs in < 90 seconds individually
5. Combined `pr-blocking` set runs in < 8 minutes total

### Current `pr-blocking` flows (7)

After M1-A repairs, verify these still carry the tag and pass:
1. `account/more-tab-navigation.yaml`
2. `account/delete-account.yaml`
3. `account/delete-account-scheduled.yaml`
4. `learning/library-navigation.yaml`
5. `learning/book-detail.yaml`
6. `subjects/multi-subject.yaml`
7. `subjects/practice-subject-picker.yaml`

### Expansion candidates (evaluate from `smoke` set)

| Candidate | Domain | Why |
|---|---|---|
| `onboarding/create-subject.yaml` | Onboarding | Subject creation is top-of-funnel |
| `onboarding/view-curriculum.yaml` | Onboarding | Post-onboarding navigation |
| `learning/start-session.yaml` | Core loop | Session start is the core action |
| `learning/core-learning.yaml` | Core loop | Full learning cycle |
| `learning/first-session.yaml` | Onboarding | First-time experience |
| `consent/consent-deny-confirmation.yaml` | Legal | Consent gate is a legal requirement |
| `parent/parent-dashboard.yaml` | Parent | Guardian persona coverage |
| `retention/recall-review.yaml` | Retention | Spaced repetition is core |
| `billing/subscription.yaml` | Revenue | Subscription access is business-critical |
| `regression/bug-238-tab-bar-no-leak.yaml` | Stability | Tab bar regression |

**Process:** Run each candidate twice on emulator. Only add flows that pass both runs without retry.

**Target:** 15-25 total `pr-blocking` flows.

---

## Step 4: Update CONVENTIONS.md with tag registry

Add a "Tag Registry" section to `apps/mobile/e2e/CONVENTIONS.md`:

### Execution tiers

| Tag | Meaning | Run cadence |
|---|---|---|
| `pr-blocking` | Must pass for PR merge. Stable, deterministic, <90s each. | Every PR |
| `smoke` | Broad coverage of critical paths. Superset of `pr-blocking`. | Nightly + on-demand |
| `nightly` | Full regression suite. | Nightly CI |
| `weekly` | Extended/slow flows (camera, OCR, complex multi-step). | Weekly CI |
| `manual` | Requires human interaction or special device setup. | Manual only |

### Domain tags

`account`, `auth`, `billing`, `consent`, `dictation`, `edge`, `homework`, `learning`, `navigation`, `onboarding`, `parent`, `practice`, `progress`, `quiz`, `regression`, `retention`, `subjects`

### Special tags

| Tag | Meaning |
|---|---|
| `devclient` | Requires dev-client build (not release/ExpoGo) |
| `gdpr` | GDPR-specific consent flows |
| `coppa` | COPPA-specific age-verification flows |
| `critical` | Business-critical path (revenue, legal) |
| `visual` | Primarily screenshot-based verification |

The validator (C7) reads this registry and fails on unrecognised tags.

---

## Step 5: Wire validator into CI

Add to `.github/workflows/docs-checks.yml`:

### Path triggers (add to existing `on:` block)

```yaml
- 'apps/mobile/e2e/flows/**/*.yaml'
- 'apps/mobile/e2e/*.txt'
- 'scripts/validate-maestro-flows.sh'
```

### New job

```yaml
  maestro-validator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Maestro flow integrity
        run: bash scripts/validate-maestro-flows.sh
        continue-on-error: true    # advisory initially; promote to required after stabilisation
```

---

## Step 6: Inventory close-out

**Source:** `docs/flows/e2e-flow-coverage-audit-2026-05-13.md`

For every row in the inventory:

| Row state | Action |
|---|---|
| Flow exists, verified passing in M1-A | Mark as ✅ passing |
| Flow exists, still failing after M1-A | Investigate → fix or annotate `DEFERRED:<ticket>` |
| No flow exists, in scope | Create the flow, verify, mark passing |
| No flow exists, blocked on infra | Annotate `DEFERRED:INFRA-<n>` with reason |
| No flow exists, blocked on Clerk config | Annotate `DEFERRED:CLERK-<n>` with reason |
| No flow exists, needs real device | Annotate `DEFERRED:DEVICE-<n>` with reason |

**Infra-blocked examples** (from scope proposal §10):
- ADB deep-link injection (AUTH-05/09/11)
- SecureStore manipulation
- Network throttling
- Clerk dashboard MFA/SSO provider setup

---

## Exit criteria (from scope proposal §5, M1-B)

1. `bash scripts/validate-maestro-flows.sh` exits 0.
2. Validator wired into `.github/workflows/docs-checks.yml`.
3. `pr-blocking` tag set defined in `CONVENTIONS.md`; `rg -l "pr-blocking" apps/mobile/e2e/flows | wc -l` returns 15-25.
4. Every flow file has ≥ 1 tag (validator C7 enforces). **Note:** Verified 2026-05-15 that all 139 non-setup flows already have frontmatter `tags:` — this criterion is pre-satisfied, but C7 prevents regression.
5. Every inventory row → passing flow OR explicit `DEFERRED:<ticket>` annotation.

---

## Files created / modified

### New files
- `scripts/validate-maestro-flows.sh` (or `.ts`)
- `apps/mobile/e2e/testid-allowlist.txt`

### Modified files
- `apps/mobile/e2e/CONVENTIONS.md` (tag registry section)
- `.github/workflows/docs-checks.yml` (validator job + path triggers)
- `docs/audit/e2e/validator-spec.md` (update scenario count 31 → 45)
- `docs/flows/e2e-flow-coverage-audit-2026-05-13.md` (inventory close-out annotations)
- Various flow files (tag additions/corrections if C7 surfaces issues)

### Files from M1-A (read-only inputs, must already exist)
- `apps/mobile/e2e/optional-allowlist.txt`
- `apps/mobile/e2e/launch-legacy-allowlist.txt`
