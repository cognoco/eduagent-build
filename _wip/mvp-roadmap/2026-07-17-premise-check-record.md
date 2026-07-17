# Premise-check & refresh record — PM sitting (2026-07-17)

**Status:** RULED (refresh sitting: D1–D3 + collision reconciliation). Companion to `2026-07-16-sequencing-sitting-record.md` (SEQ-1..6, Wave-1 batch formation). PM seat for the MentoMate MVP program assumed by Hex this sitting (operator-directed); ZDX green light approaching — execution hold on BID-1..4 **still standing** until the operator lifts it explicitly.

## Refresh findings (delta vs 2026-07-16)

- **OPQ status vocabulary is v3** (`Open → Processed → Closed`, `Bounced`; fold-back evidence gates `Closed`) — operator-ruled 2026-07-17, nexus commit `086de01`. Queue tooling/viz here updated accordingly. 116 rows total, none past OPQ-118 (v3 sweep deleted duplicates); **33 open**.
- **Real rulings landed today (both Zuzka):** **OPQ-107** — UK is IN the launch-market set → the conditional fires: *procure a UK-established GDPR Art-27 representative + publish in the privacy policy*. WI-1110 (Appoint UK GDPR representative) converts from "falls away if UK excluded" to a real external procurement. **OPQ-118** — Challenge = deeper active-learning extension of the current session topic; "proceed with WI-2112 ACs as written" → WI-2112 (Challenge redefinition) fully ungated.
- **Human clocks NOT started.** OPQ-22 (counsel packet, untouched since 07-11), OPQ-102 (DPO, ⏰07-24), OPQ-110 (DPAs, ⏰07-24), OPQ-24/25 (retention, ⏰07-25) all Open. Today's other queue movement was the v3 status sweep + backfills, not rulings. SEQ-3 backstop forces a sitting by **07-21**. Authority note: OPQ-102/110/24 sit under **Zuzka's** authority in the queue; OPQ-25/82/95/114 under Jørn.
- **Record corrections:** (1) The 07-16 exclusion "WI-1196 ruling-gated by OPQ-97" was a mis-attribution — that OPQ-97 is a quartet-stream row (RLS *spec-text*, unrelated). WI-1196's real gate was **OPQ-30 (DB-layer RLS posture), ruled 2026-07-14** (Branch B: formal risk acceptance) — WI-1196 has been ungated and Ready since; it joins the round-two Compliance-Eng pool. (2) WI-2227's same-day close was a **duplicate-close**, not an execution — no rogue dispatch occurred.
- **49 new WIs since 07-16T12Z:** a QA/dogfood capture cluster (~20) + a coherent V2-supporter/E2E program (WI-2215..2243) authored overnight and largely self-staged into correct lanes by a parallel stream (taxonomy + pen respected; refinement only).
- **In-flight unchanged:** 11 Executing; 7 claimed by codex agents — including **WI-1194 (retention gaps) now claimed and executing**, resolving the 07-16 stage anomaly and pairing with Jørn's OPQ-25.
- **BID-1..4 verified intact:** Status=Ready, hold notes untouched, 21/21 members unchanged (zero claims; ACs on WI-1813/1862/1826 empty as ruled — AC-author-first steps stand).
- **ZDX follow-ons:** WI-2141 (standard text) + WI-2143 (guidelines) Closed; WI-2142 (lifecycle tooling) Ready. Batch object now in live use estate-wide (nexus BID-5/7/8 Running).

## D1 — OPQ processing order (ruled: process ASAP; internal-only, Phase-1-blocking)

Operator requested the prioritized list of rows blocking Phase-1 activity that Jørn+Zuzka can clear **without third-party involvement**. Ruled list (also the sitting agenda, in order):

