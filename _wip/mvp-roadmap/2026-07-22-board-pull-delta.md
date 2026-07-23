# Board pull & delta report — PM roadmapping sitting (2026-07-22, ~12:30Z)

**Status:** BOARD-VERIFIED snapshot (full REST pull, all 1,559 MentoMate Work Items + Programs /
Initiatives / Workstreams / Delivery Batches / Operator Queue DBs). Read-only pull; zero writes.
Baseline for the shutdown-window roadmapping mandate (MVP-gate sequencing + post-MVP bucketing).
Delta computed against the 07-15 lockdown sweep + 07-17 premise-check/handoff + the 07-22 reboot
annex (`_WIP/zdx-reboot/_docs/interim-operations/mm-program-state-2026-07-22.md`).

Raw pull data (mortal, session scratchpad): `workitems.json`, `workstreams.json`,
`initiatives.json`, `batches.json`, `programs.json` — re-runnable via the pull scripts beside them.

## 1 · Headline numbers

| Measure | Value |
|---|---|
| MentoMate Work Items, total | **1,569** (max ID WI-2601) |
| Open | **321** — Backlog 111 · Captured 78 · Ready 74 · Refining 28 · Executing 28 · Reviewing 2 (incl. 10 adopted orphans, see note) |
| Open by State | Active 232 · Parked 56 · Blocked 9 · Awaiting Info 4 · (none) 10 |
| Closed since 07-17 | **146** |
| Minted since 07-17 (ID > 2349) | **125**, of which **94 still open** |
| Open by Priority (no scoping authority — reference only) | P0 3 · P1 79 · P2 130 · P3 91 |
| Delivery Batches | 39 total; **26 MentoMate** (14 Running · 12 Closed); 13 non-MM (BID-5..10/17/21/24/25/30/32/34) |
| Operator Queue | 130 rows; **32 Open** (30 under Zuzka, 2 under Jørn) |

> **Orphan-adoption note (2026-07-22, operator-instructed):** 10 non-closed WIs had an empty
> `Project` relation; all verified MentoMate (each sits in a MentoMate workstream or names
> MentoMate surfaces) and patched with `Project=MentoMate`: WI-2536 (cross-org supporter
> cold-start — desc says FAST-FOLLOW), WI-2527 (Sentry raw-error burn-down), WI-2360, WI-2359,
> WI-2358, WI-2357, WI-2341 (HITL Clerk QA), WI-1628 (staging DDL drift guard), WI-1556,
> WI-533 (stale boundary marker in closed WS-4 — hygiene-close candidate). Tally above updated
> (Captured +4 → 78, Backlog +6 → 111).

## 2 · Delta vs the 07-15/07-17 records

- **Heavy churn under the wrap-up fleet:** 146 closes + 125 mints in 5 days. New-mint
  concentration (open): Core Learning Loop +28, no-workstream +18, Supporter & Linking +13,
  Launch Readiness +11 — QA/dogfood keeps feeding the MVP lanes faster than the pen.
- **Pen grew:** WS-52 Post-MVP pen now **72 open** (sweep ruled 62). Composition: Backlog 48,
  Captured 11, Refining 7, Ready 5, Reviewing 1 — the Ready/Reviewing rows are anomalies for a
  pen. Types: Hygiene 21, Enhancement 14, Task 13, Feature 10, Bug 6, Design 6, Docs 2.
- **Compliance progress:** WI-1111 (Art 9 ruling) and WI-1193 (lawful-basis record) **Closed**.
  The rest of the Bucket-2 paper chain (WI-1105/1106/1107/1108/1109/1192) sits Ready/Active,
  human-gated.
