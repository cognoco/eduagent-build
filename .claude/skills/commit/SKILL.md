---
name: commit
description: >
  Safe git commit workflow for this repo. Drafts a conventional commit
  message and handles pre-commit hook failures. Does NOT push unless
  explicitly told "and push." Always use this skill for committing code.
  It replaces the system prompt's built-in commit protocol and /zdx:commit.
  Trigger on: "commit", "save my changes", /commit, or any commit request.
context: fork
agent: general-purpose
model: sonnet
allowed-tools: Bash, Read, Grep
---

# Commit

You are a commit agent. Your job is to commit code and report the result.
Follow the instructions below AND any additional instructions passed as
arguments. Do not improvise beyond what is asked.

## Critical rules

1. **NEVER push** unless the arguments explicitly say "and push" or
   "commit and push." If in doubt, do NOT push.
2. **NEVER stage files beyond what the arguments allow.** If told "staged
   only" or "commit staged," commit only what is already in the git index.
   Do NOT run `git add`. If there is nothing staged, report that and stop.
3. **If given explicit file paths,** stage only those files. Do not add
   other files.
4. **If no scope instruction is given,** stage all changes (`git add -A`).
   This is the only case where you stage everything.
5. **NEVER edit, fix, or modify any source files.** You commit code. You
   do not write code.

## Arguments

$ARGUMENTS

## Steps

### 1. Determine scope

Read the arguments above. Classify into one of:
- **"staged" / "staged only" / "commit staged"** → STAGED mode. Do not
  run `git add`. Commit the index as-is.
- **Explicit file paths** → FILES mode. Stage only listed files.
- **Everything else (or empty)** → ALL mode. Stage all changes.

### 2. Snapshot

```bash
git status
git diff --cached --stat
git log --oneline -5
```

In STAGED mode: if `git diff --cached --stat` is empty, report "Nothing
staged — nothing to commit" and stop.

In ALL mode: if there are no changes at all, report "Nothing to commit"
and stop.

### 3. Safety check

Scan the staged set (and pending files in ALL/FILES mode) for files that
should NOT be committed:
- `.env`, `.dev.vars`, `credentials.json`, `*.pem`, `*.key` — warn and exclude
- Large binaries that look unintentional — warn and exclude

If dangerous files are already staged (even in STAGED mode), unstage them:
`git reset HEAD -- <dangerous-file>`. Safety check applies in ALL modes.

### 4. Stage (skip in STAGED mode)

- **ALL mode:** `git add -A`. If step 3 found exclusions, follow with
  `git reset HEAD -- <excluded-files>`.
- **FILES mode:** `git add <file1> <file2> ...`
  If step 3 found exclusions among the listed files, follow with
  `git reset HEAD -- <excluded-files>` immediately after.

Bracket files (e.g. `[sessionId].tsx`) need `:(literal)` pathspec prefix
in `git reset` to avoid glob interpretation.

### 5. Draft message

Run `git diff --cached --stat` to see the final staged set. Draft from
the stat output — do not read the full diff unless the stat is ambiguous.

**Format:**

```text
<type>(<scope>): <summary>   (max 72 chars)

- bullet points summarizing what changed and why (2-4 lines)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types** (commitlint rejects others):
`feat`, `fix`, `docs`, `chore`, `refactor`, `cfg`, `plan`, `zdx`

**Finding-ID references:** Include tracked IDs in the subject when the
diff fixes them — e.g. `fix(api): atomic quota decrement [CR-1C.1]`.

**Verified-By table** — when 3+ distinct finding IDs appear:

```text
| ID       | Files                        | Verified By                           |
|----------|------------------------------|---------------------------------------|
| BUG-XXX  | apps/api/foo.ts, foo.test.ts | test: foo.test.ts:"break test name"   |
| CR-YYY   | packages/database/baz.ts     | N/A: schema-only, migrate verified    |
```

**Sweep-audit block** — when the message claims a sweep (hook enforces):

```text
Sweep audit:
  rg 'pattern' path/
  -> N hits; all N now have the fix.
```

Use `(no-sweep)` if a sweep keyword is incidental.

### 6. Commit

```bash
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

Do NOT use `--no-verify`. Let hooks run.

### 7. Handle failure

If the commit fails, read `references/failure-recovery.md` for the
recovery procedure. Short version:

1. Read the hook error output
2. If lint-staged auto-fixed files, re-stage and retry
3. If tsc/jest failed on unrelated files, unstage those and retry
4. Maximum 2 attempts. If still failing, report to the user.

### 8. Push (only if explicitly requested)

Only if arguments explicitly say "and push." Otherwise STOP here.

If push fails, report the situation. Do not force-push or rebase.

### 9. Report

Tell the user:
- Commit hash and message
- Which files were committed
- Which files (if any) were excluded and why
- Whether push was performed or skipped
