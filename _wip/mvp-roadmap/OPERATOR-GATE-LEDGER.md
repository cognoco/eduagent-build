# Operator Gate Ledger — 2026-07-11 full-backlog gate sweep

**What this is.** Phase B/C deliverable of the HITL gate sweep (operator-approved approach,
2026-07-11): every human gate found across the 5 running batches + the entire outside-batch open
pool, deduped, typed per the OPQ definitions (Approval / Decision / Action), and filed as
Operator Queue rows. Every swept WI's AC now carries an `HITL:` declaration line (`none` or
typed gate + position). Cosmo OPQ is the SoR; this doc is the ruling-session view.

**How to use it.** §1 is the ruling session — work top to bottom, rule each in its OPQ row
(`Ruling` field or just tell the orchestrator). §2 is the action list, lead-time-ordered —
dispatch/chip at will. §3 is pre-declared approvals that will drip in as builds reach their
gates — nothing to do today. Batches 6–8 form after §1's chips fall (per your instruction).

---

## §1 Decisions — the ruling session (blast-radius order)

| # | OPQ row | Decision | Recommendation | Unblocks |
|---|---|---|---|---|
| 1 | WI-1685 checkpoint (P1, **LIVE — item Executing**) | Who confirms the staging→prod LLM-routing flip? | Operator approves pre-flip; agent builds to gate, parks, pings | Prod cutover chain + 1779/1686 behind it |
| 2 | WI-1461 ruling verification (P1, **item In Review**) | Was the push-gate-model ever ruled by product, or did the hold get silently dropped? | Confirm retroactively if merged behavior matches intent (PR #2054) | Review closure |
| 3 | DB-RLS posture — WI-1196 + WI-1002 (P1) | Activate DB-layer RLS vs formal app-layer-only risk-acceptance; if RLS, rule the person_id GUC design | Branch B (risk-acceptance + remediation date) now; GUC design deferred to the rename WP | DPIA condition 6 / Risk R2; FK-index sub-part proceeds either way |
| 4 | WI-1796 prompt consolidation (P2) | Rule A/B/C from the options on the WI | Lowest prompt-behavior-risk option absent eval evidence | Part of WI-1779 in Batch 3 |
| 5 | WI-787 guardian-write suppression (P2) | Blocked vs allowed-with-provenance for credentialed charges | Blocked-by-default (matches ratified supporter ceiling) | WI-787 build |
| 6 | WI-1665 recap-render condition (P3) | Does the V2 launch shell render recaps? | Answer from the V2 shell spec; IN if yes, FILL if no | One build cycle |
| 7 | WI-1324 fixed-but-unverified (P3) | Close citing Fixed In=96168d6c5 + residual break-test WI, or narrow AC | Close + residual capture | Bookkeeping |
| 8 | WI-1141 superseded flag flip (P3) | Confirm close as Superseded (WI-867 collapsed the flag) | Close | Bookkeeping |

Footnote (no OPQ row): WI-1466 is Type=Design inside the "ratified-13 bug set" — fine if
cooldown policy is meant to precede code; flag stands from the Batch-4 prep report.

## §2 Actions — lead-time order (longest lead first)

| OPQ | What | Blocks | Status |
|---|---|---|---|
| OPQ-22 (existing) | Counsel packet — Q1–Q4 + AI-Act classification | WS-29/30 holds; 1764/1690 content; 1194 retention values (OPQ-24) | In motion (operator) |
| WI-1105/1106 | DPO appointment + DPIA signing path | THE launch gate (C-5) | In motion (operator) |
| NEW a-1767 | Trust-package design pass (Zuzka) | 5 trust builds — AC-complete, mechanically un-promotable until design records ≥2 options each | **Highest-leverage single session** |
| NEW a-1338 | Inngest Cloud prod environment | 69 prod background fns unverified | — |
| NEW a-1341 (+OPQ-6) | Play SA JSON + Apple creds + Config-T M6 go-ahead | Store submission | — |
| NEW a-1764 | Source locale-correct crisis helplines | WI-1690 content sub-slice | Partially counsel-gated (OPQ-22) |
| NEW a-1772 | Real webhook secrets in Doppler prd + dashboards | Prod webhook verification | One Doppler session |
| NEW a-1642 | Valid Sentry tokens into Doppler | Crash triage; pairs with OPQ-27 alert rules | — |
| OPQ-26/27 (existing) | Staging MFA fixtures; prod alert rules | WI-1406 native-MFA sub-scope; WI-1500 promise | — |

## §3 Pre-declared approvals (drip when builds mature — nothing to do today)

- **WI-1754** — cohort-scoped Challenge prod flip (and a SECOND approval later for broad rollout).
- **WI-1686** — judge-flags prod flip, with the cost/latency spot-check result recorded at flip (note: 100% sampling of minors, no cohort limiter — unlike 1754).
- **WI-1685** — the prod flip itself, once Decision #1 declares the checkpoint.
- **WI-617** — branch-protection flip at pre-ship.
- **WI-1438/1464** — embedded conditional decisions, already declared in AC: grader-model swap if the bake-off winner differs; mastery-rule softening only by ruling, never a silent edit.

## Sweep accounting (2026-07-11)

- 4 agents: 3 writers (sanctioned CLIs only) + 1 read-only batch scan. ~60 items touched or audited; every touched AC now ends with an `HITL:` line.
- Batch scan: 35 open members, 10 gated, 2 flagged-ambiguous (→ Decisions 1–2), rest `no-gate`.
- Heavy concurrency observed: 13 machinery items + 8 product items were mid-flight in other sessions (collision guard held — skipped, reported); WI-1194 reappeared in Batch 5 after my manual-external move; WI-1643 now Executing.
- Trust builds (1497/1498/1499/1502): AC-complete at Refining, correctly NOT forced past the design DoR gate.
- Governance/ADR cluster (895–900, 757) deliberately unswept — pending the estate-vs-MentoMate routing ruling.
- Batches 6–8: deferred until §1 rules land (operator instruction — "create the remaining batches once we see how the chips fall").
