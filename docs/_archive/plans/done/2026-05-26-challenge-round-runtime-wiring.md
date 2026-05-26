# Challenge Round Runtime Wiring Plan

> **Archived 2026-05-26.** All five phases (0-5) landed across PRs #476-#479
> behind `CHALLENGE_ROUND_RUNTIME_ENABLED=false` (typed config flag at
> `apps/api/src/config.ts:133`). The "Done Definition" at the bottom of this
> doc is met — a real production exchange can move offer → accept → active →
> draft/close with server-owned mastery/review persistence and typed mobile
> rendering. Cutover is a Doppler flag flip. Code-verified mapping of every
> row of the status table below: each item the table marked ❌ now has a
> production caller; the bottom of `apps/api/src/services/session/session-exchange.ts`
> (`finalizeChallengeRoundIfReady`, `persistChallengeRoundMasteryEvidence`,
> `persistChallengeRoundReviewTargets`, `applyChallengeRoundRuntimeSignals`),
> `apps/mobile/src/lib/sse.ts:94-98` (typed SSE fields), and
> `apps/mobile/src/app/(app)/session/index.tsx:61-84, 632, 1125-1142` (mobile
> rendering) close the loop end-to-end. `resolveMasteryVerificationState()`
> exists at `apps/api/src/services/challenge-round/verification.ts:56` and is
> integrated into the progress read site at `apps/api/src/services/progress.ts:420, 1316`.
> One minor open seam — `apps/api/src/services/notes.ts:238-242` notes
> `validateNoteDraft` is enforced in the CR pipeline but not on the generic
> notes-API entry — is out of scope for this plan and tracked separately.
>
> **The status block and "Current State" table immediately below are the
> 2026-05-26 pre-merge snapshot and are stale.** Kept verbatim for audit
> context.

> **Status (2026-05-26):** PR #458 (merged from branch `tier-rework`, despite
> the misleading name) landed **Phase 0 + Phase 1 + Phase 2 only**. The plan's
> stated blocker — "LLM can be prompted, but the server ignores the signals" —
> is still substantially true for the in-session signals
> (`challenge_round_offer`, `challenge_round_evaluation`, `ui_hints.note_draft`).
> Phases 3-5 are split below into two follow-up PRs (A + B). The original
> 2026-05-25 status note kept for audit context:
>
> > Supersedes the original 2026-05-18 target-decision memo. The old doc
> > correctly chose several storage and routing targets, but its resume
> > instructions are stale. The current blocker is **L15-001** from
> > `docs/audit/2026-05-25-full-codebase-review.md`: Challenge Round code
> > exists, but the runtime pipeline is not wired end to end.

## Current State (verified 2026-05-26 against `origin/main`)

| Plan item | Status | Evidence |
|---|---|---|
| Envelope parsing of offer/evaluation/noteDraft | ✅ landed | `services/exchanges.ts:1689-1691`, `EMPTY_PARSED_ENVELOPE:1498-1500` |
| `prepareExchangeContext()` sets `challengeEligible` + `challengeRound` | ✅ landed | `session-exchange.ts:1824-1825`, schema read at `:1436-1439` |
| `challengeOfferPrompt` injection (state-gated) | ✅ landed | `exchange-prompts.ts:1186-1195` |
| Routing-only rung-4 floor for `accepted\|active\|drafting` | ✅ landed | `session-exchange.ts:246-251` |
| `/v1/challenge-round/{accept,decline,abort}` routes | ✅ landed | `routes/challenge-round.ts:22-64`, registered at `index.ts:90, 290` |
| `transitionChallengeState` for manual events (accept/decline/abort) | ✅ called | `services/challenge-round/route-actions.ts:71` |
| `promotePendingDeepening` + Inngest expiry cron | ✅ landed | `services/needs-deepening/promotion.ts`, `inngest/functions/needs-deepening-expire-pending.ts` |
| `CHALLENGE_ROUND_RUNTIME_ENABLED` flag | ❌ **missing** | zero matches across `apps/` |
| `decideMasteryAndReview()` | ❌ only called in `evaluation.test.ts` |
| `validateEvaluationEventIds()` | ❌ only called in `evaluation.test.ts` |
| `validateNoteDraft()` | ❌ only called in `note-draft.test.ts` |
| `transitionChallengeState` for in-session `answer_complete` / `draft_ready` / `complete` | ❌ never called from `session-exchange.ts` |
| Consumption of `parsed.challengeRoundOffer` / `Evaluation` / `noteDraft` after the envelope is parsed | ❌ persisted to `ai_response.metadata` via `behavioral` only; no transition triggered |
| Mastery-row insert on all-solid | ❌ no production caller |
| `needs_deepening_topics.status='pending_review'` writes from CR drafting | ❌ no production caller |
| `challengeRoundVerdict` in `ai_response.metadata` | ❌ not constructed |
| SSE `StreamDoneEvent` typed CR fields | ❌ `lib/sse.ts` has zero matches for `challengeRound` / `challengeOffer` / `draftedNote` |
| Mobile components (`ChallengeOfferCard`, `ChallengeRoundBanner`, `DraftedNoteReview`, `use-challenge-round`) | ❌ files exist, but no screen imports them — `session/index.tsx` has zero references |
| `resolveMasteryVerificationState()` (read-side gating) | ❌ does not exist anywhere in `apps/` |

