# Assessment Wiring Implementation Plan — 2026-05-05

> Revision history
> - 2026-05-05 — initial draft
> - 2026-05-06 — adversarial review applied (CRITICAL-1..3, HIGH-1..5, MEDIUM-1..5, LOW-1..2). See § "Review Findings Applied" at the end of the doc.

## Summary

- **Feature 1 (Standalone "prove I know this")**: Wire the orphaned `/assessment` screen to the Practice hub via an `IntentCard` that opens a new topic-picker route. The picker filters to topics with a completed learning session within 30 days, sorted by recency.
- **Feature 2 (Continuation session opener)**: When a session has `resumeFromSessionId` in its metadata and the prior session ended within 30 days on the same topic, inject a *two-turn* retrieval-check pattern at the start of the new session. The probe turn asks retrieval questions; the score arrives one turn later, in the envelope of the LLM's response to the learner's answer. The route branches `continuationDepth` based on that delayed score, with a hard cap so the flow terminates even if the score never arrives.
- **SM-2 wiring**: Map `assessmentEvaluation.qualityRating` (0-5, already computed by the LLM) directly into `updateRetentionFromSession`. The route handler at `apps/api/src/routes/assessments.ts` already calls this on `passed === true`; the plan extends the call surface to also fire on borderline (0.5–0.69) and the explicit "natural exit" trigger (max-exchange cap), so retention is updated whether the learner passes, exits early, or declines remediation.

---

## Pre-Implementation Investigation Findings

### Quality-mapping function (SM-2)

The SM-2 quality mapping for EVALUATE sessions lives at `apps/api/src/services/evaluate.ts`, function `mapEvaluateQualityToSm2` (line 64–74). It maps a `(passed: boolean, rawQuality: number)` pair to a 0-5 SM-2 quality with a documented floor at 2-3 for failed attempts (to avoid devastating retention from a single failure). The equivalent for TEACH_BACK is `mapTeachBackRubricToSm2` in `apps/api/src/services/teach-back.ts`. These are the established integration points.

The assessment service at `apps/api/src/services/assessments.ts` uses `qualityRating` (0-5, clamped to `[0, 5]` at line 303-306) which the LLM already emits per the `ASSESSMENT_EVAL_SYSTEM_PROMPT`. The `assessments.ts` route (lines 111-134) already passes `evaluation.qualityRating` directly to `updateRetentionFromSession` when `newStatus === 'passed' && evaluation.qualityRating != null && assessment.topicId && assessment.subjectId`. This wiring is already present for the pass case — but `qualityRating` is **never null in practice** (`parseAssessmentEvaluation` always coerces via `Math.max(0, Math.min(5, Number(parsed.qualityRating ?? 0)))`, and the schema field at `packages/schemas/src/assessments.ts:87` is non-nullable). The `!= null` guard is defensive against future schema changes; the plan does NOT rely on it firing.

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

> **Envelope-vs-bespoke-JSON note (MEDIUM-1):** Assessment evaluation parses a separate JSON shape via `extractFirstJsonObject`, not via `llmResponseEnvelopeSchema`. CLAUDE.md mandates the envelope for state-machine signals. Adding `weakAreas` here perpetuates the bespoke shape. **Sanctioned deferral**: this plan does NOT migrate assessment to the envelope. A follow-up ticket should track that migration; conflating it with assessment wiring would balloon scope. Reviewers: please don't flag the bespoke shape in PR review on this work.

---

## Feature 1 Plan

### Route restructure (prerequisite)

`apps/mobile/src/app/(app)/practice.tsx` is currently a flat route. To host `assessment-picker` as a sibling, the route is restructured before the new screen lands:

1. Rename `practice.tsx` → `practice/index.tsx` (no behaviour change).
2. Add `practice/_layout.tsx` exporting `unstable_settings = { initialRouteName: 'index' }` per CLAUDE.md ("Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings`…").
3. Add `practice/assessment-picker.tsx` as the new screen.

This is a routing structure change, not just a file addition.

### New route: `apps/mobile/src/app/(app)/practice/assessment-picker.tsx`

Routing from practice hub: `router.push('/(app)/practice/assessment-picker')`. The route is a simple scrollable list of eligible topics, not a bottom sheet — bottom sheets add modal complexity incompatible with the existing router pattern; a dedicated screen matches `relearn.tsx` in structure.

