---
title: "S2-01 — The Controlled Decision Census"
status: "DRAFT — Wave-0 paper artifact, MentoMate Stream-2 estate-canon drain"
date: 2026-07-14
provenance: >
  Produced as the S2-01 Wave-0 deliverable named in
  `_wip/umbrella-program/2026-07-12-stream-2-slice-plan-DRAFT.md` (§1, §"Two live
  facts": "The ~70-decision census does not exist in-tree ... therefore a Wave-0 WI
  (S2-01), not an input"). Home doc: `_wip/umbrella-program/stream-2-backlog.md`.
  Sole input to the operator's D1 (MoSCoW ruling) and D2 (borderline calls) gates.
  Repo: eduagent-build. Sweep performed by direct file reads plus three parallel
  research passes (canon docs; specs/plans; `_wip/` + compliance) whose findings are
  folded in below with citations verified against the live tree.
sealed-quarantine: >
  `docs/_archive/parallel-adr-audit-2026-06-03/` was NOT opened, read, grepped, or
  seeded from at any point in this sweep — per the operator's hard constraint. Its
  existence is acknowledged only as a pointer (per `stream-2-backlog.md`'s own
  "Caveat" section) for the later S2-15 backstop diff. No content from it appears
  anywhere below.
---

# S2-01 — The Controlled Decision Census

## 1 · Method

**What "decision" means here.** Per the task brief and `docs/adr/MMT-ADR-0000` (the
constitutional ADR ratifying the layer model), a census row is a **contested,
consequential, hard-to-reverse** architecture/product decision currently recorded
somewhere other than an ADR (or recorded nowhere but load-bearing). Mechanical facts,
code-structure trivia, and obvious conventions are excluded.

**The significance gate — quoted verbatim from `MMT-ADR-0000` §II.1** (this is the test
applied to every row below, not a paraphrase or an invented substitute):

> A decision needs an ADR — and a spec/plan must *spawn* one rather than decide inline —
> when **any** of these hold. It is a positive significance test, deliberately
> mechanically-checkable so a first-line agent can apply it without senior taste:
> 1. **Deviates** from a documented principle, pattern, standard, or constraint —
>    *including the CLAUDE.md "Non-Negotiable Engineering Rules"* (comply-or-explain;
>    the strongest trigger).
> 2. **Constrains others** — establishes or changes an invariant, contract, or
>    interface future work must follow.
> 3. **Moves a quality attribute / NFR** (security, privacy, performance, cost,
>    availability, a11y) or changes an FR/AC.
> 4. **Structural or cross-cutting** — module boundaries, data model / flow,
>    dependencies, public interfaces, or a concern spanning many components.
> 5. **Selects or replaces a foundational technology or pattern** (construction
>    technique).
>
> **Release valve — decide inline, no ADR:** the choice is local, reversible, *and*
> conforms to existing principles, and no reader would ask "why this way?" The list is
> an OR and **defaults to flag it** — when in doubt, it is significant.

Every row below states PASS (names the trigger that fired) or FAIL (release-valve
applies — mechanical/local/reversible) against this exact text.

**Drift classification** (four buckets, applied literally):
- **memory-only** — lives ONLY in `.claude/memory/`, invisible to Codex agents.
- **multi-source-divergent** — ≥2 places DISAGREE (the divergent text is quoted).
- **multi-source-consistent** — ≥2 places agree.
- **single-canon** — one non-ADR canon spot (a canon doc, a plan/spec, a compliance
  register, `AGENTS.md`).
- (a fifth, **undocumented-but-load-bearing**, is used for the handful of cases where
  a rule is enforced in code/CI but never written down as a rule anywhere.)

**Proposed MoSCoW** (the operator's ruling to make at D1 — this document only
proposes): **MUST** = memory-only OR multi-source-divergent. **SHOULD** = single-canon
needing ADR extraction. **NICE** = stable, low-drift-risk. **SKIP/tombstone** =
obsolete, superseded, or purely mechanical. Where a row's real-world stakes seem to
warrant deviating from this mechanical mapping (e.g. a single-canon row that is
safety-critical and was recently and repeatedly contested), it is proposed at the
strict-rule tier and flagged **Borderline** with the case for an override — the
override itself is not asserted here.

**What was swept** (file:line cited per row; nothing below is drawn from the sealed
quarantine):
- `.claude/memory/` — all 78 active files read or triaged; the 29-file `_archive/`
  subdirectory was *not* individually read (see Gaps §6) — MEMORY.md's own framing of
  it as "resolved/historical" was taken at face value, consistent with the
  `docs/_archive/` treatment the task brief specifies for the main docs tree.
- `docs/adr/*.md` (all 33 existing ADRs, by filename/title) — used throughout to mark
  rows "already covered," not re-censused.
- `docs/architecture.md`, `docs/PRD.md`, `docs/ux-design-specification.md`,
  `docs/glossary.md`, `CONTEXT.md`, root `AGENTS.md` (incl. Known Exceptions),
  `docs/canon/identity/{ontology,domain-model,data-model,prd}.md` — grepped
  thoroughly across multiple keyword passes, hits read in surrounding context.
- `docs/specs/**` (14 files), `docs/plans/**` (57 files, incl. `v2-plan/`,
  `v2-dossier/` subdirs) — started from `scripts/decision-adr-link-baseline.json`
  (the forward-ratchet's own enumeration of un-ADR'd embedded decision blocks), then
  broadened by keyword grep across the full specs/plans tree.
- `docs/specs/epics.md` — the frozen `ARCH-1..26` register (full text read) +
  discovered two sibling legacy registers (`UX-1..19`, `AD1..7`) not named in
  `MMT-ADR-0000` Part III.
- `_wip/**` (203 markdown files) — named decision-capture docs read in full;
  `_wip/identity-foundation/` broadened by keyword grep and cross-checked against the
  ADR list file-by-file.
- `docs/meetings/*decision*`, `docs/compliance/*.md` (art9, identity-compliance-register,
  dpia, ropa, breach-response-plan) — read/skimmed for standalone decisions not already
  ADR-pointed.
- `_wip/umbrella-program/stream-2-backlog.md` and its linked
  `2026-07-12-stream-2-slice-plan-DRAFT.md` — read in full as the governing brief for
  this artifact (confirms "the census does not exist in-tree," i.e. this is fresh work,
  not a duplicate of prior triage).

## 2 · The census table

Numbered 1–58, grouped by area for readability. The `ARCH-N` legacy register (26
entries) and the two newly-discovered sibling registers (`UX-1..19`, `AD1..7`) are
**not** folded into this numbering — `stream-2-backlog.md`'s own inventory lists "the
~70-decision ADR backfill" and "the `ARCH-N` drain" as two separate bullets, and the
operator's own framing treats them as distinct work. `ARCH-N` gets its own disposition
table in §2B; `UX-N`/`AD-N` are flagged as an unswept gap in §6. See §4 for the count
reconciliation.

### 2A · Main census (58 rows)

#### A — WI-387 memory-drain set (confirmed by `stream-2-backlog.md`, verified against live files)

| # | Decision | Where it lives now (file:line) | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 1 | Every AI-driven interaction must expose a human-override escape hatch (manual subject entry, redirect/skip/challenge, coaching = suggestion not mandate) | `.claude/memory/feedback_human_override_everywhere.md:1-17` | memory-only | **MUST** — operator has already ruled the drain target as `ux-design-specification.md` (per task brief); extraction not yet done | PASS — trigger 1 (core product principle) + trigger 3 (UX/agency NFR) | No |
| 2 | As-built language-teaching architecture: `pedagogyMode` enum, `nativeLanguage` per-subject, CEFR, vocabulary/language-progress routes | `.claude/memory/project_language_pedagogy.md:1-23` | **multi-source-divergent** — `docs/architecture.md:1696` says "Epic 6: Language Learning ... DONE" but `docs/architecture.md:333` (Deferred Decisions table) still says "Language Learning mode \| Deferred to v1.1" — architecture.md self-contradicts, and memory carries the only accurate as-built detail | **MUST** | PASS — trigger 4 (structural, spans schema/routes/mobile) | No |
| 3 | `private_sources`/`sourceAudit` envelope contract; `0.88` general-knowledge confidence gate; source-bound vs. general-knowledge turn taxonomy | `.claude/memory/project_llm_source_provenance.md:1-19` | memory-only — zero hits for `private_sources`/`sourceAudit`/`general_knowledge`/`0.88` in `docs/architecture.md` | **MUST** | PASS — trigger 2 (envelope contract) + trigger 3 (safety/accuracy NFR) | **YES — see §3 annex #1** (does the 0.88 gate itself clear the gate as its own ADR, separate from the envelope-contract ADR?) |
| 4 | Two systemic bug patterns (silent-fallback masking, React `isPending` concurrency-guard race) as code-review checklist items | `.claude/memory/project_known_bug_patterns.md:1-38` | memory-only — `AGENTS.md` "Code Quality Guards" has GC1–GC6 but not these two patterns | **MUST** (per WI-387 ruling: target = `AGENTS.md` § Code Quality Guards) | PASS — trigger 1 (these are now enforced-in-review conventions) | No |
| 5 | Brand identity: fixed teal+lavender, no accent picker, dark-first default follows system | `.claude/memory/project_brand_dark_first.md:1-30` | **multi-source-divergent, confirmed 3-way** — memory says "NO accent picker. No presets." (2026-03-30); `docs/architecture.md:75,132` says "Teal primary + lavender secondary ... persona-unaware," silent on presets; `docs/ux-design-specification.md:387` (2026-05-23 note) says shipped implementation has **"five accent presets (teal/electric/hotpink/emerald/amber)"**; `apps/mobile/src/lib/design-tokens.ts:217-273` confirms an `AccentPreset` interface + `accentPresets` array including `electric`, `hotpink` entries in code | **MUST** | PASS — trigger 1 (code contradicts the documented "no picker" decision) | **YES — see §3 annex #2** (own brand-theming ADR vs. a plain canon section; also: which side is actually correct — memory/architecture.md's "no picker," or the shipped 5-preset reality?) |
| 6 | OTA/EAS-Update ownership: CI owns normal preview OTA; manual `eas update` only on explicit instruction; `eas update` doesn't read `eas.json` env | `.claude/memory/project_eas_update_ota.md:1-23` | **Finding: already drained.** The memory file itself now reads "OTA implementation details are no longer canonical in memory ... Read `docs/deployment-and-secrets.md`" — it is already a pure pointer | **SKIP** (already single-canon in `docs/deployment-and-secrets.md`; WI-387's row 6 target appears stale/complete) | N/A — already resolved | No |
| 7 | Freeform/Ask-Anything chats stay low-friction; no hidden-topic minting just to unlock topic-bound features | `.claude/memory/project_freeform_library_filing_decision.md:1-13` | **Finding: already fully drained.** `MMT-ADR-0021-freeform-library-filing-threshold.md` exists; memory explicitly says "It is only a recall pointer" | **SKIP** (already covered — `MMT-ADR-0021` + `docs/PRD.md`) | N/A — already an ADR | No |
| 8 | Language reviews must test usable production (concrete tasks), never abstract "main ideas"/meta-knowledge | `.claude/memory/project_language_assessments_production_first.md:1-11` | memory-only | **MUST** (operator-ruled target = `PRD.md`, per task brief) | PASS — trigger 3 (assessment-design NFR/AC) | No |
| 9 | Session lifecycle: wall-clock shown to all users, active-time internal-only, hard caps removed, LLM-adaptive silence via `expectedResponseMinutes`, `computeActiveSeconds()` gap-cap algorithm | `.claude/memory/project_session_lifecycle_decisions.md:1-26` | `docs/architecture.md:1703` carries only a one-line summary row ("Epic 13 ... DONE") — the actual design rationale and the gap-cap algorithm are memory-only | **MUST** | PASS — trigger 2 (`wallClockSeconds`/`durationSeconds` API contract) + trigger 3 (UX/analytics NFR) | No |

