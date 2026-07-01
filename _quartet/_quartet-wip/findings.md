# Quartet Findings

Running log of findings from dogfooding the `_quartet/` system. Each entry: what was tested, what
held, what needs a ruling. Not a backlog (Cosmo owns that) — a capture surface so dogfood signal
isn't lost between sessions.

---

## 2026-06-29 — Orchestrator orient dogfood (Approach-D Wave 1)

**Test.** Synthetic orchestrator resume: fired the PRG-06 rehydration hook
(`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`) with context mostly intact, then
oriented as the orchestrator off the repointed `_quartet/` Brain against live `_wip/` Working state.
Posture = test/meta (read-only; a real PRG-06 orchestrator was active — took no live action).

**What held (validated).**
1. **Hook → Brain repoint fires correctly.** Injected `_quartet/roles/orchestrator-protocol.md` (a) +
   `_quartet/planning-rules.md` (c) as the protocol re-reads, kept the live `_wip/` roster (b), printed
   the Working-state binding line. Wave-1 repoint is live and behaves as planned.
2. **Channel-tail reconciliation is the hook's MVP.** Step 3 (tail inbox/outbox) surfaced live traffic
   instantly (WI-1161 merged, WI-867 rebasing, both shepherds alive) — this is what makes a stale
   anchor non-fatal. Best single design element.
3. **Protocol legibility is high.** `orchestrator-protocol.md` is actionable as written: 8-step
   lane-activation ceremony, four-roles-never-conflate, router duties, the "never spawn
   shepherd/reviewer as your own subagent" altitude invariant, the MANDATORY-RE-READ block (folded E5).

**Findings.**

### F1 — The Brain's own pointers fight the Wave-1 binding (headline)
`orchestrator-protocol.md` points to `working/program/program-roster.md` in two load-bearing places
(the MANDATORY-RE-READ block and Orient-on-resume). In this deployment that path resolves to the
blank `_quartet/working/` template or a stale snapshot. The **only** thing redirecting to the live
`_wip/` roster is the binding line **injected by the hook** — nothing in the Brain carries it.
- **Consequence:** a fresh orchestrator launched WITHOUT the hook (Wave-2 greenfield from kickoffs, or
  any non-hooked session) reaches for the stale/blank snapshot by construction.
- **Root nature:** this is the inherent "where is MY working state" seam of the Brain(`_quartet/`)/
  Working(`_wip/`) split — the generic, portable Brain cannot carry the one per-instance fact, and
  right now it's closed in exactly one non-portable place (the hook).
- **Candidate fix (needs ruling):** make the **orchestrator kickoff**
  (`roles/kickoffs/orchestrator-kickoff.md`) the durable home of the working-state binding (it's
  per-instance anyway); hook stays the mechanism for hooked resumes; protocol stays generic.
  Alternatives: a placeholder-pointer line in the protocol, or accept hook-only (fails Wave-2).
  **Open action:** verify whether the kickoff already carries this.

### F2 — The anchor is enormous (~115k tokens / 606 lines); rehydration is not cheap
Step 1 says "Read your world-state anchor IN FULL." The live anchor is ~115k tokens — reading it in
full consumes a large fraction of an Opus context window, **contradicting** the lean-context goal the
protocol opens with. Session blocks accrete unbounded. Candidate fix: anchor-hygiene discipline
(current-state-at-top, archive prior session blocks to a sibling), or a structured roll-up the hook
tails (as it already does for channels) instead of "read in full."

### F3 — Filename staleness is a legibility trap (minor; mechanism sound)
The live anchor is named `...handoff-2026-06-16.md` but is updated in place (content current to
06-29). The hook's `ls -t … | head -1` is mtime-based so it picks the right file, but a stale-looking
filename invites distrust. Either rename on refresh or stop dating the filename.

### F4 — Wave 1 is synthetically verified, not yet live-proven (honesty flag)
This orient forced the hook with a synthetic SessionStart. The live PRG-06 session likely oriented off
PRE-repoint `_wip/` Brain paths. So Wave 1 is **armed + dry-run + synthetic-orient verified**, but its
first GENUINE exercise is the next real PRG-06 orchestrator resume.

