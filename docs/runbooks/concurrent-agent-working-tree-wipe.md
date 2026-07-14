# Runbook: Concurrent-agent working-tree wipe / zeroing

> **SAFETY CORRECTION (2026-07-14): DO NOT USE BLANKET `git restore .`, `git checkout -- .`, OR THE OLD TL;DR.** A shared tree may contain legitimate edits from several sessions; index presence does not prove every unstaged change is disposable. Capture the exact path list, identify owners, stop the writer, and restore only confirmed zeroed paths from the correct source. New work belongs in `.worktrees/<branch>` via `.agents/skills/worktree-setup/SKILL.md`.

**Class:** Local data-integrity incident (working tree only)
**Severity:** High if you have uncommitted work; Low if the tree was clean
**Scope:** Recoverable in almost all cases — `HEAD` and the git index are normally untouched
**Platform notes:** Windows + PowerShell; username contains `č` (breaks some native tools — see CLAUDE.md / MEMORY)

---

## 1. What this incident looks like

A second process (another Claude/Codex agent, a `git stash` cycle from a parallel
agent, a crashed `env:sync`, a watcher, or a native tool choking on the `č` home
path) mutates or **truncates many tracked files to 0 bytes** while you work.

This pattern is real: on 2026-05-22, parallel agents on `i18n-translations`
stash-cycled ~30 test files + ~100 annotations into oblivion (recovered via the
`git fsck` salvage in Step 5B). Treat a sudden, growing modified-file count plus
0-byte tracked files as this incident until proven otherwise.

> Caveat — distinguish a real wipe from a false alarm. A *legitimately* active
> branch (e.g. a Codex agent mid-feature) shows a *stable, coherent* set of
> modified files. Before declaring an incident, confirm two things: (a) the count
> is genuinely **growing** across reads seconds apart, and (b) files are **0
> bytes at their correct paths**. Wrong paths (e.g. a directory mistaken for a
> file) and aborted parallel tool-batches can both fake the symptoms.

### Symptoms

- `git status` shows a sudden, large, **growing** count of modified files
  (observed climbing 847 → 1454 → 1804 over ~1 minute).
- Files you just read now report **0 bytes** (`wc -c < file` → `0`), while the
  same file is fine in `HEAD`.
- Read/Edit tools start returning empty content, placeholder/hallucinated
  content, or `File does not exist` for files that exist.
- All modified entries are ` M` in `git status --porcelain` (unstaged, working
  tree only — nothing staged).

### The single most important fact

**Your real content is almost always safe.** The wipe hits the *working tree*.
`HEAD` (last commit) and the *index* (staged snapshot) are normally intact, so a
plain restore brings everything back. Confirm this before touching anything
(Step 3).

---

## 2. STOP — do not restore yet

Restoring while the wiper is still running is futile: it re-zeroes what you
recover, and your `git restore` can race a concurrent `git stash` and corrupt the
index. **Stop the bleeding first (Step 4), then restore (Step 5).**

Do **not**:
- run `git checkout -- .` / `git restore .` / `git reset --hard` while files are
  still actively changing;
