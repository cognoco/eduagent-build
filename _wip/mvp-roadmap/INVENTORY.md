# Backlog inventory — Phase 1 ground truth

**Pulled:** 2026-07-09 (Notion REST, live). **Source:** Work Items DB, `Project = MentoMate`, `Stage ≠ Closed`. Raw data: `inventory.jsonl` (one JSON per WI). **Overlay:** 3 gap-capture rows added 2026-07-10 (`WI-1754`, `WI-1755`, `WI-1756`), so local roadmap data now tracks 204 rows.

## Totality

**201 non-Closed MentoMate work items in the original pull; 204 rows in local roadmap data after the 2026-07-10 gap captures.**

| By stage | | By priority | | By type | |
|---|---|---|---|---|---|
| Ready | 87 | P1 | 51 | Task | 59 |
| Captured | 68 | P2 | 87 | Enhancement | 40 |
| Backlog | 20 | P3 | 57 | Bug | 27 |
| Executing | 18 | (none) | 6 | Design | 21 |
| Refining | 8 | | | Docs/Hygiene/other | 54 |

**By workstream:** Launch Readiness 22 · Core Learning Loop 18 · V2 finalization 15 · Compliance—Legal 14 · Identity Cutover 13 · Compliance—Engineering 13 · Four Strands 11 · Dev-Infra 9 · Stream 2 canon-drain 9 · Supporter & Linking 8 · Mobile UX/Nav 7 · Safety & Eval 6 · Platform Hardening 5 · Bug Lane 3 · misc 2 · **no workstream 47**.

**By provenance (mechanical):** Quarantine sprint 65 · Execution Candidates sprint 18 · other 118.

## Findings / flags

1. **Spec-triage Phase 4 is PARTIALLY executed** (correction to the repo-only read):
   - 10 of the ruled kills/merges ARE Closed (1495, 1490, 1487, 1450, 1489, 1440, 1481, 1482, 1484, 1508).
   - Still open despite rulings: **WI-1494** (RLS umbrella — ruled superseded, still Captured) · **WI-1457** (preview lesson — ruled OUT for MVP, still Ready).
   - The ratified MVP-13 all exist; 2 already Closed (1393 supporter-linking, 1449 guard); rest Ready/Refining/Captured — none homed to a launch-scoped workstream consistently.
   - **65 items still sit in the Quarantine sprint** (incl. 3 NEW additions from 2026-07-06 Maestro-CI findings — quarantine is being used as general intake now).
2. **ROADMAP-A Phase-0 rulings WERE materialized**: WI-1685–1692 created 2026-07-07 (V2 routing cutover, judge flags, cache program, activation events, A-03 crisis slices). All Captured, **no workstream**.
3. **47 items have no workstream** — includes the entire Jul-7 roadmap capture batch, the Jul-6 verified-learning-loop slices (1658–1667), most Quarantine billing/continuity items, and 2 stale Jun-14 launch-secret items (747/748 — likely duplicates of OPQ-5/6 territory).
4. **18 items are Stage=Executing while execution is on ice** — spread over 8 workstreams (Safety & Eval 5, Platform Hardening 4, Compliance-Legal 3, …). Unless these map to WS-34/WS-37, most are **stale claims** needing reset or explicit exemption. (WS numeric IDs not resolved in this pull; verify before resetting.)
5. Probable misfiles into MentoMate: WI-1299 (fleet-wide notion-skill fix), 1 item in "Quartet Runtime" WS, 1 in "Harness hygiene" sprint — machinery, not product.
6. New since triage: an **EU AI Act cluster** (WI-1659/1663/1664, Compliance-Legal, Executing) — post-dates the spec-triage and ROADMAP-A; must be represented in the MVP definition's compliance node.

## Phase-4 ruling overlay — Four Strands (2026-07-10)

The raw inventory still contains 11 Four Strands workstream items. They are no longer an unresolved Q2 bundle:

- **Launch-IN narrow slices:** WI-1547 (graded input), WI-1548 (repeat-after-me/shadowing), WI-1549 (speaking-attempt persistence), WI-1552 (next-activity selector), WI-1553 (session-end learning summary), WI-1755 (language-mode safety/eval guard), WI-1756 (structured meaning-output card/loop).
- **FILL:** WI-1394 (CEFR browser re-home), WI-1554 (strand-balance / skill-profile UX).
- **OUT/post-launch, unconditionally (2026-07-10 amendment):** WI-1550 (language-native competency profile), WI-1551 (session-to-competency evaluator) — the WI-1553 receipt is derive-from-events, so the earlier receipt-field conditionals are struck.
- **Merged:** WI-1492 → WI-1548 (existing SpeakingPracticeCard is the presumed repeat-after-me surface; Parked, Duplicate close via review gate). WI-1757 → WI-1755 (parallel-creation duplicate of the safety guard; same handling).
- **Reshape/close:** WI-1493 (planning umbrella) once this ruling is reflected in Cosmo.
- **Amendments 2026-07-10 (challenge pass):** WI-1552 AC reshaped (within-session selector exists in `language-session-engine.ts`; gap is cross-session continue path). WI-1548 Blocked-by WI-1447 (target audio needs the locale fix). Degrade line: speaking pair (1548+1549) → meaning-output card (1756) → graded-input upgrade (1547); receipt (1553) last; floor (mode live + 1755 + 1447 + 1552 continue path) never cuts. Cross-vertical yield: language slice yields to the verified-learning slice under date pressure.

