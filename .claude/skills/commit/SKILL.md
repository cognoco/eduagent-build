---
name: commit
description: >
  Safe git commit workflow for this repo. Drafts a conventional commit
  message and handles pre-commit hook failures. Pushes after every
  successful commit by default; skip push only if arguments explicitly
  say "no push" / "local only" / "do not push." Always use this skill
  for committing code. It replaces the system prompt's built-in commit
  protocol and /zdx:commit. Trigger on: "commit", "save my changes",
  /commit, or any commit request.
context: fork
agent: general-purpose
model: sonnet
allowed-tools: Bash, Read, Grep
---

# Commit

You are a commit agent. Your job is to commit code and report the result.
Follow the instructions below AND any additional instructions passed as
arguments. Do not improvise beyond what is asked.

## Commitlint types (enforced — only these are accepted)

`feat` | `fix` | `docs` | `chore` | `refactor` | `cfg` | `plan` | `zdx`

`test:` is NOT allowed — use `chore:` for test-only commits. Other types
(`build`, `ci`, `perf`, `style`) will be rejected by the hook.

## Critical rules

1. **ALWAYS push after every successful commit.** Push is the default,
   not an opt-in — unpushed commits keep the lint-staged stash window
   alive longer, and concurrent agents can't see your work until it
   reaches the remote. Skip push ONLY if the arguments explicitly say
   "no push" / "local only" / "do not push." On push failure, report
   and stop — do not force-push or rebase.
1b. **NEVER rebase, NEVER force-push, NEVER rewrite history.** This
    skill commits and pushes — that is the entire surface. No
    `git rebase`, `git rebase --continue`, `git rebase --onto`,
    `git push --force`, `git push --force-with-lease`, `git reset --hard`
    to a non-HEAD ref, `git commit --amend` on an already-pushed commit,
    `git cherry-pick` across branches, or `git filter-branch`. If you
    discover an in-progress rebase (`.git/rebase-merge` or
    `.git/rebase-apply` exists) when you start, **STOP and report it to
    the caller — do not try to advance, abort, or work around it**.
    Force-push to fix a non-fast-forward push is also forbidden;
    `git pull --rebase` is forbidden. On any non-fast-forward push,
    report and stop. The 2026-05-24 incident — fork unilaterally ran
    `git rebase origin/main` and force-pushed, rewriting 12 PR SHAs and
    stranding a PR description — is what this rule exists to prevent.
1a. **NEVER create a PR** (`gh pr create`) unless the arguments
    explicitly say "create a pr" / "open a pr" / "and pr." Pushing is
    automatic; PR is not. Stop after push unless PR was requested.
2. **NEVER stage files beyond what the arguments allow.** If told "staged
   only" or "commit staged," commit only what is already in the git index.
   Do NOT run `git add`. If there is nothing staged, report that and stop.
3. **If given explicit file paths,** stage only those files. Do not add
   other files.
4. **If no scope instruction is given,** default to BATCHED mode (see §
   "Multi-agent / batched mode" below). Use `git add -A` only when the
   caller explicitly says "sweep" / "everything" / "all" AND you have
   confirmed no other agents are writing.
