# Quartet Dogfood / Cleanup Session — Compaction Handoff

**As of 2026-06-30.** This is the **meta / dogfood orchestrator** session (NOT the live program
orchestrator). Purpose: stand up + clean the `_quartet/` system for the **Mentomate Productization**
program, populate the **Initiatives DB**, relocate working state (Option C), and dogfood the
machinery — arm's-length from live execution lanes. Operator = Jorn. Branch = `main` (docs/state-only
own-work committed directly per operator ruling; pushes via the commit skill, non-ff handled with
`pull --no-rebase --no-edit`).

## DECISIONS BANKED
1. **Roster → Initiatives-DB = Approach B (hybrid), confirmed 2026-06-30.** DB owns structured
   current-state + per-initiative page bodies; a **thin markdown companion** (planned:
   `_quartet/working/program/program-notes.md`) holds the irreducible program-level prose (routing/
   intake rule, standing-lane framing, cross-initiative rulings, gate prose). Retire the 75k roster by
   **distilling, not porting**. **Spike scope = start with the prioritized initiatives `INI-6`
   (Identity Cutover) + `INI-32` (Operations)** — NOT the INI-11/INI-1 originally proposed. Test the
   two known gaps: add an `Activate-when` property + try the activation queue as a **DB view**;
   per-initiative narrative → page bodies on demand. **Criterion:** if the companion doc shrinks to
   ~nothing → collapse to DB-only (Approach A); else keep B.
2. (Earlier this session) **Initiatives DB is MASTER** for initiative core data; roster is a downstream
   mirror. **Option C** (relocate working state into `_quartet/working/`, minus INI-6) approved.
   Machinery canonical **only** in the `_quartet/` Brain/Library; `_quartet/_quartet-wip/` holds meta
   artifacts (this file, `findings.md`, `audit.md`).

## DONE THIS SESSION (all committed + pushed to main)
- **Initiatives DB populated:** 15 outcomes; 10 Initiative→Workstream links; **INI-32 Operations**
  (→ WS-22 Bug Lane + WS-25 Review backlog + WS-27 PR cleanup) and **INI-33 App v2** (→ WS-28) created;
  **INI-10 graduated + WS-14 closed** (23/23 WIs verified). (Notion writes; `Spawns` relation is now
  named `Workstream`; `PRG` property deleted.)
- **Option C relocations** into `_quartet/working/lanes/`: Tier-1 `e2630cd`
  (adr-governance-correction, agent-instructions, architecture, errors-api, l10n-a11y,
  security-pii-inngest); Tier-2 `fbb0a3d` (new-llm-integration, security-pii-api, flow-remediation).
  pr-cleanup was already there.
- Deleted stale snapshots `_quartet/working/program/{program-roster.md,dashboard.html}`.
- Created **`_quartet/working/program/orchestrator-kickoff.md`** (program-specific kickoff; fossil-scope
  wording fixed `8f7e5f4`).
- Slimmed `_quartet/dependencies.md` external-work → Cosmo pointer (`ad417ec`).
- Meta-separation: `audit.md` + `findings.md` → `_quartet/_quartet-wip/` + folder README (`95dd232`).
- Corrected roster PRG-02/INI-2 → Parked/Mentomate (`4bdb5b1`).
- Dogfood findings **F6–F13** logged in `_quartet/_quartet-wip/findings.md`.
- Session commits on main: `e2630cd`, `fbb0a3d`, `8f7e5f4`, `ad417ec`, `95dd232`, `4bdb5b1`
  (+ merge commits from non-ff pulls).

## OPEN — NEXT STEPS (priority order)
1. **Run the Approach-B spike** on INI-6 + INI-32 (decision #1 above).
2. **Held operator decisions** (queued behind prep #1, now unblocked after the spike or alongside it):
   - **Continue Identity Cutover (INI-6).** Operator states **NO live session is holding it** — this
     SUPERSEDES the earlier read (from anchor/channel traffic) that a live PRG-06 orchestrator was
     active. INI-6 is drivable.
   - **Spin up the Operations shepherd (INI-32)** — standing lane (bug-lane + review-backlog +
     PR-cleanup workstreams).
3. **Option C relocation remainder** (parallel cleanup, gated; NOT a blocker for new execution):
   `identity-foundation` (needs `AGENTS.md` to quiesce, then repoint `AGENTS.md:207` + memory
   pointers), `bug-lane` (live monitors — coordinate stop/re-arm), `umbrella-program` (roster/
   dashboard/anchor + `rehydrate.sh`; coupled to INI-6 via finding F13).

## KEY IDS
- Initiatives DB `e8bc1bfd-215c-4cd4-a20f-a7b8be91fffe` (ds `284f53e3-0319-47db-b219-0e4f00b8ce09`)
- Workstreams DB `47d8bc5c-e074-4cd9-95bd-ddbb81978bdf` (ds `08b3ab36-709d-44af-b78c-5e9f74f6e745`)
- Work Items DB `f170be9e04ae45d4961828f2438666bd` (ds `36fd1119-9955-4684-8bfe-deb145e6a21f`)
- INI-6 Identity Cutover → WS-18 `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`
- INI-32 Operations → WS-22 `3858bce9-1f7c-8083-905b-d94bca4a4325` (Bug Lane), WS-25
  `38e8bce9-1f7c-8020-bb89-ef4f62321a5c` (Review backlog), WS-27
  `38e8bce9-1f7c-80c7-b212-c6a1d258966b` (PR cleanup)

## CAVEATS
- Shared checkout: commit **own-work only** (never `git add -A`); ~50+ concurrent-session dirty files
  routinely present — leave them.
- Full session context (orientation, inventories, the program-status synthesis) is in the conversation
  being compacted; the durable record is the commits above + `findings.md` + this file.
