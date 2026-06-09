# Schema Contract & API Types — Codebase Atlas Review
**Lens:** Schema contract & API types
**Date:** 2026-06-09
**Owned area:** `packages/schemas/src/**`, `apps/api/src/routes/**` (zod validation), `apps/mobile/src/lib/api*`

---

## Summary

The shared `@eduagent/schemas` package is well-structured for most domain objects, but a critical rift has opened around the SSE session-completion contract: the canonical `sessionDonePayloadSchema` has 4 fields while the actual done frame built and consumed at runtime has 12+ fields. Beyond this primary drift, the mobile layer bypasses runtime validation on nearly every API response (~77 hook call sites), accepting raw `JSON.parse` results under TypeScript type assertions. Challenge-round endpoints have no canonical schemas at all. Together these gaps mean any server-side shape change to done frames, session objects, or challenge-round responses can silently corrupt mobile state.

---

## Critical

### C-1: `sessionDonePayloadSchema` severely underspecifies the actual SSE `done` frame — 4 schema fields vs 12+ in production

**Files:**
- `packages/schemas/src/sessions.ts:455–460` — schema definition
- `apps/api/src/routes/sessions.ts:144–182` — `DoneFrameSource` interface + `buildDoneFramePayload`
- `apps/mobile/src/lib/sse.ts:78–101` — `StreamDoneEvent` consumer interface

**Detail:**
`sessionDonePayloadSchema` (schemas/sessions.ts:455) declares only 4 fields: `exchangeCount`, `escalationRung`, `expectedResponseMinutes`, `aiEventId`. The server actually builds and emits 12 fields via `buildDoneFramePayload` (sessions.ts:164–182): `type`, `exchangeCount`, `escalationRung`, `expectedResponseMinutes`, `aiEventId`, `notePrompt`, `notePromptPostSession`, `fluencyDrill`, `confidence`, `readyToFinish`, `challengeRound`, `challengeOffer`, `draftedNote`. Mobile's `StreamDoneEvent` (sse.ts:78) independently declares the same 12 fields as an unvalidated TypeScript interface.

There is no single canonical Zod schema for the done frame shared between API and mobile. `sessionDonePayloadSchema` is the misleadingly-named contract that exists, and it is incomplete by 8 fields. The `DoneFrameSource` interface at sessions.ts:144 was introduced to fix BUG-797 (drift across code paths) but was never elevated to a schema in `@eduagent/schemas`.

**Impact:** Any field added or removed from `buildDoneFramePayload` is invisible to static analysis on the mobile consumer. Fields `notePrompt`, `readyToFinish`, `fluencyDrill`, `draftedNote`, etc. that drive UI decisions (show note prompt, trigger challenge offer, compose note) arrive through an unguarded type assertion.

---

## High

### H-1: 77 mobile hook call sites bypass runtime validation via `(await res.json()) as { ... }`

**Files (representative sample — all are in `apps/mobile/src/hooks/`):**
- `use-progress.ts` — 21 occurrences
- `use-sessions.ts` — 17 occurrences (lines 337, 616, 703, 720, 737, 758, 789, 813)
- `use-learner-profile.ts` — 16 occurrences (lines 70, 97, 126, 153, 187, 221, 251, 281, 315, 347)
- `use-settings.ts` — 8 occurrences (lines 76, 109, 135, 161, 271, 297, 417, 469)
- `use-notes.ts` — 4 occurrences (lines 125, 159, 247, 288)
- `use-assessments.ts` — 4 occurrences (lines 37, 66, 120, 157)
- `use-curriculum.ts` — 5 occurrences (lines 44, 69, 95, 124, 181)
- `use-retention.ts` — 3 occurrences (lines 84, 149, 213)
- `use-subjects.ts` — 2 occurrences (lines 160, 220)
- Additional: `use-bookmarks.ts`, `use-books.ts`, `use-celebrations.ts`, `use-coaching-card.ts`, `use-dashboard.ts`, `use-move-topic.ts`, `use-quiz.ts`, `use-vocabulary.ts`

