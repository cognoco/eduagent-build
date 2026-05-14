> **STATUS: ACTIVE** — design spec for the static YAML integrity validator. Implementation in M1-B.

# Maestro Flow Validator — Design Spec

**Author:** Phase 0 (E2E quality uplift)
**Implements:** scope-proposal.md §3.5 + §M1-B
**Status:** Design only — no implementation in Phase 0

## Purpose

A static analysis tool that validates Maestro YAML flow files against the
current codebase without running any flows. Catches drift between flows and
app source, references to missing files/scenarios, and policy violations
(untagged flows, unjustified `optional: true`).

## Invocation

```bash
bash scripts/validate-maestro-flows.sh
# or, if implemented in TypeScript:
pnpm exec tsx scripts/validate-maestro-flows.ts
```

Exit code 0 = all checks pass. Non-zero = at least one violation found.

CI integration: wired into `.github/workflows/docs-checks.yml` as a PR-time
check (advisory, not merge-blocking initially).

## Input surface

| Source | What the validator reads |
|---|---|
| `apps/mobile/e2e/flows/**/*.yaml` | All flow files (excluding `_setup/`) |
| `apps/mobile/e2e/flows/_setup/*.yaml` | Setup helpers (for existence checks) |
| `apps/mobile/src/**/*.{tsx,ts}` | App source (for testID extraction) |
| `apps/api/src/services/test-seed.ts` | Seed scenario type (`SeedScenario`) |
| `apps/mobile/e2e/optional-allowlist.txt` | Justified `optional: true` patterns |
| `apps/mobile/e2e/CONVENTIONS.md` | Tag registry (for tag validation) |

## Checks

### C1 — Missing flow file references

Every `runFlow:` value in a YAML file must resolve to an existing file under
`apps/mobile/e2e/flows/`. Relative paths resolve from the referencing file's
directory.

**Output on failure:** `C1: <file>:<line> — runFlow target '<path>' not found`

### C2 — Deprecated `_setup/` helper usage

Maintain an allowlist of current `_setup/` helpers (24 files as of 2026-05-14).
Any `runFlow:` referencing a `_setup/` path not on the allowlist fails.

Additionally, flag usage of `_setup/launch-devclient.yaml` and `launchApp`
outside an explicit opt-in list (`apps/mobile/e2e/launch-legacy-allowlist.txt`).
The opt-in list is for release/ExpoGo flows that genuinely need the old launch
mechanism.

**Current `_setup/` helpers (allowlist baseline):**
```
connect-server.yaml       dismiss-anr.yaml          dismiss-bluetooth.yaml
dismiss-devtools.yaml     dismiss-notifications.yaml dismiss-post-approval.yaml
interview-followup.yaml   launch-devclient.yaml     launch-expogo.yaml
launch-release.yaml       nav-to-sign-in.yaml       open-create-profile-from-gate.yaml
open-family-dashboard.yaml                           return-to-home-check-gateway.yaml
return-to-home-check-parent-home.yaml                return-to-home-safe.yaml
return-to-home.yaml       seed-and-sign-in.yaml     sign-in-only.yaml
sign-out.yaml             switch-to-child.yaml       tap-metro-8081.yaml
tap-metro-8082.yaml       tap-metro-server.yaml
```

**Output on failure:** `C2: <file>:<line> — references deprecated/missing _setup helper '<name>'`

### C3 — Stale testID references

Extract all `id:` values from flow YAML files. Cross-reference against testIDs
found in app source (`testID="..."` and `testID={'...'}` patterns in TSX/TS).

**Pattern awareness:**
- A `{...}` segment in a flow testID matches any string (wildcard). E.g.,
  `subject-card-{subjectId}` matches `subject-card-${subjectId}` in source.
- An allowlist file (`apps/mobile/e2e/testid-allowlist.txt`) covers runtime-
  assembled IDs that can't be statically extracted (e.g., IDs built from
  database values, dynamic list indices).

**Output on failure:** `C3: <file>:<line> — testID '<id>' not found in source AND not in allowlist AND no wildcard match`

### C4 — Non-existent seed scenarios

Extract scenario names from flow YAML files (the first positional argument in
`seed-and-run.sh` invocations, or `scenario:` keys if present in YAML
metadata). Cross-reference against the `SeedScenario` union type in
`apps/api/src/services/test-seed.ts`.

