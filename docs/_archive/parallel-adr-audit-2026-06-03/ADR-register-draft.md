# Architectural Decision Register — Draft

**Status:** Draft (first pass, generated 2026-06-03)
**Scope of this pass:** All implemented/archived specs under `docs/_archive/specs/` (82 files: 77 in `Done/`, 3 in `deferred/`, 2 in the specs root). Plans under `docs/plans/` and live specs under `docs/specs/` are **not** yet folded in — that is the next pass.
**Method:** 13 parallel readers extracted every committed architectural decision per spec; this coordinator deduplicated across specs and resolved spec-vs-spec conflicts against the actual source code (code is ground truth, specs describe past intent).

## How to read this

- Each decision has a stable ID (`<DOMAIN>-NN`), a one-line decision statement, a **Status** as recorded in the source doc, the **Source** file, and **Notes** only where there is a caveat, flag, supersession, or conflict.
- **Status legend:** `Implemented` (shipped / marked done), `Designed` (spec complete, build pending), `Deferred` (explicitly postponed), `Skipped` (decided against / under `deferred/`), `Superseded` (replaced by a later decision — see §1).
- `[[X-NN]]` cross-references another decision in this register.
- **§1 (Conflicts, Supersessions & Code-Verified Resolutions) is the highest-value section** — read it first. It records where specs disagreed and what the code actually does today.

---

## §1 — Conflicts, Supersessions & Code-Verified Resolutions

Each item below was a genuine spec-vs-spec disagreement (or an evolution chain). The **Resolution** line cites the current source code.

### C-1 — Freeform auto-filing threshold: 5 vs 3 exchanges
- **Conflict:** `teach-first-posture` (2026-04-14) auto-files a freeform session at `exchangeCount >= 5`; `conversation-first-learning-flow` says ≥5 to auto-file, ≥3 to display; `freeform-library-filing` (2026-05-23) says ≥3 learner turns.
- **Resolution (code):** Current auto-file threshold is **3** — `FILING_CONFIG.minFreeformExchanges = 3` (`apps/api/src/config/filing.ts:2`), checked in `session-filing-dispatch.ts:24`. Book-screen display shows every session with `exchangeCount >= 1` (`session-book.ts:79`). The later `freeform-library-filing` spec won; the teach-first "5" is **superseded**. Affects [[TEACH-08]], [[TEACH-12]], [[LIB-21]].

### C-2 — Freeform filing UX: blocking modal vs silent toast vs card controls
- **Conflict:** `teach-first-posture` describes a silent auto-file + toast (with deferred Undo); `learning-path-clarity` describes an opt-in "Add to library?" modal for unscoped meaningful sessions; `freeform-library-filing` reframes saving and filing as separate concerns with a durable Inngest auto-file.
- **Resolution (code):** Today the session-summary screen renders **card-based filing controls** (`SessionSummaryLibraryFilingControls.tsx:29-262`) with explicit states: `showPending` ("Adding this to your Library…" + "Don't add" action), `showUnfiled`/`filing_kept_out` ("Not in Library" + "Add to Library"), and success/failure/retry. The `filing_kept_out` enum value exists (`packages/database/src/schema/sessions.ts:74-79`; `packages/schemas/src/sessions.ts:255-261`). The `freeform-library-filing` separate-concerns model is the live design. Affects [[TEACH-08]], [[PROG-19]], [[LIB-21]], [[LIB-23]].

### C-3 — topic_notes: one-note-per-topic vs multiple notes
- **Conflict:** `library-ux-refactor` (2026-04-06) defined `topic_notes` with `UNIQUE(topicId, profileId)` (one upsertable note); `library-v3-redesign` (2026-05-03) dropped the constraint and added `sessionId`.
- **Resolution (code):** Current schema has **no unique constraint** and supports multiple notes per topic — columns `id, topicId, profileId, sessionId, content, createdAt, updatedAt`, with a non-unique index on `(topicId, profileId)` (`packages/database/src/schema/notes.ts:8-48`). Library-v3 won; [[LIB-12]] is **superseded** by [[LIB-16]]/[[LIB-17]].

### C-4 — MAX_INTERVIEW_EXCHANGES: 4 vs recommended 2–3
- **Conflict:** `llm-response-envelope` sets the interview hard cap at 4; `llm-reliability-ux-audit` (F7) recommended shortening to 2–3.
- **Resolution (code):** Current value is **4** (`apps/api/src/services/exchanges.ts:66`). The 2–3 recommendation was **not** adopted. See [[LLM-06]], [[LLM-11]].

### C-5 — Session mode naming: `practice` → `review` → gone
- **Conflict:** `learning-path-clarity` renamed the `practice` session mode to `review`; `conversation-stage-chips` still listed `['practice','review','relearn','homework']`.
- **Resolution (code):** **Both `practice` and `review` are gone** as session *effective modes*. The current union is `'freeform' | 'learning'` (`packages/schemas/src/sessions.ts:263`, getter `getSessionEffectiveMode()` lines 273-276). `practice` survives only as a *navigation route* (`navigation-contract.ts:176`), not a session mode. Both [[PROG-16]] and [[TEACH-22]]'s mode lists are stale relative to today's enum — flag for the next cleanup pass.

### C-6 — Family tab in bottom nav: added → removed → context-switch (evolution chain)
- **Chain:** `profile-as-lens` (2026-04-28) conditionally mounts a **Family tab** when family links exist ([[PROF-05]]); `parent-home-as-primary-surface` (2026-05-10) **removes** the Family tab so all users see the same 4 tabs ([[NAV-21]]); `study-and-family-mode-navigation` + `navigation-contract` replace that with **context-driven** tab sets (Study vs Family) reached via a mode switch, not a tab.
- **Resolution (code/CLAUDE.md):** Final state is the two-context model. Production default is still the **V0 5-tab guardian shape** (`MODE_NAV_V0_ENABLED=false`); `LEGACY_GUARDIAN_TABS = ['home','own-learning','library','progress','more']`, `STUDY_TABS = ['home','library','progress','more']`, `FAMILY_TABS = ['home','recaps','progress','more']`, `PROXY_TABS = ['home','library','progress']` (`navigation-contract.ts:146-169`). V0 helpers `resolveTabShape/computeVisibleTabs/computeModeVisibleTabs` still exist but now live in `legacy-navigation-contract.ts:62-97` (CLAUDE.md still points at `_layout.tsx` — minor doc drift). [[PROF-05]] and [[NAV-21]] are **superseded** by [[NAV-01]]…[[NAV-06]].

### C-7 — Onboarding intent screen: required first-run choice vs deferred
- **Conflict:** `study-and-family-mode-navigation` specifies a first-run Study/Family intent screen ([[NAV-25]]); the 2026-05-25 decision note in `navigation-contract` cancels it for V0 ([[NAV-26]]), discovery moving to Welcome Intro + More.
- **Resolution:** Intent screen is **deferred**; the cancellation rationale (tier-access-rework lifting `maxProfiles:1`) is itself recorded as [[AUTH-12]]. [[NAV-25]] superseded by [[NAV-26]] for V0.

### C-8 — Mastery definition: assessment-pass vs retention-verified
- **Conflict / tightening:** `expandable-subject-cards` redefines "mastered" to require `retentionCard.xpStatus === 'verified'`, not assessment-pass alone ([[STAB-32]]).
- **Resolution:** This is a deliberate forward tightening applied to both `buildSubjectMetric` and `buildSubjectInventory`; already-generated monthly reports keep old counts (point-in-time). Not in conflict with other specs — recorded so reviewers don't "revert" it.

### C-9 — LLM translation backend: Anthropic vs Gemini
- **Conflict:** `llm-powered-i18n` (2026-05-03) specifies `scripts/translate.ts` (Claude/Anthropic); `i18n-phase2` (2026-05-26) records that `pnpm translate` now runs `scripts/translate-gemini.ts` (Gemini), with `translate.ts` retained only for its `validateTranslation` helper.
- **Resolution:** Gemini script is the active path ([[I18N-19]] supersedes the tooling half of [[I18N-01]]). Do not delete `translate.ts`.

### C-10 — Structured-output exceptions to the LLM envelope rule
- **Apparent conflict, actually documented carve-outs:** The repo rule is "state-machine LLM decisions must use `llmResponseEnvelopeSchema`" ([[LLM-05]]). Three flows intentionally do **not**: `learnerRecap` uses its own Zod schema (display-only, [[QUIZ-19]]); Epic 6 vocabulary extraction uses a hidden JSON block (predates the envelope, [[I18N-26]]); `notePrompt`/`fluencyDrill` keep a bare-JSON fallback documented at `envelope.ts:258` ([[LLM-04]] note). These are exceptions, not violations.

  **Deferred LLM-05 debt (NOT sanctioned carve-outs):** Two additional **state-driving** flows currently parse bespoke JSON outside `parseEnvelope()` and are therefore in violation of [[LLM-05]], not exceptions to it: (1) **assessment evaluation** (`parseAssessmentEvaluation` / `llmAssessmentEvaluationSchema`, `assessments.ts`) drives `passed`/`masteryScore`/`shouldEscalateDepth` state transitions; (2) **summary evaluation** (`parseSummaryEvaluation` / `llmSummaryEvaluationSchema`, `summaries.ts`) drives `isAccepted`/`hasUnderstandingGaps` state transitions. Both must be migrated onto the envelope (Phase 1, plan 2026-06-03-adr-register-cleanup). Until Phase 1 ships, reviewers must treat new bespoke eval schemas as blocking findings, not as precedent set by these two sites.

### C-11 — `idempotency`/idempotency-key plumbing appears in many specs
- **Convergence (not conflict):** Idempotency keys for durable/retryable operations recur across interaction-durability ([[STAB-12]]), review-recall start ([[PROG-23]]), cron scans ([[STAB-30]]), learn-this-too clone ([[ONB-26]]), and email digests ([[AUTH-25]]/[[VOICE/MISC...]]). Recorded once per surface; the shared principle is captured as a repo guardrail in [[STAB-12]].

---

## §2 — The Register

### Memory & Adaptive Learning (MEM)

- **MEM-01** — Learning-profile data lives in a dedicated `learning_profiles` table (1:1 FK, cascade delete, `version` column), never as JSONB on `profiles` (read on every request). *Implemented.* Source: epic-16-adaptive-memory. Note: row created lazily on first analysis ([[MEM-02]]).
- **MEM-02** — `learning_profiles` row created lazily on first session analysis, not at profile creation; exception: parent-set accommodation mode creates it early with defaults. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-03** — Post-session memory extraction uses a dedicated LLM call with structured output, not rule/keyword heuristics (~$0.002/analysis). *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-04** — Memory analysis runs background-only via Inngest on `session.completed`; never mid-conversation. *Implemented.* Source: epic-16-adaptive-memory. See chain ordering [[PROG-06]].
- **MEM-05** — Injected memory context is natural-language prose (≤500 tokens), not JSON; dedup meta-instruction appended when ≥2 memory layers present. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-06** — Phase-1 retrieval is priority-ordered over a single small JSONB doc; no vector search. *Implemented; later superseded for Phases 2-3.* Source: epic-16-adaptive-memory → superseded by [[MEM-21]],[[MEM-23]].
- **MEM-07** — Collaborative (not surveillance) memory: learner "Tell your mentor" input, check-ins, consent-first, granular toggles. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-08** — Two independent booleans `memoryCollectionEnabled` / `memoryInjectionEnabled` replace single `memoryEnabled`. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-09** — Parental consent (`memoryConsentStatus: pending|granted|declined`) required before first analysis; default off (GDPR Art. 8). *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-10** — Confidence gates injection: only `high` injected to prompt; `medium` UI-only; `low` logged not applied. Learner-declared inputs bypass corroboration. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-11** — Struggle flagged only after 3+ sessions; retention data (`intervalDays>=21`) overrides/excludes struggle injection. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-12** — Two-tier parent struggle notification: soft "early signal" (3+ sessions, medium), escalated (5+ sessions, high). *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-13** — Accommodation modes are parent-set, never AI-inferred; explicit exception to "AI infers" principle. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-14** — Capability-first accommodation names (`short-burst`/`audio-first`/`predictable`); never clinical labels (GDPR data minimization). *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-15** — Accommodation block placed before learner-memory block in prompt (separate 150-token budget) so explicit settings beat inferred preferences. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-16** — Accommodation-mode change takes effect next session, not mid-session. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-17** — Interests stored as plain strings (cap 20, evict oldest, demote after 60d), not taxonomized. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-18** — Cross-subject warm-start transfers style+interests+notes, never struggles/strengths. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-19** — "This is wrong" suppresses to recoverable `suppressedInferences` (not hard delete); restorable from "Hidden items". *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-20** — Memory screen: strengths/interests expanded first; struggles in collapsible "Things you're improving at". *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-20b** — GDPR export: human-readable summary primary, raw JSON secondary. *Implemented.* Source: epic-16-adaptive-memory.
- **MEM-21** — New `memory_facts` table replaces 5 JSONB list columns via dual-write soak then drop; consent/style/accommodation fields stay on `learning_profiles`. *Designed.* Source: memory-architecture-upgrade. Note: column drops need rollback section; impossible after drop without PITR.
- **MEM-22** — `memory_facts` migration creates all phase columns (embedding, supersession) upfront, nullable. *Designed.* Source: memory-architecture-upgrade.
- **MEM-23** — Dual-write uses `SELECT … FOR UPDATE` pessimistic lock, replacing optimistic version-lock retry; `version` kept for cache invalidation only. *Designed.* Source: memory-architecture-upgrade.
- **MEM-24** — Phase-2 retrieval: two-stage pgvector candidates + relevance/recency blend (`w_rel=0.85, w_rec=0.15`, 180d half-life). Flag `MEMORY_FACTS_RELEVANCE_RETRIEVAL` (off). *Designed.* Source: memory-architecture-upgrade.
- **MEM-25** — Phase-3 dedup: Haiku-tier merge per near-dup (cos≥0.85), hard cap 10/session; flag `MEMORY_FACTS_DEDUP_ENABLED`. *Designed.* Source: memory-architecture-upgrade. Note: point-of-no-return; ramp by % of writes.
- **MEM-26** — Merge prompt constrained "output only content present in ≥1 input; do not add/infer/rephrase". *Designed.* Source: memory-architecture-upgrade.
- **MEM-27** — Deleting a merged fact cascades up the `supersededBy` chain (recursive CTE, one txn). *Designed.* Source: memory-architecture-upgrade.
- **MEM-28** — Suppressed-fact pre-write check uses case/whitespace-normalized text match (shared `sameNormalized`, `learner-profile.ts:1349`); matches silently dropped. *Designed.* Source: memory-architecture-upgrade.
- **MEM-29** — Fact merges are silent (no user notification); emit IDs-only `memory.fact.merged` event. *Designed.* Source: memory-architecture-upgrade.
- **MEM-30** — Both learner self-view and parent child-view read through one `getMemoryProjection()` with separate adapters; drift-guard test required. *Designed.* Source: mentor-memory-shared-backbone. Related [[PROF-21]].
- **MEM-31** — `MEMORY_FACTS_READ_ENABLED` flag switches both views in lockstep via the shared projection. *Designed.* Source: mentor-memory-shared-backbone.
- **MEM-32** — Adaptive home adapts on two booleans (`hasLinkedChildren`,`hasLibraryContent`), no persona/age branching; `LearnerScreen` shared across both home paths. *Implemented.* Source: adaptive-home-screen. See [[NAV-23]],[[PROF-04]].
- **MEM-33** — Tiered retention: raw `sessionEvents` purged 30d after a valid summary write; `llmSummary` + re-embedded vector kept indefinitely. *Designed (rev 4).* Source: tiered-conversation-retention. Note: purge gated behind flag for first 30d; irreversible once `purgedAt` set.
- **MEM-34** — Purge precondition: `llmSummary` non-null AND Zod-valid; else session stays in Tier-2 indefinitely (summary failure is observable, not silent). *Designed.* Source: tiered-conversation-retention.
- **MEM-35** — `llmSummary.narrative` framed as "note to your future self" (40-1500 chars, must name topic anchors for post-purge semantic search). *Designed.* Source: tiered-conversation-retention.
- **MEM-36** — Voyage embedding call happens before opening the purge DB transaction (txn = SQL only). *Designed.* Source: tiered-conversation-retention.
- **MEM-37** — Retention-pipeline Inngest payloads + Sentry breadcrumbs carry IDs only, never narrative/recap text. *Designed.* Source: tiered-conversation-retention.
- **MEM-38** — Parent-report step (Phase 2) skipped when no `familyLinks`; reads `llmSummary` not raw transcript; flag `RETENTION_PHASE_2_PARENT_REPORT` (off). *Designed/Deferred.* Source: tiered-conversation-retention.
- **MEM-39** — Embedding-overlap regression test (top-3 Jaccard ≥0.6) is deploy-blocking before purge cron enabled. *Designed.* Source: tiered-conversation-retention.
- **MEM-40** — Reconciliation cron: Query A (no summaries row → re-fire `session.completed`) vs Query B (row but no summary → re-run summary only); batch 50; 04:00 UTC before 05:00 purge. *Designed.* Source: tiered-conversation-retention.
- **MEM-41** — Universal post-session reflection: all session types (learn/ask/homework) route through the reflection summary screen; filing-accept no longer exits straight to shelf. *Designed.* Source: universal-post-session-reflection.
- **MEM-42** — Reflection awards 1.5× XP (`REFLECTION_XP_MULTIPLIER`), requires AI acceptance not just submit; `reflectionMultiplierApplied` prevents double-apply. *Designed.* Source: universal-post-session-reflection.
- **MEM-43** — Base XP inserted synchronously in `closeSession` (not Inngest) so the incentive banner shows exact amounts; only when topicId resolved. *Designed.* Source: universal-post-session-reflection.
- **MEM-44** — Reflection submit creates a Library note via the notes API; skipped if no topicId; XP applies even if note creation fails (Inngest retry). *Designed.* Source: universal-post-session-reflection. Depends on [[LIB-16]].
- **MEM-45** — Skip-nudge thresholds (3 subtle / 5 warning) are mode-agnostic, client-computed from server `consecutiveSummarySkips`; 10-skip casual-switch prompt removed. *Designed.* Source: universal-post-session-reflection.
- **MEM-46** — Reflection sentence starters keyed by session type, stored as i18n keys (EN+CS min), not hardcoded. *Designed.* Source: universal-post-session-reflection.
- **MEM-47** — Post-filing nav continues to summary screen then 2-step push to filed book (not direct leaf push). *Designed.* Source: universal-post-session-reflection. Encodes [[NAV-30]].

### Progress & Visibility (PROG)

