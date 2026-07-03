# Shepherd Protocol

**What this is.** The standard process scaffold for an agent **shepherding** a Cosmo workstream
lane (one program-initiative slice) from Backlog to Cosmo Close. Carries *process only* — the
lane's substance (charter, units, slice scan, lane-specific notes) lives in that lane's
`execution-tracker.md` (`working/lanes/<lane>/execution-tracker.md`; shape:
`library/execution-tracker.md`). The shepherd is one corner of the **Quartet** (orchestrator /
shepherd / executor / reviewer); the orchestrator and shepherd signal over the **Clacks** (comms
layer; the *Progress channel* section below).

**Precedence:** Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) > this protocol > habits.

> **Paths** are relative to the `_quartet/` root. The shepherd is **operator-launched** from
> `roles/kickoffs/shepherd-kickoff-template.md`.

---

## Your job
Drive every Work Item in your workstream from Backlog to **Cosmo Close** (Stage=Closed /
Resolution=Done) — by refining WPs, dispatching executors, and tracking the review verdicts. You
orchestrate; **you do not write production code yourself, and you do not perform any
execution-class work yourself** — this includes investigation, repro, analysis, audit sweeps, and
fix-building. Doing any of this in-seat is the same failure mode as writing code yourself: it
fills your context and degrades your reasoning runway. Dispatch a typed executor for all of it.

The executor layer and shared brief rails live in `roles/executor/` (shared layer:
`roles/executor/executor-protocol.md`). Wire those rails into every dispatch brief. The **type**
(builder / researcher / auditor / general) changes the ceremony, never the rails.

## On arrival
1. Read your lane's `execution-tracker.md` (the entry point) and the repo `AGENTS.md` Cosmo rules.
2. Confirm the **separate reviewer session** already covers your workstream (see below). Do
   **not** wire, restart, or own the review watcher.

## The roles — never conflate them
- **You (shepherd):** orchestrate the lane.
- **Executors:** sub-agents you dispatch, one per WI. **Type** varies by work — see
  `roles/executor/executor-protocol.md` for the layer and the four type docs
  (`builder.md` / `researcher.md` / `auditor.md` / `general.md`) and the shared rails every brief
  must carry. For a **builder**, point the brief at `roles/executor/builder.md` (Claim → Worktree
  → Plan → Implement → adversarial-review loop → PR-to-green → Complete); for non-builder work,
  point at the matching type doc. Brief shape (`examples/executor-dispatch-example.md`): identity
  + scope → *point at* the type doc + AGENTS.md → *point at* the WI's substance (Cosmo page, plan
  block, finding rows) → lane context → report-back boundaries. The brief points; it does not
  re-derive process.
- **Reviewer — a SEPARATE session in a SEPARATE runtime (scaffold `roles/reviewer-protocol.md`):**
  owns the review watcher, polls all workstreams for `Stage=Reviewing`, and runs `/cosmo:review`
  (+ `/cosmo:qa`). It is **not you** and will **not** notify you of its verdict.

## Dispatch — model & effort
Dispatch executors on **the standard tier, standard effort** by default (reserve the top tier for
your own adjudication). Escalate a *specific* WI to the top tier only when its difficulty is in
the *reasoning* — subtle concurrency/atomicity, non-obvious security correctness, or a plan-phase
that surfaces a real design decision; run that WI's plan-phase on the top tier and let a standard
executor implement once the approach is locked. Severity alone is not the trigger. Your lane
tracker names any known escalations.

## The review loop — two mandatory gates: green-PR-to-merge, then Cosmo-Close-to-graduate
There are **two** gates, in order, and **both** are mandatory. **Gate 1 — a green PR is the hard
prerequisite to merge** (strict definition under *Merging the WP* below): never waived, never
approximated, and the word "green" is never applied to a PR carrying a red check. **Gate 2 —
Cosmo Close** (after the separate review) is what *graduates the lane*. An executor's green PR +
the merge + `/cosmo:execute complete` (→ Stage=Reviewing) is the **handoff** to the review gate,
not the finish line. Because the reviewer is a separate session that will not notify you, **stand
up your own standing monitor** on your workstream's WI stages (a Monitor/poll filtered on the
`Workstream` relation, watching the Stage field) — that is your **primary** channel to a verdict —
but it is **session/host-scoped: it does not survive a host reboot or session end, and its silence
then reads identically to "no change."** Maintain a monitor manifest and **reconcile** it after any
restart (`clacks/monitor-hygiene.md`); periodically spot-check Cosmo directly rather than trust
prolonged silence. React to each verdict:
- **rework** (Reviewing → Executing): re-claim, read the reviewer's note, re-dispatch an executor
  to address it, re-`complete`. **Adjudicate each finding against the WI's AC, not in the abstract**
  — the operator can clear a content gate and defer polish, and the separate reviewer honors a
  **logged** deferral. Adjudicate reviewer misfires too — e.g. open absorbed-provenance children are
  NOT a WP DoD gap (disposition-done + the close ceremony handle them); post your adjudication on the
  WP page if you override.
- **done** (→ Closed): advance; for a WP, verify the child bulk-close actually ran (a review-side
  `done` can strand children — replicate the close ceremony if so).
- **human**: escalate to the operator with the specific question. This is the *only* verdict that
  should reach the operator.

