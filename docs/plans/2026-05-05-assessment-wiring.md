# Assessment Wiring Implementation Plan — 2026-05-05

## Summary

- **Feature 1 (Standalone "prove I know this")**: Wire the orphaned `/assessment` screen to the Practice hub via an `IntentCard` that opens a new topic-picker route. The picker filters to topics with a completed learning session within 30 days, sorted by recency.
- **Feature 2 (Continuation session opener)**: When a session has `resumeFromSessionId` in its metadata and the prior session ended within 30 days on the same topic, inject a retrieval-check prompt block at `exchangeCount === 0`. The LLM's existing envelope signals carry a score; the session route branches depth on that score.
- **SM-2 wiring**: Map `assessmentEvaluation.qualityRating` (0-5, already computed by the LLM) directly into `updateRetentionFromSession`. The route handler at `apps/api/src/routes/assessments.ts` already calls this on `passed === true`; the plan extends it to also call on borderline scores (≥0.5) with a shortened interval mechanism. No new API route is needed.

---

## Pre-Implementation Investigation Findings

### Quality-mapping function (SM-2)

The SM-2 quality mapping for EVALUATE sessions lives at `apps/api/src/services/evaluate.ts`, function `mapEvaluateQualityToSm2` (line 64–74). It maps a `(passed: boolean, rawQuality: number)` pair to a 0-5 SM-2 quality. The equivalent for TEACH_BACK is `mapTeachBackRubricToSm2` in `apps/api/src/services/teach-back.ts`. These are the established integration points.

The assessment service at `apps/api/src/services/assessments.ts` uses `qualityRating` (0-5, clamped to `[0, 5]` at line 304-306) which the LLM already emits per the `ASSESSMENT_EVAL_SYSTEM_PROMPT`. The `assessments.ts` route (lines 111-134) already passes `evaluation.qualityRating` directly to `updateRetentionFromSession`. This wiring is already present for the `passed === true` case.

### Continuation detection (current state and gap)

There is no `isContinuation` boolean anywhere in the codebase. Continuation is detected implicitly via `resumeFromSessionId` in the session's `metadata` JSONB field (read at `session-exchange.ts` lines 774-779). The `buildResumeContext` function in `session-context-builders.ts` (line 266) consumes it. The `progress.ts` service (lines 936-960) sets `resumeFromSessionId` on the resume target when the most-recent completed session is found for a topic.

Gap: `resumeFromSessionId` is not the same as "continuation of the same topic within N days." A session can have `resumeFromSessionId` pointing to a session on a different topic (subject-level freeform). The clean continuation signal needs:

1. `session.topicId` is non-null AND
2. `resumeFromSessionId` points to a session with the same `topicId` AND
3. The prior session completed within 30 days

All three facts are available in `prepareExchangeContext` at `session-exchange.ts` — `session.topicId`, `sessionMetadata.resumeFromSessionId`, and the prior session's `endedAt` (one DB read to `buildResumeContext`). No schema change needed; the detection is a three-line guard.

### Per-question gap data

The assessment API currently returns `{ feedback, passed, masteryScore, qualityRating, shouldEscalateDepth }` per answer. The `exchangeHistory` is stored in the `assessments` DB table as a JSONB array of `{ role, content }` pairs (schema at `packages/schemas/src/assessments.ts` line 46). There is no per-question gap label. The LLM's feedback text contains gap information in prose, but it is not structured. The `assessmentEvaluationSchema` at line 81-89 has no `weakAreas` or `gapTopics` field.

For the borderline CTA ("want a refresher on the parts you missed?"), the gap context must be forward-carried. Minimal extension needed: add an optional `weakAreas: string[]` field to `assessmentEvaluationSchema` and to the `ASSESSMENT_EVAL_SYSTEM_PROMPT` JSON contract. The LLM already identifies where thinking went wrong (prompt line 82). Surfacing this as a structured array costs one prompt line and one schema field.

---

## Feature 1 Plan

### New route: `apps/mobile/src/app/(app)/practice/assessment-picker.tsx`

Routing from practice hub: `router.push('/(app)/practice/assessment-picker')`. The route is a simple scrollable list of eligible topics, not a bottom sheet — bottom sheets add modal complexity incompatible with the existing router pattern; a dedicated screen matches `relearn.tsx` in structure.

