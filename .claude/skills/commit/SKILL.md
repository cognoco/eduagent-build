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
   do not write code. This includes "clearing" cascade errors by
   rebuilding `dist/`, editing gitignored files to silence tsc, or
   touching another agent's WIP to make hooks pass. Other agents' broken
   WIP is theirs to fix — stash it, don't fix it.
6. **One scope per commit. Always split at scope boundary.** Scope is
   the top-level directory component, except `apps/` and `packages/`
   which split at 2 levels (`apps/api`, `apps/mobile`, `packages/schemas`,
   `packages/database`, ...). Files at the repo root are their own
   `(root)` scope. If the staged set spans 2+ scopes, you MUST split —
   no exceptions, no "but it's one logical feature." Shared-hook
   failures across scopes are the #1 cause of slow commits. Short-circuit
   only when one scope contains everything AND the total is < 100 files.

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

Commit untracked files in the same batch as their dependencies (e.g.,
`feedback.ts` together with the schema re-export it imports from) so the
commit is self-contained.

**Batching (per rule 6):** After staging, enumerate scopes:

```bash
git diff --cached --name-only | awk -F/ '
  ($1=="apps" || $1=="packages") && NF>1 { print $1 "/" $2; next }
  NF==1 { print "(root)"; next }
  { print $1 }
' | sort -u
```

If only one scope AND `git diff --cached --name-only | wc -l` < 100,
proceed as a single commit. Otherwise loop, one scope per iteration,
in this order (producers before consumers, cheap hooks first):

1. `.claude` — no hooks
2. `docs` — markdown lint only
3. `drizzle` — SQL, cheap
4. `packages/schemas` — most things depend on it
5. `packages/*` (others)
6. `apps/api`
7. `apps/mobile`
8. `(root)` — package.json, lockfile, top-level configs

For each scope iteration:
```bash
# Unstage everything outside this scope (preserve in working tree)
git diff --cached --name-only | grep -vE "^<scope>/" | \
  xargs -r git reset HEAD --
# Verify
git diff --cached --name-only | awk -F/ '...' | sort -u   # should be 1 scope
```

Run steps 4.5 → 6 → 7 for this scope, then re-stage the next scope
with `git add -A -- <next-scope>/` and repeat.

### 4.5. Cross-reference scan

Before drafting the message, check whether any staged file references
code that is modified in the working tree but NOT staged.

```bash
unstaged=$(git diff --name-only)
staged=$(git diff --cached --name-only)
[ -z "$unstaged" ] && exit 0   # nothing modified outside the index
for u in $unstaged; do
  base=$(basename "$u" | sed 's/\.[^.]*$//')
  [ ${#base} -lt 4 ] && continue   # skip short names to avoid false positives
  hits=$(echo "$staged" | xargs -r grep -l -F "$base" 2>/dev/null)
  [ -n "$hits" ] && echo "REF: $u -> $hits"
done
```

Each `REF:` line is a potential half-feature commit. For each:

- If the unstaged file is in the **same scope** as the staged ones, pull
  it in: `git add -- <unstaged-file>`. The staged set must be
  self-contained within the scope.
- If the unstaged file is in a **different scope**, do nothing — it will
  land in its own scope batch later. (Brief HEAD~1 broken-build window
  is acceptable; chronological order is what matters.)
- If you cannot decide, stop and report — do not guess.

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

Every row needs a non-empty Verified By cell — `test:`, `manual:`, or
`N/A:` with reason. If 6+ IDs are present, prefer splitting into smaller
commits (one per logical fix) — bundles hide weak fixes among solid ones.

**Sweep-audit block** — when the message claims a sweep (hook enforces):

```text
Sweep audit:
  rg 'pattern' path/
  -> N hits; all N now have the fix.
```

Use `(no-sweep)` if a sweep keyword is incidental.

**Prompt + eval pairing:** If the staged diff touches
`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`
(non-test files), `apps/api/eval-llm/snapshots/**` must also be staged.
Run `pnpm eval:llm` and re-stage before committing. Bypass only for pure
refactors (rename, comment, type-only) that cannot affect generation output.

### 6. Commit

```bash
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

Do NOT use `--no-verify`. Let hooks run.

### 7. Handle failure

If the commit fails, changes are still staged — nothing is lost.

**Diagnostic first: are the failing files in your staged set?**
Parse the failing file paths from the hook output. Compare against
`git diff --cached --name-only`.

- **Failing files NOT in your staged set** (other agents' broken WIP
  poisoning whole-tree tsc/lint): this is the most common case under
  concurrent agents. Stash unstaged WIP and retry **immediately** —
  do not investigate the errors, they are not yours.

  **Stash lifecycle (strict):**
  1. Snapshot existing stashes before any push:
     `before=$(git stash list | wc -l)`.
  2. Push with the `temp:` label:
     `git stash push --keep-index -u -m "temp: commit-skill WIP"`.
  3. Commit. On success, pop:
     `git stash pop stash@{0}` (always pop by exact ref, never bare
     `git stash pop`).
  4. Verify stash count returned to `before`. If it did not:
     `git stash list` — locate the `temp: commit-skill WIP` entry and
     `git stash drop stash@{N}`. **Never drop a stash whose message
     does not start with `temp:`** — pre-existing stashes are the
     caller's WIP and must be preserved.
  5. If `git stash pop` reports "stash entry is kept" (conflict), STOP
     and report. Do not retry the pop, do not drop, do not force.
     Verify with `git stash show --stat 'stash@{0}'` and surface the
     conflict to the caller.

- **Failing files ARE in your staged set:** classify by relatedness.
  - *Related* (test for code you're committing, same logical scope,
    typecheck failure your commit depends on): **stop and report.**
    Do not split, do not skip-and-ship — the caller must fix the code.
  - *Unrelated tooling noise* (stale snapshots, lint config glitch,
    pre-existing failure you didn't touch): unstage those files and
    retry once.
  - *NX boundary errors* ("Static imports of lazy-loaded libraries are
    forbidden"): stale NX graph. Run `pnpm exec nx reset`, re-stage,
    retry once.

**Retry budget: 1 retry, then stop.** If the stash-and-retry (or
unstage-and-retry) still fails, report what's stuck and why. Do NOT
investigate the errors, do NOT rebuild `dist/`, do NOT edit code to
clear cascade errors — that is the caller's job. Per rule 5, you commit
code, you do not write it.

Excluded files remain as unstaged changes — they are NOT lost.

### 8. Push (only if explicitly requested)

Only if arguments explicitly say "and push." Otherwise STOP here.

If push fails, report the situation. Do not force-push or rebase.

### 9. Report

Tell the user:
- Commit hash and message
- Which files were committed
- Which files (if any) were excluded and why
- Whether push was performed or skipped