### F5 — Commit-flow broad-stages in a shared tree with concurrent sessions (operational hazard)
While committing this very findings file, the commit skill staged **every dirty path in the working
tree** (29 files), not just the one requested — because this checkout is shared with a live PRG-06
session that had ~28 uncommitted in-flight files sitting in it (channel `_state/*.jsonl`, the
working-tree-only `rehydrate.sh` hook, anchor, WI artifacts). That committed another session's work
and the never-commit hook before it was caught + undone (`reset --mixed`, then explicit single-file
add).
- **Why it matters for the Quartet:** the Quartet's whole model is multiple concurrent role-sessions
  sharing substrate. A commit flow that stages by "what's dirty" instead of "what THIS session
  authored" is structurally unsafe here — own-work scope cannot be inferred from the index alone when
  N sessions share one tree.
- **Mechanism note:** `_state/` channel files + `rehydrate.sh` are working-tree-only by design (the
  06-28 channel-clobber incident is the precedent). They must never be staged by anyone.
- **Candidate fix (needs ruling):** either (a) the Quartet's commit guidance mandates explicit
  pathspec staging (never `add -A`/dirty-sweep) for any session operating in a shared tree, or
  (b) `_state/` + the hook dir get gitignored (operator previously ruled NO on gitignoring `_state/`,
  06-28 — so (a) is the live path), or (c) sessions work in per-session worktrees so the shared-tree
  staging ambiguity never arises.

**Net.** Approach-D Wave 1 holds: Brain + live Working state produce one coherent picture; the hook's
channel-tail covers anchor lag. F1 is not a cutover bug — it's the inherent working-state seam,
currently closed only by the hook. Deciding its durable home is the real Wave-1 → Wave-2 graduation
question. F5 is a separate, sharper operational hazard surfaced by the same session: shared-tree
commit scope.

> Full session friction log (scratch, ephemeral): the orchestrator's
> `scratchpad/quartet-dogfood-friction-log.md` from this run.

---

## 2026-06-30 — Meta-orchestrator dogfood (arm's-length program orient)

**Test.** Fresh session instructed to (a) operate ONLY off the `_quartet/` Brain, (b) inventory live
Umbrella Program status across `_wip/{umbrella-program,identity-foundation,identity-cutover,bug-lane}`
+ `_quartet/working/lanes/pr-cleanup` at arm's length, (c) keep a dogfood findings tracker. Posture =
pure meta/read-only; a live PRG-06 orchestrator is concurrently active (WI-867 #1700 merge-gate +
WI-503 4th-bounce escalation both open through 14:06Z today). Took ZERO live action. Both inventories
delegated to read-only Explore sub-agents (Relentless-Delegation dogfood).

**What held.**
1. **Brain is orient-sufficient.** README triad model + planning-rules doc-map + orchestrator-protocol
   (four-roles / altitude invariants / router duties) gave a complete operating picture with no `_wip/`
   instructional doc needed. Machinery/state separation is legible as written.
2. **Snapshot warning works.** `working/README.md`'s ⚠ block correctly flagged the 73k
   `working/program/program-roster.md` as a stale prior-program seed — identified + distrusted purely
   from the in-folder warning, no external context.
3. **Delegation kept context lean exactly as mandated.** Two parallel Explore agents returned the full
   program picture; the orchestrator read only its own 4 machinery files and opened zero lane files.

**Findings.**

### F6 — Anchor far bigger than F2 flagged (escalates 2026-06-29 §F2)
Live anchor `_wip/umbrella-program/orchestrator-compaction-handoff-2026-06-16.md` is **~297 KB** (F2
measured ~115k on 06-29) — newest-session-prepended, accreting unbounded, ~2.5× in one day.
"Read your anchor IN FULL" on resume now costs a large multiple of an Opus window and directly fights
the lean-context mandate the protocol opens with. F2's fix (current-state-at-top + archive prior
blocks, or a structured roll-up the hook tails) is now urgent, not nice-to-have. Filename still dated
06-16 (F3 stale-filename trap re-confirmed).

### F7 — The findings surface itself is undiscoverable (process gap)
`_quartet/findings.md` exists as the dogfood capture surface, but nothing in orient-on-resume, the
orchestrator protocol, or README bootstrap tells a fresh session to read or append it. This session's
operator AND orchestrator independently proposed creating a NEW `working/quartet-dogfooding-findings.md`
— nearly fragmenting the very signal this file exists to consolidate, because neither knew it was
here. A capture surface no protocol points at fragments by construction. Fix: list `findings.md` in
README layout + the orient-on-resume read list (and/or the orchestrator kickoff).

