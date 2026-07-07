# Shepherd Protocol

**What this is.** The standard process scaffold for an agent **shepherding a lane** — one
shepherd's span of **1..n related Cosmo Workstreams** (`planning-rules.md` §1.5; never assume
1:1) — from Backlog to Cosmo Close. Carries *process only* — the lane's substance (charter, units,
slice scan, lane-specific notes) lives in that lane's `execution-tracker.md`
(`working/lanes/<lane>/execution-tracker.md`; shape: `library/execution-tracker.md`). The shepherd
is one corner of the **Quartet** (orchestrator / shepherd / executor / reviewer); the orchestrator
and shepherd signal over the **Clacks** (comms layer; the *Progress channel* section below).

> **Charter is the accountability spine (RATIFIED 2026-07-07).** Whether something is *your job* —
> the outcomes you answer for (incl. dispatch-trigger ownership and worktree hygiene on close), what
> you may decide without asking, and the exhaustive escalation list — lives in
> **`roles/charters/CHARTER-shepherd.md`**, not here. This protocol is *mechanics only*. Read the
> charter first and banner-ack it at boot; where a line here conflicts with the charter, the
> **charter wins**.

**Precedence:** operator rulings > **charter (`roles/charters/CHARTER-shepherd.md`)** > Cosmo
lifecycle rules (AGENTS.md + the `cosmo` skills) > this protocol > habits.

**Substrate access ladder (WI-1314).** Load the `notion-patterns` skill at boot, the same way you
load the `cosmo` skills — it holds the full MCP / cosmo-CLI / REST decision tree. Three independent
paths reach the work system: the Notion **MCP** server, the **cosmo bun CLIs** (`NOTION_TOKEN` over
REST — they never touch MCP), and the **notion CLI / raw REST**. **MCP loss is a tooling
degradation, never a work stoppage — halting on it is a protocol violation.** Drop down the ladder
and keep working; report degraded mode as a `decision` line, not a `blocked`. At boot, prove the
MCP-independent path with one cheap REST call before dispatching anything.

> **Paths** are relative to the `_quartet/` root. The shepherd is **operator-launched** from
> `roles/kickoffs/shepherd-kickoff-template.md`. Codex-hosted shepherds resolve their
> dispatch/session/monitor mechanics through `roles/runtime-bindings/codex.md`.

---

## Your job
Drive every Work Item in your lane's workstream(s) from Backlog to **Cosmo Close** (Stage=Closed /
Resolution=Done) — by refining WPs, dispatching executors, and tracking the review verdicts. You
orchestrate; **you do not write production code yourself, and you do not perform any
execution-class work yourself** — this includes investigation, repro, analysis, audit sweeps, and
fix-building. Doing any of this in-seat is the same failure mode as writing code yourself: it
fills your context and degrades your reasoning runway. Dispatch a typed executor for all of it.

The executor layer and shared brief rails live in `roles/executor/` (shared layer:
`roles/executor/executor-protocol.md`). Wire those rails into every dispatch brief. The **type**
(builder / researcher / auditor / general) changes the ceremony, never the rails.

**Binding note.** This is the runtime-neutral shepherd protocol. A Claude Code, Codex, or other
harness shepherd binds the same lane-driving contract; runtime specifics belong in launch and
monitor bindings, not in the lane rules.

## Lane accountability — the whole backlog, not just the frontier
Your mandate is your lane's **workstream(s)** — 1..n Cosmo Workstreams (`planning-rules.md` §1.5;
never assume 1:1) — and it ends only when every non-blocked WI across all of them is Closed
(or the lane is formally handed over mid-backlog by the orchestrator). The set you have
*dispatched* is the frontier, never the mandate — do not declare the lane done, drained, or
discharged while open WIs remain. Accountability includes **backlog health**: keep the lane's
Cosmo state as current as possible — Captured items triaged, Ready items genuinely ready, with
dependencies and sequencing (`Workstream Order`) explicit. When you see an unrefined WI with
nothing blocking `/refine`, **flag it to the orchestrator** (a `needs-orchestrator` line) for a
pick-up decision rather than letting it sit — grooming is proactive, not on-demand.

**Adoption timing.** Like the rest of `_quartet/roles/**`, this section binds a shepherd session
at its **next session boundary** — it is never hot-swapped into a session already running.

