# MVP Runway — first-cut sequencing (DRAFT for ratification)

**Status: v0.2 (2026-07-10) — ACCEPTED by operator ("this is fine"), wave structure stands.** Derived from the fully-ruled `MVP-DEFINITION.md` (Q1–Q10 ruled; Q7 pre-wired counsel-wait). Still open inside it: calendar anchoring (target go-live date) and lane allocation — both operator calls, non-blocking for Phase-5 continuation. This is the *sequencing* half of Phase 5 (`PLAN.md`); quarantine-fate execution, gap-WI creation, and the roadmap-of-record location decision are separate Phase-5 tracks.

**Sequencing principles used:**
1. Longest-lead externals start first (counsel, DPO) — they gate, they don't build.
2. Safety/observability guards land **before** the features they protect become visible.
3. Dependency order within slices (e.g. TTS locale fix before speaking pair; mastery-axis rule before anything that writes "verified").
4. The ruled degrade lines and the cross-vertical yield (§3/§6 of MVP-DEFINITION) are the pressure valves — the runway is built so the floor-items land earliest within each slice.
5. FILL items are never scheduled — they fill capacity gaps opportunistically and are listed only as a pick-list.

**Launch gates (already ruled, restated):** store go-live = technical launch; public launch gated by closed beta (WI-1506, 5–10 families screened for 13+ teens). THE compliance gate: DPIA signed + DPO appointed before the first consent-gated child onboards (C-5).

---

## Wave 0 — Unblock & protect (start immediately, all parallel)

The items whose *lateness* hurts most. Nothing here is speculative; each either gates a later wave or protects something already live.

| # | Item | Why first |
|---|------|-----------|
| 0.1 | **OPERATOR: dispatch counsel packet (OPQ-22)** with the AI-Act Annex-III classification question flagged **time-critical** (enforcement 2026-08-02) | Longest lead; Q5/Q7 conditionals + privacy-policy publish all wait on answers |
| 0.2 | **OPERATOR: DPO appointment + DPIA signing path** (WI-1105/1106) | THE launch gate (C-5); pure lead time, no build dependency |
| 0.3 | **WI-1167 — fix broken staging deploy migration**, then the **V2 LLM-routing cutover chain** (WI-1685: bake-off → staging gates → prod flip) | F6: 1167 silently gates 1685's staging validation — sequence it first. Cutover is the platform prerequisite for prompt caching + per-tier routing; rollback = flag flip |
| 0.4 | **Challenge grader bake-off** (WI-1438) | Gate for the entire verified-learning spine |
| 0.5 | **WI-1469 — mastery-axis rule** (define verified / due-again / stale / mastered) | Everything that says "verified" depends on this definition |
| 0.6 | **WI-1666 — loop e2e/eval pack scaffold** | Ruled "early, before visible rollout" |
| 0.7 | **WI-1755 — language-mode safety/eval guard** | Ruled "sequence before any visible Four Strands rollout" |
| 0.8 | **WI-1447 — wrong-language STT/TTS locale fix** | Blocks WI-1548 speaking pair; visibly breaks the language promise while open |
| 0.9 | **Sentry re-enable (WI-1336) + launch-health alerts (WI-1500)** | Observability before the feature waves change behavior |
| 0.10 | **WI-1659 — AI Act compliance plan / classification self-assessment** | Q5: IN unconditionally; its output pairs with the counsel answer |

## Wave 1 — The two product verticals (core build)

Runs after Wave-0 guards exist. Two slices in parallel; **if both cannot land, the language slice yields** (ruled cross-vertical yield).

**1A. Verified-learning receipt loop** (Challenge proof → scheduled review → learner promise → parent receipt):
- Engine spine (never cuts): WI-1446 (needs_deepening promotion/expiry) → WI-1464 (Challenge calibration + staging-beta readiness) → **WI-1754 (controlled prod flip, cohort-limited, after engine gates pass)**.
- Proof slice (degrades to days-later under pressure, per ruled degrade line): WI-1445 (narrow nextReviewAt write, after 1469) · WI-1502 (review-promise card) · WI-1703 (provenance/verification taxonomy — before launch copy says "verified") · WI-1121 (Now-feed read-time projections) · WI-1658 + WI-1705 (one V2 parent-home receipt card + tap-through).

**1B. Language course spine** (floor first, then reverse degrade order):
- Floor: WI-1552 (cross-session continue path — extend existing selector).
- Then: WI-1547 (graded-input upgrade) → WI-1756 (meaning-output card + correction/retry) → WI-1548 + WI-1549 (speaking pair, together; needs 1447 from Wave 0).
- Receipt: WI-1553 (session-end summary, derive-from-events) — degrades **last**.

**1C. Family/supporter chain** (beta-operator first-session path): WI-1127 (coldstart route) → WI-1135 (cold-start surfaces) → WI-1137 (linking-ceremony screens; person-picker must cover the teen path) → WI-1753 (cross-account existing-teen family join).