### F8 — The machinery-cutover plan lives in the tree being cut over (recursive blind spot)
The plan governing relocation of live `_wip/*` state into the `_quartet/` standard
(`_wip/umbrella-program/quartet-cutover-plan.md` + `quartet-cutover-wave1.md`) sits in the **legacy**
location. A session told to operate "only off `_quartet/`" (this session's literal instruction) cannot
discover that the cutover is already planned/underway — it would re-derive it. The plan is per-program
state, but its *existence pointer* belongs in `_quartet/` (roster/working-program note) so the
canonical Brain can find its own migration status.

### F9 — [WITHDRAWN → repo-state] No `_quartet/`→live-working-state pointer for un-hooked / human launch
**Reclassified 2026-07-01.** In a clean deployment working-state lives at `_quartet/working/` (the
default the README already names); the "no pointer to `_wip/umbrella-program/`" gap exists *only*
because this program's state is exiled in `_wip/` (incomplete relocation). State artifact. Its one
machinery kernel — "the working-state *location* should be a binding the kickoff owns" — is already
captured as F16. Original text retained below for the relocation cleanup trail.

F1 covers the hooked-resume binding. Complement surfaced today: a human-oriented session pointed at
`_quartet/` has NO breadcrumb to *where the live program actually lives* (`_wip/umbrella-program/`).
`working/README.md` says the snapshot isn't truth and the live copy is "in its original `_wip/`
location" — but never names the path. F1's kickoff-binding fix closes this too, but only if the
kickoff (not just the hook) is the durable home of the binding.

### F10 — [KEPT → machinery, reframed] Lifecycle model has no steady-state for a standing (non-graduating) lane
**Reclassified 2026-07-01 — genuine machinery gap.** planning-rules describes a lane lifecycle of
start → active → graduated/parked/killed, and §2.8's close ceremony assumes *finite* work. A **standing
lane** (Operations / Bug Lane) never graduates, so §2.8 never fires — the standard defines no
steady-state management for it (checkpoint cadence, relocation window, how it differs from a finite
Initiative). The `_wip/`-vs-`working/` relocation gap is the *symptom* seen here; the *defect* is the
missing standing-lane lifecycle, which holds in any deployment. Fix: add a standing-lane lifecycle
(incl. an operator-gated quiescent-window relocation, since its channels/monitors are live). Original
evidence below.

Two-tier split confirmed live + load-bearing: graduated `pr-cleanup` conforms in
`_quartet/working/lanes/`; active `identity-cutover` / `bug-lane` remain in `_wip/`. planning-rules
§2.8 makes graduation the natural relocation moment — fine for finite lanes. But **Bug Lane is a
standing lane that never graduates**, so §2.8 never fires and it would live in `_wip/` forever. The
standard lacks a relocation ceremony for a standing lane (an operator-gated quiescent-window cutover,
since its channels/monitors are live). Mid-flight relocation is unsafe — F5 shared-tree staging +
today's rogue-init-commit hazard show how fragile concurrent ops on this tree are.

### F11 — [KEPT → machinery, reframed] monitor-hygiene governs watcher liveness but not the stale OUTPUT files watchers leave
**Reclassified 2026-07-01 — machinery gap (minor).** The stale file here is state, but the gap is in
the spec: `monitor-hygiene.md` reconciles *watchers* and never addresses the derived output/cache
files a watcher writes into `_state/` (TTL, clear-on-re-arm, or mark-as-derived). Any deployment's
monitors leave such files; a reader can mistake them for current truth. Add an output-file discipline
to monitor-hygiene. Original evidence below.

`_wip/identity-cutover/_state/stage-watch.json` last-checked 06-21, contradicts the live WI-867 rework
loop. monitor-hygiene reconciles *watchers* but leaves stale monitor *output files* in `_state/`; a
reader can mistake them for current truth. Either TTL/clear them on re-arm, or mark them clearly as
derived cache.

### F12 — [WITHDRAWN → repo-state] The cutover plan permanently bifurcates the working-state home
**Reclassified 2026-07-01.** Entirely a description of *this program's* `_wip/` cutover-plan decisions
(Class A/B/C) and their end-state; the operator's "clean up to the standard location" request is the
ruling on it. Program-state / operator-decision, not a Quartet-machinery defect. Retained below as
input to the relocation cleanup.

The existing cutover plan (`_wip/umbrella-program/quartet-cutover-plan.md` + `quartet-cutover-wave1.md`)
**decided** two things that combine into a permanent split: (a) the legacy program's working state —
roster, dashboard, channels, existing lanes — is **Class C: stays in `_wip/` indefinitely, never
retire** ("instance, not system"); (b) the Wave-2 proof-of-concept is to stand up each **new** lane
greenfield in `_quartet/working/lanes/` (which WS-27 pr-cleanup did). Net end-state: *where a lane's
live state lives is keyed on its birth-date* — pre-cutover lanes in `_wip/`, post-cutover lanes in
`_quartet/working/`, **forever**. This is the structural root of the two-tier split (F10) and means
"the Quartet storage standard" and "where THIS program's live state actually lives" permanently
disagree. The plan itself marks the binding's durable home **provisional / open** ("physical home is a
deployment decision"). **Open question to surface (not a contradiction):** the plan *parked* the
end-state home and chose drain-at-graduation as the interim; the operator's 2026-06-30 "clean up to
the standard storage location" request is the ruling on that parked question, not a reversal of canon.
The `_wip/` cutover plan is prior-thinking-to-confirm (suspect-history zone; none of its Class A/B/C
calls are reflected in `_quartet/`) — an input to the operator's call, not a constraint on it.
Operator decision, not an orchestrator ruling.

### F13 — [WITHDRAWN → repo-state; thin machinery residue] Program-level binding nested inside one lane
**Reclassified 2026-07-01.** The specific misplacement (`rehydrate.sh` under `identity-cutover/_state/`)
is a growth accident of this program = state. Thin machinery residue worth carrying: the Library/clacks
never **defines a home for the program-level session-start (rehydration) hook** — monitor-hygiene
mentions the hook's *content* ("reconcile, don't re-arm") but not *where it lives*. Give it a defined
program-level slot so it can't get nested in a lane. That one line is the only machinery take-away;
the rest is relocation cleanup. Original evidence below.

The program-wide rehydration binding — `rehydrate.sh`, which on EVERY role's SessionStart globs the
orchestrator anchor and names the roster/channel paths — lives at
`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`, i.e. INSIDE a single lane's `_state/`.
Consequence (found executing the Option-C relocation): the program-level working-state move
(roster/dashboard/anchor → `_quartet/working/program/`) cannot proceed independently of that one lane —
relocating `umbrella-program` requires editing a hook OWNED by `identity-cutover` (the hot, excluded
lane). The whole-program cutover is thus hostage to INI-6's lifecycle. Reinforces F1/F9 (the
working-state binding has no portable home). Candidate fix: lift the hook + binding to a program-level
home (`_quartet/working/program/` or the session-settings layer) so it isn't nested in a lane folder.

