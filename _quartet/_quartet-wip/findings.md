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

### F9 — No `_quartet/`→live-working-state pointer for un-hooked / human launch (reinforces F1)
F1 covers the hooked-resume binding. Complement surfaced today: a human-oriented session pointed at
`_quartet/` has NO breadcrumb to *where the live program actually lives* (`_wip/umbrella-program/`).
`working/README.md` says the snapshot isn't truth and the live copy is "in its original `_wip/`
location" — but never names the path. F1's kickoff-binding fix closes this too, but only if the
kickoff (not just the hook) is the durable home of the binding.

### F10 — Standing lane has no in-place→canonical relocation ceremony (structural)
Two-tier split confirmed live + load-bearing: graduated `pr-cleanup` conforms in
`_quartet/working/lanes/`; active `identity-cutover` / `bug-lane` remain in `_wip/`. planning-rules
§2.8 makes graduation the natural relocation moment — fine for finite lanes. But **Bug Lane is a
standing lane that never graduates**, so §2.8 never fires and it would live in `_wip/` forever. The
standard lacks a relocation ceremony for a standing lane (an operator-gated quiescent-window cutover,
since its channels/monitors are live). Mid-flight relocation is unsafe — F5 shared-tree staging +
today's rogue-init-commit hazard show how fragile concurrent ops on this tree are.

### F11 — Abandoned monitor-output files masquerade as state (minor)
`_wip/identity-cutover/_state/stage-watch.json` last-checked 06-21, contradicts the live WI-867 rework
loop. monitor-hygiene reconciles *watchers* but leaves stale monitor *output files* in `_state/`; a
reader can mistake them for current truth. Either TTL/clear them on re-arm, or mark them clearly as
derived cache.

### F12 — The cutover plan permanently bifurcates the working-state home (root of the two-tier split)
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

### F13 — Program-level working-state binding is physically nested inside one lane (relocation coupling)
The program-wide rehydration binding — `rehydrate.sh`, which on EVERY role's SessionStart globs the
orchestrator anchor and names the roster/channel paths — lives at
`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`, i.e. INSIDE a single lane's `_state/`.
Consequence (found executing the Option-C relocation): the program-level working-state move
(roster/dashboard/anchor → `_quartet/working/program/`) cannot proceed independently of that one lane —
relocating `umbrella-program` requires editing a hook OWNED by `identity-cutover` (the hot, excluded
lane). The whole-program cutover is thus hostage to INI-6's lifecycle. Reinforces F1/F9 (the
working-state binding has no portable home). Candidate fix: lift the hook + binding to a program-level
home (`_quartet/working/program/` or the session-settings layer) so it isn't nested in a lane folder.

**Net.** Brain is orient-sufficient; snapshot-warning + delegation mandate held cleanly. F7/F8/F9 are
one theme — **discovery**: the Brain doesn't point a fresh session at its own live working state, its
own migration plan, or its own findings surface. F6 escalates anchor-bloat to urgent. F10/F12/F13 are
the relocation model: no ceremony for standing lanes, a permanent birth-date-keyed bifurcation that
collides with the operator's clean-up-to-standard goal, and a program binding nested inside one lane
that couples the program-level move to that lane's lifecycle.
