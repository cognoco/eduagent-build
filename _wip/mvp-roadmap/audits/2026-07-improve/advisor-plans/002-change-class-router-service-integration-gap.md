# Plan 002: Route service-diff PRs through the API integration suite in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- scripts/check-change-class.sh docs/change-classes.md`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`apps/api` has 141 co-located `*.integration.test.ts` files. CI only runs them when the change-class router (`scripts/check-change-class.sh`) emits `integration=true` for a PR's diff. Today a PR that touches **only** `apps/api/src/services/**` (outside `identity-v2/`) is classified `api-services`, which maps to the **fast unit suite only** — the unit Jest config explicitly ignores `*.integration.test.ts`. Result: 81 service integration tests are unreachable from a service-only diff, and the two money *barrel* files (`services/billing.ts`, `services/subscription.ts`) also miss the directory-shaped `security-sensitive` regex, so they too fall through to unit-only. Tests written to protect this code silently never run. The repo already hit this exact failure mode once — the `identity-v2-seam` class was a point-fix citing three production incidents (WI-1255, WI-1161, WI-1138). This plan closes the general hole so the test-adding plans (006, 007, 008) actually get enforced by CI.

## Current state

- `scripts/check-change-class.sh` — the single source of truth for "you touched X → run Y". It classifies the diff into classes and each class appends commands; a `slow` command containing `test:api:integration` sets `integration=true` (emitted to CI as a GitHub output).

The two relevant blocks, verbatim:

```bash
# scripts/check-change-class.sh:325-330 — API Services (non-prompt)
API_SVC=$(filter_files '^apps/api/src/services/' | grep -vE '(-prompts\.ts$|/llm/[^/]+\.ts$)' || true)
if [[ -n "$API_SVC" ]]; then
  CLASSES+=("api-services")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests"
fi
```

```bash
# scripts/check-change-class.sh:332-334 — Identity-v2 Seam (the prior point-fix)
if hit '^apps/api/src/services/identity-v2/'; then
  CLASSES+=("identity-v2-seam")
  add_cmd slow  "pnpm test:api:integration"  "API co-located integration tests (identity-v2 seam)"
  note "identity-v2-seam: caller-bound authority changes need a break test (red-green-revert)"
fi
```

```bash
# scripts/check-change-class.sh:398-402 — Billing / Auth (security-sensitive)
if hit '(/billing/|/subscription/|/auth/|middleware/clerk)'; then
  CLASSES+=("security-sensitive")
  add_cmd slow  "pnpm test:api:integration"  "API co-located integration tests"
  note "security-sensitive: CRITICAL/HIGH fixes need a break test (red-green regression)"
  note "security-sensitive: Silent catch-and-recover without metric/event is banned"
fi
```

Verified facts (re-confirm with the commands in the drift check if in doubt):
- `apps/api/jest.config.cjs` unit config sets `testPathIgnorePatterns` including `\\.integration\\.test\\.ts$` — the unit suite never runs integration tests.
- The integration suite is a **separate Nx target** `api:integration-api` (`apps/api/project.json`), only invoked by the CI step gated on `integration=true`.
- `services/billing.ts` and `services/subscription.ts` (barrel files, not directories) do NOT match `(/billing/|/subscription/|...)` — confirmed: `echo apps/api/src/services/billing.ts | grep -E '(/billing/|/subscription/)'` → no match.
- Count of service integration tests NOT under `billing/` or `identity-v2/`: **81** (`fd '\.integration\.test\.ts$' apps/api/src/services | grep -vE 'services/(billing|identity-v2)/' | wc -l`).

Repo convention: `docs/change-classes.md` is the human-readable reference table that must stay in sync with the script. Update it in the same change.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Router advisory (current diff) | `bash scripts/check-change-class.sh` | prints classes + commands |
| Router branch-wide | `bash scripts/check-change-class.sh --branch` | classes for full branch diff vs main |
| Router GitHub-output mode | `bash scripts/check-change-class.sh --github-output` | emits `classes=`, `integration=`, etc. |
| Shell lint (if available) | `shellcheck scripts/check-change-class.sh` | exit 0 (pre-existing warnings OK) |

## Scope

**In scope** (the only files you should modify):
- `scripts/check-change-class.sh`
- `docs/change-classes.md` (keep the reference table in sync)

**Out of scope** (do NOT touch):
- `apps/api/jest.config.cjs` / `apps/api/project.json` — the unit/integration target split is intentional; do not merge the suites.
- Any test file — this plan changes routing only.
- The `.github/workflows/ci.yml` wiring — it already consumes `integration` from the router; don't change how it's consumed.

## Git workflow

- Branch: `advisor/002-change-class-router-service-integration-gap` (or repo convention).
- Commit message style: conventional commits — match `git log`, e.g. `fix(ci): route service-diff PRs through API integration suite`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `services-with-integration` seam class for the subtrees that own integration tests

The lower-risk path (chosen over widening `api-services` wholesale, which would lengthen every API PR). Add, immediately after the `identity-v2-seam` block (~line 335), a class that fires when a service diff touches a subtree that owns `*.integration.test.ts` files. The highest-value subtrees by count/criticality are `session/`, `billing/` (already covered by security-sensitive dir, but the barrel is not — see Step 2), `quiz/`, and `notifications/`.

