# Identity Foundation — Executor Protocol

**What this is.** The standard process scaffold for any agent executing an
Identity-Foundation Work Item (WI-569…586). The shepherd's brief points here;
this file carries *process only* — the WI's substance lives in Cosmo, the
execution tracker, and the master plan. Derived from the operator's
`wi-execute` template (nexus `_WIP/wi-execute.md`), adjusted 2026-06-10.

**Precedence:** Cosmo lifecycle rules (AGENTS.md + `/cosmo:execute`) >
this protocol > general habits.

---

## Phases

**Phase 0 — Claim.** Read and follow `/cosmo:execute`. Claim the WI *before any
implementation*: `execute.ts fetch <wi-ref> <artifacts-dir> --supervised`, then
`claim --claimant <your-id>`. Never start unclaimed.

**Phase 1 — Worktree.** Create `.worktrees/WI-NN` (branch `WI-NN` from
`origin/main`) via the **worktree-setup skill** — not EnterWorktree, not manual
`git worktree add`. The skill runs `pnpm install` + `pnpm env:sync`. All work
happens in this worktree; `/commit` is permitted there (and only there).

**Phase 2 — Plan.** Write an implementation plan to a file in your worktree
(`_plan-WI-NN.md`, untracked or deleted before PR) *before touching code*.
Plan style is **parameterized by work type** (repo Planning Discipline rule):

- **Greenfield logic** → TDD decomposition: tests first, red → green → refactor.
- **Migration / refactor / audit / ops** → design-doc + acceptance-criteria
  checklist, with a concrete verification step per item. No TDD theater.
- Migrations that drop anything need the `## Rollback` section per repo
  schema-safety rules.

**Phase 3 — Implement.** Execute the plan. Commit with `/commit` (from your
worktree). Durable checkpoint at least every ~4 minutes of long-running work.

**Phase 4 — Adversarial review loop (pre-PR, capped).** Spawn a review
subagent to adversarially review your diff. Fix valid findings, re-run.
**Max 3 iterations** — if findings persist after 3 rounds, stop and escalate
the residuals to the shepherd instead of spinning.

**Phase 5 — PR & CI.** Open the PR (one PR per WP) with `gh pr create`.
Monitor `gh pr checks` and automated code reviews until they settle, per the
repo PR Review & CI Protocol. Triage findings:

- `blocker` / `must fix` / `should fix` → verify validity; fix all you deem
  valid. Where you reject a finding as invalid, record the rationale in the
  PR thread so the review gate doesn't lose it.
- `consider` → fold into a fix commit only if you're already committing
  higher-severity fixes; never open a commit solely for considers.
- Batch fix rounds: validate locally, push once per round.

**Phase 6 — Definition of done: a "green PR".**
1. CI passes, AND
2. no valid `blocker` / `must fix` / `should fix` findings remain.

Do not claim completion until both hold. **"Green" is the strict shared definition** in
`shepherd-protocol.md` → *Merging the WP*: every required check `SUCCESS`, `claude-review`
actually green (a red/absent review is not approval), no valid blocker/must-fix/should-fix
finding, `mergeStateStatus` `CLEAN`. Never call a PR with any red check "green".

**Phase 7 — Complete.** Only after the PR is green: run `/cosmo:execute
complete` (authors Fixed In + completion summary, → Stage=Reviewing, releases
the claim). **Never self-close** — review/close is the operator's gate
(`/cosmo:review`).

---

## Hard rules (cut across all phases)

- **Destructive shared-infra steps** (resetting shared dev/staging databases,
  irreversible chain edits, deleting remote resources): STOP before executing.
  Report the exact planned commands to the shepherd and end your turn; you
  will be resumed with a go/no-go. Never run them unannounced.
- **Report-back boundaries:** (a) pre-destructive-step (above), (b) green PR +
  `complete` fired, (c) blocked, or review-loop residuals after 3 rounds.
  Everything else stays inside your run.
- Secrets via Doppler only; never `wrangler secret put` or ad-hoc env edits.
- No `eslint-disable` / suppression to get green; fix the root cause.
