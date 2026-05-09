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
3. `$ARTIFACTS_DIR/patterns.md` — sibling-shape hints. Shows which claimed files have
   existing test siblings (append to them) vs. which don't (do NOT create new test files).
4. `$ARTIFACTS_DIR/rules-digest.md` — the subset of CLAUDE.md rules most relevant to
   this PR's touched packages. CLAUDE.md is also in your system prompt; the digest
   highlights what matters for THIS specific work order.

CLAUDE.md is already loaded into your system prompt — do not re-read it. Its
project conventions are non-negotiable; follow every rule.

From the work order, extract:
- The list of phases with their descriptions
- Files-claimed for each phase
- Verification commands from the Notes column
- Any resolved decisions referenced by ID (D-XXX)

## Step 2: Select Next Phase (with Circuit Breaker)

### 2.1 Load Attempt Counters

Read (or initialize) `$ARTIFACTS_DIR/phase-attempts.json` — a `{ "<phase-id>": <count> }`
map of consecutive-failure counters. Created lazily by this step on first run.

```bash
attempts_file="$ARTIFACTS_DIR/phase-attempts.json"
if [[ ! -f "$attempts_file" ]]; then echo '{}' > "$attempts_file"; fi
```

### 2.2 Circuit Breaker — 3 Strikes

Cross-reference `work-order.md` phases against `progress.md`. For each phase
NOT yet marked COMPLETED, check `phase-attempts.json`:

- If `attempts[phase_id] < 3` → eligible.
- If `attempts[phase_id] >= 3` → **blocked**. Skip it.

  **First, check whether this phase has already been recorded as blocked.**
  Without this guard, every subsequent iteration re-appends a duplicate
  `## BLOCKED:<phase-id>` and re-fires the P1 filer — spamming the Notion
  tracker. Make the breaker idempotent:

  ```bash
  if rg -q "^## BLOCKED:${phase_id}$" "$ARTIFACTS_DIR/blocked.md" 2>/dev/null; then
      # Already recorded — skip both the append AND the follow-up filer.
      continue
  fi
  ```

  Otherwise, append to `$ARTIFACTS_DIR/blocked.md`:

  ```
  ## BLOCKED:<phase-id>
  Date: <ISO>
  Attempts: <count>
  Last error: <one-line summary from this iteration's last failure, if known>
  Cause: hit 3-strike circuit breaker — phase repeatedly failed verification across iterations.
  Files-claimed (per work order): <list>
  ```

  Then file a P1 follow-up via the filer (don't block on its exit code):

  ```bash
  ./.archon/scripts/append-followup.sh \
      --from cleanup-implement-phase \
      --pr "$(rg -oP 'PR-\d+' "$ARTIFACTS_DIR/work-order.md" | head -1)" \
      --severity P1 \
      --platform "$(determine-from-files-claimed)" \
      --title "BLOCKED phase <phase-id>: <short description>" \
      --body "Cleanup PR phase failed verification 3 consecutive times. See blocked.md and progress.md for last-known error. Manual investigation required." \
      || echo "Follow-up filer failed — capturing locally only."
  ```

### 2.3 Pick Next Phase

Pick the FIRST phase that is (a) not COMPLETED in `progress.md` and (b) not BLOCKED.

**Termination conditions:**
- All phases COMPLETED → skip to Step 6 (emit `ALL_PHASES_COMPLETE`).
- All non-completed phases BLOCKED → skip to Step 6 anyway. The summary node
  will surface `blocked.md` so a human knows the work order didn't fully land.
- Otherwise: increment `attempts[<picked-phase-id>]` in `phase-attempts.json` BEFORE
  starting Step 3, so a crash mid-implement still counts as an attempt.

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

Co-Authored-By: Archon <archon@anthropic.com>
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

### 5.6 Reset Attempt Counter

The phase succeeded. Reset its entry in `phase-attempts.json` so a re-run of the
workflow on a re-opened branch starts fresh:

```bash
jq --arg pid "<phase-id>" 'del(.[$pid])' "$ARTIFACTS_DIR/phase-attempts.json" \
    > "$ARTIFACTS_DIR/phase-attempts.json.tmp" \
    && mv "$ARTIFACTS_DIR/phase-attempts.json.tmp" "$ARTIFACTS_DIR/phase-attempts.json"
```

## Step 6: Check Completion

If ALL phases from the work order are now either:
- COMPLETED in `progress.md`, OR
- BLOCKED (recorded in `blocked.md` after 3 failed attempts)

…then output: <promise>ALL_PHASES_COMPLETE</promise>

If unblocked, non-completed phases remain, report which phase you just completed
(or which one is being deferred to the next iteration) and end normally. The
loop engine will start a fresh iteration for the next phase.

If the iteration ended without committing (e.g. validation failed at Step 4 after
3 in-iteration attempts), DO NOT emit `ALL_PHASES_COMPLETE` — exit normally so
the loop runs again. The attempt counter incremented in Step 2.3 ensures the
3-strike breaker eventually triggers across iterations.
