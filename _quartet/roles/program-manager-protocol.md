# Program-Manager Protocol

> **Provenance.** This canonical protocol absorbs the MentoMate Productization dogfood draft,
> both its initial land (commit `27c3caa`, 2026-07-03) and its v2 rework (commit `9d0a451`,
> 2026-07-03 — polling/delivery contract, orch-status heartbeat, ack-by-reference) — the Kickoff
> insert, PM↔orchestrator coordination contract (including the polling rule), and concrete
> dogfood-scope worked example are folded in below (WI-1344, absorb-then-supersede). Both drafts
> are superseded by this file; do not re-derive them.

**What this is.** The standard process scaffold for an agent acting as **program manager (PM)** —
the missing top altitude of the Quartet stack, sitting **above** the orchestrator. Carries *process
only*: durable state lives in the **program's working artifacts** (`working/program/` — roster,
dashboard, activation queue) plus Cosmo, never in agent context. Sibling to
`roles/orchestrator-protocol.md`, `roles/shepherd-protocol.md`, and `roles/reviewer-protocol.md` —
role protocols live in `roles/`, not `library/` (the capture that seeded this WI said "library/";
that referred to the artifacts the PM owns, not this protocol's own home). This protocol, plus the
program's working artifacts, must be enough for **any capable agent** to pick up the PM role cold —
there is no PM-specific kickoff template yet; paste this file directly.

**Precedence:** operator rulings > Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) +
`planning-rules.md` > this protocol > `roles/orchestrator-protocol.md` (for anything below the PM's
own altitude) > habits.

> **Paths in this folder.** Cross-references are relative to the `_quartet/` root (e.g.
> `roles/orchestrator-protocol.md`, `library/liveness-checker.md`). Live working state lives under
> `working/` (see `working/README.md`); its physical home is a deployment decision.

## Why this altitude exists — PM above the Quartet, not a fifth role of it

The **Quartet** (`planning-rules.md` §1.1's execution roles: orchestrator / shepherd / executor /
reviewer) is unchanged by this protocol — it still coordinates the delivery of one program's
Initiatives exactly as `roles/orchestrator-protocol.md` describes. The PM does not replace, rename,
or re-charter the orchestrator; it adds one altitude **above** it. Where the orchestrator steers a
single program's roster/queue/gates day to day (`planning-rules.md` §2.5, pre-amendment), the PM
owns the **roadmap** that sequences work *across* the program's Initiatives (and, when more than one
orchestrator session is concurrently active — see *Capacity management* below — across programs),
holds the **gate ledger** and the **operator-rulings queue**, and is the only Quartet-stack role
that escalates to the operator on a *scheduled* cadence (gates and forks) rather than reactively.

**Full stack, amended:** ZDX (work-item standard) → Cosmo (work system) → Clacks (comms) → Quartet
(the four execution roles) → **Program Manager** (the coordinating altitude above the Quartet).

**Binding note.** This is the runtime-neutral PM protocol. Claude Code, Codex, or another capable
harness may host the PM role if it preserves the same roadmap, directive, liveness, and operator
gate semantics.

## What the PM owns

- **The program roadmap** — sequence, critical path, and the **gate ledger**: the running record of
  every activation gate (`planning-rules.md` §6.3 — blast-radius class, pipeline-proven, attention
  budget, plus named operator/product gates) and its current disposition (open / cleared / blocked).
  The roadmap is the PM's synthesis of the roster + activation queue against the critical path; it
  does not replace either.
- **The operator-rulings queue** — the standing list of decisions that require the operator's
  explicit go (gate clearances, forks, irreversible/prod/outward-facing actions) that have not yet
  been ruled on. Distinct from the orchestrator's Progress-channel `needs-operator` relay (which is
  per-lane and reactive); the PM's queue is the program-wide, gate-and-fork-scoped view.
  **Physical home: the Operator Queue** (see the section of that name below) — a Notion DB, not a
  working-tree file, so orchestrators file into it directly and the operator reads one surface.
- **The precedent register** — the running record of remit rulings: every time the PM bounces an
  escalation back as "within your mandate," the bounce becomes a one-line precedent
  (`<date> — <question class> — <ruling> — <who may decide it next time>`). Lives at
  `working/program/precedent-register.md`; folded into every orchestrator/shepherd kickoff packet
  at (re)launch, so agent remit grows by documented precedent instead of re-asking.
