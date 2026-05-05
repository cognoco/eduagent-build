# Archon Cleanup Workflow — Spike Execution Plan

> **For**: A fresh Claude Code session executing the work described below.
> **Last updated**: 2026-05-05
> **Status**: Ready to execute

---

## TL;DR

The `execute-cleanup-pr` workflow currently creates the GitHub PR **before** running its three parallel reviews, which (a) causes CI to run twice (once on initial push, once after auto-fix), and (b) makes the GitHub PR view a moving target during review. Reorder the DAG so reviews and auto-fixes run on the **local worktree branch**, then push and create the PR once. This requires five new project-local command overrides that replace the global review/fix commands and use `git diff origin/main...HEAD` instead of `gh pr diff`.

---

## DISCIPLINE CONTRACT — READ THIS FIRST

The cleanup PRs being run during this spike are **throwaway test vehicles**. Do not optimize for their git history quality. Their job is to validate that the workflow itself works.

After the spike closes:

- The **workflow keeps running** as standard process. Every `cleanup-plan.md` PR going forward executes through `archon workflow run execute-cleanup-pr`.
- Some of the **first production runs** will be re-executions of the spike test PRs (because their git history is unusable). Others will be fresh PRs that haven't been touched.
- Ongoing cleanup work then continues through Archon as normal.

**What this means for execution:**

- Don't waste cycles making test PR diffs pretty.
- Don't add ship-quality polish to the test PR commits.
- DO flag any spike-tolerated shortcuts (hardcoded paths, missing error handling, fragile assumptions) as `TECH DEBT — pre-spike-close` in this plan's "Tech Debt" section. Resolve before declaring spike-closed.
- DO ensure the workflow itself is production-quality, because it will keep running.

**Spike exit condition** = "workflow runs end-to-end reliably enough that we trust its output → start running cleanup PRs through it as standard process." Not a single ceremonial run. A handoff.

---

## Current Repository State

- **Branch**: `consistency`
- **Base**: `origin/main` at `e2b06061`
- **Working tree**: clean
- **Latest commit**: `e9069a87 chore(archon): add Archon workflows, commands, and skill scaffolding`
- **Why we're on `consistency`**: This is the spike branch where `.archon/` files live. The cleanup PRs the workflow processes target `main`, but the workflow definition itself (and any iterative changes to it) live on `consistency` until the spike closes and we merge it.
- **Path-of-least-resistance**: Source the worktree from `consistency` (uses the latest workflow definition). Target the PR at `main` (where cleanup work belongs). The dual-base asymmetry is an accepted spike-phase shortcut, NOT something to engineer around.

---

## Context: Why We're Doing This

The cleanup plan in `docs/audit/cleanup-plan.md` defines ~16 cleanup PRs. The Archon spike is about automating their execution: read a PR's work order from the cleanup plan, implement each phase in fresh contexts, validate, get reviewed, auto-fix, ship.

The current workflow at `.archon/workflows/execute-cleanup-pr.yaml` has the right *steps* but they're in a suboptimal order:

```
implement → validate → push → create-pr → reviews (parallel) → synthesize → implement-fixes (pushes again) → summary
```

Two pushes = CI runs twice. Reviews see the PR before fixes are applied, so the PR's first state is "reviewed but unfixed." Cleaner ordering:

```
implement → validate → reviews (local diff, parallel) → synthesize → implement-fixes (local commits) → push (single push) → create-pr → post-review-comments → summary
```

One push, one CI run, one consistent PR state from the moment it appears.

---

## What Changes (Concrete)

### 1. Workflow file — `.archon/workflows/execute-cleanup-pr.yaml`

Reorder nodes. Net change:

| Old position | Node | New position | Notes |
|---|---|---|---|
| 1 | init-tracing | 1 | unchanged |
| 2 | extract | 2 | unchanged |
| 3 | install | 3 | unchanged |
| 4 | implement (loop) | 4 | unchanged |
| 5 | validate | 5 | unchanged |
| 6 | **push** | **moved → 11** | now after fixes |
| 7 | **create-pr** | **moved → 12** | now after push |
| 8 | review-scope | 6 | new dependency: `validate` (was `create-pr`); use new project-local command |
| 9 | code-review | 7 | use new project-local command |
| 10 | test-coverage | 8 | use new project-local command |
| 11 | adversarial-review | 9 | already supports local diff — verify dependency points at new review-scope |
| 12 | synthesize | 10 | use new project-local command (artifact-only, no GitHub post) |
| 13 | implement-fixes | (deleted from this position) | logic absorbed into a new node before push |
| — | **fix-locally** (NEW) | **between 10 and 11** | applies fixes to worktree branch, commits locally, no push |
| — | **post-review-comments** (NEW) | **after 12** | posts consolidated-review.md and fix-report.md as PR comments |
| 14 | summary | last | unchanged |