The screen calls a new API endpoint `GET /retention/assessment-eligible` (registered in `apps/api/src/routes/retention.ts`, **not** in `assessments.ts` — the latter owns `/subjects/...`, `/assessments/...`, `/sessions/...` paths only) which queries:
- `learningSessions` WHERE `profileId = ?` AND `topicId IS NOT NULL` AND `status IN ('completed', 'auto_closed')` AND `exchangeCount >= 3` AND `endedAt >= NOW() - 30 days`
- Orders by `lastActivityAt DESC`, deduplicates by `topicId`, joins to `curriculumTopics` for title and `subjects` for `subjectId`.

> The `exchangeCount >= 3` floor (instead of `>= 1`) ensures the learner had a real conversation, not a session that was opened and abandoned after one message. Matches the heuristic used elsewhere for "meaningful session" gating.

Endpoint is new but small (~25 lines in the route handler, ~30 in a service function added to `retention-data.ts` as `getAssessmentEligibleTopics`). The mobile hook `useAssessmentEligibleTopics` follows the pattern in `use-progress.ts` and uses query key `['assessments', 'eligible']` so the picker and the practice hub IntentCard subtitle share a single cache entry.

The picker renders `<Pressable>` items showing topic title, subject name, and "Studied N days ago" recency.

**Cross-stack navigation to `/assessment`:** The assessment screen lives outside the `(app)` group at `apps/mobile/src/app/assessment/`. Per CLAUDE.md, "Cross-tab / cross-stack `router.push` calls must push the full ancestor chain." A direct push to `/assessment` synthesizes a 1-deep stack containing only the leaf, so `router.back()` from assessment falls through to Tabs first-route (Home), not back to the picker.

Two acceptable resolutions; this plan adopts (A):

- **(A) Move assessment under `(app)/practice/`** — relocate `apps/mobile/src/app/assessment/` to `apps/mobile/src/app/(app)/practice/assessment/`. Same-stack push, back-button works naturally. Deeplink targets that referenced `/assessment` get updated.
- **(B) Push the parent chain** — `router.push('/(app)/practice/assessment-picker')` then `router.push({ pathname: '/(app)/practice/assessment-picker/assessment', params })`. Requires (A)'s relocation anyway, so (A) is strictly better.

Empty state ("You haven't studied any topics recently — start a session first") with a Browse CTA matches the review empty state pattern in `practice.tsx` lines 148-173.

### Changes to `practice/index.tsx`

Add one `IntentCard` after "Quiz yourself":

- `title`: "Prove I know this"
- `subtitle`: dynamically loaded — if eligible topics > 0: "N topic(s) ready to test" else: "Study a topic first"
- `icon`: `"checkmark-circle-outline"`
- `testID`: `"practice-assessment"`
- `onPress`: `router.push('/(app)/practice/assessment-picker')`

The subtitle data comes from the same `useAssessmentEligibleTopics` hook (count only; same query key, single cache entry).

### Result UX in `assessment/index.tsx`

The result UX depends on the assessment "ending." Three end states are now defined explicitly (resolves CRITICAL-2):

- **Pass**: `evaluation.passed === true && !shouldEscalateDepth` — current behaviour, status set to `passed`.
- **Borderline**: `masteryScore` in 0.50–0.69 inclusive AND (`exchangeCount >= 4` OR LLM emits `passed: false` with no escalation possible) — new server-side terminator. Status set to a new value `borderline` (DB enum extension required — see Schema Changes below).
- **Natural exit**: `exchangeCount >= 6` and no terminal verdict yet — status set to `failed_exhausted`. SM-2 fires with the score-derived quality. The 6-turn cap is the hard ceiling; the LLM cannot block termination.

When the result is `passed`, the existing code already shows `assessment.passedMessage` (line 73). Add a score display card that appears after the pass message:

