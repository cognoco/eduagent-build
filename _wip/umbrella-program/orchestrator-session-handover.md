# Orchestrator Session Handover — 2026-06-15

**Purpose.** Live session state for a post-compaction orchestrator. Standing role =
`orchestrator-protocol.md`; this captures the *current* state on top of it. On resume read
this + `program-roster.md` + the active lane tracker (`_wip/identity-cutover/execution-tracker.md`).

## Vocabulary (decided this session — committed `bf97332b9`, pushed)
- The four-role structure is the **Quartet** (orchestrator / shepherd / executor / reviewer).
  The comms layer is the **Clacks** (`_state/{inbox,outbox}.jsonl` + Cosmo-Stage signaling +
  the Monitor watchers). Stack: **ZDX → Cosmo → Clacks → Quartet**. Written across the 6
  scaffolds + `planning-reference.md` + `program-roster.md`.
- **Workstream Order = ×100 spacing** (100, 200, …), in shepherd + orchestrator protocols.

## Active lane: PRG-06 "Identity Cutover" (WS-18)
- Shepherd running (operator-launched). Reviewer = the extended `review-watcher-v3.ts` session
  (out-of-band; already covers WS-18, empty overrides).
- **Armed monitors (this session — survive compaction; RE-ARM after any reboot/session-end):**
  - Outbox watcher `blv20hye5` → `_wip/identity-cutover/_state/outbox.jsonl`.
  - WS-18 Cosmo Stage monitor `b1fprdcll` → durable script
    `_wip/umbrella-program/orch-stage-monitor.sh` (poll 120s).
- **Channel:** inbox `ic-orch-001..007`; outbox `prg06ic-001..009`.
- **Progress:** WP-1 (765) + WP-2 (771) / WP-3 (772) / WP-4 (773) / WP-8 (777) **Closed**;
  WP-5 (774) / WP-6 (775) / WP-7 (776) / WP-9 (778) **building**; **not started:** WP-FLAG (779),
  WI-586 (terminal data half), WI-780 (consent RLS), WI-631/632 (provenance).
- **WP-FLAG (779) is GATED** (`ic-orch-005`): before the flip, every in-flight grace-period /
  multi-day flow spanning the flip must be **mode-pinned** (primary mitigation) or drained;
  sibling audit (scheduled exports / grace-period+trial billing / Inngest pending-decisions) +
  regression tests. GDPR/COPPA hazard (caught in WP-4 review).
- **WI-586 (terminal data half) carries forced preconditions:** (i) the in-flight-op mode-pinning
  + audit above; (ii) **rehome `quotaPools` + `profileQuotaUsage` FKs to the v2 subscription table
  BEFORE the legacy `subscriptions` DROP** (`ic-orch-009`; can't drop a referenced FK-target) —
  shepherd bakes into WI-586 AC, as a dedicated billing-schema WP or in-WI-586 scope (its call).

## Decisions (D1 + D2 both ruled)
- **D2 — RULED → option (a), Quartet-scoped** (relayed `ic-orch-008`). Executors must assert
  `git -C <worktree>` resolves to their own worktree before `/commit` (refuse if it's the shared
  main tree). Shepherd enforces in dispatch briefs now. **TODO post-compaction:** add this
  requirement to `executor-protocol.md`. *(The general fix — harden the `/commit` skill itself so
  no agent can mis-target — is a separate estate-level follow-up, deferred.)*
- **D1 — RULED → LEAVE `6def49340`** (relayed `ic-orch-007`); content is benign `_wip`.

## Open threads / TODOs (do NOT drop)
- **WI-770** (review-skill enhancement: precise greenness / flake lane / scoped DoD overrides)
  = **PRG-05** handover, parked; do NOT execute here (fully captured on its Cosmo page).
- **Reviewer meta-eye** observation-capture = Quartet machinery → belongs in
  `reviewer-kickoff-template.md` + the watcher, NOT the generic `/cosmo:review` skill. Not built.
- **Meta-eye productionization** (per-role observation logs + orchestrator harvest-at-graduation)
  — designed, not built.
- **Thrash trigger** (Nth rework on a WI → `needs-orchestrator`) — approved for the NEXT shepherd
  scaffold; not yet added to `shepherd-protocol.md` (leave the live WS-18 shepherd as-is).
- **gitignore `_wip/*/_state/*.jsonl`** — channel files got git-tracked in the incident; cleanup
  suggested, not done.
- **Dashboard regen** (`dashboard.html`) — stale.

## Standing constraints (operator-set)
- **Canon wins** over S0-S6; S0-S6 not canonical. ADRs 20/21/22 cleanup done → now trusted.
- **Reviewer is context-agnostic** — lane-specific review context lives on the **WI** (its
  Acceptance Criteria), never in the reviewer prompt or the outbox.
- **S4-S6** (nav-shell) stays a **separate track** from PRG-06 (operator owns its disposition);
  after PRG-06 it needs canon-realign + rebase onto the delivered V2 contracts.
- Orchestrator **routes/captures** cross-initiative work as handover; does not execute it in-lane.
