# Architecture Deepening Audit — 2026-05-29

Output of the `/improve-codebase-architecture` skill. The aim is **deepening
opportunities**: refactors that turn *shallow* modules (interface nearly as complex as
implementation) into *deep* ones (a lot of behaviour behind a small interface), for the
sake of **testability** and **AI-navigability**.

Vocabulary used below: **module** (interface + implementation), **interface** (everything
a caller must know — types, invariants, ordering, error modes), **depth** (leverage at
the interface), **seam** (where the interface lives), **leverage** (what callers gain),
**locality** (bugs/knowledge/change concentrated in one place), **deletion test** (delete
the module — if complexity *vanishes* it was a pass-through; if it *reappears across N
callers* it was earning its keep → deepen/consolidate). Domain nouns follow the root
[`CONTEXT.md`](../../CONTEXT.md) glossary created alongside this audit.

## Method

- Read the domain glossary (`CONTEXT.md`, mined this session) and confirmed there are
  **no ADRs** (`docs/adr/` absent) and no conflicting decisions in `docs/architecture.md`
  or `docs/PRD.md` — those operate above this altitude.
- Walked three territories with read-only `Explore` agents: the API tutoring engine
  (`apps/api/src/services/`), mobile navigation/profile (`apps/mobile/src/`), and the
  route/service/schema seams (`apps/api/src/routes/`, `inngest/`, `packages/schemas/`).
- Findings deduplicated below. **⚑⚑ = independently surfaced by two agents** (higher
  confidence the friction is real).

## Status

Analysis only — no code changed. Candidates await selection for the design grilling loop.
Recommended starting set: **#1, #2, #3, #5** (sharp, contained; #3 and #5 also close
latent bugs), plus **#6** (highest-leverage mobile, rides the in-flight V1 nav migration).

---

## Tier 1 — Sharp, contained, high-confidence

### 1. Challenge Round mastery decision smeared across four modules

- **Files:** `apps/api/src/services/challenge-round/evaluation.ts` (`decideMasteryAndReview`),
  `challenge-round/state.ts` (`transitionChallengeState`), `challenge-round/route-actions.ts`,
  and the durable writes at `apps/api/src/services/session/session-exchange.ts:667–824`
  (`persistChallengeRoundMasteryEvidence`, the `assessments` insert, the Needs-Deepening
  upsert, `finalizeChallengeRoundIfReady`).
- **Problem (no locality / scattered state):** Answering "how does a **Challenge Round**
  reach **Mastery**?" requires four files. The pure decision and the state transition live
  in `challenge-round/`, but the side effects that make mastery durable sit ~700 lines deep
  inside a different module. The mastery write and the state write are coupled only by file
  position — no type asserts they happen together. Domain-critical (server-owned,
  conservative; mastery only when every concept is `solid`).
- **Deletion test:** Delete `finalizeChallengeRoundIfReady` → the assessment insert,
  needs-deepening upsert, validated-draft construction, and state transitions scatter back
  into `applyChallengeRoundRuntimeSignals`. Concentrates → deepen.
- **Solution:** A deep `challenge-round/finalize.ts` with one interface —
  `finalizeChallengeRound(db, profileId, session, round, noteDraft) → ChallengeRoundFinalResult`
  — owning evaluation, both persistence steps, and the completion transition.
- **Benefits:** All round end-state knowledge local to `challenge-round/`; mastery/needs-
  deepening routing becomes testable without driving a full exchange through the DB.

### 2. ⚑⚑ `session.completed` dispatch stranded in the route, gated three ways

- **Files:** `apps/api/src/routes/sessions.ts:1547–1612` (`dispatchSessionCompletedEvent`,
  a ~70-line async fn in the route), called from `/close` (1219–1244), `/summary/skip`
  (1366–1392), `/summary` (1420–1442) with three non-identical predicates; plus
  `qualityRatingFromSummaryStatus` (1502–1506) encoding a business rule inline.
- **Problem (shallow route / no locality):** "Should we advance the pipeline?" is
  re-evaluated in three handlers with subtly different conditions. Adding a **Session
  Summary** status means auditing three closures. The dispatch owns the core-send protocol
  + Sentry capture but is invisible to the service layer and untestable without importing
  the route.
- **Deletion test:** Delete the helper → the `app/session.completed` dispatch reappears
  inline in three handler closures. Concentrates → deepen.
- **Solution:** `advanceSessionPipeline(db, profileId, sessionId, opts)` in the service
  layer (alongside `session-filing-dispatch.ts`), called internally by
  `closeSession`/`skipSummary`/`submitSummary`. Handlers shrink to `c.json(await closeSession(...))`.
- **Benefits:** One predicate, one place; handlers satisfy the G1/G5 "logic in services"
  rule; the dispatch decision gains a unit-test surface.

### 3. ⚑⚑ Retry-filing duplicated across two handlers — cap already drifted