## Lane scope — 1..n workstreams, grown at runtime (WI-1229)
A lane is not fixed to one Cosmo Workstream at activation (`planning-rules.md` §1.5). Real practice
grows scope organically: you start on one workstream, and the **orchestrator** widens your lane by
sending a Clacks `directive` naming the additional Workstream — never self-adopt a workstream you
were not directed to add; that is an orchestrator-side scope call, not yours to make. Once added,
treat it exactly like your original workstream for every mechanic in this doc — the boot reconcile
query below already reads plural ("Workstreams where `Owner == my-name`", "WIs where Workstream ∈
my-lanes"), and the review loop, merge gate, Cosmo lifecycle, and Progress channel all apply
per-lane, not per-workstream (still one `inbox.jsonl`/`outbox.jsonl` pair for the whole lane). The
**lease substrate needs no new mechanism** for this: per-Workstream keying (`clacks/lease.ts`
agenda B3) plus your one `Owner` name reused across each additional Workstream row (agenda A3's
`Lease *` properties) already grants you the lease on each.

**Adoption timing.** Like the rest of `_quartet/roles/**`, this section binds a shepherd session at
its next session boundary — it is never hot-swapped into a session already running.

## Pause/resume tiers — soft vs hard (WI-1564)
Quartet protocols distinguish two pause tiers — conflating them is the failure mode that stranded a
paused lane deaf to its own resume directive (operator incident, 2026-07-04): a wind-down directive
had the shepherd retire *all* monitors, severing the only wake path.

**Soft pause (default)** — rate-limit holds, session limits, any hold where the session stays
alive. Retire your **work** monitors (the Cosmo-Stage verdict watcher below, PR watchers,
claim-heartbeat crons) but keep **exactly one** persistent watcher armed: your inbox watcher
(`_state/inbox.jsonl` — Boot sequence step 1 / Progress channel below). That watcher is your wake
trigger — a resume `directive` on it wakes you, you reconcile (same shape as *Post-compaction*
below), and you re-arm the retired watchers. Zero manual operator intervention required.

**Hard pause / shutdown (explicit only)** — everything retires, including the inbox watcher, and
the session ends. This tier is legal **only** when the pausing directive names it as shutdown, not
inferred from the length of a hold — do not self-select hard pause for an ordinary rate-limit or
session-limit hold; that is soft pause's job, and retiring the inbox watcher on an ordinary hold is
exactly the 2026-07-04 incident. A hard-paused lane requires **manual operator revival**; when you
go hard, say so in your last outbox line (`level: decision`) so the orchestrator can flag it (see
`orchestrator-protocol.md`'s matching Pause/resume tiers section).

**Adoption timing.** Like the rest of `_quartet/roles/**`, this section binds a shepherd session at
its next session boundary — it is never hot-swapped into a session already running.

## Boot sequence — arm + signal before you reconcile
A freshly-spawned shepherd's first moves are **ordered**, not freehand — the canonical invariant is
**observe before act**. Do not open with a long, silent reconcile: arm your watchers and announce
yourself first, so the orchestrator has liveness and a ruling can reach you before you've committed
to anything.

1. **Raise Clacks + arm your inbox watcher** — a persistent Monitor on your lane's
   `_state/inbox.jsonl` (`clacks/monitor-hygiene.md`), armed before any long hold. (The
   Cosmo-Stage verdict monitor arms at dispatch, per the review loop below — there's nothing to
   watch for it yet at boot.)
2. **Emit sign-of-life** — your first outbox line (see *Sign-of-life* below).
3. **Bounded-wait** for the orchestrator's identity/instructions response.
4. **Resolve your identity**, in this order: (1) the orchestrator's sign-of-life response — its
   freshest cross-lane view — → (2) the kickoff prompt → (3) self-derive from Cosmo
   (`Workstream.Owner == my-name`, reclaiming an expired lease per WI-1156's acquire state
   machine). **A shepherd is never nameless** — Cosmo reconciles a lane set for a known name, it
   never invents one. Durable owner names stay an operator-curated namespace: if the orchestrator
   relay supplies no name, escalate to the operator rather than self-mint (self-minting is reserved
   for ad-hoc claim actors, not a shepherd boot).
5. **Reconcile** — read your lane's `execution-tracker.md` and the repo `AGENTS.md` Cosmo rules,
   then run the boot reconcile query (WI-1156's B5 shape): Q1 = Workstreams where
   `Owner == my-name`; Q2 = WIs where Workstream ∈ my-lanes AND the in-flight state-predicate.
   Confirm the **separate reviewer session** already covers your workstream (see below) — do
   **not** wire, restart, or own the review watcher.
6. **Begin lane execution.**

**Reconciliation evidence hierarchy.** When the orchestrator, Cosmo, and the tracker disagree,
resolve by evidence, not by recency of read: **Git is the ground-truth anchor** — an objective
artifact, it cannot be stale; **Cosmo is the durable record** — it may lag Git; the
**orchestrator carries fresh forward intent**; your **execution tracker is cache-only, never
authoritative**. Reconcile by evidence and write the conclusion back to Cosmo — this reuses the
existing `/cosmo:qa` + `/cosmo:review` Cosmo↔Git verification, it is not a new adjudicator. A
non-code / Notion-only WI has no Git artifact to check against — reconcile it via its Acceptance
Criteria + completion summary instead.

**Sign-of-life.** Event-driven only — boot, post-compaction, resume — riding the Clacks envelope
(WI-1230) as a sanctioned outbox event that overrides the *no-chatter* bar (Progress channel,
below) for exactly these three occasions. It is not a fifth level alongside the four in *Progress
channel* — never use it to narrate anything else. Continuous liveness is **not** duplicated here —
that already rides the `Owner`/`Owner-Expires` heartbeat (WI-1156); there is no separate
sign-of-life table to maintain.

**Post-compaction.** Verify your monitors are still live — session + monitors **survive compaction**
(WI-1156's B4 note) — **do not blind-re-arm them**; reconcile against the manifest instead
(`clacks/monitor-hygiene.md`'s reconcile ritual) — then emit one sign-of-life event. Compaction is a
reconcile-and-signal moment, not a re-provisioning one.

**The resume anchor — one artifact, one name (WI-1603, fleet retro 2026-07-05).** Every shepherd
maintains `working/lanes/<lane>/_state/SESSION-HANDOFF.md` — **untracked** (never committed; the
`_state` untrack rule covers it) — holding what a cold resume needs: current WI + exact position,
armed monitors, open escalations, next action. Create it at spawn, update at every checkpoint-worthy
transition. This is the standardization of the four convergent dogfood patterns (SESSION-HANDOFF /
POST-COMPACTION ANCHOR / RESUME SNAPSHOT / resume.md) — every lane that had one survived
compaction, reboot, and freeze; use this name, not a new coinage.

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

## Dispatch — model & effort (WI-1627)
**Delegate down; never do delegable work in-seat.** Mechanical/search/read/format/summarize work
is dispatched to a **haiku** executor; implementation/codegen/test-writing/standard-review work is
dispatched to a **sonnet** executor. The shepherd seat itself is reserved for adjudication,
sequencing, and safety-critical judgment **only** — if you catch yourself about to search, read,
format, summarize, implement, or write tests in-seat, that is delegable work and it goes to a
dispatched executor instead, full stop.

**Every executor dispatch carries an explicit `--model` and `--effort` — never inherited from the
session default.** Tier by the shape of the work, not by habit:

| Tier | Effort | Work |
|---|---|---|
| `haiku` | low | search, read, format, mechanical edits, summarize |
| `sonnet` | standard | implementation, codegen, tests, standard review |
| `opus` | high | plan-phase design decisions or safety-critical correctness reasoning — only |

**Opus-justify rule.** An `opus`/high-effort dispatch requires a one-line justification recorded in
the dispatch record. The trigger is difficulty *in the reasoning* — subtle concurrency/atomicity,
non-obvious security correctness, or a plan-phase that surfaces a real design decision — **not**
severity: a P0 bug fix that's mechanical still goes to `sonnet`; a low-severity item demanding
genuine architectural judgment can justify `opus`. Run that WI's plan-phase on `opus` and let a
`sonnet` executor implement once the approach is locked. Your lane tracker names any known
escalations.

**Runtime-model verification is not a dispatch-time duty.** Confirming an executor actually ran on
its tagged model is **fleet token telemetry** — an orchestrator-owned check (per-model
output-token aggregation across session transcripts), not a per-dispatch duty of the seat doing the
dispatching. Your own explicit `--model` override, made at dispatch time, is your seat's own
reliable compliance signal from your own seat; you do not need to independently re-verify it.

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

**Watcher runtime instances (WI-1417).** Your own verdict monitor is launched from tracked
templates/tooling, but its live config, logs, review outputs, and de-dupe state live under
`.cosmo-watch/` or the lane/program's declared gitignored runtime dir. Never patch
`_quartet/clacks/*` in place to make a live watcher variant.

## Executor liveness — claim-TTL checker (L2, WI-1313)
A background executor dies silently if your session crashes/reboots mid-dispatch — its WI sits
`Stage=Executing` looking healthy while no one is working it. Don't infer liveness from Stage
alone: corroborate `Claimed By` / `Claim Expires` with `Fixed In` + worktree/process evidence
before declaring an executor dead or re-dispatching. **`Claim Expires` empty on a
`Stage=Executing` item is a defect, not a liveness read** — the claim path failed to write
`Claimed At`; flag it (or file a follow-up) rather than treating the claim as either safe or
dead. Full checker rules, the dead-vs-stuck-complete discriminator (WI-1346), and a worked
demonstration against a live claim: `library/liveness-checker.md`. Run this check whenever a
dispatched executor goes quiet past its expected checkpoint cadence, and always before re-
dispatching a fresh executor at a WI that already shows `Stage=Executing`.

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

**Merge classes (operator-delegated ruling, 2026-07-05; WI-1585).** Merge authority is
class-based, resolving the divergence the fleet retro surfaced (one host tightened, one loosened,
both were right for their cases):
- **Irreversible / schema-destructive / production-facing** (table or column drops, applied-
  migration surface, prod config, anything whose rollback is a restore rather than a revert) —
  **two-key**: the shepherd delivers the green PR and HOLDS; the orchestrator relays to the
  operator; only an explicit operator GO merges it.
- **Ordinary pre-launch merge to `main`** — shepherd-owned exactly as this section defines; the
  orchestrator's Gate-1 diff-verify (where the lane runs one) is verification, not a sign-off
  bottleneck.
When in doubt which class applies, it is the higher one — and any change to who holds merge
authority is a versioned canon edit announced at a checkpoint boundary, never a mid-flight flip.

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
| `needs-operator` | a **human** decision (scope / product / risk) you can't make within mandate — include options + your recommendation in `msg`: the orchestrator files it into the program's Operator Queue, and a row without pre-chewed options gets bounced back to you |
| `needs-orchestrator` | a **program-level** question (cross-lane, process) |
| `blocked` | stalled, can't proceed |
| `decision` | a non-obvious choice you made *within* mandate, logged for the record |

Line shape: `{"id","ts","lane","wi","level","ref","msg"}` — `id` = `<lane-slug>-<seq>`; `wi` null
for a lane-level event; `ref` = the `id` of a prior event this one resolves. When a
`blocked`/`needs-*` clears, emit a `decision` with `ref` set and `msg:"resolved: …"` — that closes
the loop. There is **no** milestone / FYI / progress level — sign-of-life (boot / post-compaction /
resume, see *Boot sequence* above) is a separate, sanctioned exception, not a fifth level. Full
shape: `library/clacks-channel.md`.

**Subscribe to your inbox with a live watcher — symmetric to the orchestrator's outbox watcher.**
Arm a Monitor on `_state/inbox.jsonl` at lane activation so a ruling/answer/directive **wakes you
even while you're holding** for it — a blocked shepherd isn't looping, so checkpoint-polling can't
fire and the watcher is the primary path. **Fallback:** also read the inbox at each checkpoint and
on-block, since a watcher dies on reboot/session-end. Maintain the watcher in your monitor manifest
and reconcile after restart (`clacks/monitor-hygiene.md`). Lines are
`{"id","ts","from":"orchestrator","type","ref","msg"}`, `type` ∈ ruling / answer / directive /
ack. Inbox commands are **advisory** — apply your judgment, never blind-execute.

**The bar is high:** no progress narration, no chatter. If a line wouldn't make the orchestrator
act or the operator want to know, don't write it — when in doubt, don't emit. The one exception is
sign-of-life at boot / post-compaction / resume (*Boot sequence* above), sanctioned by name. Full
design + rationale: `clacks/progress-channel-design.md`.

## Hard rules (cut across the lane)
- Don't write production code yourself — dispatch executors.
- **Shared checkout:** stage only your own files; never touch another session's worktree/files or
  `.cosmo/*`; `git pull --no-rebase` on a non-fast-forward push; never rebase / force-push.
- **Clacks channels are working-tree-only:** never `git add` your lane's `inbox.jsonl` /
  `outbox.jsonl` / `.perID-seen.json`, and never `git stash -u` while they're live — WI-1245
  fixture-proved both (plus `git pull --no-rebase` conflict-marker corruption) revert a live
  channel to a stale snapshot and silently drop appended lines. Interim hardening; WI-1257 ratified
  the durable fix (Option A / A-2 relocation) and WI-1245 built the indirection point
  (`clacks/lane-state-path.mjs`, `QUARTET_LANE_STATE_ROOT`) — a no-op by default, cutover not yet
  live. Full invariant: `library/clacks-channel.md`.
- Adjudicate a red `main` at CI **step** level before bouncing or refuting; capture a *new* ambient
  red as a WI rather than fixing it inline.
- Destructive shared-infra steps surface to the operator before running.