**Current valid scenarios (31 as of 2026-05-14):**
`onboarding-complete`, `onboarding-no-subject`, `learning-active`,
`retention-due`, `failed-recall-3x`, `parent-with-children`, `trial-active`,
`trial-expired`, `multi-subject`, `multi-subject-practice`, `homework-ready`,
`trial-expired-child`, `consent-withdrawn`, `consent-withdrawn-solo`,
`parent-solo`, `pre-profile`, `consent-pending`, `parent-multi-child`,
`daily-limit-reached`, `language-learner`, `language-subject-active`,
`parent-with-reports`, `mentor-memory-populated`, `account-deletion-scheduled`,
`parent-proxy`, `session-with-transcript`, `with-bookmarks`,
`parent-with-weekly-report`, `parent-session-with-recap`,
`parent-session-recap-empty`

**Output on failure:** `C4: <file> — references seed scenario '<name>' not in SeedScenario type`

### C5 — `launchApp` / legacy launch usage

Any flow file containing `launchApp` or `runFlow: _setup/launch-devclient.yaml`
must be on the launch-legacy allowlist (`apps/mobile/e2e/launch-legacy-allowlist.txt`).
Files not on the list fail.

**Output on failure:** `C5: <file>:<line> — uses launchApp/launch-devclient outside legacy allowlist`

### C6 — Unjustified `optional: true`

In flows tagged `pr-blocking` or `smoke`, every `optional: true` must be
justified by one of:

1. A `# justified: <reason>` comment on the same line or the immediately
   preceding line.
2. The pattern matching an entry in `apps/mobile/e2e/optional-allowlist.txt`
   (for systematic patterns like OS-level dialog dismissals).

Flows not tagged `pr-blocking` or `smoke` are exempt — `optional: true` in
exploratory or later-phase flows is acceptable without justification.

**Output on failure:** `C6: <file>:<line> — optional: true in <tag> flow without justification or allowlist match`

### C7 — Untagged flow files

Every YAML file under `apps/mobile/e2e/flows/` (excluding `_setup/`) must
have a `tags:` block in its YAML frontmatter. At least one tag is required.

Valid tags are defined in `apps/mobile/e2e/CONVENTIONS.md` (the tag registry,
defined during M1-B). The validator reads the registry and fails on
unrecognised tags.

**Output on failure:** `C7: <file> — no tags defined` or `C7: <file> — unrecognised tag '<tag>'`

## Allowlist files

| File | Purpose | Format |
|---|---|---|
| `apps/mobile/e2e/optional-allowlist.txt` | Justified `optional: true` patterns for C6 | One pattern per line, `#` comments |
| `apps/mobile/e2e/testid-allowlist.txt` | Runtime-assembled testIDs for C3 | One testID per line, `#` comments |
| `apps/mobile/e2e/launch-legacy-allowlist.txt` | Flows permitted to use `launchApp`/legacy launch for C2/C5 | One flow path per line, `#` comments |

All allowlist files are relative to repo root. Empty lines and `#`-prefixed
lines are ignored.

## Output format

```
[PASS] C1: Flow file references (139 flows checked, 0 violations)
[FAIL] C3: TestID references (2 violations)
  C3: flows/onboarding/sign-in-flow.yaml:14 — testID 'old-sign-in-cta' not found in source AND not in allowlist AND no wildcard match
  C3: flows/parent/child-detail.yaml:28 — testID 'child-card-expand' not found in source AND not in allowlist AND no wildcard match
[PASS] C4: Seed scenarios (12 references checked, 0 violations)
...

Summary: 6/7 checks passed, 1 failed (2 violations)
```

Each check reports PASS/FAIL with a count. Failed checks list every violation
with file, line, and a specific reason string. The reason string is always
a conjunction of what was checked ("not found in source AND not in allowlist
AND no wildcard match") so the reader knows which escape hatches were tried.

## Implementation notes (for M1-B)

- **Language:** Bash + `rg`/`grep` for a v1 that runs without Node. If
  complexity warrants it, a TypeScript version under `scripts/` is fine.
- **Performance target:** < 5 seconds on the full 139-flow corpus.
- **No network calls.** Everything is local file reads.
- **Incremental adoption:** Checks can be enabled individually via env vars
  (`VALIDATE_C1=1 VALIDATE_C3=1 ...`) or all-on by default. This lets M1-B
  enable checks as allowlists are populated.
- **CI wiring:** Add to `.github/workflows/docs-checks.yml` as a step that
  runs on PRs touching `apps/mobile/e2e/`. Advisory (allow-failure) initially;
  promote to required after M1-B stabilises.
