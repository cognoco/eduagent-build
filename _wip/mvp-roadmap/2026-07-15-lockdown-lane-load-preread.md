# MVP Roadmap Lockdown — lane-load pre-read

**Status:** RULED (lockdown sitting 2026-07-15) — outcomes below; §2 numbers are pre-ruling and superseded by the executed changes.

> **LOCKDOWN RULING RECORD (2026-07-15):**
> **LD1 — RULED: split Launch Readiness** (contra the keep-16 proposal). New lane **WS-54 "Store, Billing & Release"** took the 12 ship-chain items (WI-617, 1328, 1335, 1337, 1338, 1341, 1503, 1506, 1588, 1772, 1991, 2059); Launch Readiness keeps hardening/observability/E2E/trust (21). Also ruled: Quartet Runtime is not a MentoMate lane (Quartet machinery belongs to the ZDX-reboot program); WI-1650 → Dev-Infra & Tooling; the five product-LLM items mis-placed there → Core Learning Loop; lane retirement deferred (2 live estate items + 17 closed items still reference it).
> **LD2 — RULED: Option 1** — §3 spine adopted + the legal-dependency register (`2026-07-15-legal-dependency-plan.md`) with Cosmo Blocked-by edges as live state; clocks start the same week. Amendments during ruling: WI-1559 AND WI-1111 both re-bucketed to counsel (neither internally rulable) — both ride the OPQ-22 packet, whose dispatch is the DPIA-path clock-start. OPQ reconciliation ruled Option 1: all wholly-operator legal items got OPQ rows (OPQ-102..115); standing rule — wholly-operator items get OPQ rows at capture.
> **LD3 — RULED: fix now** (WI-1986 proceeds; WI-1436/1902 delete on their own gates; WI-1902 → V2 finalization, executed).
> **LD4 — SUPERSEDED.** The operator rejected the priority-as-scoping framing (P-labels are capture-time urgency guesses with no scoping authority; the sequence is deliver-at-all? → MVP/post-MVP → dependencies → grouping). Replaced by the **full-backlog disposition sweep** (`2026-07-15-full-backlog-disposition-sweep.md`): all 116 never-ruled items dispositioned — MVP 50 / pen 62 / closed 3 / Zuzka 1 (WI-1897, OPQ-117) — ruled and executed same day, 0 failures.
> **LD5 — stands as proposed** (no new effort ceremony; no objection raised).
**Date:** 2026-07-15 (export taken same day, after sitting-2 captures/placements)
**Purpose:** The ruled lockdown agenda (sitting-1 R4 amendment): **dedup/adjacency + roster & lane-load review** — high-level, not per-item. This doc proposes; the sitting decides. Companion: `2026-07-15-consolidated-scope-inventory.md` (scope rulings, both sittings recorded).

## 1 · Backlog snapshot