**Net:** Phases 0, 1 (minus the runtime flag), and 2 shipped. Phases 3, 4, and
5 are open. The "Done Definition" at the bottom of this plan is not yet met —
a real production exchange cannot move offer → accept → active → draft/close,
because no in-session LLM signal triggers a state transition.

## Follow-up PR Sequencing

The remaining work splits into two PRs. Both land with
`CHALLENGE_ROUND_RUNTIME_ENABLED=false`. The flag is the cutover point — PR A
makes the runtime real; PR B hardens the read side so flipping the flag is
safe.

| PR | Scope | Phases | Risk | Coordination |
|---|---|---|---|---|
| **A — `challenge-round-runtime-wiring`** | Runtime flag, in-session state machine, mastery + weak-spot persistence, SSE typed fields, mobile rendering, break tests | Phase 1 (flag only) + Phase 3 + Phase 4 | High (server hot path + new mobile UI) | Touches `apps/mobile/src/app/(app)/session/index.tsx`, which is also the target of `docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md` Phase B2 — see Coordination note below |
| **B — `challenge-round-rollout-readiness`** | `resolveMasteryVerificationState` at every read site, no-clinical-copy ratchet, `promotePendingDeepening` callsite verification, expiry-cron registration check, `project_context.md` update, then Doppler flag flip | Phase 5 | Medium (read-side surfacing across progress/recap/topic screens) | No overlap with telemetry plan |

### Coordination with telemetry-sweep-and-route-shrink Phase B2

PR A adds rendering and state plumbing to `apps/mobile/src/app/(app)/session/index.tsx`;
the telemetry plan's Phase B2 is mechanically shrinking that same file from
1,309 → 900 LOC. Real but tractable overlap. Lanes:

- If telemetry Phase B2 ships first: PR A imports CR components into the
  already-extracted, smaller `session/index.tsx`. Cleanest.
- If PR A ships first: telemetry Phase B2 Step 3 (header/chrome extraction)
  must absorb the new CR JSX when it moves out. Adds a small task to whoever
  executes B2.
- If they run in parallel: PR A confines its `session/index.tsx` edits to the
  render tree only and does **not** touch the constants the telemetry plan
  intends to extract — `endSessionButton`, `headerRight`, `subtitle`,
  `classifyErrorChip`, `topicHeaderStrip`, `skipWarmupChip`, `headerBelow`.
  Merge conflicts resolved manually.

PR A also edits `apps/mobile/src/components/session/use-session-streaming.ts`
to pass through new typed SSE done fields. The telemetry plan (line 253)
explicitly says **not** to extract `useSessionStreaming`; PR A's edits are
additive to the existing file and do not extract anything, so the two efforts
are compatible inside that file.

The rest of PR A (API server work + `lib/sse.ts` + `hooks/use-challenge-round.ts`)
is outside the telemetry plan's scope and has zero overlap.

---

_The remainder of this document is the original implementation guidance from
2026-05-25 and is still the authoritative how-to for each phase._


## Current Reality

### Keep

- `assessments.mastery_challenge_verified_at` remains the mastery-verification
  persistence target. Do not create `topic_mastery_state` and do not store
  mastery state in `learningSessions.metadata`.
- `needs_deepening_topics` remains the durable target for partial /
  misconception follow-up. Do not create `review_targets`.
- `persistSessionMetadata(db, profileId, sessionId, partial)` is the canonical
  session-metadata helper. It exists in `apps/api/src/services/session/session-crud.ts`.
