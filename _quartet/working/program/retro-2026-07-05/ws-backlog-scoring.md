# Workstream backlog scoring vs 2026-07-05 fleet retro

Source: `CONSOLIDATED.md` (fix list §3, incident register §1). Notion Workstreams DB `47d8bc5c-e074-4cd9-95bd-ddbb81978bdf`, Work Items DB `f170be9e04ae45d4961828f2438666bd`, queried live (read-only), 2026-07-05.

Workstreams resolved:
- **WS-23** — Cosmo improvements (`3858bce9-1f7c-8064-bfcd-ff28c62fa895`)
- **WS-26** — Quartet MVP (`38e8bce9-1f7c-816f-b5cd-c55b3c12c81d`)
- **WS-43** — Codexification & cross-harness portability (`3938bce9-1f7c-81f6-a293-dea956537d6f`)

Score legend: **FAST-TRACK** = directly implements/substantially advances a ranked §3 fix (fix rank cited) or a named incident; **RELEVANT** = helps reliability, no direct fix mapping; **UNRELATED** = fine backlog item, no retro relevance.

---

## WS-23 — Cosmo improvements (19 open items)

| WI | Name | Stage | Priority | Score | Fix mapping | Why |
|---|---|---|---|---|---|---|
| WI-1245 | Commit-reconciliation churns working-tree-only Clacks `_state` channels (real data loss) | Executing | P0 | **FAST-TRACK** | Fix #2 · R3, R4, R11 | This IS the tracked WI for permanent untrack+guard of `_state` files; ramtop/orion each independently fixed the symptom, this closes the class fleet-wide. |
| WI-1236 | Orchestrator bootup: arm lane monitors ASAP to gain control before a shepherd runs unobserved | Ready | — | **FAST-TRACK** | Fix #6 (orchestrator-side counterpart) · R7, R12 | Shepherd-side "arm monitor before reconcile" (WI-1235) already shipped and closed; this is the matching orchestrator-side enforcement gap the retro flags as unresolved. |
| WI-1312 | Cosmo permits a zombie Executing state (no guard reverts/flags an unclaimed Executing item) | Backlog | P3 | **FAST-TRACK** | Fix #12 · R14 | Directly targets the "WI stranded in Executing after dead shepherd" failure mode SE (WS-31) hit for 3 WIs. |
| WI-1525 | Implement `/cosmo:next` + headless queue-health report | Captured | P2 | RELEVANT | — | Queue-health visibility helps general reliability, no specific incident/fix. |
| WI-1375 | cosmo version dual-bump omits third manifest sink | Captured | P3 | RELEVANT | H4-adjacent (version-skew) | Manifest-consistency bug in the same family as pm-fable's "absorption model"/version-skew framing (Fix #16), not itself in §3. |
| WI-1374 | dedup-judge subprocess JSON-parse crash on Windows | Executing | P3 | RELEVANT | H4 change inventory ("--dedup unrunnable on Windows") | Named tool regression in §5, not a numbered §3 fix. |
| WI-1296 | `cosmo:execute complete` appends (never replaces) completion summary → re-bounce loop | Backlog | P2 | RELEVANT | — | Real Cosmo reliability bug, no direct incident/fix match. |
| WI-1295 | cosmo triage-judge subprocess JSON-parse crash on Windows (garbage-prefixed output) | Reviewing | P3 | RELEVANT | H4-adjacent (Windows subprocess fragility cluster) | Same bucket as WI-1374/1284/1282. |
| WI-1284 | Cosmo dedup/triage judge subprocess exits 1 when `ANTHROPIC_API_KEY` set | Reviewing | P2 | RELEVANT | H4-adjacent | Same bucket. |
| WI-1282 | `cosmo:triage` judge-client crashes on Windows (`which` → ENOENT) | Reviewing | P2 | RELEVANT | H4-adjacent | Same bucket. |
| WI-1595 | Capture/refine should infer Project from code surface | Captured | P3 | UNRELATED | — | Filing hygiene, no retro tie. |
| WI-1592 | Resync bundled cosmo reference docs to zdx-standard canon | Backlog | P3 | UNRELATED | — | Doc sync only. |
| WI-1515 | WP: Sanctioned dispositions & close paths | Ready | P2 | UNRELATED | — | General close-path gaps, not retro-named. |
| WI-1369 | Bug-type AC refine template: default red-green-revert clause | Backlog | P3 | UNRELATED | — | Quality-gate hygiene, predates retro. |
| WI-1356 | Awaiting-Info answered-gate State-flip | Executing | P2 | UNRELATED | — | Unrelated Cosmo state-machine gap. |
| WI-1325 | cosmo review/qa mishandles Expo Router bracket paths | Backlog | P2 | UNRELATED | — | Unrelated file-citation bug. |
| WI-1318 | No sanctioned close path for verified NOT-REPRODUCIBLE | Backlog | P3 | UNRELATED | — | Unrelated. |
| WI-1293 | No sanctioned disposition for a verified already-fixed WI | Executing | P2 | UNRELATED | — | Unrelated. |
| WI-1215 | Migrate WI-813's PR field to native Notion-GitHub integration | Backlog | P3 | UNRELATED | — | Unrelated tooling nicety. |