**239 open items** (Stage ≠ Closed, MentoMate project) — was 213 before the scope wave; +26 net = exactly the two capture batches (WI-2055..2066, WI-2068..2081). Priority: **54 P1 / 92 P2 / 87 P3 / 6 unset**. Stage: Captured 80 / Backlog 65 / Refining 11 / Ready 69 / Executing 12 / In Review 2. **Effort caveat:** 154/239 have no Effort set (capture doesn't set it; refine does) — lane load below is item-count by priority, not effort-weighted. Treat counts as directional.

## 2 · Lane-load table

| Lane | Open | P1 | P2 | P3 | Ready+Exec | New this wave | Read |
|---|---|---|---|---|---|---|---|
| **Launch Readiness** | 32 | 15 | 14 | 3 | 21 | 4 | Heaviest lane, but 8 already Executing and 13 Ready — this is the active launch runway, loaded by design |
| **Stream 2** | 28 | 2 | 21 | 1 | 2 | 17 | Fully sliced today; autonomous post-D-gate; runs beside launch work, not on its critical path |
| **Compliance-Eng** | 17 | 14 | 1 | 2 | 9 | 7 | Highest P1 *density* — the audit put 4 privacy P1s here + 2 OWD gates; the launch-blocking engineering mass |
| **Post-MVP pen** | 22 | 1 | 9 | 12 | 4 | 5 | Holding pen working as designed |
| **Core Learning Loop** | 15 | 1 | 6 | 8 | 9 | 2 | Healthy; mostly Ready |
| **V2 finalization** | 14 | 1 | 6 | 7 | 8 | 1 | S5/S6-gated tail; WI-2062 (ADR-0024) newly gates it |
| **Compliance-Legal** | 13 | 9 | 4 | 0 | 13 | 0 | ALL Ready, all external/counsel-dependent (DPO, DPIA, ROPA, DPAs, policy) — calendar risk, not eng load |
| Mobile UX & Nav | 9 | 1 | 5 | 3 | 6 | 1 | Light |
| Supporter & Linking | 9 | 1 | 6 | 2 | 3 | 3 | Light; WI-1753 In Review |
| Dev-Infra & Tooling | 8 | 1 | 3 | 4 | 2 | 5 | Light |
| Identity Cutover | 7 | 4 | 2 | 1 | 1 | 4 | Small but gate-dense: IDOR fix, canon amendment, PITR runbook, HELD table-drop |
| Churn-hotspot | 7 | 0 | 0 | 7 | 0 | 2 | All P3 refactors — post-MVP by construction |
| Quartet Runtime | 6 | 0 | 3 | 3 | 1 | 5 | Nearly all from the audit wave |
| Safety & Eval | 6 | 2 | 3 | 1 | 1 | 2 | Small; both P1s launch-relevant (WI-1986 bypass, WI-1764 crisis helplines) |
| Four Strands | 4 | 0 | 3 | 1 | 2 | 0 | Light |
| **(unassigned)** | **42** | **2** | **8** | 32 | 0 | 1 | See §4 — 10 non-P3s never triaged into a lane |

## 3 · Critical-path read (proposal, not a plan)

The launch-blocking mass is **three chains + two singletons**, everything else rides behind ordinary flow:

1. **Compliance-Legal (9 Ready P1s)** — external/counsel work (DPO, DPIA, ROPA, breach plan, privacy policy, Art 9, store declarations, DPAs, AI-Act plan). Longest external lead times; **start-earliest regardless of eng sequencing**. WI-1192/1193 now explicitly carry the T8 close-criterion.
2. **Compliance-Eng chain** — WI-1985 (erasure FK fix) → WI-2058 (deletion runbook, ruled sequence) alongside WI-1442 (consent audit trail), WI-1987/1988/1990 (device/telemetry privacy), WI-2064 (bearer-token posture) → converging on WI-1577 (**launch compliance closure FINAL GATE**, pre-store-submission re-run).
3. **Launch Readiness store/billing chain** — WI-1328 (RevenueCat prod) → WI-1335 (store publishing) / WI-1337 (push creds) → WI-1503 (prod-profile dogfood) → WI-1506 (closed beta) → launch; WI-1588 (activation instrumentation + kill-switch) and **WI-2059 (release ADR — gates the first production release)** ride this lane.
4. **Safety singletons** — WI-1986 (under-18 bypass; see §5 adjacency ruling) and WI-1764 (crisis helpline content, counsel-gated).
5. **Identity singleton** — WI-1989 (X-Profile-Id IDOR) + the A1/A2 canon/runbook pair (WI-2055/2056).

Stream 2 runs **parallel and off the critical path** (its only MVP-relevant tie: WI-2052's AGENTS.md trim helps every agent working the launch, and the R1 strict-tier docs get their drift status from the census).

## 4 · The unassigned pool (42 items)

Mostly old P3 captures (32) — propose **leave in place**; they lose nothing by staying unassigned until touched. But **10 non-P3s were never lane-assigned** and four are P1/launch-adjacent:

| WI | P | What | Proposed lane |
|---|---|---|---|
| WI-1807 | P1 | Repair end-user LLM quality gate (post profiles-table removal) | Quartet Runtime or Safety & Eval |
| WI-1826 | P1 | Suitability judge → `capability:'judge'` routing (completes H4) | Safety & Eval |
| WI-1900 | P2 | H5 output-moderation pass on mentor replies | Safety & Eval |
| WI-1901 | P2 | H7 safety-incident observability | Safety & Eval |
| WI-1897 | P2 | Cap-hit UX: daily-limit landing + parent value-handoff | Mobile UX & Nav |
| WI-1899 | P2 | Voice/photo-first homework input loop | Core Learning Loop |
| WI-1803 | P2 | Pre-auth allowance for anonymous activation events | Launch Readiness |
| WI-1808 | P2 | Stale premium-routing command in change classifier | Dev-Infra |
| WI-1864 | P2 | Nightly Maestro 4/8 shards failing | Dev-Infra |
| WI-2013 | P2 | /improve umbrella | (deliberately unassigned — cross-lane roll-up) |

The H-series cluster (1826/1900/1901 + 1807) suggests **Safety & Eval is under-counted** — with these it goes from 6 to ~10 items, 4 P1s.

## 5 · Adjacency & dedup findings

- **THE ruling for this sitting — WI-1986 vs WI-1436/WI-1902** (flagged on the WI-2013 umbrella since capture): WI-1986 *fixes* the under-18 vendor bypass in the legacy fallback selector; WI-1436 (Refining, V2 finalization) *deletes* the legacy routing path entirely; WI-1902 removes `GEMINI_API_KEY` post-cutover. Options: fix-then-delete / delete-only / fix-only. **Recommendation: fix now, delete on its own soak gates.** WI-1986 is small, P1, child-safety, and live today; WI-1436 sits behind soak/verification gates that shouldn't hold a safety fix hostage. The fix is cheap insurance that the deletion later makes moot — acceptable waste. *(Also: WI-1902 is unassigned — propose V2 finalization, with WI-1436.)*
- **No new duplicates found** at name/description level across the 239 — expected: both capture batches ran the dedup judge, and the sweep behind the scope inventory pre-resolved 11 collisions. Cross-lane adjacencies already governed: WI-2058↔WI-1442 (C9, different artifacts), WI-2059↔WI-1334/1341 (C10, rule vs inputs), WI-1801↔WI-1907 (alerting, both already Executing — converge at review, not worth merging mid-flight).

## 6 · Proposed lockdown decisions

| # | Decision | Proposal |
|---|---|---|
| **LD1** | Roster shape | **Keep all 16 lanes, no splits.** Launch Readiness is heavy but is the runway itself (21 of 32 already Ready/Executing); Stream 2 is autonomous; nothing else exceeds ~17. A split would add coordination cost to lanes that are sequencing-bound, not size-bound |
| **LD2** | Critical path | Adopt §3 as the launch execution spine: Compliance-Legal starts-earliest (external lead), Compliance-Eng chain → WI-1577 final gate, Launch Readiness chain → beta → launch, WI-2059 before first prod release |
| **LD3** | WI-1986 adjacency | **Fix now**, deletion (WI-1436/1902) proceeds on its own gates; WI-1902 → V2 finalization lane |
| **LD4** | Unassigned pool | Place the 10 non-P3s per §4 table (one triage batch); 32 P3s stay unassigned; Safety & Eval acknowledged as ~10-item lane after the H-series lands there |
| **LD5** | Effort visibility | No new ceremony: Effort fills at refine per normal flow; revisit lane loads effort-weighted only if a lane shows signs of overrun |

**[ BOTTOM LINE ]** The scope wave landed where it should: the heavy lanes are the launch runway (by design), compliance engineering (where the audit found real P1s), and Stream 2 (autonomous). No lane needs restructuring; the sitting's real decisions are the critical-path adoption (LD2), the fix-vs-delete call (LD3), and the 10-item unassigned triage (LD4).