- **Files:** `apps/api/src/routes/sessions.ts:288–357` (`/retry-filing`, uses
  `FILING_CONFIG.maxRetries`) vs `apps/api/src/routes/filing.ts:61–114`
  (`/filing/request-retry`, **hardcodes `3`** at line 94). The freeform-vs-curriculum
  branch (sessions.ts:299–319) exists in one copy only.
- **Problem (leaky seam, live bug):** Two handlers re-implement the same three-phase
  **Filing** retry (ownership check → `claimSessionForFilingRetry` CAS → Inngest dispatch).
  The cap value has *already diverged* between the two — the deletion-test failure mode is
  in production.
- **Deletion test:** Delete one handler → that endpoint's specific guard (rate limit, mode
  branch) vanishes. The drift between `FILING_CONFIG.maxRetries` and literal `3` is the
  concrete bug.
- **Solution:** One service fn `requestFilingRetry(db, profileId, sessionId) → RetryFilingResult`
  in `session-filing-dispatch.ts` owning the cap, mode branch, and dispatch. Both routes call it.
- **Benefits:** Cap and eligibility live once; the drift bug closes as a side effect.

### 4. Profile-context resolution — a leaky seam repeated ~20 times

- **Files:** five inline `db.select(...).from(profiles)` projections in
  `apps/api/src/inngest/functions/session-completed.ts` (lines 1017/1075/1167/1262/1690),
  plus `parseConversationLanguage(row?.conversationLanguage)` at 15+ sites across
  `routes/sessions.ts`, `subjects.ts`, `assessments.ts`, `book-suggestions.ts`,
  `dictation.ts`, and several Inngest fns — despite `services/profile.ts` already exposing
  `loadProfileRowById` / `getProfileAgeBracket`.
- **Problem (re-implemented invariant):** Every site needing a learner's `birthYear`,
  `displayName`, or **Conversation Language** must know which columns to read *and* remember
  the `string | null → ConversationLanguage` parse. ~20 callers re-implement a data-access
  discipline.
- **Deletion test:** Delete `parseConversationLanguage` at any site → that LLM call gets the
  raw `string | null` (type error or silent wrong-language call). Concentrates → deepen.
- **Solution:** One deep `getProfileContext(db, profileId) → { displayName, birthYear,
  conversationLanguage, ageBracket }` (parse done inside). Callers thread the plain object;
  `session-completed` calls it once at the top of the function body.
- **Benefits:** The parse becomes invisible behind the seam; a column change touches one
  module; removes a class of "forgot to parse → silent wrong-language LLM call."

### 5. `loadTopicTitle` defined twice with divergent ownership joins (correctness risk)

- **Files:** `apps/api/src/inngest/functions/session-completed.ts:90–110` (3-table join via
  `subjects.profileId`) vs `apps/api/src/services/assessments.ts:758–764` (delegates to the
  canonical `findOwnedCurriculumTopic` 4-table join in
  `services/curriculum-topic-ownership.ts`).
- **Problem (seam redundancy with teeth):** Same name, same signature, *different* ownership
  semantics. The `session-completed` copy can return a **Topic** title that the canonical
  ownership check would reject — a cross-**Profile** leak hiding in a duplicate.
- **Deletion test:** Delete the copy → complexity reappears only as an import. The duplicate
  earns nothing; the delegating version is correct.
- **Solution:** Delete the `session-completed` copy; import `findOwnedCurriculumTopic`.
  (Smallest fix here; near-zero design.)
- **Benefits:** One ownership check, zero drift, closes the leak.

---

## Tier 2 — Mobile; on-trajectory with the V1 navigation-contract migration

These are facets of one thesis: **make `resolveNavigationContract` the single deep
interface for "who sees what."** All respect the hard constraint that the V0 5-tab
production nav must not regress (V0 and V1 paths coexist).

### 6. V0/V1 entry-gating copy-pasted across 8 screen layouts + `progress`

- **Files:** identical `blocked = MODE_NAV_V1_ENABLED ? !contract.canEnter(...) :
  contract.isParentProxy` in `app/(app)/session/_layout.tsx:17–19`,
  `practice/index.tsx:444–446`, `topic/relearn.tsx:374–378`, `dictation/_layout.tsx:67–69`,
  `homework/_layout.tsx:12–14`, `mentor-memory.tsx:248–250`, `quiz/_layout.tsx:121–123`;
  plus five inline triples in `progress/index.tsx:77–85,345,506`.
- **Problem (smeared gating):** The same policy decision re-derived 8+ times; the V0
  **Parent Proxy** edge case is not represented in the contract interface at all.
- **Deletion test:** Delete the eight expressions → complexity reappears at all eight.
  Strong consolidation signal (blast radius = 9 files).
- **Solution:** Push the V0 proxy fallback *inside* `canEnter(route)` (navigation-contract.ts:394)
  so it handles both flag paths. Screens become `const blocked = !contract.canEnter('session')`.