**Net.** Brain is orient-sufficient; snapshot-warning + delegation mandate held cleanly.

**Reclassification pass (2026-07-01, system-vs-state) — F9–F13.** Of these five, **two are machinery**
and **three are repo-state**:
- **F10 (KEPT — machinery):** the lifecycle model has no steady-state for a *standing, non-graduating*
  lane. Systemic.
- **F11 (KEPT — machinery):** monitor-hygiene governs watchers but not the stale output files they
  leave. Systemic (minor).
- **F9 (WITHDRAWN — state):** "no pointer to `_wip/` live state" exists only because state is exiled
  there; machinery kernel already = F16.
- **F12 (WITHDRAWN — state):** describes this program's cutover-plan decisions; operator is ruling.
- **F13 (WITHDRAWN — state):** a nesting accident; thin residue = "Library should define a home for
  the session-start hook."

F6–F8 (discovery: Brain doesn't point a fresh session at its live state / migration plan / findings
surface) and the F6 anchor-bloat item were not part of this pass — they read as a mix of state
(discovery gaps that vanish once relocation completes) and one possible machinery item (unbounded
anchor growth: does the Library define anchor rotation?). Flag for a later F6–F8 pass if wanted.

**Machinery findings still open across the whole log:** F16 (Brain hard-names a literal working-state
path), F17 (reconcile can't keep a monitor across a job), F18 (no scoped/observer boot), F10
(standing-lane lifecycle), F11 (monitor output-file hygiene), + the F13 residue (home for the
session-start hook). Everything else is this program's relocation cleanup, tracked as program work.

## 2026-06-30/07-01 — Simulated fresh-orchestrator kickoff boot (machinery findings only)

Ran the program kickoff launcher end-to-end as a cold orchestrator. **Scope discipline (operator,
2026-07-01): this log is for _Quartet machinery_ improvement candidates — not this repo's transient
state.** Each boot observation was re-tested against "is this the *system*, or *our mess*?" Two of the
five were environment/repo-state and are **withdrawn** (kept as stubs so the reasoning trail survives).

### F14 — [WITHDRAWN → environment, not machinery]
Originally "master DB unreadable." False: the DB reads fine per-page via `notion-fetch`; only Notion's
**bulk-query add-on** is plan-gated — an **estate binding** (the Notion MCP tier), not a Quartet
defect. The only machinery-relevant residue is the roster-vs-DB (Approach-B) **library** question —
the Library still defines `program-roster.md` as an artifact while this program moves the master to
Cosmo — and that is tracked as the Approach-B spike, not as a finding.

### F15 — [WITHDRAWN → repo-state, not machinery]
Originally "stale outbox / live-session collision." The machinery already prescribes the right
behavior: lifecycle is **Cosmo-Stage-owned** (not channel-derived) and escalations close via a
`ref`-tagged `decision` (`progress-channel-design.md` §"the closed loop"). What the boot hit — a
`needs-orchestrator` still reading "open" after WI-867 had merged, on dead lanes — was a **session
that ended without emitting its closing `decision`**: our mess, machinery working as designed. The
generic rule ("Cosmo-verify before acting on any channel signal") is already in monitor-hygiene. No
system change indicated.

### F16 — Reusable Brain hard-names a literal working-state path (machinery↔state coupling)
`orchestrator-protocol.md` "Orient on resume" step 1 AND its 🔴 mandatory re-read list AND
`planning-rules.md` "Document map" all name `working/program/program-roster.md` as a required read.
In this deployment the live roster is `_wip/umbrella-program/program-roster.md` (a *deprecated*
downstream mirror), and `_quartet/working/program/` holds only `program-roster.template.md`. A cold
orchestrator following the **machinery literally** reads a template (or nothing). The kickoff
redirects, but the program-agnostic Brain still encodes a program-specific path it claims not to own.
Sharpens F1/F9. Fix: the protocol/planning-rules should refer to "the roster (location is a
working-state binding — see the program kickoff)", not a literal path.