- Challenge Round LLM routing stays inside the commercial policy boundary.
  Accepted / active / drafting turns may apply a routing-only rung-4 floor via
  `llmRoutingRung`; Family standard remains Gemini-only and OpenAI remains rung
  5+ only.
- Notes are learner-reviewed before save. Server drafts may be shown, edited, or
  skipped, but server must not auto-save a note without learner action.

### Corrected Assumptions

- `persistSessionMetadata` and `llmRoutingRung` are no longer missing. Do not
  spend a PR on extracting them again.
- `docs/project_context.md` currently describes Challenge Round as if runtime
  wiring is live. Treat that section as optimistic until this plan lands.
- The real missing path is: envelope fields -> parsed exchange -> context gate
  -> state transition -> typed mobile affordance -> mastery/review/note/cooldown
  persistence.
- Product decision for the wiring PR: lower the Challenge Round absolute
  budget floor to `MIN_CHALLENGE_REMAINING_TURNS = 3`. The trigger tests cover
  both the under-floor rejection at 2 turns and eligibility at exactly 3 turns.
- The old cooldown matrix (4h decline, 24h close, 1h global) is not represented
  by the current schema. Keep the existing per-topic 24h decline cooldown for
  the wiring PR; expand cooldown semantics in a separate migration-backed PR.

### Runtime Blocker

`docs/audit/2026-05-25-full-codebase-review.md` records the blocker:

- `decideMasteryAndReview()` has no production caller.
- `validateEvaluationEventIds()` has no production caller.
- `validateNoteDraft()` has no production caller.
- `envelopeToParsedExchange()` drops `signals.challenge_round_offer`,
  `signals.challenge_round_evaluation`, and `ui_hints.note_draft`.
- `ExchangeContext.challengeEligible` and `ExchangeContext.challengeRound` are
  declared but not populated in production.
- `evaluateChallengeReadiness()` is not called from production.
- `/v1/challenge-round/*` routes are referenced by mobile but are not registered.

Net: the LLM can be prompted to emit Challenge Round signals, but the server
currently ignores them.

## Goal

Make the existing Challenge Round design real at runtime for the standard
LLM-offered path:

1. Server gates whether a round may be offered.
2. Mobile can accept, decline, or dismiss a server-created offer.
3. Accepted turns use the existing session exchange endpoint and voice/text
   plumbing.
4. Server consumes structured Challenge Round evaluation signals.
5. Server persists mastery only when every evaluated concept is solid.
6. Server persists partial/misconception follow-up rows before closing the round.
7. Server validates any drafted note before showing it to the learner.
8. Learner chooses Save, Edit & save, or Skip.

## Non-Goals For The First Wiring PR

- User-initiated "Challenge me" entry.
- Public/manual `maybe-offer` entry, including wiring the existing "Too easy"
  chip into Challenge Round creation.
- Advisory re-verification surfacing.
- Global cooldowns or the 4h/24h/1h cooldown matrix.
- Guardian progress UI.
- Provider-divergence dashboard.

These are valid follow-ups, but they should not block proving the core runtime
path. The first wiring PR should be big enough to be real and small enough to
review.

## Rollout Gate

The wiring PR may merge dark, but it must not become learner-visible until the
read/surfacing hardening in Phase 5 is complete. Add a typed API config flag,
`CHALLENGE_ROUND_RUNTIME_ENABLED`, defaulting to `false`. Prompt injection,
state transitions from LLM offer signals, and typed `challengeOffer` SSE fields
must all respect the flag. Mobile renders Challenge Round affordances only from
those typed server fields, so a disabled API flag means no learner-visible offer.
The flag may be flipped in Doppler only after the validation section passes.

## Implementation Plan

### Phase 0 - Lock The Contract

Update or add tests before wiring behavior:

- `packages/schemas/src/llm-envelope.test.ts`
  - Assert `challenge_round_offer`, `challenge_round_evaluation`, and
    `ui_hints.note_draft` parse and normalize.
- `apps/api/src/services/exchanges.test.ts`
  - Assert `envelopeToParsedExchange()` forwards:
    - `challengeRoundOffer`
    - `challengeRoundEvaluation`
    - `noteDraft`
  - Assert parse-fallback returns safe empty Challenge Round fields.
- `apps/api/src/services/session/session-exchange.test.ts`
  - Assert `prepareExchangeContext()` populates `challengeEligible` only when
    `evaluateChallengeReadiness()` permits.
  - Assert `CHALLENGE_ROUND_RUNTIME_ENABLED=false` suppresses
    `challengeOfferPrompt` injection and ignores LLM offer signals.
  - Assert active Challenge Round states still route with `llmRoutingRung = 4`
    while preserving `escalationRung`.