- **PROG-01** — Daily Inngest cron precomputes `progress_snapshots` (JSONB `metrics`), not on-the-fly aggregation; post-session refresh trigger + manual refresh endpoint mitigate ≤24h staleness. *Implemented.* Source: epic-15-visible-progress.
- **PROG-02** — `progress_snapshots.metrics` is JSONB typed by shared `ProgressMetrics` interface; degrades gracefully on missing fields; not SQL-queryable per-metric. *Implemented.* Source: epic-15-visible-progress.
- **PROG-03** — Milestones are append-only events, never deleted/invalidated even if the metric later drops. *Implemented.* Source: epic-15-visible-progress.
- **PROG-04** — Monthly reports: data computed deterministically; LLM used only for narrative warmth; report still generates if LLM fails. *Implemented.* Source: epic-15-visible-progress.
- **PROG-05** — Push-only digests at launch; email digest deferred. *Deferred.* Source: epic-15-visible-progress → later specced as [[AUTH-25]]/email-digest-channel.
- **PROG-06** — Post-`session.completed` Inngest order: summary → retention → filing → profile analysis → snapshot+milestones → coaching cards → suggestions. *Implemented.* Source: epic-15-visible-progress (cross-epic with Epic 16, CFLF). Ordering must be preserved.
- **PROG-07** — Dual topic counts: `topicsTotal` = pre-generated only (fill-bar denominator); `topicsExplored` = session-filed, no denominator. *Implemented.* Source: epic-15-visible-progress.
- **PROG-08** — No peer comparisons / leaderboards / percentiles anywhere (non-negotiable); all comparison is temporal self-vs-self. *Implemented.* Source: epic-15-visible-progress.
- **PROG-09** — Mastered topics always render green; review-due shows a refresh badge overlay, never a color regression. *Implemented.* Source: epic-15-visible-progress.
- **PROG-10** — Weekly push always leads positive; inactivity/decline only in-app, never in push. *Implemented.* Source: epic-15-visible-progress.
- **PROG-11** — Multi-child weekly push batched: one push per parent. *Implemented.* Source: epic-15-visible-progress. See consent gating [[AUTH-25]].
- **PROG-12** — One-time Inngest backfill reconstructs approximate weekly snapshots on first deploy so existing users don't see a blank chart. *Implemented.* Source: epic-15-visible-progress.
- **PROG-13** — `celebrationLevel` (all/big_only/off) gates the overlay only; milestone rows always recorded. *Implemented.* Source: epic-15-visible-progress.
- **PROG-14** — Age-adapted celebration copy: warm <12, concise 12+; default to younger if birthYear unknown. *Implemented.* Source: epic-15-visible-progress.
- **PROG-15** — Vocabulary section gated to `pedagogyMode==='four_strands'`; hidden otherwise; aggregate shows only if some subject uses it. *Designed (folded into Epic 15 FR232/236).* Source: progress-empty-states-highlights.
- **PROG-16** — Session highlight LLM-generated only for ≥3 exchanges; <3 gets template "browsed…" (no LLM). Parent-facing only. *Designed.* Source: progress-empty-states-highlights. (Mode-list refs in sibling specs stale — see [[C-5]].)
- **PROG-17** — Session-highlight LLM uses structured JSON `{highlight, confidence}`, treats transcript as untrusted; 5-stage validation (parse/confidence/length/allowlisted-verb/injection) → silent template fallback. *Designed.* Source: progress-empty-states-highlights.
- **PROG-18** — Milestone thresholds lowered to start at 1 (first session/topic, 3-day streak, 5 words). *Designed.* Source: progress-empty-states-highlights.
- **PROG-19** — Celebration toast throttle: max 2/session at UI layer; extra milestones recorded but suppressed from toast queue. *Designed.* Source: progress-empty-states-highlights.
- **PROG-20** — Progress screen redesigned as action-oriented re-engagement surface (reviews due + recent + 3 stat cards); growth chart/milestones/bookmarks/vocab pill removed. *Designed (Phase 2).* Source: progress-screen-redesign.
- **PROG-21** — Growth-chart deletion gated on instrumentation (<5% of Progress-tab DAU view it over ≥7d); milestones list on <10%. *Designed.* Source: progress-screen-redesign.
- **PROG-22** — Review-recall opener is async/non-blocking: start returns immediately `pendingOpener:true`, Inngest streams the opener. *Designed.* Source: progress-screen-redesign.
- **PROG-23** — Review-recall opener wrapped in `llmResponseEnvelopeSchema` with `reviewRecallQuickReplies` (ask_me/lead_me); chips auto-dismiss 60s (hard cap). *Designed.* Source: progress-screen-redesign. See [[LLM-06]].
- **PROG-24** — `Idempotency-Key` mandatory for `startReason==='review_recall'`; dup within 24h returns cached response. *Designed.* Source: progress-screen-redesign. See [[C-11]].
- **PROG-25** — Opener LLM calls excluded from learner session quota; separate cost metric + 10/hr per-profile rate limit → envelope fallback. *Designed.* Source: progress-screen-redesign.
- **PROG-26** — 10-min opener reuse window keyed by `(profileId,topicId,contextSignature)`; contextSignature is server-only SHA-256, never in schemas. *Designed.* Source: progress-screen-redesign.
- **PROG-27** — `review_recall` rejected `400` without `topicId`; only reachable from topic-scoped surfaces. *Designed.* Source: progress-screen-redesign.
- **PROG-28** — Progress Subjects section lists only subjects with ≥1 overdue review; cap 10 + "See all". *Designed.* Source: progress-screen-redesign.
- **PROG-29** — `/sessions/recent` requires `exchangeCount>=4` AND a non-null narrative/highlight (tightened from ≥2). *Designed.* Source: progress-screen-redesign.
- **PROG-30** — Session mode `practice` renamed to `review` across types/schemas/tests/testIDs; legacy `practice` treated as synonym for one release; locale-keyed non-answer tokens. *Implemented — but see [[C-5]]: both later removed; current modes are `freeform|learning`.* Source: learning-path-clarity.
- **PROG-31** — Filing modal appears only on freeform/homework sessions marked `meaningful:true` by `session-depth`; scoped sessions auto-filed at start (documented as intentional, not a bug). *Implemented.* Source: learning-path-clarity. See [[C-2]].
- **PROG-32** — Review sessions open with a calibration probe whose first answer feeds the same `evaluateRecallQuality`/`processRecallResult` SM-2 pipeline as recall-test; standalone recall-test retained; 24h anti-cram cooldown. *Implemented.* Source: learning-path-clarity.
- **PROG-33** — Devil's-Advocate / Feynman verification modes signal via one-line in-conversation preamble, no UI overlay. *Implemented.* Source: learning-path-clarity.

### Navigation, Modes & IA (NAV)

