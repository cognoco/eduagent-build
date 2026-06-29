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

**Net.** Approach-D Wave 1 holds: Brain + live Working state produce one coherent picture; the hook's
channel-tail covers anchor lag. F1 is not a cutover bug — it's the inherent working-state seam,
currently closed only by the hook. Deciding its durable home is the real Wave-1 → Wave-2 graduation
question.

> Full session friction log (scratch, ephemeral): the orchestrator's
> `scratchpad/quartet-dogfood-friction-log.md` from this run.
