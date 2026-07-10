# MVP Roadmap Initiative — Plan

**Created:** 2026-07-09 · **Owner:** operator (Jørn) + Zuzka (product) · **Agent:** this initiative's sessions
**Goal:** one ratified MVP roadmap for MentoMate — top-down MVP definition anchored in canon, every backlog item mapped to it, gaps captured, quarantine fates executed, roadmap materialized.
**Out of scope:** ZDX/Cosmo/Quartet machinery; WS-34/WS-37 closeout (runs independently); all other MentoMate execution stays on ice until this initiative concludes.

## Context (why)

- Cosmo backlog is two unanchored populations: bottom-up captures (bugs/findings) and pseudo-top-down spec extractions (specs/plans written in isolation, no common PRD/architecture anchor).
- Spec-corpus triage (`_quartet/working/program/spec-triage/`) ran Phases 0–3 (register → 27 disposition sheets → decision pack → 7 product rulings, Zuzka 2026-07-05 / Jørn co-sign 07-06). **Phase 4 (execute fates on ~95 quarantined items) never ran.**
- ROADMAP-A (`_quartet/working/program/audits-2026-07-06/ROADMAP-A-mentomate.md`) merges spec-triage + the Jul-6 codebase audit; all 6 of its decision gates ruled 2026-07-07. It is the input synthesis, not the roadmap of record.

## Phases

| # | What | Who | Deliverable |
|---|------|-----|-------------|
| 1 | **Ground truth**: pull all non-Closed MentoMate WIs (REST script, paginated); classify by provenance / stage / workstream / quarantine membership; verify Phase-3 ballot rulings verbatim from Notion | agent | `inventory.jsonl` + `INVENTORY.md` here |
| 2 | **Top-down MVP definition**: capability tree per user journey (learner loop, guardian/family, onboarding+consent, billing, safety+compliance, languages/voice, notifications, store/publish). Each node: in / out / degraded-at-launch. Folds in all existing rulings; code-verified, not doc-trusted | agent drafts → **Zuzka + Jørn ratify** | `MVP-DEFINITION.md` here (graduates to canon after ratification) |
| 3 | **Fit/gap analysis**: map every inventory item to a definition node. Outputs: coverage matrix (per capability: shipped/partial/missing + closing WIs), orphan WIs (map to nothing), gaps (no code + no WI). Reuse spec-triage verifications + FINDINGS-A evidence | agent (fan-out/workflow if volume warrants) | `COVERAGE.md` + `GAPS.md` |
| 4 | **Ruling session**: gaps, contested mappings, definition-vs-backlog conflicts | **Zuzka + Jørn** | rulings recorded |
| 5 | **Materialize**: execute quarantine fates (kills/re-homes/adopts per decision pack §2 + rulings), create gap WIs, sequence into milestones, write roadmap-of-record, doc-hygiene pass (archive shipped/obsolete specs, fix stale headers, triage `2026-07-02-4-strands.md`) | agent | roadmap-of-record (location TBD — revisit at Phase 5) |

## Phase-1 mechanics

Deterministic REST pull (python script, `NOTION_TOKEN` from env) — no LLM for the fetch. Property-derivable classification inline; residual items needing body reads → batched cheap subagents. Provenance buckets: `spec-triage/quarantine` · `codebase-audit (A-xx)` · `coverage-audit (WI-1399–1416)` · `execution-candidates` · `bottom-up bug` · `lane residue` · `launch-ops`.

## Operator involvement (the full list)

1. Ratify MVP definition (Phase 2 exit).
2. Rule Phase-4 gap/conflict list.
3. Calendar-bound externals (independent, already in Operator Queue): OPQ-22 counsel packet, OPQ-5 Doppler secrets, OPQ-6 store gates, OPQ-11 device/beta runs.

## Decisions log