### 2. New project-local commands at `.archon/commands/`

Five new files. Each is a copy of the global default, edited to remove `gh pr ...` calls in favor of local git operations. Naming convention follows the existing project-local override pattern (`cleanup-adversarial-review.md`):

| Filename | Replaces global | Key delta |
|---|---|---|
| `cleanup-pr-review-scope.md` | `archon-pr-review-scope` | Replace `gh pr view`/`gh pr checks`/`gh pr diff` with `git diff origin/main...HEAD`, `git log origin/main..HEAD --oneline`. Skip CI status / merge conflict / behind-base sections (not applicable pre-PR). |
| `cleanup-code-review-agent.md` | `archon-code-review-agent` | Replace `gh pr diff {number}` with `git diff origin/main...HEAD`. |
| `cleanup-test-coverage-agent.md` | `archon-test-coverage-agent` | Replace `gh pr diff {number}` with `git diff origin/main...HEAD`. |
| `cleanup-synthesize-review.md` | `archon-synthesize-review` | Drop Phase 4 (`gh pr comment`). End at artifact creation. |
| `cleanup-fix-locally.md` | `archon-implement-review-fixes` | Drop Phase 1.1/1.2 (PR branch checkout — already on worktree branch). Drop Phase 4.3 (`git push`). Stop after commit. |
| `cleanup-post-review-comments.md` | (new — no global equivalent) | Reads `consolidated-review.md` and `fix-report.md` from `$ARTIFACTS_DIR/review/`, posts both as `gh pr comment` to the PR created in `cleanup-create-pr`. |

### 3. Existing files to verify (read-only)

These exist already and should be confirmed compatible without changes:

- `.archon/commands/cleanup-adversarial-review.md` — already has `gh pr diff $(cat $ARTIFACTS_DIR/.pr-number) 2>/dev/null || git diff origin/main...HEAD` fallback. Should work as-is when no PR exists yet (the `||` branch fires).
- `.archon/commands/cleanup-push.md` — currently runs after validate. Will run later in DAG but the command itself shouldn't need changes (it pushes whatever branch the worktree is on).
- `.archon/commands/cleanup-create-pr.md` — currently runs after push. Will run later in DAG, no command-level changes needed.

---

## Execution Steps (In Order)

### Step 0: Confirm prerequisites

```powershell
git branch --show-current   # expect: consistency
git status --short          # expect: clean
git log --oneline -1        # expect: e9069a87 (or descendant)
ls .archon/commands/        # confirms list above
```

If branch isn't `consistency` or working tree isn't clean, STOP and ask the user.

### Step 1: Read the four global default commands you're about to replace

These are at `C:\.tools\Archon\.archon\commands\defaults\`. The fresh session needs them as templates for the project-local copies:

```
C:\.tools\Archon\.archon\commands\defaults\archon-pr-review-scope.md
C:\.tools\Archon\.archon\commands\defaults\archon-code-review-agent.md
C:\.tools\Archon\.archon\commands\defaults\archon-test-coverage-agent.md
C:\.tools\Archon\.archon\commands\defaults\archon-synthesize-review.md
C:\.tools\Archon\.archon\commands\defaults\archon-implement-review-fixes.md
```

Read each one before writing its project-local override. The override should be a near-copy with only the surgical edits described in the table above — preserve the structure, phase numbers, output artifact paths, and prompt patterns the rest of the workflow depends on.

### Step 2: Create the six new project-local command files

In `.archon/commands/`, create:

1. `cleanup-pr-review-scope.md`
2. `cleanup-code-review-agent.md`
3. `cleanup-test-coverage-agent.md`
4. `cleanup-synthesize-review.md`
5. `cleanup-fix-locally.md`
6. `cleanup-post-review-comments.md`

**For each existing-default override (#1–#5):**

- Copy the global default frontmatter and structure verbatim.
- Apply only the surgical edits in the "Key delta" column.
- Preserve all `$ARTIFACTS_DIR/...` paths exactly — downstream nodes depend on them.
- Preserve PHASE_X_CHECKPOINT lists for parity with the original.
- Add a header note: `# {Name}\n\n*Project-local override of {global-name}. Operates on the local worktree branch before the PR is created. See `.archon/spike-plan.md` for context.*`