## WS-26 — Quartet MVP (29 open items)

| WI | Name | Stage | Priority | Score | Fix mapping | Why |
|---|---|---|---|---|---|---|
| WI-1599 | Fleet-state protocol: PAUSE vs DRAIN vs SHUTDOWN semantics (watchers stay up on pause) | Captured | P1 | **FAST-TRACK** | Fix #14 | This is the exact tracked WI for "PAUSED-with-watchers-up as default halt reading." |
| WI-1564 | Quartet pause/resume tiers: soft pause keeps inbox wake-watch; hard shutdown explicit+flagged | Captured | P2 | **FAST-TRACK** | Fix #14 (secondary) | Same halt-semantics problem from the tier-design angle; substantially advances the same fix as WI-1599. |
| WI-1585 | Canonize F35 merge-ownership ruling (shepherd Gate-1, indep-reviewer/human Gate-2; drop branch-protection assumption) | Captured | P2 | **FAST-TRACK** | Fix #24 · H5 merge-authority divergence flag | Directly resolves the ranked "protocol/authority changes must be versioned, not flipped mid-flight" fix and the ramtop-vs-orion merge-authority disagreement flagged in §5. |
| WI-1518 | WP: Executing-state classification & orphan handling (bundles WI-1509, 1312, 1332; design head WI-1237) | Ready | P2 | **FAST-TRACK** | Fix #12 · R14 | Umbrella WP for exactly the "stranded-in-Executing after dead shepherd" problem. |
| WI-1509 | Sweep needs a parked-not-orphan discriminator | Backlog | P2 | **FAST-TRACK** | Fix #12 · R14 | Component of the same orphan-handling fix; distinguishes a correctly-held lane from a real orphan (build-gate discipline keep item). |
| WI-1237 | Define the orphaned in-flight WI adoption procedure (dead-session handoff) | Backlog | P2 | **FAST-TRACK** | Fix #12 · R14 | The design head for dead-shepherd handoff — precisely what stranded WI-1358/1365/1377 needed at drain. |
| WI-851 | Fix reviewer-clone harness: Windows-doppler-on-Mac + brittle evidence-parser (spurious WI bounces) | Ready | P1 | **FAST-TRACK** | Fix #8 | "Brittle evidence-parser causing spurious bounces" is the same failure class as the cross-host-corroborated `complete --validate` hex trip-wire bug. |
| WI-850 | Quartet monitor hygiene: manifest + reconcile ritual (stale/duplicate monitors) | Backlog | P2 | **FAST-TRACK** | Fix #21 · R10 | Directly targets stale/duplicate-monitor hygiene — the mechanism behind R10 (duplicate shepherd occupancy) and the "ban bare while-true" ranked fix. |
| WI-1526 | Flow-stewardship practice: ZDX standard + orchestrator queue-stewardship duty | Captured | P2 | RELEVANT | — | General process discipline, not a named fix. |
| WI-1520 | WP: Lane-scoping & planning rules (bundles WI-1226, 1229, 1564) | Executing | P2 | RELEVANT | Fix #14 (via bundled WI-1564) | Scored at the WP level as relevant since its fast-track content is already counted standalone via WI-1564. |
| WI-1511 | claude-review CI check reports success while no-oping on empty key | Backlog | P3 | RELEVANT | — | CI-trust issue, no retro incident tie. |
| WI-1367 | PM-protocol dogfood finding: silent cross-layer item move caused a hold cycle | Backlog | P3 | RELEVANT | R8/R9-adjacent | Same family of "directive/provenance gap" as the comment-watcher and monitor-restart-replay incidents, but not the same mechanism. |
| WI-1354 | Orchestrator protocol: add a Decision-Escalation classifier | Reviewing | P2 | RELEVANT | — | Adjacent to R5's status-vs-decision issue (already fixed/kept per §6), different axis (authority vs stakes). |
| WI-1332 | Stage-less orphan guard (raw Notion page-creates bypass capture.ts) | Backlog | P3 | RELEVANT | — | Different orphan class (creation-time, not dead-session); adjacent theme only. |
| WI-1264 | Add minimal CI to zdx-marketplace | Backlog | P3 | RELEVANT | — | General CI-trust hardening. |
| WI-1263 | Lane-status cloud mirror | Backlog | P3 | RELEVANT | Fix #18-adjacent | Telemetry-adjacent to per-lane token telemetry ask, not the same metric. |
| WI-1230 | Enforce + reconcile the Clacks channel schema (inbox/outbox drift) | Backlog | P2 | RELEVANT | — | General channel-integrity hardening, adjacent to R15 but not the specific ENE/liveness fix. |
| WI-1225 | Quartet executor/shepherd dispatch rails: isolation, CI-repro, verify-at-source, checkpoint cadence | Ready | P2 | RELEVANT | Fix #5-adjacent | Checkpoint cadence touches the durable-resume-artifact theme but doesn't standardize the artifact itself. |
| WI-1224 | Quartet Brain hardening: bindings-not-instances + anchor/discovery/boot hygiene | Ready | P2 | RELEVANT | — | Boot-hygiene adjacent to spawn-sequence theme, not a direct fix. |
| WI-1600 | Wire Archon/shepherd merge-flow to call pr-opened merge-writer | (unset) | P2 | RELEVANT | — | Merge-flow plumbing, no direct incident tie. |
| WI-1370 | Sweep orchestrator-maintains ownership prose to PM role | Captured | P2 | UNRELATED | — | Prose/ownership cleanup. |
| WI-1281 | shepherd-kickoff-template not thin | Captured | P3 | UNRELATED | — | Template hygiene. |
| WI-1269 | builder.md Phase-4 adversarial-review verdict must be synchronous | Reviewing | P2 | UNRELATED | — | Unrelated dispatch-mechanics bug. |
| WI-1229 | Design multi-workstream shepherd + mutable reviewer scope | Backlog | — | UNRELATED | — | Scope-model design, not retro-driven. |
| WI-1226 | Quartet planning-rules: standing-lane lifecycle | Backlog | P3 | UNRELATED | — | Planning-rules design. |
| WI-1510 | Reader-gotcha: formula-property filter clauses unfilterable in Notion API | Backlog | P3 | UNRELATED | — | Notion API quirk, unrelated. |
| WI-1159 | Quartet review-watcher: read-only sandbox | Ready | P2 | UNRELATED | — | Security hardening, unrelated. |
| WI-1158 | Quartet review-watcher: runner-adapter contract | Ready | P3 | UNRELATED | — | Unrelated. |
| WI-1157 | Quartet/Cosmo seam: structured review-result envelope | Ready | P2 | UNRELATED | — | Unrelated. |

