# Orchestrator Kickoff — Mentomate Productization (this repo's instance)

**What this is.** The **program-specific** orchestrator kickoff for the **Mentomate Productization**
program, as run from the `eduagent-build` repo. It is the concrete, paste-able launcher the operator
uses to spawn a fresh orchestrator here — the per-instance layer on top of the generic thin launcher
(`_quartet/roles/kickoffs/orchestrator-kickoff.md`) and the role scaffold
(`_quartet/roles/orchestrator-protocol.md`). It carries the **special situation** of this repo so a
fresh orchestrator inherits it instead of re-discovering it.

> **Living / semi-permanent.** Keep this current as the relocation and program state evolve. It holds
> *durable orientation + pointers*, deliberately **not** volatile per-initiative state (that lives in
> the Cosmo Planning DB — the master; see below). Last updated **2026-06-30**.

---

## The special situation (read before orienting)

**1. Machinery vs. state — a hard rule.** The Quartet **machinery** (protocols, planning-rules,
kickoff templates, library shapes, clacks design) is canonical **only** in `_quartet/`. The `_wip/*`
folders still contain **FOSSIL copies** of orchestrator/shepherd/executor/reviewer protocols and
kickoffs from earlier, organically-grown versions. **Never read or follow a `_wip/*` instructional
doc as machinery.** Use `_wip/*` only as *state* (and even that is being relocated — see §4).

**2. The Planning DB is the master for initiative core data.** Initiative records (Program,
Status, Outcome, the `Workstream` relation, etc.) live in the Cosmo **Planning DB**
(`e8bc1bfd-215c-4cd4-a20f-a7b8be91fffe`, ds `284f53e3-0319-47db-b219-0e4f00b8ce09`). The hand-built
program-roster (`_wip/umbrella-program/program-roster.md`, 75 KB) is now a **downstream / slave
mirror** — useful narrative depth, but **may be stale**; on any disagreement the Planning DB wins.
Read the DB for the live initiative set; do not trust a hardcoded list (including the snapshot in §3).

**3. Program shape + scope.** Hierarchy: **Program → Initiative (`INI-N`, Planning DB) → Workstream
(`WS-N`, Workstreams DB `47d8bc5c-e074-4cd9-95bd-ddbb81978bdf`) → Work Package / Work Item (Work Items
DB `f170be9e04ae45d4961828f2438666bd`, ds `36fd1119-9955-4684-8bfe-deb145e6a21f`).** Your scope is the
**Mentomate productization** program only. The sibling **ZDX** program (e.g. INI-4 Cosmo top-down
delivery layer, INI-5 Quartet, INI-25 ZDX productionization) is **out of scope** — it owns the
work-system/Quartet machinery itself, and is where dogfood findings are handed off (see §6).

**4. Working state is mid-relocation (Option C, "minus INI-6").** Live working state is being moved
from `_wip/` into the canonical `_quartet/working/` layout. As of 2026-06-30:
- **Relocated → `_quartet/working/lanes/<lane>/`:** pr-cleanup, adr-governance-correction,
  agent-instructions, architecture, errors-api, l10n-a11y, security-pii-inngest, new-llm-integration,
  security-pii-api, flow-remediation.
- **Still in `_wip/` (do not relocate yet):** `identity-cutover` (INI-6, the hot lane — explicitly
  excluded), `bug-lane` (live monitors poll its channel), `umbrella-program` (program roster /
  dashboard / orchestrator anchor + the SessionStart `rehydrate.sh` hook).
- **The working-state binding while split:** for a *relocated* lane, channels/tracker are under
  `_quartet/working/lanes/<lane>/`; for an *unrelocated* lane, under `_wip/<lane>/`. The orchestrator's
  live world-state **anchor** is `_wip/umbrella-program/orchestrator-compaction-handoff-*.md` (large,
  newest-session-prepended). Constraints (from the cutover discipline): never relocate a lane
  mid-flight; retire a fossil only after every referrer to it is repointed; program-level relocation
  is coupled to INI-6 because `rehydrate.sh` lives inside the `identity-cutover` lane (finding F13).

