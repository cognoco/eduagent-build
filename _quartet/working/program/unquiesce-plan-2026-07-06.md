# Unquiesce plan — umbrella (rewritten 2026-07-07)

Owner: PM (program-manager:fable). Operator = approval gates. **This is now a 1-page umbrella**
(operator-approved rewrite, 2026-07-07): the two audit roadmaps are the work plans; this file
keeps only what lives nowhere else. Original 11-track map: `git log` this file (superseded
2026-07-07; tracks discharged into the roadmaps).

## The three live documents

| Document | What it plans | Consumer |
|---|---|---|
| **`audits-2026-07-06/ROADMAP-A-mentomate.md`** | the PRODUCT (MentoMate): Phase-0 decision-gated → restart-safe → ratified-13 → trust package → fast-follow | MentoMate pipeline (WS-44 → WS-33, operator-guided) |
| **`audits-2026-07-06/ROADMAP-B-zdx-finish-line.md`** | the ASSEMBLY LINE (ZDX/Cosmo/Quartet): Wave 1 known-work → liveness → substrate → Codex → charters → top-down verbs | ZDX Quartet teams (WS-45 executing Wave 1) |
| this file | relaunch choreography + new capacity — nothing else | PM + operator |

`audits-2026-07-06/SEAM.md`: no Roadmap-B item gates Roadmap A while MentoMate stays
operator-guided; the gate set {B-17, B-30, B-31, B-35, charters} arms only if MentoMate goes
under a Quartet team. FINDINGS-A/B = raw audit evidence, reference only. Decisions: substrate
`program` lane decision log (events 27-32 so far) + `precedent-register.md`.

## Ruled and running (no longer planned here)

Substrate v1 shipped (WI-1263) · charters RATIFIED 2026-07-07, WIP N=4 (landing = WI-1670) ·
B-01 wake ruled (c) tight inc-1 · B-12 checkout ruled (a′) + worktree hygiene (WI-1671/1672) ·
B-34 judge carve-out · WP-span policy · WS-45 live on Surface (15+ items) · Wave 6 captured
(WI-1674/1675 + Epic WI-1676) · OPQ-15 walkthrough closed (7 rulings, ⚠ items co-signed
2026-07-06/07).

## Relaunch choreography (the only work still planned HERE)

- [ ] WI-1670 charters landed (protocol thinning + kickoff charter-ack gates) — precondition
      for spawning on the new charters
- [ ] Spawn ZDX orchestrator with hand-back package
      (step 0 plugin-clone refresh → re-finalize wave → repairs → first-wave dispatch)
      — *note: WS-45 team on Surface already runs the wave-1 slice; this is the full relaunch*
- [ ] ZDX machine: WI-1245 cutover per runbook; boot selftest
- [ ] Spawn ramtop orchestrator (packet ready; incl. WI-1306 finalize)
- [ ] Stable hours → spawn orion (packet ready; plugin-cache check first)
- [ ] WI-1245 finalize (all machines cut over); WI-1263 v1 acceptance complete
      (cross-machine selftests: ramtop ✓, Lancre ✓; ZDX machine + orion at their boot);
      merge branch `WI-1263-substrate-v1` to nexus main (operator word or hand-back review)
- [ ] Team-boot automation (WI-1649) — post-relaunch, kills the 20-min restart tax

## New capacity

- [x] Lancre provisioned + on tailnet (`ssh lancre`) — 2026-07-06
- [ ] WI-1639 Lancre setup to ZAF conventions (root-password cycle, estate-secrets, docs,
      slice isolation) — carries the B-13 Linux secrets-helper port + ADR-0011 amendment
- [ ] Lancre substrate onboarding (`/quartet` secrets, selftest, `QUARTET_LANE_STATE_ROOT`)
- [ ] Decide Lancre's first workload (candidate: multi-agent execution host — NEX-ADR from
      WI-1671 should land first, per the B-12 ruling)
- [ ] WI-1562 cloud-executor pilot (driven from ramtop by PM) — after charters land, so
      lifecycle discipline is testable against them

## Operator-side riding along

OPQ-5 (Doppler prd secrets) · OPQ-20 (marketplace branch protection) · WS-33 Codex shepherd on
orion (operator-guided, NOT under PM hat; pin V0/V1/V2 nav no-regress in kickoff) · WI-1629
re-finalize (PM's pre-authorized close).