- run `/commit` (you'd commit a tree full of 0-byte files);
- `git stash` (a stash of a half-wiped tree is worse than useless, and stash
  cycles are a *cause* of this class of incident — see Prevention).

---

## 3. Triage — confirm the damage is working-tree-only

Run these **one at a time** (parallel batches abort each other if one path is
wrong — that itself masks the real state).

```powershell
# Where am I, and how bad is it?
git branch --show-current
git status --porcelain=v1 | Measure-Object -Line   # blast radius

# Pick any file that shows as 0 bytes in the working tree, e.g. a real one here:
$f = "apps/api/eval-llm/runner.ts"
(Get-Item $f).Length                 # working-tree size (0 = wiped)
git cat-file -s "HEAD:$f"            # HEAD size  (non-zero = safe in last commit)
git cat-file -s ":$f"               # index size (non-zero = safe staged)
```

Interpretation:

| HEAD size | Index size | Working size | Meaning | Recovery |
|---|---|---|---|---|
| non-zero | = HEAD | 0 | Tree was at/near HEAD, just zeroed | **Step 5A** clean restore — lossless |
| non-zero | ≠ HEAD | 0 | You had **staged** work; index holds it | **Step 5A** (`git restore` pulls from index) |
| non-zero | = HEAD | 0, but you *know* you had **unstaged** edits | Those edits were never hashed by git | **Step 5B** fsck salvage (low odds) |

Confirm nothing is staged-and-different and there are no stashes:

```powershell
git diff --cached --shortstat        # empty  => index == HEAD, nothing staged
git stash list                       # empty  => no stash recovery path needed
git reflog stash                     # dropped stashes live here even if list is empty
```

---

## 4. Stop the bleeding — find and kill the wiper

The damage is concurrent, so identify the other actor:

```powershell
# Is the modified count still GROWING? Sample twice.
git status --porcelain=v1 | Measure-Object -Line
Start-Sleep -Seconds 3
git status --porcelain=v1 | Measure-Object -Line   # higher => still active

# Who's running? Look for extra node/git/codex/pnpm processes.
Get-Process node,git,pnpm,esbuild,tsx,code -ErrorAction SilentlyContinue |
  Sort-Object StartTime |
  Select-Object Id,ProcessName,StartTime,Path
```

Then, in order of preference:

1. **Stop the other agent at its source** — close the other Claude/Codex/Cursor
   session or terminal that's operating on this checkout. Cleanest.
2. **Kill a watcher/build** you recognize as the culprit by PID:
   `Stop-Process -Id <pid>`.
3. **Last resort — kill all node** (also stops Metro/Expo/nx/jest):
   `Get-Process node | Stop-Process -Force`.

Re-sample the count until it is **stable across two reads ~5s apart**. Only then
proceed.

> Branch hygiene: this happens most when two agents share one checkout. The fix
> going forward is **one committer per checkout** + a worktree per agent — see
> Prevention and `.claude/skills/worktree-setup/SKILL.md`.

---

## 5. Recover

### 5A. Selective restore after ownership confirmation

Once the wiper is stopped and the count is stable:

```powershell
# Record the affected paths and inspect each working/index/HEAD state.
git status --porcelain=v1 > recovery-paths.txt

# After the owner confirms a specific zeroed path is disposable, restore only it.
git restore --worktree -- "path/to/confirmed-zeroed-file"

# Verify: modified count should drop to ~0 (only genuinely-changed files remain).
git status --porcelain=v1 | Measure-Object -Line

# Spot-check a previously-zeroed file is whole again.
(Get-Item "apps/api/eval-llm/runner.ts").Length    # back to its real size
```

Never extrapolate one safe path to the whole tree. Repeat the evidence and owner
check per path; preserve staged work and any non-zero unstaged variant.

### 5B. Salvage genuinely-uncommitted edits (only if Step 3 said so)

If you had unstaged edits that were never `git add`ed or stashed, git never
hashed them, so they are gone from the object store and unrecoverable. If they
*were* ever added/stashed at some point, sift dangling blobs:

```powershell
git fsck --no-reflogs --dangling          # lists dangling blob/commit/tree hashes
# Inspect a candidate blob:
git cat-file -p <blob-sha> | Select-Object -First 40
# When you find the right one, write it back:
git cat-file -p <blob-sha> > path/to/file.ts
```

Note: a busy repo legitimately has thousands of dangling blobs (3360 observed in
this incident) — most are unrelated git bookkeeping. This is a needle-in-haystack
last resort, not the primary path.

---

## 6. Post-recovery checklist

- [ ] `.dev.vars` (and any `.env*`) zeroed? These are **not** in git. Regenerate:
      `pnpm env:sync` (see MEMORY: secrets via Doppler; `EXPO_PUBLIC_*` synced here).
- [ ] `git status` is clean (or shows only your real intended changes).
- [ ] Typecheck a touched package to confirm files are syntactically whole:
      `pnpm exec nx run api:typecheck`.
- [ ] If you had been mid-task, re-confirm the active branch
      (`git branch --show-current`) — concurrent agents can also switch it.
- [ ] If the culprit was a stash cycle, read the recovery playbooks in MEMORY:
      `feedback_git_fsck_stash_recovery`, `feedback_parallel_agent_stash_wipe_prevention`.

---

## 7. Prevention

- **One committer per checkout.** Never run two write-capable agents in the same
  working tree. (MEMORY: `feedback_concurrent_agent_commits`,
  `feedback_parallel_agent_stash_wipe_prevention`.)
- **Worktree per agent for non-jest work.** Use
  `.claude/skills/worktree-setup/SKILL.md` → `.worktrees/<branch>/`. (Jest-heavy
  work is the documented exception — haste-map pathology inside worktrees; use
  `git checkout -b` there instead.)
- **Anchor WIP as a branch ref, not a stash.** Stash create/pop cycles under
  parallel agents are the root cause of the wipe pattern; prefer
  `git stash create` (writes objects without touching the working tree) or a
  throwaway WIP commit.
- **Stage each agent's reported files immediately** (`git add`) so a concurrent
  revert is detectable and recoverable from the index.
- **When something on disk surprises you, re-check the branch and `git status`
  before acting** — never operate from remembered state.

---

## 8. Quick reference (TL;DR)

```text
1. git status --porcelain=v1 | Measure-Object -Line     # how bad
2. git cat-file -s HEAD:<file>  &&  git cat-file -s :<file>   # HEAD/index safe?
3. STOP the other agent/process. Confirm count is stable.
4. restore only owner-confirmed zeroed paths             # never blanket restore
5. pnpm env:sync                                         # rebuild .dev.vars
6. typecheck + git status to confirm
```

---

_Last updated: 2026-05-30. Recovery technique grounded in the real 2026-05-22
`i18n-translations` stash-wipe (see MEMORY `feedback_git_fsck_stash_recovery`).
Written after a false-alarm scare on `codex/library-shelf-polish` that turned out
to be wrong file paths + an aborted parallel tool-batch, not an actual wipe —
hence the "real wipe vs false alarm" caveat in §1._