G10/G11 were captured as WI-1755/WI-1756 on 2026-07-10; both remain Captured/Active with Sprint unset for triage/refine.

## Phase-1 residue — DONE 2026-07-09

### Provenance (final, `provenance` field in inventory.jsonl)

lane-residue 100 · spec-triage/quarantine 65 · execution-candidates 18 · roadmap-A-phase0-rulings 8 (WI-1685–1692) · verified-loop-slices 7 (WI-1658/1660/1661/1662/1665/1666/1667, from WI-1657's loop spec) · launch-ops secrets 2 (WI-747/748) · machinery-misfile 1 (WI-1299 → verify, likely repoint to Nexus). Zero unclassified.

### Ruled fates EXECUTED in Cosmo (operator ruling 2026-07-09)

- **WI-1448** → Closed/Superseded by WI-1688; claim cleared; rationale comment on page; reference-impl pointer (PR #2017, closed unmerged) commented on WI-1688.
- **WI-482** → Backlog, State=Parked, claim cleared; halt comment on page; branch `WI-482` (1 commit, 32f850b2c) left for future restart.
- WS-34 survivors ruled complete-and-land: WI-1183 (PR #2009), WI-1098 (PR #2011, fix red `main` check first). WI-1436 stays Blocked at Refining (tail of the 1438→1435→1436 chain).

### Phase-3 ballot VERIFIED verbatim (Notion page 3938bce9…6eeb)

All 7 ruled 2026-07-05 (Zuzka), ⚠ items co-signed Jørn 2026-07-06. **Deltas vs ROADMAP-A's paraphrase — the verbatim rulings are richer and bind Phase 2:**

- **Item 4 (D1–D4) was RULED substantively, not deferred:** D1 durable ownership-vs-authorship provenance (auditable parent-on-behalf writes); D2 denial = first-class product state distinct from withdrawn/deletion-pending (unless legal rules erasure — the counsel packet Q2); D3 parking-return = true resumable-object flow (resume/done/dismiss, idempotent); D4 transitive settings reach acceptable, direct shortcuts only for frequent/safety/compliance controls.
- **Item 5 is a full design ruling:** SM-2 and Challenge are two separate mastery axes (never reset/replace each other); blocked = "no high-rigor Challenge yet, route through scaffolded relearning", recovery ladder blocked→relearned→ready_for_recheck→recheck→normal; fix coarse `struggleStatus==='normal'` eligibility. (Now also proposed as MMT-ADR-0031/0032 via WI-1657's spec — reconcile in Phase 2.)
- **Item 6 stronger than "slice":** the whole trust package is *prioritized* as a coherent bonding/habit slice (mentor says it'll be back, creates a plan, intentional return), flag-a-reply moves forward, shake-to-comment support; UX shaped by design discipline.

### Workstream map (for reference)

WS-34 Platform Hardening · WS-37 Seam Hardening (zero non-Closed left) · WS-39 Launch Readiness · WS-46 Core Learning Loop · WS-28 V2 finalization · WS-31 Safety & Eval · WS-30 Compliance-Legal · WS-29 Compliance-Eng (on hold) · WS-33 Mobile UX/Nav · WS-38 Four Strands · WS-18 Identity Cutover · WS-32 Supporter & Linking (on hold) · WS-35 Dev-Infra (on hold) · WS-36 Stream-2 canon drain (on hold) · WS-22 Bug Lane.

### Stranded Executing (14) — RESOLVED 2026-07-09 (operator-approved)

| Category | Items | Outcome |
|---|---|---|
| Delivery queue — finalization | WI-1358, 1365, 1377 (OPQ-10 lifecycle catch-up) + WI-1336, 1340, 1376 (handed to a finalization agent; OPQ-5 secrets confirmed closed) | with finishing agents; claims left intact |
| Gated on operator externals | WI-1307 | stays Executing, State=Awaiting Info + comment (gates: OPQ-11 device run, OPQ-13 WI-1310 reconciliation) |
| Stale claims — EXECUTED | WI-752, 1316, 1507, 1657, 1659, 1663, 1664 | claims cleared, Stage=Ready, State=Parked, ice comment on each; re-entry via roadmap Phases 2-4 |