- **Tier 1 — pure rulings gating the Phase-1 exit:** OPQ-114 (Jørn — bearer-token posture → WI-2064 → WI-1577), OPQ-115 (Zuzka — Art 9 OUT confirm+document; DPO notify deferred).
- **Tier 2 — deadline-carrying + unblocks Executing work:** OPQ-25 (Jørn ⏰07-25 — production retention purge; WI-1194 executing toward it), OPQ-37 (store credentials/EAS/Config-T → Executing WI-1341), OPQ-89 (staging Sentry auth → WI-1920), OPQ-90 (prod-deploy authorization → WI-1907), OPQ-58 (one Challenge Round E2E → closes WI-1754's window).
- **Tier 3 — unblocks Wave-1 lanes/pools:** OPQ-92 (telemetry read → WI-1833, Safety & Eval), OPQ-40 (trust-package design — DoR-blocks 5 trust builds; longest pure-thinking item).
- **Tier 4 — store-console long-leads (internal actions, external latency):** OPQ-60 (Play Console record/listing/Data Safety), OPQ-108 (country availability + hard-blocks), OPQ-59 (FCM credential to EAS), OPQ-61 (RevenueCat production), OPQ-109 (age-rating/declarations — *draft now; final answers reference the DPO/counsel-dependent privacy policy*).
- **Tier 5 — HITL QA passes (sequence after BID-1 restores the preview vehicle):** OPQ-11 (WI-1503 dogfood device run), OPQ-55 (Batch-4 device/staging pass), OPQ-50 (i18n copy review), OPQ-51 (device voice QA).

Excluded as external-dependent (22, 24, 102–106, 110, 111) or non-Phase-1 (41, 71, 95, 112, 113) — with the standing flag that the external rows' *initiation acts* (OPQ-22 send, OPQ-102 retainer signing) are the real schedule lever and must not be displaced by this list.

## D2 — Dispatch model (ruled; corrects the withdrawn ADJ-1)

**No standing Wave-2 trigger exists.** The model: **BID-1 (Preview vehicle) + BID-2 (CI & gates unblock) dispatch at hold-lift, in parallel where feasible** (surfaces barely overlap; shepherd watches the seam). Every subsequent batch kickoff is a **joint operator+PM decision**, made once those are rolling, informed by observed lane throughput and capacity. Waves remain a comprehension overlay only — not machinery. PM standing duty: bring throughput/capacity data to each such sitting.

## D3 — Intake ruled (option a) + grooming-collision reconciliation

**Intake:** the 28-item routing table (27 unrouted captures + WI-2112 re-intake) accepted as proposed — 20 embeds / 8 factory, borderlines per PM lean with factory-demotion as the escape hatch.

**Collision:** Zuzka's backlog-grooming agent swept the same Captured pool concurrently (11:39–11:51Z; full change ledger relayed to PM). Write-set benign (taxonomy + refinement only; zero claims/closes/code). Root cause: two authorized hands, overlapping mandates, no single-writer rule; amplified by the triage CLI's non-atomic Captured-check→write (duplicate `[zdx:triage]` comments on seven rows are the evidence). **Operator declined a ZDX finding** — recorded program-locally here instead.

**Reconciliation (operator-approved, executed + fold-back-commented):** groomer refinement kept everywhere (20 items to Ready with effort/review-tier, 2 correct Bug→Task flips, WI-2112 Enhancement→Bug per OPQ-118, three stale captures penned: WI-1893 Ready / WI-1906 + WI-2036 Refining — the latter two parked on embedded operator decisions, correctly). Ten lane patches applied: **2176/2178/2182/2185/2186/2187/2191/2192 → QA Fix Factory (WS-55)** (upholds SEQ-5 — refinement doesn't change launch-blocking-ness), **2197 → Supporter & Linking** (groomer's own stopped correction), **2193 → Four Strands**. Conceded to groomer placements: 2177→Launch Readiness, 2189→Supporter & Linking, 2216→Core Learning Loop, 2241→Launch Readiness. Factory now 23 items.

**Standing rules from the collision:** (1) **Single-writer intake** — Captured-pool triage/lane routing is the PM seat's alone. (2) The groomer continues as the lane's **refinement engine, strictly downstream of intake**: works only lane-placed Backlog/Refining items, writes refinement-band fields + Backlog→Refining→Ready only, never Workstream/Delivery Batch/claims/exec-band stages, escalates mis-lane/scope/operator-decision finds instead of self-correcting, queue is PM-fed. Contract + first scope (the 8 unrefined leftovers, WI-1196 DoR check, round-two pre-refinement) relayed to the agent via the operator 2026-07-17.

## Premise verdicts (P0–P9)

- **P0 scope lock — HOLDS.** Pen used properly by all hands; the one scope change (Challenge) came through OPQ-118.
- **P1 gate spine — HOLDS.** WI-1577 → WI-1335 → WI-1506 → launch unchanged. Pacing item is unambiguous: Bucket-2 paper, clocks unstarted at T-7 (D1 + backstop 07-21).
- **P2 waves — RETIRED as machinery** (D2); comprehension overlay only.
- **P3 batch composition — VERIFIED intact** (BID-1..4, 21 members).
- **P4 duty cycle — sittings still owed;** D1 is the agenda. BID-1..4 dispatch does not wait for them (audited human-free).
- **P5 QA intake — HOLDS** (58 routed lifetime, zero disputes); factory at 23 strengthens BID-1 urgency.
- **P6 viz overlay — refreshed** this sitting (OPQ v3, D2 model, Bucket-1 annotation).
- **P7 Compliance-Eng pacing — STRENGTHENED:** WI-1194 executing, WI-1196 Ready (correction above), UK-rep procurement new. Round-two formation should lead with this chain.
- **P8 substrate — proven estate-wide;** dispatch mode at hold-lift: BID-1 → BID-2 parallel, executor subagents, PM as shepherd, per-brief flags honored (WI-2119 stop-and-ask, AC-author-first).
- **P9 parallel streams — CONFIRMED as the week's process risk,** resolved by the D3 standing rules; claims/created/edited delta sweep is now a standing step of every premise-check.

## Next

Hold stands. At lift: BID-1+BID-2 parallel dispatch (final mode confirmation at lift). Round-two formation agenda: Compliance-Eng remainder (incl. WI-1196), Identity cluster (WI-1989/2006/2055/2056 — operator eyes on canon wording), WI-1650/1864 (pre-refined by then), factory drain mode (operator-reserved). WI-1906 becomes an OPQ row if it ever leaves the pen. Zuzka + Jørn process D1 tiers ASAP; external initiations (OPQ-22 send, OPQ-102 retainer) remain the schedule lever.
