# Ship — Autonomous Commit, Push, CI Fix, and Merge

Autonomous workflow: type-check, lint, test, commit, push, monitor CI, fix failures, and optionally merge — all without check-ins.

## Arguments

$ARGUMENTS — Optional flags:
- `--no-merge` — Stop after CI passes (don't merge the PR)
- `--message "..."` — Custom commit message (otherwise auto-generated)
- PR number (e.g., `#82`) — Skip commit/push, just fix CI and merge an existing PR

## Workflow

### Phase 1: Local Validation (before committing)

1. **Type-check the entire project:**
   ```bash
   pnpm exec tsc --noEmit
   ```
   Fix any errors before proceeding.

2. **Lint modified projects** (determine from `git diff --name-only`):
   ```bash
   pnpm exec nx lint api --quiet
   pnpm exec nx lint mobile --quiet
   ```
   Fix any lint errors.

3. **Run related tests** for all changed files using the project's testing rules (see CLAUDE.md "Testing Rules" section). Fix any failures.

4. If any fixes were needed in steps 1-3, loop back to step 1 to confirm everything still passes.

### Phase 2: Commit and Push

5. **Stage and commit** with a conventional commit message (commitlint format). If `--message` was provided, use that.

6. **Push** to the current branch with `-u` flag.

### Phase 3: CI Monitoring and Fix Loop

7. **Wait for CI to start**, then monitor:
   ```bash
   gh pr checks <number> --watch
   ```
   If no PR exists yet, create one first.

8. **If any check fails:**
   a. Read the failure logs:
      ```bash
      gh run view <run-id> --log-failed
      ```
   b. Diagnose the root cause.
   c. Apply the minimal fix.
   d. Run local validation again (Phase 1 steps 1-3).
   e. Commit and push the fix.
   f. Go back to step 7.

9. **Safety rails for the fix loop:**
   - Maximum 4 fix-push iterations. If still failing after 4, STOP and report what's wrong.
   - If the same check fails twice with different fixes, STOP and explain the root cause to the user.
   - Never skip, suppress, or --no-verify past a failing check.

### Phase 4: Merge (unless --no-merge)

10. **Read automated code review findings** before merging:
    ```bash
    gh api repos/{owner}/{repo}/pulls/<number>/reviews
    gh api repos/{owner}/{repo}/pulls/<number>/comments
    ```
    Fix any HIGH or MEDIUM findings. LOW findings can be noted but don't block merge.

11. **Merge** with squash:
    ```bash
    gh pr merge <number> --squash
    ```

12. **Report** the final result: merged PR URL, what was fixed during CI loops (if anything), and any deferred LOW findings.

## Rules

- Follow ALL CLAUDE.md rules — especially testing, type-checking, and git conventions.
- Never force push, reset --hard, or use --no-verify.
- Conventional commits format (commitlint).
- If the user provided `--no-merge`, stop after all CI checks pass and report readiness.
