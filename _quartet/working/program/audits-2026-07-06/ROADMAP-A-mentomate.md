# ROADMAP A — MentoMate optimization

**Synthesized:** 2026-07-06 · PM (program-manager:fable) · **Inputs:** FINDINGS-A (28 findings, zero P0) + the 7 Phase-3 spec-triage rulings (Zuzka 2026-07-05; Items 2/4/5 co-signed Jørn 2026-07-06).

**Headline.** Code is healthier than its docs imply (4 of 7 dimensions zero-P0). Debt = three themes: dormant-shipped V2 architecture (flag-gated OFF in prod), docs-lag-code, and untapped LLM cost. The 7 rulings resolve every open *product* fork; what remains is a small set of **decision-gated** items (cutover / safety / provider strategy) plus a large mechanical backlog that dispatch can pick with confidence.

> **Consumer:** the MentoMate pipeline (WS-44 → WS-33, operator-guided per the UQ plan). Lands as MentoMate WIs. NOT under a Quartet team unless/until ruled — see SEAM.md for what enabling-layer fixes that would gate.

---

## Phase 0 — DECISION-GATED (rule before dispatch)

These need a ruling first; none is a patch you just apply. Numbered for your ruling.

| # | Item | Source | The fork | Recommendation |
|---|------|--------|----------|----------------|
| 1 | **V2 routing cutover** | A-01 | Enable `LLM_ROUTING_V2_ENABLED` in prod (verify Cerebras/gpt-oss capacity+cost) **OR** mark register/ADR "built, not cut over". Prod runs legacy Gemini-primary today; ADR-0014 + model register describe a state prod doesn't run. Minors protected either path. | **Rule cutover-or-doc-truth.** Pairs with the Item-7 grader bake-off (gates the same routing migration). Don't leave canon lying. |
| 2 | **Suitability-judge flags** | A-02 | Enable `JUDGE_ENFORCEMENT_ENABLED`/`JUDGE_FRAMEWORK_ENABLED` in prod after cost/latency check **OR** record deliberate deferral. "Minors 100% sampled" design is dormant; minors keep 2 deterministic gates + preamble. | **Enable after a cost/latency check** (S config change) — it's a minors-safety layer built and idle. If deferring, record why. |
| 3 | **Safety-event escalation + crisis flow** | A-03 | No blocked-safety event reaches a human; no self-harm/crisis flow exists anywhere. Product + counsel ruling on (a) route blocked events → guardian + human-review queue; (b) crisis detection → resources/escalation. | **Highest-stakes item in the audit.** Rule the shape; likely an identity-foundation epic. Don't ship a minors product without deciding this. |
| 4 | **Prompt-caching provider strategy** | A-09/A-10 | Engineering is dispatchable, but pick the strategy first: which provider(s) get `cache_control` on the stable prefix; est. 50-80% input-token cut on turns 2+. | **Approve caching on the primary provider(s)**; A-10 restructure follows, every edit gated by `pnpm eval:llm`. Biggest cost lever on the board. |
| 5 | **Activation-events wire-or-cut** | A-22 | `POST /v1/activation-events` built, never called from mobile → funnel analytics silently absent. Wire mobile events (M) or delete the route (S). | Ties to **Item 1 ruling (trial preview OUT, revisit with funnel data)** — that ruling *presumes* a working funnel. **Wire it**, else the post-launch funnel data Item 1 relies on won't exist. |
| 6 | **Item 4-D2 legal residual** | Ruling 4-D2 | Co-signed ruling made denial a first-class state "unless product/legal rules denial immediately closes the account." That legal check is still open. | Get the counsel read; it decides whether D2 is a new account-state build or a no-op. |

**Already ruled (carry into execution):** Item 1 trial-preview **OUT for MVP**; Item 2 correctness-chain **fast-follow** (WI-1445 narrow fix stays MVP-eligible — see Phase 2); Item 3 "coming up next" **kill**; Item 4-D1/D3/D4 + Item 5 + Item 6 + Item 7 → phased below.

---

## Phase 1 — Restart-safe dispatch (crisp AC, no ruling)

Audit A's restart-safe shortlist — small, verified, bug-or-guard-shaped, one WI each. Dispatch-ready the moment the pipeline restarts.

| Item | What | Grain | Eff |
|------|------|-------|-----|
| A-12 | dedup-pass empty-`embeddedIds` short-circuit (scans lifetime facts every session-completion) | 1 WI (Bug; pre-declare red-green-revert AC) | S |
| A-13 | memory embed-backfill per-run cap + batched Voyage calls | 1 WI | S-M |
| A-18 | export/delete cross-profile negative tests (GDPR/COPPA-adjacent net) | 1 WI | S-M |
| A-27 | grader `computeAgeBracketFromDate` swap ×2 | 1 WI | S |
| A-15 | parallelize post-persist dispatch trio (+2 sibling selects) | 1 WI | S |
| A-11 | per-flow maxTokens (classify/detect) + cross-provider retry cap | 1 WI | S |
| A-26b | RLS USING policies for the 3 deny-all-today tables | 1 WI | S |
| A-16a/d | session-stale-cleanup chunking; FlatList memoization ×2 | 1 WI (batch) | S |
| A-24-fossils | orphaned coaching-card types + stale learning-mode mocks | 1 WI | S |
| A-08 | OSA C-3 guardian-visible-schema guard test (or register correction) | 1 WI | S |
| A-07 | stale-canon doc/memory fixes (llmRoutingRung in-source, flow count 34, coaching-cards-live) | 1 WI | S |
| A-28 | eval flows for the two safety-adjacent graders (teach-back, suitability judge) | 1 WI + follow-up | M |

