# FINDINGS-A — MentoMate deep app audit

**Auditor:** Fable (`fable:audit-mentomate`) · **Date:** 2026-07-06 · **Method:** 7 parallel
subsystem agents (4× Opus, 3× Sonnet) + 6 child sweeps, Fable synthesis. Read-only; no product
code changed. Two claims independently verified against prod Doppler by the auditor (flags
absent → default false). Evidence spot-verified by agents reading source, not grep alone.

**Headline judgment.** The codebase is in materially better shape than its documentation
implies. Architecture layering, data-model governance, consent, age gating, and Inngest
discipline are all strong and *enforced* (ESLint guards, forward ratchets, RLS manifests,
guard tests) — four of seven dimensions returned zero P0/P1 code defects. The real debt
concentrates in three themes:

1. **T1 — Dormant shipped architecture.** The ADR-0014/0016 V2 posture (gpt-oss primary
   routing, suitability-judge layer) is built, tested, and documented as canon — but
   flag-gated OFF in production (both flags verified absent in Doppler prd). Prod runs
   legacy Gemini-primary routing with no LLM suitability judging. Minors remain protected
   by deterministic gates + the in-code Gemini under-18 ban on both flag paths.
2. **T2 — Docs lag code.** PRD self-contradictions, ~8 shipped-but-undocumented surfaces,
   a self-disclaimed stale audience-matrix whose gaps are actually closed, stale AGENTS.md
   /ADR notes, a model register describing a target state prod doesn't run.
3. **T3 — Cost left on the table.** Zero prompt caching anywhere; the 1456-line tutor
   system prompt is resent in full every exchange. Plus retry amplification and a
   universal 8192-token output ceiling.

No P0 (exploitable / data-loss / minor-safety hole) was found. Severity scale: P0 blocks
correctness/safety now; P1 significant product/compliance/cost impact; P2 moderate; P3 hygiene.

---

## Findings register

Format: **ID · Severity · Dimension** — what · evidence · fix · effort · Cosmo-grain ·
survives-triage confidence (H/M/L).

### Theme T1 — dormant shipped architecture (the strategic block)

**A-01 · P1 · D4 LLM** — V2 routing posture dormant in prod: `routingV2Enabled` defaults
false (`apps/api/src/services/llm/router.ts:405`, comment ":794 'With V2 off (production
today)'"), and `LLM_ROUTING_V2_ENABLED` is **absent from Doppler prd (verified 2026-07-06)**.
Prod routes all non-minor learners to Gemini-primary (`router.ts:856-885`); the ADR-0014
target (gpt-oss-120b primary, per-tier routing) and `docs/registers/llm-models/master.md`
describe a state prod doesn't run. Minors are protected either way (WI-1052 under-18 gate,
`router.ts:803`). · Fix: an explicit cutover ruling — enable V2 in prod (verify
Cerebras/gpt-oss capacity + cost) OR mark register/ADR "built, not cut over". · Effort: M
(cutover) / S (doc-truth). · Grain: one decision WI, then one execution WI. · Survives: **H**.

**A-02 · P1 · D5 safety** — Suitability-judge layer OFF in prod: `JUDGE_ENFORCEMENT_ENABLED`
and `JUDGE_FRAMEWORK_ENABLED` default false (`config.ts:200,189`) and both are **absent from
Doppler prd (verified 2026-07-06)**. The "minors 100% sampled" design
(`policy-engine/judge-profile.ts:25-43`) is dormant in prod; minors get the two deterministic
gates (dangerous-procedure WI-1154, minor-PII echo WI-1348) + safety preamble only. · Fix:
enable flags in prd after a cost/latency check (config change, S) — or record the deliberate
deferral. · Effort: S (+ verification pass). · Grain: one decision WI + one config/verify WI.
· Survives: **H**.

