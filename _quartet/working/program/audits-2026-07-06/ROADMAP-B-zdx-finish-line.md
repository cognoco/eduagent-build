# ROADMAP B — ZDX finish-line

**Synthesized:** 2026-07-06 · PM (program-manager:fable) · **Input:** FINDINGS-B (40 findings, zero P0). Anchored on the **four operator pains**: role accountability · clacks reliability · reviewer invisibility · Codex/token economics.

**Headline.** The Cosmo/ZDX bottom-up model, Nexus control-plane, and secrets architecture are sound and ADR-backed. The finish-line work is not new machinery — it's **arming what's already designed** (the liveness ladder is prose-complete, unarmed), **closing formula holes** that produced the week's live incidents, and **absorbing the Codex-pilot evidence** the runtime binding never ingested. Ten of the 40 findings had no Cosmo row at all — the enabling layer's worst debt was living outside the work system.

> **Consumer:** the ZDX/Quartet enabling layer. Feeds WS-45 (wave 1, already dispatching) + track-2 charters + the four-pain work. Folds the day-2 pilot findings and the 62-item draft audit (agreements sharpened; WI-1312/1332/1263 dispositions upgraded).

---

## Wave 1 — Known-work, dispatch-ready NOW (track-6 hand-back / WS-45)

No design ruling needed. Items already in WS-45 marked ✓.

| Item | What | Pain | Grain | Eff |
|------|------|------|-------|-----|
| B-29a | **Marketplace branch protection** — require existing `test`+`lint` on main | all | **operator action → OPQ-20 (filed)** | XS |
| B-17 | Validity clauses: `empty(Stage)→❌`, `Executing∧empty(Claimed At)→❌` + sweep reaps expiry-empty zombies | role | **WI-1332 + WI-1312 ✓ (in WS-45)** — promoted first-wave | S |
| B-02 | clacks client `return=minimal` on heartbeat (v2 RLS breaks reviewer heartbeat otherwise) | reviewer | fold into WI-1263 | S |
| B-30 | plugin-version preflight in `/cosmo:*` (warn when loaded ≠ marketplace latest) | clacks | 1 WI | S |
| B-18 | conformance-rule normalization: `Assisted` exec-path + 9 stages across 4 surfaces | — | 1 WI | S |
| B-31 | `complete --validate` trip-wire false-positives (contextual-URL SHA, prose test-claim) + negative-test corpus | — | 1 WI | S |
| — | **WS-45 completion wave** WI-1634/1630/1629/1605/1356/1297 ✓ | — | in flight | — |
| — | **WS-45 builds+guards** WI-1264/851/1159/1332/1312 ✓ (+ WI-1158 pulled in, ord 89) | — | in flight | — |

---

## Wave 2 — Liveness arming + reviewer visibility (pains 1 + 3)

The systemic finding: the ladder is **designed but not armed** (canon self-admits in 3 places) — the root behind the 8h freeze and every dead-lane hour.

| Item | What | Grain | Eff |
|------|------|-------|-----|
| B-35 | Arm the ladder: (1) L1 live-armed on a real lane + recorded; (2) watchdog registration = bootstrap/relaunch-packet step, not operator-optional; (3) macOS watchdog port validated (WI-1621); (4) reviewer added to ladder | WI-1614/1621/1236 + umbrella AC "every relaunch packet arms every layer" | S×4 |
| B-09 | Reviewer one-way heartbeat (write-only `reviewer:*`, kind=heartbeat; orchestrator probes `alive --author-prefix reviewer:`) — **B-02 must land first** | UQ §4 capture-WI, scoped by D4 | M |
| B-07 | `review-watcher.ts` writes no L0 heartbeat → watchdog can't relaunch it → silent Reviewing freeze; fold heartbeat into its poll tick | 1 WI | S |
| B-20 | Durable role-of-record: land WI-1635 (Executed-By) + add `Reviewed By/At` same schema pass; author **ZDX-ADR-0011** (review-leg identity — reserved, unwritten) as charters' data-model counterpart | WI-1635 + 1 WI + ADR | M |
| B-10/B-11 | pin canonical reviewer shape (interactive vs `review-watcher.ts`); cite WI-1645 where the fix lands | doc riders | S |