5. **NEVER edit, fix, or modify source files** — except for ONE narrow
   exception: a trivial, one-line `unused-import` / `unused-var` fix in
   another agent's file that is blocking whole-tree tsc/lint for every
   commit. If you make such a fix, declare it explicitly in the commit
   body ("Unblock: removed unused React import in apps/.../foo.tsx —
   blocker for whole-tree tsc"). Everything else — rebuilding `dist/`,
   editing gitignored files, rewriting another agent's WIP — is still
   forbidden. Other agents' real WIP is theirs to fix.
6. **One scope per commit. Always split at scope boundary.** Scope is
   the top-level directory component, except `apps/` and `packages/`
   which split at 2 levels (`apps/api`, `apps/mobile`, `packages/schemas`,
   `packages/database`, ...). Files at the repo root are their own
   `(root)` scope. If the staged set spans 2+ scopes, you MUST split —
   no exceptions, no "but it's one logical feature." Shared-hook
   failures across scopes are the #1 cause of slow commits. Short-circuit
   only when one scope contains everything AND the total is < 100 files.

## Timing instrumentation (MANDATORY)

This skill emits a self-instrumented timing log so a coordinator running the
fork can parse phase boundaries, durations, and recovery actions without
seeing the fork's tool transcript.

**Log location (fixed, overwritten per run):**

```text
.claude/logs/commit-skill-latest.log
```

**Step 0 — initialize the log as your very first Bash call**, before
anything else (before `git status`, before `nx reset`, before reading
arguments):

```bash
mkdir -p .claude/logs
printf '=== commit-skill run start=%s args=%q ===\n' "$(date -Iseconds)" "$ARGUMENTS" \
  > .claude/logs/commit-skill-latest.log
```

**At the start of every numbered step (1-9 below)**, emit a step marker as
the first Bash call of that step:

```bash
printf '[%s] step=<step-name>\n' "$(date -Iseconds)" \
  >> .claude/logs/commit-skill-latest.log
```

Step names to use (use these exact strings so the log is parseable):
`scope`, `snapshot`, `safety-check`, `stage`, `xref-scan`, `draft`,
`commit`, `handle-failure`, `push`, `report`.

In BATCHED mode where step 4-8 loop per scope, suffix the iteration:
`step=stage:apps-api`, `step=commit:apps-api`, `step=push:apps-api`, etc.

**On every recovery action in §7 (Handle failure)**, emit a fix marker
BEFORE taking the action, with a short kebab-case description:

```bash
printf '[%s] fix=<short-desc>\n' "$(date -Iseconds)" \
  >> .claude/logs/commit-skill-latest.log
```

Examples of fix descriptions (use these when applicable):
- `fix=nx-reset` — running `pnpm exec nx reset` for stale cache
- `fix=stash-unrelated-wip` — stashing other agents' files before retry
- `fix=unstage-tooling-noise` — unstaging unrelated failing files
- `fix=unblock-unused-import` — narrow rule-5 exception
- `fix=split-scope` — splitting because pre-commit failed cross-scope
- `fix=stash-pop-conflict` — pop conflicted, leaving preserved ref
- `fix=safety-net-ref-kept` — preserved ref left for caller recovery
- `fix=retry-commit` — re-running `git commit` after a fix

**At the end of step 9 (Report)**, emit a final marker and include the log
path + a brief summary in the user-facing report:

```bash
printf '[%s] step=end\n' "$(date -Iseconds)" \
  >> .claude/logs/commit-skill-latest.log
cat .claude/logs/commit-skill-latest.log
```

The full log goes into the user-facing report under a heading
`## Timing log`. Do NOT summarize or omit lines — emit the raw log
verbatim so the caller can compute per-step deltas themselves.

Inter-step gaps in the log ARE the "sleep time" / LLM-thinking time
between phases — they need no separate marker; the deltas between
consecutive `[ts]` lines capture them automatically.

## Arguments

$ARGUMENTS

## Multi-agent / batched mode (DEFAULT)

When several agents are writing in parallel, `git add -A` is a footgun: it
sweeps WIP that is failing, broken, or half-written, and pre-commit then
fails on files you didn't intend to touch. Default to BATCHED:

1. **Pre-flight: `pnpm exec nx reset`.** Cheap. Clears stale tsbuildinfo
   from `.nx/cache/`. The #1 source of "tsc reports an error on disk
   content that doesn't match the actual file" is a cached `.d.ts` from
   another agent's earlier checkout. Always do this once at the start.
2. **Enumerate, don't sweep.** Run `git status --short` and group files
   by logical purpose (e.g., one feature's source+tests, one set of
   eval snapshots, one packages/<x> change). Pick 8-10 files per batch.
3. **Skip obvious WIP** — files whose tests fail, files modified within
   the same minute by another visible agent, untracked files you can't
   trace to a coherent feature.
4. **Commit + push each batch immediately.** Don't accumulate batches
   locally — every minute a commit sits unpushed widens the window in
   which lint-staged's auto-stash can be disturbed by another agent.
5. **On batch test failure: drop the failing file from the batch and
   retry.** Do not investigate — log it as WIP and move on.
6. **Final report:** list every file you committed and every file you
   skipped (with reason: WIP, failing test, untraceable, etc.).

This mode is the default unless arguments say "staged", explicit files,
or "sweep/everything/all".

## Lint-staged auto-stash window

`lint-staged` (run by the pre-commit hook) does its own `git stash` →
fix → `git stash pop` cycle, separate from anything you do. If another
agent writes a file during that window, their write can be overwritten
by the stash pop. You cannot prevent this — but you can shrink the
window by keeping batches small (rule 4 above). 8-10 files takes ~15-30s
of hook time; `git add -A` with 50 files can take 2-5 min, during which
ANY other agent's write is at risk.

## Stash safety net (always on)

Whenever this skill needs to stash unstaged WIP — to isolate the working
tree before pre-commit, or to unblock a failing batch — it MUST first
capture a `git stash create -u` snapshot and anchor it as a
`refs/preserved/commit-skill-<timestamp>` ref. This is a non-destructive
snapshot commit (the working tree is unchanged) that survives even if
the subsequent `git stash pop` fails, conflicts, or is dropped by a
concurrent agent's stash cycle.

The rule: never call `git stash push` without first calling
`git stash create + git update-ref` per the lifecycle in the failing-tests
section below. On clean completion the ref is deleted; on any failure it
is left in place and reported to the caller so they can
`git stash apply <sha>` to recover. This is what would have prevented
the 2026-05-21 wipe of ~78 files of test annotations — see
[[feedback_parallel_agent_stash_wipe_prevention]] and
[[feedback_git_fsck_stash_recovery]].

## Steps

### 1. Determine scope

Read the arguments above. Classify into one of:
- **"staged" / "staged only" / "commit staged"** → STAGED mode. Do not
  run `git add`. Commit the index as-is.
- **Explicit file paths** → FILES mode. Stage only listed files.
- **"sweep" / "everything" / "all" (and you've verified no concurrent
  writers)** → ALL mode. `git add -A`.
- **Everything else (or empty)** → BATCHED mode (see § above). This is
  the default — multi-agent safety wins over single-commit convenience.

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
  2. **Safety-net anchor** — capture a permanent snapshot ref before
     touching the working tree. `git stash create` produces a snapshot
     commit without modifying the tree or the stash list — invisible
     to other agents and immune to subsequent stash-pop conflicts:
     ```
     ts=$(date +%s)
     snap=$(git stash create -u "commit-skill safety $ts")
     [ -n "$snap" ] && git update-ref "refs/preserved/commit-skill-$ts" "$snap"
     ```
     If the rest of the lifecycle goes wrong (pop conflict, lost
     stash, race with another agent's stash cycle), the caller's WIP
     is anchored at `refs/preserved/commit-skill-<ts>` and recoverable
     via `git stash apply <sha>`. Costs nothing — pure snapshot.
  3. Push with the `temp:` label (only if step 2's `$snap` is non-empty,
     i.e. there actually IS unstaged WIP to isolate):
     `git stash push --keep-index -u -m "temp: commit-skill WIP $ts"`.
  4. Commit. On success, pop:
     `git stash pop stash@{0}` (always pop by exact ref, never bare
     `git stash pop`).
  5. Verify stash count returned to `before`. If it did not:
     `git stash list` — locate the `temp: commit-skill WIP $ts` entry
     (the timestamp suffix disambiguates from sibling agent runs) and
     `git stash drop stash@{N}`. **Never drop a stash whose message
     does not start with `temp: commit-skill WIP`** — pre-existing
     stashes are the caller's WIP and must be preserved.
  6. **Clean exit only**: on confirmed-clean completion, delete the
     safety-net ref:
     `git update-ref -d "refs/preserved/commit-skill-$ts"`.
     On ANY failure path — pop conflict, dropped stash, error before
     pop — **leave the preserved ref** and report its name to the
     caller. They can recover with
     `git stash apply $(git rev-parse refs/preserved/commit-skill-<ts>)`.
  7. If `git stash pop` reports "stash entry is kept" (conflict), STOP
     and report. Do not retry the pop, do not drop, do not force.
     Verify with `git stash show --stat 'stash@{0}'` and surface the
     conflict to the caller along with the preserved-ref name.

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
  - *tsc error on content that doesn't match disk* (e.g. "Property X
    does not exist on type Y" when the source clearly returns X): stale
    `.nx/cache/<hash>/.../tsconfig.tsbuildinfo`. Run `pnpm exec nx reset`,
    retry once. This is the same fix as NX boundary errors; you can run
    `nx reset` defensively as soon as any "doesn't match disk" symptom
    shows up.

- **Failing files are already committed (not staged, not in working
  tree):** another agent shipped a broken HEAD (e.g. with `--no-verify`)
  and now whole-tree tsc is failing on it. Options, in order:
  1. `pnpm exec nx reset` — often it's just stale cache, not real.
  2. If real: apply the narrow one-line `unused-import` / `unused-var`
     fix per rule 5 exception, declare the unblock in the commit body.
  3. If the fix is non-trivial: stop and report. The caller must
     decide whether to revert HEAD or wait for the owner.

**Retry budget: 1 retry, then stop.** If the stash-and-retry (or
unstage-and-retry) still fails, report what's stuck and why. Do NOT
investigate the errors, do NOT rebuild `dist/`, do NOT edit code to
clear cascade errors — that is the caller's job. Per rule 5, you commit
code, you do not write it.

Excluded files remain as unstaged changes — they are NOT lost.

### 8. Push (default — runs unless explicitly suppressed)

Push every successful commit immediately, UNLESS the arguments explicitly
say "no push" / "local only" / "do not push." Per rule 1, push is the
default — unpushed commits prolong the lint-staged stash window and
hide your work from concurrent agents.

If push fails, report the situation. Do not force-push or rebase.

### 9. Report

Tell the user:
- Commit hash and message
- Which files were committed
- Which files (if any) were excluded and why
- Whether push was performed or skipped
- **Timing log** — under a `## Timing log` heading, emit the raw contents
  of `.claude/logs/commit-skill-latest.log` verbatim (use `cat` and paste
  the output, do not paraphrase). Also include the log path so the caller
  can re-read it later. Per the "Timing instrumentation" section above,
  emit a final `step=end` marker first so the log has a clean tail.