Target shape in `ParsedExchangeEnvelope`:

```ts
challengeRoundOffer: boolean;
challengeRoundEvaluation: ChallengeRoundEvaluationItem[];
noteDraft: {
  content: string;
  sourceConcepts: string[];
  sourceAnswerEventIds: string[];
} | null;
```

Use schema package types where they are exported. If a note-draft type is not
exported, add one to `@eduagent/schemas` rather than redefining an API-facing
shape locally.

### Phase 1 - Parse And Gate Offers

Files:

- `apps/api/src/services/exchanges.ts`
- `apps/api/src/services/session/session-exchange.ts`
- `apps/api/src/services/exchange-prompts.ts`
- `apps/api/src/services/challenge-round/trigger.ts`

Work:

1. Extend `ParsedExchangeEnvelope` and `EMPTY_PARSED_ENVELOPE`.
2. Forward Challenge Round fields from `envelopeToParsedExchange()`.
3. In `prepareExchangeContext()`, read `metadata.challengeRound` via
   `challengeRoundSessionStateSchema`.
4. Call `evaluateChallengeReadiness()` only for learning sessions with a
   topic anchor. If any required input is unavailable, return not eligible with
   an explicit reason rather than defaulting to eligible.
5. Set `context.challengeEligible` and `context.challengeRound`.
6. Keep `challengeOfferPrompt` injection gated by
   `CHALLENGE_ROUND_RUNTIME_ENABLED` and then by the existing state predicate:
   `cr?.state === 'offered' || (!cr && challengeEligible)`.
7. Preserve the routing floor only for `accepted | active | drafting`.

Acceptance:

- An ineligible turn cannot produce an offer even if the LLM emits
  `challenge_round_offer`.
- A disabled `CHALLENGE_ROUND_RUNTIME_ENABLED` flag cannot produce an offer even
  if the LLM emits `challenge_round_offer`.
- An eligible turn may inject `challengeOfferPrompt` only when
  `CHALLENGE_ROUND_RUNTIME_ENABLED` is true.
- Offer turns route normally. Accepted / active / drafting turns use the
  routing-only floor.

### Phase 2 - Add Challenge Round Routes

Files:

- `apps/api/src/routes/challenge-round.ts` (new)
- `apps/api/src/index.ts` route import and `.route('/', challengeRoundRoutes)`
  chain, so `AppType` includes the endpoints
- `apps/api/src/services/challenge-round/state.ts`
- `apps/api/src/services/session/session-crud.ts`
- `apps/api/src/services/challenge-round/*.test.ts`
- `apps/api/src/routes/challenge-round.test.ts`

Routes:

```text
POST /v1/challenge-round/accept
POST /v1/challenge-round/decline
POST /v1/challenge-round/abort
```

Rules:

- Routes stay thin: validate body, resolve `profileId`, call services.
- Verify the session belongs to `profileId` with `getSession()`.
- Verify the topic belongs to the same session/profile before mutating state.
- Persist state with `persistSessionMetadata()`.
- Decline writes the existing per-topic cooldown row with `lastOutcome = 0`.
- Abort updates session metadata only; do not mark mastery or write review rows.
- Do not add `/v1/challenge-round/maybe-offer` in this PR. Offers are created
  only inside the session-exchange pipeline after a gated LLM
  `challenge_round_offer` signal. The prior mobile `maybeOffer()` helper has
  been removed so learner-facing call sites cannot create offers directly.
- Register routes in `AppType` so mobile can move off raw `fetch` in a later
  cleanup. The first PR may keep raw mobile fetch if route typing becomes noisy,
  but API registration must exist.

Break tests:

- Profile B cannot accept/decline/abort Profile A's round.
- Decline writes cooldown only for the owner profile/topic.
- Accept from a non-offered state returns a typed 409-style error, not a silent
  metadata overwrite.
- No mobile path can create an offer by calling a public `maybe-offer` route in
  the first wiring PR.

### Phase 3 - Wire Runtime State Transitions

Files:

- `apps/api/src/services/session/session-exchange.ts`
- `apps/api/src/services/challenge-round/evaluation.ts`
- `apps/api/src/services/challenge-round/note-draft.ts`
- `apps/api/src/services/challenge-round/verification.ts`
- `packages/database/src/schema/assessments.ts`
- `apps/api/src/services/challenge-round/persistence.ts` (new, or equivalent
  service-owned helpers)