**A-03 · P2 (product-ruling class) · D5 safety** — No safety-event escalation to any human,
and no crisis/self-harm flow anywhere: blocked-safety events (`emitDangerousProcedureBlockedEvent`,
`emitMinorPiiEchoRedactedEvent`, suitability violations) go to telemetry only — zero Inngest
consumers, zero guardian-notification path; grep for self-harm/crisis/helpline/988 across api
+ mobile → nil. For a minors-core product this is a safety-net absence, not a code bug. ·
Fix: (a) route blocked-safety events to guardian-notification + human-review queue; (b) crisis
-disclosure detection → resources/escalation flow. Product + counsel ruling first. · Effort:
M-L. · Grain: epic (needs decomposition; likely identity-foundation runway). · Survives: **H**
as a decision item; execution shape TBD.

**A-04 · P2 · D3 features** — `MANAGED_TIER_ACTIVE` flag set nowhere visible (eas.json,
ci.yml, .env.example all absent; `feature-flags.ts:33`, since 2026-06-20) — possibly
Doppler-gated, possibly unshipped scaffold. FL-1/FL-2 (V0 dead-weight off-arm, V1 prod cutover
stalled) are deliberately frozen on the S6 ruling — not independent WIs. · Fix: verify
MANAGED_TIER intent + config; fold V0/V1 into the existing S6 decision. · Effort: S. · Grain:
one small WI. · Survives: M.

### Theme T2 — docs lag code

**A-05 · P1 · D3 features** — Audience-matrix (`docs/audience-matrix.md`) is unreliable and
stale: self-disclosed reconstruction (lines 3-7, 114), last verified 2026-05-23, and its
home-branch claim contradicts current `home.tsx:165-166` (WI-729). Meanwhile **all 5
contract-scope gaps (F5-F8, F11) are verified closed in code** and F1 (IDOR) is fixed
(`routes/profiles.ts` getPersonScope). AGENTS.md still cites it as the audience canon. · Fix:
re-derive or mark superseded by `navigation-contract.ts` + flow-inventory; update the F-table
to verified states. · Effort: M. · Grain: one WI. · Survives: **H**.

**A-06 · P1 · D3 features** — Shipped surfaces absent from PRD: scopes/multi-persona switching
(`apps/api/src/routes/scopes.ts`), dictation flow (`apps/mobile/src/app/(app)/dictation/`),
journal tab (`(app)/journal/`) — P1; celebrations, nudges, book/topic suggestions, snapshot-
progress/recaps, notices — P2/P3. Plus PRD self-contradiction on OpenAI OAuth (scope table
~l.135 "implemented" vs FR1 ~l.970 "not yet" — code says implemented, `lib/clerk-sso.ts`). ·
Fix: one PRD reconciliation pass. · Effort: M. · Grain: one WI (docs). · Survives: **H**.

**A-07 · P3 · D4 LLM** — Stale canon notes: AGENTS.md/ADR-0014 say `ExchangeContext.llmRoutingRung`
is "planned — not yet in source"; it IS in source (`exchange-types.ts:180`,
`session-exchange.ts:298,2502`, consumed `exchanges.ts:1839,2127`). Eval-harness flow count is
34, docs/memory say 23. MEMORY.md "coaching cards REMOVED" is wrong (BaseCoachingCard live at
`ParentHomeScreen.tsx:956`; `coaching_card_cache` is the live home-surface store). · Fix: doc
+ memory corrections. · Effort: S. · Grain: one WI (batch with A-06 possible). · Survives: **H**.

