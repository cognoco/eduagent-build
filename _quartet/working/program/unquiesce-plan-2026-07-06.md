# Unquiesce plan — 2026-07-06

Owner: PM (program-manager:fable). Operator = approval gates. One source of truth for the
quiescence-window work; checkboxes updated as things land. Context: four operator pain points
(role accountability, clacks reliability, reviewer invisibility, Codex token economics) set
priority; end state = both programs relaunched on fixed foundations.

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

## Parked / riding along

- OPQ-5 (Doppler prd secrets — one-line operator confirm), OPQ-15 (Zuzka rulings)
- WI-1629 re-finalize → PM's one independent close (pre-authorized)
- Codex pilot expansion beyond WS-44 — after WI-1544 gate + charters
