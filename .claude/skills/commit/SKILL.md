---
name: commit
description: >
  Safe git commit workflow for this repo. Stages all changes, drafts a
  conventional commit message, handles pre-commit hook failures, and pushes.
  Always use this skill for committing code. It replaces the system prompt's
  built-in commit protocol and /zdx:commit. Trigger on: "commit", "commit
  and push", "save my changes", /commit, or any request to commit work.
context: fork
agent: general-purpose
model: sonnet
allowed-tools: Bash, Read, Grep
---

# Commit

Stage everything, commit with a conventional message, push. The pre-commit
hooks (lint-staged, tsc, jest, commitlint) enforce code quality at commit
time — this skill focuses on staging safely and writing good messages.

## Steps

### 1. Snapshot

Run these in parallel:

```bash
git status
git diff --cached --stat && git diff --stat
git log --oneline -5
```

If there are no changes, say "Nothing to commit" and stop.

### 2. Safety check

Scan for files that should NOT be committed:
- `.env`, `.dev.vars`, `credentials.json`, `*.pem`, `*.key` — **warn and exclude**
- Large binaries that look unintentional — **ask first**

### 3. Stage

- **No exclusions:** `git add -A`
- **With exclusions:** `git add -A` then `git reset HEAD -- <excluded-files>`

Bracket files (e.g. `[sessionId].tsx`) need `:(literal)` pathspec prefix in
`git reset` to avoid glob interpretation.

Staging everything before committing is essential — it makes lint-staged's
internal stash a no-op, preventing data loss when other agents have
unstaged changes in the same working tree.

### 4. Draft message

Run `git diff --cached --stat` to see the final staged set. Draft from the
stat output (file names + change counts) — do not read the full diff unless
the stat is ambiguous.

**Format:**

```
<type>(<scope>): <summary>   (max 72 chars)

- bullet points summarizing what changed and why (2-4 lines)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types** (enforced by commitlint — bad types will be rejected):
`feat`, `fix`, `docs`, `chore`, `refactor`, `cfg`, `plan`, `zdx`

**Finding-ID references:** When the staged changes fix a tracked finding,
include the ID in the subject — e.g. `fix(api): atomic quota decrement [CR-1C.1]`.

**Verified-By table** — include when the diff touches 3+ distinct finding IDs
(`BUG-\d+`, `CR-...`, `PERF-\d+`):

```
| ID       | Files                        | Verified By                           |
|----------|------------------------------|---------------------------------------|
| BUG-XXX  | apps/api/foo.ts, foo.test.ts | test: foo.test.ts:"break test name"   |
| CR-YYY   | packages/database/baz.ts     | N/A: schema-only, migrate verified    |
```

Every row needs a non-empty Verified By cell. If you can't fill one, the fix
is partial — split the commit.

**Sweep-audit block** — include when the message claims a sweep (the
`commit-msg` hook rejects sweep claims without one):

```
Sweep audit:
  rg 'pattern' path/
  -> N hits across N files; all N now have the fix.
```

Use `(no-sweep)` if a sweep keyword is incidental.

### 5. Commit

```bash
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

Do NOT use `--no-verify`. Let hooks run.

### 6. Handle failure

If the commit fails, read `references/failure-recovery.md` in this skill
directory for the detailed recovery procedure. The short version:

1. Read the hook error output
2. If lint-staged auto-fixed files, re-stage and retry
3. If tsc or jest failed on files unrelated to your changes, unstage those files and retry
4. Maximum 2 attempts. If still failing, report to the user.

### 7. Push

After a successful commit:

```bash
git push
```

If push fails (behind remote), ask before force-pushing or rebasing.

### 8. Report

Tell the user:
- Commit hash and message
- Which files were committed
- Which files (if any) were excluded and why
