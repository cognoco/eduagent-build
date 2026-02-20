# Session Features Implementation Plan

## Overview

Three stories implementing new session-related features:
1. **Story 4.6** — Interleaved retrieval sessions with stability tracking (FR92, FR93)
2. **Story 2.7** — Recall bridge after homework success (UX-15)
3. **Story 2.5** — Complete homework OCR endpoint with provider interface

---

## Story 4.6: Interleaved Retrieval Sessions

### Analysis

The `session_type` DB enum currently only has `['learning', 'homework']`. We need to add `'interleaved'` to support mixed-topic retrieval sessions. The `retentionCards` table already has `consecutiveSuccesses` but no 'stable' status concept.

Key requirements:
- Start an interleaved session that selects topics from multiple subjects due for review
- Use the same exchange pipeline (session.ts -> exchanges.ts -> LLM)
- Feed results back into SM-2 per topic
- Mark topics as "Stable" after 5+ consecutive successful retrievals
- Stable topics still appear in interleaved sessions at reduced frequency (SM-2 intervals handle this)

### Changes

#### 1. Database: Add 'interleaved' to session_type enum

**File:** `packages/database/src/schema/sessions.ts`
- Add `'interleaved'` to `sessionTypeEnum` array: `['learning', 'homework', 'interleaved']`

#### 2. Schemas: Update session type enum + add interleaved types

**File:** `packages/schemas/src/sessions.ts`
- Update `sessionTypeSchema` to: `z.enum(['learning', 'homework', 'interleaved'])`
- Add `interleavedSessionStartSchema` with `subjectId` (optional, for single-subject interleaving) and `topicCount` (optional, default 5, max 10)

**File:** `packages/schemas/src/assessments.ts`
- Add `topicStabilitySchema` with `topicId`, `isStable`, `consecutiveSuccesses` fields
- Export from barrel

#### 3. Service: Interleaved session topic selection

**File:** `apps/api/src/services/interleaved.ts` (new)
- `selectInterleavedTopics(db, profileId, opts?)` — queries `retentionCards` for topics due for review (or approaching review), randomizes order, returns topic list
  - Uses `nextReviewAt <= now` as primary filter, falls back to most-stale topics if < `topicCount` due
  - Returns `Array<{ topicId, subjectId, topicTitle }>` for prompt context
- `isTopicStable(consecutiveSuccesses: number): boolean` — returns true if >= 5
- `getStableTopics(db, profileId, subjectId?): Promise<TopicStability[]>` — returns stability status per topic (queries retention_cards, checks consecutiveSuccesses >= 5)

#### 4. Service: Update ExchangeContext for interleaved type

**File:** `apps/api/src/services/exchanges.ts`
- Extend `ExchangeContext.sessionType` union to include `'interleaved'`
- Add `getSessionTypeGuidance` case for `'interleaved'`:
  - "Session type: INTERLEAVED RETRIEVAL. Topics are mixed to strengthen discrimination and long-term retention..."

#### 5. Service: Update session.ts to handle interleaved sessions

**File:** `apps/api/src/services/session.ts`
- Update `startSession` — already accepts `sessionType` from input, so `'interleaved'` will work once the schema/DB enum is updated
- Update `prepareExchangeContext` — the cast `as 'learning' | 'homework'` on line 242 needs to include `'interleaved'`
- Interleaved sessions may not have a single `topicId`; the first topic from the selected set is used for the initial exchange, and the route can switch topics between exchanges via metadata

#### 6. Route: Add interleaved session start + topic stability endpoint

**File:** `apps/api/src/routes/sessions.ts`
- The existing `POST /subjects/:subjectId/sessions` already accepts `sessionType`, so starting an interleaved session works through the same endpoint
- Add `GET /retention/stability` to `apps/api/src/routes/retention.ts` — returns stable topics for a profile (optionally filtered by subjectId query param)

#### 7. Retention update: Track stability in retention service

**File:** `apps/api/src/services/retention.ts`
- Add `STABILITY_THRESHOLD = 5` constant
- Add `isTopicStable(state: RetentionState): boolean` helper

**File:** `apps/api/src/services/retention-data.ts`
- Add `getStableTopics` function that queries retention_cards where `consecutiveSuccesses >= 5`

#### 8. Tests

**File:** `apps/api/src/services/interleaved.test.ts` (new)
- Topic selection logic: correct filtering, randomization, fallback when few due
- Stability threshold: 4 = not stable, 5 = stable

**File:** `apps/api/src/services/retention.test.ts`
- Add tests for `isTopicStable`

**File:** `apps/api/src/routes/retention.test.ts`
- Add test for `GET /retention/stability`

---

## Story 2.7: Recall Bridge After Homework Success

### Analysis

After homework completion, the system should present a brief recall warmup (1-2 questions) on the underlying concept. This is positioned as a celebration, not extra work. If skipped, session closes without penalty.

Currently, `closeSession` in session.ts marks the session as completed and dispatches `app/session.completed` via Inngest. The recall bridge should happen *before* the final close — it's a mini-exchange within the same session.

### Design Decision

The recall bridge is best modeled as a service function that:
1. Generates 1-2 recall questions via LLM about the homework topic's underlying concept
2. Returns the questions + a flag indicating the session is in "recall bridge" phase
3. The mobile client shows these questions; learner answers are processed through the normal `processMessage` pipeline
4. If skipped, session metadata records `recallBridgeSkipped: true`