---

## Wave 3 — Substrate v1.1 + wake (pains 2 + 4) — has a DECISION-GATE

WI-1263 v1 shipped (Option B). Live scope is a v1.1 WP. **B-01 carries the program's biggest open fork.**

| Item | What | Grain | Eff |
|------|------|-------|-----|
| **B-01 ✓RULED** | **(c) hybrid-sequenced (operator, 2026-07-06; substrate decision event 28).** Increment 1 TIGHT: one subscriber per host (Ramtop first); wake actions = per-lane activity-file touch + tmux `claude --resume` nudge (OPQ-14 shape); registers with existing L0 watchdog; success = poll cadence to ≥15-min fallback + <10s wake demo. **OUT of inc-1:** Codex self-wake (attended-only stands), multi-host, dispatch logic, schema changes, watcher retirement (B-03 governs). Inc-2 = Codex self-wake, after inc-1 proven | WI-1263 v1.1 "wake subscriber inc-1" | S-M |
| B-03 | Retirement map — "retire all watchers" is **wrong as written**; substrate subsumes only mailboxes/heartbeats/decision-log. Cosmo-stage polling, lease state-machine, watchdog, review-spawn **must survive**. Write the map into the rollout plan | 1 design WI + 1 build WI | S+M |
| B-05 | Substrate drops the file channel's typed envelope (level/type/ref) — port `validate-channel-envelope.js` semantics into `body` contract before migrating lanes | fold into lane-migration WI | S |
| B-04 | v2 JWT minting/distribution tooling (mint script, Infisical `/quartet/roles/*`, rotation) — single-writer-as-policy is unscheduled without it | 1 WI | M |
| — | **then** apply `0002_rls_v2.sql` (after B-02 + B-04) | rider | S |
| B-08 | substrate small gaps: cursor-theft, `alive` author-filter, ack convention, retention policy, `.perID-seen` spec | bundle | S |

---

## Wave 4 — Codex / token economics (pain 4)

The pilot proved the quality case; the binding absorbed **none** of the seven findings.