**Detail:**
Every one of these call sites performs `(await res.json()) as SomeLocalType` — a TypeScript cast with no runtime enforcement. If the server changes a field name or drops a field, the cast succeeds silently and the consuming code reads `undefined` with the wrong static type.

The corresponding API routes generally return raw `c.json(result)` without calling `schema.parse()` on the response (see H-3 below), so the gap is bidirectional: no server-side parse guard, no client-side parse guard.

**Impact:** Silent type mismatch on any server shape change. Bugs present as `undefined is not a function` or silent no-ops rather than thrown errors, making root-cause analysis hard.

---

### H-2: `StreamDoneEvent.isComplete` field (sse.ts:84) is never emitted by the API — dead/stranded mobile field

**Files:**
- `apps/mobile/src/lib/sse.ts:84` — field declaration with doc-comment "Present on interview done events"
- `apps/api/src/routes/sessions.ts:144–182` — `DoneFrameSource` / `buildDoneFramePayload` — no `isComplete` field
- Searched all of `apps/api/src/` — zero occurrences of emitting `isComplete` in any SSE context

**Detail:**
`StreamDoneEvent.isComplete?: boolean` is documented as "Present on interview done events; absent on learning sessions." The API has no interview-done code path that emits `isComplete`. `buildDoneFramePayload` (the sole construction point for done frames) does not include it. Any mobile code that branches on `event.isComplete` will always evaluate the falsy path.

**Impact:** Any feature gated on `isComplete` is silently broken. The field cannot be distinguished from a genuine optional absence by static analysis or code review.

---

### H-3: Challenge-round request and response shapes are not in `@eduagent/schemas` — no canonical contract

**File:** `apps/api/src/routes/challenge-round.ts:13–20`

```ts
// Lines 13–20 — locally defined, not imported from @eduagent/schemas
const challengeRoundRequestSchema = z.object({
  sessionId: z.string().uuid(),
  topicId: z.string().uuid(),
});

const declineChallengeRoundRequestSchema = challengeRoundRequestSchema.extend({
  dontAskAgain: z.boolean().default(false),
});
```

All three endpoints (`/challenge-round/accept`, `/challenge-round/decline`, `/challenge-round/abort`) return `c.json({ challengeRound })` (lines 34, 48, 62) with no `.parse()` call against any schema. The shape of `challengeRound` is whatever the service layer returns.

**Impact:** The mobile consumer reads the challenge-round object through a type assertion (see H-1). There is no shared type or Zod schema that both the API and mobile agree on for challenge-round state, making the contract invisible to automated enforcement.

---

### H-4: `ResumeNudgeCandidate` interface locally defined in service layer — endpoint returns it unvalidated

**Files:**
- `apps/api/src/services/session/session-crud.ts:1552–1557` — interface definition
- `apps/api/src/routes/sessions.ts:231–235` — endpoint returns `c.json({ nudge })` without parse

```ts
// session-crud.ts:1552
export interface ResumeNudgeCandidate {
  sessionId: string;
  topicHint: string;
  exchangeCount: number;
  createdAt: string;
}

// sessions.ts:231
.get('/sessions/resume-nudge', async (c) => {
  const nudge = await getResumeNudgeCandidate(db, profileId);
  return c.json({ nudge });   // no schema parse
})
```

**Impact:** No canonical schema in `@eduagent/schemas`. Mobile hook reads this via type assertion. If `topicHint` becomes nullable or `createdAt` changes format, both sides fail silently.

---

### H-5: `processMessage` route returns `clientResult` without schema validation

**File:** `apps/api/src/routes/sessions.ts:545`

```ts
return c.json(clientResult);  // no schema.parse()
```

