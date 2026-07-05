# Fleet retro — 2026-07-05 (operational-stability wind-down)

Operator-ordered drain of both orchestrators (ramtop, orion) after ~48h of
degraded reliability: shepherd stalls, comms loss, monitor deaths,
no-recovery-after-rate-limit, ruling/action backlog buried in session chatter.
Token burn also anomalous (~65% of a Max 20x day in 24h for ~12 WI closes vs
the historical ~2 closes/supervised-hour baseline).

**Process** (owner: program-manager:fable):

- **A — Quiesce.** No new claims. In-flight WIs land or park at a clean
  checkpoint (commit + push branch, outbox note). Then each agent writes its
  findings doc BEFORE shutdown.
- **B — Capture.** One file per agent in this directory, named
  `<host>-<role>-<lane>.md` (e.g. `ramtop-orchestrator.md`,
  `ramtop-shepherd-ws18.md`, `orion-reviewer-ws31.md`), following
  `TEMPLATE.md` exactly. Orchestrators collect docs from any shepherd/reviewer
  session that is already dead by reconstructing from its channel/outbox.
- **C — Triage.** PM consolidates into a findings register + root-cause
  classification + ranked fix list → operator decision pack.
- **D — Refit.** Fix list executed via the ZDX Productization workstreams;
  orchestrator/shepherd priming packets updated.
- **E — Relaunch.** Staged: ramtop first, then orion.

Root-cause hypotheses under test (address them explicitly in your doc's §5):

- H1: rate-limit windows kill sessions and nothing auto-recovers them.
- H2: too many concurrent lanes for the shared token budget (burn spiral:
  wake/probe overhead crowds out work).
- H3: long-running sessions drift from Quartet/Cosmo canon (no respawn or
  re-grounding cadence).
- H4: recent ZDX/Cosmo/Quartet changes (WS-23/24/26/43 deliveries, marketplace
  plugin refreshes) regressed behavior — name the specific behavior change if
  you saw one.
- H5: two orchestrators + shared repo/checkout friction (git identity,
  main-branch races).
