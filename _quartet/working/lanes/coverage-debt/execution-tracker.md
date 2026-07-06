# Coverage Debt — Execution Tracker

> The lane's substance. The shepherd protocol (`../../../roles/shepherd-protocol.md`) carries process
> only and points here for specifics. **Disposable by construction** — a fresh shepherd pointed at
> this tracker loses nothing but warm cache. One fact, one home: this holds *delivery state*; it
> points at the rules (`planning-rules.md`), the roster (`library/program-roster.md`), and live
> per-WI state (Cosmo) — never duplicates them.

## Charter
Burn down the audited test-coverage debt (WI-1401..1414) to Cosmo Close: real tests over the
named gaps (mobile screens/hooks, API routes, e2e flows), never coverage theatre. **Not
launch-gating** — this lane yields to ship-work reprioritization if the operator signals it.

## Canon authority
- Repo `AGENTS.md` — especially **Tests Must Reflect Reality** (never weaken a test to pass; no
  internal mocks — GC1 ratchet + GC6 boy-scout), Required Validation, Code Quality Guards.
- `docs/change-classes.md` — run-what-CI-runs per change class before push.
- Lane review invariant: **a test that doesn't exercise real behavior is rework**, even if green.
  Device-dependent assertions (Maestro/e2e) that cannot run in the executor environment are
  declared as such in the WI's verification evidence — never faked, never silently skipped.

## How to use
Fresh shepherd: all 13 in-scope items sit at Stage=Captured — you own the full pipeline
(triage → refine to DoR → set Workstream Order → dispatch executors → drive to Reviewing; a
separate reviewer closes). Start by triaging the P2 set. This is the **Quartet-on-Codex pilot**
lane: you are Codex-hosted — log runtime-fit findings (see Codex-pilot meta-duty below).

## Pointers
- Ratified plan: none — the slice comes from the 2026-06/07 coverage audit; each WI's Description
  field carries its own gap analysis (Cosmo is the source).
- Cosmo Workstream: WS-44 · `3938bce9-1f7c-81ad-add6-f36bf7c317bc` (Status=Open, Host=orion)
- Work Items DB (data source): `36fd1119-9955-4684-8bfe-deb145e6a21f` (repo `zdx-config.yaml`)
- Satellite register(s): none
- Substrate operating rules: `../../../planning-rules.md`

## Units / slice
| WI | Altitude | Priority | Coarse status | Workstream Order |
|---|---|---|---|---|
| WI-1402 | Item | P2 | captured | unset |
| WI-1403 | Item | P2 | captured | unset |
| WI-1405 | Item | P2 | captured | unset |
| WI-1407 | Item | P2 | captured | unset |
| WI-1408 | Item | P2 | captured | unset |
| WI-1409 | Item | P2 | captured | unset |
| WI-1410 | Item | P2 | captured | unset |
| WI-1413 | Item | P2 | captured | unset |
| WI-1401 | Item | P3 | captured | unset |
| WI-1404 | Item | P3 | captured | unset |
| WI-1411 | Item | P3 | captured | unset |
| WI-1412 | Item | P3 | captured | unset |
| WI-1414 | Item | P3 | captured | unset |

Slice scan: 13 direct Items, no Work Package (WP-child formality waived for this workstream —
dogfood). **WI-1562 (cloud-executor pilot) is IN the workstream but OUT of this lane's claim
set** — operator-ruled (2026-07-04) to be driven from Ramtop; this lane only supplies 2–3
code-only guinea-pig items on request, coordinated through the orchestrator. Never claim or
dispatch WI-1562. WI-1406 does not exist in this workstream (numbering gap, not a missing item).

`Workstream Order` is unset on all items — **shepherd sets it during triage** (×100 spacing:
100, 200, 300…), P2 wave before P3 unless triage finds a better edge.

## Sequence
No Blocked-by edges exist. Suggested (non-binding): P2 wave first; within P2, prefer
safety/consent-adjacent items (WI-1407 consent gates, WI-1405 billing) early since they carry the
highest miss-cost; e2e-flavored items (WI-1401 Maestro yamls, parts of WI-1408/1411/1412) last —
they have a device/emulator dependency that constrains executor verification.

## Supervision / escalations
- **WI-1405 (billing v2)** and **WI-1407 (consent/minor gates)** touch money/minors surfaces —
  top-tier plan-phase scrutiny; review with extra care.