- **Annex verification:** BID-36 (V2 supporter) still Running with 1 open member (WI-2596,
  claimed by its shepherd — the annex's "likely drained" is close but not done). WI-2594
  (credential-artifact fix) still Executing. WI-2595 Reviewing/Awaiting-Info. Of the annex's four
  held items, WI-2114/2519/2243 have since **Closed**; WI-2504 remains open-held (`Fixed In` set).
- **Un-workstreamed pool: 26 open items** — includes a coherent consent/family-onboarding cluster
  (WI-2532/2533/2534/2535 + WI-2453, minted from the consent-model review), V2/E2E QA captures
  (WI-2577/2596/2600/2385), governance/estate-track leftovers (WI-897..900, WI-2407, WI-2428,
  WI-2338, WI-2334, WI-2333), and misc (WI-2529, WI-2460, WI-2510, WI-2575, WI-2346, WI-2390).
- **Pen hygiene:** only 2 post-mvp-tagged items sit outside WS-52 (WI-2230, WI-2221).

## 3 · In-flight (the wrap-up work — do not touch)

30 items Executing/Reviewing; 28 live-ish claims. **15 claims are expired** (Claim Expires <
07-22) — mostly pre-reboot shepherd identities (`codex:vetinari:*`, `codex:gpt5:*`,
`builder:codex:WI-1341`, `codex:orion:WI-1777`) whose sessions died at/around the reboot. Notable
zombies: **WI-1577 (FINAL GATE re-run — claim expired 07-21)**, WI-1341 (store submission
pipeline, Awaiting Info since 07-11), WI-1772/1338 (prod webhook secrets / Inngest sync, Blocked),
WI-1194 (retention gaps), WI-1907/1920 (Inngest alerting / Sentry storm). These are **execution
matters for the reboot**, not roadmap items — listed so the roadmap doesn't double-plan them.

## 4 · Structural findings for the mandate (the important part)

**F1 — The Initiative layer for MentoMate is effectively empty.** 306 of 311 open items carry NO
Initiative relation; INI-35 "MentoMate" is a bare shell (no Status/Level, no Workstream links,
5 WIs). PGM-1's Initiatives relation points at the *legacy* eduagent initiatives (mostly
Graduated/pre-lockdown: INI-10..18, INI-33 App v2, INI-32 Operations…), none of which map to the
current lane structure. **The structure the mandate needs — Initiatives that carry MVP vs
post-MVP-bucket identity — does not exist yet and must be designed + minted.** This confirms the
operator's framing.

**F2 — Workstreams are the only live taxonomy.** 17 workstreams carry the 285 workstreamed open
items (top: WS-52 pen 72, WS-46 Core Learning Loop 39, WS-39 Launch Readiness 33, WS-32
Supporter & Linking 30, WS-36 Stream-2 canon drain 18 (on hold, estate-track), WS-28 V2
finalization 13, WS-54 Store/Billing/Release 12, WS-30 Compliance-Legal 12). Initiative design
can largely wrap these lanes rather than re-derive them.

**F3 — Unbatched Ready+Active pool = 29** (unclaimed, no batch): Store/Billing/Release 7,
Compliance-Legal 7 (human-gated paper), Core Learning Loop 4, Launch Readiness 3, V2 finalization
3, others 5. This is the annex's "unbatched-work governance" question, now with current numbers.

**F4 — 17 open pre-execution rows carry `Fixed In`** (unclaimable-held per fleet rule 1):
WI-2573, 2570, 2504, 2242, 2176, 1801, 1771, 1770, 1753, 1664, 1663, 1659, 1454, 1316, 904, 752,
482. Several are deliberate holds (1663/1664 AI-Act conditionals, 1659 parked plan); the tail
(482/752/904/1316…) needs a hygiene look at roadmap time.

**F5 — Gate spine status (unchanged in shape, moving in parts):**
- **WI-1577** FINAL GATE — Executing, zombie claim (expired 07-21), deterministic NO-GO while the
  legal/compliance cluster is open.
- **WI-1335** store publishing → Ready/Active, human-gated (OPQ-60); **WI-1506** closed beta →
  Ready/Active (needs WI-1764 helplines, Awaiting Info, counsel-gated); **WI-1503** dogfood
  build Ready.
- **Human clocks (the real critical path):** 32 OPQ rows open. Deadlined: **OPQ-102 (DPO
  retainer) + OPQ-110 (DPA loops) → 2026-07-24; OPQ-24 (retention periods) → 2026-07-25** — that
  is *within two days*. OPQ-22 (counsel packet) still Open. 30 of 32 open rows sit under Zuzka's
  authority; only OPQ-90/92 (prod deploy authorization, telemetry read) under Jørn.

**F6 — Non-MentoMate contamination is real but bounded:** 13 of 39 BIDs are other projects
(nexus/ZDX etc.); WS-36 (Stream-2 estate-canon drain, 18 open) and the WI-897..900 governance
cluster are estate-track work living inside the MentoMate project filter — must be fenced out of
(or explicitly bucketed in) the MentoMate roadmap.

## 5 · Implications for the roadmapping work (next steps, pending operator ruling)

