---
description: Run full Mentomate validation suite after cleanup implementation
argument-hint: (no arguments - reads from workflow artifacts)
---

# Validate Cleanup Implementation

**Workflow ID**: $WORKFLOW_ID

---

## Your Mission

Run the complete project validation suite. Fix any failures. This is the gate
before pushing and creating the PR.

---

## Phase 1: LOAD

### 1.1 Read Work Order

```bash
cat $ARTIFACTS_DIR/work-order.md
```

Identify which packages were touched (api, mobile, schemas, database) to scope validation.

### 1.2 Read Progress

```bash
cat $ARTIFACTS_DIR/progress.md
```

Confirm all phases completed.

### 1.3 Codebase Rules

CLAUDE.md is already loaded into your system prompt — do not re-read it. Use the
"Handy Commands" section for exact validation commands.

### 1.4 Record Validation Baseline

```bash
# Captured at validate start so cleanup-scope-guard.sh can compute the exact
# set of files validate's FIX AND COMMIT phase committed. The post-fix
# scope-guard unions these (subject to a test-file pattern filter) into the
# work-order's allowed list.
git rev-parse HEAD > "$ARTIFACTS_DIR/.pre-validate-sha"
```

**PHASE_1_CHECKPOINT:**
- [ ] Touched packages identified
- [ ] All phases confirmed complete
- [ ] Pre-validate SHA recorded

---

## Phase 2: VALIDATE

Run checks in order. Fix failures before proceeding to the next check.

### 2.1 TypeCheck (workspace-wide)

```bash
pnpm exec nx run-many -t typecheck 2>&1 | tail -50
```

If fails: fix type errors, re-run. Do NOT suppress with `// @ts-ignore`.

### 2.2 Lint (workspace-wide)

```bash
pnpm exec nx run-many -t lint 2>&1 | tail -50
```

If fails: fix lint errors. Do NOT use `eslint-disable`. CLAUDE.md is explicit:
"No suppression, no shortcuts — always address the root of the error."

### 2.3 Tests (scoped to changed files)

Run tests related to the changed files. Read the file list from the work order:

```bash
pnpm exec jest --findRelatedTests <space-separated-file-list> --no-coverage 2>&1 | tail -50
```

If the changed files span both api and mobile, run separately:

```bash
cd apps/api && pnpm exec jest --findRelatedTests <api-files> --no-coverage 2>&1 | tail -30
cd apps/mobile && pnpm exec jest --findRelatedTests <mobile-files> --no-coverage 2>&1 | tail -30
```

If tests fail: determine root cause (implementation bug vs. test that needs updating).
Fix the actual issue. Re-run.

### 2.4 Phase-Specific Verification

Re-run each phase's verification command from the work order to confirm they still pass
after all phases are combined:

```bash
{phase-specific verify command from work order}
```

### 2.5 CI-Parity Ratchet Checks

The pre-commit hooks DO NOT replicate CI's ratchet checks. These run only in the
GitHub Actions `main` job and have failed cleanup PRs in the past — replicate
them locally before push so we never ship a known-broken branch.

#### 2.5.1 GC1 — No new internal `jest.mock()`

Mirror the recipe from `.github/workflows/ci.yml` ("GC1 — no new internal jest.mock"
step). Fails on any new line that adds a relative-path `jest.mock('./...')` or
`jest.mock('../...')` in a `*.test.ts` / `*.test.tsx` file unless the same line
carries a `// gc1-allow: <reason>` opt-out.

```bash
BASE_REF="${BASE_REF:-main}"
# Separate the diff call from the grep pipeline so a ref-resolution failure
# (e.g. CI runner without origin/main fetched) is fatal, not silently "clean".
if ! diff_output=$(git diff "origin/${BASE_REF}...HEAD" -- '*.test.ts' '*.test.tsx'); then
    echo "GC1 check failed: could not diff against origin/${BASE_REF}" >&2
    exit 1
fi
violations=$(printf '%s\n' "$diff_output" \
    | grep -E '^\+[^+]' \
    | grep -E "jest\.mock\(['\"\`]\.\.?/" \
    | grep -iv 'gc1-allow' \
    || true)
if [ -n "$violations" ]; then
    echo "GC1 VIOLATION: New internal jest.mock() call(s) detected." >&2
    echo "$violations" >&2
    echo "" >&2
    echo "Fix: use jest.requireActual() with targeted overrides instead." >&2
    echo "Canonical pattern:" >&2
    echo "  apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts" >&2
    echo "If genuinely external-boundary, append '// gc1-allow: <reason>' on the same line." >&2
    echo "See CLAUDE.md → 'No new internal jest.mock()'." >&2
    exit 1
fi
echo "GC1 ratchet: clean."
```

If this exits non-zero, treat it like any other validation failure: rewrite the
test using `jest.requireActual(...)` with targeted overrides (canonical example
above), or — if the offending mock was added by the implement loop on a NEW test
file — delete the test and file the missing-coverage gap as a follow-up via
`./.archon/scripts/append-followup.sh` instead. Do NOT add `// gc1-allow:` to
silence it without genuine external-boundary justification.

**PHASE_2_CHECKPOINT:**
- [ ] TypeCheck passes
- [ ] Lint passes
- [ ] Related tests pass
- [ ] Phase-specific verifications pass
- [ ] GC1 ratchet check passes

---

## Phase 3: FIX AND COMMIT

If any fixes were needed during validation:

```bash
git add -A
git diff --cached --stat
cat > "$ARTIFACTS_DIR/commit-msg.txt" <<'CMSG'
fix: address validation failures in cleanup PR

Post-implementation validation fixes.

Co-Authored-By: Archon <archon@anthropic.com>
CMSG
git commit -F "$ARTIFACTS_DIR/commit-msg.txt"

# Record exactly what validate committed (not just what was staged) so
# cleanup-scope-guard.sh can union legitimate test-infrastructure fixes into
# the work-order's allowed list. Scope-guard applies a test-file pattern
# filter — production-source extras still trip the guard.
git diff --name-only "$(cat "$ARTIFACTS_DIR/.pre-validate-sha")..HEAD" \
    > "$ARTIFACTS_DIR/.validate-allowed-extras"
```

---

## Phase 4: ARTIFACT

Write to `$ARTIFACTS_DIR/validation.md`:

```markdown
# Validation Results

**Generated**: {YYYY-MM-DD HH:MM}
**Workflow ID**: $WORKFLOW_ID
**Status**: {ALL_PASS | FIXED}

## Summary

| Check | Result | Details |
|-------|--------|---------|
| TypeCheck | PASS/FIXED | {details} |
| Lint | PASS/FIXED | {details} |
| Tests | PASS/FIXED | {N passed, M suites} |
| Phase verifications | PASS | {count} checks |

## Fixes Applied

{If any validation fixes were committed, list them. Otherwise: "None needed."}
```

---

## Phase 5: OUTPUT

```markdown
## Validation Complete

| Check | Status |
|-------|--------|
| TypeCheck | {result} |
| Lint | {result} |
| Tests | {result} |
| Phase verifications | {result} |

{If fixes were needed:}
Fixes committed: {short hash}

Artifact: `$ARTIFACTS_DIR/validation.md`
```