- **Device-dependent items (WI-1401, e2e parts of 1408/1411/1412):** headless Codex executors
  cannot run Maestro on an emulator. Split ACs at refine time into (a) code-level tests the
  executor proves and (b) device-run assertions marked verify-at-e2e-run. Do not let an executor
  claim device evidence it cannot produce.
- No destructive steps expected (test-only lane); any WI whose fix requires touching product code
  beyond tests escalates to the orchestrator (`needs-orchestrator`) before dispatch.

## Codex-pilot meta-duty (this lane is the Quartet-on-Codex dogfood)
The shepherd is Codex-hosted — a deliberate pilot. Adapt the shepherd protocol's harness
mechanics per `../../../roles/runtime-bindings/codex.md` and play to Codex strengths; the
lane-driving contract (pipeline custodianship, Gate-1 discipline, Clacks single-writer, Cosmo
lifecycle) is unchanged. **Log every runtime-fit finding** — protocol steps that don't map, tool
friction, things Codex does better — as `decision`-level outbox lines prefixed `[codex-pilot]`
and a short running list in this tracker. The orchestrator harvests these into ZDX/Cosmo/Quartet
improvement WIs (backlog-checked first).

## Current position (2026-07-06 ~14:15Z)
**AUTONOMOUS ROLLING PIPE** (operator grant, coverage-debt-034): shepherd executes the whole
workstream at own capacity/parallelism; supervision is with the orchestrator. F35 landing gate
remains orchestrator-side: shepherd opens PRs and signals `needs-orchestrator`; shepherd runs
`/cosmo:execute complete` only after `[orch-land]` returns the squash SHA.

- **Closed (Done):** WI-1407 (`8b6dd54f3`), WI-1405 (`093dffc28`), WI-1411
  (`1c26b288`), WI-1412 (`53e5fe22`), WI-1414 (`f37d90f2`).
- **Open PR / awaiting orchestrator land:** WI-1403 PR #1945 (green, Claude APPROVED,
  merge clean), WI-1404 PR #1942 (green after GC1 fix, Claude APPROVED, merge clean),
  WI-1413 PR #1947 (Claude APPROVED; only red is known WI-1654 family-v2 row-order flake),
  WI-1408 PR #1948 (Claude APPROVED; checks green, waiting for GitHub workflow rollup).
- **Executing but held on production-code approval:** WI-1410 and WI-1409 both uncovered real
  product-code fixes; worktrees contain verified changes, but shepherd stopped before commit/PR
  and escalated `needs-orchestrator` for re-scope approval.
- **Ready / intentionally held:** WI-1402 is Ready but held until WI-1403 settles because both
  touch the `/now` integration surface.
- **Parked by orchestrator:** WI-1401 code landed (`25cb08871`); AC6 device-evidence leg was
  parked into WI-1655. Do not keep working WI-1401 unless orchestrator reopens it.
- **New captured bug now refined but not dispatchable:** WI-1654 was triaged/refined to
  Refining as a P2 Bug for unordered `listFamilyMembersV2`; production billing-v2 change means
  execution requires orchestrator re-scope/approval.
- **Excluded:** WI-1562 remains out of this lane's claim set; never claim.
- **Out-of-charter boundary:** CI infra bugs WI-1651/WI-1652 remain out of WS-44. Do not fix them
  under this lane.

## Launch gate
Ungated — released at activation (operator instruction 2026-07-05). Not launch-gating; yield to
launch work on operator reprioritization.

## Change log
- 2026-07-05 — Lane activated. WS-44 confirmed (14 members: 13 in-scope + WI-1562 Ramtop-driven
  pilot, excluded). Channels + monitors provisioned. Kickoffs authored (Codex shepherd; Claude
  Code reviewer, WS-44-only scope). Awaiting shepherd spawn.
- 2026-07-05 — Shepherd + reviewer spawned; P2 wave + 5 P3s triaged→refined. **WI-1407 (consent)
  executed and CLOSED (Done, 22:00Z)** — PR #1939 orchestrator-merged to main (`8b6dd54f3`) on the
  F35 rhythm after a not-landed rework bounce; first pipeline-proven cycle. Adopted F35 landing
  convention for WS-44. Three `[codex-pilot]` runtime findings logged → worktree MSYS gap captured
  **WI-1646**; exec-sandbox-can't-reach-Notion-REST + codex-exec-1h-timeout in the harvest queue
  (backlog-check running). Notion-Version-pin finding found already covered by closed WI-75. F35
  merge-authority remains an open fleet question (WI-1585); WS-44 runs the orion self-authorize
  posture pending any operator override.
