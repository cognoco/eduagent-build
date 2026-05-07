---
description: Apply CRITICAL/HIGH fixes from review locally on the worktree branch (no PR checkout, no push)
argument-hint: (none — reads from consolidated review artifact)
---

# Cleanup Fix Locally

*Project-local override of `archon-implement-review-fixes`. Operates on the local worktree branch BEFORE the GitHub PR is created. Commits locally only — does NOT push. The `cleanup-push` node handles the push later in the DAG. See `.archon/spike-plan.md` for context.*

---

## IMPORTANT: Output Behavior

Your output will be summarized by downstream nodes. Keep your working output minimal:
- Do NOT narrate each step ("Now I'll read the file...", "Let me check...")
- Do NOT output verbose progress updates
- Only output the final structured report at the end
- Use the TodoWrite tool to track progress silently

---

## Your Mission

Read the consolidated review artifact and implement all CRITICAL and HIGH priority fixes on the local worktree branch. Add tests for fixed code if missing. Commit the fixes locally. Do NOT push (push happens in a later workflow node).

**Output artifact**: `$ARTIFACTS_DIR/review/fix-report.md`
**Git action**: Commit locally only — NO push, NO branch checkout

---

## Phase 1: LOAD - Get Fix List

(No need to identify or check out the PR branch — we are already on the worktree branch.)

### 1.1 Verify Branch State

```bash
HEAD_BRANCH=$(git branch --show-current)
echo "On branch: $HEAD_BRANCH"
git status --porcelain
```

The working tree should be clean (the implement loop committed its changes; the review nodes do not write code).

### 1.2 Read Consolidated Review

```bash
cat $ARTIFACTS_DIR/review/consolidated-review.md
```

Extract:
- All CRITICAL issues with fixes
- All HIGH issues with fixes
- MEDIUM issues (for reporting)
- LOW issues (for reporting)

### 1.3 Read Individual Artifacts for Details

If consolidated doesn't have full fix code, read original artifacts:

```bash
cat $ARTIFACTS_DIR/review/code-review-findings.md
cat $ARTIFACTS_DIR/review/test-coverage-findings.md
cat $ARTIFACTS_DIR/review/adversarial-findings.md
```

**PHASE_1_CHECKPOINT:**
- [ ] On worktree branch (not main, not detached)
- [ ] Working tree clean
- [ ] Consolidated review loaded
- [ ] CRITICAL/HIGH issues extracted

---

## Phase 2: IMPLEMENT - Apply Fixes

### 2.1 For Each CRITICAL Issue

1. **Read the file**
2. **Apply the recommended fix**
3. **Verify fix compiles**: project-appropriate type check (e.g., `pnpm exec nx run-many -t typecheck`)
4. **Track**: Note what was changed

### 2.2 For Each HIGH Issue

Same process as CRITICAL.

### 2.3 For Test Coverage Gaps

If the test-coverage agent identified missing tests for fixed code:

1. **Create/update test file**
2. **Add tests for the fix**
3. **Verify tests pass**: project-appropriate test command on the affected file

### 2.4 Handle Unfixable Issues

If a fix cannot be applied:
- **Conflict**: Code has changed since review
- **Complex**: Requires architectural changes
- **Unclear**: Recommendation is ambiguous
- **Risk**: Fix might break other things

Document the reason clearly.

**PHASE_2_CHECKPOINT:**
- [ ] All CRITICAL fixes attempted
- [ ] All HIGH fixes attempted
- [ ] Tests added for fixes
- [ ] Unfixable issues documented

---

## Phase 3: VALIDATE - Verify Fixes

### 3.1 Type Check

Use the project's type-check command (`pnpm exec nx run-many -t typecheck` for this monorepo). Must pass. If not, fix type errors.

### 3.2 Lint

Use the project's lint command. Fix any lint errors introduced.

### 3.3 Run Tests

Run the project's test command. All tests must pass. If new tests fail, fix them.

### 3.4 Build Check

Run the project's build command. Must succeed.

**PHASE_3_CHECKPOINT:**
- [ ] Type check passes
- [ ] Lint passes
- [ ] All tests pass
- [ ] Build succeeds

---

## Phase 4: COMMIT (NO PUSH) - Save Changes Locally

### 4.1 Stage Changes

Stage **only** the files you actually edited while applying review fixes — never `git add -A`, `git add .`, or `git add -u`. List them by name:

```bash
git add path/to/file1 path/to/file2 ...
git status --porcelain  # verify nothing scratch/review/PR-body is staged
```

**Never stage**:

- `.pr-body.md`, `pr-body.md`, `*.scratch.md`, `*.tmp.md`
- `review/`, `*-report.md` at the repo root
- Anything under `$ARTIFACTS_DIR` (review artifacts live here, not in the worktree)

### 4.2 Commit

**IMPORTANT: Do NOT use `--no-verify`.** Let pre-commit hooks run.

Write the commit message to a file, then commit:

```bash
cat > "$ARTIFACTS_DIR/commit-msg.txt" <<'CMSG'
fix: Address review findings (CRITICAL/HIGH)

Fixes applied:
- {brief list of fixes}

Tests added:
- {list of new tests if any}

Skipped (see review artifacts):
- {brief list of unfixable if any}

Co-Authored-By: Claude <noreply@anthropic.com>
CMSG
git commit -F "$ARTIFACTS_DIR/commit-msg.txt"
```

If the pre-commit hook fails:
1. Read the error output carefully
2. Fix the issue (lint error, type error, test failure). Do not fix by changing tests.
3. Re-stage and retry the commit
4. Do NOT bypass with `--no-verify`

### 4.3 Push — DEFERRED

The `cleanup-push` node will push the branch later. Do NOT push from this command.

**PHASE_4_CHECKPOINT:**
- [ ] Changes committed locally
- [ ] NOT pushed (push is handled by cleanup-push node)

---

## Phase 5: GENERATE - Create Fix Report

Write to `$ARTIFACTS_DIR/review/fix-report.md`:

```markdown
# Fix Report: {Work Order PR-ID}

**Date**: {ISO timestamp}
**Status**: {COMPLETE | PARTIAL}
**Branch**: {HEAD_BRANCH}

---

## Summary

{2-3 sentence overview of fixes applied}

---

## Fixes Applied

### CRITICAL Fixes ({n}/{total})

| Issue | Location | Status | Details |
|-------|----------|--------|---------|
| {title} | `file:line` | ✅ FIXED | {what was done} |
| {title} | `file:line` | ❌ SKIPPED | {why} |

---

### HIGH Fixes ({n}/{total})

| Issue | Location | Status | Details |
|-------|----------|--------|---------|
| {title} | `file:line` | ✅ FIXED | {what was done} |

---

## Tests Added

| Test File | Test Cases | For Issue |
|-----------|------------|-----------|
| `src/x.test.ts` | `it('should...')` | {issue title} |

---

## Not Fixed (Requires Manual Action)

### {Issue Title}

**Severity**: {CRITICAL/HIGH}
**Location**: `{file}:{line}`
**Reason Not Fixed**: {reason}

**Suggested Action**:
{What the user should do}

---

## MEDIUM Issues (User Decision Required)

| Issue | Location | Options |
|-------|----------|---------|
| {title} | `file:line` | Fix now / Create issue / Skip |

---

## LOW Issues (For Consideration)

| Issue | Location | Suggestion |
|-------|----------|------------|
| {title} | `file:line` | {brief suggestion} |

---

## Suggested Follow-up Issues

| Issue Title | Priority | Related Finding |
|-------------|----------|-----------------|
| "{title}" | P{1/2/3} | {which finding} |

---

## Validation Results

| Check | Status |
|-------|--------|
| Type check | ✅ |
| Lint | ✅ |
| Tests | ✅ ({n} passed) |
| Build | ✅ |

---

## Git Status

- **Branch**: {HEAD_BRANCH}
- **Commit**: {commit-hash}
- **Pushed**: ❌ Deferred to `cleanup-push` node
```

**PHASE_5_CHECKPOINT:**
- [ ] Fix report created
- [ ] All fixes documented

---

## Phase 6: OUTPUT - Final Report

Output only this summary (keep it brief):

```markdown
## ✅ Fix Implementation Complete (Local)

**Work Order**: {PR-ID}
**Branch**: {HEAD_BRANCH}
**Status**: {COMPLETE | PARTIAL}

| Severity | Fixed |
|----------|-------|
| CRITICAL | {n}/{total} |
| HIGH | {n}/{total} |

**Validation**: ✅ All checks pass
**Pushed**: ❌ Deferred to cleanup-push node

See fix report: `$ARTIFACTS_DIR/review/fix-report.md`
```

---

## Error Handling

### Type Check Fails After Fix

1. Review the error
2. Adjust the fix
3. Re-run type check
4. If still failing, mark as "Not Fixed" with reason

### Tests Fail

1. Check if fix caused the failure
2. Either: fix the implementation, or fix the test
3. If unclear, mark as "Not Fixed" for manual review

### Pre-commit Hook Fails

1. Pre-commit runs lint, typecheck, and unit tests
2. Address the underlying issue (do NOT bypass with `--no-verify`)
3. Re-stage and retry the commit

---

## Success Criteria

- **ON_WORKTREE_BRANCH**: Working on cleanup worktree branch (not main, not detached)
- **CRITICAL_ADDRESSED**: All CRITICAL issues attempted
- **HIGH_ADDRESSED**: All HIGH issues attempted
- **VALIDATION_PASSED**: Type check, lint, tests, build all pass
- **COMMITTED_LOCALLY**: Changes committed locally — NO push, NO branch checkout
- **REPORTED**: Fix report artifact created (GitHub comment posted later by `cleanup-post-review-comments`)