The screen calls a new API endpoint `GET /retention/assessment-eligible` which queries:
- `learningSessions` WHERE `profileId = ?` AND `topicId IS NOT NULL` AND `status IN ('completed', 'auto_closed')` AND `exchangeCount >= 1` AND `endedAt >= NOW() - 30 days`
- Orders by `lastActivityAt DESC`, deduplicates by `topicId`, joins to `curriculumTopics` for title and `subjects` for `subjectId`.

Endpoint is new but small (~25 lines in the route handler, ~30 in a service function added to `retention-data.ts` as `getAssessmentEligibleTopics`). The mobile hook `useAssessmentEligibleTopics` follows the pattern in `use-progress.ts`.

The picker renders `<Pressable>` items showing topic title, subject name, and "Studied N days ago" recency. On tap: `router.push({ pathname: '/assessment', params: { subjectId, topicId } })`. Empty state ("You haven't studied any topics recently — start a session first") with a Browse CTA matches the review empty state pattern in `practice.tsx` lines 148-173.

### Changes to `practice.tsx`

Add one `IntentCard` after "Quiz yourself":

- `title`: "Prove I know this"
- `subtitle`: dynamically loaded — if eligible topics > 0: "N topic(s) ready to test" else: "Study a topic first"
- `icon`: `"checkmark-circle-outline"`
- `testID`: `"practice-assessment"`
- `onPress`: `router.push('/(app)/practice/assessment-picker')`

The subtitle data comes from the same `useAssessmentEligibleTopics` hook (count only).

### Result UX in `assessment/index.tsx`

When `evaluation.passed === true`, the existing code already shows `assessment.passedMessage` (line 73). Add a score display card that appears after the pass message:

- Shows mastery percentage and a band label ("Excellent", "Good", "Meets the bar")
- If score 0.5–0.69: show a "Want a quick refresher on the parts you missed?" CTA with "Yes please" and "No thanks" buttons
- "Yes please" routes to `/(app)/session` with params `{ subjectId, topicId, mode: 'gap_fill', gaps: JSON.stringify(weakAreas) }` — the session creation picks these up in metadata
- "No thanks" calls `PATCH /assessments/:id/decline-refresh` (one-liner that flags the row; the SM-2 interval shortening is done server-side)
- Below 0.5: same offer, softer framing ("Want to revisit this topic?"), same agency — no auto-route

### Copy

- IntentCard title: "Prove I know this"
- Picker screen title: "Pick a topic to check"
- Picker subtitle: "You've studied these recently — pick one to prove what stuck."
- Pass card: "You got [N]%! [Band label]."
- Borderline CTA (0.5-0.69): "You got the core ideas. Want a quick catch-up on the bits you weren't sure about?"
- Decline button: "No thanks, I'm done"
- Accept button: "Yes, show me what I missed"
- Fail offer (<0.5): "That topic might need another look. Want to revisit it?"

---

## Feature 2 Plan

### Continuation detection

In `prepareExchangeContext` (`session-exchange.ts`, around line 773), add an `isContinuation` boolean computed as:

1. `session.exchangeCount === 0` (first message of a new session)
2. `resumeFromSessionId` is set in metadata
3. The prior session's `topicId === session.topicId` (non-null)
4. The prior session's `endedAt` is within 30 days

Steps 3 and 4 require reading the prior session once. `buildResumeContext` already loads `session` from `learningSessions` for the same session ID at line 272 — extract that DB read into a shared helper `loadPriorSessionMeta(db, profileId, resumeFromSessionId)` returning `{ topicId, endedAt }`. Call it once; pass `isContinuation` to the context builder.

### Session-opener mechanism: prompt scaffolding, not a pre-call

The envelope contract (`llm-envelope.ts`) does not have a `retrieval_score` signal — adding one would require adding a new `signals` field. That is the minimum for structured branching per CLAUDE.md.

Decision: use prompt scaffolding on the first exchange (`exchangeCount === 0`), with the envelope returning a new optional signal `retrieval_score: number | undefined`. This requires:

1. Add `retrieval_score: z.number().min(0).max(1).optional()` to `llmResponseEnvelopeSchema.signals` in `packages/schemas/src/llm-envelope.ts`.
2. Expose it through `classifyExchangeOutcome` / `streamExchange` result (same path as `partialProgress`, `needsDeepening`).
3. In `buildSystemPrompt` (or the exchange context builder), when `isContinuation === true AND exchangeCount === 0`, inject a prompt block:

```
CONTINUATION OPENER (first turn only):
Before presenting new material, ask the learner 1–2 retrieval questions about [topicTitle].
Based on their response, include in your JSON envelope:
  signals.retrieval_score: 0.0–1.0 (0=no recall, 1.0=perfect recall)
Do not mention the score to the learner.
```

4. In the route handler, when `exchangeCount === 0` and `retrieval_score` is present:
   - ≥ 0.8: set session metadata `continuationDepth: 'high'` — next exchanges skip recap, jump to new material
   - 0.5–0.79: set `continuationDepth: 'mid'` — next exchanges refresh weak spots first
   - < 0.5: set `continuationDepth: 'low'` — next exchanges re-teach prior topic before advancing

The branching uses session metadata (already a JSONB column on `learningSessions`) as the state machine. Subsequent exchanges read `continuationDepth` from metadata and inject a one-line context hint in the system prompt. This avoids a separate API pre-call and keeps all logic inside the existing exchange pipeline.

Justification for not using a standalone `/assessment` pre-call: starting a new assessment mid-session-creation creates a two-step async flow with a holding UI. The existing session creation is synchronous; the prompt-with-signal approach preserves that and reuses the established envelope contract.

---

## SM-2 Integration Plan

### Score-to-quality curve (assessment → SM-2)

The SM-2 `quality` scale is 0–5. The assessment `masteryScore` is 0–1. Map then clamp:

| masteryScore | quality | Meaning |
|---|---|---|
| < 0.50 | 1 | Very poor; interval shrinks |
| 0.50–0.69 | 2 | Borderline; modest interval reduction |
| 0.70 | 3 | Passes UX gate; modest extension |
| 0.80 | 4 | Good; comfortable extension |
| ≥ 0.90 | 5 | Excellent; confident extension |

Formula: `quality = clamp(Math.round(masteryScore * 5 + 0.5), 1, 5)` with the floor adjusted: scores below 0.5 map to 1 (not 0) to avoid erasing interval for a learner who genuinely tried. This matches the floor logic in `mapEvaluateQualityToSm2` in `evaluate.ts`.

Add function `mapAssessmentScoreToSm2Quality(masteryScore: number): number` to `retention-data.ts` (the existing file with all SM-2 plumbing). This is the integration point both feature paths call.

### Where the wiring lives

The route handler in `apps/api/src/routes/assessments.ts` (lines 111-134) already calls `updateRetentionFromSession` when `newStatus === 'passed'`. Extend the condition to also fire when the assessment ends and `masteryScore >= 0.5` regardless of `passed`. The existing `qualityRating` from the LLM (0-5) should be used directly for the SM-2 call — it is already computed by `parseAssessmentEvaluation` and stored. The `masteryScore`-based curve above serves as a fallback if `qualityRating` is null.

Assessment "ends" when `newStatus === 'passed'` OR the assessment has been running for 4+ exchanges and the learner submits (a "natural exit"). For the borderline-decline path: the mobile client sends `PATCH /assessments/:id/decline-refresh`. The handler calls `updateRetentionFromSession` with quality 2 (the borderline penalty interval shortening).

Numerically: quality 2 under SM-2 resets `repetitions` to 0, sets `intervalDays` to 1, and decreases `easeFactor` by 0.20. The learner will see the topic again the next day — exactly "returns sooner" without losing their entire history.

---

## Failure Modes Tables

### Feature 1 — Standalone Assessment

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Picker loads empty | No completed sessions in 30 days | "You haven't studied any topics recently — start a session first" + Browse CTA | Tap Browse → library |
| Picker API 500 | `/retention/assessment-eligible` fails | Error card with "Try again" | Retry or go back |
| Assessment create fails | `POST /subjects/:s/topics/:t/assessments` 4xx/5xx | Error card with retry (existing `ErrorFallback` pattern) | Retry |
| Submit answer fails | `POST /assessments/:id/answer` 4xx/5xx | Retry card with last user text pre-filled (existing pattern, `assessment/index.tsx` line 133-143) | Retry or go home |
| Gap-fill session create fails | Session creation after "Yes please" tap | Toast "Couldn't start session — try again" | Retry |
| `subjectId` or `topicId` missing | Deep-link with bad params | `assessment.missingParams` text + Go Back (existing, lines 96-117) | Go back |