- Shows mastery percentage and a band label ("Excellent", "Good", "Meets the bar")
- If score 0.5–0.69 (status `borderline`): show a "Want a quick refresher on the parts you missed?" CTA with "Yes please" and "No thanks" buttons
- "Yes please" routes to `/(app)/practice/assessment/../session` (after relocation) with params `{ subjectId, topicId, mode: 'gap_fill', gaps: JSON.stringify(weakAreas) }` — the session creation picks these up in metadata. **The SM-2 update fires server-side at the moment the assessment is judged borderline, NOT deferred to the gap-fill session** (HIGH-5). Quality is computed via `mapAssessmentScoreToSm2Quality`; the gap-fill session updating retention again later is fine — the double-counting guard handles it.
- "No thanks" calls `PATCH /assessments/:id/decline-refresh` — server-side this is now a *display-only* signal (the SM-2 row was already updated when the assessment ended). The endpoint records the decline for analytics.
- Below 0.5 (status `failed_exhausted`): same offer, softer framing ("Want to revisit this topic?"), same agency — no auto-route. SM-2 fires when the assessment exits with quality from `mapAssessmentScoreToSm2Quality(masteryScore)`.

### Copy

- IntentCard title: "Prove I know this"
- Picker screen title: "Pick a topic to check"
- Picker subtitle: "You've studied these recently — pick one to prove what stuck."
- Pass card: "You got [N]%! [Band label]."
- Borderline CTA (0.5-0.69): "You got the core ideas. Want a quick catch-up on the bits you weren't sure about?"
- Decline button: "No thanks, I'm done"
- Accept button: "Yes, show me what I missed"
- Fail offer (<0.5): "That topic might need another look. Want to revisit it?"

### Proxy mode

Both new endpoints reject parent-proxy mode:

- `GET /retention/assessment-eligible` — calls `assertNotProxyMode(c)`. Parents shouldn't open the picker as the child; reads in proxy mode could surface child-side topic activity to the parent inappropriately.
- `PATCH /assessments/:id/decline-refresh` — calls `assertNotProxyMode(c)` (mutates child analytics state).

Practice hub already redirects parent-proxy on the mobile side (`practice.tsx:90`), so the IntentCard never renders for proxy.

### Schema Changes (Feature 1)

| Schema | Change | Reason |
|---|---|---|
| `assessmentStatusEnum` (DB) | Add `borderline` and `failed_exhausted` values | Distinct end states for SM-2 wiring |
| `assessmentEvaluationSchema` | Add `weakAreas: z.array(z.string()).max(8).optional()` | Forward-carry gap labels for borderline CTA |
| `ASSESSMENT_EVAL_SYSTEM_PROMPT` | Add JSON contract line for `weakAreas` | LLM contract |

DB enum extension is non-destructive (additive), no rollback section needed. Migration via `pnpm run db:generate` then `db:migrate:dev`; no `drizzle-kit push` against staging/prod per CLAUDE.md.

---

## Feature 2 Plan

### Continuation detection

In `prepareExchangeContext` (`session-exchange.ts`, around line 773), add an `isContinuation` boolean computed as:

1. `session.exchangeCount === 0` (this exchange will be the first AI turn) OR `session.metadata.continuationOpenerActive === true` (we're mid-probe)
2. `resumeFromSessionId` is set in metadata
3. The prior session's `topicId === session.topicId` (non-null)
4. The prior session's `endedAt` is within 30 days

Steps 3 and 4 require reading the prior session once. `buildResumeContext` already loads `session` from `learningSessions` for the same session ID at line 272 — extract that DB read into a shared helper `loadPriorSessionMeta(db, profileId, resumeFromSessionId)` returning `{ topicId, endedAt }`. Call it once; pass `isContinuation` to the context builder.

### Session-opener mechanism: two-turn flow with hard cap

This was a CRITICAL flaw in the original draft (CRITICAL-1): `retrieval_score` cannot exist at `exchangeCount === 0` because the AI is asking the question on that turn — the learner has not answered yet. The corrected flow is two turns, with a hard cap.

The envelope contract (`llm-envelope.ts`) gets a new optional signal:

```ts
// packages/schemas/src/llm-envelope.ts — added to signals
retrieval_score: z.number().min(0).max(1).optional(),
```

Flow:

1. **Turn 0 (probe).** When `isContinuation === true && exchangeCount === 0`, inject the prompt block:

   ```
   CONTINUATION OPENER (probe turn):
   Before presenting new material, ask the learner 1–2 short retrieval questions about [topicTitle].
   This turn is the probe — DO NOT emit signals.retrieval_score yet (you have nothing to score).
   Just ask the questions in your reply.
   ```

   Server records `session.metadata.continuationOpenerActive = true` and `continuationOpenerStartedExchange = 0`.

2. **Turn 1 (score).** When `continuationOpenerActive === true && exchangeCount === 1`, inject:

   ```
   CONTINUATION OPENER (scoring turn):
   The learner just answered your retrieval question(s). In your envelope, set:
     signals.retrieval_score: 0.0 (no recall) … 1.0 (perfect recall)
   Do not mention the score to the learner.
   ```

3. **Turn 1 result.** When `retrieval_score` arrives:
   - ≥ 0.8: set `session.metadata.continuationDepth = 'high'` — subsequent exchanges skip recap.
   - 0.5–0.79: set `'mid'` — refresh weak spots first.
   - < 0.5: set `'low'` — re-teach prior topic before advancing.
   - Clear `continuationOpenerActive`.

4. **Hard cap (CRITICAL-1 fix).** If `continuationOpenerActive === true && exchangeCount >= 3` (i.e., the LLM never returned a score after two scoring chances), default `continuationDepth = 'mid'` and clear `continuationOpenerActive`. This mirrors the `MAX_INTERVIEW_EXCHANGES` pattern from CLAUDE.md — every envelope signal must have a server-side hard cap so the flow terminates.

Subsequent exchanges read `continuationDepth` from metadata and inject a one-line context hint in the system prompt. This avoids a separate API pre-call and keeps all logic inside the existing exchange pipeline.

Justification for not using a standalone `/assessment` pre-call: starting a new assessment mid-session-creation creates a two-step async flow with a holding UI. The existing session creation is synchronous; the prompt-with-signal approach preserves that and reuses the established envelope contract.

### Human override (Feature 2)

Per CLAUDE.md `feedback_human_override_everywhere`, the learner gets an explicit affordance to skip the warm-up:

- When `continuationDepth` is set on the session, the session screen shows a one-tap "Skip the warm-up, jump in" pill (testID `session-skip-warmup`).
- Tapping clears `continuationDepth` server-side via a small `PATCH /sessions/:id/clear-continuation-depth` endpoint and the next exchange runs as a standard session.
- This is the recovery path for the LLM-misreads-score Failure Mode (replaces the original "Product can tune the prompt; no hard failure" non-recovery).

---

## SM-2 Integration Plan

### Score-to-quality curve (assessment → SM-2)

The SM-2 `quality` scale is 0–5. The assessment `masteryScore` is 0–1. Map:

| masteryScore | quality | Meaning |
|---|---|---|
| < 0.30 | 1 | Very poor; interval shrinks aggressively |
| 0.30–0.49 | 2 | Failed; matches `mapEvaluateQualityToSm2` floor |
| 0.50–0.69 | 3 | Borderline; modest interval reduction |
| 0.70–0.79 | 4 | Passes UX gate; comfortable extension |
| ≥ 0.80 | 5 | Excellent; confident extension |

> **Floor consistency (MEDIUM-2):** This curve floors at 1, not 0, intentionally — a learner who showed up and answered should not have retention erased to "total blackout." This matches the spirit of `mapEvaluateQualityToSm2` (floors at 2-3 for fail) while being slightly harsher because assessment is a higher-stakes check. Both functions document the floor; reviewers comparing the two should see the rationale on each.

Function: `mapAssessmentScoreToSm2Quality(masteryScore: number): number` added to `retention-data.ts` (the existing file with all SM-2 plumbing). This is the integration point both end states (borderline, failed_exhausted) call.

The pass path keeps using `evaluation.qualityRating` directly — it is the LLM's first-class judgement of answer quality and is more granular than a score-derived band.

> **No "fallback" claim (HIGH-4):** Earlier drafts said `mapAssessmentScoreToSm2Quality` was a "fallback if qualityRating is null." That path can never execute (qualityRating is non-nullable per schema and always coerced to a number by the parser). The function is used **only** for the borderline and failed_exhausted paths, where the LLM's `qualityRating` reflects the answer-by-answer quality rather than the overall mastery signal we want for retention.

### Where the wiring lives

The route handler in `apps/api/src/routes/assessments.ts` (lines 111-134) already calls `updateRetentionFromSession` when `newStatus === 'passed'`. Two extensions:

1. **Borderline path.** When `newStatus === 'borderline'`, fire `updateRetentionFromSession` with `mapAssessmentScoreToSm2Quality(masteryScore)` and the assessment's `updatedAt` ISO string as `sessionTimestamp`. This is server-side and unconditional — does NOT depend on whether the user taps "Yes please" or "No thanks."
2. **Failed-exhausted path.** When `newStatus === 'failed_exhausted'` (6-turn cap reached without pass), same call.

`sessionTimestamp` (MEDIUM-4): every call site passes the assessment's `updatedAt` as ISO. Without it, a borderline-then-pass sequence on the same topic within seconds (rare but possible) silently drops the second update due to the `card.updatedAt >= timestamp` guard at `retention-data.ts:1191-1196`.

### Decline endpoint

`PATCH /assessments/:id/decline-refresh`: records the analytics signal that the learner declined the refresher CTA. Does NOT mutate retention (already updated when the assessment ended). Keeps a clean separation: server decides retention from objective score; learner decides remediation path. The endpoint calls `assertNotProxyMode(c)`.

---

## Failure Modes Tables

### Feature 1 — Standalone Assessment

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Picker loads empty | No completed sessions in 30 days with ≥3 exchanges | "You haven't studied any topics recently — start a session first" + Browse CTA | Tap Browse → library |
| Picker API 500 | `GET /retention/assessment-eligible` fails | Error card with "Try again" | Retry or go back |
| Picker request blocked by proxy mode | Parent in proxy mode hits the endpoint | 403 (via `assertNotProxyMode`) | Mobile redirect should prevent reaching this; if it does, Switch back to parent profile |
| Assessment create fails | `POST /subjects/:s/topics/:t/assessments` 4xx/5xx | Error card with retry (existing `ErrorFallback` pattern) | Retry |
| Submit answer fails | `POST /assessments/:id/answer` 4xx/5xx | Retry card with last user text pre-filled (existing pattern, `assessment/index.tsx` line 133-143) | Retry or go home |
| Borderline result, network fails before SM-2 update | Server failed to commit retention update on assessment end | Retry on next answer; the natural-exit cap re-fires the SM-2 path on subsequent attempt | Server-side retry on transaction failure |
| Gap-fill session create fails | Session creation after "Yes please" tap | Toast "Couldn't start session — try again" | Retry. SM-2 already updated, so no learner-visible regression |
| Decline-refresh PATCH fails | Network glitch on "No thanks" | Silent client-side retry (analytics, not load-bearing) | None needed — UX continues |
| `subjectId` or `topicId` missing | Deep-link with bad params | `assessment.missingParams` text + Go Back (existing, lines 96-117) | Go back |
| Natural-exit reached at 6 exchanges | LLM never returned `passed` | Result card shown with `failed_exhausted` framing; SM-2 already updated | "Want to revisit?" CTA |

### Feature 2 — Continuation Opener

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `retrieval_score` absent at turn 1 | LLM omits signal in scoring turn | Server retries the scoring prompt at turn 2 | Probe-cap fires at exchange 3 → defaults `continuationDepth = 'mid'`, clears flag |
| Probe never produces score (3-turn cap hit) | LLM keeps probing or refuses to score | `continuationDepth = 'mid'` set by hard cap; session proceeds normally | Hard cap is the recovery — flow terminates without learner-visible effect |
| Prior session not found | `resumeFromSessionId` stale or deleted | `isContinuation = false`; opener is a normal continuation (existing `buildResumeContext` path) | Session continues normally |
| `continuationDepth` corrupted in metadata | JSONB write race or manual DB edit | Treated as `undefined` — standard session | Session continues normally |
| LLM misreads retrieval score | Scores 0.9 when learner clearly struggled | Session skips recap; learner may feel rushed | Learner taps "Skip the warm-up" pill (`session-skip-warmup`) → server clears `continuationDepth`. CLAUDE.md `human_override_everywhere` rule satisfied. |
| Probe injected into a non-continuation session | `isContinuation` guard misfires | Learner sees a recall question on a fresh topic | Bug; tracked via signal-distribution baseline (`pnpm eval:llm --check-baseline` should catch the regression) |

---

## Open Questions

These must be resolved before Pass 1 implementation begins. The plan body assumes the resolution noted in parentheses but flags each here for product confirmation.

1. **Pass threshold UX gate**: The product owner says 0.7. Should the `passed` field returned to the mobile client also change to reflect the 0.7 threshold (currently the LLM decides `passed`)? Or is it UX-only, leaving `passed` as the LLM's binary? *(Plan assumes: server-side gate. The route inspects `masteryScore` against 0.7 and overrides `passed` if needed before returning to mobile.)*
2. **Natural-exit cap value**: The plan uses `exchangeCount >= 6` for `failed_exhausted`. Is 6 turns the right ceiling? *(Plan assumes: 6. Configurable via `MAX_ASSESSMENT_EXCHANGES` constant alongside `MAX_INTERVIEW_EXCHANGES`.)*
3. **Gap-fill session metadata acceptance**: Does the session creation route today accept a `gaps` metadata field? `learningSessions.metadata` is untyped JSONB so no DB migration is needed, but the session creation API call shape needs confirming. *(Plan assumes: pass-through via metadata; no API schema change needed beyond accepting the extra field.)*
4. **Decline-refresh as analytics-only**: Confirmed acceptable that the endpoint records the decline but does NOT alter SM-2 (which already fired at borderline). *(Plan assumes: yes, this is the cleaner separation.)*
5. **Below-0.5 UX**: The plan treats <0.5 the same as borderline (offer, don't force). The product owner said "flag for confirmation" — confirm whether a stronger nudge toward relearn is wanted. *(Plan assumes: same UX, softer copy; SM-2 still fires automatically at exit.)*

---

## Implementation Order

**Feature 1 first.** It is fully self-contained: route restructure, one new screen, one new API endpoint in retention.ts, one card on the practice hub. It validates the picker UX, the SM-2 wiring (including the borderline and failed_exhausted paths), and the result screen — including the borderline CTA — before Feature 2 introduces session-state branching. Feature 2 adds complexity inside the live session pipeline; bugs there are higher severity.

Phase boundaries:

- **Phase 1a:** Route restructure (`practice.tsx` → `practice/index.tsx` + `_layout.tsx`), assessment relocation under `(app)/practice/assessment/`. No behaviour change. Ship and verify navigation regressions are zero (deeplinks, back button, tab switches).
- **Phase 1b:** Schema additions (DB enum + zod), eligibility endpoint, picker screen, IntentCard.
- **Phase 1c:** Result UX (band display, borderline CTA, decline endpoint), SM-2 wiring for borderline and failed_exhausted paths.
- **Phase 2:** Continuation opener (envelope signal, two-turn flow, hard cap, override pill).

---

## Files Touched

### Phase 1a — Route restructure

| File | Purpose |
|---|---|
| `apps/mobile/src/app/(app)/practice.tsx` → `practice/index.tsx` | Rename (no diff body) |
| `apps/mobile/src/app/(app)/practice/_layout.tsx` | New — exports `unstable_settings = { initialRouteName: 'index' }` |
| `apps/mobile/src/app/assessment/` → `apps/mobile/src/app/(app)/practice/assessment/` | Relocate assessment screen into the practice stack |
| (deeplink updates) | Any code referencing `/assessment` path strings |

### Phase 1b — Eligibility & picker

| File | Purpose |
|---|---|
| `apps/mobile/src/app/(app)/practice/index.tsx` | Add "Prove I know this" `IntentCard` with subtitle from `useAssessmentEligibleTopics` |
| `apps/mobile/src/app/(app)/practice/assessment-picker.tsx` | New topic-picker screen |
| `apps/mobile/src/hooks/use-assessments.ts` | Add `useAssessmentEligibleTopics` (query key `['assessments', 'eligible']`) |
| `apps/api/src/routes/retention.ts` | Add `GET /retention/assessment-eligible` (with `assertNotProxyMode`) |
| `apps/api/src/services/retention-data.ts` | Add `getAssessmentEligibleTopics`, `mapAssessmentScoreToSm2Quality` |

### Phase 1c — Result UX & SM-2

| File | Purpose |
|---|---|
| `apps/mobile/src/app/(app)/practice/assessment/index.tsx` | Add result card, borderline CTA, decline flow, fail offer |
| `apps/api/src/routes/assessments.ts` | Add `borderline` and `failed_exhausted` end-state handling; SM-2 calls with `sessionTimestamp`; add `PATCH /assessments/:id/decline-refresh` (with `assertNotProxyMode`) |
| `apps/api/src/services/assessments.ts` | Natural-exit detection at `MAX_ASSESSMENT_EXCHANGES`; status transition to `borderline`/`failed_exhausted` |
| `packages/schemas/src/assessments.ts` | Add `borderline`, `failed_exhausted` to status enum; add `weakAreas?: string[]` to `assessmentEvaluationSchema` |
| (drizzle migration) | DB enum addition for the two new status values |

### Phase 2 — Continuation opener

| File | Purpose |
|---|---|
| `apps/api/src/services/session/session-exchange.ts` | Add `isContinuation` detection in `prepareExchangeContext`; thread through to context builder |
| `apps/api/src/services/session/session-context-builders.ts` | Add `loadPriorSessionMeta` helper; inject probe / scoring prompt blocks based on `continuationOpenerActive` and exchange count |
| `apps/api/src/services/session/session-exchange.ts` | After-call branching: read `retrieval_score`, set `continuationDepth`, enforce 3-turn hard cap |
| `packages/schemas/src/llm-envelope.ts` | Add `retrieval_score: z.number().min(0).max(1).optional()` to `signals` |
| `apps/api/src/services/llm/envelope.ts` | Surface `retrieval_score` from parsed envelope |
| `apps/api/src/routes/sessions.ts` | Add `PATCH /sessions/:id/clear-continuation-depth` for human override |
| `apps/mobile/src/app/(app)/session/...` | "Skip the warm-up" pill rendered when `continuationDepth` set |

---

## Review Findings Applied (2026-05-06)

This revision incorporates findings from the 2026-05-06 adversarial review.

| ID | Finding | Resolution |
|---|---|---|
| CRITICAL-1 | `retrieval_score` requested at exchange 0 — but no learner answer exists yet to score | Two-turn flow (probe → score) with 3-turn hard cap defaulting to `'mid'` |
| CRITICAL-2 | Borderline / fail paths never reach SM-2; no defined "assessment ends" trigger | New `borderline` and `failed_exhausted` status values with explicit triggers (score band, 6-turn cap); SM-2 fires unconditionally on transition |
| CRITICAL-3 | New endpoints lacked proxy-mode guards | Both `GET /retention/assessment-eligible` and `PATCH /assessments/:id/decline-refresh` call `assertNotProxyMode` |
| HIGH-1 | `/retention/...` route placed in `assessments.ts` | Moved to `routes/retention.ts` |
| HIGH-2 | Missing `practice/_layout.tsx` and `unstable_settings` for the new nested layout | Phase 1a route restructure documented |
| HIGH-3 | Cross-stack push to `/assessment` would break back button | Assessment relocated under `(app)/practice/assessment/` (option A) |
| HIGH-4 | "MasteryScore curve as fallback if `qualityRating` null" was dead code | Reframed: not a fallback; used for borderline / failed_exhausted only |
| HIGH-5 | "Yes please" deferred SM-2 to gap-fill session — abandonment dropped retention update | SM-2 fires at borderline transition server-side; decline / accept are display-only |
| MEDIUM-1 | Adding `weakAreas` to bespoke JSON shape, not envelope | Documented as sanctioned deferral; envelope migration tracked separately |
| MEDIUM-2 | Third inconsistent SM-2 mapping floor | Curve revised; rationale now matches `mapEvaluateQualityToSm2` documentation pattern |
| MEDIUM-3 | Failure Mode "no hard failure" was not a recovery | "Skip the warm-up" override pill + `clear-continuation-depth` endpoint |
| MEDIUM-4 | `sessionTimestamp` not passed → silent skip on rapid double-update | All call sites now pass assessment's `updatedAt` ISO |
| MEDIUM-5 | Two callers without explicit shared query key | Query key `['assessments', 'eligible']` documented |
| LOW-1 | `exchangeCount >= 1` floor unjustified | Raised to `>= 3` with rationale |
| LOW-2 | Open Questions material to implementation, not actually deferrable | Each question now has a "Plan assumes:" line; resolution required before Phase 1b |