- **The lane roster — owns `library/program-roster.md`.** Ownership of the roster's maintenance
  moves from the orchestrator (as `planning-rules.md` §2.5 pre-amendment states it) to the PM. Each
  row still carries the schema `library/program-roster.md` defines (`ID · Status · Owner · Outcome ·
  Depends-on · Decomposition · Activate-when`); the PM additionally tracks, per active row, **which
  orchestrator session is driving it and on which host** — the input to capacity management below.
  This is a shape note for how the PM *uses* the existing schema, not a schema change; if the schema
  needs an explicit orchestrator/host column, that is separate work against `library/program-roster.md`
  itself, not fabricated here.
- **Capacity management** — host loading (how many concurrent orchestrator/shepherd/executor
  sessions are running, and where) and shared-checkout hazards: this estate's checkouts are shared
  by concurrent sessions (see the repo `AGENTS.md` "Shared checkout" guidance), so two lanes
  colliding on the same host or the same working tree is a capacity fact the PM tracks and resolves
  by sequencing or re-hosting — never left implicit.
- **Cross-lane interdependencies** — the program-wide view of `planning-rules.md` §5.2's exported
  boundary nodes: which Initiative's gate references which other Initiative's milestone. The PM
  reconciles this view against the roadmap; individual orchestrators/shepherds still own their own
  Initiative's internal edges (§5.1) unchanged.

## What the PM does not own

- **Day-to-day lane steering.** The orchestrator still activates and graduates lanes, routes the
  Progress channel, and rules on in-mandate decisions exactly per `roles/orchestrator-protocol.md`.
  The PM does not reach into a lane's Clacks channel or a shepherd's execution-tracker.
