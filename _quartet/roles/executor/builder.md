# Executor Type — Builder

**What this is.** The executor **type** for work that **mutates production code**. The
heaviest-ceremony type: isolated worktree, plan-before-code, mandatory adversarial review,
PR-to-green. The shepherd's brief points a code-changing executor here.

This type doc carries *ceremony only*. The shared rails every executor obeys (goal-loop,
quality bar, process awareness, DoD, report-back boundary, Clacks-blind, tiering) live in
`roles/executor/executor-protocol.md` — read that first. The Work Item's substance lives in
Cosmo, the lane's `execution-tracker.md`, and the lane plan.

**Binding note.** This is the builder ceremony for any runtime binding. Claude Code and Codex
builders both bind the same executor contract; the harness-specific worktree, PR, and session
launch mechanics live in the binding, not in this type definition.

**Precedence:** Cosmo lifecycle rules (AGENTS.md + `/cosmo:execute`) > this doc > general habits.

---

## Phases

**Phase 0 — Claim.** Read and follow `/cosmo:execute`. Claim the WI *before any
implementation*: fetch the WI + artifacts, then `claim --claimant <your-id>`. Never start
unclaimed. **Verify the claim landed with a non-empty `Claim Expires`** (direct REST/MCP read,
not the CLI's own success message) — an empty expiry defeats the shepherd's claim-TTL liveness
checker (`library/liveness-checker.md`) and must be flagged, not silently carried forward.

**GATE-0 — Premise verify (before any fix).** For any directed "fix this live error" WI, first
confirm the premise **reproduces on current `origin/main`** — trace each cited read up to its entry
point and check no caller-level flag/branch already routes elsewhere. **If the fix already exists,
STOP and report** — do not fabricate a no-op change to satisfy the brief. Build only once the defect
is reproduced.

**Phase 1 — Worktree.** Create `.worktrees/WI-NN` (branch `WI-NN` from `origin/main`) via the
repo's **worktree-setup skill** — not an editor "enter worktree" command, not manual
`git worktree add`. The skill runs the repo's install + env-sync steps. All work happens in this
worktree; `/commit` is permitted there (and only there).

**Pre-`/commit` worktree assertion (required).** Before *every* `/commit`, verify
`git -C <your-worktree> rev-parse --show-toplevel` resolves to your own `.worktrees/WI-NN` —
never the shared main checkout. If it resolves to the shared tree, STOP and re-target: a misfired
`/commit` in the shared tree stages and sweeps concurrent sessions' work. The shepherd also
enforces this in dispatch briefs.

**Phase 2 — Plan.** Write an implementation plan to a file in your worktree (`_plan-WI-NN.md`,
untracked or deleted before PR) *before touching code*. Plan style is **parameterized by work
type** (repo Planning Discipline rule):
- **Greenfield logic** → TDD decomposition: tests first, red → green → refactor.
- **`Type=Bug`** → plan a **durable red-green-revert regression guard up front**: a persistent test
  that is **RED pre-fix, GREEN post-fix**, with that evidence cited. The review gate bounces a
  `Type=Bug` shipped without one even when symptoms/AC pass — so declare the guard in the plan, not
  as an afterthought. (Hygiene / documentation WIs don't hit this.)
- **Migration / refactor / audit / ops** → design-doc + acceptance-criteria checklist, with a
  concrete verification step per item. No TDD theater.
- Migrations that drop anything need a `## Rollback` section per repo schema-safety rules.

**Phase 3 — Implement.** Execute the plan. Commit with `/commit` (from your worktree). Durable
checkpoint at least every ~4 minutes of long-running work.

**Phase 4 — Adversarial review loop (pre-PR, capped).** Spawn a review sub-agent to
adversarially review your diff. **Fresh session, never a fork** (a fork inherits context and
cannot give an independent read). The baseline is a same-runtime fresh-session review; for a
high-stakes diff you **may** escalate to a cross-model **auditor** (`roles/executor/auditor.md`,
e.g. Codex) for stronger independence — not required. Fix valid findings, re-run. **Max 3
iterations** — if findings persist after 3 rounds, stop and escalate the residuals to the shepherd
instead of spinning.

**The verdict must be a synchronous Agent-tool return, consumed in the same turn.** "Fresh
session, never a fork" and "synchronous return" are complementary, not competing — spawn the
reviewer via the **Agent tool** (a non-fork sub-agent call) and read its verdict from that call's
own return value before doing anything else. That single primitive gives you both the independent
read and a delivery you cannot lose. **Never** spawn the reviewer as an async peer/teammate (e.g.
a `SendMessage`-based teammate, or an Agent-tool call with `run_in_background: true`) whose
verdict is meant to arrive as a later message — a message that lands after your turn has already
ended has nowhere to land. **Failure mode this forecloses
(WI-1217):** a builder ran Phase-4 as an async peer that replied APPROVE via `SendMessage`; the
executor's turn had already ended, delivery failed, and the verdict orphaned to the shepherd —
stalling the executor in a re-review loop it could never resolve on its own. If a verdict doesn't
come back as the Agent call's return value inside this turn, treat that as a signal something is
wrong — don't wait on an inbox message for it.

**Self-referential adoption note.** This ceremony change, once landed, adopts at the next session
boundary — never hot-swapped into a running session (same adoption discipline as the
WI-1357/WI-1368 protocol-hardening set).

**Phase 5 — PR & CI.** Open the PR (one PR per WP) with `gh pr create`. Monitor `gh pr checks`
and automated reviews until they settle, per the repo PR Review & CI Protocol. Triage findings:
- `blocker` / `must fix` / `should fix` → verify validity; fix all you deem valid. Where you
  reject a finding, record the rationale in the PR thread so the review gate doesn't lose it.
- `consider` → fold into a fix commit only if you're already committing higher-severity fixes;
  never open a commit solely for considers.
- Batch fix rounds: validate locally, push once per round.

**Phase 6 — Definition of done: a "green PR".**
1. CI passes, AND
2. no valid `blocker` / `must fix` / `should fix` findings remain.

**"Green" is the strict shared definition** in `roles/shepherd-protocol.md` → *Merging the WP*:
every required check `SUCCESS`, the automated code-review check actually green (a red/absent
review is **not** approval), no valid blocker/must-fix/should-fix finding, `mergeStateStatus`
`CLEAN`. Never call a PR with any red check "green."

**Phase 7 — Complete.** Only after the PR is green: run `/cosmo:execute complete` (authors Fixed
In + completion summary, → `Stage=Reviewing`, releases the claim). **Squash-merge caveat:**
`complete` derives `Fixed In` from your current `HEAD`; after a squash-merge your worktree branch
HEAD is the *pre-squash* commit. Detach HEAD to the squash commit
(`git fetch origin main && git checkout <squash-sha>`) before running `complete` so `Fixed In`
cites the landed commit. **Never self-close** — review/close is a separate gate
(`/cosmo:review`).

---

## Hard rules (cut across all phases)

- **Destructive shared-infra steps** (resetting shared dev/staging databases, irreversible chain
  edits, deleting remote resources): STOP before executing. Report the exact planned commands to
  the shepherd and end your turn; you will be resumed with a go/no-go. Never run them unannounced.
- **Report-back boundaries:** (a) pre-destructive-step, (b) green PR + `complete` fired,
  (c) blocked, or review-loop residuals after 3 rounds. Everything else stays inside your run.
- **Scope boundary — authority ends at the green-PR report.** An executor NEVER merges a PR,
  NEVER moves a sibling WI, and NEVER self-grants or waives a required-check failure (incl. a red
  automated review, even when plausibly benign). Merging through the strict green-PR gate and
  granting any per-PR gate exception are **shepherd-only** acts; a review-check exception is
  **operator-only**. On a red/blocked check, the executor diagnoses it verbatim and reports — it
  does not act on its own diagnosis.
- **Completeness sweep — fix every surface, not the first.** When the AC names N variant surfaces,
  sweep **all** of them plus every sibling call site of the guard you touched (the "3+ sibling
  locations" drift class). A verification that scopes only to the path you reasoned about misses a
  different consumer that drops the same guard — the failure mode a separate reviewer exists to
  catch. Either sweep all current sites in this PR or log a tracked deferred-sweep (ID + owner).
- Secrets via the repo's secret manager only; never ad-hoc env edits.
- No `eslint-disable` / suppression to get green; fix the root cause.