---

## Phase 2 — Ratified MVP-quality shortlist (Item 7: all 13, capacity-sequenced)

Ruling: **ratify all 13** for investigation/execution, sequence by capacity + dependency (not all at once). Grouped as specced. **Overlaps with Phase 1 flagged** — dispatch once, not twice.

- **Six live-loop bug fixes:** duplicate review-reminder pushes · review cooldown only written on *decline* · **weak topics never resurfacing** (= A-23 needs-deepening read; Item 5 rules this gets wired to relearning) · wrong-language TTS for launch locales · push-permission toggle not registering on OS grant · billing job silent-fail (violates our own escalation rule).
- **Two finish-or-hide:** "keep this" button silently no-ops · concept-mastery star vanishes when V2 nav becomes default (regression, not feature).
- **Two quality-infra:** zero native E2E — add a smoke baseline before store submit · **auth E2E happy-path-only** (= A-19; add revoked-session/timeout branches).
- **One gate ⚠:** Challenge-Round grader model bake-off — **gates the post-launch LLM-routing migration** (ties to Phase-0 #1 V2 cutover + A-28). Slot before launch while eval capacity exists.
- **One UX:** tutor-language picker (parent-created child stranded with English tutor) + reachability check.
- **One CI guard:** profile-scoped-query-stays-scoped forward ratchet (= A-25a scoped-table AST guard; explicitly NOT the big security-layer activation).

> Item 2's **WI-1445** narrow review-date fix is eligible here per the co-signed ruling — the only piece of the correctness chain allowed into MVP.

---

## Phase 3 — Trust package (Item 6: WI-1497/1498/1499/1501/1502)

Ruling: **prioritize the slice**, bonding/habit-forming emphasis; design-discipline shapes final UX (not invented ad hoc).

| Piece | Note | Sequence |
|-------|------|----------|
| WI-1499 v1 minimal flag-a-reply | telemetry-only safety signal, trivial build | **early** — the one launch-scale piece for a minors product |
| shake-to-comment support (added by ruling) | "shake the app to comment anytime about anything" | early-mid |
| first-week plan · memory checkpoint · support path · visible review promise | each needs a Zuzka design pass first; saturated lanes | design-then-build, post-launch capacity |

---

## Phase 4 — Fast-follow / post-launch

| Item | What | Grain |
|------|------|-------|
| Item 2 | correctness chain WI-1443→1444→1445 (envelope-touching; proper eval runs) — **co-signed fast-follow** | epic (first post-launch) |
| Item 5 | formalize two-axis mastery (retention vs Challenge, neither overwrites SM-2) + `blocked` recovery ladder + eligibility refactor beyond `struggleStatus==='normal'` | 1-2 WIs (data-model + logic) |
| Item 4-D1 | durable ownership-vs-authorship provenance (auditable parent-on-behalf writes) — **schema work** | 1 WI (migration) |
| Item 4-D3 | parking-lot as resumable-object flow (resume/done/dismiss, idempotent) | 1 WI |
| A-14 | progress.ts unbounded session pulls → SQL aggregates (parent dashboard ×N, home widget) | 1 WI (4 sites) |
| A-17 | Workers-edge cache for curriculum/book/topic-map GETs | 1 WI |
| A-05/A-06 | docs reconcile: audience-matrix supersede, PRD shipped-surface gaps, OAuth contradiction | 1-2 WIs (docs) |
| A-20 | targeted GC6 same-subsystem mock conversion (~10-15 files, NOT 164) | 1 WI |
| A-23 | remaining wire-or-cut rulings (interleaved-sessions read, quick-check, teaching-pref writer) | 1 triage WI → 3-5 exec |

---

## Kills / cuts (ruled or audit-recommended)

- **Item 1** trial preview lesson (WI-1457) — OUT for MVP; kill-note records the idea; revisit with funnel data.
- **Item 3** "coming up next" recaps (WI-1483) — kill/supersede; re-capture only on engagement data.
- **A-24** uncalled-route long tail + fossils — one cleanup batch *after* A-23 wire-or-cut rulings.

---

**Decision surface for you:** Phase-0 items 1-6. Everything else executes mechanically once the pipeline restarts. Recommended ruling order: #3 (safety — highest stakes) → #1 (V2, unblocks the grader gate) → #4 (caching, biggest cost lever) → #2 → #5 → #6.
