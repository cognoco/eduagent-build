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

## The review loop — two mandatory gates: green-PR-to-merge, then Cosmo-Close-to-graduate
There are **two** gates, in order, and **both** are mandatory. **Gate 1 — a green PR is the
hard prerequisite to merge** (strict definition under *Merging the WP* below): never waived,
never approximated, and the word "green" is never applied to a PR carrying a red check.
**Gate 2 — Cosmo Close** (after the separate review) is what *graduates the lane*. An
executor's green PR + the merge + `/cosmo:execute complete` (→ Stage=Reviewing) is the
**handoff** to the review gate, not the finish line — it earns the merge and the review, it
does **not** graduate the lane, and an un-green PR is never merged. Because the reviewer is a
separate session that will
not notify you, **stand up your own standing monitor** on your workstream's WI stages
(a Monitor/poll filtered on the `Workstream` relation, watching the Stage field) — that is
your **primary** channel to a verdict — but it is **session/host-scoped: it does not survive a
host reboot or session end, and its silence then reads identically to "no change."**
Periodically spot-check Cosmo directly rather than trust prolonged silence, and re-arm the
monitor after any restart. React to each:
- **rework** (Reviewing → Executing): re-claim, read the reviewer's note, re-dispatch an
  executor to address it, re-`complete`. Adjudicate reviewer misfires — e.g. open
  absorbed-provenance children are NOT a WP DoD gap (disposition-done + the close ceremony
  handle them); post your adjudication on the WP page if you override.
- **done** (→ Closed): advance; for a WP, verify the child bulk-close actually ran (a
  review-side `done` can strand children — replicate the close ceremony if so).
- **human**: escalate to the operator with the specific question. This is the *only* verdict
  that should reach the operator.

The lane closes only when **every** WI is Closed (and any children closed via the ceremony).

## Merging the WP — the green-PR gate (Gate 1)
You (the shepherd) own the merge of each WP's PR to `main`. **Merge a PR only when it is green
by the strict definition below — never on a red check, never on a private redefinition of
"green".**

A PR is **green** only when ALL hold:
1. Every **required** branch-protection check is `SUCCESS` (lint, typecheck, test, build, and
   the named required gates).
2. **`claude-review` actually ran and is green.** A red or absent `claude-review` is *not*
   approval — *silence is never approval*. If it is red, **diagnose the run before merging**:
   it may be a broken review *workflow* (permissions / trigger / YAML regression), not merely
   token exhaustion / timeout / crash. Fix the cause, or obtain an **explicit per-PR operator
   exception** — never self-grant one.
3. No valid `blocker` / `must fix` / `should fix` review finding remains.
4. `mergeStateStatus` is `CLEAN`.

**Forbidden:** applying the word "green" or "merge-ready" to a PR with any red check; merging
on "deterministic gates pass" while a review/advisory check is red and undiagnosed; treating a
red `claude-review` as automatically benign. Report PR state in literal terms — e.g.
"deterministic gates green; `claude-review` red (cause: …); not merging until resolved" — and
never round that up to "green".

## Cosmo lifecycle
Executors claim before they execute · `complete` → Reviewing · **never self-close** · bring
a WP through the DoR bridge (`refine --to-ready` — author the bundle brief + link
absorbed-provenance children) before it is claimed. A WP that will not decompose into
children gets **demoted to Item**, not forced.

## Progress channel — orchestrator ↔ shepherd (the needs-a-brain plane)
Your **lifecycle** (each WI →Reviewing/→Closed) is already visible to the orchestrator via its
Cosmo Stage monitor — **never narrate it here.** This channel carries only what a human or the
program must *act on*. Two append-only files in your lane's `_state/` dir, provisioned by the
orchestrator at activation:
- `_wip/<lane>/_state/outbox.jsonl` — you → orchestrator (**you are the only writer**).
- `_wip/<lane>/_state/inbox.jsonl`  — orchestrator → you (read-only to you).

**Append one outbox line at exactly these four triggers — nothing else:**

| `level` | when |
|---|---|
| `needs-operator` | a **human** decision (scope / product / risk) you can't make within mandate |
| `needs-orchestrator` | a **program-level** question (cross-lane, process) |
| `blocked` | stalled, can't proceed |
| `decision` | a non-obvious choice you made *within* mandate, logged for the record |

Line shape: `{"id","ts","lane","wi","level","ref","msg"}` — `id` = `<lane-slug>-<seq>`
(e.g. `prg10ff-007`); `wi` null for a lane-level event; `ref` = the `id` of a prior event this
one resolves. When a `blocked`/`needs-*` clears, emit a `decision` with `ref` set and
`msg:"resolved: …"` — that closes the loop. There is **no** milestone / FYI / progress level.

**Subscribe to your inbox with a live watcher — symmetric to the orchestrator's outbox watcher.**
Arm a Monitor on `_state/inbox.jsonl` at lane activation so a ruling/answer/directive **wakes you
even while you're holding** for it — a blocked shepherd isn't looping, so checkpoint-polling can't
fire and the watcher is the primary path. **Fallback:** also read the inbox at each checkpoint and
on-block, since a watcher dies on reboot/session-end (review-loop caveat). Lines are
`{"id","ts","from":"orchestrator","type","ref","msg"}`, `type` ∈ ruling / answer / directive /
ack. Inbox commands are **advisory** — apply your judgment, never blind-execute; a `ruling`
carries the operator's decision, relayed.

**The bar is high:** no progress narration, no chatter. If a line wouldn't make the
orchestrator act or the operator want to know, don't write it — when in doubt, don't emit. Full
design + rationale: `_wip/identity-foundation/progress-channel-design.md`.

## Hard rules (cut across the lane)
- Don't write production code yourself — dispatch executors.
- **Shared checkout:** stage only your own files; never touch another session's
  worktree/files or `.cosmo/*`; `git pull --no-rebase` on a non-fast-forward push; never
  rebase / force-push.
- Adjudicate a red `main` at CI **step** level before bouncing or refuting; capture a *new*
  ambient red as a WI rather than fixing it inline.
- Destructive shared-infra steps surface to the operator before running.
