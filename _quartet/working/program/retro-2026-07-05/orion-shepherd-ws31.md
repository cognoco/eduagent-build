# Findings — orion / shepherd-WS31 (safety-eval) — RECONSTRUCTED by orchestrator (session frozen at drain time)

Session span: ~2026-07-04 (pre-session) → 2026-07-05 ~07:45Z last live beat (SE-48); re-froze after, dead at drain.
Agent: shepherd (WS-31 safety-eval), Opus builders. Reconstructed from lane outbox `safety-eval-33..48` + orchestrator inbox `se-inbox-051..073`. NOT self-authored — SE could not write its own (frozen).

## 1. Incident timeline

- 2026-07-04 ~18:39–18:41Z — SE-37/38: alive, HOLDING for explicit operator dispatch go on the 4-build safety wave; requested instructions.
- 2026-07-04 ~18:44Z — se-inbox-056: ORION relayed operator-authorized BINDING dispatch go → wave fired (WI-1376+1358+1351+1365 parallel worktrees; WI-1377 after 1376).
- 2026-07-04 20:38Z — SE-47 last beat before throttle.
- 2026-07-04 20:38Z→2026-07-05 ~07:45Z — THROTTLE freeze ~11h; SE silent. ORION sent se-057..069 (status/respawn pings), all unanswered while frozen. Builders had already produced worktree commits + PRs before freeze (WI-1358 committed a2288e2c3 etc.).
- 2026-07-05 ~07:45Z — SE-48: recovered, reconciled all 5 WIs merged on origin/main; asked ORION to confirm the 3 solo-merges.
- 2026-07-05 ~08:0xZ — SE RE-FROZE before running the lifecycle completes. se-070 (merge confirm + on-behalf-complete go), se-071/072 (progress pings) all unanswered. Dead at drain.

## 2. Comms losses

- ~11h of pings (se-057..069) into a frozen session — sent, never actioned; recipient dead, not a channel fault.
- Post-recovery se-070/071/072 also unanswered (re-froze within ~15min of recovering).
- SE itself hit the backtick-in-jq shell-escaping bug (SE-43 dropped two words "main workflow"; corrected in SE-44) — same mechanical bug ORION hit. Message-integrity, not loss.

## 3. Rulings & operator-action backlog (SE's, as visible in channel)

- SE correctly HELD the HIGH-safety 4-build wave until an unambiguous operator dispatch go (did not treat "get back to work" as the go) — good discipline.
- SE ran `/cosmo:execute complete` on WI-1376/1351 → Reviewing (WI-1351 reached Closed via reviewer Gate-2).
- **PENDING (blocked on SE respawn):** `/cosmo:execute complete` on WI-1358/1365/1377 (merged by ORION solo, still Executing) + resolve WI-1376 stage anomaly (SE completed it to Reviewing, later showed Executing — suspected reviewer-bounce or throttle-reset). All safety CODE landed; only Cosmo bookkeeping open.

## 4. Token / rate-limit events

- Same fleet throttle. SE is a FRAGILE lane — did not auto-recover; needed operator respawn. Recovered once (07:45Z) then re-froze almost immediately — suggests the respawn landed into a still-degraded token window (partial recovery, not stable).

## 5. Root-cause hypotheses

- H1: STRONG — SE is the canonical no-auto-recovery case; dead ~11h, and even after respawn re-froze in <15min.
- H2: some — 4 parallel Opus builders under the shared token budget during a HIGH-safety wave is heavy; plausibly contributed to the fragility.
- H3: no data (SE stayed on-task on the wave).
- H4: SE is where the `cosmo:execute complete` PR-fallback fired (#1911 spurious draft from an earlier WI; the _state sweep). Named under orchestrator doc H4.
- H5: shared-checkout — SE's builder-1376 made a stray edit in the shared main tree that had to be reverted (noted in SE-45). Shared-checkout friction.

## 6. What would have saved you (ranked)

1. Auto-respawn watchdog for the fragile safety lane (dead ~11h + re-froze after respawn — the highest-value lane sat idle longest).
2. Respawn into a VERIFIED-healthy token window (the re-freeze suggests respawn-too-early into a still-throttled window).
3. Orchestrator able to run `/cosmo:execute complete` on-behalf for a dead shepherd's merged WIs (the lifecycle bookkeeping stranded purely because only the shepherd can complete).

## 7. Keep / kill / fix

- KEEP: SE's HIGH-safety discipline — held the wave for explicit go, red-green-revert on every build, ADR/DPIA lockstep in-PR, stopped every build at Gate-1 for orchestrator diff-verify. Exemplary.
- KILL: respawning a fragile lane into an unverified token window (re-froze immediately).
- FIX: lifecycle-completion for a merged WI should be executable by the orchestrator on-behalf when the owning shepherd is dead (today it strands in Executing).
