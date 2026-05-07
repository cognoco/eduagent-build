---
description: Implement one cleanup phase — read work order, implement, validate, commit, report
argument-hint: (none — reads from artifacts directory)
---

# Cleanup PR Implementation — Phase Loop

You are an autonomous coding agent. Your job: read the work order from disk, implement ONE phase, validate, commit, exit.

**Tool preferences**: Use `rg` for code search, `fd` for file finding. These are faster and cross-platform.

---

## Step 1: Load Context

Read these files (they were written by the extract step):

1. `$ARTIFACTS_DIR/work-order.md` — the full work order for this PR
2. `$ARTIFACTS_DIR/progress.md` — which phases are done (may not exist on first iteration)
3. `CLAUDE.md` — project conventions (CRITICAL — follow all rules)

From the work order, extract:
- The list of phases with their descriptions
- Files-claimed for each phase
- Verification commands from the Notes column
- Any resolved decisions referenced by ID (D-XXX)

## Step 2: Select Next Phase

Cross-reference `work-order.md` phases against `progress.md`.
Pick the FIRST phase not yet marked COMPLETED.

**If ALL phases are complete** → skip to Step 6.

## Step 3: Implement the Phase

Read EVERY file you plan to change before editing. Follow CLAUDE.md rules exactly:
- `@eduagent/schemas` is the shared contract — do not redefine types locally
- Business logic in `services/`, not route handlers
- Use `createScopedRepository(profileId)` for reads
- Default exports only for Expo Router page components
- Tests co-located with source files, no `__tests__/` folders

Make the changes described in the phase. Be precise — the cleanup plan specifies
exact files, exact renames, exact deletions.

## Step 4: Validate

Run the phase-specific verification command from the work order Notes column.
If no phase-specific command, run:

```bash
pnpm exec nx run-many -t typecheck 2>&1 | tail -30
```

**If validation fails**: fix the issue, re-run (up to 3 attempts). Do NOT commit broken code.

## Step 5: Commit

**IMPORTANT: Do NOT use --no-verify.** Dependencies are installed. Let pre-commit hooks run.

Stage and commit the phase's changes:

```bash
git add -A
git diff --cached --stat
```

Write a commit message file and commit with `-F`:

```bash
cat > "$ARTIFACTS_DIR/commit-msg.txt" <<'CMSG'
refactor(<scope>): <phase description>

Cleanup PR-XX Phase N: <brief details>
See docs/audit/cleanup-plan.md for full context.

Co-Authored-By: Claude <noreply@anthropic.com>
CMSG
git commit -F "$ARTIFACTS_DIR/commit-msg.txt"
```

If the pre-commit hook fails:
1. Read the error output carefully
2. Fix the issue (lint error, type error, test failure). Do not fix by changing tests.
3. Re-stage and retry the commit
4. Do NOT bypass with --no-verify

Then update progress tracking:

Write/append to `$ARTIFACTS_DIR/progress.md`:
```
## Phase <N>: <title> — COMPLETED
Date: <ISO date>
Files: <list>
Commit: <short hash>
---
```

## Step 6: Check Completion

If ALL phases from the work order are now in progress.md as COMPLETED:
- Output: <promise>ALL_PHASES_COMPLETE</promise>

If phases remain, report which phase you just completed and end normally.
The loop engine will start a fresh iteration for the next phase.