- **NAV-01** — Exactly two tab context shapes (`study`/`family`); never a third. V0 names them `guardian|learner`, V1 renames to `study|family`. *Implemented.* Source: study-and-family-mode-navigation; navigation-contract. See [[C-6]].
- **NAV-02** — Context (not identity) drives visible tabs; family-capable adult in Study sees Study tabs. *Implemented.* Source: study-and-family-mode-navigation.
- **NAV-03** — Study tabs = `home, library, progress, more`. *Implemented.* Source: study-and-family / navigation-contract (`STUDY_TABS`).
- **NAV-04** — Family tabs (V1) = `home, recaps, progress, more`; old guardian/hybrid set removed. *Implemented.* Source: study-and-family / navigation-contract (`FAMILY_TABS`). V0 family = `home, progress, more` ([[NAV-05]]).
- **NAV-05** — V0 family experiment slice = 3 tabs `home(Children), progress, more`, no Recaps. *Implemented (probe).* Source: study-and-family-v0. Superseded by [[NAV-04]] when V1 on.
- **NAV-06** — HARD CONSTRAINT: every nav PR preserves the 5-tab production mode (`MODE_NAV_V0_ENABLED=false`); V0 helpers must not be deleted when V1 lands. *Live policy.* Source: navigation-contract; CLAUDE.md. See [[C-6]] for code state.
- **NAV-07** — `resolveNavigationContract(ctx)` is the single pure-function source of truth for tab shape, visible tabs, home screen, chrome, content gates, route reachability; screens consume it. *Implemented (6 PRs).* Source: navigation-contract. Mobile-UI only — does not replace API authz.
- **NAV-08** — Fixed visible-tab precedence: proxy > `mode===null` (boot) > family-capable+V1 contract > family-capable+V0 mode tabs > legacy shape. *Implemented (rule #10).* Source: study-and-family-v0 / navigation-contract.
- **NAV-09** — Family capability is linkage-driven (owner + adult + ≥1 non-archived `family_links` child), not subscription-driven; V1 uses server `hasFamilyLinks`. *Implemented.* Source: study-and-family-v0 / navigation-contract. See [[AUTH-12]] re paid-but-childless.
- **NAV-10** — Active Study/Family preference persisted as nullable `profiles.default_app_context`; never SecureStore/Clerk; NULL = infer. *Implemented (migration 0089).* Source: study-and-family / navigation-contract. V0 was client-only ([[NAV-22]]).
- **NAV-11** — Mode mutation profile-scoped + server-validated (`study` always allowed; `family` only if capable); optimistic with rollback; `switchProfile` never writes context. *Implemented.* Source: study-and-family / navigation-contract.
- **NAV-12** — No `X-App-Context` header (presentation ≠ authz scope); scoping uses `X-Profile-Id`, route params, server family-link checks. *Implemented.* Source: all three nav specs. Contrast proxy header [[PROF-09]].
- **NAV-13** — Mode/profile switches and proxy exits use `router.replace()` to canonical root `/(app)/home`; never `push`/bare `back`; detail screens use `goBackOrReplace`. *Implemented.* Source: all three nav specs.
- **NAV-14** — Recaps is a required first-class Family tab (V1), parent-native, reuses `session_summaries` fields (no synonym columns). *Implemented (PR4).* Source: navigation-contract / study-and-family.
- **NAV-15** — Recaps API enforces parent-child visibility via `family_links.parent_profile_id`; child filter is an authz input; out-of-family child → not-found; engagement signals mapped to gentle labels; never exposes raw chat. *Implemented.* Source: study-and-family / navigation-contract.
- **NAV-16** — Proxy mode is NOT the normal parent-review path; removed from normal UX, retained for tests/internal only; review uses Children/Recaps/Progress instead. *Implemented (PR6).* Source: all three nav specs. `isParentProxy` still wins precedence.
- **NAV-17** — Family Progress = child/family only (no parent self); Study Progress = self only; exposed as `gates.progressScope`. *Implemented.* Source: study-and-family / -v0.
- **NAV-18** — Child curriculum management lives under Family mode (`child/[profileId]/curriculum`), not top-level Library. *Implemented (PR5, `f7d636e36`).* Source: study-and-family / navigation-contract.
- **NAV-19** — Mode-scoped query keys (`MODE_SCOPED_KEYS ⊆ PROFILE_SCOPED_KEYS`, guard-tested) prevent cross-context cache leak; invalidate by predicate on mode switch. *Implemented.* Source: study-and-family-v0.
- **NAV-20** — V0 `AppContextProvider` is client-side React context (never SecureStore), recomputes on identity-input change, resets to null synchronously on sign-out (layout doesn't remount). *Implemented (ephemeral probe).* Source: study-and-family-v0. Superseded by [[NAV-10]] in V1.
- **NAV-20b** — Family routes guarded at a single chokepoint `child/[profileId]/_layout.tsx` via `RequireFamilyContext`/`canEnter`; not per-route; tests cover ≥3 nested routes. *Implemented (PR5).* Source: study-and-family-v0 / navigation-contract.
- **NAV-21** — (Superseded) Family tab removed from bottom nav; all users see same 4 tabs, only Home content differs. Source: parent-home-as-primary-surface. Superseded by [[NAV-01]]…[[NAV-04]]. See [[C-6]].
- **NAV-22** — No durable pre-auth/pre-profile intent storage; first-run choice is in-memory/route state only. *Implemented.* Source: study-and-family.
- **NAV-23** — Both contexts render the same route `/(app)/home`; `ParentHomeScreen` vs `LearnerScreen` decided inside `LearnerScreen.tsx`/contract, not in `home.tsx`. *Implemented.* Source: study-and-family / navigation-contract; CLAUDE.md.
- **NAV-24** — Both solo-learner and parent homes use a JTBD intent-card picker; parent cards parent-flavored but same structure. *Implemented.* Source: parent-home-as-primary-surface.
- **NAV-25** — (Superseded for V0) First-run Study/Family intent screen with V1 rules. Source: study-and-family. Superseded by [[NAV-26]]; see [[C-7]].
- **NAV-26** — No dedicated first-run intent screen in V0; discovery via Welcome Intro family card + More → Add a child; no persistent empty-state CTA for childless adult owners. *Decided 2026-05-25.* Source: navigation-contract. Rationale = [[AUTH-12]].
- **NAV-27** — `own-learning.tsx` kept as compatibility/deep-link bridge only (`setMode('study')` then route); in `V0_FALLBACK_FILES`. *Implemented.* Source: study-and-family / navigation-contract.
- **NAV-28** — Home branching key = linked-children count (`family_links` where parent=active), not raw `isOwner`; via `useLinkedChildren()`, inline computation forbidden. *Implemented.* Source: parent-home-as-primary-surface. V1 adds adult check ([[NAV-09]]).
- **NAV-29** — `isGuardianProfile()` = owner + ≥1 non-owner; V1 `isFamilyCapableProfile()` adds adult age check; old predicate not reused for mode gating. *Implemented.* Source: study-and-family / -v0. Shared predicate also used by [[ONB-22]].
- **NAV-30** — Cross-stack/cross-tab card nav must push the full ancestor chain (parent then leaf); layouts with index+dynamic child export `unstable_settings.initialRouteName='index'`. *Implemented; repo guardrail.* Source: parent-home-as-primary-surface; CLAUDE.md. Cited by [[MEM-47]],[[LIB-19]],[[LLM-30]].
- **NAV-31** — `NavigationContract` exposes `canEnter(route)` and `isSurfaced(route)` predicates; routes reachable-but-not-surfaced allowed; `RouteKey` typed union enforced by AST guard. *Implemented (PR5).* Source: navigation-contract.
- **NAV-32** — AST guard test enforces contract boundaries via 3 allowlist buckets: `BOUNDARY_FILES` (permanent), `V0_FALLBACK_FILES` (die with V0 flag), `NON_NAV_DOMAIN_FILES` (permanent domain-`isOwner` carve-outs); pinned finding counts, fails both directions. *Implemented (PR6).* Source: navigation-contract. Original "empty allowlist" rejected.
- **NAV-33** — Tab bar frozen at 4 tabs; a new tab/Home-card must answer "which intent / which surface replaced" or default no. *Implemented.* Source: home-ia-simplification. Recaps (V1) satisfied this via its own spec.
- **NAV-34** — Learner Home = 3 always + 1 conditional intent cards; intermediate `/learn-new` hub deleted; methods accessed in context. *Implemented.* Source: home-ia-simplification.
- **NAV-35** — Onboarding Back is intra-flow (prev step), not drop-to-home; dynamic step indicator across screens. *Implemented.* Source: home-ia-simplification.
- **NAV-36** — `StudySourceContext` for Learn-this-too is read-only attribution `{source,childProfileId,…}`; all writes use the adult profile; never used to scope writes to the child. *Implemented (`5a42278ae`).* Source: study-and-family / navigation-contract. See [[ONB-23]]ff.
- **NAV-37** — Nudge feature: 4 pre-written templates, non-optimistic toast (200-only), 3/24h per parent-child, server-side quiet-hours suppression. *Implemented.* Source: parent-home-as-primary-surface. New cross-profile surface (`/nudges`).

### Teaching & Conversation (TEACH)

- **TEACH-01** — Replace Socratic role identity with teach-then-verify ("teach clearly, check understanding"); scoped to `learning` session type only (homework/interleaved/four_strands excluded). *Implemented.* Source: teach-first-posture(-design). Canonical doc = `-design`; `-design`-less file is the impl plan.
- **TEACH-02** — LEARNING guidance is an explicit explain→verify→next-concept cycle; LLM leads, learner confirms; "never wait passively". *Implemented.* Source: teach-first-posture.
- **TEACH-03** — First-exchange teaching opener gated on `exchangeCount===0 && learning && !four_strands`: topicTitle→teach immediately; rawInput→anchor+begin; neither→no opener. Requires plumbing exchangeCount into ExchangeContext. *Implemented.* Source: teach-first-posture.
- **TEACH-04** — Five-rung escalation ladder unchanged; only the default entry posture shifts to teaching. *Unchanged.* Source: teach-first-posture-design.
- **TEACH-05** — Role identity includes age-calibration guidance (9yo short/analogies … adult efficiency); age from existing age-voice section. *Implemented.* Source: teach-first-posture. (Age anchors later narrowed to 11-17, [[LLM-19]].)
- **TEACH-06** — Client greeting bubble copy updated to teach-then-verify tone (first session + topic-aware variants). *Implemented.* Source: teach-first-posture.
- **TEACH-07** — "Build my learning path" entry on book detail empty-state + secondary link → existing `onboarding/interview` with subject/book params; hidden once curriculum exists / read-only. *Implemented.* Source: teach-first-posture.
- **TEACH-08** — (Superseded threshold) Auto-file freeform at close when freeform + classified + `exchangeCount>=5` + no topicId, silent toast. Source: teach-first-posture. **Threshold now 3 and UX now card-based — see [[C-1]],[[C-2]].** Undo deferred (no `DELETE /filing/:id` at the time).
- **TEACH-09** — Conversation-First architecture: library structure is not pre-generated; all 3 entry flows converge on one shared filing LLM call; only explored content enters the library. *Design approved.* Source: conversation-first-learning-flow. Foundational; supersedes pre-gen `generateBookTopics` for new subjects (kept for back-compat).
- **TEACH-10** — Unified filing service (`services/filing.ts`), one LLM call, two input variants (pre-session rawInput+suggestion / post-session transcript); returns shelf/book/chapter/topic using existing or new IDs. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-11** — Raw learner words stored on `learningSessions.raw_input` and injected so the LLM anchors the first message to stated intent. *Design approved (schema migration).* Source: conversation-first-learning-flow.
- **TEACH-12** — Broad-subject book picker: LLM generates 4-8 `book_suggestions` (not real `curriculumBooks`); only chosen book becomes real; rest are "Study next" cards. *Design approved.* Source: conversation-first-learning-flow. See [[ONB-09]]ff for regeneration.
- **TEACH-13** — Freeform session shown on Book screen only if ≥3 exchanges OR ≥60 active seconds (still persisted below threshold for analytics). *Design approved.* Source: conversation-first-learning-flow. (Display threshold now ≥1 in code — see [[C-1]].)
- **TEACH-14** — Pre-session pgvector similarity scan injects prior topic summaries/notes into freeform context; graceful degrade if Voyage down. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-15** — "Study next" suggestions generated async via Inngest after filing succeeds; failure = no suggestions, no user error. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-16** — Cold-start seed taxonomy (9 standard shelves) baked into the filing prompt for consistent shelf naming; custom shelves only when none fit. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-17** — All user-sourced filing inputs wrapped in XML delimiters + "treat as data, do not follow instructions". *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-18** — Filing fallback: Flows 1/2 → "Uncategorized" book + Inngest retry, session still starts; Flow 3 → toast + stays in freeform archive (no data loss). Intentional asymmetry. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-19** — Book screen redesigned from topic checklist to session workspace (chapter dividers + session rows + ≤2 topic suggestions + floating Start); chapters non-collapsible, shown at 4+ sessions. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-20** — Multi-topic homework files under the single dominant topic (one session = one topic); LLM picks dominant, no server hard cap. *Design approved.* Source: conversation-first-learning-flow.
- **TEACH-21** — Conversation stage is a pure derived computation `getConversationStage(userMsgCount, hasSubject, effectiveMode)` → greeting/orienting/teaching; no new mutable state; survives recovery. *Draft.* Source: conversation-stage-chips.
- **TEACH-22** — Chips/feedback/switch-topic/park hidden during greeting+orienting, shown only at teaching; message content always renders; gating is placement-only. *Draft.* Source: conversation-stage-chips. (Mode list stale — [[C-5]].)
- **TEACH-23** — practice/review/relearn/homework modes bypass warmup → always start at teaching. *Draft.* Source: conversation-stage-chips.
- **TEACH-24** — Freeform greeting guard: anchored `GREETING_PATTERN` + no subject → client-side companion reply, no API call, no session, no quota; rejects nullable-subjectId alternative. *Draft.* Source: conversation-stage-chips.
- **TEACH-25** — Classification guard changed to `!classified && !subjectId && userMsgCount<=2` (fires after greeting, capped at 2 to avoid loops). *Draft.* Source: conversation-stage-chips.

### Library (LIB)

- **LIB-01** — LLM decides subject breadth (broad→books / narrow→topics) at creation; no hardcoded list. *Implemented.* Source: epic-7-library. Narrow case later wrapped in a single book ([[LIB-11]]).
- **LIB-02** — Four-level navigation: Library → Shelf → Book → Topic (+ optional Map). *Implemented.* Source: epic-7-library. Refined to routes ([[LIB-10]]); Shelf later collapsed by v3 ([[LIB-15]]).
- **LIB-03** — `curriculum_books` table (subjectId FK, title, emoji, sortOrder, topicsGenerated); `curriculum_topics` gains `bookId` + `chapter`. *Implemented.* Source: epic-7-library. `bookId` later non-nullable ([[LIB-11]]).
- **LIB-04** — Book status computed on read (NOT_STARTED/IN_PROGRESS/COMPLETED/REVIEW_DUE), not stored. *Implemented.* Source: epic-7-library.
- **LIB-05** — Lazy per-book topic generation on first open, gated by `topicsGenerated`. *Implemented.* Source: epic-7-library. Generation later fully in Book route ([[LIB-10]]).
- **LIB-06** — `topic_connections`: symmetric, untyped, directionless pairs (≤2/topic), visual hint only — no DAG, no cycle detection, no lock/unlock. *Implemented (map view deferred).* Source: epic-7-library.
- **LIB-07** — No prerequisite infrastructure: directional DAG / topological sort / "prove it" gates all removed; ordering = `sortOrder` integer from LLM. *Implemented.* Source: epic-7-library. Supersedes the v2 prerequisite DAG.
- **LIB-08** — Chapter is a text column on topics (group by string), not a table/FK; null → "Other" header (v3). *Implemented.* Source: epic-7-library / library-v3.
- **LIB-09** — `knowledge_signals` append-only cross-session coverage log. *Deferred post-launch* (FR163 provides ~90%). Source: epic-7-library.
- **LIB-09b** — Enhanced session context: concise learning-history block (<500 tokens) in `buildSystemPrompt`, incl. homework, replacing v2 prerequisite injection. *Implemented (substitute for [[LIB-09]]).* Source: epic-7-library.
- **LIB-09c** — Context-aware coaching cards (`book_suggestion`/`homework_connection`/`continue_book`) with priority `review_due > homework_connection > continue_book > book_suggestion > streak` + simple urgency_boost flag. *Implemented.* Source: epic-7-library.
- **LIB-10** — Shelf (`/shelf/[subjectId]`) and Book (`/shelf/[subjectId]/book/[bookId]`) become dedicated Expo Router routes; `library.tsx` simplified. *Implemented.* Source: library-ux-refactor. Supersedes state-based drill-down; Shelf later collapsed ([[LIB-15]]).
- **LIB-11** — `curriculum_topics.bookId` non-nullable with backfill; narrow subjects get a single auto-book; no floating topics. *Implemented.* Source: library-ux-refactor. Supersedes nullable design in [[LIB-03]].
- **LIB-12** — (Superseded) `topic_notes` one-per-topic-per-profile via `UNIQUE(topicId,profileId)` upsert+append. Source: library-ux-refactor. **Superseded by [[LIB-16]]/[[LIB-17]] — see [[C-3]].**
- **LIB-13** — Mid-session note capture offered after >4 exchanges on a substantive answer, ≤once/session (client cooldown), via structured `notePrompt` field. *Implemented.* Source: library-ux-refactor. `notePrompt` bare-JSON fallback documented `envelope.ts:258`.
- **LIB-14** — Single-book shelf auto-navigates to Book via `router.replace()` (Back → Library). *Implemented.* Source: library-ux-refactor.
- **LIB-15** — Library home = expandable shelf rows (book rows inline), most-recent shelf expanded; replaces 3-tab Shelves/Books/Topics; drops carousel/hero/breadcrumbs. *Draft.* Source: library-v3-redesign. Supersedes [[LIB-10]] Shelf concept.
- **LIB-16** — `topic_notes` allows multiple notes/topic: drop unique constraint, add nullable `sessionId` FK, each note addressed by `id`. *Draft → live in code.* Source: library-v3-redesign. See [[C-3]].
- **LIB-17** — Notes API by `noteId`: `POST .../notes`, `PATCH /notes/:id`, `DELETE /notes/:id`; old composite-key PUT/DELETE + `UpsertNoteInput`/`append` removed. *Draft → live.* Source: library-v3-redesign.
- **LIB-18** — Server-side full-text `GET /library/search?q=` over subjects/books/topics/notes; client name-filter as fast path. *Draft.* Source: library-v3-redesign. Expanded by [[LIB-19]].
- **LIB-19** — Library search adds 5th `sessions` result type (ILIKE over `session_summaries`, excl. purged/pending/skipped); typed drill-through per type (books = 2-step push per [[NAV-30]]; notes → topic; sessions → `/session-summary/[id]`). *Implemented.* Source: library-search-drill-through.
- **LIB-20** — Non-subject search rows carry a subject color pill (disambiguation), sorted by subject name. *Implemented.* Source: library-search-drill-through.
- **LIB-21** — Session history (record/summary/transcript/reflection) is always saved; Library filing is a separate, automatic, reversible step; a session can exist outside the Library. *Draft → live.* Source: freeform-library-filing. See [[C-2]].
- **LIB-22** — Freeform auto-filing dispatched as durable Inngest `app/session.auto_file_requested` via `safeSend()` at close (≥3 turns), reusing `fileToLibrary()`; dedupe `id: auto-file-${sessionId}`; guarded SQL transitions. *Draft → live.* Source: freeform-library-filing. Threshold = 3 ([[C-1]]).
- **LIB-23** — Per-profile "Unsorted" auto-subject anchors unclassifiable freeform sessions (because `subjectId` is non-nullable); reconciled in background; excluded from Library listings; nullable-schema deferred to V2. *Draft.* Source: freeform-library-filing.
- **LIB-24** — `filing_kept_out` added as a reversible, non-terminal enum value (history kept, topicId null, re-dispatchable); not a DB terminal constraint; rollback = leave enum unused. *Draft → live (enum exists).* Source: freeform-library-filing. See [[C-2]].
- **LIB-25** — Keep-out deletes the auto-filed topic only if all 5 conditions hold (filing-path-created, this session is creator, no other sessions/progress/retention); else just detach. Detach before delete (cascade). *Draft.* Source: freeform-library-filing.
- **LIB-26** — Hierarchy invariant: a Library topic always resolves profile→subject→curriculum→book→topic; enforced by the filing service, not a DB constraint. *Draft.* Source: freeform-library-filing.
- **LIB-27** — Book deletion: single `DELETE /subjects/:id/books/:id`, server counts started topics, returns conflict unless explicit confirm flag; FK cascade cleans topics/connections; no soft-delete. *Implemented (complete).* Source: delete-book.

### Quiz, Activities & Dictation (QUIZ)

- **QUIZ-01** — Quiz engine is standalone (own tables/routes, no chat sessions); one LLM call generates a whole round as JSON; client renders locally, no per-question API. *Implemented (Phases 1-3).* Source: quiz-activities.
- **QUIZ-02** — Two-tier questions: discovery (majority, no SM-2, wrong silently saved) vs mastery (~25%, from library, feed SM-2); learner can't distinguish. *Implemented.* Source: quiz-activities. Mastery questions never LLM-generated.
- **QUIZ-03** — Mastery ratio scales with due library size: 0 if <3 due, 25% default, 35% if >20. *Implemented (`QUIZ_CONFIG`).* Source: quiz-activities.
- **QUIZ-04** — Capitals validated against a static `capitals_reference` table (~250 rows), mismatches silently corrected; LLM only does themes/facts/distractors. *Implemented.* Source: quiz-activities.
- **QUIZ-05** — Abandoned rounds (`status:'abandoned'`) cannot be resumed, no XP (pedagogical, not a gap). *Implemented.* Source: quiz-activities.
- **QUIZ-06** — Round questions stored as one JSONB blob on `quiz_rounds.questions`; per-question cross-round analytics deferred to a future `quiz_questions` child table. *Implemented.* Source: quiz-activities.
- **QUIZ-07** — Client prefetches the next round at midpoint (Q3); on-demand fallback if prefetch fails. *Implemented.* Source: quiz-activities.
- **QUIZ-08** — Quiz gen defaults to Gemini Flash; per-activity override (Guess Who → stronger model if <90% structured compliance). *Implemented.* Source: quiz-activities.
- **QUIZ-09** — Round-gen LLM Zod-validated, single retry on failure, then graceful error. *Implemented.* Source: quiz-activities.
- **QUIZ-10** — Guess Who fuzzy match: Levenshtein ≤ `max(1, floor(name.length/4))` + aliases. *Implemented.* Source: quiz-activities.
- **QUIZ-11** — SM-2 quality scores are activity-specific (Capitals 4/1; Guess Who 5/3/2/1 by clue count); discovery questions never update SM-2. *Implemented.* Source: quiz-activities, quiz-gaps-completion.
- **QUIZ-12** — Two parallel SM-2 stores: `vocabularyRetentionCards` (vocab) vs new `quiz_mastery_items` (capitals/guess_who); not consolidated in v1; mastery table never receives vocab (typed signature). *Implemented (Phase 6 consolidation deferred).* Source: quiz-gaps-completion.
- **QUIZ-13** — Mastery row created on first correct discovery answer (`ON CONFLICT DO NOTHING`); initial quality 3, next_review now+1d; wrong → `quiz_missed_items` only. *Implemented.* Source: quiz-gaps-completion.
- **QUIZ-14** — Guess Who mastery `item_key = sha1(normalizedName|eraBucket)[:16]`, server-computed; LLM slugs ignored; hash-collision tolerated. *Implemented.* Source: quiz-gaps-completion.
- **QUIZ-15** — Guess Who mastery clues re-generated by a cheap LLM call each review (not stored). *Implemented.* Source: quiz-gaps-completion.
- **QUIZ-16** — `quiz_missed_items` drives only a coaching card; tapping it does not bias next round content. *Implemented.* Source: quiz-gaps-completion.
- **QUIZ-17** — Missed items marked `surfaced=true` on user tap/dismiss, not on precompute; one-time deploy backfill marks pre-existing rows surfaced. *Implemented.* Source: quiz-gaps-completion.
- **QUIZ-18** — Difficulty bump (3 perfect rounds /14d) announced via non-dismissible pre-round banner (`difficultyBump:true`); semantic tokens only; screen-reader announced. *Implemented (5A).* Source: quiz-gaps-completion.
- **QUIZ-18b** — Free-text unlock after `mc_success_count>=3`; wrong free-text resets to 2 (not 0); column merged into Phase 4B migration. *Implemented (5C).* Source: quiz-gaps-completion.
- **QUIZ-18c** — `GET /quiz/rounds/:id` reveals answers only if `profileId` matches AND `status==='completed'`; else answer-stripped; break test required. *Implemented (F-032).* Source: quiz-gaps-completion, quiz-ui-redesign-finding-fixes.
- **QUIZ-18d** — "Best consecutive correct" computed within a single round only; no cross-round streaks. *Implemented (5D).* Source: quiz-gaps-completion.
- **QUIZ-19** — Session recap via `generate-learner-recap` Inngest step, gated `exchangeCount>=3`; uses dedicated `learnerRecapResponseSchema` (NOT the envelope — display-only carve-out, see [[C-10]]). *Implemented.* Source: learner-experience-features.
- **QUIZ-20** — Recap stored as plain text columns (`closingLine`,`learnerRecap`,`nextTopicId`,`nextTopicReason`), matching existing insight columns, not JSONB; bullet list split on `"\n- "`. *Implemented.* Source: learner-experience-features.
- **QUIZ-21** — "Up next" for curriculum sessions = pure DB query (`curriculum_topics` by sort_order minus studied), no LLM. *Implemented.* Source: learner-experience-features.
- **QUIZ-22** — Freeform "Up next" = keyword/ts_vector match of recap concepts against topic titles; low-confidence/zero suppresses the card. *Implemented.* Source: learner-experience-features.
- **QUIZ-23** — Bookmarks snapshot the AI message text at creation (`bookmarks.content`); display always uses snapshot (survives session TTL); `eventId` kept for provenance only. *Implemented.* Source: learner-experience-features.
- **QUIZ-24** — Bookmarks are a standalone table, not `session_events` rows (outlive session, cross-subject queries). *Implemented.* Source: learner-experience-features.
- **QUIZ-25** — Summary screen polls `/summary` every 2s until `learnerRecap` populated; stop + hide skeletons after 15s; re-entry loads instantly. *Implemented.* Source: learner-experience-features.
- **QUIZ-26** — Quiz results screen shows a "What you missed" section (prompt/your answer/correct/fact); no extra gamification added. *Implemented (F-040; depends on F-032).* Source: quiz-ui-redesign-finding-fixes.
- **QUIZ-27** — Lifetime XP total kept as server telemetry only, never displayed (anti-gamification). *Skipped (F-035 rejected).* Source: quiz-ui-redesign-finding-fixes.
- **QUIZ-28** — Missing `quiz_round_results` returns `results:[]` AND emits a structured metric/event (not just `console.warn`); detail view shows "No per-question data". *Implemented.* Source: quiz-ui-redesign-finding-fixes. Applies silent-recovery-ban rule.
- **QUIZ-29** — Deploy smoke test hitting one endpoint per quiz route group (fail on 404 plain-text) recommended after 3 deploy-lag recurrences. *Deferred.* Source: quiz-ui-redesign-finding-fixes.
- **QUIZ-30** — Alias hint on results ("we also accept …") deferred pending F-040 usage data. *Deferred (F-041).* Source: quiz-ui-redesign-finding-fixes.
- **QUIZ-31** — Dictation standalone (own tables/routes); text fully prepared server-side, then fully offline playback, no per-sentence API. *Implemented.* Source: dictation-mode.
- **QUIZ-32** — Two dictation endpoints: `prepare-homework` (fast split) vs `generate` (3-5s extended); separate prompts/timeouts; both converge on one playback screen. *Implemented.* Source: dictation-mode.
- **QUIZ-33** — Dictation sentence hidden by default (dots), peek-on-tap; always-show deferred. *Implemented.* Source: dictation-mode.
- **QUIZ-34** — Dictation pace + punctuation toggle stored per-profile in SecureStore (`dictation-pace-${profileId}`), adjustable mid-session. *Implemented.* Source: dictation-mode.
- **QUIZ-35** — Dictation remediation accepts any retyped sentence, no correction loop; autocorrect disabled. *Implemented.* Source: dictation-mode.
- **QUIZ-36** — Dictation streak = consecutive days with any session, regardless of score; parallel to quiz daily streak. *Implemented.* Source: dictation-mode.
- **QUIZ-37** — Dictation photo-review creates a real `learning_sessions` row (`sessionType=learning`, `effectiveMode=dictation`); depends on image pass-through. *Implemented.* Source: dictation-mode.
- **QUIZ-38** — Pre-playback countdown spoken in the dictation's language (LLM-detected), not app language. *Implemented.* Source: dictation-mode.
- **QUIZ-39** — Encouragement uses a two-tier age framework (11-14 named specifics; 15-17 brief); generic praise banned all ages; voice-mode brevity wins. *Implemented (prompt-only).* Source: learner-experience-features.

### LLM Infrastructure (LLM)

- **LLM-01** — All LLM calls route through `routeAndCall`/`routeAndStream`; no provider SDK imports outside `services/llm/providers/`. *Implemented.* Source: llm-personalization-audit.
- **LLM-02** — Tiered routing by `rung`(1-5) × `llmTier`: rungs 1-2 → Gemini 2.5 Flash (GPT-4o-mini fallback); rung 3+ → Gemini Pro / GPT-4o; premium → Claude Sonnet 4.6; flash → cheapest. *Implemented.* Source: llm-personalization-audit.
- **LLM-03** — Router prepends an age-aware safety/identity preamble to every prompt; preamble edits need a separate spec. *Implemented.* Source: llm-personalization-audit.
- **LLM-03b** — Circuit breaker + retry + Gemini→OpenAI fallback built into the router. *Implemented.* Source: llm-personalization-audit.
- **LLM-04** — `[MARKER]` tokens banned for state-machine decisions; replace with the envelope. *Implemented (migration complete).* Source: llm-reliability-ux-audit. Exception: `notePrompt`/`fluencyDrill` bare-JSON fallback documented `envelope.ts:258` ([[C-10]]).
- **LLM-05** — Every state-machine LLM call returns `llmResponseEnvelopeSchema` (`{reply,signals,ui_hints,confidence}`), parsed by `parseEnvelope()`; free-text-only flows excluded; SSE streams `reply`, signals at close. *Implemented.* Source: llm-response-envelope. Repo non-negotiable. Carve-outs [[C-10]].
- **LLM-06** — Every terminal-state signal has a server-side hard cap forcing the transition after N (`MAX_INTERVIEW_EXCHANGES=4` [[C-4]], `MAX_PARTIAL_PROGRESS_HOLDS=2`, `MAX_NEEDS_DEEPENING_PER_SUBJECT=10`). *Implemented.* Source: llm-response-envelope.
- **LLM-07** — Envelope provider strategy: JSON mode where supported (Strategy 1) else in-prompt JSON + regex extract + Zod (Strategy 2); router picks, callers always use `parseEnvelope()`. *Designed.* Source: llm-response-envelope.
- **LLM-08** — Shadow-run telemetry during marker→envelope migration; >2% disagreement after a week → switch flow to JSON mode before cutover; telemetry removed after 2 clean weeks. *Designed.* Source: llm-response-envelope.
- **LLM-09** — Every CRITICAL/HIGH signal migration ships a break test (mock wrong signal, assert cap/fallback). *Designed.* Source: llm-response-envelope.
- **LLM-10** — Divergent `[PARTIAL_PROGRESS]` parsers (permissive `.includes` vs strict regex) unified to the strict version as an immediate hotfix, independent of full migration. *Implemented (hotfix).* Source: llm-reliability-ux-audit.
- **LLM-11** — Interview closes on `ready_to_finish===true` OR `exchangeNumber>=MAX_INTERVIEW_EXCHANGES(4)`. *Implemented.* Source: llm-response-envelope. Reliability audit's 2-3 rec not adopted ([[C-4]]).
- **LLM-12** — Envelope `confidence: low|medium|high` (absent = medium); `<high` may surface an "Is this right?" tap target. *Designed (schema exists, UI pending).* Source: llm-reliability-ux-audit / llm-response-envelope.
- **LLM-13** — `buildMemoryBlock` entries carry `{text,sourceSessionId,sourceEventId}` (inspectable, GDPR, injection audit). *Designed; partially adopted in prompt-tuning B.4.* Source: llm-reliability-ux-audit.
- **LLM-14** — Tone instructions written as negative-constraint lists (`NEVER begin with "That's a great question"`), not positive exhortations. *Implemented (B.1).* Source: prompt-tuning. Escalation if <70% compliance = preamble change or premium tier (out of scope).
- **LLM-15** — TEXT MODE block forbids parenthetical pronunciation guides when `inputMode!=='voice' && pedagogyMode!=='four_strands'`; voice keeps them; language exempt. *Implemented (B.2).* Source: prompt-tuning.
- **LLM-16** — `correctStreak` (cap 5) computed from recent `session_events` and injected; `>=3` adds an ADAPTIVE ESCALATION section offering difficulty increase. *Implemented (B.3).* Source: prompt-tuning.
- **LLM-17** — `buildMemoryBlock` re-injects last session summary (≤200 chars within 14d) + up to 5 parked questions for continuity; must use scoped repo. *Implemented (B.4).* Source: prompt-tuning.
- **LLM-18** — Age-calibration anchors restricted to 11-17 (no 9yo/adult learner archetypes in prompt text); `getAgeVoice()` adult branch kept for null-birthYear safety routing. *Implemented (B.5).* Source: prompt-tuning. (11+ product constraint.)
- **LLM-19** — 700-line monolithic `buildSystemPrompt` acknowledged as a smell; restructuring into preamble+sections is the escalation path if compliance stays low. *Deferred.* Source: prompt-tuning.
- **LLM-20** — Interests must be injected into all quiz + dictation prompts (highest-impact personalization gap). *Deferred (P0 in audit, out of B.* scope).* Source: llm-personalization-audit.
- **LLM-21** — Standardize age input to `ageYears` integer across prompts; `ageBracket`/`describeAgeBracket` is lossy and non-canonical. *Deferred (P0).* Source: llm-personalization-audit.
- **LLM-22** — Session-analysis prompt must receive existing struggles/strengths + suppressed inferences ("extract new only"). *Deferred (P0).* Source: llm-personalization-audit.
- **LLM-23** — Extract prompt builders into typed per-flow `prompts/` modules (`PromptBuilder<Input>` → `{system,user}`). *Deferred (P2).* Source: llm-personalization-audit.
- **LLM-24** — Eval harness `FlowDefinition` gains optional `expectedResponseSchema`; Tier-2 `--live` validates real responses against it. *Implemented.* Source: llm-personalization-audit / llm-response-envelope. Live runs not per-PR.
- **LLM-25** — Empty/malformed/orphan-marker classified in `streamMessage.onComplete` (not mid-stream); route emits a dedicated `fallback` SSE event strictly before `done`. *Implemented.* Source: empty-reply-stream-guard.
- **LLM-26** — Fallback turns are NOT persisted to exchange history (skip `persistExchangeResult` or sentinel) so the next-turn re-wrap doesn't double-encode the envelope (root fix). *Implemented.* Source: empty-reply-stream-guard.
- **LLM-27** — Single canonical `isRecognizedMarker()` on server; mobile regex strip deleted in the same commit (kill dual source of truth). *Implemented.* Source: empty-reply-stream-guard.
- **LLM-28** — Empty/fallback exchanges refund quota (reuse route-level `incrementQuota` via typed `FallbackOnlyResult` throw). *Implemented.* Source: empty-reply-stream-guard.
- **LLM-29** — Every unsubscribed durable Inngest event gets a dedicated observer (no silently-unsubscribed events); built for `app/session.filing_timed_out`. *Implemented.* Source: filing-timed-out-observer.
- **LLM-30** — Filing observer does active reconciliation (one `app/filing.retry` + 60s wait) before declaring terminal failure; backfill-only, no full pipeline replay; terminal failure → push with ancestor-chain deep-link ([[NAV-30]]). *Designed.* Source: filing-timed-out-observer.
- **LLM-31** — Filing state queryable via `filing_status` enum + `filed_at` + `filing_retry_count` on `learning_sessions` (`filed_at` is the watermark, not `topicId`). *Designed.* Source: filing-timed-out-observer.
- **LLM-32** — User retry `POST /sessions/:id/retry-filing`: scoped repo (IDOR), 409 if not failed, 429 if retries≥3, atomic increment; metered against user quota (auto-retries are not). *Designed.* Source: filing-timed-out-observer.
- **LLM-33** — Inngest handlers use `getStepDatabase()` directly; `createScopedRepository(profileId)` reserved for HTTP routes (IDOR boundary). *Implemented; repo precedent.* Source: filing-timed-out-observer.

### i18n & Language (I18N)
*(Note: "Language teaching" = a study subject; "i18n/localization" = UI/prose locale. Kept distinct.)*

- **I18N-01** — Build-time LLM translation (`pnpm translate`), one static JSON per locale, English source of truth, zero runtime LLM. *Draft.* Source: llm-powered-i18n. Tooling later switched to Gemini ([[I18N-19]], [[C-9]]).
- **I18N-02** — 7 UI-shell locales `SUPPORTED_LANGUAGES` (en,nb,de,es,pt,pl,ja); nb=home market, human review. *Draft → canonical.* Source: llm-powered-i18n.
- **I18N-03** — UI language = device locale (`expo-localization`) + manual override in AsyncStorage `app-ui-language`. *Draft.* Source: llm-powered-i18n. Conversation language persisted at profile creation ([[I18N-12]]).
- **I18N-04** — Language picker hidden behind `i18n.enabled` flag until all screens migrated + files validated. *Draft (flag since flipped).* Source: llm-powered-i18n.
- **I18N-05** — API returns stable `errorCode` strings (not class names — minification-unsafe); mobile maps via `ERROR_KEY_MAP`; `errorCode` abstract on base error. *Draft.* Source: llm-powered-i18n. `errors.*` kept alive via KEEP_PATTERNS ([[I18N-22]]).
- **I18N-06** — Translation script defaults to diff mode (only changed keys), preserving human edits; `--full` opt-in. *Draft.* Source: llm-powered-i18n. Now `translate-gemini.ts:314-330` deletions-only short-circuit ([[I18N-20]]).
- **I18N-07** — Keys use i18next `_one`/`_other` plural-ready naming by reservation; extraction deferred, no second migration. *Draft.* Source: llm-powered-i18n.
- **I18N-08** — CI staleness gate (`check-i18n-staleness.ts`) fails any PR editing `en.json` that leaves locales out of sync on keys/`{{vars}}`. *Draft.* Source: llm-powered-i18n. Phase 2 adds reverse-orphan pre-commit ([[I18N-16]]).
- **I18N-09** — Post-onboarding one-time prompt to align `conversationLanguage` to UI language if they differ and not dismissed; independent thereafter. *Draft.* Source: llm-powered-i18n.
- **I18N-10** — Translation QA: 10% back-translation + embedding drift check + locked glossary (`i18n-glossary.json`) + mandatory human review nb/de. *Draft (Gemini-era status unconfirmed).* Source: llm-powered-i18n.
- **I18N-11** — Server-generated user strings (push, email) deferred to v2. *Draft/Deferred.* Source: llm-powered-i18n. LLM session prose handled by [[I18N-12]]ff.
- **I18N-12** — Intentional divergence: 7-locale UI `SUPPORTED_LANGUAGES` vs 10-code conversation `conversationLanguageSchema` (superset incl. cs/fr/it); `useMentorLanguageSync` clamps via `safeParse`; DB CHECK (migration 0087) is the floor. *Draft → documented.* Source: i18n-phase2 / phase1. Central tension.
- **I18N-13** — `useMentorLanguageSync` is the steady-state sync: clamps `i18next.language` through `conversationLanguageSchema.safeParse`, patches profile on every UI-language change. *Draft → live.* Source: i18n-phase1.
- **I18N-14** — `conversationLanguage` threaded at profile-creation time (clamp `i18next.language` into createProfile body) to kill the signup English-flash; child-from-parent omits it (DB default 'en', MED-2). *Draft.* Source: i18n-phase1.
- **I18N-15** — Every learner-facing `routeAndCall` in `{services,inngest,routes}/**` must pass `conversationLanguage` + `flow:`; internal-classification sites denylisted with marker comments. *Draft (adversarial-reviewed).* Source: i18n-phase1.
- **I18N-16** — Forward-only CI ratchet `router.language-coverage.test.ts` fails on any non-denylisted `routeAndCall`/`routeAndCallForQuiz` omitting `conversationLanguage:`/`flow:`; glob `{services,inngest,routes}/**`. *Draft.* Source: i18n-phase1. Reverse-orphan pre-commit fires on any `apps/mobile/src/**` staged change.
- **I18N-17** — Runtime tripwire: `logger.warn('llm.language.missing')` when a `LEARNER_FACING_FLOWS` flow omits `conversationLanguage` (no throw; ratchet is primary). *Draft.* Source: i18n-phase1.
- **I18N-18** — Flow-tag strings are load-bearing (dashboard/Sentry queries); preserved verbatim, no rename without a paired dashboard sweep. *Draft.* Source: i18n-phase1.
- **I18N-18b** — `pronouns` router threading deferred to Phase 1.5 (same files re-touched, accepted cost). *Draft/Deferred.* Source: i18n-phase1.
- **I18N-18c** — Per-flow Tier-1 eval fixtures at `nb` (17 flows) + 5-locale fixtures for `session-recap`; one real-wiring integration test. *Draft.* Source: i18n-phase1.
- **I18N-19** — Orphan-key checker rewritten from regex to `ts-morph` AST walker (resolves aliases, multi-line calls, template markers, wrapper-hook indirection); `// i18n-not-t:` suppression. *Draft.* Source: i18n-phase2. Active translate path is `translate-gemini.ts` ([[C-9]]).
- **I18N-20** — Reverse-orphan (unused-key) detection becomes a blocking CI gate after a one-shot sweep to zero (`--report-unused` default). *Draft.* Source: i18n-phase2.
- **I18N-21** — Deletions-only translation cascade is free (no LLM round-trip), `translate-gemini.ts:314-330`. *Draft → live.* Source: i18n-phase2.
- **I18N-22** — `KEEP_PATTERNS` is a typed TS allowlist (`scripts/i18n-keep.ts`); each `reason` cites `file:line`; `check-i18n-keep-rot.ts` fails CI on a rotted cite; Zod format guard + liveness guard kept separate. *Draft.* Source: i18n-phase2.
- **I18N-23** — Multi-interpolation template `t()` (>1 `${}`) fails the checker unless `// i18n-allow-multi-var:` is present; single-interp passes. *Draft.* Source: i18n-phase2.
- **I18N-24** — Hardcoded JSX English literals are a known unguarded gap; Phase 3 baseline-allowlist ratchet on `JsxText`/JSX `StringLiteral` is future work; until then tests assert testIDs not copy. *Draft / future.* Source: i18n-phase2.
- **I18N-25** — Sweep PR must coordinate in-flight `en.json` branches (announce + block + re-run diagnostic) since it rewrites all 7 locale files in one commit. *Draft.* Source: i18n-phase2.
- **I18N-26 (Language Teaching)** — Language-learning subjects switch `pedagogyMode` to `four_strands` (direct instruction + explicit grammar/correction), replacing the Socratic ladder; new enum on `subjects` orthogonal to `teaching_method`. *Complete.* Source: epic-6-language-learning.
- **I18N-27 (LT)** — Language-subject detection = keyword match (~200 names) + a boolean `isLanguageLearning` on the existing `classifySubject()` call + learner confirmation card. *Complete.* Source: epic-6-language-learning.
- **I18N-28 (LT)** — Per-learner `vocabulary` table (CEFR + milestone) + separate `vocabularyRetentionCards` SM-2 (reuses `packages/retention/`); `(profileId,subjectId,term)` unique; CEFR/milestone preserved on upsert. *Complete.* Source: epic-6-language-learning.
- **I18N-29 (LT)** — Learner-visible progress = CEFR micro-milestones; FSI hours internal only; CEFR columns nullable on `curriculumTopics`. *Complete.* Source: epic-6-language-learning.
- **I18N-30 (LT)** — STT set to the target language locale (e.g. `es-ES`) via per-subject `sttLocale`, not device language; mid-session STT toggle deferred. *Complete.* Source: epic-6-language-learning.
- **I18N-31 (LT)** — In-session vocabulary extracted via a hidden structured JSON block (`{newVocabulary, strand, grammarPoint}`); predates the envelope ([[C-10]]). *Complete.* Source: epic-6-language-learning.
- **I18N-32 (LT)** — Launch scope = FSI Category I/II (Latin-script); Category III/IV (zh/ja/ko/ar/ru) post-launch — note `ja` is a UI locale but excluded from teaching at launch. *Complete.* Source: epic-6-language-learning.

### Profile, Ownership & Privacy (PROF)

- **PROF-01** — Reporting components lifted to `components/progress/`, take `profileId` prop, reused across parent/child (no persona logic). *Implemented (Phase 1 PR1).* Source: profile-as-lens. Further consolidated by [[PROF-15]].
- **PROF-02** — `/progress` shows the active profile's own reports for all shapes; parent-only with zero sessions → "Start your own learning" CTA. *Implemented (PR3).* Source: profile-as-lens.
- **PROF-03** — `/subscription` usage breakdown per-profile, owner-only; non-owners see own slice + family aggregate; children never see other children's usage. *Implemented (PR2; Phase 2 share toggle a slice).* Source: profile-as-lens.
- **PROF-04** — No stored "user shape" field; shape derived at runtime from `family_links` + attributes. *Implemented (non-goal).* Source: profile-as-lens. Consistent with [[PROF-08]].
- **PROF-05** — (Superseded) Family tab conditionally mounted when `family_links>0`, single dismissible cue; never for child profiles. Source: profile-as-lens. Superseded by [[NAV-01]]…[[NAV-04]] — see [[C-6]].
- **PROF-06** — Multi-lens Home (PR7) deferred (premise unvalidated; existing gateway/learner split adequate). *Deferred.* Source: profile-as-lens.
- **PROF-07** — Child profiles never see Family tab / other children's data; see total remaining quota only (no per-profile breakdown). *Partially implemented (PR10 planning).* Source: profile-as-lens. Reinforced by RLS [[PROF-19]].
- **PROF-07b** — Consent withdrawal: 7-day grace; under-13 deleted at expiry (no archive), 13+ get 30-day archive. *Partially implemented (PR11 planning).* Source: profile-as-lens.
- **PROF-08** — `isParentProxy` derived purely from ProfileContext (`!isOwner && profiles.some(isOwner)`); `useParentProxy` is sole source; <200ms restart race accepted (GET-only window). *Implemented.* Source: parent-proxy-mode.
- **PROF-09** — `X-Proxy-Mode` header is client-sent, strippable, defense-in-depth only; primary protection is UI gating; server `assertNotProxyMode` catches URL-scheme bypass. *Implemented.* Source: parent-proxy-mode. Contrast [[NAV-12]].
- **PROF-10** — All learning-record-creating endpoints guarded with `assertNotProxyMode` (interview/sessions/homework/quiz/dictation/relearn/recall/assessments); stateless utilities not guarded; justified by `mentomate://` auto-routing. *Implemented.* Source: parent-proxy-mode.
- **PROF-11** — In proxy mode a parent may write child More-tab settings; child not notified (accepted trade-off). *Implemented.* Source: parent-proxy-mode.
- **PROF-12** — Bookmark delete hidden in proxy mode (view-not-delete); `create-subject` intentionally allowed in proxy. *Implemented.* Source: parent-proxy-mode.
- **PROF-13** — Each UI surface declares owns/reads-narrow/must-not-touch boundaries enforced by `surface-ownership.test.ts` (AST/resolved-import); barrels transparent; scans component folders. *Implemented.* Source: surface-ownership-boundaries. Caveat: facade hooks enforce imports, not payload reduction.
- **PROF-14** — Every profile-scoped query key includes viewer profileId; cross-profile lens keys include both `activeProfileId` + `targetProfileId`; don't collapse dimensions; don't combine key-identity + invalidation-precision changes in one PR. *Implemented.* Source: surface-ownership-boundaries.
- **PROF-15** — `dashboard.ts` god-service extraction keeps all parent-access-guarded functions (`getChild*`, `assertChildDashboardDataVisible`, …) in `dashboard.ts`; only domain-neutral utilities move; `sortSubjectsByActivityPriority` held until call sites replaced. *Implemented (PR2).* Source: surface-ownership-boundaries.
- **PROF-16** — `WithdrawalCountdownBanner` receives a typed `WithdrawnChild[]`, not a single date; must not call `useDashboard()` itself (per-child restore rows). *Implemented.* Source: surface-ownership-boundaries.
- **PROF-17** — Parent session-transcript endpoint removed entirely; parents see `session_summaries.displaySummary`; all `ChildSessionTranscript`/`getChildSessionTranscript` references purged. *Implemented.* Source: parent-visibility-privacy. Complemented by [[PROF-22]].
- **PROF-18** — `session_events` gets no `parent_read_via_family` RLS — parents denied raw turn-by-turn even for linked children (privacy boundary, defense-in-depth with [[PROF-17]]). *Implemented.* Source: parent-visibility-privacy.
- **PROF-19** — Parent-read RLS is additive (`parent_read_via_family` via `family_links` subquery) alongside `profile_isolation`, not replacing it; every dashboard-read table must be enumerated pre-migration (missed table = silent empty/500). *Implemented.* Source: parent-visibility-privacy.
- **PROF-20** — `family_links` RLS: separate SELECT policies for parent and child; no INSERT/UPDATE/DELETE for `app_user` (writes implicitly denied; go through `ownerDb` consent service). *Implemented.* Source: parent-visibility-privacy. Relies on Postgres implicit-deny.
- **PROF-21** — Parents read a curated `GET /dashboard/children/:id/memory` (grouped by category); raw `/learner-profile/:id` kept for self; `suppressedInferences` excluded from the curated view. *Implemented (Option A).* Source: parent-visibility-privacy. Lives in Child Profile surface ([[PROF-13]]), related [[MEM-30]].
- **PROF-22** — Parent memory deletion defaults to `suppress=true` (append to `suppressedInferences`) so the engine won't re-infer. *Implemented.* Source: parent-visibility-privacy.
- **PROF-23** — Parent-facing vocabulary canon maps internal terms (exchange/active-min/retention/mastered/rung) to plain labels; never show contradicting metrics; retention signal gated `completionStatus!='not_started' && totalSessions>=1`. *Implemented (Phase 1).* Source: parent-narrative.
- **PROF-24** — `session_summaries` gains `narrative` + `conversation_prompt` + `engagement_signal` (same Inngest step as `highlight`); parents see recap + starter + mood chip, not transcript; injection break tests per field. *Implemented (Phase 2).* Source: parent-narrative. Complements [[PROF-17]].
- **PROF-25** — Parent onboarding (3-step overlay) triggers on `isOwner` AND first child's ≥1 session; tracked by `parent_onboarding_completed_at`; re-runnable from More. *Deferred (Phase 4).* Source: parent-narrative.
- **PROF-26** — Weekly parent digest cron (`0 19 * * 0`) per-child narrative email to owners with `weekly_digest_enabled`; skipped when no sessions; 2 email failures → disable flag + in-app banner. *Deferred (Phase 4).* Source: parent-narrative. See email channel [[AUTH-25]].
- **PROF-27** — `masteryScore` mapped client-side to plain labels; retention signal gated on session count; no schema change. No web client exists today; if one is added, lift only the numeric thresholds into `@eduagent/schemas`, not the copy. *Implemented (Phase 1).* Source: parent-narrative.
- **PROF-28** — Cross-account family linking out of scope: all family profiles on the same Clerk account; no invite/claim flow. *Implemented (out of scope).* Source: parent-visibility-privacy; profile-as-lens (co-parent UX also out).

### Onboarding & Subject/Book Creation (ONB)

- **ONB-01** — Interactive HTML atlas (9 boards, data-driven) is the canonical internal onboarding reference; PNG exports + deck are secondary, never canonical. *Implemented.* Source: visual-onboarding-atlas.
- **ONB-02** — Atlas uses Guided Tour (9 boards, prev/next/index) + jump index for both first-time and returning audiences. *Implemented.* Source: visual-onboarding-atlas.
- **ONB-03** — Atlas maintenance rule: prefer current code over docs; mark doc-only/future content explicitly. *Implemented.* Source: visual-onboarding-atlas.
- **ONB-04** — Atlas node drawer has a fixed schema (name/category/role/status/deps/data/paths/docs/tests/dashboards/risks/related); empty fields omitted. *Implemented.* Source: visual-onboarding-atlas.
- **ONB-05** — Onboarding fast path removes `interests-context`/`analogy-preference`/`accommodations`/`curriculum-review` from the gating chain (non-language): interview → first session in ≤1 screen. *Draft (Phase 2).* Source: subject-onboarding-fast-path.
- **ONB-06** — Bypassed-screen signals added only to the post-hoc `SIGNAL_EXTRACTION_PROMPT`, never the live `INTERVIEW_SYSTEM_PROMPT` (which is in pre-existing envelope drift F1.1). *Draft (Phase 1).* Source: subject-onboarding-fast-path.
- **ONB-07** — Pace preference derived mechanically (message length / read time), not via an LLM call. *Draft.* Source: subject-onboarding-fast-path.
- **ONB-08** — `focused_book` 0-screen path deferred until 4 backend questions resolved; floor stays `create-subject → interview → tutoring`. *Deferred.* Source: subject-onboarding-fast-path.
- **ONB-08b** — Bypassed personalization screens surfaced later via a Settings panel, not deleted in Phase 1-3 (deletion gated on Settings ship). *Phase 3 deferred.* Source: subject-onboarding-fast-path.
- **ONB-08c** — Fast path shipped behind a build-time constant `ONBOARDING_FAST_PATH` (no runtime flag service); rollback = OTA. *Draft.* Source: subject-onboarding-fast-path.
- **ONB-08d** — `language-setup` kept as-is as a 2nd screen for `four_strands` subjects (L1/CEFR are turn-1 inputs). *Decision locked.* Source: subject-onboarding-fast-path.
- **ONB-09** — Welcome intro gate fires at position 8 (after SaveWizardGate, before CreateProfileGate). *Implemented (2026-05-25).* Source: welcome-intro. Ordering is fragile.
- **ONB-10** — Welcome-intro seen-state keyed per Clerk userId (`intro_seen_v1_{clerkUserId}`), not per profile. *Implemented.* Source: welcome-intro.
- **ONB-11** — In-memory `Set` + SecureStore dual write (`markIntroSeenSync`) prevents the welcome routing race; write failures → Sentry + `intro_securestore_write_failed` metric. *Implemented.* Source: welcome-intro.
- **ONB-12** — No skip button on welcome intro v1 (revisit only on analytics-shown friction). *Implemented.* Source: welcome-intro.
- **ONB-13** — Welcome intro ships standalone (no paired home artifact strip — existing `home-my-notes` suffices). *Implemented.* Source: welcome-intro.
- **ONB-14** — Welcome intro i18n values deferred — non-English locales carry English placeholders until the full-app sweep. *Deferred.* Source: welcome-intro.
- **ONB-15** — Versioned SecureStore key (`intro_seen_v1_`) lets a future repositioning force a re-show by bumping the suffix. *Implemented.* Source: welcome-intro.
- **ONB-16** — Trial-intent onboarding v0 ships the intent→value-prop→save-wizard skeleton with NO pre-signup LLM; first teaching moment is the first real session. *Draft.* Source: trial-intent-save-onboarding-v0.
- **ONB-17** — Entire preview onboarding behind one boolean `PREVIEW_ONBOARDING_ENABLED` gating exactly 3 sites; rollback = flag-off + OTA. *Draft (Hard Rule 0).* Source: trial-intent-save-onboarding-v0.
- **ONB-18** — Save wizard's target (`self`/`child`/`both`) is the sole source of truth for profile shape; overrides pre-signup intent. *Draft (Rule 4).* Source: trial-intent-save-onboarding-v0.
- **ONB-19** — Solo owner (no linked children) always lands on learner home; predicate `isFamilyCapableProfile`. *Draft (Rule 5).* Source: trial-intent-save-onboarding-v0. Shared invariant with study-and-family-v0.
- **ONB-20** — No LLM before signup; value-prop screen is static with clearly-marked sample dialogue; never fake live data. *Draft (Rules 1/6).* Source: trial-intent-save-onboarding-v0.
- **ONB-21** — Pre-signup intent survives OAuth via a single `mentomate_preview_intent` SecureStore key (1h TTL, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`), cleared on sign-out/save/expiry. *Draft (Rule 7).* Source: trial-intent-save-onboarding-v0.
- **ONB-22** — `isFamilyCapableProfile` ships unconditionally (not gated by the preview flag) because study-and-family-v0 imports it; trial v0 must ship first. *Draft.* Source: trial-intent-save-onboarding-v0. Same predicate as [[NAV-29]].
- **ONB-23** — Subject-creation chips: 9 static hardcoded subjects, shown only when input empty, pre-fill on tap, no API call. *Approved.* Source: subject-creation-suggestions.
- **ONB-24** — Returning users see existing-subject pills ("Or continue with") on the creation screen → direct to library, bypassing creation. *Approved.* Source: subject-creation-suggestions.
- **ONB-25** — Book-suggestion regeneration is synchronous on-demand on the picker route (`GET .../book-suggestions?topup=1`) when pool <4 — not background Inngest/shelf prefetch. *Implemented.* Source: book-suggestion-regeneration. GET-with-side-effect bounded by [[ONB-27]],[[ONB-28]].
- **ONB-25b** — `?topup=1` gates LLM generation to the picker only; shelf uses the same hook without triggering generation. *Implemented.* Source: book-suggestion-regeneration. Query keys include `topup`.
- **ONB-27** — Postgres advisory lock (`pg_try_advisory_xact_lock` on hashed profile:subject) prevents concurrent book-suggestion generation; loser re-reads pool without waiting. *Implemented (CRITICAL-1).* Source: book-suggestion-regeneration.
- **ONB-28** — 5-min cool-down via `book_suggestions_last_generation_attempted_at` (stamped before the LLM call so sticky failures also cool down); every catch emits `book_suggestion_generation_failed`. *Implemented (CRITICAL-2).* Source: book-suggestion-regeneration.
- **ONB-29** — Book-suggestion response changed bare array → `{suggestions, curriculumBookCount}` so picker derives `hasAnyBook` without a 2nd round-trip; `/all` keeps legacy shape (dead code). *Implemented (HIGH-2).* Source: book-suggestion-regeneration.
- **ONB-30** — Suggestions categorized `related`(2)+`explore`(2) via nullable `category`; grouped display only when `hasAnyBook`; legacy null-category rows render ungrouped at bottom. *Implemented.* Source: book-suggestion-regeneration.
- **ONB-31** — `four_strands` subjects skip book-suggestion generation (different curriculum flow). *Implemented.* Source: book-suggestion-regeneration.
- **ONB-32** — "Add to my learning" bridge is a silent server-side clone of a child's topic into the adult's curriculum — no session start, no queue entry, no notification; profiles independent after write. *Draft v3.* Source: learn-this-too-bridge. Blocked on nav-contract PR4.
- **ONB-33** — Bridge provenance: nullable `source_child_profile_id` on `curriculum_topics`, `ON DELETE SET NULL` (GDPR-clean); display-only, drives no runtime behavior. *Draft v3.* Source: learn-this-too-bridge.
- **ONB-34** — Bridge writes only to the adult profile via `createScopedRepository(adultProfileId)`; never mutates child data; revocation not retroactive. *Draft v3.* Source: learn-this-too-bridge.
- **ONB-35** — Bridge snapshot read uses `assertParentAccess`, returns 404 (not 403) on failure to avoid IDOR ID-existence leak. *Draft v3.* Source: learn-this-too-bridge.
- **ONB-36** — New bridge subject uses the adult's `conversationLanguage`, not the child's; topic titles copied verbatim (may appear in child's school language — accepted V1 limit). *Draft v3.* Source: learn-this-too-bridge.
- **ONB-37** — Bridge clone uses resolve-or-create (`INSERT … ON CONFLICT DO NOTHING RETURNING id`, re-select on race); subject dedup on `(profile_id, lower(name)) WHERE active`, language-agnostic. *Draft v3.* Source: learn-this-too-bridge.
- **ONB-38** — Bridge button gated by `NavigationContract.gates.showLearnThisToo` (adult owner + family link + family context + not proxy). *Draft v3.* Source: learn-this-too-bridge.
- **ONB-39** — Bridge copy locked to "Add to my learning" + "Private to your learning"; analytics/keys use `add_to_my_learning.*`; "Learn this too" abandoned. *Draft v3.* Source: learn-this-too-bridge.
- **ONB-40** — Bridge idempotency via client `requestId`, server-deduped `(adult,child,topic,requestId)` for 60s; analytics fire on every tap (incl. alreadyExisted). *Draft v3.* Source: learn-this-too-bridge.
- **ONB-41** — Bridge undo deletes the topic row only; empty book/subject containers persist (no cleanup — avoids row-lock race). *Draft v3.* Source: learn-this-too-bridge.
- **ONB-42** — `returnTo` extends the closed `homeHrefForReturnTo` token mapper with `family-recaps`/`family-child` tokens (no arbitrary paths); coordinate token names with the FULL nav plan. *Draft v3.* Source: learn-this-too-bridge.

### Stabilization, Interaction Durability & Cross-Cutting (STAB)

- **STAB-01** — Session screen decomposed from 3,135 lines into 7+ focused files (orchestrator <900); `session.ts`/`billing.ts` similarly into barrel dirs; pure refactor, no behavior/schema change. *Implemented.* Source: stabilization-sprint.
- **STAB-02** — One-module-per-commit extraction rule (for `git bisect` revertability). *Implemented.* Source: stabilization-sprint.
- **STAB-03** — `void mutateAsync()` fire-and-forget must `.catch()`; no silent unhandled rejections (sweep). *Implemented.* Source: stabilization-sprint.
- **STAB-04** — Critical queries check `isError` + render retry; non-critical may keep `?? []` but must comment + log. *Implemented.* Source: stabilization-sprint.
- **STAB-05** — `__DEV__`-gated `console.warn` in auth catch blocks replaced with `Alert.alert` (production users always see feedback); swept. *Implemented.* Source: stabilization-sprint.
- **STAB-06** — Internal service functions return typed `{ok}` result or throw, never a success-shaped fallback; all callers updated same commit (explicit contract change). *Implemented.* Source: stabilization-sprint.
- **STAB-07** — Async mutation handlers need a `useRef` in-flight lock in addition to `isPending` (state isn't synchronous); swept. *Implemented.* Source: stabilization-sprint.
- **STAB-08** — Integration tests use a real DB + real internal services; mock only external boundaries (LLM/Stripe/Clerk JWKS/RevenueCat/push/email); Inngest handlers called directly. *Implemented.* Source: stabilization-sprint. (Now CLAUDE.md GC1/GC6 rules.)
- **STAB-09** — Every user interaction durably captured before the request returns (device outbox + server DB row); context-builder treats captured-but-unresponded turns as first-class history. *Designed (post-adversarial 2026-05-01).* Source: interaction-durability. Supersedes the input↔output-coupled persistence model.
- **STAB-10** — Mobile outbox uses AsyncStorage (`outbox-${profileId}-${flow}`), not SecureStore (4KB/slow). *Designed (Amendment A9, reverses original).* Source: interaction-durability.
- **STAB-11** — Confirmed outbox entries deleted inline on `done`/200, not swept lazily. *Designed (A10).* Source: interaction-durability.
- **STAB-12** — Idempotency middleware (`idempotencyPreflight`) + `client_id` JSONB ship with Layer 1 (not Layer 2); KV is a hint, DB unique index `(session_id, client_id)` is authority; never KV-cache SSE bodies (single-use). *Designed (A1/A2).* Source: interaction-durability. Repo idempotency pattern — see [[C-11]].
- **STAB-13** — Orphan user-turn marker appended to top-level `system` as `<server_note .../>` (≤3), not a mid-conversation role message (Anthropic rejects mid-conv system); sanitizer strips `<server_note>` from user content (injection). *Designed (A6).* Source: interaction-durability.
- **STAB-14** — `persistCurriculumAndMarkComplete` writes curriculum + status-flip + `topicsGenerated` atomically. Spec A7 mandated `db.batch([...])` calling it "the only ACID primitive." **⚠ This rationale is stale and contradicts memory `project_neon_transaction_facts`:** after the neon-serverless driver switch ([[RLS-01]]) `db.transaction()` is genuinely interactive/ACID, and the L3 plan's R3 revision used `db.transaction()` instead. Moot in code — L3 was never built ([[AUDIT-A]]). *Designed (A7), superseded.* Source: interaction-durability.
- **STAB-15** — Dispatch guard uses one atomic conditional `UPDATE … WHERE status='in_progress' RETURNING id`; only the winner dispatches; loser → 200 (no 409). *Designed (A11).* Source: interaction-durability.
- **STAB-16** — `extractSignals` result persisted on the draft within the same `step.run`; retries skip the LLM only if `cached.topics.length>0` (empty = cache miss). *Designed (A3).* Source: interaction-durability.
- **STAB-17** — Inngest `onFailure` flips draft to `failed` with typed `failureCode`; raw error text logged server-side only (may contain keys), never DB/mobile. *Designed (A4).* Source: interaction-durability.
- **STAB-18** — Idempotent topic insert via unique index `(curriculum_id, COALESCE(book_id, sentinel-uuid), LOWER(TRIM(topic_name)))`; migration backfills normalized names first (fails loud on dups). *Designed (A5).* Source: interaction-durability.
- **STAB-19** — `ALTER TYPE draft_status ADD VALUE` (`completing`,`failed`) must be committed+deployed to prod before any code referencing them (Postgres requires its own txn). *Designed (A19).* Source: interaction-durability.
- **STAB-20** — Outbox escalates to `POST /support/outbox-spillover` after 3 failed attempts (was 5+clipboard); clipboard is last resort; spillover rate-limited 10/profile/hr. *Designed (A8).* Source: interaction-durability.
- **STAB-21** — Orphan-persist failures emit `app/orphan.persist.failed` (after rethrow) so failure rate is queryable (Sentry alone insufficient). *Designed (A21).* Source: interaction-durability.
- **STAB-22** — Draft `completing→completed` polling uses exponential backoff (3→6→12→30s, paused when backgrounded) + a separate-step push on mark-completed; push failure emits an event, doesn't fail the draft. *Designed (A13/A18).* Source: interaction-durability.
- **STAB-23** — Failure classification uses `instanceof` on a typed error hierarchy in `@eduagent/schemas/errors`, never string-matching formatted output (classify raw first). *Designed (A20).* Source: interaction-durability.
- **STAB-24** — Inngest event payloads validated against a versioned Zod schema (`version:1`) on both dispatch and handler. *Designed (A12).* Source: interaction-durability.
- **STAB-25** — `persona_type` column + enum dropped (migration `0012`); `personaFromBirthYear`/`Persona` re-introduction banned (`persona-fossil-guard.test.ts`). *Implemented (Phase 1A).* Source: plan-code-review-fixes. **Note:** the spec's "role derived from `birthYear`+`isOwner`" reflects the 2026-04-05 transitional state; current guidance (memory `project_persona_removal` + CLAUDE.md) derives **role from `family_links`** (not birthYear) and uses `computeAgeBracket(birthYear)` for **age only — never feature gating**.
- **STAB-26** — `persistCurriculum` takes `profileId` and verifies subject ownership before writing. *Implemented (1B.1).* Source: plan-code-review-fixes. Root cause of SUBJECT-09, later moved to idempotent Inngest ([[STAB-09]]).
- **STAB-27** — `addProfileToSubscription` acquires `SELECT … FOR UPDATE` before the family-quota cap check (1B.2 added the check, not the lock). *Implemented (2A.10).* Source: plan-code-review-fixes.
- **STAB-28** — RevenueCat webhook null `accountId` returns 200 (not 4xx/5xx) to stop infinite retries; logs warning. *Implemented (1B.3 CRITICAL).* Source: plan-code-review-fixes.
- **STAB-29** — Session recovery marker scoped to `profileId`; not cleared until the server close API succeeds (crash-during-close keeps the recovery prompt). *Implemented (3F.9/3C.4).* Source: plan-code-review-fixes.
- **STAB-29b** — `useGenerateBookTopics` onSuccess must read subjectId/bookId from mutation context/refs, not the stale outer-render closure. *Implemented (3F.7).* Source: plan-code-review-fixes.
- **STAB-29c** — Dormant Stripe checkout endpoints guarded by a `STRIPE_SECRET_KEY` check (404 if unconfigured) rather than removed; RevenueCat/IAP is the active path. *Implemented (2E.7 / DEF-3).* Source: plan-code-review-fixes. See [[AUTH-...]] billing.
- **STAB-30** — `review-due-scan`/`daily-reminder-scan` crons use `(profileId,scanDate)` / `(retentionCardId,scheduledDate)` idempotency keys (DST double-fire / retry safety); notification daily cap as 2nd defense. *Implemented (2C.1/2C.2).* Source: plan-code-review-fixes.
- **STAB-31** — Mastery requires `retentionCard.xpStatus==='verified'`, not assessment-pass alone; assessment-passed-but-unverified → "Covered" (inProgress). *Implemented (display-only).* Source: expandable-subject-cards. See [[C-8]].
- **STAB-32** — Explored topics require ≥1 session referencing the topic with `exchangeCount>=1` (excludes picked-but-never-discussed). *Implemented.* Source: expandable-subject-cards.
- **STAB-33** — Parent subject list filters subjects with zero activity (`sessions>0 || explored||inProgress||mastered>0`); child's own progress shows all enrolled. *Implemented.* Source: expandable-subject-cards.
- **STAB-34** — `SubjectCard` switches accordion vs navigation mode via props (childProfileId+subjectId → accordion; onPress → navigate); `LayoutAnimation` Android-guarded. *Implemented.* Source: expandable-subject-cards.
- **STAB-35** — Accordion topics lazy-load (`enabled: expanded`); subsequent toggles from cache. *Implemented.* Source: expandable-subject-cards.
- **STAB-36** — Mastery tightening applied to both `buildSubjectMetric` and `buildSubjectInventory` simultaneously (12 surfaces must agree); persisted monthly reports frozen at old counts. *Implemented.* Source: expandable-subject-cards. See [[C-8]].
- **STAB-37** — Topic/Book screen section order: Continue now → Started → Up next → Done → Later → Past conversations (zero-item sections omitted); Done above Later (progress receipt in upper half). *Designed v2.* Source: topic-screen-redesign.
- **STAB-38** — Per-row chips removed; a single dot vocabulary + section headings carry all state; action language only in the sticky CTA. *Designed v2.* Source: topic-screen-redesign. Retention badges must move to a not-yet-designed surface.
- **STAB-39** — "Started" section shows `N sessions` (effort signal), not "N days ago" (guilt). *Designed v2.* Source: topic-screen-redesign.
- **STAB-40** — Client-only 4-rule book-scoped precedence (`apps/mobile/src/lib/up-next-topic.ts:40-128`): momentum (current chapter) > highest partial completion > earliest uncompleted chapter > sortOrder. The server resume-target (`progress.ts:1633-1747`) is a separate, broader cross-subject continuity rule — they are NOT identical and must not be forced to parity. *Designed v2.* Source: topic-screen-redesign. Reverses v1 (completion-first).
- **STAB-41** — Sticky CTA resolves to the newest started topic, not oldest. *Designed v2.* Source: topic-screen-redesign. Reverses v1.
- **STAB-42** — "Later" includes partially-started chapters showing only their unstarted topics (no double-count). *Designed v2.* Source: topic-screen-redesign.
- **STAB-43** — Later auto-expands when ≤3 chapters AND ≤12 total Later topics (both conditions). *Designed v2.* Source: topic-screen-redesign.
- **STAB-44** — Topic screen redesign requires no schema changes; all states derived from existing data. *Designed v2.* Source: topic-screen-redesign.
- **STAB-45** — Sessions-API failure on the topic screen hides session-dependent sections (not an error); Up Next falls back to the frontend rule skipping momentum. *Designed v2.* Source: topic-screen-redesign.

### Auth, Billing, Quota & Tier (AUTH)

- **AUTH-01** — `backup_code` added as a 4th MFA strategy, handled like TOTP via `attemptSecondFactor`. *Implemented.* Source: auth-mfa-fallback. Full webauthn/passkey excluded.
- **AUTH-02** — When no supported MFA exists, branch copy on whether SSO providers are linked (suggest SSO if present; else support path). *Implemented.* Source: auth-mfa-fallback.
- **AUTH-03** — Child enters the parent's email directly on one screen (no physical handoff); email-link consent unchanged; optional "parent is here" path; same-email validation. *Implemented.* Source: async-consent-handoff. QR/push/SMS excluded.
- **AUTH-04** — `ChildPaywall` adds "See your progress" + "Go Home" escapes (never trapped); tab bar not shown (route structure). *Implemented.* Source: child-paywall-recovery.
- **AUTH-05** — Child paywall XP/topic stats rendered unconditionally with an empty fallback message. *Implemented.* Source: child-paywall-recovery.
- **AUTH-06** — Replace generic `formatApiError` with `instanceof QuotaExceededError` → structured `QuotaExceededCard` consuming `details.*`; classify raw before formatting. *Implemented.* Source: quota-exceeded-actions.
- **AUTH-07** — Child profiles get "Ask your parent for more" only; never upgrade/top-up CTAs. *Implemented.* Source: quota-exceeded-actions. Mirrors [[AUTH-04]].
- **AUTH-08** — IAP top-up polling uses `queryClient.fetchQuery({staleTime:0})` (await refetch), replacing invalidate→sleep500→cache-read race. *Implemented.* Source: topup-purchase-confidence.
- **AUTH-09** — Top-up timeout copy is confidence-first ("Purchase confirmed — credits are being added"); never optimistic credit display before webhook confirmation. *Implemented.* Source: topup-purchase-confidence.
- **AUTH-10** — Missing IAP package → spinner if loading, Retry on failure, support path if absent (not a bare alert). *Implemented.* Source: topup-purchase-confidence.
- **AUTH-11** — Quota is the single commercial gate: Family Hub (Recaps/nudges/progress/add-child) open to all tiers incl. Free; differentiation is monthly quota + daily caps + child-slot count. *Draft v3.* Source: tier-access-rework. Invalidates the "lossy onboarding-intent" assumption ([[NAV-26]] rationale).
- **AUTH-12** — `quotaModel: 'per-profile' | 'shared-pool'` on `TierConfig`: Free/Plus per-profile (isolated), Family/Pro shared account pool. *Draft v3.* Source: tier-access-rework. Lifting `maxProfiles:1` is the basis for [[NAV-26]].
- **AUTH-13** — New `profile_quota_usage` table keyed `(subscription_id, profile_id)` for per-profile tiers (avoids dropping `quota_pools.UNIQUE(subscription_id)`); migration before code deploy. *Draft v3.* Source: tier-access-rework.
- **AUTH-14** — Server helper returns `{effectiveAccessTier, billingAccess}`: lapsed paid tiers degrade to effective Free (never below Free); cancelled-within-window keeps paid; client never infers from local clock. *Draft v3.* Source: tier-access-rework.
- **AUTH-15** — `familyPlanOwner` predicate replaced by `isFamilyHubEligible` (adult owner + linked child + subscription loaded; raw billing tier intentionally absent). *Draft v3.* Source: tier-access-rework. Family-pool viz stays tier-gated.
- **AUTH-16** — `top_up_credits` gains `profile_id`; per-profile tiers filter by profileId; Family/Pro stay household-wide. *Draft v3.* Source: tier-access-rework. Pre-launch: zero existing rows, no backfill.
- **AUTH-17** — Drop dead `premiumModelProfiles` field; no `resolveProfileLlmTier` helper — Plus advanced-rung routing already lives in `resolveExchangeLlmRouting`. *Draft v3.* Source: tier-access-rework.
- **AUTH-18** — Child quota-exhaustion copy is tier-agnostic (`quota.child.exhausted`); caps identical Free/Plus (100/mo, 10/day). *Draft v3.* Source: tier-access-rework.
- **AUTH-19** — 402 payload includes exact `resetsAt`; UI renders timezone-localized "try again after {{resetAt}}", never hard-coded "midnight"/"the 1st". *Draft v3.* Source: tier-access-rework.
- **AUTH-20** — Child-cap parent notification is in-app only (banner/badge), no push for v1; 0–N hour awareness gap accepted. *Draft v3.* Source: tier-access-rework.
- **AUTH-21** — No time-limited Family Hub trial; out-of-quota Free family sits at 100/mo with no lockout/cliff; quota reset is the recurring upgrade lever. *Draft v3.* Source: tier-access-rework.
- **AUTH-22** — Overdue review counts surfaced via badge pills (Home card + Library header) from already-fetched retention data; backend coaching-card system stays backend-only. *Implemented.* Source: retention-review-surfacing.
- **AUTH-23** — Shared `GET /progress/review-summary` → `{totalOverdue}` (via `getProfileOverdueCount()`), consumed by Home card + Library badge. *Implemented.* Source: retention-review-surfacing / home-smart-cards. (relearn adds `GET /progress/overdue-topics` for full grouped data, [[VOICE-22]].)
- **AUTH-24** — "Monthly reports" button always visible (drop `child?.progress` guard); empty-state list handles "nothing yet"; no count suffix when zero. *Implemented.* Source: parent-report-empty-state.
- **AUTH-25** — Email channel for weekly/monthly parent digests via Resend; two new `notification_preferences` booleans (default true, mirror push); idempotency `weekly-${parentId}-${reportWeek}`; consent-restricted children redacted from BOTH push and email (ships push-gap fix); skip digest entirely if all children restricted; per-child struggle watch-line (≤2 topics) from `learning_profiles.struggles` (omit if empty); no email if no `accounts.email` (Sentry, no silent recovery). *Spec — not yet implemented.* Source: email-digest-channel. trial_expiry email out of scope. Settings opt-out UI deferred.
- **AUTH-26 (deferred)** — Account-security section is client-only via Clerk SDK (password change + SSO detection live; 2FA deferred). *Deferred (under `deferred/`).* Source: account-security-design-deferred. Email-verification toggle removed (conflated `prepareVerification` with `disableTOTP`).
- **AUTH-27 (deferred)** — All true 2FA (TOTP/SMS/backup-code mgmt) deferred to 1,000+ users; Clerk supports email verification instance-wide only, not per-user. *Deferred.* Source: account-security-design-deferred.
- **AUTH-28 (skipped)** — Consent-pending children see static/local previews only (no API, no real data) — 15s poll detects approval; push-on-approve deferred (needs token pre-consent). *Skipped (under `deferred/`).* Source: consent-pending-enrichment-design-skipped.
- **AUTH-29 (skipped)** — Session-expiry: persist current route before sign-out on 401, restore after re-auth (exclude session/onboarding routes); extend `SESSION_EXPIRED_WINDOW_MS` 60s→5min. *Skipped (under `deferred/`).* Source: session-expiry-recovery-design-skipped.

### Voice, OTA, E2E, Vision & Misc UI (VOICE / MISC)

- **VOICE-01** — `input_mode` on `learning_sessions` is a plain text column (default `'text'`), not a pgEnum; valid values enforced by Zod `inputModeSchema`. *Implemented.* Source: epic-8-voice-gap-closure.
- **VOICE-02** — Voice mode decoupled from verification type: `ChatShell` inits from `initialVoiceEnabled` prop; `verificationType` kept for badge only; toggle hidden after >1 exchange. *Implemented.* Source: epic-8-voice-gap-closure.
- **VOICE-03** — TTS pause/resume via native `expo-speech` (`Speech.pause/resume`); streaming TTS out of scope. *Implemented.* Source: epic-8-voice-gap-closure.
- **VOICE-04** — Voice haptics dispatched via a centralized `haptics.ts`, `void`-prefixed (never block/throw, no-op on unsupported). *Implemented.* Source: epic-8-voice-gap-closure.
- **VOICE-05** — VoiceOver/TalkBack audio-channel coexistence deferred (needs physical-device spike); VAD + voice selection also out of scope. *Deferred.* Source: epic-8-voice-gap-closure.
- **OTA-06** — (Spec) `runtimeVersion` uses Expo `fingerprint` policy. *Implemented in spec; later replaced by `appVersion` policy in practice* (pnpm-monorepo fingerprint bug — `project_fingerprint_pnpm_mismatch.md`). Source: eas-update-ota.
- **OTA-07** — OTA `checkAutomatically: ON_LOAD` + `fallbackToCacheTimeout: 5000` (check on cold launch, ≤5s block then cached). *Implemented.* Source: eas-update-ota.
- **OTA-08** — `ota-update` job lives in `ci.yml` (depends on `main`), not a cross-workflow trigger. *Implemented.* Source: eas-update-ota.
- **OTA-09** — Native EAS build gated by path-based `native-changed` detection (`app.json`/`package.json`/`eas.json`/`plugins`/`android`/`ios`); JS-only (~95%) goes OTA. *Implemented.* Source: eas-update-ota.
- **E2E-10** — Slow-network sim via AVD emulator-console `network delay` (`NETWORK_DELAY_MS` in `seed-and-run.sh`), not `tc qdisc`/proxy (Windows-host friendly). *Draft.* Source: e2e-slow-network-sim. Per-packet RTT × N round-trips.
- **E2E-11** — Slow-network harness exposes exactly 3 env vars: `NETWORK_DELAY_MS`, `NETWORK_SPEED`, `NETWORK_KILL_AFTER_MS`; `NETWORK_SPEED` release-APK only (dev-client bundle wouldn't load). *Draft.* Source: e2e-slow-network-sim.
- **E2E-12** — `e2e-preflight.sh` adds `check_emulator_console` (warn-only on missing token so full-speed flows still run); batch-start safety net resets `network delay none`. *Draft.* Source: e2e-slow-network-sim.
- **E2E-13** — `pendingAuthRedirect` stored in-process RAM only on native (not SecureStore); cold start loses it, Expo Router re-fires the deep-link intent to recover; web uses `sessionStorage`. *Implemented.* Source: e2e-deep-link-redirect.
- **E2E-14** — TTL-expiry E2E uses a dev-only Expo Router screen (`dev-only/seed-pending-redirect.tsx`, gated `NODE_ENV!=='production'`) that back-dates the RAM record; a server endpoint can't reach device RAM and was rejected; env-var TTL override rejected (diverges test/prod binary). *Draft.* Source: e2e-deep-link-redirect.
- **E2E-15** — SSO-fallback E2E uses ADB airplane mode (set before Maestro launches; YAML can't toggle mid-flow); exercises real 10s `SSO_TIMEOUT_MS`. *Draft.* Source: e2e-android-sso-fallback.
- **E2E-16** — `EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY` must be baked at APK build time (EXPO_PUBLIC_* are bundled); preflight is a YAML-level visibility assertion, not a host-shell env check. *Draft.* Source: e2e-android-sso-fallback.
- **MISC-17** — Homework image sent to the LLM as inline base64 JSON field (1600px/0.9 JPEG ~270-540KB, within Workers' 100MB limit), not multipart; V1: only first message carries an image; image not persisted. *Implemented.* Source: homework-image-vision.
- **MISC-18** — LLM router NOT made vision-aware (all configured providers support vision); future non-vision provider → per-provider mapping, not router check; text part always present as fallback. *Implemented.* Source: homework-image-vision.
- **MISC-19** — No homework image persistence in V1 (no R2/`image_url`/gallery); `<Image>` must handle Android cache-reclaim with an `onError` placeholder. *Implemented (explicit exclusion).* Source: homework-image-vision.
- **MISC-20** — Gallery-picked images dispatch `PHOTO_TAKEN` into the identical OCR pipeline (no backend change); PDF deferred; `expo-image-picker` needs a new EAS build. *Implemented.* Source: homework-gallery-import.
- **MISC-21** — Home intent-card ordering computed client-side from two signals (recovery marker SecureStore + `totalOverdue`), no server ranking; recovery marker 30-min expiry. *Implemented.* Source: home-smart-cards. Endpoint = [[AUTH-23]].
- **VOICE-22** — Relearn retention-card reset moved from session-start (`startRelearn`) to `session-completed` Inngest, conditional `exchangeCount>0` (premature reset hid overdue topics); `needsDeepening` insert idempotent; 0-exchange sessions auto-closed. *Draft.* Source: relearn-flow-redesign.
- **VOICE-23** — Relearn topic selection adapts to overdue count (single-subject flat / ≤10 grouped flat / >10 subject-picker-then-list); new `GET /progress/overdue-topics` for full data; `/review-summary` kept for badges. *Draft.* Source: relearn-flow-redesign.
- **VOICE-24** — Relearn session opens with an AI recap from the topic's most recent `learnerRecap` (+ quiz offer); generic fallback if none; `recap:string|null` added to `POST /retention/relearn`. *Draft.* Source: relearn-flow-redesign.
- **MISC-25** — Chat-only app help injected into `buildSystemPrompt` via static server-owned `app-help-map.ts` (visible UI labels only); no new schema field/tab; plain-text reply reuses chat rendering. *Implemented (map refreshed 2026-05-15).* Source: chat-only-app-help. App-help counts against quota / appears in transcripts (Phase 1 accepted).
- **MISC-26** — Scope-boundary prompt block gets an explicit app-help carve-out (and overrides homework scope for nav questions). *Implemented.* Source: chat-only-app-help.
- **MISC-27** — Server-side hard cap forces learning signals (`partial_progress`/`needs_deepening`/`understanding_check`/`note_prompt.show`) to false on app-help exchanges, regardless of LLM output. *Implemented.* Source: chat-only-app-help. Applies the per-signal cap rule [[LLM-06]].
- **MISC-28** — `app-help-map.ts` label accuracy enforced by unit tests importing actual i18n keys (live contract between map and UI); locale-aware map deferred. *Implemented.* Source: chat-only-app-help.
- **MISC-29** — Proactivity copy sweep acknowledges greeting strings are fake assistant bubbles (`isSystemPrompt:true`); treated as a tactical patch; architectural fix (move greetings out of the message stream) is a separate spec. *Draft.* Source: proactivity-copy-sweep.
- **MISC-30** — Copy may reference session state only when the surface owns that state; surfaces that can't honor continuity (e.g. Ask greeting referencing prior Learn context) must not offer continuity lanes. *Draft.* Source: proactivity-copy-sweep.
- **MISC-31** — Subject-classifier acknowledgment keeps tentative phrasing ("sounds like"), not confident ("this is about"); confidence-conditional phrasing deferred. *Draft.* Source: proactivity-copy-sweep.
- **MISC-32** — Progressive disclosure gated by a single `PROGRESSIVE_DISCLOSURE_THRESHOLD=4` (sessions where `status!=='active'`) → two tiers; no session-duration quality bar. *Draft.* Source: progressive-disclosure.
- **MISC-33** — Progressive-disclosure gating is client-side from cached `totalSessions` (only `totalSessions` added to the dashboard response); both learner + parent paths share the `status!=='active'` count rule via a sync comment. *Draft.* Source: progressive-disclosure.
- **MISC-34** — Animated movement on Fabric must use `Animated.View` + `useAnimatedStyle` (translate/rotate), never `AnimatedG` x/y animatedProps (don't propagate on Fabric); `AnimatedPath` strokeDashoffset confirmed working. *Draft.* Source: animation-improvements.
- **MISC-35** — `AnimatedCircle` with radius starting at 0 needs a 500ms fallback timer setting final values (Fabric init delay). *Draft.* Source: animation-improvements.
- **MISC-36** — Distinct animation components for states: `LightBulbAnimation` while `isStreaming`, `MagicPenAnimation` after idle timer (`IDLE_TIMEOUT_MS=20000`, flagged unvalidated); `PenWritingAnimation` deleted. *Draft.* Source: animation-improvements.
- **MISC-37** — 3D page-flip (`rotateY`+perspective) requires a Fabric spike on `transformOrigin`; fallback = translate-rotate-translate decomposition. *Draft.* Source: animation-improvements.

---

## §3 — Coverage & Next Steps

- **Files covered:** all 82 specs under `docs/_archive/specs/` (incl. 3 `deferred/`, 2 root, and `email-digest-channel.md` which the first batch pass missed — folded in as [[AUTH-25]]).
- **Decisions recorded:** ~190 across 14 domains; cross-batch duplicates merged; 11 conflicts/supersession chains resolved against code in §1.
- **Code-verified ground-truth deltas worth a follow-up cleanup of stale doc prose:** auto-file threshold is 3 not 5 ([[C-1]]); session effective modes are `freeform|learning` only — `practice`/`review` both gone ([[C-5]]); `topic_notes` is multi-note ([[C-3]]); V0 helpers now in `legacy-navigation-contract.ts` not `_layout.tsx` (CLAUDE.md drift, [[C-6]]).
- **Not yet folded in:** live `docs/specs/**` (e.g. the navigation-contract target spec), `docs/compliance/audience-matrix.md`, and `docs/architecture.md`. Several "Draft" entries here have since shipped — a code-status reconciliation pass (mark each Draft → Implemented/Dropped against the current tree) should follow before this register is treated as authoritative.

---

## §4 — Plans-Derived Decisions (Net-New & Amendments)

Second pass over `docs/_archive/plans/` (123 files, ~98K lines). The index confirmed ~70 plans are implementation plans for specs already in §2 and ~18 are pure test-infra/ops/refactor-decomposition with no durable product ADR. This section records only **net-new architecture with no spec counterpart** plus **plan-time amendments** that revise a §2 decision. Compact format: **ID** — decision. *Status.* `source` — notes.

> **Biggest gap closed:** the entire **Challenge Round** subsystem (CR-*) had no spec in §2 yet is a shipped, flag-gated production feature (`CHALLENGE_ROUND_RUNTIME_ENABLED`, PRs #476-479) and a major CLAUDE.md subsystem.

### Challenge Round (CR) — no prior spec; all NEW

- **CR-01** — Persistent `learningMode: serious|casual` toggle fully deleted (enum value, `consecutiveSummarySkips`, routes, UI); all learners default to former `casual` tone; rigor now expressed per-Challenge-Round. *Implemented (Phase 0, PR #325).* `challenge-round-into-note` — `learning_modes` table kept (still holds `medianResponseSeconds`/`celebrationLevel`); name now misleading (follow-up). Rename to `learner_session_settings` tracked in Phase 6d; ratchet frozen; burn-down not scheduled — see plan 2026-06-03-adr-register-cleanup.
- **CR-02** — XP writer collapsed to a single immediate `'verified'` path; the `'serious'`-gated `'pending'` branch removed. *Implemented (PR #325).* `challenge-round-into-note` — `'pending'`/`'decayed'` READ paths preserved for decayed-XP re-verification.
- **CR-03** — Server-owned state machine `undefined→offered→accepted→active→drafting→closed`, persisted in `sessionMetadata.challengeRound` via `transitionChallengeState()`; illegal transitions return typed errors. *Implemented (PRs #476-479).* `challenge-round-runtime-wiring`.
- **CR-04** — Challenge-verified mastery stored as `assessments.mastery_challenge_verified_at timestamptz` (not retentionCards, not a new table, not session metadata); monotonic; fresh assessment row inserted per verdict. *Implemented.* `challenge-round-targets` — `progress.ts` reads latest across rows.
- **CR-05** — Weak concepts persisted to existing `needs_deepening_topics` (extended with `source`,`concept`,`misconception`,`correction`), not a new `review_targets` table. *Implemented.* `challenge-round-targets` — written as `pending_review`; `promotePendingDeepening()` + Inngest expiry cron; weak-spot write failure must fail the round-close (no Sentry-only recovery, CRIT-8).
- **CR-06** — `source` discriminator (`'system_signal'|'challenge_round'`) on `needs_deepening_topics`; concept/misconception/correction nullable, enforced at service layer not DB check. *Implemented.* `challenge-round-targets`.
- **CR-07** — Server (not LLM) owns mastery: `decideMasteryAndReview()` sets verification only when EVERY concept is `solid`; any partial/missing/misconception blocks mastery and routes weak concepts to deepening. *Implemented (`progress.ts:420,1316`).* `challenge-round-*` — empty eval array → `invalid`, never marks mastery (CRIT-9).
- **CR-08** — `signals.challenge_round_evaluation` items must carry `answerEventId` + `learnerQuote`, validated by `validateEvaluationEventIds()` before storage. *Implemented.* `challenge-round-into-note` — round doesn't advance if event IDs unvalidated.
- **CR-09** — Note-draft lexical-overlap hallucination guard (`validateNoteDraft`, `MIN_LEXICAL_OVERLAP_NOTE_DRAFT=0.4`) against solid-concept quotes; failure → typed fallback, never shown. *Implemented.* `challenge-round-*` — Unicode-aware tokenization required (MED-10); not a substitution guard (caught earlier by excluding non-solid concepts); threshold is a calibrated guess; guard is CR-pipeline-only, not on generic notes API (tracked separately).
- **CR-10** — Routing-only rung-4 floor for accepted/active/drafting turns via separate `llmRoutingRung = max(escalationRung,4)` fed to `resolveExchangeLlmRouting()`; `escalationRung` (pedagogy/analytics) never inflated. *Implemented (`session-exchange.ts:246-251`).* `challenge-round-targets` — offer turns normal; Family stays Gemini-only; OpenAI blocked <rung 5; rung written to `ai_response.metadata`.
- **CR-11** — CR code must never set provider/model directly or pass `preferredProvider`; the rung floor is the only CR-specific lever and flows through the standard resolver. *Implemented.* `challenge-round-targets`.
- **CR-12** — Trigger gate uses absolute `MIN_CHALLENGE_REMAINING_TURNS=3` budget floor, replacing the "5% quota remaining" percentage gate (which disproportionately blocked high-cap tiers). *Implemented.* `challenge-round-*`.
- **CR-13** — All CR runtime behavior gated behind `CHALLENGE_ROUND_RUNTIME_ENABLED` (default false, `config.ts:133`); mobile renders CR only from typed server SSE fields so disabled API flag auto-hides offers. *Implemented.* `challenge-round-runtime-wiring`.
- **CR-14** — SSE `done` payload exposes typed `challengeRound`/`challengeOffer`/`draftedNote` fields; mobile never parses raw envelope JSON (server applies all gating before the `done` frame). *Implemented (`sse.ts:94-98`).* `challenge-round-runtime-wiring`.
- **CR-15** — Note never auto-saved; learner must explicitly Save/Edit&save/Skip; Skip doesn't roll back already-persisted mastery/review-target rows. *Implemented.* `challenge-round-*`.
- **CR-16** — `topic_notes` gains `source: 'user'|'challenge_round'` provenance column; existing notes backfill `'user'`. *Implemented.* `challenge-round-into-note`.
- **CR-17** — Hard caps: max 3 questions/round, 1 round/session, per-topic 24h decline cooldown (`challenge_round_cooldowns` table); expanded cooldown matrix (4h/24h/1h) deferred. *Implemented (24h decline).* `challenge-round-*` — server enforces 3-question cap via `caps.ts`, LLM never trusted to terminate.
- **CR-18** — CR v1 deferred from homework/review/quiz/practice/recall/dictation/freeform; offered only in ordinary learning sessions incl. language four-strands; no-offer behavior test-covered. *Implemented/Designed.* `challenge-round-into-note`.
- **CR-19** — `resolveMasteryVerificationState()` read-side gate must wrap raw `mastery_challenge_verified_at` at every surfacing site before the flag flips (Phase 5 enablement gate). *Implemented (`verification.ts:56`).* `challenge-round-runtime-wiring`.
- **CR-20** — `persistSessionMetadata(db, profileId, sessionId, partial)` promoted to exported `session-crud.ts` helper with read-modify-write semantics + IDOR break test (the whole CR state machine writes through it). *Implemented (CRIT-3).* `challenge-round-targets`.
- **CR-21** — `struggleStatusSchema` extracted to `packages/schemas/src/struggle-status.ts` and barrel-exported (was inline in `progress.ts`). *Implemented (CRIT-4).* `challenge-round-targets`.
- **CR-22** — `challengeRoundVerdict {solid/partial/missing/misconception counts}` persisted in `ai_response.metadata` per closed round (audit/analytics). *Implemented.* `challenge-round-runtime-wiring`.
- **CR-23** — CR mobile delivery reuses the established `fluency_drill` ui_hint pattern (server emits `ui_hints.challenge_round`/`note_draft` → mobile detects/renders); all CR ui_hint fields stripped from reply text via `strip-envelope.ts`. *Implemented.* `challenge-round-into-note`.
- **CR-24** — Public `/maybe-offer` route + "Too easy" chip-initiated entry deferred from the first wiring PR; offers created only inside the session-exchange pipeline after a gated LLM signal; duplicate-offer race resolved by state pre-check returning `{alreadyOffered:true}`. *Designed/Deferred.* `challenge-round-*` — chip must be hidden while state ∈ {offered,accepted,active,drafting}.
- **CR-25** — Mid-round interruption with ≥1 solid concept auto-completes and offers the draft on next open via `note_prompt.post_session`; zero solid → no artifact. *Designed.* `challenge-round-into-note` — requires read-modify-write metadata.

### Assessment wiring (ASSESS) — NEW

- **ASSESS-01** — `practice.tsx` → `practice/index.tsx` + `_layout` with `initialRouteName:'index'`; assessment relocated under `practice/assessment/` so all assessment nav stays in-stack (rather than ancestor-chain push). *Designed.* `assessment-wiring`.
- **ASSESS-02** — `GET /retention/assessment-eligible` in `retention.ts` (not assessments.ts): sessions `exchangeCount>=3`, completed ≤30d, deduped by topicId; shared query key with the IntentCard subtitle. *Designed.* `assessment-wiring`.
- **ASSESS-03** — Two new terminal statuses `borderline` (0.60-0.69) and `failed_exhausted` (cap reached); SM-2 fires unconditionally at each terminal transition. *Designed (additive migration).* `assessment-wiring`.
- **ASSESS-04** — SM-2 driven from `masteryScore` (`Math.round(masteryScore*5)`), not `qualityRating` (which reflected only the last answer and wiped cards on `0`). *Implemented.* `assessment-wiring` — qualityRating kept for analytics.
- **ASSESS-05** — The invariant `passed === rawScore >= 0.7` is enforced by the schema refine (`llm-envelope.ts:122-133`), threshold from `LLM_ASSESSMENT_PASS_THRESHOLD` (`:105`); the parser trusts the post-parse boolean (`assessments.ts:613-616`), it does not recompute. `masteryScore` is the depth-capped score (recall 0.5 / explain 0.8 / transfer 1.0 via `calculateMasteryScore`), computed separately. Cross-link [[LLM-P2]]. *Implemented.* `assessment-wiring`.
- **ASSESS-06** — `weakAreas: string[].max(8)` added to the assessment eval schema + prompt to scope the borderline refresher CTA. *Designed.* `assessment-wiring` — perpetuates bespoke assessment JSON; envelope migration deferred.
- **ASSESS-07** — `MAX_ASSESSMENT_EXCHANGES=4`; no verdict by turn 4 → `failed_exhausted` + SM-2 fires (mirrors interview cap). *Implemented.* `assessment-wiring`.
- **ASSESS-08** — `gaps: string[].max(8)` added to `sessionMetadataSchema` (required because schema `.strip()`s unknown keys) for gap-fill sessions. *Designed.* `assessment-wiring` — downstream gap-targeting prompt is a follow-up.
- **ASSESS-09** — `PATCH /assessments/:id/decline-refresh` is analytics-only — never mutates retention (SM-2 already updated at the borderline transition); both new endpoints `assertNotProxyMode`. *Designed.* `assessment-wiring`.
- **ASSESS-10** — Continuation opener is two-turn: turn 0 probe (no score), turn 1 requests `signals.retrieval_score` (0-1); hard cap at exchange 3 defaults `continuationDepth='mid'`. *Designed.* `assessment-wiring` — fixes the CRITICAL "score requested before any answer exists".
- **ASSESS-11** — Three-branch `continuationDepth`: `>=0.8` high (skip recap) / `0.5-0.79` mid (refresh weak spots) / `<0.5` low (re-teach); stored in session metadata; human-override "Skip the warm-up" pill. *Designed.* `assessment-wiring`.
- **ASSESS-12** — `isContinuation` requires three-way guard: non-null topicId AND `resumeFromSessionId` to a same-topic prior session AND completed ≤30d. *Designed.* `assessment-wiring`.

### Unified learning resume (RESUME) — NEW

- **RESUME-01** — Single `getLearningResumeTarget(db, profileId, scope?)` (`GET /v1/progress/resume-target`) is the canonical source for all continue/resume decisions, replacing divergent per-screen heuristics. *Implemented.* `unified-learning-resume` — old `/progress/continue` kept as temporary wrapper.
- **RESUME-02** — Five-level resume priority: active/paused (exchange≥1) > completed/auto-closed (≥1) > `summaries.nextTopicId` in scope > next incomplete curriculum topic > subject freeform; ghost sessions (0 exchanges) never influence. *Implemented.* `unified-learning-resume`.
- **RESUME-03** — Completed-session handoff via `metadata.resumeFromSessionId` → `buildResumeContext` hydrates a compact handoff (summary + last exchanges + optional nextTopicId), not a full transcript replay. *Implemented.* `unified-learning-resume`.
- **RESUME-04** — `resumeKind` discriminant (`active_session|paused_session|recent_topic|next_topic|subject_freeform`) on the response so mobile knows whether to pass `sessionId` (exact) or `resumeFromSessionId` (new w/ context). *Implemented.* `unified-learning-resume`.

### Practice hub & activity summary (PRACTICE) — NEW

- **PRACTICE-01** — Practice screen restructured into 4 sections (Best next step / Challenge row / Quiz w/ nested modes / Other practice) + Recent-progress metadata row; full visual redesign required, not just IA. *Designed.* `practice-hub-rewarding-redesign`.
- **PRACTICE-02** — All quiz entries route to `/(app)/quiz` index (no `?activityType=` direct launch — avoids render flash, back-stack issues, hidden vocab cards). *Designed.* `practice-hub-rewarding-redesign`.
- **PRACTICE-03** — Practice cards show cues only when backed by real data; hardcoded "+N XP"/"N min" forbidden. *Designed.* `practice-hub-rewarding-redesign`.
- **PRACTICE-04** — "Prove I know this" with zero eligible topics stays tappable → routes to Library with advisory copy; no lock/unlock language. *Designed.* `practice-hub-rewarding-redesign`.
- **PRACTICE-05** — Append-only `practice_activity_events` ledger (`dedupeKey` unique per profile) becomes the canonical source for all practice/testing summaries (operational tables unsuitable for time-windowed aggregation). *Implemented.* `practice-activity-summary-service`. (code: `packages/database/src/schema/practice-activity.ts:27`)
- **PRACTICE-06** — Append-only `celebration_events` ledger replaces the cleared-after-view `coaching_card_cache.pendingCelebrations` queue for durable history; dedup key mirrors `queueCelebration()`. *Implemented.* `practice-activity-summary-service`. (code: `packages/database/src/schema/practice-activity.ts:86`)
- **PRACTICE-07** — Practice-activity ledger inserts are intentionally NON-atomic best-effort (`safeWrite` post-commit, deduped by `(profileId,dedupeKey)` `onConflictDoNothing`) so a reporting-ledger failure never aborts the user action; `dictation/result.ts:82`, `retention-data.ts:956-983`, `session-exchange.ts:2681-2697`, `quiz/complete-round.ts:843`, `vocabulary.ts:360`. Only `celebration_events` is transactionally atomic (`celebrations.ts:116-145`, path already owns a SELECT-FOR-UPDATE tx). KNOWN GAP: `safeWrite` failure is Sentry-only — see Phase 4 / cross-ref the silent-recovery-ban. *Implemented (was inverted in the register).* `practice-activity-summary-service`.
- **PRACTICE-08** — `reportPracticeSummarySchema` expanded (totals, by-type, by-subject, points, celebrations; all new fields optional) — previously `practiceSummary` was always undefined in production. *Implemented.* `practice-activity-summary-service`. (code: `apps/api/src/services/practice-activity-summary.ts:100-124`)
- **PRACTICE-09** — Documented dual-source gap: `dashboard.ts` keeps reading `session_events` for fluency drills while reports read the ledger; surfaced (not silently left) as backlog. *Implemented.* `practice-activity-summary-service`. (code: `apps/api/src/services/practice-activity-summary.ts:100-124`)
- **PRACTICE-10** — Review counts are exact only for ledger events; mutable `lastReviewedAt`/cumulative `repetitions` cannot yield per-period counts; no backfill from mutable SRS fields. *Implemented.* `practice-activity-summary-service`. (code: `packages/database/src/schema/practice-activity.ts:27-122`)

### Notes/Bookmarks & Progress (extends learner-experience) — NEW specifics only

- **NOTES-P1** — `Add note` added as a prominent composer-adjacent action in `SessionAccessories` (visible only at `stage==='teaching'`, disabled while streaming); kept separate from `I'm Done`. *Implemented (PR1).* `chat-notes-bookmarks`.
- **NOTES-P2** — Chat notes reuse topic-notes storage with optional `sessionId` link (no new eventId/highlight anchoring, no unified saved-item table). *Implemented.* `chat-notes-bookmarks` — extends [[LIB-16]].
- **NOTES-P3** — `GET /bookmarks` gains an optional `topicId` server-side filter; client-side filtering rejected (paginated `useInfiniteQuery` would hide later pages). *Implemented.* `chat-notes-bookmarks`.
- **PROG-P1** — Learner-side `weeklyDelta*` fields (topicsMastered/vocabularyTotal/topicsExplored, nullable) added to `progressMetricsSchema` (previously parent-only). *Designed.* `slice3-pr3c-learner-weekly-deltas`.
- **PROG-P2** — `computeWeeklyDeltas(prev,curr)` extracted as a shared pure helper used by both parent-dashboard and learner-progress paths. *Designed.* `slice3-pr3c-learner-weekly-deltas`.
- **PROG-P3** — Weekly delta chip hidden when null (week 1), "+0" shown for flat weeks, negative clamped to 0 for display (underlying field may be negative for parent accuracy). *Designed.* `slice3-pr3c-learner-weekly-deltas`.

### Feedback (FB) — NEW

- **FB-01** — Shake-to-report (`expo-sensors` accelerometer, off on web) via root `FeedbackProvider`; `POST /feedback` emails via Resend. *Implemented.* `feedback-and-early-adopter` — DB/Notion/screenshot/queue/rate-limit deferred.
- **FB-02** — `POST /feedback` returns `{success:true}` even when email fails (users not punished for infra). *Implemented.* `feedback-and-early-adopter` — note: only `console.error`, no Sentry/metric — a mild tension with the silent-recovery-ban (feedback is lower-criticality).
- **FB-03** — Early-adopter home card shows for `<5` completed sessions (from cache, no extra API), per-profile dismissable SecureStore key. *Implemented.* `feedback-and-early-adopter`.

### RLS & data layer (RLS) — AMENDS/extends parent-visibility-privacy

- **RLS-01** — DB driver switched from `neon-http` to `neon-serverless` (WebSocket) as the single client, eliminating the silent transaction fallback that made `db.transaction()` non-atomic and RLS `SET LOCAL` a no-op. *Implemented (PR #126, `c80bb903`).* `S06-rls-phase-0-1` — AMENDS RLS; WS sessions persist within a Worker, so a future plain `SET` (vs `SET LOCAL`) could leak across requests.
- **RLS-02** — Silent transaction fallback shim deleted; replaced with structured `db.transaction.fallback.unsupported` Inngest metric + a lint guard banning `console.warn` re-introduction. *Implemented (PR #126).* `S06-rls-phase-0-1`.
- **RLS-03** — RLS enabled on 48 tables via committed raw SQL migrations; Drizzle `isRLSEnabled` snapshot drift on 47 tables accepted as cosmetic (BUG-1044) since DB security is enforced by applied SQL. *Partial.* `S06-rls-phase-0-1` — never `drizzle-kit push` against staging/prod (would overwrite).
- **RLS-04** — `withProfileScope(db, profileId, fn)` (`packages/database/src/rls.ts`) is the canonical RLS context-setter (`SET LOCAL app.current_profile_id`); integration tests verify propagation/rollback/concurrent isolation and that `SET LOCAL` is never replaced with `SET`. *Implemented (functional since PR #126).* `S06-rls-phase-0-1`.
- **RLS-05** — Switching connection role `neondb_owner`→`app_user` (which enforces RLS) is gated on migrating + break-testing all 6 live-race interactive-transaction sites (consent/filing/home-surface-cache/profile/parking-lot/settings). *Blocking (NOT done).* `S06-rls-phase-0-1` — `filing.ts:371` highest priority (`SELECT FOR UPDATE` currently a no-op).

### Security & billing & auth & mobile WIs — NEW (except where noted)

- **SEC-P1** — All sign-out routed through `signOutWithCleanup` (wipes per-profile + global SecureStore incl. `mentomate_active_profile_id`, resets API identity/proxy, clears query cache); ratchet test bans new direct `signOut()` callsites. *Implemented.* `cross-account-leak-fix` (also in project memory).
- **SEC-P2** — `profile-scope.ts` emits structured `profile_scope.ownership_mismatch` warn on cross-account `X-Profile-Id` 403s (queryable; `warn` not `error` to avoid paging on a closed-class leak). *Implemented (`237bcbf6c`).* `cross-account-leak-fix`.
- **AUTH-P1** — RevenueCat production SANDBOX webhooks rejected immediately after parse, before any account lookup/idempotency/KV/billing mutation (parse → env-check → everything else). *Implemented.* `wi-170-revenuecat-sandbox-guard`.
- **AUTH-P2** — `SignInScreen` remount initializes redirect from `peekPendingAuthRedirect()` before defaulting to home, so a remount cycle doesn't discard the deep-link target; explicit `redirectTo` still wins. *Implemented.* `wi-293-auth-redirect-remount`.
- **MOB-P1** — `create-profile.tsx` duplicate-submission guard: synchronous in-flight ref + AbortController signal through the Hono call + 30s timeout-abort + abort on unmount. *Implemented.* `wi-366-mobile-duplicate-submission` — backend idempotency keys explicitly out of scope.
- **LLM-P1** — `SafetyFilterError` classified non-transient at the router: no retry, no fallback provider, no circuit-breaker increment (safety blocks are deliberate policy, not failures). *Implemented.* `wi-224-safety-filter-routing` — AMENDS LLM router; streaming suppression applies only pre-first-byte.
- **LLM-P2** — Strict Zod parsing for LLM eval outputs (`llmSummaryEvaluationSchema`/`llmAssessmentEvaluationSchema`): reject string-coerced bools/numbers, missing state, contradictory pass/score, blank feedback; parse failure → conservative closed state; `LLM_ASSESSMENT_PASS_THRESHOLD=0.7` exported from schemas as single source. *Implemented.* `wi-372-strict-llm-evaluation-parsing` — AMENDS [[LLM-05]]; adds cross-field invariants (passed must match score≥0.7; isAccepted incompatible with hasUnderstandingGaps).

### Voice, OCR, i18n, onboarding plan-decisions

- **VOICE-P1 (Epic 17)** — Dual-recording voice: on-device `expo-speech-recognition` for real-time interim + `expo-av` capture for server Deepgram re-transcription (no WebSocket audio streaming). *Designed (Not Started).* `epic-17-phase-a-voice-input` — NEW beyond epic-8; Phase B/C depend on it.
- **VOICE-P2** — Server STT writes a `voice_usage` row (awaited, not fire-and-forget) for per-tier monthly minute caps; free tier hard-blocked at route (on-device only); plus=60min, family/pro=unlimited. *Designed.* `epic-17-phase-a-voice-input`.
- **VOICE-P3** — Per-profile voice prefs (`inputMode`,`vadEnabled`,`silenceThresholdMs`,`speechSpeed`) in AsyncStorage `voice.preferences.<profileId>`; one-time age-11-13 voice suggestion card. *Designed.* `epic-17-phase-a-voice-input`.
- **ONB-P1** — `PermissionSetupGate` one-shot pre-tab prompt requests mic + notifications together, records `permissionSetupSeen_<profileId>`; `usePushTokenRegistration` no longer prompts itself; ChatShell adds an AppState listener to refresh mic permission on return from Settings. *Designed.* `permission-onboarding`.
- **OCR-P1** — `isLikelyHomework(text, blockConfidence?)` shape-heuristic + ML-Kit gate in `problem-cards.ts` short-circuits non-homework OCR before server fallback; dropped fragments surface as a dismissible "add them back" chip (no silent drop). *Designed (v3).* `homework-ocr-quality-guards` — AMENDS [[MISC-17]]; `blockConfidence` is dead code (ML Kit exposes no confidence field).
- **OCR-P2** — LLM-first OCR trust inversion: ML Kit is a fast-path only when `isCleanPrintedLocalRead(text)` (clean print, avg letter-run ≥3.5, strong cue); everything else escalates to server `/v1/ocr`, whose reads are accepted end-to-end (≥1 meaningful token, no homework-shape reject); `NOT_HOMEWORK` error code + i18n key removed. *Implemented (revised 2026-05-31).* `homework-ocr-llm-first-reading` — AMENDS [[MISC-17]]/[[OCR-P1]]; intentionally flips an existing test; `CLEAN_PRINT_MIN_AVG_RUN=3.5` fragile.
- **I18N-P1** — Mentor-language axis collapsed: the user-controlled "Mentor Language" setting deleted; `profiles.conversation_language` derived from and kept in sync with `i18next.language` via `useMentorLanguageSync`; onboarding picker + Settings row removed. *Implemented.* `mentor-language-from-ui` — DB CHECK widened to add `ja`/`nb`; existing `cs`/`fr`/`it` rows retained but not surfaced as UI choices. (This is the decision behind [[I18N-13]].)
- **I18N-P2** — `source-baseline.json` sidecar (hashes of English source per key) lets `translate-gemini.ts` retranslate keys whose *source string changed*, not just added/removed keys; baseline written only after validation passes. *Implemented.* `wi-325-i18n-source-baseline` — AMENDS [[I18N-06]].
- **ONB-P2** — Interview screen deleted: `interview.tsx` + API/service/Inngest/mobile machinery removed; per-subject interview extraction replaced by per-topic async extraction from the topic-probe's first answer, written to `learning_sessions.metadata`; `onboarding_drafts` writes stopped (Phase 1), table drop deferred ≥14d (Phase 2). *Partially shipped (`f0cbf5ee`).* `slice1.5-pr1c-delete-interview` — supersedes the interview half of [[ONB-05]]/[[TEACH-01]]; Phase-2 drop is destructive for draft transcript history (signals preserved in session metadata).
- **ONB-P3** — Pre-auth audience (`'learner'|'parent'`) carried across the signup wall in SecureStore `preAuthAudience.v1` (1h TTL); `create-profile` consumes it (replacing the in-form intent picker) and auto-redirects adult parents to add-child; under-18 parent-tap falls back to learner setup; wiped on sign-out. *Designed.* `parent-audience-add-child-onboarding`.

### Refactor canonicalization (REF) — NEW (durable "single source of truth" choices)

- **REF-01** — `findOwnedCurriculumTopic(s)` (`curriculum-topic-ownership.ts`) is the canonical single-topic ownership lookup; inline parent-chain joins banned; dual-join is strictly safer than any single-path variant. *Implemented.* `bucket1-consolidation` — 6 deferred sibling sites in a forward-only `SWEEP-topic-ownership-join` allowlist. (code: `apps/api/src/services/curriculum-topic-ownership.ts:26`)
- **REF-02** — Forward-only ratchet guard test required whenever a duplication fix has ≥3 sibling sites (sweep-all-now preferred; tracked-deferral acceptable); cites CLAUDE.md "Sweep when you fix". *Designed.* `bucket1-consolidation`, `centralize-duplication-*`.
- **REF-03** — `assertOwnerProfile(c, msg)` is the canonical account-owner 403 gate (14 inline sites consolidated); gates inside whole-handler try/catch must NOT be migrated (throw would become 500). *Implemented.* `bucket1-consolidation`. (code: `apps/api/src/services/family-access.ts:145`)
- **REF-04** — `SubscriptionTier`/`SubscriptionStatus` imported from `@eduagent/schemas` (inline unions banned; one file had a stray `'trial'`); `TIER_CONFIGS` numbers stay API-only. *Designed.* `bucket1-consolidation`.
- **REF-05** — All mobile date/time formatting routes through `format-relative-date.ts` (`getRelativeDateParts`/`getDurationParts`/`formatTimer`) + i18n hooks; canonical algorithm is midnight-normalized `Math.round` (fixes a late-night/DST off-by-one); per-screen formatters banned. *Implemented.* `centralize-duplication-time-query-route`. (code: `apps/mobile/src/lib/format-relative-date.ts:58`; guard: `format-relative-date.guard.test.ts`)
- **REF-06** — All mobile read queries use `useApiQuery<TResp,TData>` (wraps `combinedSignal`/profile-check/error handling, 134 inline sites); ratchet fails CI on increase. *Designed.* `centralize-duplication-time-query-route`. Ratchet frozen; burn-down not scheduled — see plan 2026-06-03-adr-register-cleanup.
- **REF-07** — API route handlers use `withProfile(c)` (`{db,profileId,user,profileMeta}`) instead of inline `requireProfileId`+`c.get('db')` (199 sites); baseline ratchet fails on increase. *Designed.* `centralize-duplication-time-query-route`. Ratchet frozen; burn-down not scheduled — see plan 2026-06-03-adr-register-cleanup.

### Test infrastructure (TEST) — NEW (durable governance/ratchets beyond [[STAB-08]])

- **TEST-01** — Test-utility location governance: API `apps/api/src/test-utils/`, integration-only `tests/integration/`, mobile `apps/mobile/src/test-utils/`; every retained mock must carry one of 5 boundary labels (external/native/observability/transport/temporary-internal); shared utils must not internally mock app modules. *Implemented.* `shared-test-utility-framework`.
- **TEST-02** — Canonical Inngest test utilities `createInngestStepRunner` (U1) + `createInngestTransportCapture` (U2) replace hand-rolled step mocks. *Implemented.* `shared-test-utility-framework`.
- **TEST-03** — LLM routing/envelope tests use deterministic `llm-provider-fixtures.ts` (U5), never `jest.mock('./llm')`. *Implemented.* `shared-test-utility-framework`.
- **TEST-04** — `integration-mock-guard.test.ts` scans every `*.integration.test.ts` and fails CI on non-allowlisted internal mocks (allowlist = sentry, stripe only); `KNOWN_OFFENDERS` is a forward-only shrinking punch list. *Implemented (offenders empty).* `shared-test-utility-framework`.
- **TEST-05** — Mobile screen tests use `screen-render.tsx` (`renderScreen`/`NAMED_PROFILES`/`ERROR_RESPONSES`, `gcTime:0`,`retry:false`) instead of per-test provider setup. *Implemented.* `shared-test-utility-framework`.
- **TEST-06** — Coverage targets (API/mobile 80% lines/70% branches; schemas 80% on exported contracts) are quality guides; tests must cover failure/edge/isolation paths, not happy-path-only. *Designed.* `test-coverage-hardening`.

### Product strategy (STRAT) — NEW

- **STRAT-01** — Core positioning is "practice-coach" (first turn teaches, every session demands action, progress proves retention, structure follows value), not "AI tutor with setup screens"; onboarding preference screens deprecated in favor of behavioral inference. *Designed.* `learning-product-evolution-audit`.
- **STRAT-02** — Curriculum materialization pre-warmed at subject-creation time (not post-interview), eliminating the ~25s first-session stall; the only genuinely net-new code for the onboarding fast path. *Designed.* `learning-product-evolution-audit`, `slice1-pr5d-curriculum-prewarm`.
- **STRAT-03** — Bypassed legacy onboarding screens must be *deleted* (not just bypassed) within 14d of E2E-green, enforced by a file-count guardrail + flag removal; "bypass-without-delete" is the named failure mode of two prior attempts. *Designed.* `learning-product-evolution-audit`.
- **STRAT-04** — First-curriculum-topic selection is intent-aware (LLM/embedding match against `rawInput`, `sortOrder` fallback below a confidence floor; `topicHint` threaded through `SubjectResolveResult`), not always `sortOrder=1`. *Designed.* `learning-product-evolution-audit`, `slice1-pr5i-topic-intent-matcher`.
- **STRAT-05** — Learner Progress redesign (Slice 3) is an *exposure* project — wire already-computed fields (`daysSinceLastReview`, `weeklyDelta*`, retention) to UI; must not grow into a Progress-tab rebuild. *Designed.* `learning-product-evolution-audit`.
- **STRAT-06** — All parent-facing notifications about a child must be gated on `consentStatus` (WITHDRAWN/PENDING → no send); the original struggle-notification only checked for a `familyLinks` row. *Implemented (`2292b415`, 5 break tests).* `hidden-wins-backlog`.
- **STRAT-07** — Hidden-win/backlog features ship as independent PRs with their own story + acceptance criteria; bundling into "redesigns" is forbidden; validate per-feature on the 5.8" Galaxy S10e. *Designed.* `hidden-wins-backlog`.

---

## §5 — Coverage & Next Steps (updated)

- **Specs:** all 82 under `docs/_archive/specs/` (§1–§2).
- **Plans:** all 123 under `docs/_archive/plans/` indexed; ~70 were impl-plans of covered specs (decisions already present), ~18 pure test-infra/ops/decomposition; **~70 net-new/amendment decisions folded into §4.**
- **Decisions recorded:** ~260 total across both passes; cross-source duplicates merged; conflicts resolved against code in §1.
- **Biggest register gap closed by the plans pass:** **Challenge Round** (CR-01..25) — a shipped subsystem with no spec.
- **Code-verified stale-doc deltas (from §1) still worth a cleanup:** auto-file threshold 3 not 5 ([[C-1]]); session effective modes `freeform|learning` only ([[C-5]]); `topic_notes` multi-note ([[C-3]]); V0 nav helpers in `legacy-navigation-contract.ts` ([[C-6]]).
- **Plan-time supersessions to note:** interview screen deleted ([[ONB-P2]]) supersedes the interview half of [[ONB-05]]/[[TEACH-01]]; mentor-language axis collapsed ([[I18N-P1]]); LLM-first OCR ([[OCR-P2]]) supersedes the shape-heuristic gate ([[OCR-P1]]).
- **Not yet folded in:** live `docs/specs/**`, `docs/compliance/audience-matrix.md`, `docs/architecture.md`, and the CLAUDE.md-referenced Challenge Round policy text (now partially reconstructable from CR-*). Many §4 entries are "Designed" — a code-status reconciliation pass (Designed → Implemented/Dropped against the current tree) should precede treating this register as authoritative.

---

## §6 — Spec↔Plan Conflict Audit (10 most complex features)

Diffed the 10 highest-complexity features' specs against their implementation plan(s) **and the current code** (code is ground truth). Result: **the features are not in conflict with each other**; implementations are internally consistent and, on every divergence, the code follows the *plan* (the plan corrected the spec). Three findings are real "doc claims a mechanism the code lacks" gaps; the rest is stale doc-prose.

**Clean (consistent / intended amendment):** navigation-contract, memory-architecture-upgrade (all 3 phases shipped, default-off flags), library-v3-redesign, tier-access-rework, subject-onboarding-fast-path (superseded by slices, [[ONB-P2]]), parent-narrative (design-consistent; plan's progress table stale), tiered-conversation-retention.

### Findings requiring a decision

- **AUDIT-A (High) — interaction-durability Layer 3 unbuilt + orphaned schema.** The SUBJECT-09 root fix ([[STAB-09]]/[[STAB-14]]–[[STAB-19]]) — Inngest `interview-persist-curriculum`, `ready_to_persist` event, `completing`/`failed` draft flow — is **not in code**; `routes/interview.ts` was deleted entirely (see [[ONB-P2]]). But migration `0046` shipped the `completing`/`failed` enum values + `failure_code` column, now wired-but-unused (CLAUDE.md: "wired-but-untriggered code is worse than dead code"). Spec A5 (COALESCE-sentinel topic index) and 3b (`extractSignals` returns `topics`) are also factually wrong vs code (`bookId` is NOT NULL; `extractSignals` returns `{goals,experienceLevel,currentKnowledge,interests}`); the existing `0043` index (`book_id, lower(title)`) is what shipped. **Resolution:** confirm SUBJECT-09 is closed by the interview-deletion path; drop the orphan enum values/`failure_code` or document them; mark interaction-durability L3 + interview-side L2 as superseded.
- **AUDIT-B (Med-High) — privacy RLS `parent_read_via_family` policies never shipped.** The central security deliverable of `parent-visibility-privacy` ([[PROF-19]]/[[PROF-20]]) — additive parent-read SELECT policies on ~11 child-data tables + split `family_links` policies — exists only in docs; **no migration contains them.** Parent access is guarded only at the app layer (`assertParentAccess`), the exact bypass the spec set out to close. Cross-refs [[RLS-05]]: the connection role was never switched to `app_user`, so RLS isn't enforced yet regardless. **Resolution:** either implement §4/§5 policies in a migration with the two-family isolation break-test, or record that app-layer scoping + the broad `0085` RLS sweep is the accepted guard (read `0085` in full first to see if it already covers parent-read under a different policy name). All other privacy items (transcript-endpoint removal, curated memory endpoint, child-isolation, withdrawal grace/archive) shipped correctly.
- **AUDIT-C (Low now) — study/family V0 capability predicate uses the forbidden inference.** V0 ships `isFamilyCapableProfile = isOwner + adult + profiles.some(p=>p.id!==active && !p.isOwner)` (`app-context.tsx`), but the full spec's glossary explicitly forbids `profiles.some(!isOwner)` and mandates the server `hasFamilyLinks` field. Benign on single-owner accounts; a V1 upgrade-path item (and related to the tracked `isAdultOwner` null bug, `project_navcontract_isadultowner_null_bug.md`). **Resolution:** V1 must swap the array proxy for the server `hasFamilyLinks` field, not persist the V0 predicate.

### Supersessions confirmed (intended, no action beyond doc hygiene)
- Family **tab** ([[PROF-05]], profile-as-lens phase-2-family-tab plan) → removed; replaced by parent-home + the `recaps` tab ([[NAV-04]], [[C-6]]). `family.tsx` gone; `dashboard.tsx` redirects to `/(app)/home`.
- Interview screen ([[ONB-P2]]) supersedes interaction-durability L3's interview surface and the interview half of [[TEACH-01]]/[[ONB-05]].
- Memory dedup LLM routes through the sanctioned router at `flash` tier, not a direct Anthropic-Haiku SDK (the plan's SDK approach is stale; the shipped routing is better and CLAUDE.md-compliant).

### Stale doc-prose (code correct; archived docs not updated — low priority)
- memory spec line-90 weights `0.7/0.3/90d` (authoritative Phase-2 section + code = `0.85/0.15/180d`); retention spec component-§ says Query A re-fires `session.completed` (code uses `session.summary.create` to avoid XP/streak replay — spec's own AC already admits this); retention `parentReport` day-one column (plan lifted it out, never added); nav-contract finalization closeout `9/9/9` (code = `9/7/10`, spec correct); parent-narrative plan progress table marks Phases 3-4 "NOT STARTED" though both shipped (accommodation guide landed in `more/accommodation.tsx`, not `child/[profileId]/index.tsx`).