#### B — Additional memory-only / product-principle decisions (found beyond the WI-387 table)

| # | Decision | Where it lives now | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 10 | S6 (V2 nav cutover deletions) is DEFERRED and IRREVERSIBLE by design; no agent may execute it without explicit human confirmation stating the rollback loss | `.claude/memory/feedback_s6_deferred_irreversible.md:1-26`; plan itself at `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md` (status: deferred) | memory-only for the *governance rule* (the plan states deferred status but not the mandatory-confirmation protocol as a standing rule) | **MUST** | PASS — trigger 2 (constrains all future agents) + trigger 3 (irreversibility = risk NFR) | No |
| 11 | Prerequisites are advisory only — never lock/gate a topic; soft-skip, never delete edges | `.claude/memory/feedback_never_lock_topics.md:1-17` | single-canon — ruled WI-587, `docs/PRD.md § Concept Map — Prerequisite Relationship Types` (per memory's own citation, confirmed by canon-sweep at `PRD.md:1375`) now states this; memory is a reinforcing pointer | **SHOULD** | PASS — trigger 1 (was a deviation from the old REQUIRED-locks PRD wording) | No |
| 12 | No screen may force "add a child" as the only path; owner/parent accounts always get a usable solo/skip path | `.claude/memory/feedback_never_force_add_child.md:1-8` | memory-only | **MUST** | PASS — trigger 3 (FR/UX — every screen state must have an actionable escape) | No |
| 13 | UX philosophy: confident inference + reversible defaults over both surveillance and friction; controls surfaced only when reached for | `.claude/memory/feedback_quiet_defaults_over_friction.md:1-113` | memory-only | **MUST** | PASS — trigger 1 (a named, repeatedly-reaffirmed design principle) | No |
| 14 | Voice input (STT) and output (TTS) are core, not optional; per-session Text/Voice toggle (FR144), TEACH_BACK defaults voice-on (FR142) | `.claude/memory/feedback_voice_is_critical.md:1-13` | single-canon — the shipped behavior is in `PRD.md` FR142/FR144; the "why non-negotiable" framing is memory-only | **SHOULD** | PASS — trigger 3 (core FR) | No |
| 15 | Free-tier quota shape (10/day + 100/month), Plus/Family/Pro tier numbers, quota-counting invariants (what does/doesn't burn quota; parent-proxy must reject before decrement) | `.claude/memory/pricing_dual_cap.md:1-34` | **multi-source-divergent** — memory: "Free tier uses a **dual-cap model: 10 questions/day AND 100 questions/month**" as a standing/permanent config (`dailyLimit: 10`); `docs/PRD.md:80,1489-1491` frames the daily-10 limit as a **"first-week boost (10/day for days 1-7)"** only, reverting to a bare 100/month afterward. These describe two different product behaviors (permanent daily throttle vs. one-week promotional window) | **MUST** | PASS — trigger 3 (pricing/cost NFR) + trigger 2 (the two quota-counting invariants are contracts on all future metered routes) | **YES** — need to confirm against the live `config.ts`/tier config which framing is actually implemented; flagged in §3 |
| 16 | Clerk session-token claims are not authoritative; fall back to Clerk Backend API + fail closed on stale `email_verified` | `.claude/memory/project_clerk_email_verification_fallback.md:1-18` | single-canon-ish — memory's own text says `docs/pre-launch-checklist.md` and `docs/deployment-and-secrets.md` already document the fast-path + fallback | **SHOULD** (narrow scope; largely already documented) | PASS — trigger 2 (auth contract) | Low-priority borderline — arguably already adequately covered, could be NICE |
| 17 | Eval-LLM harness: fixture-driven snapshot testing over every registered prompt builder, 23 flows, Tier 1/Tier 2 split | `.claude/memory/project_eval_llm_harness.md:1-34` | single-canon — `apps/api/eval-llm/README.md` documents layout/anatomy; `AGENTS.md` names the `pnpm eval:llm` rule; the flow count/registry detail is memory-only | **SHOULD** | PASS — trigger 5 (foundational testing technique) | No |
| 18 | Eval harness signal-distribution regression guard ("Layer 1" — catches envelope-signal drift `expectedResponseSchema` misses); 5pp default tolerance | `.claude/memory/project_eval_llm_signal_metrics.md:1-51` | memory-only | **MUST** | PASS — trigger 5 (foundational regression-detection pattern) + trigger 3 (quality NFR) | No |
| 19 | Source-audit gate exemptions must key on turn-identity allowlist (`exemptSourceAudit` marker), never a reply-content regex | `.claude/memory/project_enduser_gate_carveout_turn_allowlist.md:1-26` | memory-only (WI-1823 operator-ruled, recorded only here) | **MUST** | PASS — trigger 1 (fixes a previously-deviating regex approach) + trigger 2 (exemption contract) | No |
| 20 | Dev Neon DB is push/direct-only; staging/prod are migrate-only (asymmetric schema-deploy policy) — dev's migration journal has drifted and re-journaling is deliberately deferred | `.claude/memory/project_schema_drift_pattern.md:1-49` | single-canon — already stated in `AGENTS.md` § "Schema And Deploy Safety" (root); memory adds diagnostic/incident detail | **SHOULD** | PASS — trigger 1 (deviates from "always migrate" default) + trigger 5 (foundational deploy technique) | No |
| 21 | No app jargon; plain, moment-based UI copy for all ages ("I have homework" not "Practice now") | `.claude/memory/feedback_no_jargon_kid_language.md:1-18` | memory-only | NICE / borderline | Marginal — arguably a copy-style guideline more than an architecture/product decision | **YES — see §3 annex #3** (does a copy-tone guideline clear the gate at all, or is it release-valve/local?) |
| 22 | Market/language pivot history: English-only UI (2026-03-23) superseded by shipped 7-locale reality; consent strategy superseded by the compliance register | `.claude/memory/market_language_pivot.md:1-19` | **SKIP/tombstone** — self-superseded, historical; current truth lives in `AGENTS.md` § Languages and row #29 below (the *stale-claim* divergence, which is the live issue, not this memory) | SKIP | N/A — historical record | No |
| 23 | `key={themeKey}` remount + root-layout opacity-animation removal for device-build safety | `.claude/memory/project_themekey_removed.md:1-19` | memory-only | **SKIP** — this is a mechanical bug-fix pattern (Sentry crash + Hermes release-build timing), not a contested architecture/product decision; excluded per the census's own scope note | FAIL — release valve (local, reversible, no reader asks "why this way" beyond "it crashed") | No |

#### C — `AGENTS.md` "Known Exceptions to Engineering Rules" (all five are, by definition, documented deviations from a principle — trigger 1 by construction)

| # | Decision | Where it lives now | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 24 | Mobile `tsconfig.json` `references[]` to `../api`, for `AppType` type-only import; runtime imports still forbidden | `AGENTS.md:352` (root) | single-canon | **SHOULD** | PASS — trigger 1 (explicit, named deviation) | No |
| 25 | `@clerk/clerk-js` ships `@coinbase/wallet-sdk`+`@solana/*` deps but they never reach the device bundle (verified WI-1040); not fixable via pnpm overrides | `AGENTS.md:353` | single-canon | **NICE/SKIP borderline** | Marginal — nothing was *chosen*; this is a verified non-issue, arguably not a decision at all | **YES — see §3 annex #4** |
| 26 | Global unscoped `@tanstack/query-core` pnpm override (dedupe across `@clerk/shared` + `@tanstack/*` consumers); must bump in lockstep with `@tanstack/react-query` | `AGENTS.md:354` | single-canon | **SHOULD** | PASS — trigger 2 (constrains all future TanStack bumps) + trigger 5 | No |
| 27 | Account-level Inngest events (`app/account.reclaim_attempt` etc.) legitimately omit `profileId`, scoped by `clerkUserId`/`accountId` instead — sanctioned deviation from the payload-always-includes-`profileId` rule | `AGENTS.md:355` (cross-references `ARCH-13`, see row A12 in §2B) | single-canon | **SHOULD** | PASS — trigger 1 (named, deliberate deviation from a documented rule) | No |
| 28 | `teachingPreferenceSchema.analogyDomain` keeps `.nullable().optional()` — tri-state field (value/explicit-clear/leave-unchanged), a WI-1160 operator-ruled carve-out from the "pick one" nullable/optional canon rule | `AGENTS.md:356` | single-canon | **SHOULD** | PASS — trigger 1 (textbook comply-or-explain case) | No |

#### D — Canon-prose decisions (`architecture.md` / `PRD.md` / `ux-design-specification.md` / `glossary.md`)

| # | Decision | Where it lives now | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 29 | UI-language scope: is v1.0 "English-only" or the shipped 7-locale reality? | `docs/architecture.md:142` ("English-only UI for v1.0 — no i18n framework implemented") and `docs/PRD.md:158` (same claim) vs. `AGENTS.md` § Languages (7 shipped locales, `SUPPORTED_LANGUAGES`) and `.claude/memory/market_language_pivot.md` | **multi-source-divergent** (2 stale canon docs vs. current truth in 2 other places) | **MUST** | PASS — trigger 3 (i18n scope is an FR) | No |
| 30 | AI cost management: €0.05/session soft ceiling is a monitoring threshold not a hard cutoff; concurrent quota decrements use Postgres row-level locking | `docs/architecture.md:129` | single-canon | **SHOULD** | PASS — trigger 3 (cost NFR) | No |
| 31 | Prompt-caching strategy: provider-level (Anthropic) caching first; DB-cached Parallel Example templates keyed by content-hash; no general-purpose cache layer at MVP | `docs/architecture.md:130` | single-canon | **SHOULD** | PASS — trigger 5 | No |
| 32 | Session-state persistence: hybrid model — immutable append-only event log + mutable summary row, written in the same transaction every exchange | `docs/architecture.md:133,322` (restated consistently within the same doc) | single-canon | **SHOULD** | PASS — trigger 4 (structural, spans session/retention/dashboard) | No |
| 33 | Client stream-recovery policy: freeze partial response on drop, auto-retry 1s/2s/4s (max 3), <20% received → replace, >20% → append-with-separator; never discard what the student already read | `docs/architecture.md:134` | single-canon | **SHOULD** | PASS — trigger 3 (reliability/UX NFR, quite specific) | No |
| 34 | Event-driven lifecycle: Inngest fire-and-forget with retry; explicitly NOT full event sourcing at MVP; lifecycle events co-stored in the session-event log | `docs/architecture.md:136` (overlaps `ARCH-13`, §2B row A13) | single-canon | **SHOULD** | PASS — trigger 4/5 | No |
| 35 | Error-boundary/circuit-breaker policy, deliberately asymmetric per external dependency: LLM (3 failures/30s, half-open 60s) vs. OCR (no breaker, 5s timeout, immediate fallback) vs. Stripe (no breaker, webhook-synced, 3-day grace) vs. Neon ("invest in reliability, don't build elaborate fallbacks") | `docs/architecture.md:139` | single-canon | **SHOULD** (near-MUST importance) | PASS — trigger 3 (reliability NFR) + trigger 2 (constrains how every future dependency gets wired) | No |
| 36 | Consumer Family Compliance Boundary: subscription tier (Free/Plus/Family/Pro) is never a child-safety/consent control — all consent/age/scoping/deletion/vendor rules apply identically across tiers | `docs/architecture.md:147-149` (added 2026-05-25) | single-canon | **SHOULD** | PASS — trigger 2 (constrains billing-tier feature work) + trigger 3 (compliance NFR) | **YES — see §3 annex #5** (possible unverified overlap with `MMT-ADR-0002`) |
| 37 | Embedding provider resolved: Voyage AI `voyage-3.5`, 1024 dims (this is what `ARCH-16`'s original "TBD" resolved to) | `docs/architecture.md:327,1368,1571` (consistent across 3 citations) | single-canon | **SHOULD** | PASS — trigger 5 | No |
| 38 | Post-MVP Web Port: defer web entirely until post-MVP; when built, Option A (Parent Control Center only, no kid learning-flow on web) over Option B (full text-mode learning); specific route/role/token choices locked in now to preserve the A→B path | `docs/architecture.md:1908-2043` (the full "Post-MVP Platform Decision: Web Port Analysis" section) | single-canon | **SHOULD** (borderline MUST-weight — large, detailed, explicit path-dependency lock-in) | PASS — trigger 4 (structural) + trigger 5 (platform choice) | Moderate — flagged for priority, not classification | 
| 39 | Downgrade policy: progress/data is never deleted or archived on downgrade ("preserved data incentivizes re-upgrade," switching-cost-moat framing) | `docs/PRD.md:1539` | single-canon | **SHOULD** | PASS — trigger 3 (retention/business NFR) | No |
| 40 | Per-persona visual brand system ("One Hue Family, Three Expressions"/"Three Visual Moods": teen dark, eager-learner warm, parent light) | `docs/ux-design-specification.md:525-620` (entire "Visual Design Foundation"/"Design Direction Decision" section) | **multi-source-divergent** — directly contradicts `AGENTS.md` ("Shared mobile components stay persona-unaware ... `personaType` column removed in Epic 12") and `docs/architecture.md:129` ("Teal primary + lavender secondary ... no per-persona theme variants"); this is the same underlying contradiction as row #5, from the opposite (stale-design-doc) side | **MUST** | PASS — trigger 1 | Same family as annex #2 — see §3 | 
| 41 | Dual-mode teaching: "Serious Learner (mastery gates) vs. Casual Explorer (no gates)" listed as a live "Design Opportunity" | `docs/ux-design-specification.md:65` | **multi-source-divergent** — contradicts `AGENTS.md`: "The persistent Challenge mode toggle (`learningMode: 'serious'\|'casual'`) was removed in Phase 0 (PR #325); today's `casual` is the single default tone" | **MUST** | PASS — trigger 1 | No |
| 42 | "Key UX Design Decisions" bundle (9 items): Homework Fast Lane, Camera Input in MVP, Forced Adoption Lens, 2-3 Question Limit, Parallel Example Pattern, Invisible Bridge to Learning, Speed is Survival, Parent/Teacher Preview at Setup, Teacher Channel | `docs/ux-design-specification.md:50-58` | single-canon (not cross-verified against current code in this pass) | **SHOULD** (batch — needs a verification pass before individual ADR-splitting) | Likely PASS on most (trigger 3/2) — not individually confirmed | Flagged as needing follow-up verification, not itself a classification dispute |
| 43 | SM-2 spaced-repetition deviations from the canonical algorithm (grading source, EVALUATE quality floor, score clamping) | `docs/glossary.md:674-676`, pointer to `packages/retention/README.md` | single-canon (doc + code README, consistent) | **NICE** | PASS — trigger 1 (explicit deviation from a named external standard), but low urgency/stable | No |

#### E — Specs/plans embedded decisions

| # | Decision | Where it lives now | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 44 | §13.6 evidence-gate methodology (observed-cohort data required to authorize S3+) | `docs/plans/v2-dossier/03-decision-ledger.md:21` | **multi-source-divergent, self-flagged stale** — superseded by "the 2026-06-14 no-cohort product ruling" in `docs/plans/v2-plan/00-README.md:108` and `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md:272`; the ledger's own header flags itself stale but the superseded text is still live in the document | **MUST** | PASS — trigger 2 (gates the whole V2 rewrite continuation) + trigger 4 | No |
| 45 | "Launch waits for full build" — no partial-shell launch state permitted | `docs/plans/v2-dossier/03-decision-ledger.md:37` (ruled 2026-06-12) | single-canon | **SHOULD** | PASS — trigger 3 (launch-scope NFR) | No |
| 46 | XP/gamification reversal: earned private learning receipts (XP, quiz scores, mastery counts) retained; coercive presentation (leaderboards, streak-guilt, public comparison) killed — reverses an earlier "XP was killed, not wired" plan decision | `docs/plans/v2-plan/00-README.md` (point 7, ~line 108 area) | single-canon (was contested/reversed once already) | **SHOULD** | PASS — trigger 1 + trigger 3 | No |
| 47 | Push-notification three-signal toggle model; nudge sender/recipient authorization must be server-derived from the family-link model, never inferred from age/persona | `docs/plans/2026-05-31-notification-reachability-nudges.md:118-132` | single-canon | **SHOULD** | PASS — trigger 2 | No |
| 48 | Age-bracket-crossing self-promotion is rejected server-side; a self-registered minor's escape path must be real, never a 403 dead-end | `docs/plans/2026-05-31-profile-setup-personalization-corrections.md:113-128` (tags H-EU-1, C-2) | single-canon | **SHOULD** (security-adjacent, near-MUST) | PASS — trigger 2 + trigger 3 (security NFR) | No |
| 49 | `billing_alert` NowCard has absolute feed priority **-1** — payment recovery always displaces study content | `docs/plans/2026-05-31-billing-recovery-learner-capacity.md` (citing `now-feed.ts:63-73,143-165,204-224`) | single-canon (shipped, PR #2039) | **SHOULD** | PASS — trigger 2 | No |
| 50 | Child-cap top-up capacity model: owner-purchased credits are allocated to a specific child, not a new subscription tier | `docs/plans/2026-05-31-billing-recovery-learner-capacity.md:193-210` | single-canon | **SHOULD** | PASS — trigger 4 (billing/data-model) | No |
| 51 | Billing-alert push bypass policy: bypasses both the daily cap and `respectPushPreference` by default | `docs/plans/2026-05-31-billing-recovery-learner-capacity.md` (~:250-260) | single-canon | **NICE** | PASS — trigger 2, but narrow/low-stakes | No |
| 52 | "Intent first, identity later" onboarding pattern; parent-intent users never default into learner chat | `docs/specs/2026-05-18-trial-intent-save-onboarding.md:728-732` (Decision Log) | single-canon, shipped | **NICE/SHOULD** | PASS — trigger 2 (onboarding routing contract) | No |
| 53 | Crisis-disclosure: detection → learner-facing resources + operator-alarmed telemetry, **deliberately NO guardian notification** (ruling `se-032`: guardian-may-be-abuser failure mode) | `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:109,164` — "**Contradiction RULED 2026-07-10 (Q8, operator): se-032 STANDS**"; WI-1690's "+ guardian notification" wording (from a 2026-07-07 ruling) was struck as superseded | single-canon **now**, but was **multi-source-divergent as recently as 4 days before this census** (WI-1690 vs. `se-032`) and is safety-critical/hard-to-reverse | **SHOULD** by strict rule | PASS — trigger 1 (deviates from an assumed default) + trigger 3 (safety NFR) | **YES — see §3 annex #6** (recommend MUST-priority override despite single-canon-now, given the contest history and consequence) |

#### F — Compliance / meetings

| # | Decision | Where it lives now | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 54 | Launch posture: 13+ age floor, guardian-consent through 16 (location-blind), country allowlist derived from the 7 UI locales, OpenAI/Anthropic-style LLM routes only (no Gemini API for minors); "13+ only at launch" family model | `docs/meetings/2026-06-04-age-floor-decision-minutes.md` (status: "Decided (minutes). May be promoted to an `MMT-ADR`"), `docs/meetings/2026-06-05-launch-posture-decision-brief.md` (status: "Nothing in here is decided ... becomes the body of an `MMT-ADR`"), `docs/compliance/identity-compliance-register.md:89` ("Locked product parameters"), and most recently re-ruled at `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:163-165` ("Age floor cementing — RULED 2026-07-10 ... Launch family model — RULED 2026-07-10") | **multi-source-consistent** across 4 non-ADR documents, every one of which explicitly flags itself as ADR-candidate-but-not-yet-an-ADR | **SHOULD** by strict rule | PASS — trigger 3 (compliance/safety NFR) + trigger 1 (deviates from the still-live but stale "Strictly 11+" `CLAUDE.md` constraint the brief itself names) + trigger 5 (excludes/selects LLM-provider routes on compliance grounds) | **YES — see §3 annex #7** (the single strongest case in this census for a MUST override of the strict multi-source-consistent→SHOULD mapping) |
| 55 | MentoMate does NOT collect/infer/derive/label/store GDPR Art 9 special-category (health/disability) data; "even inferring counts" — no model/classifier/heuristic may output a clinical or disability label | `docs/compliance/art9-special-category-decision.md:1-40` (DECIDED 2026-06-08, user-ruled) | single-canon | **SHOULD** | PASS — trigger 3 (privacy/compliance NFR) + trigger 1 (constrains all future prompt/classifier work) | No |
| 56 | Dormancy → cleanup: ~24 months inactivity, 30-day pre-deletion notice + export window | `docs/compliance/identity-compliance-register.md:87-92` ("Locked product parameters") | single-canon | **SHOULD/NICE** | PASS — trigger 3 (data-retention NFR) | No |

#### G — `_wip/identity-foundation` findings

| # | Decision | Where it lives now | Drift evidence | Proposed MoSCoW | Gate verdict | Borderline? |
|---|---|---|---|---|---|---|
| 57 | Account-detachment ruling: 13+ entitlement floor for detachment, supporter-role ceiling is recap-only, proxy-mode stays dormant | `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md:1-92` — "ratified in session ... pending canon amendment" | **multi-source-divergent** — the ruling exists to resolve the fact that "graduation" currently names 3 *different* transitions across `docs/canon/identity/ontology.md`, `domain-model.md` §5, and `docs/canon/identity/prd.md` Part 10; the ruling itself is recorded only in this one `_wip` doc, not yet propagated to any of the three | **MUST** | PASS — trigger 2 (new capability-derivation invariant) + trigger 4 (touches 4 canon docs + `MMT-ADR-0008`/`0010`) | No — closest near-misses are `MMT-ADR-0008`/`0010`, neither of which states this specific ruling |
| 58 | `consent_request` service-role RLS exceptions — an existing ADR + its canon partner assert something false | `MMT-ADR-0020` (Consequences section) **and** `docs/canon/identity/data-model.md` §2B.1 both assert `consent_request` ships named service-role RLS policy exceptions; verified FALSE against migrations/code (owner-role connection bypasses RLS; no `app_user` role switch has landed). Correction drafted at `_wip/identity-foundation/2026-06-15-wi-780-consent-request-rls-service-role-branch-decision.md:1-116` but explicitly "routed to WI-752 ... not applied here" | **multi-source-divergent** (an Accepted ADR + its lockstep canon partner vs. code reality) | **MUST** | PASS — trigger 1 is the whole point (this is a live ADR-provenance/accuracy defect) | **YES — see §3 annex #8** (is this a *new* census decision, or purely a correction to route through WI-752 — not a fresh ADR at all?) |

### 2B · The `ARCH-N` legacy register — disposition (Part III), not counted in the ~70

Per `MMT-ADR-0000` Part III, every `ARCH-N` owes a terminal disposition: **Promote →
ADR** / **Obsolete → tombstone** / **Plain wrong → resolve by which side lies** /
**Never-a-decision → drop**. Full register read at `docs/specs/epics.md:312-341`.

| ARCH-N | Content (abbreviated) | Disposition |
|---|---|---|
| ARCH-1 | Fork starter template, strip Supabase/Next/Express, rebuild DB package | **Drop** — one-time bootstrap fact, never-a-decision |
| ARCH-2 | Nx 22.5.0 + pnpm + `@naxodev/nx-cloudflare` for Workers | **Promote → ADR (reconstruction)**, single-canon, foundational (trigger 5) |
| ARCH-3 | GitHub Actions CI/CD pipeline (lint→typecheck→test→build→deploy) | **Plain wrong — ambiguous form.** The doc's own "Known drift" note: code (`packages/database/src/utils/uuid.ts`) cites `ARCH-3` for **UUID v7**, but the definition here is CI/CD. Neither of Part III's two "plain wrong" resolutions (doc-wrong/code-right, code-wrong/doc-right) cleanly fits — this looks like a **mislabeled code citation** (comment points at the wrong ID), not a factual error on either side. See §3 annex #9. |
| ARCH-4 | Husky+lint-staged+commitlint from forked repo | **Drop** — mechanical tooling inheritance |
| ARCH-5 | Neon branching dev/staging, no local Postgres | **Promote → ADR** or NICE-tombstone; stable/uncontested — borderline on whether it's worth the ADR at all |
| ARCH-6 | Typed config object (`config.ts`), Zod-validated, never raw `process.env` | Multi-source-consistent with `AGENTS.md` (eslint G4-enforced) — **Promote → ADR** or fold into principles catalog |
| ARCH-7 | Scoped repository pattern (`createScopedRepository(profileId)`) | **Already annotated "stands"** (profile_id→person_id migration noted); multi-source-consistent (`epics.md`+`AGENTS.md`+`architecture.md`) — **high-priority Promote → ADR**, arguably the single most load-bearing undocumented-as-ADR pattern in the repo |
| ARCH-8 | `routeAndCall()` LLM orchestration | **Already covered** — promoted to `MMT-ADR-0018` |
| ARCH-9 | Model routing by rung | **Already covered** — superseded by `MMT-ADR-0014`/`0016` |
| ARCH-10 | SM-2 as pure math library | **NICE** — stable, uncontested, tombstone-or-light-ADR |
| ARCH-11 | Workers KV → DB-backed cache (`home_surface_cache`), doc self-flags "conscious adaptation" | **Promote → ADR** — constrains cache-invalidation pattern going forward |
| ARCH-12 | SSE streaming via Hono `streamSSE()`, interface for future Durable Objects migration | **Promote → ADR** |
| ARCH-13 | Inngest for all durable async; event naming `app/{domain}.{action}`; payloads always include `profileId`+`timestamp` | Multi-source-consistent (`epics.md`+`AGENTS.md`+`architecture.md`) — **high-priority Promote → ADR**; directly cross-references Known Exception #27 (row 27) | 
| ARCH-14 | ML Kit on-device OCR primary, server fallback | **Already covered** — `MMT-ADR-0006` |
| ARCH-15 | Hono RPC for end-to-end type safety (`AppType`) | **Promote → ADR** — cross-references Known Exception #24 (row 24) |
| ARCH-16 | pgvector for per-user memory embeddings | **Promote → ADR** — now resolved by row 37 (Voyage AI selection) |
| ARCH-17 | Two-layer rate limiting (Cloudflare + quota metering) | **Promote → ADR** — cross-references row 15 (pricing_dual_cap) |
| ARCH-18 | Centralized push via `services/notifications.ts` | **NICE** |
| ARCH-19 | "13 enforcement rules for AI agent consistency" | **Drop/fold into principles catalog** — this is an index pointer, not itself a decision; likely the seed of S2-03/S2-04's principles-catalog work |
| ARCH-20 | Typed error envelope (`ApiErrorSchema`) | Multi-source-consistent with `AGENTS.md` § UX Resilience Rules — **Promote → ADR** |
| ARCH-21 | Co-located tests, no `__tests__/` dirs | **Tombstone/mechanical** — fails the gate (release valve: local, reversible, no reader asks why) |
| ARCH-22 | `packages/factory/` test data | **Tombstone/mechanical** |
| ARCH-23 | `packages/test-utils/` shared mocks | **Tombstone/mechanical** |
| ARCH-24 | E2E testing spike (Detox or Maestro) during Epic 2 | **Tombstone — obsolete/superseded by reality** (Maestro was chosen; `e2e`/`maestro-testing` skills exist) |
| ARCH-25 | Inngest lifecycle chain integration test during Epic 3 | **Tombstone — obsolete/superseded by reality** (Epic 3 long done) |
| ARCH-26 | Observability from day one: Axiom (`logger.ts`) + Sentry (`sentry.ts`) | **Promote → ADR** |

## 3 · Borderline annex (feeds D2)

Nine close calls, each with the competing readings and a recommendation. These are
recommendations, not rulings — D2 is the operator's gate.

**1. `project_llm_source_provenance` (census row 3) — own ADR for the 0.88 gate, or part of a broader envelope-contract ADR?**
Reading A: the `0.88` general-knowledge confidence threshold is a specific, tunable
parameter — more registry data (like the LLM-models register) than an architectural
decision, and doesn't need its own ADR separate from the envelope contract.
Reading B: the threshold is safety/accuracy-load-bearing (it's the line between
"answer from general knowledge" and "ask for a source"), was explicitly tuned against
observed failures (tripwire examples in the memory file), and the task brief itself
flags it as the seed case for this question. **Recommendation:** one ADR for the
envelope contract (`private_sources`/`sourceAudit` shape, trigger 2), with the `0.88`
threshold as a cited parameter inside it rather than a second ADR — matching how
per-tier/per-rung model names live in `docs/registers/llm-models/` rather than in
`MMT-ADR-0014` itself.

**2. `project_brand_dark_first` (census rows 5, 40) — brand theming: its own ADR, or a plain canon section?**
Reading A: brand color choice is a "local, reversible" design pick — release-valve
territory, belongs as a canon section in `ux-design-specification.md`, not an ADR.
Reading B: the census sweep found a genuine, unresolved 3-way contradiction (memory
says no picker; `architecture.md` implies one fixed palette; `ux-design-specification.md`
+ live code (`design-tokens.ts`) show five shipped accent presets) — this is not a
styling question, it's a **live fact dispute about what the product currently does**,
which is exactly what an ADR's "Context" section exists to settle once and for all.
**Recommendation:** this needs resolution *before* it can be MoSCoW'd at all — someone
must first determine whether the 5-preset picker is (a) shipped and intentional (in
which case `project_brand_dark_first.md` and `architecture.md` are simply stale and the
census row is a tombstone-with-correction), or (b) a stray unshipped/dead feature (in
which case the memory's "no picker" framing is correct and the code is the anomaly).
Recommend a code-verification WI ahead of drafting any ADR.

**3. `feedback_no_jargon_kid_language` (census row 21) — does a copy-tone guideline even clear the significance gate?**
Reading A: FAIL — this is a writing/tone guideline ("prefer verbs over nouns"), local
and reversible per-string, the release valve applies cleanly.
Reading B: PASS under trigger 1 — it is a named, repeatedly-reaffirmed principle
(`last_confirmed: 2026-06-11, WI-587`) that would deviate if violated, same class as
`feedback_quiet_defaults_over_friction` (row 13) which this census does classify MUST.
**Recommendation:** NICE at most, likely belongs in the UX design spec's voice/copy
section as prose rather than an ADR — but flagging the tension since the same
"repeatedly reaffirmed principle" logic produced a MUST verdict two rows earlier.

**4. Clerk-js web3-dependency footprint (census row 25) — is a verified non-issue a "decision" at all?**
Reading A: nothing was chosen; this is an audit finding ("we checked, it's fine"),
structurally different from every other Known Exception, which are all *deliberate,
ongoing deviations*. Should not be in the census.
Reading B: it is still a documented, load-bearing conclusion that future contributors
might otherwise "fix" by mistake (the note explicitly warns against attempting removal)
— arguably that's exactly what canon prose is for, ADR or not.
**Recommendation:** SKIP as a census row proper — keep as canon prose (already is, in
`AGENTS.md`), no ADR needed; it fails trigger 1 because nothing deviates, it documents
why an apparent deviation is not one.

**5. Consumer Family Compliance Boundary (census row 36) — overlap with `MMT-ADR-0002`?**
`MMT-ADR-0002` is titled "payer-capacity-store-delegated" — about the payer/capacity
model, not explicitly about tier-based compliance gating. This census pass did not do a
full-text read of `MMT-ADR-0002` to confirm zero overlap (time-boxed). **Recommendation:**
verify before drafting a new ADR — if `MMT-ADR-0002` already states "tier never gates
consent/safety," this row folds into a canon-promotion of that ADR's existing rule
rather than a fresh one.

**6. Crisis-disclosure no-guardian-notification, `se-032` (census row 53) — MUST override?**
The strict MoSCoW rule (multi-source-divergent → MUST; single-canon → SHOULD) currently
resolves this to SHOULD, because as of the census date it lives in exactly one place
(`MVP-DEFINITION.md`) and disagreement was resolved 4 days before this census was
written. But: it is safety-critical (guardian-may-be-abuser failure mode), was
*actively re-litigated twice* (2026-07-07 then 2026-07-10), and getting it wrong in
either direction has real-world consequences for a minor in crisis. **Recommendation:**
override to MUST on consequence grounds — recency of resolution is not the same as
low stakes.

**7. Age-floor/launch-posture ruling (census row 54) — the single strongest override case in this census.**
Four independent, mutually-consistent, non-ADR documents (two meeting docs, the
compliance register, and the most recent MVP-definition ruling) all state the same
13+/guardian-16/country-allowlist/LLM-provider-exclusion posture, and every one of them
explicitly says "this should become an ADR." The strict rule calls this SHOULD (it's
multi-source-*consistent*, not divergent). But this decision (a) sets the entire
under-13 compliance surface, (b) is stated by its own source document to be
**one-way reversible** ("raising the floor after launch means expelling enrolled
children"), and (c) gates LLM-provider selection for every minor user. **Recommendation:**
this is the strongest candidate in the whole census for amending the MoSCoW heuristic
itself — propose a tie-break clause: *"multi-source-consistent + self-flagged
ADR-candidate + irreversible consequence ⇒ MUST,"* rather than treating consistency
across sources as evidence of low urgency. Also stale-`CLAUDE.md`-constraint cleanup
("Strictly 11+") should ride the same change-set per the launch-posture brief's own
instruction.

**8. `consent_request` RLS doc-correction (census row 58) — new decision, or pure bug-fix?**
Reading A: this is not a fresh architectural choice; it is an accuracy defect in an
*existing* Accepted ADR (`MMT-ADR-0020`) and its lockstep canon partner
(`data-model.md`) — the fix is a correction commit (already scoped as WI-752), not a
new `MMT-ADR-NNNN`.
Reading B: MMT-ADR-0000's own immutability rule is suspended pre-live (§II.1 pre-live
override — "ADRs are edited in place"), so the correct mechanism actually is to edit
`MMT-ADR-0020` in place under the pre-live carve-out, which makes this squarely a
census-tracked drain item (someone needs to *do* the edit), just not a brand-new ADR
number.
**Recommendation:** disposition = **correct MMT-ADR-0020 in place** (per the pre-live
override already in effect) + update `data-model.md` §2B.1 in the same change-set —
tracked as a drain action, not scored as a new MUST/SHOULD/NICE row in the normal
sense.

**9. `ARCH-3` "plain wrong" citation (§2B) — how does Part III's binary resolution apply to a mislabeled pointer?**
Part III only names two "plain wrong" resolutions: doc-wrong/code-right (write an ADR
documenting reality, mark `corrected-by`) or code-wrong (file a bug, tombstone as
`retracted → WI-XXX`). Neither fits cleanly: the CI/CD description under `ARCH-3` is
accurate on its own terms, and the UUID-v7 code comment isn't describing "unbuilt
behaviour" — it's simply citing the wrong `ARCH-N` number. **Recommendation:** treat as
a third, unnamed Part III case ("wrong pointer, both sides individually correct") —
disposition: promote `ARCH-3` (CI/CD) to its own ADR-or-tombstone on its own merits,
and separately file a doc-hygiene bug to repoint (or simply remove) the stale
`uuid.ts` comment. Recommend `MMT-ADR-0000` Part III be amended to name this third case
explicitly, since it will likely recur as the rest of the register drains.

## 4 · Counts

**Main census (§2A): 58 rows.**

| MoSCoW (proposed, strict rule applied literally) | Count | Rows |
|---|---|---|
| MUST | 19 | 1,2,3,4,5,8,9,10,12,13,15,18,19,29,40,41,44,57,58 |
| SHOULD | 31 | 11,14,16,17,20,24,26,27,28,30,31,32,33,34,35,36,37,38,39,42,45,46,47,48,49,50,52,53,54,55,56 |
| NICE | 4 | 21,25,43,51 |
| SKIP/tombstone | 4 | 6,7,22,23 |

19+31+4+4 = 58, reconciling exactly with §2A.

*Note on rows 53 and 54:* both are tabled at **SHOULD** above per the strict mechanical
rule (single-canon / multi-source-consistent), but §3 (annex #6, #7) recommends
**MUST overrides** for both on consequence grounds (safety-critical crisis-disclosure
policy; irreversible age-floor/launch-posture ruling). If the operator accepts both
overrides at D2, the working count becomes **MUST 21 / SHOULD 29**, everything else
unchanged. Rows 21 and 25 are similarly tabled at NICE but flagged borderline in §3
(annex #3, #4) as potentially not clearing the significance gate at all.

**Drift-class counts (58 rows, one tag per row, reconciling exactly against §2A):**

| Drift class | Count | Rows |
|---|---|---|
| memory-only | 12 | 1,3,4,8,9,10,12,13,18,19,21,23 |
| multi-source-divergent | 9 | 2,5,15,29,40,41,44,57,58 |
| multi-source-consistent | 1 | 54 |
| single-canon | 36 | 6,7,11,14,16,17,20,22,24,25,26,27,28,30,31,32,33,34,35,36,37,38,39,42,43,45,46,47,48,49,50,51,52,53,55,56 |

12+9+1+36 = 58. Note that only **one row (54, the age-floor/launch-posture ruling)
qualifies as genuinely multi-source-consistent** in the strict sense of "≥2
independent, non-single-canon documents agree" — most seemingly-reinforced rows (11,
14, 20, 37) are tagged single-canon because the "second source" is a memory pointer
or an internal restatement within the same canon document, not an independent second
canon location. This scarcity is itself evidence for annex #7's recommendation: a
multi-source-consistent, self-flagged, irreversible decision is rare enough that
finding one should raise its priority, not lower it.

**The ~70 reconciliation.** This census found **58 main rows**, materially fewer than
the "~70" the home doc estimated. Reasons, stated plainly rather than padded:

1. **`ARCH-N` (26 entries) is counted separately** (§2B), per `stream-2-backlog.md`'s
   own framing of "the ~70-decision ADR backfill" and "the `ARCH-N` drain" as two
   distinct inventory bullets. Of those 26, roughly **13** have a "Promote → ADR"
   disposition (ARCH-2,5,6,7,11,12,13,15,16,17,20,26, plus ARCH-3's CI/CD half) — if
   folded into the main count, the total rises to **~71**, matching the estimate almost
   exactly.
2. **Two sibling legacy registers were discovered but not exhaustively triaged**
   (time-boxed): `UX-1..19` (`docs/specs/epics.md:346-364`) and `AD1..7`
   (`docs/specs/epics.md:3213-3220`, Epic-7 self-building-library architecture
   decisions). These were not named in `MMT-ADR-0000` Part III and are flagged as a
   gap in §6, not folded in here — they would likely add another handful of rows
   (at minimum `UX-4` the Socratic Escalation Ladder, `UX-6`/`UX-10` already flagged
   as divergent/superseded, and `UX-17`/`UX-18`).
3. Several found candidates were **batched rather than split** for honesty of
   evidence (row 42's 9-item UX-decisions bundle; row 15's pricing invariants) rather
   than inflated into individual rows without individual verification.

**Bottom line:** 58 rows are individually verified and citation-backed. The
~70 estimate is credible and likely realized once `ARCH-N`'s ~13 promote-worthy
entries and a `UX-N`/`AD-N` follow-up sweep are folded in — but this document does not
assert that reconciliation as fact, only as a plausible accounting.

## 5 · Gaps / caveats

- **`.claude/memory/_archive/` (29 files) was not individually read.** MEMORY.md's own
  index describes it as "Resolved/historical memories (implementation-phase,
  expo-router pollution, CR-124, Epic-15 review, web-flow bugs)." This was taken at
  face value by analogy to the task brief's treatment of `docs/_archive/` generally
  (ignore except for supersession notes). If a live decision is hiding in there
  unrecognized, it is a gap in this sweep, not a confirmed absence.
- **`UX-1..19`** (`docs/specs/epics.md:346-364`) and **`AD1..7`** (`docs/specs/epics.md:3213-3220`)
  are two more frozen legacy decision registers, structurally identical to `ARCH-N`,
  that `MMT-ADR-0000` Part III does not name. They need the same disposition
  treatment. Notable items already spotted in passing: `UX-6` (three-persona theming)
  and `UX-10` (session hard caps, self-flagged superseded) are the *other side* of the
  brand-theming and session-lifecycle divergences already censused at rows 5/40 and 9
  respectively — cross-reference them when `UX-N` gets its own pass. `AD4` ("no
  prerequisite infrastructure," Epic 7) is consistent with row 11 (`feedback_never_lock_topics`,
  WI-587) — likely multi-source-consistent once both are formally censused.
- **`project_agent_doc_and_memory_architecture_revisit.md`** is not a census row: Issue
  1 (AGENTS.md/CLAUDE.md split) is resolved (WI-386); Issue 2 (cross-agent memory
  architecture — should memory be runtime-neutral, how Cortex relates) is an **open
  question**, not yet a decision. Surfacing it here since it is directly this census's
  parent topic and the operator may want to fold its resolution into the Stream-2
  drain's own design.
- **Open/undecided compliance parameters, not census rows** (per `identity-compliance-register.md`
  "Locked product parameters" + "Open compliance threads"): moved-country grace
  window, exact retention periods, boundary-crossing verification vendor, co-guardian
  precedence rule (one-of/all-of — "the set shape is locked, the rule itself is legal,
  pending counsel" per `docs/canon/identity/domain-model.md:96`), VPC vendor selection.
  These are gaps to watch, not decisions to census — they become census rows the
  moment they're ruled.
- **The billing child-allocation data-model choice** (`docs/plans/2026-05-31-billing-recovery-learner-capacity.md:225-236`)
  is explicitly unresolved at time of writing (two named options, no ruling) — flagged,
  not censused.
- **Row 42's 9-item UX-decision bundle** and several `ARCH-N`/`UX-N` "Promote"
  dispositions were not cross-verified against current shipped code in this pass
  (time-boxed); treat their MoSCoW/gate verdicts as provisional pending a
  verification pass, distinct from the rows independently confirmed against live code
  or ≥2 canon documents.
- **`MMT-ADR-0002` full-text overlap check** (annex #5, row 36) was not completed —
  flagged rather than resolved.
- **`docs/meetings/minors-compliance-requirements.md`** was not read in this pass
  (time-boxed) — the age-floor/launch-posture cluster (row 54) was fully covered from
  its sibling documents, so this is unlikely to hide a *new* decision, but it was not
  directly checked.
- **Sealed quarantine respected throughout** — `docs/_archive/parallel-adr-audit-2026-06-03/`
  was never opened by this agent or by any of its three research passes; all three
  passes were explicitly instructed not to open it and confirmed they had not.
