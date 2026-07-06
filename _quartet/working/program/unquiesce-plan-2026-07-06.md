# Unquiesce plan — 2026-07-06

Owner: PM (program-manager:fable). Operator = approval gates. One source of truth for the
quiescence-window work; checkboxes updated as things land. Context: four operator pain points
(role accountability, clacks reliability, reviewer invisibility, Codex token economics) set
priority; end state = both programs relaunched on fixed foundations.

> **Planning mode (operator-ruled 2026-07-06): ROLLING.** This document is a straw-man MAP,
> not a committed program. Commitment is only ever the next 1-2 L1 steps (see COMMITTED NOW);
> everything else is horizon/indicative and expected to change — plenty of unknown unknowns.

## Shape: program-of-programs (operator-ruled 2026-07-06)

Two programs (MentoMate, ZDX) are in the same state — quiesced, each needing a Fable-grade
audit, each with audit-proof known-work that can dispatch in parallel — over a shared enabling
layer (substrate, charters, liveness) both should-depend on. PM (fable) orchestrates all of it.

- **Two parallel Fable audits, different machines, NO stagger** (contention was the only reason
  to stagger; separate machines/auth removes it): Audit A = MentoMate app (ramtop, eduagent
  repo); Audit B = Nexus/ZDX/Cosmo/Quartet system (Lancre/other, nexus repo). Fan-out readers
  (Opus/Sonnet); Fable spent on synthesis + judgment. Operator-spawned from PM-written briefs so
  they outlive PM context. Report to PM over the substrate (lanes `audit-mentomate`,
  `audit-system`).
- **Known-work dispatches today, audit-independent**: limited ZDX hand-back (steps 0-2 +
  pain-ratified builds) via a Quartet team; MentoMate pipeline stays MANUAL (WS-44 → WS-33 →
  feed more if it drains) — NOT under a Quartet team, operator hand-guided.
- **Enabling layer lands DURING the window** (substrate rollout, charters, liveness) so both
  roadmaps arrive to an already-upgraded assembly line.
- **Post-window**: PM synthesizes both audits → two roadmaps → operator rulings → full unquiesce.

## COMMITTED NOW (the only binding part)

1. **Launch both Fable audits** (tracks 9 + 11) — PERISHABLE Fable/Max window (~24h from
   2026-07-06 afternoon). PM writes briefs → operator nod → spawn.
2. **Prepare + dispatch immediate ZDX known-work** (track 6-limited) — restructure workstreams
   (OQ lanes?), spin a Quartet team on the audit-proof slice.
3. Charters (track 2) — PM drafts in the gaps; gate ZDX new-build.

Everything below the line is the map.

---

## 1. Substrate (WI-1263) — Supabase bus + blessed client

- [x] Operator ruling: Option B (Supabase) — 2026-07-06
- [x] Supabase project provisioned; secrets in Infisical `zwizzly-global/prod//quartet`
- [x] Schema `0001_events.sql` applied (append-only events; Realtime on)
- [x] `clacks.py` client built; selftest + heartbeat/alive verified from ramtop
- [x] First decision-log entry written; relaunch packets gain boot-selftest first-act
- [ ] Cross-machine acceptance: selftest PASS from ZDX machine + orion (at their boot)
- [ ] Merge branch `WI-1263-substrate-v1` to nexus main (operator word or hand-back review)
- [ ] v2 enforcement (`0002_rls_v2.sql` per-role JWTs) — scheduled, not now

## 2. Role charters + decision discipline (pain 1)

- [ ] Draft 3 one-page charters: orchestrator, shepherd, reviewer
      (ACCOUNTABLE-FOR outcomes / MANDATE default-act / MUST-ESCALATE exhaustive list)
- [ ] Overlap rule + SLAs + escalation ladder written into charters
- [ ] Decision-log convention documented (log-and-proceed; async ratification;
      rejection → precedent-register entry)
- [ ] Protocols thinned: accountability prose moved out, charter referenced
- [ ] Operator review + ratification of charters
- [ ] Kickoff packets updated: charter ack + first queue-health as boot gate

## 3. Clacks standardization + liveness (pain 2)

- [ ] Migrate lane channels from files to substrate (`clacks send/tail` replaces JSONL)
- [ ] Heartbeat duty in every role kickoff; `clacks alive` = the sign-of-life probe
- [ ] Retire hand-rolled watchers → `clacks watch` as the one sanctioned feed
- [ ] Claim-TTL mandatory on every dispatch (pilot freeze root cause)
- [ ] Update `clacks-channel.md` + monitor-hygiene docs around the client

## 4. Reviewer liveness (pain 3)

- [ ] Capture WI: reviewer one-way heartbeat channel (evidence: WI-1645)
- [ ] Reviewer kickoff updated: boot heartbeat via clacks (write-only; independence kept)
- [ ] Orchestrator probe pattern documented (`clacks alive --author-prefix reviewer:`)

## 5. Codex shepherd protocol (pain 4)

