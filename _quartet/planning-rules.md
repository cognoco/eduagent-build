---
title: Quartet Planning Rules — the rules of the game
status: CANONICAL · program-agnostic
scope: >
  General planning rules — structure, vocabulary, slicing method, dependency model,
  activation gates, operating principles. Program-agnostic. Where a rule needs a concrete
  binding to a specific program (roster path, routing rule, boundary nodes, dogfood instance),
  that binding lives with the live roster (working/program/), NOT here.
---

# Quartet Planning Rules

**What this is.** The RULES of planning — structure, vocabulary, slicing method, dependency model,
activation gates, operating principles. **What it is not:** state. The roster
(`library/program-roster.md` → `working/program/`) holds program state; per-Initiative trackers
(`library/execution-tracker.md` → `working/lanes/<lane>/`) hold delivery state; Cosmo holds live
work-item state. **One fact, one home** (§1.4).

**Document map (who holds what):**

| Artifact | Holds | Changes when |
|---|---|---|
| **This reference** | the rules | a rule is ratified/amended |
| **Roster** (`working/program/program-roster.md`) | Initiative rows + activation queue | inventory or queue changes |
| **Per-Initiative tracker** | charter, WI map, sequence, coarse status | that Initiative moves |
| **Ratified plan** (per Initiative) | frozen planning decisions | never (superseded, not edited) |
| **Cosmo** | live per-WI state (Stage/State/claims/edges) | continuously, by executors |

---

## 1. Structure & vocabulary

1.1 **The hierarchy** (top to bottom): **Program** (the grouping layer) → **Initiative**
(`INI-NN`, an in-flight effort with lifecycle *start → active → graduated / parked / killed*,
typically with a `working/lanes/<slug>/` workspace) → **Cosmo Workstream(s)** (substrate
containers an Initiative creates **at activation**, 0..n per Initiative — never assume 1:1) →
**Work Package** (`Altitude=WP`, PR-sized executable brief; child Items optional) → **Work Item /
Sub-item**.

An Initiative realizes an **Asset**: the persistent deliverable that survives the effort and
graduates to its productionized home. Use Initiative for the effort, Asset for the deliverable
(NEX-ADR-0001).

*That hierarchy is the **work** breakdown; the **execution roles** that drive it are the
**Quartet** — orchestrator / shepherd / executor / reviewer (scaffolds: `roles/`) — coordinating
over the **Clacks** comms layer (`clacks/progress-channel-design.md`). Full stack: **ZDX → Cosmo →
Clacks → Quartet**.*

1.2 **Banned synonyms.** Initiatives are never called "workstreams" (locked to the ZDX/Cosmo
object), "work tracks", or "streams". Proper names containing those words stay reserved for their
referent and are never generalized.

1.3 **The roster is the Initiative roster** — a program board of rows and pointers. Each row is a
proto-epic: `ID · Status · Owner · Outcome · Depends-on · Decomposition (pointer) · Activate-when`.
The `Activate-when` field is the highest-value capture (the one thing Cosmo cannot express today).

1.4 **Pointers, never copies.** Every fact lives in exactly one home; every other artifact points.
Moving a fact's home is allowed (it remains one home); duplicating it is not.