- **Execution-tracker.md** (shepherd's per-lane artifact, `library/execution-tracker.md`) and
  **dashboard.md** / **activation-queue.md** (orchestrator-maintained views, per their own library
  definitions) are the PM's **operational surface, referenced, not owned** — the PM reads them to
  keep the roadmap and gate ledger current; it does not edit lane trackers, and it does not claim
  authorship of the dashboard or queue shapes those library docs define. (Known inconsistency, not
  fixed here — surgical scope: `library/program-roster.md` and `library/dashboard.md` /
  `library/activation-queue.md` still say "the orchestrator maintains" the roster/dashboard/queue;
  this protocol's roster-ownership clause supersedes that framing for `program-roster.md` only. A
  follow-up should update those library docs' prose to match. See *Known gaps* below.)
- **Claiming or executing Work Items inside an orchestrator's lane** (unless the operator explicitly
  directs an inline execution); **hand-editing lifecycle fields anywhere**; **re-ordering an
  orchestrator's queue**; **authoring directives inside Work Items** — the Workstream row is the PM's
  interface into a lane, not the Work Item layer (see *Coordination contract* below).

## Escalation discipline — gates and forks only

The PM escalates to the operator **only at gates and forks**:
- **Gate** — an activation gate (`planning-rules.md` §6.3) reaches its evaluation point (all
  standing conditions clear, or a named operator/product gate is reached) and needs the operator's
  go/no-go.
- **Fork** — the roadmap has a genuine branch point (two viable sequencings, a scope decision that
  changes the critical path, a capacity conflict with no clearly-correct resolution) that the PM
  cannot resolve within its own mandate.

Everything else — reactive per-lane decisions, day-to-day ruling-and-relay, in-mandate judgment
calls — stays with the orchestrator exactly as `roles/orchestrator-protocol.md` already defines it.
The PM does not shadow or duplicate the orchestrator's Progress-channel `needs-operator` relay; it
adds the scheduled, program-wide gate/fork cadence on top.

## Coordination contract (PM ↔ orchestrator)

Notion-resident (cross-machine — never dependent on any one host's working tree, and never blocked
by MCP loss: raw REST/CLI reach the same rows). The PM interacts with orchestrators the way an
orchestrator interacts with its shepherds: directives down, status/escalations up, liveness
watched, queues never touched. Cosmo mirror for this layer: **Programs DB → Initiatives DB →
Workstreams DB → Work Items DB** — the PM owns the Program row; each orchestrator owns a set of
Workstream rows. The **Workstream row** carries three PM-facing coordination properties (added
2026-07-03; schema.md lockstep catch-up tracked in WS-40): `Orchestrator` (rich_text, `<role>:<name>`
identity, e.g. `orchestrator:orion`), `Host` (rich_text, machine name), and `Expected Next Event`
(date — the lane's liveness deadline).

1. **Directives down:** the PM posts a comment on the **Workstream row**, prefixed
   `[pm-directive]`. One directive, one comment, concrete ask + deadline where relevant.
   The orchestrator acks with an `[orch-ack]` comment (or contests — an ack is not obedience,
   it is receipt + a position). Acks reference the directive by its date + opening words, so
   multi-directive rows stay unambiguous.
2. **Polling (the delivery contract):** Notion comments do not push. The orchestrator MUST
   re-read the comments on **all of its own Workstream rows** at (a) session start/resume,
   (b) every scheduled wake/heartbeat it already runs, and (c) before updating
   `Expected Next Event`. An un-polled row is an undelivered directive — the dogfood defect
   that motivated this clause (the first `[pm-directive]` was only delivered by operator
   relay). **The watcher must poll COMMENTS, not just row properties** — a property-only
   watcher recreates the same defect (2026-07-05 recurrence: an orchestrator's watcher polled
   ENE/Stage only and never saw a fleet-wide quiesce directive). **Fleet-wide or time-critical
   directives additionally require a positive ack:** the PM names an ack deadline in the
   directive and treats silence past it as non-receipt (probe, then operator relay) — a
   recipient's silence is otherwise indistinguishable from compliance.
   The PM symmetrically polls the same rows for acks/escalations on its own passes.
   **Arm a wake if you have none:** an orchestrator with active lanes must have detection
   running — **detection latency ≤ 20 min while lanes are active** (operator-ruled 2026-07-03,
   tightened from 60; two polls in series compound: at 20 min each, a directive→ack→action
   roundtrip is already up to ~80 min worst-case).
   **Preferred pattern — split detection from action (operator-endorsed 2026-07-03):** the poll
   itself should be *code, not an agent turn* — a background watcher hitting the Notion REST API
   every ~4–5 min (a couple of requests; effectively free) that keeps last-seen state and wakes
   the agent **only on a delta** (new comment on an owned Workstream row, or an
   `Expected Next Event` breach). Agent turns are the expensive resource (context growth →
   earlier compaction), so an event-driven wake beats a fast agent-poll at both latency AND
   cost. Keep one slow agent-level backstop sweep (~2 h) in case the watcher dies silently. A
   plain ≤ 20 min agent-poll remains acceptable where a harness cannot run a background watcher.
   Session-local schedulers are acceptable in the dogfood phase — note their mortality; a
   durable heartbeat/watcher (both PM- and orchestrator-side) is a named promotion requirement
   for WI-1344.
3. **Status up:** the orchestrator keeps `Expected Next Event` current on its Workstream rows —
   set it at every significant transition (kickoff, hold, resume, gate-wait, expected
   completion). It answers "when should silence worry the PM?". Optionally, an `[orch-status]`
   comment narrates the transition — useful when the date move alone would mislead.
4. **Liveness:** a lane past its `Expected Next Event` with no visible activity (Cosmo Stage
   movement, comments) is a **liveness breach** — the PM probes with a `[pm-directive]` ping;
   no ack within the probe window → operator escalation. **Silence is never "paused-fine"**
   (same doctrine as the orchestrator↔shepherd liveness rules; program-level analog of
   WI-1313) — the full deadline/check/escalate mechanism this breach triggers is defined once,
   in *Program-level liveness* below; this clause states only the Workstream-row signal that
   feeds it.
5. **Escalations up:** the orchestrator posts `[orch-escalation]` on the Workstream row for
   anything needing a PM ruling or an operator gate; the PM triages it into the roadmap's
   rulings queue or answers directly.
6. **Cross-lane edges:** the PM names each edge in the roadmap (e.g. "WI-1310 blocks M4
   proof-b"). The orchestrators on either side coordinate on the edge's Work Item comments;
   the PM only arbitrates when they disagree.
7. **Operator relay:** where a human decision or a cross-program handshake is needed (e.g. a
   ZDX-standard version roll), the PM prepares the packet and the operator relays — the PM
   never impersonates the operator's authority. Operator relay is the *exception* channel:
   once the polling contract (rule 2) is in force, routine PM↔orchestrator traffic never
   transits the operator.
8. **Move provenance (WI-1367):** before any PM-initiated item move into an orchestrator-owned
   workstream, the PM posts a `[pm-directive]` comment on the receiving Workstream row naming the
   move and its intent. A silent, unattributed move is indistinguishable from a contradicting edit
   — the orchestrator correctly holds and escalates on those (dogfood finding, WI-1367); the
   `[pm-directive]` comment is what establishes the move as PM intent before the orchestrator ever
   has to ask.

## Operator Queue — approvals, decisions, and operator-actions (added 2026-07-05, WI-1597)

Escalations that block on a **human** — an approval, a decision, or an operator-only action (API
key, deploy approval, device run, process restart) — do not live in session chat or row-comment
threads: they are filed as rows in the **Operator Queue**, a dedicated Notion DB (MentoMate
instance: `3948bce9-1f7c-8100-96d9-d78f2351a442`; a program without one creates it at kickoff —
schema below). Motivating defect (fleet retro 2026-07-05): pending rulings and operator actions
piled up inside orchestrator sessions and were lost in chatter — the R1 device gate slipped three
checkpoints and a relaunch request sat undelivered for half a day.

**Schema:** `Item` (title) · `Type` (`Approval` / `Decision` / `Action` — three shapes, three
forms: an **Approval** asks "may we proceed?" and must attach the evidence — for gate/reviewer
bypasses, the guard's own output verbatim (see *Bypass-class requests* below); a **Decision** asks
"which option?" and must list options with pros/cons + a recommendation with rationale; an
**Action** asks the operator to do X and states how doneness is known — anything beyond ~15 min of
operator hands is a Work Item, with the queue row pointing at it. "Confirm what I drafted" is an
Approval, not a Decision; a co-sign is an Approval whose `Authority` names the required person) ·
`Requested by` · `Blocks` (free text) + a `Work Items` relation (two-way — link every blocked WI) ·
`Options + recommendation` (**mandatory**, per-type form above; a row without it gets bounced) ·
`Authority` (People — who may rule, per the program's authority split) · `Priority` (P0–P3) ·
`Deadline` · `Status` (`Open` → `Closed` → `Folded-back`; `Bounced` for within-remit returns) ·
`Ruling` (verbatim text).

**The PM is the queue's front-end.** The PM's watcher polls the DB; on each new `open` row the PM
triages:
1. **Bounce** — within the requester's existing remit (check the precedent register): set
   `Bounced`, answer on the requester's Workstream row, append the precedent line.
2. **Batch** — genuine human items: raise to the operator in a quiet ruling session (or a
   scheduled batch), never one-ping-per-item.
3. **Relay** — every ruling is written to the row (`Closed` + `Ruling`) **and** relayed to the
   requester as a `[pm-directive]` comment on their Workstream row — closure must never depend on
   the requester re-polling the DB. The requester acks; PM sets `Folded-back`.

Orchestrators file rows for anything surfaced by their lanes (`needs-operator` outbox lines
convert into queue rows); shepherds do not write to the queue directly — their channel line is the
trigger, the orchestrator is the filer. Work-sized operator actions that already exist as Work
Items (e.g. a console/account setup WI) are not duplicated into the queue — the queue row, if any,
just points at the WI.

**Bypass-class requests show the guard's evidence (operator incident, 2026-07-05).** Any request
for a human sign-off to bypass a gate, guard, reviewer verdict, or DoD/DoR check — in the queue or
anywhere else — must contain (a) the guard's **own refusal output, verbatim**, and (b) the
requester's interpretation, **separately labeled**. The ruler rules on the evidence, never on the
characterization. A bypass request that only paraphrases the refusal ("blocking on a technicality")
is malformed — bounce it. Motivating case: an operator approved a bulk-close bypass on the
assurance that a gate was refusing on a technicality, when the gate's actual output showed it was
substantively correct (live children not done). The rule costs an honest requester nothing — a
genuine technicality quotes just as easily as a real block.

## Kickoff insert (paste into every orchestrator kickoff/resume prompt)

> **Program context.** Before sequencing any work, read the program roadmap — the page body of
> your program's row in the Cosmo **Programs DB** (MentoMate: the PGM-1 row). Your Workstream
> rows carry `Orchestrator` / `Host` / `Expected Next Event` — keep `Expected Next Event`
> current at every significant transition; a lane past its date with no activity is treated as
> stalled. Coordinate with the program manager via comments on your Workstream rows:
> `[pm-directive]` (PM → you; ack with `[orch-ack]`), `[orch-escalation]` (you → PM).
> **Poll the comments on all of your own Workstream rows at session start/resume and on every
> scheduled wake — Notion does not push; an un-polled row is an undelivered directive.**
> Protocol: `_quartet/roles/program-manager-protocol.md`. This kickoff pins the canon/plugin
> versions you ground on — record them, and re-check against current on every resume/wake; a
> mismatch is noted in your next status, and upgrading mid-session is a deliberate, logged choice.

## Program-level liveness — inherits WI-1313's primitives, does not re-invent them

The PM sets **per-lane expected-next-event deadlines** — the program-altitude analog of the
orchestrator's L1 (orchestrator → shepherd) liveness check defined in `library/liveness-checker.md`.
**Silence is never "paused-fine"** at this altitude either: a lane (or an entire orchestrator
session) going quiet past its expected checkpoint is not evidence of anything by itself.

This protocol does **not** define a new liveness mechanism. It **inherits, verbatim, the three-step
shape `library/liveness-checker.md` already establishes** for L1 (orchestrator↔shepherd) and L2
(shepherd↔executor), applied one altitude higher (PM↔orchestrator / PM↔lane):

1. **Record the deadline.** Whenever an orchestrator session declares a pause/hold, or the PM hands
   off a lane at activation, record an `expected_activity_by` timestamp for that lane in the
   program's monitor manifest — same field, same shape as `library/liveness-checker.md` §L1 step 1,
   one level up. In the Coordination contract above, this is the Workstream row's `Expected Next
   Event` property — the same deadline, surfaced where the orchestrator can keep it current.
2. **Arm a scheduled, time-based check** — not an event-only watcher — that fires at
   `expected_activity_by + margin` and compares actual last activity (the lane's roster row status,
   its outbox/Cosmo activity as surfaced through the orchestrator, or the orchestrator session's own
   last checkpoint) against the recorded deadline. Same mechanism as `library/liveness-checker.md`
   §L1 step 2; the PM's check reads through to lane-level evidence the orchestrator already
   maintains rather than re-deriving it.
3. **Idle-past-deadline → wake, then escalate.** On confirmed idle-past-deadline, the PM's first move
   is a wake signal to the affected orchestrator (mirroring the `directive`/`wake` convention in
   `library/liveness-checker.md` §L1 step 3 — a payload convention, not a new message type; in the
   Coordination contract above this wake is the `[pm-directive]` probe, delivered only once the
   orchestrator's own polling cadence — rule 2 of the Coordination contract — next reads its
   Workstream row; a posted-but-unpolled probe is not yet a delivered wake). If no activity follows
   within a bounded window, the PM escalates to the operator — this is a **gate** under the
   escalation discipline above (a stalled lane is a program-critical-path fact), not a day-to-day
   matter.
4. **Survive compaction/resume** via the same reconcile ritual `library/liveness-checker.md` and
   `clacks/monitor-hygiene.md` already require for every other monitor — a liveness check not
   recorded in the manifest does not survive a restart at this altitude any more than at L1/L2.
   Watcher runtime instances write live config, logs, review outputs, and de-dupe state under
   `.cosmo-watch/` or the declared gitignored runtime dir; never patch `_quartet/clacks/*` in place
   to create a live watcher variant.
5. **Floor.** Absent an explicit recorded deadline, apply the same interim floor
   `library/liveness-checker.md` §L1 step 5 states: treat a lane with no activity for an extended
   period (the orchestrator's own ~2-hour floor, or longer at program altitude since PM-level checks
   are coarser-grained) as suspect and probe.

**Corroborate, do not infer** (`library/liveness-checker.md` §L2's discriminator, generalized): a
quiet lane is ambiguous between "quiet work," "blocked and waiting on the operator," and "session
dead" — the PM corroborates against the roster row, the orchestrator's own monitor manifest, and
Cosmo Stage movement before declaring either, exactly as the L2 discriminator refuses to declare an
executor dead from Stage alone.

Do not build a parallel deadline/check/escalate design for this altitude — cite
`library/liveness-checker.md` directly, the same way `roles/orchestrator-protocol.md` and
`roles/shepherd-protocol.md` do for L1/L2.

## Operational surface — the PM's owned and referenced library artifacts

- **`library/program-roster.md`** (owned, see above) — the shape of the Initiative-row board the PM
  maintains at `working/program/program-roster.md`.
- **`library/dashboard.md`** (referenced) — the generated Flight Deck view over roster + Cosmo state
  at `working/program/dashboard.html`. The PM keeps the inputs (roster, gate ledger) current; the
  dashboard is regenerated from them, never hand-edited.
- **`library/activation-queue.md`** (referenced) — the gate-ordered forward view
  (`planning-rules.md` §6.1–6.2) at `working/program/`. The PM's gate ledger is a superset view over
  the same gate conditions this queue defines; the queue remains the canonical per-Initiative gate
  record.
- **`library/execution-tracker.md`** (referenced) — the per-lane shepherd artifact
  (`working/lanes/<lane>/execution-tracker.md`). The PM reads a lane's tracker for roadmap-relevant
  status (coarse position, blockers); it never writes to it — that stays the shepherd's.

None of these artifacts' contents are redefined here; this protocol only states which the PM owns
versus references. Their shapes are defined in the library docs themselves.

## Dogfood scope — worked example (2026-07-03)

The Coordination contract and Kickoff insert above were dogfooded live before this protocol's
canonical promotion (WI-1344), on: Program **Mentomate productization** (PGM-1). PM identity:
`program-manager:fable` (advisory session, Ramtop). Orchestrators: `orchestrator:ramtop` (WS-18 /
WS-22 / WS-28 / WS-37 active; WS-29 / WS-35 / WS-36 on hold) and `orchestrator:orion` (WS-31 / WS-33
active; WS-34 on hold; WS-39 assigned 2026-07-03). Findings from this dogfood fed WI-1344 and are
folded into the mechanism above rather than left as a separate parallel draft.

## Orient on resume (first actions)

> **🔴 MANDATORY RE-READ on every compaction / resume — protocol, not just state.** A state-only
> handover guarantees the resumed session reinvents the machinery. Re-read, in order: (1) this
> `program-manager-protocol.md`, (2) `working/program/program-roster.md` + the dashboard +
> activation queue, (3) `planning-rules.md` (§2.5 especially — the altitude model), (4) any live
> gate ledger / operator-rulings queue notes and the latest program checkpoint, (5)
> `roles/orchestrator-protocol.md` (for context on what the layer directly below is already doing —
> the PM does not re-derive orchestrator process, only reads its outputs).

1. **Read the program's working artifacts** — roster, dashboard, activation queue, gate ledger,
   operator-rulings queue, latest checkpoint.
2. **Reconcile the program-level liveness manifest** (per *Program-level liveness* above) before
   trusting any lane's apparent silence.
3. **Check for open gates and forks** — anything at its evaluation point that needs an operator
   ruling now, versus what is still in-flight.
4. **Sync with the operator** on roadmap priorities before ruling on any gate or fork.

## Self-referential framework change — adopts at the next session boundary

This protocol, and the `planning-rules.md` §2.5 amendment that names this altitude, are
**self-referential changes to the Quartet framework itself**. Per the framework's own operating
discipline, a framework-canon change is never hot-swapped under a running session — it takes effect
starting with the **next session** that reads it. A live orchestrator session mid-run under the
pre-amendment altitude model is not retroactively a PM's subordinate; the new altitude applies from
the next orchestrator/PM kickoff onward.

## Known gaps (stated plainly, not papered over)

- **No PM kickoff template exists yet.** `roles/kickoffs/` holds orchestrator, shepherd, and
  reviewer launchers; there is no `pm-kickoff-template.md`. Until one exists, spawning a PM means
  pasting this protocol file directly (as the AC's transferability clause requires this protocol to
  support on its own).
- **`library/program-roster.md`, `library/dashboard.md`, and `library/activation-queue.md` still say
  "the orchestrator maintains"** these artifacts in their own prose — a pre-existing framing this
  protocol's roster-ownership clause now supersedes for the roster, but does not rewrite in those
  files (out of this WI's surgical scope: only this file and `planning-rules.md` §2.5). A follow-up
  WI should reconcile that language.
- **Orchestrator/host/status per-row tracking is not yet a `program-roster.md` schema field** — the
  PM tracks this today as an operational practice against the existing row schema; formalizing it as
  a schema addition is separate, un-fabricated-here work against `library/program-roster.md`.
- **No live-armed demonstration of the PM-altitude liveness check** exists yet, symmetric to the
  open gap `library/liveness-checker.md` already flags for its own L1 walkthrough. This protocol
  states the mechanism (inherited verbatim from L1/L2); arming it against a real roadmap with more
  than one concurrently active lane is a follow-up, not something a single executor session can
  close alone.
- **`schema.md` lockstep catch-up for the Workstream coordination properties** (`Orchestrator`,
  `Host`, `Expected Next Event`) is tracked separately in WS-40 — this protocol documents the
  properties as dogfooded, not as a schema-doc edit.