### Feature 2 — Continuation Opener

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `retrieval_score` absent from envelope | LLM omits signal | No branching; session proceeds as `continuationDepth: undefined` (standard session) | Graceful degradation — no UX impact |
| Prior session not found | `resumeFromSessionId` stale or deleted | `isContinuation = false`; opener is a normal continuation (existing `buildResumeContext` path) | Session continues normally |
| Continuation depth stuck | `continuationDepth` in metadata corrupted | Treated as `undefined` — standard session | Session continues normally |
| LLM misreads retrieval score | Scores 0.9 when learner clearly struggled | Session skips recap; learner may feel confused | Product can tune the prompt; no hard failure |

---

## Open Questions

1. **Pass threshold UX gate**: The product owner says 0.7. Should the `passed` field returned to the mobile client also change to reflect the 0.7 threshold (currently the LLM decides `passed`)? Or is it UX-only, leaving `passed` as the LLM's binary? This matters for the `assessment.passedMessage` trigger in the mobile screen.
2. **Assessment natural-exit trigger**: When does a standalone assessment "end" if the learner never hits `passed`? The current implementation runs indefinitely. Should there be a max-exchange limit (e.g., 6 turns) after which the result is treated as "borderline" and SM-2 is still updated?
3. **Gap-fill session scoping**: The "Yes please" CTA routes to a session with `gaps` in metadata. Does the session creation route today accept a `gaps` metadata field, or does it need a schema addition? The `learningSessions.metadata` is untyped JSONB so no DB migration is needed, but the session creation API call shape needs confirming.
4. **`PATCH /assessments/:id/decline-refresh` endpoint**: This plan introduces a new endpoint. Confirm whether the product owner is comfortable with this vs. encoding the decline as a client-only action (no server state, just skip the SM-2 shortening).
5. **Below-0.5 UX offer vs. nudge**: The plan treats <0.5 the same as borderline (offer, don't force). The product owner said "flag for confirmation" — confirm whether a stronger nudge toward relearn is wanted here.

---

## Implementation Order

**Feature 1 first.** It is fully self-contained: one new screen, one new API endpoint, one card on the practice hub. It validates the picker UX, the SM-2 wiring, and the result screen — including the borderline CTA — before Feature 2 introduces session-state branching. Feature 2 adds complexity inside the live session pipeline; bugs there are higher severity.

---

## Files Touched

### Feature 1

| File | Purpose |
|---|---|
| `apps/mobile/src/app/(app)/practice.tsx` | Add "Prove I know this" `IntentCard` |
| `apps/mobile/src/app/(app)/practice/assessment-picker.tsx` | New topic-picker screen |
| `apps/mobile/src/hooks/use-assessments.ts` | Add `useAssessmentEligibleTopics` hook |
| `apps/mobile/src/app/assessment/index.tsx` | Add result card, borderline CTA, decline flow |
| `apps/api/src/routes/assessments.ts` | Add `GET /retention/assessment-eligible`, `PATCH /assessments/:id/decline-refresh` |
| `apps/api/src/services/retention-data.ts` | Add `getAssessmentEligibleTopics`, `mapAssessmentScoreToSm2Quality` |
| `packages/schemas/src/assessments.ts` | Add `weakAreas?: string[]` to `assessmentEvaluationSchema` |

### Feature 2

| File | Purpose |
|---|---|
| `apps/api/src/services/session/session-exchange.ts` | Add `isContinuation` detection in `prepareExchangeContext` |
| `apps/api/src/services/session/session-context-builders.ts` | Add `loadPriorSessionMeta` helper; inject continuation prompt block |
| `packages/schemas/src/llm-envelope.ts` | Add `retrieval_score` to `signals` |
| `apps/api/src/services/llm/envelope.ts` | Surface `retrieval_score` from parsed envelope |