1.5 **Lane ≠ 1:1 Workstream.** A **lane** is a shepherd's span of control: one shepherd drives
**1..n related Cosmo Workstreams** as a single lane — never assume 1:1. This is a distinct
cardinality from 1.1's Initiative→Workstream relation: a lane is the *shepherd's* unit, a
Workstream is the *substrate's* unit, and the two may diverge. Scope grows **organically at
runtime**, not only at activation — the orchestrator widens a shepherd's lane via a Clacks
directive, and the operator widens a reviewer's scope directly (`roles/shepherd-protocol.md`,
`roles/reviewer-protocol.md`). The lease substrate already supports a multi-workstream shepherd
without a new mechanism: per-Workstream keying (`clacks/lease.ts`, agenda B3 — one lease per
Workstream page id, no separate "lanes held" list) plus one `Owner` name reused across multiple
Workstream rows (agenda A3's `Lease *` properties) is sufficient today. A **reviewer**'s scope is
likewise a workstream **set**, and that set is **mutable** at runtime — distinct from, and looser
than, a shepherd's lane.

## 2. The delivery pattern (per active Initiative)

2.1 Activating an Initiative means creating, in order: its **tracker** (charter / how-to-use /
pointers / sequence + coarse status / current position / change log), its **Cosmo Workstream**, and
its **slice** (plan → Cosmo entries).

2.2 **Slice direct-to-WP.** Multi-item bundles instantiate as `Altitude=WP` with constituent detail
absorbed into the WP body and pointed at their satellite register — no per-constituent child items
unless they add real execution value. Flat by default; **sub-slice on demand** at execution if a WP
proves too big. A childless WP is canonical when the unit is a PR-sized executable brief whose AC
lives on the WP itself; do not demote it only because it has no children. A genuinely
single-constituent atomic unit is still an `Item`.

2.3 **WPs are PR-sized.** PR-sized is an independent gate from "shares a pattern" — a coherent
bundle that is not PR-sized gets split at plan level, not deferred to execution.

2.4 **Ratified plans should encode per-unit priority, Effort, and any other slice-time field**, so
slicing is pure transcription. `Effort` is the Work Item t-shirt size (`XS` / `S` / `M` / `L` /
`XL`) and is mandatory before `Ready` under the current ZDX DoR. A field the plan omits becomes a
judgment call at slice time — record the derivation rule used.

2.5 **Session model — one session per altitude.** Above the program session sits a
**program-manager (PM) session** (`roles/program-manager-protocol.md`) — the roadmap altitude: it
owns the roadmap (sequence, critical path, gate ledger, operator-rulings queue) and the lane roster
(`library/program-roster.md`), manages capacity (host loading, shared-checkout hazards) and
cross-lane interdependencies, and escalates to the operator only at gates and forks. A **program
session** (orchestrator) steers the roster / queue / gates day to day; a **shepherd session** per
executing Initiative runs its day-to-day; and **executor agents** build/do individual WPs in
isolation. Do not collapse altitudes: the PM session never steers a single lane's day-to-day, the
program session never shepherds WP-level detail, and a shepherd never reaches into another
Initiative — adjacent altitudes talk only in boundary events (§5.2) or, for the PM, at gates and
forks. Standing orchestration *daemons* are banned; shepherds are interactive sessions.

The PM does not replace or re-charter the orchestrator — `roles/orchestrator-protocol.md`'s
day-to-day lane-activation, lane-graduation, and Progress-channel duties are unchanged by this
altitude's introduction. The PM adds a coordinating layer above the existing four-role Quartet
(orchestrator / shepherd / executor / reviewer, §1.1); it is not a fifth Quartet role. Program-level
liveness (a PM checking lane/orchestrator liveness) inherits the exact three-step shape
`library/liveness-checker.md` already defines for L1 (orchestrator↔shepherd) and L2
(shepherd↔executor) — see `roles/program-manager-protocol.md` for the applied mechanism; it is not a
parallel design.

**Shepherd and reviewer sessions are operator-launched — by design, not convenience.** The program
session **prepares** the thin kickoff brief (§2.6) and hands it to the operator; **the operator
spawns the separate session.** The program session never spawns a shepherd (or the autonomous
reviewer) as its own subagent. This is the *only* mechanism that fully supports the session model: a
shepherd must be a full, independent, interactive session with its own context budget and lifecycle
(the disposable-but-not-subordinate invariant, §2.6), and the reviewer must be a genuinely separate
session in a different runtime (the reviewer ≠ executor quality invariant). Spawning either from
inside the program session re-subordinates it — collapsing the altitude separation and breaking the
"kill any session, lose nothing" property.

2.6 **Shepherd sessions are disposable by construction.** A shepherd is a reader/writer of the
durable artifacts, never their replacement: every state change is written back (substrate
immediately; tracker at checkpoint cadence). The test: kill the session at any moment and a fresh
one pointed at the tracker loses nothing but warm cache. Kickoff brief = three pointers (tracker ·
ratified plan · substrate operating rules) + the checkpoint duty + the boundary events to report
upward. Briefs are pointers, never pasted content — pasted briefs go stale.

2.7 **Model tiering by leverage.** Shepherds and critical-path executors run on the top model tier —
low-volume but high-leverage (a wrong pick, brief, or review costs an executor-day). Routine
sub-agents (state syncs, lookups, mechanical sweeps) run on mid/low tiers. Tier follows the role;
effort follows the turn.

2.8 **Graduating an Initiative** is the symmetric close of §2.1. When the lane's outcome is met —
every Work Item `Closed`/`Done` — perform the close ceremony, in order:
- **Set the Cosmo Workstream `Status` → `Closed`.** §2.1 created it `Open`; graduation must close the
  **container**, not just its Work Items. This is the easy-to-miss step — the shepherd's DoD stops at
  the last WI, so closing the Workstream is the **program session's** job, not the shepherd's.
- Write the final **tracker** checkpoint + residue statement; stand the shepherd down.
- Flip the **roster** entry to `graduated` (outcome + date) and update the **dashboard**.
- Route any residue / spillover.

A Workstream stays `Open` only while work remains: a legitimately **reopened** lane (a fast-follow
wave, or a deferred tier still pending) is correctly `Open` — only a *fully* graduated one is
`Closed`.

2.9 **Standing lanes have no close ceremony (F10).** Some lanes are never finite — an
**Operations**/**Bug** lane exists to absorb ongoing, unbounded intake and has no outcome that
"completes." §2.8's close ceremony is written for a finite Initiative and **never fires** for a
standing lane; reading a standing lane's quiet backlog as an overdue graduation is a category
error, not a health signal. A standing lane substitutes two mechanics for graduation:
- **Checkpoint cadence, not a close date.** The tracker records a periodic checkpoint (operator-set
  cadence; default at each session boundary) — backlog health, open-WI count, anything
  resurfaced/parked — the same evidence §2.8 uses for a finite close, but recorded as a rolling
  snapshot, never a terminal one. A standing lane's Workstream `Status` stays `Open` indefinitely by
  design; it is never evidence of lane health on its own — the checkpoint is.
- **Operator-gated quiescent-window relocation, not graduation.** A standing lane is never torn
  down mid-flight. When it must move (re-platform its tracker, fold into a successor lane, change
  owning Workstream), the move happens only inside an operator-declared **quiescent window** (no
  in-flight claims, no open `Stage=Executing` WI) and names a **cutover owner** — the unit that
  makes the relocation the system's new live state and owns convergence of the old lane's residual
  state (the single-live-store invariant; no partial per-workstream activation of the new home).
  This reuses the same owner-naming discipline a replace/rewrite plan applies at its cutover
  (§7.2's moot-by-refactor is the adjacent but distinct case: work superseded by construction, not a
  lane relocating wholesale), scoped here to relocating a standing lane rather than a full rewrite.

**Adoption timing.** §1.5 and §2.9 above are rules amendments: like the rest of `_quartet/roles/**`,
they bind a session at its **next session boundary** — never hot-swapped into an orchestrator,
shepherd, or reviewer session already running.

## 3. Planning method — reconcile-and-route

3.1 **The roster is the standing hypothesis.** Planning passes do not start from a big bucket and
re-cluster; they route the **unmapped margin** into existing rows and adjust only at the margins.
Re-deriving committed dispositions is churn, not rigor.

3.2 **High bar for new rows.** Absorb into substantial clusters first; a new Initiative needs a
coherent outcome, a distinct executor/supervision profile, and enough mass to charter. Orphan
singletons get merged or parked, not enshrined.

3.3 **Boundaries vs order.** Cluster **boundaries** come from domain / file-surface cohesion +
executor profile (what can be executed together without collision, by the same kind of executor).
**Order** comes from gates (§6). Value, capacity, and milestone pressure are *ordering* lenses —
using them to draw boundaries produces clusters that fight the file-surface reality.

## 4. Intake routing rule (what keeps planning flexible)

4.1 The stable artifact is the **routing rule**, not any frozen mapping. New work arriving at any
time routes by class to an existing row; additions change row *contents*, never program *structure*.

4.2 The rule is a short decision list maintained with the roster (program-specific). Its last line
is always: **fits nothing → the unrouted-intake line** — a holding row triaged at the next umbrella
touch. Intake never blocks capture, and capture never forces a structural decision.

4.3 **Carry your lane onto anything you file.** Work captured from inside an active lane must carry
the lane's Cosmo Workstream context, plus Sprint when one is in use. If the capture tool supports an
origin Work Item, inherit from that origin; otherwise set the Workstream/Sprint explicitly. Only file
without lane context when the work is truly cross-lane or belongs to the program-level unrouted
intake, and say that in the capture note.

## 5. Dependencies & sequencing

5.1 **Granularity by altitude — edges live at the altitude of the plan that created them.**
Intra-Initiative WP/Item edges fall out of the Initiative's own ratified plan. Nobody outside an
Initiative wires into, or maintains, its internal edges.

5.2 **Cross-Initiative dependencies attach only to exported boundary nodes** (named interface
events). An Initiative exports a small set of milestones; other Initiatives' gates reference those
events and never a foreign internal item. Any Initiative can re-slice internally without breaking the
global picture; the cross graph grows linearly with Initiatives, never quadratically with items.

5.3 **Resource contention stays out of the dependency graph.** Attention/capacity limits, same-file
blast radius, operator-ruling gates, and product triggers are **queue gates** (§6), not edges.

5.4 **Hard vs soft.** `Blocked-by` is reserved for hard logical dependencies. Soft "preferably-after"
ordering uses `Related Items` + `Workstream Order`. A soft edge that turns out to be load-bearing is
a mislabeled hard edge — promote it.

5.5 **There is no single global graph.** Sequence is computed at two grains: within an Initiative by
its own Cosmo edge graph; across Initiatives by the activation queue conditioned on boundary events.
The program never schedules another Initiative's items — it schedules **activations against exported
milestones**.

## 6. Activation & the queue

6.1 **The queue is the program-wide full forward view** — every Initiative appears with its gate,
including those whose disposition is "much later". A queue showing only the near-term subset cannot
be reconciled against the roster and is wrong by construction.

6.2 **Gate-ordered, not date-ordered.** Queue entries are conditions on named events, never calendar
positions.

6.3 **The standard activation gates** (evaluated per Initiative, all must clear):
- **Blast-radius class** — out-of-radius work may run parallel to a rewrite anytime; in-radius work
  serializes behind (or coordinates with) the constructing wave, regardless of plan readiness.
- **Pipeline-proven, not pipeline-finished** — a few work items through claim→execute→review→close
  cleanly on the machinery; never "the first Initiative completed end-to-end".
- **Attention budget** — the honest human-capacity call, made per activation window; never encoded as
  a dependency.
Plus any named **operator/product gates** (a required human ruling, an external trigger) — listed as
explicit conditions on the entry.

6.4 **Two concurrent program activities** once execution starts: **execution** (the active
Initiative(s)) and **activation planning** (everything else). Planning consumes agent capacity, not
execution throughput — it never waits on execution. Planned Initiatives start executing in parallel
as their gates clear (§6.3).

## 7. Operating principles (cross-cutting)

7.1 **Dogfood rule.** The first Initiative through any new machinery proves it before others reuse
it. Friction found while dogfooding is captured as work items against the machinery's owner,
in-flight, not hoarded.

7.2 **Moot-by-refactor.** Work that a ratified rewrite rebuilds by construction is not separately
fixed. Per-item mootness is settled **at the constructing wave's close against the actual file-touch
set** — never pre-declared from a plan.

7.3 **Decouple-by-evidence.** Live-exposure items (security, data loss, money) may be explicitly
decoupled from gates and shipped immediately by ruling — the ruling names the items; "the rewrite
supersedes it" never authorizes deferral of live exposure.

7.4 **N=3 generalization.** Patterns (trackers, scripts, processes) are promoted into
standard/tooling at the third real instance, not the second. Capture the promotion intent as a work
item when N=2 so it isn't carried in heads.

7.5 **Closure is recorded at every live register.** When a finding/flag is resolved out-of-band, the
resolution is written into each artifact that actively surfaces it (register row, backlog flag, plan
note) in one pass — a stale "act now" flag in a live document is a defect.

7.6 **Stale-status is a defect.** A doc whose own status line contradicts its commit history (DRAFT
vs ratified) misleads the next reader; flip statuses in the same change-set as the event they record.

---

> **Program-specific bindings** (the concrete program name, roster path, routing rule, boundary
> nodes, satellite registers, dogfood instances) are **not** part of these rules — they live with
> the live roster under `working/program/`. This keeps the rules reusable across programs.
