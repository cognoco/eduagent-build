# Repo Findings — Mentomate Productization program state

Findings about **this deployment's** state — the Option-C relocation mess, environment bindings, and
cleanup items surfaced while dogfooding. These are **not** Quartet-machinery defects (those live in
`quartet-findings.md`); they are program work — the operator's clean-up-to-standard trail. Most vanish
once the relocation completes. IDs are the originals from the merged log (so cross-references hold).

---

### F4 — Wave 1 (cutover repoint) is synthetically verified, not yet live-proven
The 06-29 orient forced the rehydration hook with a synthetic SessionStart; the live PRG-06 session
likely oriented off PRE-repoint `_wip/` Brain paths. Wave 1 is **armed + dry-run + synthetic-orient
verified**, but its first genuine exercise is the next real orchestrator resume. Honesty flag, not a
defect.

### F8 — The machinery-cutover plan lives in the legacy tree being cut over
The plan governing relocation of `_wip/*` state into `_quartet/` (`quartet-cutover-plan.md` +
`quartet-cutover-wave1.md`) sits in `_wip/umbrella-program/`. A session told to operate "only off
`_quartet/`" cannot discover the cutover is planned/underway — it would re-derive it. The plan is
per-program state, but its **existence pointer** belongs in `_quartet/` (a working-program note) so the
canonical Brain can find its own migration status. Resolves as relocation completes.

### F9 — No breadcrumb from `_quartet/` to the live `_wip/` working state
A human-oriented session pointed at `_quartet/` has no pointer to where the live program actually lives
(`_wip/umbrella-program/`). This gap exists **only** because state is exiled in `_wip/` — the default
home is `_quartet/working/`. Machinery kernel = `quartet-findings.md` **F1/F16** (kickoff owns the
location binding). Resolves when relocation completes.

### F12 — The `_wip/` cutover plan permanently bifurcates the working-state home
The cutover plan decided (a) legacy program state (roster, dashboard, channels, existing lanes) is
**Class C — stays in `_wip/` indefinitely**; (b) new lanes stand up greenfield in
`_quartet/working/lanes/`. Net: *where a lane's state lives is keyed on its birth-date* — pre-cutover
in `_wip/`, post-cutover in `_quartet/working/`, forever — so "the storage standard" and "where this
program's state actually lives" permanently disagree. The plan **parked** the end-state home ("a
deployment decision"); the operator's 2026-06-30 "clean up to the standard location" request is the
ruling on that parked question — an **operator decision**, not an orchestrator ruling, and not a
reversal of canon.

### F13 — Program-level rehydration hook is nested inside one lane's `_state/`
`rehydrate.sh` (globs the anchor + names roster/channel paths on every role's SessionStart) lives at
`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh` — inside a single lane. Consequence: the
program-level working-state move can't proceed independently of that one hot lane (editing a hook it
owns), so the whole-program cutover is hostage to INI-6's lifecycle. Growth accident = state; the
machinery residue (Library should define a hook home) = `quartet-findings.md` **F13-residue**.

### F14 — Bulk-query of the Initiatives DB is plan-gated (environment binding)
The DB reads **fine per-page** via `notion-fetch` (verified INI-6 returns all props). Only the
*bulk-query* MCP tools (`query_data_sources`, `query_database_view`) require Notion Business + AI —
an estate/environment binding, not a Quartet defect. Enumeration workaround: `notion-search`
(lossy/capped) or a maintained page-ID index. **Approach-B is not blocked and needs no plan upgrade.**

### F15 — Clacks outboxes left escalations reading "open" after out-of-band resolution
On 06-30 the identity-cutover / bug-lane outboxes still showed an open `needs-orchestrator` merge-gate
(WI-867) and a `decision` (WI-503) **after** WI-867 had merged + closed and both sessions had ended —
because the dead sessions never emitted their closing `ref`-tagged `decision`s. The machinery's closure
discipline **exists and is correct** (`progress-channel-design.md` §"the closed loop"; Cosmo-Stage owns
lifecycle) — this is dead sessions leaving stale channels = program hygiene, not a machinery gap.
Operating rule for readers (already in monitor-hygiene): Cosmo-verify any channel signal before acting;
**recency ≠ live session, content ≠ open issue.** (State as of 07-01: WI-867 merged+closed; WI-503
orphaned — awaiting a HUMAN confirmation, no agent owner.)