- 2026-07-09: approach approved in principle (operator). MVP definition = standalone doc here, graduates to canon after ratification. Roadmap-of-record location deferred to Phase 5.
- 2026-07-10: Four Strands Q2 ruled item-by-item. Language learning is launch-IN as a minimum credible course spine, not thin chat practice. Missing WIs created: WI-1755 (language-mode safety/eval guard) and WI-1756 (structured meaning-output card/loop); both have Risk/Impact populated and await triage/refine Sprint assignment. Reshape/close WI-1493 once reflected in Cosmo.
- 2026-07-10 (later): **Phase 4 ruling session COMPLETE.** Q1–Q6 and Q8–Q10 all operator-ruled and recorded in MVP-DEFINITION.md + Cosmo; Q7 is a pre-wired counsel-wait (not a blocker — both outcomes designed). Highlights: Q4 credit-not-movement; Q5 AI-Act pre-wired conditional (1659+1195 IN; 1663/1664 staged on classification; classification escalated time-critical, enforcement 2026-08-02); Q8 se-032 never-notify stands, WI-1690 rescoped; Q9 13+ = launch floor, not forever cap; Q10 13+-only family model, WI-1185 OUT.
- 2026-07-10 (later): Phase-5 sequencing started — first-cut dependency-ordered runway drafted at `RUNWAY-DRAFT.md` (Waves 0–3 + FILL pick-list + pressure valves); **operator ACCEPTED same day**. Still open inside it: calendar anchoring + lane allocation.
- 2026-07-10 (later still): residual rulings batch (operator "yes to all"): F4 — S6-deferred stands, WI-1308 rewritten post-launch; G8 — ONE batch trust-package design pass (WI-1767 created, blocks 1497/1498/1499/1501/1502); pricing confirmed (Free 10/day+100/mo, Plus 700/mo = launch numbers); Phase-5 execution go. Executed: gap-WIs WI-1761 (G2 denial audit), WI-1762 (G3 analytics sink), WI-1763 (G4 voice-floor audit), WI-1764 (G5 helplines, counsel-gated), WI-1765/1766 (G7 D1/D3 fast-follow, Parked); G6+G9 folded into WI-1109/1114/1561 notes; F2 (1570→dup of 1689) + F3 (1117→dup of 1328) merged-and-parked; F5 (1416) parked against ballot. All gaps in GAPS.md now closed; flags F1–F9 resolved/executed, F10 open (rides the quarantine-fate batch). Remaining Phase-5 tracks: quarantine-fate execution (~95 items) + F10 re-homes + doc-hygiene pass.
- 2026-07-10 (later still): **quarantine-fate batch EXECUTED** — 47 Cosmo WIs written + verified (fate note + State per COVERAGE buckets, rationale from decision-pack §2 cross-checked against ratified MVP-DEFINITION). 27 parked (post-MVP/killed/OUT — closes stay with the review gate), 20 note-only. Corrections found en route: WI-1486 + WI-1454 are FILL (ruled), left Active; WI-1451's adopt-MVP-IN disposition was never confirmed at ratification — flagged on the item for triage, NOT parked; WI-1692's guardian-notification half contradicts the Q8 never-notify ruling — noted for re-scope. **F10 resolved:** all 11 machinery items verified correctly filed under MentoMate (WI-1299 is NOT a Nexus misfile — its defect is this repo's own notion skill); classified machinery/excluded-from-roadmap, zero Project repoints. Remaining Phase-5 track: doc-hygiene pass = executing WI-1439/1460/1397 (docs-lane carriers; claimed execution, not bookkeeping) + roadmap-of-record location decision.
- 2026-07-10 (close-out rulings, operator): **WI-1451 RULED IN** — finish-or-hide the silent "keep this" CTA for launch; added to RUNWAY Wave 1E, ruling note on the item. **Roadmap-of-record RULED:** graduated to `docs/plans/2026-07-10-mvp-roadmap/` (MVP-DEFINITION + RUNWAY copies with graduation banner); `_wip/mvp-roadmap/` stays the working dir. **Calendar anchoring + lane allocation DEFERRED** — non-blocking; anchor when counsel/DPO lead times firm up. Initiative committed to main same day.
- 2026-07-10 (residual-14 batch, operator "adopt all"): the last un-ruled block closed. **IN (Wave 2/3):** WI-1655 (device evidence, with beta), WI-1288 (FK repoint), WI-1371 (trial-v2 coverage), WI-1379 (cascade un-gate before 779), WI-1334 (flag combos), WI-1162 (GDPR-export fields). **OUT/post-launch (parked):** WI-779, WI-1395, WI-1396, WI-1456, WI-1458, WI-1110 (conditional on WI-1115), WI-1116. **WI-904 corrected:** operator flagged it as done — verified SHIPPED in PR #1826 (d15e534a5); stale Backlog item, close Done via review gate, NOT ruled OUT. Cosmo notes written + verified; gen-app-data.py fully refreshed (zero ratify items remain; GAPS/FLAGS annotated closed); RUNWAY Wave 2 hardening line added.