1. **Design the Initiative set** (the mandate's core): one proposal is MVP-side Initiatives
   wrapping the delivery lanes (e.g. INI: MVP Launch — with the gate spine; or per-vertical) +
   post-MVP bucket Initiatives (**Fast-follow / Committed / Maybe**) that WS-52 pen items get
   re-tagged into. Decision needed: buckets as Initiatives vs as Workstreams vs as a tag —
   Initiative relation is the operator-named intent.
2. **Pen triage (72 items)** into the three buckets; plus adopt the 2 stray post-mvp-tagged items
   and re-rule the pen's 5 Ready + 1 Reviewing anomalies.
3. **Route the 26 un-workstreamed items** — esp. the consent/family cluster (2532-2535 + 2453),
   which looks MVP-adjacent (consent model correction WI-2535 may be launch-relevant).
4. **Sequence to the MVP gate** — re-anchor on the unchanged spine (WI-1577 → WI-1335 → WI-1506 →
   launch) with the OPQ human clocks as pacing track; batch proposals for MVP + fast-follow only.
5. **Flag now:** the 07-24/25 OPQ deadlines (DPO, DPAs, retention) expire during this planning
   window regardless of the execution hold.

## 6 · Pen triage EXECUTED (2026-07-22, operator-approved refinements)

Three Post-MVP bucket Initiatives minted in the Initiatives DB (Level=Initiative, Status=Active,
Project=MentoMate, Program=PGM-1):

| Initiative | Page | Populated |
|---|---|---|
| **INI-36 Post-MVP: Fast-follow** | `3a58bce9-1f7c-8147-a121-c7c6c49fc359` | 5 — WI-2037, WI-1766, WI-1765, WI-1692 (pen items with explicit fast-follow ruling/provenance) + WI-2536 (adopted orphan, "FAST-FOLLOW" PM ruling 2026-07-20) |
| **INI-37 Post-MVP: Committed** | `3a58bce9-1f7c-8111-a004-da1f3bb641e7` | 0 — starts empty by design; populated by promotion from Maybe |
| **INI-38 Post-MVP: Maybe** | `3a58bce9-1f7c-8151-ad3c-c528b4bb50eb` | 70 — the remaining 68 WS-52 pen items + the 2 post-mvp-tagged strays (WI-2230, WI-2221; workstreams left untouched) |

**Deliberate non-FF calls (transcription discipline — no new judgment):** WI-2150 stays Maybe
(OPQ-117 ruling requires a distinct product review before build — not fast-follow); WI-2115
(WI-1898 recovery slice) and WI-1812 (post-launch prompt-consolidation experiment) penned without
fast-follow language → Maybe.

**MVP-safety check on pen anomalies — all verified not MVP-gating:** WI-2063
(Reviewing/Awaiting-Info — strategy checkpoint record), WI-1916 (pager wiring; email fallback
covers launch), WI-1833 (env-gated live-verification carve of closed WI-1686), WI-1661/WI-1660
(monetization enhancements), **WI-1847 (premise dissolved on current main → close candidate,
flagged for the governed close path)**.

**Not executed (out of ruled scope):** workstream moves, closes, any lifecycle-field edit.

## 7 · MVP initiative EXECUTED (2026-07-22, operator-ruled single-initiative shape)

Operator rejected the 5-way MVP initiative split (overlapped the workstream taxonomy — one fact,
one home). Ruled shape: **the Initiative layer carries exactly the four scope buckets** — MVP /
Fast-follow / Committed / Maybe; workstreams keep the thematic breakdown beneath.

- **INI-35 repurposed** from the empty "MentoMate" shell → **"MVP Launch"** (Level=Initiative,
  Status=Active, Project=MentoMate, Program=PGM-1; Outcome names the gate spine and delegates
  sub-structure to the workstreams). Rationale for repurpose-over-mint: its 5 pre-existing WI
  links were all MVP-side; avoids a dead shell.
- **All 198 MVP-scoped open items tagged** `Initiative=INI-35` (the five MVP columns of the §5
  stage×initiative table: WS-46/38, WS-32, WS-29/30/31, WS-39/54, WS-18/28/33/35/53/55 + legacy-
  lane strays). Verified complete: 0 missing. Pre-existing links rode along correctly
  (WI-1556/2341/2594/2595/2596); **WI-533's stale link cleared** (boundary marker, not MVP work).
- **Untagged by design:** Estate-track 27 (WS-36 + governance strays — proposed out of the
  MentoMate roadmap) and TBD-Unrouted 20 (routing proposals next sitting; consent/family cluster
  WI-2532..2535+2453 needs the operator's MVP-relevance call re WI-2535).

**Initiative layer end-state:** INI-35 MVP Launch (198) · INI-36 Fast-follow (5) · INI-37
Committed (0) · INI-38 Maybe (70) · 47 open items deliberately initiative-less (27 estate-track +
20 unrouted).