## WS-43 — Codexification & cross-harness portability (3 open items)

| WI | Name | Stage | Priority | Score | Fix mapping | Why |
|---|---|---|---|---|---|---|
| WI-1545 | Relocate cross-harness primitives out of `.claude`-only homes | Executing | P2 | RELEVANT | H4-adjacent (version-skew/portability) | Cross-harness hygiene touches pm-fable's "absorption model" framing but isn't a numbered fix. |
| WI-1544 | Codex end-to-end lifecycle smoke through Cosmo | Captured | P2 | RELEVANT | — | General reliability test coverage, not retro-specific. |
| WI-1543 | Codex Brain binding implementation for Quartet roles | Captured | P2 | UNRELATED | — | Feature build-out, no retro tie. |

---

## FAST-TRACK SHORTLIST (fix-rank order)

1. **Fix #2** (untrack `_state` permanently + guard) — **WI-1245** (WS-23, Executing, P0)
2. **Fix #6** (arm monitor before reconcile, orchestrator side) — **WI-1236** (WS-23, Ready)
3. **Fix #8** (`complete --validate` trip-wire over-eager / spurious bounces) — **WI-851** (WS-26, Ready, P1)
4. **Fix #12** (orphan/stranded-Executing handling after dead shepherd) — **WI-1518** (WS-26, Ready), **WI-1509** (WS-26, Backlog), **WI-1237** (WS-26, Backlog), **WI-1312** (WS-23, Backlog)
5. **Fix #14** (fleet-state PAUSE/DRAIN/SHUTDOWN semantics) — **WI-1599** (WS-26, Captured, P1), **WI-1564** (WS-26, Captured)
6. **Fix #21** (sanctioned Monitor/until-loop pattern; monitor hygiene) — **WI-850** (WS-26, Backlog)
7. **Fix #24** (protocol/authority changes must version, not flip mid-flight) — **WI-1585** (WS-26, Captured)

## GAPS — ranked fixes 1–15 with no covering backlog item (need new WIs)

- **Fix #3** — `cosmo:execute complete` draft-PR fallback must never sweep cross-lane working-tree changes (R4). No WI found in WS-23/26/43.
- **Fix #4** — Idle/blocked-lane heartbeat backoff / adaptive cadence (H2 burn). WI-1313 covered the related idle-detection concept but is already **Closed**; nothing open covers the backoff-cadence fix itself.
- **Fix #5** — Standardize the durable resume/handoff artifact fleet-wide (4 names, 1 pattern). No WI found.
- **Fix #7** — Self-check clock skew on wake / "was frozen N min" marker (R1, R2 frozen-clock). No WI found.
- **Fix #9** — `execute create` stamps origin page-UUID instead of WI-ref, breaking resolver. No WI found.
- **Fix #11** — Monitor-restart handoff must replay unseen deltas, not silently drop (R9). No WI found.
- **Fix #13** — Respawn a fragile lane only into a verified-healthy token window, not on first thaw signal (R14). No WI found.
- **Fix #15** — Notion as sole ENE writer; `liveness.md` mirror read-only (R13 false-alarm churn). No WI found.

Not gaps: Fix #1 (WI-1563, tracked outside these 3 workstreams), Fix #6 (base canon WI-1235 shipped; enforcement partially covered by WI-1236 above), Fix #10 (canon fix already landed), Fix #2/#12/#14 (covered — see shortlist).