`clientResult` is the post-exchange result object assembled from service layer, stripped of `sourceAudit`. It includes the fields that drive the session UI state (session status, exchange counts, filing state, etc.). There is no `processMessageResponseSchema` in `@eduagent/schemas`.

**Impact:** The most frequently called endpoint in the session flow returns an unguarded shape. Mobile reads the result via type assertion.

---

## Medium

### M-1: Multiple session GET/PATCH routes return `c.json({ session })` without `learningSessionSchema.parse()`

**File:** `apps/api/src/routes/sessions.ts` — lines 312, 325, 360, 403, 421, 448, 475, 1341

Every one of these returns `c.json({ session })` where `session` is the raw Drizzle row returned from the service. `learningSessionSchema` exists in `@eduagent/schemas` (sessions.ts:327) and is used in some routes (`getSubjectSessionsResponseSchema.parse(...)` at line 244), but not on any single-session GET or PATCH response.

**Impact:** Drizzle date-object vs ISO-string normalization (the `isoDateField` union in common.ts) is bypassed on these paths. Raw `Date` objects from Drizzle can leak into responses and cause JSON serialization differences from parsed-and-re-serialized responses.

---

### M-2: Session close and summary-submit responses lack schema validation

**File:** `apps/api/src/routes/sessions.ts:1289, 1474`

- Line 1289: `return c.json({ ...result, pipelineQueued })` — close session. `result` comes from `skipSummaryResponseSchema`-shaped service output but is not parsed through it.
- Line 1474: `return c.json({ ...result, pipelineQueued })` — submit summary. Same pattern. `skipSummaryResponseSchema` exists in `@eduagent/schemas` (sessions.ts:508) and would be the right parse target.

---

### M-3: `evaluate-depth` and interleaved-session creation return raw service results

**File:** `apps/api/src/routes/sessions.ts:652, 1489`

- Line 652: `return c.json(result)` — evaluate-depth result, no schema
- Line 1489: `return c.json(result, 201)` — interleaved session creation, no schema

---

### M-4: SSE sub-event types (`FluencyDrillEvent`, `ChallengeRoundOfferEvent`, `DraftedChallengeNoteEvent`) locally defined in mobile — not in `@eduagent/schemas`

**File:** `apps/mobile/src/lib/sse.ts:61–76`

```ts
export interface FluencyDrillEvent {        // line 61
  active: boolean;
  durationSeconds?: number;
  score?: { correct: number; total: number };
}

export interface ChallengeRoundOfferEvent { // line 67
  pitch: string;
}

export interface DraftedChallengeNoteEvent { // line 71
  id: string;
  body: string | null;
  sourceAnswerEventIds: string[];
  fallbackPrompt?: string;
}
```

All three are fields on `StreamDoneEvent` and are populated from done frame data emitted by the API. Their shapes are defined in `apps/api/src/routes/sessions.ts:144–157` (`DoneFrameSource`) as `unknown` typed, making the interface the only documentation on both sides.

`packages/schemas/src/stream-fallback.ts` (exported from index) covers the `fallback` and `error` SSE frames with Zod schemas, but does not cover the `done` frame or any of its nested sub-event types.

---

### M-5: `retryRequestSchema` in filing.ts locally overlaps with (but diverges from) `filingRetryEventSchema` in `@eduagent/schemas`

**Files:**
- `apps/api/src/routes/filing.ts:56–59` — local `retryRequestSchema`
- `packages/schemas/src/inngest-events.ts:14` — `filingRetryEventSchema`

The local schema: `{ sessionId: uuid, sessionMode: enum(['freeform','homework']).default('freeform') }`.
The Inngest schema: `{ profileId: uuid, sessionId: uuid, sessionMode: enum([...]) }` (no default, includes profileId).

These represent different payloads (HTTP request vs Inngest event) but the partial overlap and separate evolution paths mean session-mode enum values or defaults can diverge without a type error.

---