- [ ] Ingest day-2 pilot findings (nexus `e9cb98d` doc) into the runbook/audit inputs
- [ ] Runtime binding covers: attended-only compensation (external wake/scheduler),
      lifecycle I/O centralized in shepherd shell (WI-1647), native-shell worktrees
      (WI-1646), exec-timeout reconciliation (WI-1648), status-turns-non-pausing,
      F35 narrow gate, pipelined refinement
- [ ] Decide: external wake mechanism (substrate Realtime candidate) vs attended-only staffing

## 6. Audit redo → ZDX finish-line roadmap

- [ ] Rescope: add WS-3 + WS-16; fold pilot WIs (1645–1648) + day-2 findings + harvest queue
- [ ] Re-anchor dispositions on the four pains; map every item to a phase or park it
- [ ] Produce roadmap doc (MentoMate-roadmap style) — ZDX productization to the finish line
- [ ] Codex second-opinion pass on the redo
- [ ] Operator review → hand-back ruling

## 7. Relaunch (the unquiesce)

- [ ] Charters + roadmap approved (gate for everything below)
- [ ] Spawn ZDX orchestrator with hand-back package
      (step 0 plugin-clone refresh → re-finalize wave → repairs → first-wave dispatch)
- [ ] ZDX machine: WI-1245 cutover per runbook; boot selftest
- [ ] Spawn ramtop orchestrator (packet ready; incl. WI-1306 finalize)
- [ ] Stable hours → spawn orion (packet ready; plugin-cache check first)
- [ ] WI-1245 finalize (all machines cut over); WI-1263 v1 acceptance complete
- [ ] Team-boot automation (WI-1649) — post-relaunch, kills the 20-min restart tax

## 8. New execution capacity

- [ ] **WI-1562 cloud-executor pilot** (claude.ai/code round-trip, 2-3 coverage WIs;
      operator-ruled: driven FROM RAMTOP by PM) — time-boxed spike, schedule after
      charters land so lifecycle discipline is testable against them
- [x] Hetzner machine provisioned + on tailnet (**Lancre**, `ssh lancre`) — 2026-07-06
- [ ] **WI-1639 Lancre setup to ZAF conventions**: cycle root password, secrets machinery
      (estate-secrets), docs, agent/interactive slice isolation
- [ ] Lancre onboarding to the substrate: resolve `/quartet` secrets, `clacks selftest`,
      `QUARTET_LANE_STATE_ROOT` set (joins the WI-1245/1263 acceptance set)
- [ ] Decide Lancre's first workload (candidate: multi-agent execution host at full-force
      relaunch)

## 9. MentoMate product front (added 2026-07-06 — operator: "UQ is all assembly line, little product")

- [ ] **Deep app audit (Fable window, ~24h — COMMITTED)**: architecture layering (routes/
      services/schemas/Inngest vs documented rules), data model + migration debt, feature
      surface vs PRD (complete/dead/half-wired), LLM pipeline (quality/routing/cost),
      safety/compliance posture, performance hotspots, test economy. Deliverable: on-paper
      optimization roadmap, items pre-shaped to Cosmo grain — restart dispatch picks ONLY
      work expected to survive this audit's triage
- [ ] Operator scope-nod on the audit dimensions above (before launch)
- [ ] MentoMate scoping finalization — OPQ-15 (7 walkthrough rulings, Zuzka) + any sibling
      scope rulings; operator-side, PM folds results into the roadmap

## 11. Nexus/ZDX/Cosmo/Quartet system audit (Audit B, Fable window — COMMITTED)

- [ ] PM writes brief: architecture (Nexus control-plane, repo/workspace layout), Cosmo/ZDX
      data model + lifecycle completeness, Quartet role/protocol/substrate design, tooling debt
      (marketplace CI, plugin-cache class), token economics, the top-down-lifecycle gap (track 10)
- [ ] Operator nod → spawn on Lancre/other machine (nexus repo)
- [ ] Deliverable: system-improvement roadmap, items Cosmo-grain — folds into the ZDX
      finish-line roadmap (track 6) and re-prioritizes the pain-point work

## 10. Top-down lifecycle (PRD→Epic→…→WI) — genuine gap

- [ ] Backlog-check for prior art (Altitude prop / WP / WS exist as nouns; no top-down verbs)
- [ ] Capture WI: define the top-down equivalents of /capture→/review — decomposition
      (PRD→Epic→Feature→WI with linkage), coverage tracing (every PRD clause → items),
      re-decomposition on scope change
- [ ] Note: the app-audit deliverable (track 9) is the first artifact this process should
      ingest — design them together

## Parked / riding along

- **WS-33 Codex shepherd on orion** — operator-ruled next lane, hand-guided (NOT under PM
  hat); kickoff by operator. Pin the V0/V1/V2 nav no-regress constraint in its kickoff.
- OPQ-5 (Doppler prd secrets — one-line operator confirm), OPQ-15 (Zuzka rulings)
- WI-1629 re-finalize → PM's one independent close (pre-authorized)
- Codex pilot expansion beyond WS-44/WS-33 — after WI-1544 gate + charters