**For the new `cleanup-post-review-comments.md` (#6):**

- Frontmatter: `description: Post consolidated review and fix report as PR comments after PR creation`
- Phase 1: Read `$ARTIFACTS_DIR/.pr-number`, `$ARTIFACTS_DIR/review/consolidated-review.md`, `$ARTIFACTS_DIR/review/fix-report.md`.
- Phase 2: Run `gh pr comment <PR> --body-file $ARTIFACTS_DIR/review/consolidated-review.md` (then again for fix-report).
- Output: success confirmation only.

### Step 3: Edit `.archon/workflows/execute-cleanup-pr.yaml`

Apply the reorder per the table above. Specifically:

1. Remove `push` and `create-pr` from positions 6 and 7.
2. Change `review-scope.depends_on` from `[create-pr]` to `[validate]`. Change its `command` from `archon-pr-review-scope` to `cleanup-pr-review-scope`.
3. Change `code-review.command` from `archon-code-review-agent` to `cleanup-code-review-agent`. (Keep `depends_on: [review-scope]`.)
4. Change `test-coverage.command` from `archon-test-coverage-agent` to `cleanup-test-coverage-agent`.
5. Change `adversarial-review.depends_on` to keep `[review-scope, init-tracing]`. Command unchanged.
6. Change `synthesize.command` from `archon-synthesize-review` to `cleanup-synthesize-review`.
7. Replace `implement-fixes` (`command: archon-implement-review-fixes`) with `fix-locally` (`command: cleanup-fix-locally`). Same `depends_on: [synthesize]`.
8. Add `push` node back with `depends_on: [fix-locally]`. (Same `command: cleanup-push`.)
9. Add `create-pr` node back with `depends_on: [push]`. (Same `command: cleanup-create-pr`.)
10. Add new `post-review-comments` node with `depends_on: [create-pr]` and `command: cleanup-post-review-comments`.
11. Change `summary.depends_on` from `[implement-fixes]` to `[post-review-comments]`.

The YAML node bodies (other than these dependency/command changes) shouldn't need edits.

### Step 4: Sanity check

```powershell
# Confirm all referenced commands exist
$workflow = Get-Content .archon/workflows/execute-cleanup-pr.yaml -Raw
[regex]::Matches($workflow, 'command:\s*(\S+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
```

For each command name printed, confirm a `.md` file exists at either `.archon/commands/` (project-local) or `C:\.tools\Archon\.archon\commands\defaults\` (global). If any referenced command doesn't exist anywhere, the workflow will fail at runtime.

### Step 5: Commit

Use `/commit` (per project rule — see CLAUDE.md "Git Commits"). Suggested message scope: `chore(archon)` or `refactor(archon)`. The commit should include:

- The 6 new command files in `.archon/commands/`
- The modified `.archon/workflows/execute-cleanup-pr.yaml`
- This plan file (`.archon/spike-plan.md`)

### Step 6: First test run

Pick a cleanup PR from `docs/audit/cleanup-plan.md` to test on. **Suggested**: a small PR (PR-08 or similar — pick whatever's flagged as low-risk in the cleanup plan). The first test run is throwaway; expect breakage.

```powershell
archon workflow run execute-cleanup-pr --branch cleanup-pr-08-spike-test "PR-08"
```

Watch for:

1. Does the worktree get created from `consistency`?
2. Do all phases (init → extract → install → implement → validate) complete?
3. Do the three parallel review nodes run on the local diff (no `gh pr diff` errors)?
4. Does `synthesize` produce `$ARTIFACTS_DIR/review/consolidated-review.md`?
5. Does `fix-locally` apply commits to the worktree branch (not push)?
6. Does `push` succeed once?
7. Does `create-pr` create the PR?
8. Does `post-review-comments` post both comments?
9. Does the GitHub PR show ONE CI run trigger?

---

## Validation: How To Know The Spike Is Working

| Signal | Means |
|---|---|
| Workflow completes without any node failing | Mechanics work |
| GitHub PR appears with reviews + fixes already applied | DAG ordering is correct |
| GitHub Actions tab shows ONE workflow run for the PR | Single-push goal achieved |
| `consolidated-review.md` artifact exists with findings | Reviewers ran on local diff successfully |
| `fix-report.md` artifact exists with applied fixes | fix-locally worked |
| PR has 2 bot comments (consolidated review + fix report) | post-review-comments worked |

If 4+ of these pass on the first run: workflow is viable, iterate on the rest.
If 0–3 pass: there's a structural problem. Re-read the failing node's logs and the global default it was overriding — likely a path or env-var mismatch.

---

## Spike Exit Condition

The spike is closed when:

1. ✅ A full workflow run completes end-to-end with all six validation signals passing.
2. ✅ At least 2 different cleanup PRs have been processed successfully (proves it's not a one-off).
3. ✅ All items in "Tech Debt" below have been resolved or explicitly accepted as known-issues with tracked owners.
4. ✅ The `consistency` branch is merged to `main` (workflow + commands + this plan move with it).

After exit: every `cleanup-plan.md` PR runs through `archon workflow run execute-cleanup-pr` as standard process. PRs from the spike that were used as test vehicles get re-executed on top of clean `main`. New cleanup PRs run through fresh.

---

## Tech Debt — Resolve Before Spike Close

(Add items here as you discover them during execution. The fresh session should treat this section as a live log.)

- [ ] **Dual-base asymmetry**: workflow sources from `consistency`, targets PR at `main`. Fine for spike, but document the merge step that ends this once spike closes.
- [ ] **Global vs project-local override sprawl**: 6 project-local commands now mirror 5 globals. If the globals change upstream, our overrides drift. Either (a) eventually upstream the local-diff support to globals, or (b) document a periodic re-sync check.
- [ ] **`cleanup-post-review-comments` has no global equivalent**: revisit whether this should be upstreamed to Archon's defaults so other workflows benefit.
- [ ] **Adversarial review uses Codex/GPT**: ensure `init-tracing` correctly emits the codex-variant `OTEL_RESOURCE_ATTRIBUTES`. The workflow already references `$init-tracing.output` — verify it resolves.

---

## Files Touched (Inventory)

For the commit grep:

```
.archon/workflows/execute-cleanup-pr.yaml          # modified
.archon/commands/cleanup-pr-review-scope.md        # created
.archon/commands/cleanup-code-review-agent.md      # created
.archon/commands/cleanup-test-coverage-agent.md    # created
.archon/commands/cleanup-synthesize-review.md      # created
.archon/commands/cleanup-fix-locally.md            # created
.archon/commands/cleanup-post-review-comments.md   # created
.archon/spike-plan.md                              # this file (already created at planning time)
```

No application code changes. No test changes. No package.json changes. No CLAUDE.md changes.

---

## If You Get Stuck

- **Workflow fails at extract**: read `.archon/commands/cleanup-extract-pr.md` — it expects `docs/audit/cleanup-plan.md` and a PR identifier matching the format `PR-NN`. Check the cleanup plan structure.
- **Worktree creation fails**: archon expects a clean working tree. Check `git status` in the parent repo.
- **Review nodes fail with `gh: not found` or `not in a git repository`**: the override didn't replace the gh call. Re-grep the project-local override for `gh pr diff` and replace.
- **Adversarial review fails because `OTEL_RESOURCE_ATTRIBUTES` is empty**: the `$init-tracing.output` interpolation may not be working. Check the init-tracing node's output format.
- **Push fails**: check the worktree's remote configuration. The `cleanup-push.md` command should handle this.
- **Reviews report findings against `.archon/` itself**: this is the path-filtering issue that DOESN'T need to be solved during spike. Test PRs are throwaway. Note it in Tech Debt and move on.

---

## What This Plan Deliberately Does NOT Do

These are decisions the user has already made; do not re-litigate:

- Path-filtering `.archon/` from the review diff. (Deferred — test PRs are throwaway.)
- Engineering around dual-base asymmetry. (Deferred — accepted spike shortcut.)
- Trying the existing flow first before refactoring. (Decision: refactor up front.)
- Same-name override of global commands. (Decision: distinct names per project convention.)
- Optimizing test PR git history. (Discipline contract: throwaway.)

---

*End of plan.*