### M-6: `DELETE /learner-profile/all` (lines 172, 183) returns raw `{ success: true }` — inconsistent with sibling endpoints

**File:** `apps/api/src/routes/learner-profile.ts:172, 183`

Both deletion endpoints return `c.json({ success: true })` without `learnerProfileSuccessResponseSchema.parse()`. Every other mutation in the same file (lines 136, 162, 198, 216, 238, 261, 283, 306, 324) calls `learnerProfileSuccessResponseSchema.parse({ success: true })`. The inconsistency is harmless today (the schema only wraps `{ success: true }`) but creates a false impression that the parse step is optional.

---

### M-7: Transcript response returned without schema validation

**File:** `apps/api/src/routes/sessions.ts:585`

```ts
return c.json(transcript);  // no schema.parse()
```

`sessionTranscriptSchema` exists in `@eduagent/schemas` (sessions.ts:444) and covers the transcript shape. It is unused at this call site.

---

## Low

### L-1: Local UUID param schemas duplicated across route files

**Files:**
- `apps/api/src/routes/notes.ts:49–61` — `bookParamSchema`, `topicParamSchema`, `noteIdParamSchema`
- `apps/api/src/routes/sessions.ts:239` — inline `z.object({ subjectId: z.string().uuid() })` instead of shared param schema
- `apps/api/src/routes/settings.ts:72` — local `subjectParamSchema`
- `apps/api/src/routes/books.ts:53, 57` — local `subjectParamSchema`, `bookParamSchema`

Route-level param schemas are appropriate to keep co-located with routes and need not be in `@eduagent/schemas`. Documented here for completeness; not a contract risk.

---

### L-2: `conceptMasteryQuerySchema` defined locally in notes.ts (line 65)

**File:** `apps/api/src/routes/notes.ts:65–101`

Complex CSV-to-UUID-array transform with custom validation. Appropriate to keep close to the route. Not a contract risk, but if a second endpoint needs the same query shape, it should be lifted to schemas.

---

### L-3: `revenuecatWebhookSchema` locally defined in revenuecat-webhook.ts

**File:** `apps/api/src/routes/revenuecat-webhook.ts:98`

This is a third-party webhook payload schema. Keeping it local to the route is the correct pattern (it's a boundary schema, not an internal contract). Documented for completeness.

---

### L-4: `isValidStreamEvent` in sse.ts is a hand-rolled validator rather than a Zod parse

**File:** `apps/mobile/src/lib/sse.ts:121–133`

The runtime guard for incoming SSE events is a manual boolean-returning function rather than a `.safeParse()` call against a Zod schema. It provides weaker guarantees (only checks required discriminant fields, not field types or nested shapes). This is a consequence of there being no canonical Zod schema for the done frame (see C-1).

---

## Cross-Lens Issues

These findings touch other lenses and should be triaged by the relevant lens owner:

- **Dead code / feature completeness:** `StreamDoneEvent.isComplete` (sse.ts:84) is declared and documented but never emitted by the API. Any mobile code path that reads `event.isComplete` is unreachable in practice. Belongs in a "dead code" or "feature completeness" lens. (Also reported as H-2 here.)

- **Testing & QA:** The 77 mobile hook type assertions (H-1) mean integration tests that stub API responses with inline objects cannot catch shape drift. A QA lens should assess whether the test layer would catch any of these regressions today.

- **LLM / AI surface:** `DraftedChallengeNoteEvent.sourceAnswerEventIds` (sse.ts:73) is consumed by the mobile note-composition flow. If the API changes this field (which originates from the challenge-round LLM evaluation), the mobile silently breaks. Relevant to any LLM-surface lens review.

- **Error observability:** Several of the unvalidated `c.json(result)` call sites (M-2, M-3, H-3) bypass `schema.parse()`, which means Zod validation errors that would surface shape bugs in staging are not thrown. Relevant to an error-observability or testing lens.
