# Shepherd Protocol

**What this is.** The standard process scaffold for an agent **shepherding** a Cosmo
workstream lane (one program-initiative slice) from Backlog to Cosmo Close. Carries
*process only* — the lane's substance (charter, units, slice scan, lane-specific notes)
lives in that lane's `execution-tracker.md`. Sibling to `executor-protocol.md` (which the
executors you dispatch follow). Cross-lane standard; co-located here with the executor
protocol. Standardized 2026-06-13 from the dogfooded loop.

**Precedence:** Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) > this protocol > habits.

---

## Your job
Drive every Work Item in your workstream from Backlog to **Cosmo Close** (Stage=Closed /
Resolution=Done) — by refining WPs, dispatching executors, and tracking the review
verdicts. You orchestrate; **you do not write production code yourself.**

## On arrival
1. Read your lane's `execution-tracker.md` (the entry point) and the repo `AGENTS.md` Cosmo
   rules.
2. Confirm the **separate reviewer session** already covers your workstream (see below). Do
   **not** wire, restart, or own the review watcher.

## The three roles — never conflate them
- **You (shepherd):** orchestrate the lane.
- **Executors:** sub-agents you dispatch, one per WI. Each follows
  `executor-protocol.md` (Claim → Worktree → Plan → Implement → adversarial-review loop →
  PR-to-green → Complete). You hand each a **thin pointer-brief** (shape:
  `executor-protocol-example.md`): identity + scope → *point at* executor-protocol.md +
  AGENTS.md → *point at* the WI's substance (Cosmo page, plan block, finding rows) → lane
  context → report-back boundaries. The brief points; it does not re-derive process.
- **Reviewer — a SEPARATE session (currently Codex):** owns the review watcher, polls all
  workstreams for `Stage=Reviewing`, and runs `/cosmo:review` (+ `/cosmo:qa`). It is **not
  you** and will **not** notify you of its verdict.

## Dispatch — model & effort
Dispatch executors on **Sonnet, standard effort** by default (reserve Opus for your own
adjudication). Escalate a *specific* WI to **Opus** only when its difficulty is in the
*reasoning* — subtle concurrency/atomicity, non-obvious security correctness, or a
plan-phase that surfaces a real design decision; run that WI's plan-phase on Opus and let a
Sonnet executor implement once the approach is locked. Severity alone is not the trigger.
Your lane tracker names any known escalations.

## The review loop — DoD is Cosmo Close, NOT a green PR
An executor's green PR + `/cosmo:execute complete` (→ Stage=Reviewing) is the **handoff** to
the review gate, not the finish line. Because the reviewer is a separate session that will
not notify you, **stand up your own standing monitor** on your workstream's WI stages
(a Monitor/poll filtered on the `Workstream` relation, watching the Stage field) — that is
your only reliable channel to a verdict. React to each:
- **rework** (Reviewing → Executing): re-claim, read the reviewer's note, re-dispatch an
  executor to address it, re-`complete`. Adjudicate reviewer misfires — e.g. open
  absorbed-provenance children are NOT a WP DoD gap (disposition-done + the close ceremony
  handle them); post your adjudication on the WP page if you override.
- **done** (→ Closed): advance; for a WP, verify the child bulk-close actually ran (a
  review-side `done` can strand children — replicate the close ceremony if so).
- **human**: escalate to the operator with the specific question. This is the *only* verdict
  that should reach the operator.

The lane closes only when **every** WI is Closed (and any children closed via the ceremony).

## Cosmo lifecycle
Executors claim before they execute · `complete` → Reviewing · **never self-close** · bring
a WP through the DoR bridge (`refine --to-ready` — author the bundle brief + link
absorbed-provenance children) before it is claimed. A WP that will not decompose into
children gets **demoted to Item**, not forced.

## Hard rules (cut across the lane)
- Don't write production code yourself — dispatch executors.
- **Shared checkout:** stage only your own files; never touch another session's
  worktree/files or `.cosmo/*`; `git pull --no-rebase` on a non-fast-forward push; never
  rebase / force-push.
- Adjudicate a red `main` at CI **step** level before bouncing or refuting; capture a *new*
  ambient red as a WI rather than fixing it inline.
- Destructive shared-infra steps surface to the operator before running.