| Item | What | Grain | Eff |
|------|------|-------|-----|
| B-24 | One binding revision folding all 7 pilot findings; **attended-only fork made explicit** (= B-01's wake vs policy-restrict Codex to attended windows) | 1 WI + B-01's | M |
| B-38 | Three missing invariant lines: status-turns-non-pausing · merge-hold scoped to merge act only · within-lane refinement pipelining — land in shepherd charter + mirror in Codex binding | 1 WI (harvest consolidation) | S |
| B-26 | Adaptive cadence (WI-1602, Tier-A, unbuilt) — even coarse active/idle tiers + per-lane token telemetry to make the burn measurable | WI-1602 + telemetry WI | M |
| B-27 | **Reframe:** next Codexification win is NOT another interactive role — move monitor/poll duties off agent turns (scripts + substrate wake). De-burns Claude without Codex self-wake | assessment → feeds B-01 design | — |
| B-25 | Canon's "MCP loss = degraded, never stoppage" is **false inside `codex exec`** — scope the guarantee to non-sandboxed runtimes; document lifecycle-I/O-in-shepherd-shell | codex.md doc fix | S |
| B-34 | `claude -p` veto has a silent violation path in `judge.ts` fallback — fail loud or get exception ruling (settles the WI-1282/1284/1295 trio) | 1 WI | S |

---

## Wave 5 — Charters + role accountability (pain 1) — GATES new-build

Track 2 is committed. The audit scopes it so charters **dissolve the muddle**, not just reformat prose.

| Item | What | Grain | Eff |
|------|------|-------|-----|
| B-36 | The queue muddle is **one sentence** (shepherd-protocol L52 entangles refine + pick-up) + no WIP policy at lane grain. Charter: dispatch trigger + WIP-limited parallel dispatch → **shepherd**; orchestrator keeps gate/exception authority; fold WI-1526 duty spec in | rides track-2 + WI-1526 (first-wave) | S once charters exist |
| B-37 | Charter split validated — **keep the incident-scar one-liners** with their WI citations (they're anti-rationalization accountability, not mechanics); only procedure → protocols | track-2 drafting | M |
| B-39 | Protocol-rollout mechanized: version stamp + changelog per canon doc; PM = rollout owner; high-impact changes → substrate `decision` broadcast + positive-ack | 1 WI + canon line | S-M |
| B-15 | Cross-machine version-skew has no signal — stamp repo HEAD + plugin version into heartbeats; respawn-boundary release rule as canon | 1 WI + canon line | S |
| B-12 | Root-repo shared-checkout is folklore a sibling ADR (ZDX-ADR-0012) already rejects — thin NEX-ADR **before Lancre hosts multi-agent execution** | 1 WI (ADR) | S |

---

## Wave 6 — Top-down lifecycle (track 10, strategic gap)

Nouns provisioned, every verb missing, PRDs not clause-addressable. Design **with** Roadmap A as first ingestion artifact.

| Item | What | Grain | Eff |
|------|------|-------|-----|
| B-21a | planning-lifecycle doc — Initiative Status transitions + Story DoR | S doc | S |
| B-21b | PRD clause-addressability convention — stable anchor IDs in Initiative body (unblocks coverage tracing) | S doc | S |
| B-21c | `/cosmo:decompose` + `/cosmo:coverage` spec'd to the bottom-up verbs' shape | Epic → spec WI + build WIs | L |

---

## Riders / hygiene (fold into named homes)

- **B-06** clacks-channel.md gitignore-staleness → rider on **WI-1245 finalize** (already hand-back step 1); add freshness CI assertion.
- **B-13** commit Linux secrets-helper port + lockstep ADR-0011 amendment → fold into **WI-1639 (Lancre setup)**.
- **B-14/B-16** commit Lancre workspace file; first-run snapshot-absence sentence in AGENTS.md.
- **B-22** cross-DB Project-homing unenforced (3 mis-homings in one pilot day) — Validity/sweep clause; capture now (enforcement impossible today = guaranteed recurrence).
- **B-19** completion-summary replace-vs-append undefined in the *standard* (tool fixed in WI-1243) — one standard sentence, lockstep.
- **B-23** D1 P3s (In-Review Validity clause, topology table, manifest regen owner, claim-expiry override audit).
- **B-32/B-33** marketplace version-bump CI check; make sweep-guard the only staging path (WI-1601 is advisory-only).
- **B-40** verify WI-1585/1599 pilot-dated rules actually adopted fleet-wide at relaunch (they were NOT in force during the incidents they fixed).

---

## DECISION surface for you (ZDX side)

1. ~~B-01 wake mechanism~~ **RULED (c) hybrid-sequenced, 2026-07-06** — see Wave 3 row for the tight inc-1 scope. Downstream: B-24 binding writes "attended-only pending inc-2"; B-26 cadence = complement.
2. ~~Charters ratification~~ **RATIFIED (operator, 2026-07-07; WIP N=4)** — new-build gate OPEN; landing = WI-1670 (WS-45).
3. ~~B-12 shared-checkout ADR~~ **RULED (a′) 2026-07-07** (event 31; WI-1671/1672 + WI-1670 addendum) — was: **B-12 shared-checkout ADR** — rule before Lancre hosts multi-agent execution (cheap now, expensive after).
4. ~~B-34~~ **RULED (b) EXCEPTION 2026-07-07** (judge.ts-only carve-out; trio 1282/1284/1295 stays KEEP) — was: **B-34 `claude -p` fallback** — fail-loud vs explicit exception ruling.
5. **v2 RLS apply timing** — after B-02 + B-04 land.

Everything in Waves 1-2 and the riders executes without a ruling. Recommended attack order: Wave 1 (in flight) → Wave 2 arming (pays out while sessions can still die undetected) → the B-01 fork → charters.