Target shape (match the existing `hit`/`add_cmd`/`note` idiom exactly):

```bash
# ── API Services with integration coverage (WI: advisor-002) ──────────────
# The generic api-services class runs unit-only; these service subtrees own
# co-located *.integration.test.ts files that the unit suite ignores. Route
# them through the integration lane so those tests are not silently skipped.
if hit '^apps/api/src/services/(session|quiz|notifications|celebrations|billing)/'; then
  CLASSES+=("services-with-integration")
  add_cmd slow  "pnpm test:api:integration"  "API co-located integration tests (service seam)"
  note "services-with-integration: this subtree owns integration tests the unit suite ignores"
fi
```

Note: confirm the subtree list against reality before finalizing — run
`fd '\.integration\.test\.ts$' apps/api/src/services -x dirname {} \; | sort -u`
and include every subtree that appears. If a subtree in the regex has zero integration tests, drop it; if one is missing, add it. Do NOT add subtrees that own no integration tests (it would slow PRs for nothing).

**Verify**: create a throwaway staged change to a session service and run the router:
`touch apps/api/src/services/session/_probe.ts && git add apps/api/src/services/session/_probe.ts && bash scripts/check-change-class.sh --github-output | grep integration` → expect `integration=true`. Then `git rm -f --cached apps/api/src/services/session/_probe.ts && rm apps/api/src/services/session/_probe.ts`.

### Step 2: Fix the barrel-file miss in the `security-sensitive` regex

The regex `(/billing/|/subscription/|/auth/|middleware/clerk)` matches the directories but not the top-level barrel files `services/billing.ts` and `services/subscription.ts` (money: tier config, entitlements). Extend it to also match those exact files.

Change the `hit` pattern on line ~398 to:

```bash
if hit '(/billing/|/subscription/|/auth/|middleware/clerk|/services/billing\.ts$|/services/subscription\.ts$)'; then
```

**Verify**: `printf '%s\n' apps/api/src/services/billing.ts apps/api/src/services/subscription.ts | grep -E '(/billing/|/subscription/|/auth/|middleware/clerk|/services/billing\.ts$|/services/subscription\.ts$)'` → both lines match (2 lines of output).

### Step 3: Update the reference doc

Add the new `services-with-integration` class and the barrel-file note to the class table in `docs/change-classes.md`, matching the existing table format. One row for the new class; amend the `security-sensitive` row's file-glob description to mention the two barrels.

**Verify**: `grep -n 'services-with-integration' docs/change-classes.md` → at least one match; `grep -n 'billing.ts' docs/change-classes.md` → match.

## Test plan

This is a CI-routing script, not application code — its "tests" are router invocations:

- **New behavior to demonstrate** (record the command + output in the PR description):
  1. A staged change under `apps/api/src/services/session/` emits `integration=true` (Step 1 verify).
  2. A staged change to `apps/api/src/services/billing.ts` emits `integration=true` (was unit-only before).
  3. A staged change to an unrelated service (e.g. `apps/api/src/services/brand.ts`, which owns no integration tests and is not in the seam regex) still emits `integration=false` — proves the change is targeted, not a blanket widening.
- No unit-test file exists for this script; do not create a bespoke test framework. If `scripts/` already has a test harness (`fd -e test.sh scripts` / a `scripts/*.test.ts`), add a case there; otherwise the router-invocation evidence above is the verification.

## Done criteria

ALL must hold:

- [ ] A staged `apps/api/src/services/session/**` change makes `bash scripts/check-change-class.sh --github-output` emit `integration=true`.
- [ ] A staged `apps/api/src/services/billing.ts` change emits `integration=true`.
- [ ] A staged `apps/api/src/services/brand.ts` change still emits `integration=false` (targeted, not blanket).
- [ ] `docs/change-classes.md` documents the new class and the barrel fix.
- [ ] `shellcheck scripts/check-change-class.sh` introduces no NEW warnings (compare against a pre-change run).
- [ ] Only the two in-scope files are modified (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The `api-services`, `identity-v2-seam`, or `security-sensitive` blocks don't match the "Current state" excerpts (script drifted).
- `bash scripts/check-change-class.sh` errors out or the `--github-output` flag no longer exists.
- Adding the seam class makes a change to an *unrelated* service also flip `integration=true` (over-broad regex) — narrow it and re-verify.
- The subtree probe in Step 1 shows the integration suite does not exist or the target name changed.

## Maintenance notes

- When a new service subtree starts owning `*.integration.test.ts` files, add it to the Step 1 regex — otherwise its integration tests are unreachable from a service-only diff, re-opening this exact hole.
- Reviewer should scrutinize that the regex additions are anchored (`$` on the barrel files) so they don't accidentally match `services/billing/**` twice or match unrelated paths.
- Deferred out of scope: converting `api-services` wholesale to demand integration (rejected — would slow every API PR; the seam approach is the repo's established pattern).