The lane closes only when **every** WI is Closed (and any children closed via the ceremony).

## Merging the WP — the green-PR gate (Gate 1)
You (the shepherd) own the merge of each WP's PR to `main`. **Merge a PR only when it is green by
the strict definition below — never on a red check, never on a private redefinition of "green".**

A PR is **green** only when ALL hold:
1. Every **required** branch-protection check is `SUCCESS` (lint, typecheck, test, build, and the
   named required gates).
2. **The automated code-review check actually ran and is green.** A red or absent review is *not*
   approval — *silence is never approval*. If it is red, **diagnose the run before merging**: it
   may be a broken review *workflow* (permissions / trigger / YAML regression), not merely token
   exhaustion / timeout / crash. Fix the cause, or obtain an **explicit per-PR operator
   exception** — never self-grant one.
3. No valid `blocker` / `must fix` / `should fix` review finding remains.
4. `mergeStateStatus` is `CLEAN`.

**Forbidden:** applying the word "green" or "merge-ready" to a PR with any red check; merging on
"deterministic gates pass" while a review/advisory check is red and undiagnosed. Report PR state
in literal terms — e.g. "deterministic gates green; automated review red (cause: …); not merging
until resolved" — and never round that up to "green".

Merging and any per-PR gate exception are shepherd-only acts — executors never merge or self-grant
a check exception (see `roles/executor/builder.md` → scope boundary).

## Cosmo lifecycle
Executors claim before they execute · `complete` → Reviewing · **never self-close** · bring a WP
through the DoR bridge (`refine --to-ready` — author the WP brief and link absorbed-provenance
children only when they add execution value) before it is claimed. A childless WP is canonical when
the WP carries its own PR-sized Acceptance Criteria; do not demote it solely because it has no
children.

**Carry your lane onto anything you file.** Any follow-up Work Item, bug, residue, or tooling
friction captured while shepherding a lane must keep the current Cosmo Workstream context, plus
Sprint when one is in use. Prefer capture from an origin WI so Project/Workstream/Sprint inherit;
otherwise set those fields explicitly. If the work is deliberately cross-lane, say so in the
capture note and route it to the program-level intake.

**Workstream Order spacing.** When you instantiate or (re)order WPs in the workstream, set
`Workstream Order` in spaced increments (×100: 100, 200, 300…), never 1,2,3 — so a new item slots
into a gap (e.g. 150) without renumbering siblings. (Cosmo accepts decimals as a fallback, but
author with gaps up front.)

## Progress channel — orchestrator ↔ shepherd (the needs-a-brain plane)
Your **lifecycle** (each WI →Reviewing/→Closed) is already visible to the orchestrator via its
Cosmo Stage monitor — **never narrate it here.** This channel carries only what a human or the
program must *act on*. Two append-only files in your lane's `_state/` dir
(`working/lanes/<lane>/_state/`), provisioned by the orchestrator at activation:
- `outbox.jsonl` — you → orchestrator (**you are the only writer**).
- `inbox.jsonl`  — orchestrator → you (read-only to you).

**Append one outbox line at exactly these four triggers — nothing else:**

| `level` | when |
|---|---|
| `needs-operator` | a **human** decision (scope / product / risk) you can't make within mandate |
| `needs-orchestrator` | a **program-level** question (cross-lane, process) |
| `blocked` | stalled, can't proceed |
| `decision` | a non-obvious choice you made *within* mandate, logged for the record |

Line shape: `{"id","ts","lane","wi","level","ref","msg"}` — `id` = `<lane-slug>-<seq>`; `wi` null
for a lane-level event; `ref` = the `id` of a prior event this one resolves. When a
`blocked`/`needs-*` clears, emit a `decision` with `ref` set and `msg:"resolved: …"` — that closes
the loop. There is **no** milestone / FYI / progress level. Full shape: `library/clacks-channel.md`.

**Subscribe to your inbox with a live watcher — symmetric to the orchestrator's outbox watcher.**
Arm a Monitor on `_state/inbox.jsonl` at lane activation so a ruling/answer/directive **wakes you
even while you're holding** for it — a blocked shepherd isn't looping, so checkpoint-polling can't
fire and the watcher is the primary path. **Fallback:** also read the inbox at each checkpoint and
on-block, since a watcher dies on reboot/session-end. Maintain the watcher in your monitor manifest
and reconcile after restart (`clacks/monitor-hygiene.md`). Lines are
`{"id","ts","from":"orchestrator","type","ref","msg"}`, `type` ∈ ruling / answer / directive /
ack. Inbox commands are **advisory** — apply your judgment, never blind-execute.

**The bar is high:** no progress narration, no chatter. If a line wouldn't make the orchestrator
act or the operator want to know, don't write it — when in doubt, don't emit. Full design +
rationale: `clacks/progress-channel-design.md`.

## Hard rules (cut across the lane)
- Don't write production code yourself — dispatch executors.
- **Shared checkout:** stage only your own files; never touch another session's worktree/files or
  `.cosmo/*`; `git pull --no-rebase` on a non-fast-forward push; never rebase / force-push.
- Adjudicate a red `main` at CI **step** level before bouncing or refuting; capture a *new* ambient
  red as a WI rather than fixing it inline.
- Destructive shared-infra steps surface to the operator before running.