**1D. Trust package** (WI-1497/1498/1499/1501/1502): **Zuzka design pass first**, then capacity-shaped builds.

**1E. Ratified-13 loop bugs + reachability:** WI-1466 (cooldown), WI-1461 (dual push-cron), WI-1441 (push permission wiring), WI-1496 (tutor-language picker), WI-1451 (finish-or-hide the silent "keep this" CTA — ruled IN 2026-07-10).

**1F. Activation events (WI-1689)** — instrument before beta so the beta measures something.

## Wave 2 — Compliance materialization + hardening

Mostly counsel-answer consumers and pre-publish obligations; overlaps Wave 1 where independent.

- **Compliance core:** DPIA sign + DPO complete (from 0.2) · ROPA (WI-1107) · breach plan (WI-1108) · Art-9 ruling (WI-1111) · lawful-basis record (WI-1193) · retention values (WI-1194) · processor DPAs/TIAs (WI-1192).
- **Counsel-answer consumers:** controller entity (WI-1559) → privacy-policy publish + child summary + false-claims fix + 13+ floor stated (WI-1109) · name-minimization arm (WI-1558) · consent-denial state build (Q7 pre-wired) · crisis legal floor (Q3 → WI-1690 already rescoped: no guardian notification).
- **AI Act:** WI-1195 (Art-50 in-chat disclosure — unconditional) · WI-1663/1664 **only if** counsel classifies high-risk (then they become launch-gating — replan immediately).
- **Safety:** suitability-judge enablement (WI-1686) · blocked-event digest (WI-1691) · crisis slice build (WI-1690, rescoped).
- **Billing before paid launch:** payment-failed notify (WI-1555/1474) · past-due banner (WI-1475) · silent-fail escalation (WI-1399).
- **Platform:** prompt caching (WI-1687→1688, post-cutover) · spend guardrails + kill switch (WI-1505) · Maestro CI fixes (WI-1651 + WI-1652 — make the e2e gate real) → Maestro smoke baseline (WI-1400) + auth-resilience subset (WI-1406) · dev/preview flag-combo ruling (WI-1334).
- **Hardening (residual-14 batch, ruled 2026-07-10):** concepts FK repoint + migration 0129 (WI-1288) · trial-v2 integration coverage (WI-1371) · account-deletion v2 cascade un-gate (WI-1379 — must precede the post-launch WI-779 flag collapse) · v2 billing fields in GDPR export (WI-1162).

## Wave 3 — Publish & beta

- **Store/launch-ops (OPQ-6 wave B):** RevenueCat purchases (WI-1328) · store listings (WI-1335) · APNs/FCM prod creds (WI-1337) · age rating + declarations at 13+ (WI-1114) · country availability/hard-blocks (WI-1115) · data-safety worksheet refresh (WI-1561).
- **Shell:** V2 publish-readiness chain (WS-28 + WI-1307 fallback proof) — spans Waves 1–3; must conclude here.
- **Final gates:** launch compliance closure re-run (WI-1507) · **WI-1577 FINAL GATE pre-store-submission re-run**.
- **Dogfood prod build (WI-1503) → closed beta (WI-1506, families screened for 13+ teens; WI-1655 device-evidence batch runs with it) → store go-live → public launch.**

## FILL pick-list (never scheduled; grab when a lane idles)

WI-1704 (evidence-links substrate; promote only if 1658 proves need) · WI-1465 (re-prove path) · WI-1454 (concept-targeted review) · WI-1665 (recap consumption — IN only if the launch shell renders recaps) · WI-1394 (CEFR browser re-home) · WI-1554 (strand-balance telemetry) · WI-1486 (mic-permission timing) · WI-1134 (Journal hygiene) · WI-1259 (age-gate mirrors).

## Standing pressure valves (ruled, restated for the runway)

- **Verified-learning degrade:** proof presentation (1445/1502/1658/1703) may slip to days-later; the engine spine (1469→1464→1754 + 1666) never cuts.
- **Language degrade order:** speaking pair → meaning-output → graded-input; receipt last; floor (mode live + 1755 + 1447 + 1552) never cuts.
- **Cross-vertical yield:** language yields to verified-learning.
- **Conditional replan trigger:** counsel says Annex-III high-risk → WI-1663/1664 promote to launch-gating; Wave 2/3 re-sequenced around them.

## Open sequencing inputs (operator)

1. **Calendar anchoring** — **DEFERRED (operator, 2026-07-10):** waves are dependency-ordered, not dated; work starts on Wave 0 without a date. Anchor the target store-go-live date when the counsel/DPO lead times firm up; it back-propagates onto Wave 3.
2. **Lane/agent allocation** — **DEFERRED (operator, 2026-07-10)** alongside calendar anchoring.
3. **Roadmap-of-record location** — **RULED 2026-07-10:** graduated to `docs/plans/2026-07-10-mvp-roadmap/` (MVP-DEFINITION + RUNWAY, the citable pair); `_wip/mvp-roadmap/` remains the working dir (inventory, coverage, scripts, provenance).