### Changes

#### 1. Service: Recall bridge generation

**File:** `apps/api/src/services/recall-bridge.ts` (new)
- `generateRecallBridge(db, profileId, sessionId): Promise<RecallBridgeResult>` — loads the session's topic, generates 1-2 recall questions via `routeAndCall` with a specific prompt
- `RecallBridgeResult` type: `{ questions: string[]; topicId: string; topicTitle: string }`
- Uses rung 1 (cheapest model) since these are simple recall questions

#### 2. Schema: Add recall bridge types

**File:** `packages/schemas/src/sessions.ts`
- Add `recallBridgeResultSchema` with `questions`, `topicId`, `topicTitle`
- Add `RecallBridgeResult` type export

#### 3. Route: Recall bridge endpoint

**File:** `apps/api/src/routes/sessions.ts`
- Add `POST /sessions/:sessionId/recall-bridge` — calls `generateRecallBridge`, returns questions
- The endpoint validates the session is a homework session and is still active

#### 4. Session close enhancement

**File:** `apps/api/src/services/session.ts`
- `closeSession` already works as-is; the mobile client handles the recall bridge flow before calling close
- The `sessionCloseSchema` already has an optional `reason` field; we don't need additional fields since the recall bridge is a pre-close UI flow

#### 5. Tests

**File:** `apps/api/src/services/recall-bridge.test.ts` (new)
- Generates questions for valid homework session
- Returns empty for learning sessions (not homework)
- Handles missing topic gracefully

---

## Story 2.5: Complete Homework OCR Endpoint

### Analysis

The OCR endpoint at `POST /v1/ocr` exists with MIME type and size validation, but returns hardcoded empty results. We need:
1. An `OcrProvider` interface for swappable implementations
2. A `StubOcrProvider` that returns mock results (for development/testing)
3. Wire the provider into the route
4. Also wire the homework start route (`POST /v1/subjects/:subjectId/homework`) to actually create a session

### Changes

#### 1. Service: OCR provider interface + stub

**File:** `apps/api/src/services/ocr.ts` (new)
- `OcrProvider` interface:
  ```typescript
  export interface OcrProvider {
    extractText(image: ArrayBuffer, mimeType: string): Promise<OcrResult>;
  }
  ```
- `StubOcrProvider` class implementing `OcrProvider`:
  - Returns `{ text: 'Stub OCR text for testing', confidence: 0.95, regions: [{ text: 'Stub OCR text for testing', confidence: 0.95, boundingBox: { x: 0, y: 0, width: 100, height: 50 } }] }`
- `createOcrProvider(type?: string): OcrProvider` factory function — returns `StubOcrProvider` by default, extensible for future real providers
- Module-level `getOcrProvider()` / `setOcrProvider()` for DI (same pattern as LLM router)

#### 2. Route: Wire OCR provider into homework route

**File:** `apps/api/src/routes/homework.ts`
- Update `POST /v1/ocr` to call `getOcrProvider().extractText(imageBuffer, file.type)`
- Update `POST /v1/subjects/:subjectId/homework` to create a real homework session via `startSession` service (replacing the placeholder response)
- Import `startSession` from services/session and use it with `sessionType: 'homework'`

#### 3. Tests

**File:** `apps/api/src/services/ocr.test.ts` (new)
- `StubOcrProvider` returns expected structure
- `createOcrProvider()` returns stub by default
- `OcrResult` shape validation

**File:** `apps/api/src/routes/homework.test.ts` (update)
- Update existing OCR test expectations to match new stub provider output
- Update homework session test to expect a real session structure (from startSession)
- Add mock for `startSession` service

---

## Implementation Order

1. **Database schema change** (session_type enum) — foundation for everything
2. **Schema updates** (Zod schemas in @eduagent/schemas) — types for all stories
3. **Story 2.5** (OCR provider + homework route) — smallest, most self-contained
4. **Story 2.7** (Recall bridge) — depends on homework sessions working
5. **Story 4.6** (Interleaved retrieval) — most complex, needs all types ready

## Files Changed Summary

**New files:**
- `apps/api/src/services/interleaved.ts` + `interleaved.test.ts`
- `apps/api/src/services/recall-bridge.ts` + `recall-bridge.test.ts`
- `apps/api/src/services/ocr.ts` + `ocr.test.ts`

**Modified files:**
- `packages/database/src/schema/sessions.ts` — add 'interleaved' to enum
- `packages/schemas/src/sessions.ts` — add types for all 3 stories
- `apps/api/src/services/exchanges.ts` — extend sessionType union + guidance
- `apps/api/src/services/session.ts` — update type cast for interleaved
- `apps/api/src/services/retention.ts` — add stability helper
- `apps/api/src/services/retention-data.ts` — add getStableTopics
- `apps/api/src/routes/homework.ts` — wire OCR provider + real session creation
- `apps/api/src/routes/homework.test.ts` — update expectations
- `apps/api/src/routes/sessions.ts` — add recall-bridge endpoint
- `apps/api/src/routes/retention.ts` — add stability endpoint
- `apps/api/src/routes/retention.test.ts` — add stability tests
- `apps/api/src/services/session-lifecycle.ts` — extend sessionType union
