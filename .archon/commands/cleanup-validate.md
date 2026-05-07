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

### 1.3 Read CLAUDE.md

```bash
cat CLAUDE.md
```

Note the "Handy Commands" section for exact validation commands.

**PHASE_1_CHECKPOINT:**
- [ ] Touched packages identified
- [ ] All phases confirmed complete

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

**PHASE_2_CHECKPOINT:**
- [ ] TypeCheck passes
- [ ] Lint passes
- [ ] Related tests pass
- [ ] Phase-specific verifications pass

---

## Phase 3: FIX AND COMMIT

If any fixes were needed during validation:

```bash
git add -A
git diff --cached --stat
cat > "$ARTIFACTS_DIR/commit-msg.txt" <<'CMSG'
fix: address validation failures in cleanup PR

Post-implementation validation fixes.

Co-Authored-By: Claude <noreply@anthropic.com>
CMSG
git commit -F "$ARTIFACTS_DIR/commit-msg.txt"
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