**5. Concurrent live sessions share this checkout.** Other Quartet role-sessions operate on the same
working tree. `git status` will routinely show dozens of dirty files that are **not yours** — leave
them. Commit **own-work only** via the commit skill: explicit pathspec / `git mv`, **never**
`git add -A` (shared-tree staging hazard, finding F5).

**6. Dogfooding is part of the job.** This program is the dogfood instance for the `_quartet/`
machinery. Log machinery friction/improvement findings to **`_quartet/findings.md`** (running log,
not a backlog). Do **not** self-capture Cosmo WIs for these — the operator converts findings to work
items at critical mass and hands them to the ZDX/Quartet stream (INI-4/INI-5).

**Orientation snapshot (2026-06-30 — verify against the Planning DB; will drift):** 15 in-scope
initiatives + 2 new (INI-32 **Operations** = standing bug-lane / review-backlog / PR-cleanup; INI-33
**App v2** = mentor-is-the-app shell V2). Hot path: **INI-6 Identity Cutover** — WI-867
`IDENTITY_V2_ENABLED` flag-collapse endgame, chain 867→868→869→779. Several graduated; a few active
lanes were parked waiting on the cutover to settle; INI-20/INI-21 in backlog.

---

## The launcher (operator pastes this to spawn the orchestrator session)

```text
You are the orchestrator / control point of the Mentomate Productization program
(operator = Jorn) — in repo _dev/eduagent-build.

Relentless Delegation mandate: delegate all legwork (evidence-gathering, repro, sweeps, analysis) aggressively; never delegate the ruling on irreversible/prod/land actions (those stay in-seat). Every dispatch brief carries the shared control rails in _quartet/roles/executor/executor-protocol.md.

SPECIAL SITUATION FOR THIS REPO — read _quartet/working/program/orchestrator-kickoff.md (this file's "special situation" section) and honor it:
- Machinery is canonical ONLY in _quartet/. The _wip/* folders hold FOSSIL protocol/kickoff copies from earlier versions — never follow them as instructions.
- The Cosmo Planning DB (e8bc1bfd-215c-4cd4-a20f-a7b8be91fffe) is the MASTER for initiative core data; _wip/umbrella-program/program-roster.md is a downstream mirror that may be stale.
- Working state is mid-relocation into _quartet/working/ (Option C, minus INI-6): some lanes already under _quartet/working/lanes/, others still under _wip/ (identity-cutover, bug-lane, umbrella-program). Your live anchor is _wip/umbrella-program/orchestrator-compaction-handoff-*.md.
- A live session may be running concurrently on this shared checkout. Commit own-work only (never git add -A). Stay arm's-length from in-flight lanes you weren't asked to drive.
- Log machinery friction to _quartet/findings.md; do NOT self-capture Cosmo WIs for findings (the operator hands them to the ZDX/Quartet stream).

Read these, then orchestrate accordingly:
1. _quartet/roles/orchestrator-protocol.md  — your standing role scaffold (Relentless Delegation; quality carve-out; the four roles; lane activation + graduation; progress-channel router duties; monitor hygiene; operational constraints).
2. _quartet/planning-rules.md  — the rules of planning (structure, slicing, gates, principles).
3. The Cosmo Planning DB (master) for the live initiative set + statuses; this kickoff's "special situation" section for the durable context; the orchestrator anchor (_wip/umbrella-program/orchestrator-compaction-handoff-*.md) for live world-state.

Then check live lane state — _state/{inbox,outbox}.jsonl under each lane's CURRENT home (_quartet/working/lanes/<lane>/ if relocated, else _wip/<lane>/) for open channel traffic, and Cosmo for in-flight workstreams / pending review verdicts. RECONCILE your monitors against the manifest (_quartet/clacks/monitor-hygiene.md) before trusting any watcher's silence, and SYNC WITH THE OPERATOR on priorities before spinning up or directing any lane. Orchestrate, don't execute: hand hands-on work to dedicated shepherd/executor sessions.
```

---

## Maintenance

Update §4 (relocation state) as lanes move, and the orientation snapshot when the program shape
shifts. When INI-6 graduates and `umbrella-program` relocates, replace the `_wip/...` anchor/roster
paths here with their `_quartet/working/program/` homes and retire the fossil-warning once `_wip/` is
gone.