Work:

1. When `CHALLENGE_ROUND_RUNTIME_ENABLED` is true,
   `parsed.challengeRoundOffer === true`, and `context.challengeEligible` is
   true, transition `undefined -> offered`, persist metadata, and include the
   new state in the response metadata / stream done payload.
2. When state is `accepted`, transition to `active` before asking the first
   Challenge Round question.
3. During `active`, validate every emitted `challenge_round_evaluation` item
   with `validateEvaluationEventIds()` before storing it in session metadata.
4. Append evaluations with `transitionChallengeState(..., { type:
   'answer_complete', ... })`. Keep the hard cap from `caps.ts`; never trust
   the LLM to terminate the round.
5. When enough evaluations are collected, transition to `drafting`.
6. In `drafting`, run `decideMasteryAndReview()`.
7. If all concepts are solid:
   - write Challenge Round mastery evidence via a dedicated service helper;
   - do not write `needs_deepening_topics`;
   - validate `ui_hints.note_draft` with `validateNoteDraft()` before surfacing.
8. If any result is partial/missing/misconception:
   - do not set mastery;
   - write durable pending follow-up rows to `needs_deepening_topics` for
     partial and misconception items;
   - save only solid quotes as note-draft input;
   - close the round even if the learner skips the note.
9. Persist `challengeRoundVerdict` in `ai_response.metadata`:

```ts
challengeRoundVerdict: {
  solidCount: number;
  partialCount: number;
  missingCount: number;
  misconceptionCount: number;
};
```

10. On note-draft guard rejection, return a typed fallback draft:

```ts
draftedNote: {
  id: string;
  body: null;
  sourceAnswerEventIds: string[];
  fallbackPrompt: string;
};
```

Mastery persistence contract:

- Do not update an arbitrary existing `assessments` row by broad
  `(profileId, topicId)` criteria. The table is not unique by topic.
- On `decision.markMasteryVerified === true`, insert a new owned assessment row
  as the Challenge Round audit record:

```ts
await db.insert(assessments).values({
  profileId,
  subjectId: session.subjectId,
  topicId,
  sessionId,
  verificationDepth: 'transfer',
  status: 'passed',
  masteryScore: 1,
  qualityRating: 5,
  exchangeHistory: [],
  masteryChallengeVerifiedAt: now,
});
```

- If no prior assessment exists, the insert above is still the correct path.
- If multiple prior assessments exist for the same profile/topic, still insert
  a fresh row; `progress.ts` already reads the latest
  `masteryChallengeVerifiedAt`.
- Verify topic ownership through the session/topic parent chain before insert.

Weak-spot persistence contract:

- Challenge Round partial/misconception targets are first written as
  `needs_deepening_topics.status = 'pending_review'`, not `active`.
- Set `source = 'challenge_round'`, copy `concept`, `misconception`, and
  `correction`, and set `pendingExpiresAt` to `now + 7 days`.
- Before inserting, query existing owner-scoped rows for the same
  `(profileId, subjectId, topicId, source, concept)` where status is
  `active` or `pending_review`. Update the newest matching row instead of
  inserting a duplicate; keep existing `active` rows active, and refresh
  `pendingExpiresAt` only for existing/new `pending_review` rows. Otherwise
  insert one row per review target.
- A later corroborating signal promotes pending rows via
  `promotePendingDeepening()`. Expired pending rows are deleted by the Inngest
  expiry cron.

Acceptance:

- The server is the only authority for mastery.
- Empty evaluation is invalid and does not close as verified.
- A disabled `CHALLENGE_ROUND_RUNTIME_ENABLED` flag never writes
  `metadata.challengeRound`, mastery rows, cooldown rows, weak-spot rows, or
  typed `challengeOffer` SSE fields.
- A mixed result never marks mastery.
- Weak-spot rows are written before the round closes.
- Guard-rejected notes still give the learner a fallback close ritual.
- Verified rounds insert a new Challenge Round assessment row even when no
  prior assessment row exists.
- Multiple prior assessments for a topic do not cause ambiguous updates.
- Mixed rounds create or update pending-review rows without duplicating the same
  concept.

### Phase 4 - Extend SSE And Mobile UI

Files:

- `apps/mobile/src/lib/sse.ts`
- `apps/mobile/src/hooks/use-sessions.ts`
- `apps/mobile/src/components/session/use-session-streaming.ts`
- `apps/mobile/src/hooks/use-challenge-round.ts`
- `apps/mobile/src/components/session/ChallengeOfferCard.tsx`
- `apps/mobile/src/components/session/ChallengeRoundBanner.tsx`
- `apps/mobile/src/components/session/DraftedNoteReview.tsx`
- `apps/mobile/src/app/(app)/session/index.tsx`
- relevant i18n locale files

SSE `done` payload should carry typed fields, never raw envelope JSON:

```ts
challengeRound?: ChallengeRoundSessionState;
challengeOffer?: {
  pitch: string;
};
draftedNote?: {
  id: string;
  body: string | null;
  sourceAnswerEventIds: string[];
  fallbackPrompt?: string;
};
```

Work:

1. Extend `StreamDoneEvent` and the `onDone` payload.
2. Render `ChallengeOfferCard` when a typed offer arrives.
3. Wire Accept / Decline / Don't ask again to `/challenge-round/*`.
4. Render `ChallengeRoundBanner` for active rounds.
5. Render `DraftedNoteReview` for typed `draftedNote`.
6. Save edited notes through the existing notes API after learner action.
7. Skip closes only the client-side review affordance; it must not undo mastery
   or review-target persistence that already succeeded.
8. Hide the "Too easy" chip while `challengeRound.state` is
   `offered | accepted | active | drafting`.
9. Preserve voice mode: Challenge Round exchanges still use the ordinary session
   exchange endpoint and the existing inputMode/TTS path.
10. Do not wire the "Too easy" chip to Challenge Round in this PR. While a round
    is not in flight, "Too easy" keeps today's system-prompt fallback behavior.

Mobile tests:

- Offer card renders from typed done payload.
- Accept/decline call the API with `sessionId`, `topicId`, and profile header.
- "Too easy" does not call a Challenge Round `maybe-offer` endpoint.
- Active banner renders question count.
- Drafted note supports Save, Edit & save, and Skip.
- Guard fallback (`body: null`) renders a write-your-own composer.
- "Too easy" chip is hidden during an in-flight round.
- Voice-mode session can continue a Challenge Round without a text-only branch.

### Phase 5 - Required Enablement Gate

Do after the core runtime path works and before flipping
`CHALLENGE_ROUND_RUNTIME_ENABLED` to `true` in any learner-facing environment:

- Integrate `resolveMasteryVerificationState()` into read/surfacing code so
  raw `mastery_challenge_verified_at` is not treated as permanently active.
- Use `needs_deepening_topics.status = 'pending_review'` for Challenge Round
  weak spots. Add or verify:
  - `promotePendingDeepening()`;
  - an Inngest expiry cron;
  - tests for corroborating signal promotion and expiry.
- Add the no-clinical-copy ratchet before shipping new learner-visible strings.
- Update `docs/project_context.md` only after the runtime behavior is true.

## Validation

Run these before calling the wiring complete:

```bash
pnpm exec nx run api:test
pnpm exec nx run api:typecheck
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-challenge-round.ts src/lib/sse.ts src/components/session/DraftedNoteReview.tsx --no-coverage
```

Because this touches LLM prompts / envelope behavior:

```bash
pnpm eval:llm
pnpm eval:llm --live
pnpm test:llm:premium-routing
```

This PR touches API routes, scoped ownership, assessments, cooldowns, and
`needs_deepening_topics`, so integration tests are required:

```bash
pnpm exec nx test:integration api
```

Manual smoke after tests:

1. Eligible learner gets an offer.
2. Learner declines; no repeat offer inside cooldown.
3. Learner accepts; three Challenge questions proceed through normal voice/text
   exchange path.
4. All-solid round marks mastery and shows note preview.
5. Mixed round does not mark mastery and writes durable follow-up rows.
6. Guard-rejected note shows fallback composer.

## Follow-Ups

- User-initiated "Challenge me" entry from topic/subject surfaces.
- Advisory re-verification affordance.
- Cooldown matrix expansion: 4h decline, 24h close, 1h global.
- Guardian progress surface for Challenge Round activity.
- Provider-divergence analytics dashboard.
- Auto-resolve for confirmed `needs_deepening_topics` rows after later success.

## Done Definition

Challenge Round is not considered implemented until a real production exchange
can move through offer -> accept -> active evaluation -> draft/close, with
server-owned mastery/review persistence and typed mobile rendering. Schema,
prompts, components, and tests alone do not count.