### F17 — Reconcile ritual can't "keep" a monitor across a job boundary (machinery)
monitor-hygiene's reconcile ritual has a **"keep — refresh its task-id"** branch, but Monitor watches
are **job-scoped**: a fresh orchestrator in a new job sees none of the prior job's monitors in
`/tasks`, so reconcile after any job change **always** resolves to "replace all," and the manifest's
stored `task-id`s carry no cross-session value. The manifest's durable worth is its **intent rows**,
not the ids. monitor-hygiene should say this explicitly and stop implying task-ids survive a
compaction/resume that crosses a job. System-level (independent of where the manifest file lives —
that split is a repo-state artifact of the incomplete relocation, not a machinery finding).

### F18 — No "observer boot" mode: the reconcile ritual re-arms watchers on lanes the kickoff says to stay arm's-length from
monitor-hygiene + the protocol require, at session-start, a central Cosmo-Stage backstop **plus**
per-active-lane watchers; the kickoff simultaneously says stay arm's-length from in-flight lanes you
weren't asked to drive. For a dogfood/observer boot (or any orchestrator handed only a *subset* of the
program) these conflict — re-arming watchers on identity-cutover/bug-lane means actively monitoring
lanes outside the remit. The Brain assumes the booting orchestrator **owns every active lane**; there
is no scoped/observer boot. Minor but real: the protocol should let the orient scope be a named lane
subset, with monitors armed only for owned lanes.

**Net (machinery).** Three keepers, one shape: the reusable Brain **over-commits to this-deployment
specifics** — it hard-names a literal roster path (F16), assumes monitor task-ids survive a job (F17),
and assumes the booting orchestrator owns *every* active lane (F18). Fix pattern = make the Brain refer
to **bindings, not instances** (roster location, monitor identity, lane scope are all deployment/run
bindings the program layer supplies). The delegation mandate, quality carve-out, and four-role
separation all read cleanly — the Brain's *reasoning* is sound. **Process note (the meta-lesson):** the
dogfood log had drifted into recording repo-state cleanup as "findings" (F14/F15 here; likely F9–F13
from the prior session too — they describe the Option-C relocation mess). Machinery findings and
program-state cleanup are different buckets; only the former belong here. F9–F13 were reclassified in
the pass above (2026-07-01): F10/F11 kept as machinery, F9/F12/F13 withdrawn as state.