- **Benefits:** One gating brain; screens stop importing feature flags.

### 7. Home surface chosen in two places, kept correct only by a magic prop

- **Files:** `app/(app)/home.tsx:161–169` branches on `navigationContract.home.screen`;
  `components/home/LearnerScreen.tsx:492–493` *re-branches* and can mount `<ParentHomeScreen>`
  itself — suppressed only because callers pass `showParentHome={false}`
  (`home.tsx`, `own-learning.tsx:39–44`).
- **Problem (leaky seam):** A caller must know an implementation secret to stop the child
  from overriding a decision already made. Two callers carry the invariant.
- **Deletion test:** Delete the internal branch + `showParentHome` prop → the contract
  decision in `home.tsx` still works, but the double-render risk reappears at any future
  caller that mounts `LearnerScreen`.
- **Solution:** `home.tsx` owns the exclusive branch; `LearnerScreen` drops `showParentHome`
  and becomes a terminal learner surface.
- **Benefits:** One routing decision; no future caller can double-render the family home.

### 8. Error classification bypassed in 6 screens

- **Files:** `classifyApiError` in `lib/format-api-error.ts:695–750` is the intended single
  classifier, but `progress/index.tsx:235`, `progress/saved.tsx:137,225`,
  `dictation/complete.tsx:258,305`, `session/index.tsx:643`, `create-subject.tsx:94` re-derive
  via `instanceof Error ? err.message` or import typed error classes to branch themselves.
- **Problem:** Violates the stated UX-Resilience rule ("classify at the API-client boundary;
  screens never parse status/codes"). Raw technical messages can reach users.
- **Deletion test:** Delete the `instanceof Error ? err.message` patterns → raw technical
  messages surface to users (the exact failure the classifier prevents). Concentrates.
- **Solution:** A thin `useErrorMessage(error) → string` over `classifyApiError`, made the
  only approved pattern; screens switch on `classifyApiError(e).category`, no typed-error
  imports in screen files.
- **Benefits:** Classification lives at one seam; the existing rule becomes enforceable.

---

## Tier 3 — Bigger surgery (flagged, not yet recommended)

### 9. SSE stream route owns the quota-refund policy in five places

- **Files:** `apps/api/src/routes/sessions.ts` — `safeRefundQuota` at ~514/800/895/1007/1162,
  each re-assembling `quotaDecrementSource`/`quotaModel`/`topUpCreditId`; the
  `[CR-2026-05-19-C6]` warning comment is copy-pasted at each. Plus three inline
  fallback-to-`processMessage` reconstructions (727–769, 940–947, 1087–1131).
- **Problem (leaky seam):** "Never charge for a failed **Exchange**" is a discipline the
  route re-implements per error path. Entangled with the streaming lifecycle.
- **Solution:** Assemble a `QuotaRefundContext` once in middleware; let
  `processMessage`/`streamMessage` own refund-on-error internally.

### 10. `session-exchange.ts` — a 3,322-line module with a clean interface but no internal seams

- **Files:** `apps/api/src/services/session/session-exchange.ts` — escalation rung
  resolution (215–274), Challenge Round runtime (453–984), continuation-opener (2094–2131),
  mastery persistence (667–776), the 500-line `prepareExchangeContext` (1404–2388),
  `persistExchangeResult` (2390–2742), `processMessage` (2748–2983), `streamMessage`
  (2989–3321) — all in one file. The **Escalation Rung** decision is also split between
  `escalation.ts:63–163` and the event-scan caller at `session-exchange.ts:1916–1977`.
- **Problem:** Any bug in mastery/escalation/opener means reading the whole file; everything
  tests as integration. Candidates 1 and the Escalation extraction are the cleanest first
  slices to carve out.

### 11. `createScopedRepository` vs parent-chain joins — two adapters, one concern ⚠️ revisits a CLAUDE.md rule

- **Files:** scoped-repo sites (`services/retention-data.ts:251,351,492,…`) vs parent-chain
  joins (`services/session/session-topic.ts:21`, `session-book.ts:31–43`,
  `session-subject.ts:19–44`); four Inngest fns carry "rules do NOT apply here" exception
  comments (`filing-stranded-backfill.ts`, `daily-reminder-scan.ts`, `monthly-report-cron.ts`,
  `weekly-progress-push.ts`).
- **Problem:** "Authorized data access" has two interfaces and the choice is a per-author
  decision. A `createAuthorizedDataContext(db, profileId)` exposing both (`.scoped` /
  `.owned(topicId)`) would deepen it — **but this directly revisits the stated two-pattern
  rule in `CLAUDE.md`.** Worth reopening *only* if scoping must evolve (e.g. a tenant
  dimension beyond `profileId`); otherwise the split is deliberate and working. Record an
  ADR before touching it.