**A-08 · P3 · D5 safety** — Compliance-register row C-3 (OSA "no verbatim learner quote in
guardian-visible schema") claims a CI guard that doesn't exist; property holds in practice
(family-bridge carries curriculum metadata only) but by convention. · Fix: add a forward-only
guard test on guardian-visible schemas OR correct the register. · Effort: S. · Grain: one WI.
· Survives: **H**.

### Theme T3 — LLM cost levers

**A-09 · P1 (cost) · D4 LLM** — Prompt caching entirely absent: no `cache_control`/ephemeral
anywhere in `services/llm/`; Anthropic adapter sends `system` as plain string
(`providers/anthropic.ts:140`); the tutor system prompt (built by `exchange-prompts.ts`,
1456 lines — the largest builder) is resent in full every exchange with history + sources.
Est. 50-80% input-token cost reduction on turns 2+ (input dominates multi-turn tutoring cost).
· Fix: cache the stable prefix on the primary provider(s). · Effort: M. · Grain: one WI
(provider adapter + router plumbing). · Survives: **H**.

**A-10 · P2 · D4 LLM** — Cache-friendly prompt restructure: `exchange-prompts.ts` interleaves
stable rules with volatile per-turn content and repeats the 0.88/review/source-discipline
blocks; reorder stable prefix first + consolidate to maximize A-09 hits and trim raw tokens. ·
Effort: M. · Grain: one WI, sequenced after A-09; every edit gated by `pnpm eval:llm`. ·
Survives: **H** (as A-09's follow-on).

**A-11 · P2 · D4 LLM** — Output over-provisioning + retry amplification:
`MIN_REPLY_MAX_TOKENS = 8192` applied to every call including rung-1 classify/detect
(`router.ts:325`); `MAX_RETRIES = 3` runs on primary then again on fallback (`router.ts:1397`)
→ up to ~8 attempts on hard outage. · Fix: per-flow maxTokens for classify/detect/dedup; cap
total cross-provider attempts. · Effort: S. · Grain: one WI. · Survives: **H**.

### Perf / correctness (bug-shaped, crisp)

**A-12 · P1 · D6 perf** — Memory-dedup fallback scans entire lifetime fact history with
per-candidate DB/LLM fan-out: `services/memory/dedup-pass.ts:90-107` — when `embeddedIds` is
empty (any zero-new-fact session, or Voyage soft-fail path `session-completed.ts:1573-1591`)
the fallback loads ALL active facts and runs ~5-8 sequential round trips each, inside the
`dedup-new-facts` step of **every session completion**. Mature profile = hundreds of
candidates. · Fix: short-circuit on empty `embeddedIds`; move full-history reconciliation to
a capped cron. · Effort: S. · Grain: one WI (Bug — pre-declare red-green-revert in AC). ·
Survives: **H**.

**A-13 · P2 · D6 perf** — `memory-facts-embed-backfill.ts:96-287`: uncapped backlog drain
(no per-run cap, unlike sibling `memory-facts-backfill.ts`) + one Voyage HTTP call per row
(`embeddings.ts:110-123` sends `input: [text]` singly; Voyage accepts arrays). · Fix: per-run
cap + self-reinvoke (sibling pattern) + batch texts per call. · Effort: S-M. · Grain: one WI.
· Survives: **H**.

**A-14 · P2 · D6 perf** — `progress.ts` unbounded full-history session pulls in four read
paths: `getSubjectProgress` (:263-268), `getOverallProgress` (:602-611),
`getOverallProgressBatch` (:922-930, ×N children on every parent-dashboard load — worst),
`getLearningResumeTarget`/`getContinueSuggestion` (:1523-1530/:1783-1788, home-screen widget ≈
every app open). All pull full per-subject session history into JS then sort/reduce; the rest
of dashboard/retention/snapshot already push aggregation to SQL (BUG-250 24-month pattern). ·
Fix: SQL aggregates / `ORDER BY … LIMIT 1` / windowing, mirroring snapshot-aggregation. ·
Effort: M. · Grain: one WI (4 sites, one pattern). · Survives: **H**.

**A-15 · P2 · D6 perf** — Per-message dispatch trio serialized: `session-exchange.ts:3530,
3548,3561` — `maybeDispatchTopicProbeExtraction` / `maybeDispatchReviewCalibration` /
`maybeDispatchSuitabilityJudge` each run their own FOR-UPDATE txn + send, sequentially, on
every message. Independent (distinct metadata keys, no cross-reads). · Fix: `Promise.all`.
Two smaller siblings: vocabulary double-select (:2302-2328), strong-topic vs urgency-boost
(:2618-2666). · Effort: S. · Grain: one WI. · Survives: **H**.

**A-16 · P3 · D6 perf** — Small-perf batch: (a) `session-stale-cleanup.ts:41-97` sends
unchunked event arrays (siblings chunk at 500; bounded today, spikes after downtime);
(b) `monthly-report-cron.ts:292-409` ~8 sequential independent lookups per pair (monthly, low
freq); (c) `daily-reminder-scan.ts:43-82` / `recall-nudge.ts:53-116` no defensive `.limit()`;
(d) FlatList memoization missing in `my-notes/[kind].tsx:416-515` and
`vocabulary/[subjectId].tsx:292-303` (per-keystroke row re-render). · Fix: each S, mechanical.
· Grain: one batch WI or 2-3 small WIs. · Survives: **H** (a,d) / M (b,c).

**A-17 · P3 · D6 perf** — No Workers-edge caching for rarely-changing curriculum/book/topic-map
GETs (zero `caches.default` usage in apps/api; KV only for subscription/idempotency); every
cold app-launch round-trips Neon. Mitigated client-side by 5-min TanStack staleTime. · Fix:
Cache API keyed profileId+subjectId+version with purge-on-write. · Effort: M (invalidation
design). · Grain: one WI. · Survives: M.

### Test economy

**A-18 · P1 · D7 tests** — Export/delete have ZERO cross-profile/ownership negative tests:
`services/export.test.ts` + integration and `identity-v2/export-v2.integration.test.ts` /
`deletion-v2.integration.test.ts` are all happy-path (grep for wrong-account/403 → zero). The
production gating itself is verified correct (owner + account dual-assert, `routes/account.ts:52,
159,291`) — this is a missing regression net on a GDPR/COPPA-adjacent surface, not a live hole.
· Fix: negative-path tests attempting cross-profile export/delete, asserting rejection
(red-green-revert pattern). · Effort: S-M. · Grain: one WI. · Survives: **H**.

**A-19 · P2 · D7 tests** — Remaining top missing negative paths, ranked: age-bracket spoofing
at the actual gate (only pure date-math + lint-guard tested today); consent-withdrawal
mid-session race; RevenueCat webhook replay/signature parity with Stripe (unverified);
deletion-cancellation race at export boundary. · Effort: S-M each. · Grain: 2-4 WIs (or one
bundle). · Survives: **H** (first two) / M (latter two).

**A-20 · P2 · D7 tests** — GC6 internal-mock backlog quantified: 164 files (api 140, mobile
24, excl. the GC1 self-test); mostly defensible route-isolation. True low-value core = ~10-15
files where the mocked module IS the subsystem under test (e.g. `routes/billing.test.ts`
mocking `../services/billing`; worst counts: account 10, sessions 9, sessions-proxy-guard 9,
sessions-library-filing 9, filing 8). Overall low-value share of the 12.7k suite ≈ 3-6%. ·
Fix: targeted `jest.requireActual()` conversion of the same-subsystem set only — NOT a blanket
164-file burn-down. · Effort: M. · Grain: one WI (targeted list) feeding the existing GC6
boy-scout rule. · Survives: M-H.

**A-21 · P3 · D7 tests** — No CI test-timing artifacts (no data-driven slow-suite ranking
possible; 125 files use real-timer waits). · Fix: archive `jest --json --outputFile` in CI. ·
Effort: S. · Grain: one WI. · Survives: M.

### Feature surface (wire-or-cut decisions)

**A-22 · P1 · D3 features** — `POST /v1/activation-events` built for mobile funnel ingest
(app_opened/signup_started per route comment) but never called from mobile → funnel analytics
silently absent. · Fix: product ruling — wire mobile events (M) or delete the route (S). ·
Grain: one decision + one execution WI. · Survives: **H**.

**A-23 · P2 · D3 features** — Half-built loops with a write side and no read surface / no
caller (verified against the typed RPC client, 226 endpoints): needs-deepening read
(`retention.ts:136` — challenge-round policy writes `needs_deepening_topics`, nothing reads);
interleaved sessions FR92 (`sessions.ts:1563` — mobile only renders the label); quick-check
(`assessments.ts:439`); dashboard topic-snapshot; teaching-preference PUT/DELETE (mobile only
GETs — the WI-1160 null-clear carve-out has no mobile writer). · Fix: per-item wire-or-cut
ruling; each is one small WI once ruled. · Effort: S-M each. · Grain: one triage-decision WI
spawning 3-5 executions. · Survives: M-H.

**A-24 · P3 · D3 features** — Uncalled-route long tail (10 more: subscription cancel/portal,
homework POST, book-suggestions/all, quiz prefetch, dictation streak, consent/respond,
subjects/:id GET, profiles/:id GET, export-text self-variant, topic-note DELETE) + fossils
(orphaned `CoachingCardType`/`CoachingCardEndpointResponse` in `packages/schemas/src/progress.ts:432,1060`;
stale learning-mode `{mode:'casual'}` test mocks in `session-cache.test.ts:319,340`,
`session-summary/[sessionId].test.tsx:329`). Mobile→API direction is clean (zero calls to
nonexistent endpoints — typed RPC). Inngest: 86 functions, exactly ONE orphan
(`graduationNarration`, deliberate, allowlisted in `orphan-handler.guard.test.ts:98` pending
S5). · Fix: one cleanup batch after A-23 rulings. · Effort: S-M. · Grain: one WI. · Survives: M.

### Governance / enforcement-surface (P3, optional)

**A-25 · P3 · D1 arch** — Layering verdict ~9.5/10, zero violations found (~350 sites). Two
enforcement-surface widenings only: (a) scoped-table read rule is comment/convention-enforced —
an unpinned `db.select()` on a scoped table would pass CI; add an AST ratchet requiring a
profileId/ownership predicate on `.from(scopedTable)` in services (M); (b) G1 bans only drizzle
imports in routes, not non-DB fat handlers (note-only, S). · Survives: M (a) / L (b).

**A-26 · P3 · D2 data** — Data-model verdict GOOD (133 migrations/131 journal, all governed;
enum/CHECK tight through the person cutover). Three items: (a) `.nullable().optional()` canon
unenforced — ~75 sites vs 2 sanctioned; many are legitimately tri-state Inngest-event/LLM-internal
schemas, so add a checker scoped to request/response DTOs + document the event/internal
exemption (M, P2-worthy for noise-kill); (b) 3 profile-scoped tables RLS-enabled with no USING
policy — deny-all today, so deferred hardening, not a leak (`database-rls-coverage.ts:158-176`;
S each); (c) 5 forward-built policy tables unused (`identity.ts:601-718`) — confirm
identity-runway liveness, else drop (S). · Survives: H (b) / M (a, c).

**A-27 · P3 · D4 LLM** — Grader age-bracket uses year-only `computeAgeBracket`
(`session-exchange.ts:1143` challenge-round, `:3454` teach-back) vs the FromDate canon; impact
bounded (graders hard-pinned never-Gemini; only mis-frames the preamble identity line near the
18 boundary). · Fix: swap + thread birth date (already in context). · Effort: S. · Grain: one
WI. · Survives: **H**.

**A-28 · P2 · D4 LLM** — Eval-harness coverage gaps: 34 flows registered, but uncovered
builders include two safety-adjacent graders — **teach-back grader**
(`teach-back-grader-prompt.ts`) and **suitability judge** (`policy-engine/judge-suitability-prompt.ts`) —
plus homework-summary, session-highlights, monthly-report (parent-facing), vocabulary-extract,
ocr, dedup-prompt, subject-resolve, recall-bridge. Prompt edits to these ship without the
snapshot gate. · Fix: add the two grader flows first, then triage the rest. · Effort: M. ·
Grain: one WI (graders) + one follow-up. · Survives: **H**.

---

## Top-10 (ranked: impact × confidence × actionability)

| # | ID | One-liner | Sev | Effort |
|---|----|-----------|-----|--------|
| 1 | A-01 | V2 routing dormant in prod (flag verified absent) — cutover or doc-truth ruling | P1 | S-M |
| 2 | A-02 | Suitability-judge layer OFF in prod (flags verified absent) — enable or record deferral | P1 | S |
| 3 | A-09 | Zero prompt caching; est. 50-80% input-cost cut on turns 2+ | P1 cost | M |
| 4 | A-12 | Dedup fallback scans lifetime fact history on every session completion | P1 | S |
| 5 | A-03 | No safety-event→human escalation, no crisis flow — product+counsel ruling | P2* | M-L |
| 6 | A-18 | Export/delete: zero cross-profile negative tests (GDPR/COPPA-adjacent) | P1 | S-M |
| 7 | A-22 | Activation-events ingest never wired — funnel analytics silently absent | P1 | S-M |
| 8 | A-28 | Eval harness misses teach-back grader + suitability judge | P2 | M |
| 9 | A-05/06/07 | Docs-reconcile batch: audience-matrix supersede, PRD gaps, stale canon notes | P1 docs | M |
| 10 | A-14 | progress.ts unbounded session pulls (parent dashboard ×N children, home widget) | P2 | M |

*A-03 is P2 in defect terms but top-5 in stakes; it is a ruling, not a patch.

## Restart-safe shortlist (dispatch-ready now — high survives-triage confidence, crisp AC)

Small, verified, bug-or-guard-shaped; each is one WI with an obvious red-green or
snapshot-diff verification:

1. **A-12** dedup-pass empty-`embeddedIds` short-circuit (S, Bug: pre-declare red-green-revert).
2. **A-13** embed-backfill per-run cap + batched Voyage calls (S-M).
3. **A-18** export/delete cross-profile negative tests (S-M).
4. **A-27** grader `computeAgeBracketFromDate` swap ×2 (S).
5. **A-15** parallelize post-persist dispatch trio (+2 sibling selects) (S).
6. **A-11** per-flow maxTokens + cross-provider retry cap (S).
7. **A-26b** RLS USING policies for the 3 excluded tables (S).
8. **A-16a/d** session-stale-cleanup chunking; FlatList memoization ×2 (S).
9. **A-24-fossils** orphaned coaching-card types + stale learning-mode mocks (S).
10. **A-08** OSA C-3 guard test (or register correction) (S).
11. **A-07** stale-canon doc/memory corrections (llmRoutingRung, flow count 34, coaching-cards
    memory line) (S).
12. **A-28** eval flows for the two safety-adjacent graders (M — dispatchable, AC = flows
    registered + snapshots committed).

**Decision-gated (NOT dispatch-ready; need a ruling first):** A-01 (V2 cutover), A-02 (judge
flags), A-03 (escalation/crisis — product+counsel), A-22/A-23 (wire-or-cut per surface),
A-09/A-10 (prompt caching — dispatchable as engineering but rule on provider strategy first),
A-20 (targeted GC6 list approval), A-05 (matrix supersede vs re-derive).

---

## Dimension verdicts (for the record)

| Dim | Verdict |
|-----|---------|
| D1 architecture | STRONG (~9.5/10); zero violations in ~350 sites; enforcement is real |
| D2 data model | GOOD; 133 migrations governed; RLS manifest + guard tests load-bearing |
| D3 feature surface | No fake-shipped features; debt is uncalled routes + docs lag |
| D4 LLM pipeline | Hygiene strong (envelope/single-entry/preamble/provenance PASS); dormant V2 + zero caching |
| D5 safety | STRONG spine, fail-closed throughout; gaps are escalation absence + dormant judge |
| D6 performance | Already heavily remediated; residual = memory-facts pipeline + progress.ts |
| D7 test economy | Healthy (~3-6% low-value); one P1 negative-path gap (export/delete) |

**Premise corrections surfaced by the audit** (worth fixing in memory/docs): coaching cards
are NOT removed (live home-surface feature); "retention" in `apply-retention-update` is
spaced-repetition, not GDPR; archive-cleanup grace is 30 days (7-day belongs to
account-deletion); AGENTS.md "67 Inngest functions" counts files — actual registrations: 86;
eval-harness flows: 34, not 23; celebrations triple-suite is a correct test pyramid, not
duplication; LOC-ratio is a false-positive bloat signal in this repo.
