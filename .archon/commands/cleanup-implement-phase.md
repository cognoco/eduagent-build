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

This step is the workflow's authorized commit point (CLAUDE.md exception for structured-workflow commits).

**IMPORTANT: Do NOT use `--no-verify`.** Dependencies are installed. Let pre-commit hooks run.

### 5.1 Stage

```bash
git add -A
git diff --cached --stat
```

### 5.2 Safety check — never commit secrets or scratch files

Scan the staged set for files that must NEVER be committed. If any are present, unstage them before committing:

```bash
git diff --cached --name-only | \
    grep -E '(^|/)(\.env(\.[^/]+)?|\.dev\.vars|credentials\.json|.*\.pem|.*\.key)$' || true
```

If anything matches, unstage with `git reset HEAD -- <file>` for each.

For paths containing brackets (e.g. `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`), the shell's glob expansion will mangle the path. Prefix with `:(literal)` to disable globbing:

```bash
git reset HEAD -- ':(literal)apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx'
```

Also unstage anything that's clearly scratch or workflow output: `*.scratch.md`, `*.tmp.md`, `pr-body.md`, anything under `$ARTIFACTS_DIR`.

### 5.3 Commit

Write the commit message file and commit:

```bash
cat > "$ARTIFACTS_DIR/commit-msg.txt" <<'CMSG'
refactor(<scope>): <phase description>

Cleanup PR-XX Phase N: <brief details>
See docs/audit/cleanup-plan.md for full context.

Co-Authored-By: Claude <noreply@anthropic.com>
CMSG
git commit -F "$ARTIFACTS_DIR/commit-msg.txt"
```

### 5.4 Hook failure recovery (max 2 attempts)

If the pre-commit hook fails, follow this recipe — do NOT improvise:

1. Read the hook output. Identify which check failed (lint-staged auto-fix, tsc, jest, commitlint).
2. **lint-staged auto-fixed files** → the formatter or `eslint --fix` modified files in your staged set. Re-stage the same paths with `git add` and retry the commit. Do not write any code.
3. **tsc / jest failed on files this phase did NOT change** → these are pre-existing failures unrelated to your work. Unstage them with `git reset HEAD -- <file>` (use `:(literal)` for bracket-named files) and retry. Note in the phase progress entry which files were excluded and why.
4. **tsc / jest failed on files this phase changed** → the change is broken. Fix the code, re-stage, retry.
5. After 2 failed attempts, stop and report the situation. Do NOT use `--no-verify`. Do NOT delete or weaken tests to make them pass.

### 5.5 Report

After the commit succeeds, output exactly one line so downstream nodes can parse it:

```bash
echo "Phase $N committed: $(git log -1 --format='%h %s')"
```

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
