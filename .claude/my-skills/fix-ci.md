# Fix CI — Autonomous PR CI Repair Loop

Diagnose and fix all failing CI checks on a PR, looping autonomously until green or hitting safety limits.

## Arguments

$ARGUMENTS — Required: PR number (e.g., `123` or `#123`).

## Workflow

### 1. Assess Current State

```bash
gh pr checks $ARGUMENTS
gh pr diff $ARGUMENTS
```

Identify ALL failing checks — not just the first one.

### 2. For Each Failing Check

a. **Read the failure logs:**
   ```bash
   gh run view <run-id> --log-failed
   ```

b. **Diagnose the root cause.** Common categories:
   - **Type errors** (`tsc`): unused variables, missing imports, type mismatches
   - **Lint errors** (`eslint`): formatting, unused imports, naming conventions
   - **Test failures** (`jest`): outdated fixtures, missing mocks, changed APIs
   - **Build errors**: dependency issues, config problems
   - **Code review findings**: security, best practices, architecture violations

c. **Fix ALL issues from ALL failing checks in one pass** — do not fix one check, push, wait, then fix the next.

### 3. Local Validation

After applying all fixes:

```bash
pnpm exec tsc --noEmit
```

Run related tests for every file you changed:
```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests <changed-files> --no-coverage
```

### 4. Commit and Push

```bash
git add <specific-files>
git commit -m "fix: resolve CI failures on PR #$ARGUMENTS"
git push
```

### 5. Monitor CI

```bash
gh pr checks $ARGUMENTS --watch
```

### 6. Loop If Needed

If checks fail again:
- Read new failure logs
- Apply fixes
- Validate locally
- Push
- Monitor

**Safety limits:**
- **Maximum 4 iterations.** If still failing after 4 fix-push cycles, STOP and report:
  - What checks are still failing
  - What you've tried
  - Your best diagnosis of the root cause
- **Same failure twice = STOP.** If the same check fails with the same error after two different fix attempts, stop and explain.
- **Never suppress checks** — no `--no-verify`, no skipping, no `@ts-ignore` to silence errors.

### 7. Handle Code Review Findings

If a code review check (Claude Code Review, etc.) has findings:
```bash
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/reviews
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments
```

Fix by priority:
- **HIGH (must fix):** Security, data loss, correctness — fix immediately
- **MEDIUM:** Best practices, validation — fix before declaring ready
- **LOW:** Style, docs — note but don't block

### 8. Report

When all checks are green, report:
- Which checks failed and what the root causes were
- What fixes were applied (summary, not file-by-file)
- How many iterations it took
- Any deferred LOW findings
- Current PR status (ready to merge or needs user review)

## Rules

- Follow ALL CLAUDE.md rules.
- Always check out the PR branch before making changes: `gh pr checkout $ARGUMENTS`
- Never force push or use destructive git operations.
- Conventional commit messages for fix commits.
