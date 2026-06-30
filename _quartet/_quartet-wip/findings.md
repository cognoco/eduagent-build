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

## 2026-06-30 (cont.) — Simulated fresh-orchestrator kickoff boot (from `working/program/orchestrator-kickoff.md`)

Ran the program kickoff's launcher end-to-end as a cold orchestrator would, executing each prescribed
step (read protocol + planning-rules + monitor-hygiene → read the Initiatives DB master → check live
lane channels → reconcile monitors). Findings from the boot itself:

### F14 — The master Initiatives DB is unreadable by the orchestrator's own tools (CRITICAL — Approach-B blocker)
The kickoff makes the Cosmo Initiatives DB the **master** and tells the orchestrator to "read the DB
for the live initiative set." It can't. Both query modes are **plan-gated** (HTTP 400 "requires a
Business plan or higher with Notion AI"): `notion-query-data-sources` (SQL) AND
`notion-query-database-view`. `notion-fetch` on the database, the data-source, and the view each
return **schema only, never rows**. The sole non-gated read is `notion-search` — semantic, ranked,
**capped (~10), un-filterable by Program/Status, and noisy** (returns cross-program hits like
"Equities", "Nexus Control-Plane"). So a fresh orchestrator cannot enumerate "all Mentomate
initiatives by status" from the master at all. **Impact on the banked Approach-B spike:** if the DB is
master but the orchestrator can't read current-state from it, the "thin companion doc" is forced to
carry the enumerated roster — collapsing B toward "the markdown is the real master," the opposite of
the decision's intent. Resolve **before/within** the spike: (a) obtain the plan entitlement, or (b)
accept the companion doc holds the enumerated current-state and the DB is a write-through index, or
(c) keep a small fetch-by-known-page-IDs index the orchestrator can `notion-fetch` row-by-row. Until
one is chosen, "DB is master, roster is downstream mirror" is not operable for a cold boot.

### F15 — Live shepherd traffic contradicts the kickoff's "INI-6 has no live session" (CRITICAL — operational/collision)
The kickoff orientation snapshot + the banked handoff state INI-6 is drivable with **no live session
holding it**. The channels say otherwise *today*: `identity-cutover/_state/outbox.jsonl` has shepherd
writes through 13:21Z with an **open `needs-orchestrator` merge-gate** (WI-867 PR #1700 CI-green +
claude-review APPROVED 0/0/0 — "yours to merge"); `bug-lane/_state/outbox.jsonl` shows **WI-503
bounced a 4th time at 14:06Z** (open `decision`; escalation bug-lane-128/129 unanswered). A cold
orchestrator booting on "drivable, no live session" would collide with a live shepherd and/or
wrongly self-authorize the merge. **Root cause:** the kickoff bakes a *volatile* live-session claim
into *durable* text. Live-session status is **channel-derived, not snapshot-derived** — the
"don't trust the hardcoded snapshot" warning must extend to it, and the orient order must put the
**channel tail FIRST**, before any snapshot/roster read. (The boot only caught this because it tailed
the outboxes; a snapshot-first reader would have missed it.)

### F16 — Protocol + planning-rules hardcode `working/program/program-roster.md`, which here resolves to a template (machinery↔state coupling)
`orchestrator-protocol.md` "Orient on resume" step 1 AND its 🔴 mandatory re-read list AND
`planning-rules.md` "Document map" all name `working/program/program-roster.md` as a required read.
In this deployment the live roster is `_wip/umbrella-program/program-roster.md` (a *deprecated*
downstream mirror), and `_quartet/working/program/` holds only `program-roster.template.md`. A cold
orchestrator following the **machinery literally** reads a template (or nothing). The kickoff
redirects, but the program-agnostic Brain still encodes a program-specific path it claims not to own.
Sharpens F1/F9. Fix: the protocol/planning-rules should refer to "the roster (location is a
working-state binding — see the program kickoff)", not a literal path.

### F17 — Monitor manifest/dashboard live in `_wip/` while monitor-hygiene points at `working/program/`; manifest task-ids are un-keepable across jobs
(a) **Location split:** monitor-hygiene mandates `working/program/monitor-manifest.json`; the live
manifest is `_wip/umbrella-program/monitor-manifest.json`, and `working/program/` has only
`monitor-manifest.template.json`. The kickoff §4 lists the anchor + roster locations but **omits the
manifest location**, so a cold orchestrator running the mandatory reconcile ritual can't find its own
manifest from the kickoff. (b) **Un-keepable task-ids:** monitors are job-scoped (manifest notes "job
cd122717"); a fresh orchestrator in a new job sees none of them in `/tasks`, so the reconcile ritual's
"keep — refresh task-id" branch is **unreachable across a job boundary** — it always resolves to
"replace all," and the recorded task-ids carry no cross-session value. monitor-hygiene should say so
(reconcile after a job change = re-arm all; the manifest's value is the *intent rows*, not the ids).

### F18 — No "observer boot" mode: the reconcile ritual re-arms watchers on lanes the kickoff says to stay arm's-length from
monitor-hygiene + the protocol require, at session-start, a central Cosmo-Stage backstop **plus**
per-active-lane watchers; the kickoff simultaneously says stay arm's-length from in-flight lanes you
weren't asked to drive. For a dogfood/observer boot (or any orchestrator handed only a *subset* of the
program) these conflict — re-arming watchers on identity-cutover/bug-lane means actively monitoring
lanes outside the remit. The Brain assumes the booting orchestrator **owns every active lane**; there
is no scoped/observer boot. Minor but real: the protocol should let the orient scope be a named lane
subset, with monitors armed only for owned lanes.

**Net (boot).** The launcher's *reading* steps are the weak link, not its *reasoning* steps. Two are
CRITICAL: the master DB the kickoff designates is unreadable on this plan (F14 — blocks Approach-B as
written), and a volatile "no live session" claim baked into durable kickoff text is already false and
collision-prone (F15 — fix by making channel-tail the first orient action). F16/F17 are the same
machinery↔state coupling F1 flagged, now confirmed at three more concrete paths (roster, manifest,
dashboard). F18 exposes a missing scoped-boot mode. The delegation mandate / quality carve-out /
four-roles separation all read cleanly — the Brain's *process* is sound; its *path + freshness
bindings* are what a cold boot trips on.
