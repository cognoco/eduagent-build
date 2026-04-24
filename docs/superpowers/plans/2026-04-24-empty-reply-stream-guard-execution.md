# Empty-Reply Stream Guard — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Policy (from spec header):** This file AND the spec `2026-04-23-empty-reply-stream-guard.md` are **LOCAL-ONLY — never staged, never committed**. All commits use targeted `git add <file>` — never `git add -A` or `git add .`. Landing branch: `proxy-parent-fix`.

**Goal:** Stop the "empty bubble + feedback chips dead-end" when the LLM returns a malformed envelope, empty reply, or orphan marker. Convert to a reconnect-prompt bubble with a working "Try Again" affordance.

**Architecture:** Two-layer defense. **Layer 1** (server) — detect bad outcomes in `onComplete`, skip persisting polluted content (protects `exchangeHistory` from cascade, see spec §2 Prereq 1c), emit a dedicated `fallback` SSE event before `done`. **Layer 2** (mobile) — finalizer converts to `kind: 'reconnect_prompt'` either on explicit `fallback` event OR on zero-chunk stream, idempotent vs. the 45s watchdog. Marker regex strip on mobile is deleted; detection consolidates to a single server helper.

**Tech Stack:** Hono (API), Drizzle ORM, Neon Postgres, Inngest, Jest, React Native (Expo), SSE.

**Spec:** `docs/superpowers/plans/2026-04-23-empty-reply-stream-guard.md` — read that first. This plan implements it.

---

## File Structure — What gets touched where

### Server (API)

| File | Responsibility | Status |
|---|---|---|
| `apps/api/src/services/llm/envelope.ts` | `parseEnvelope` + `isRecognizedMarker` canonical detector | `isRecognizedMarker` **already added** (pre-staged for commit 1). Tests pending. |
| `apps/api/src/services/llm/envelope.test.ts` | Envelope unit tests | Extended in Task 1.1. |
| `apps/api/src/services/llm/index.ts` | Barrel re-exports | `isRecognizedMarker` **already exported**. |
| `apps/api/src/services/exchanges.ts` | `parseExchangeEnvelope` + new `classifyExchangeOutcome` | Extended in Task 1.2. |
| `apps/api/src/services/exchanges.test.ts` | Exchanges unit tests | Extended in Task 1.2. |
| `apps/api/src/services/session/session-exchange.ts` | `streamMessage.onComplete` rewrite + new `persistFallbackUserMessage` | Modified in Tasks 1.3 and 1.4. |
| `apps/api/src/services/session/session-exchange.test.ts` | Service unit tests | Extended in Tasks 1.3 and 1.4. |
| `apps/api/src/services/interview.ts` | Inline `onComplete` rewrite — fallback must NOT advance `exchangeCount` | Modified in Task 1.5. |
| `apps/api/src/services/interview.test.ts` | Interview tests | Extended in Task 1.5. |
| `apps/api/src/routes/sessions.ts` | Emit `fallback` SSE event before `done`; refund quota on fallback | Modified in Task 2.1. |
| `apps/api/src/routes/sessions.test.ts` | Route tests | Extended in Task 2.1. |
| `apps/api/src/routes/interview.ts` | Same, for interview route | Modified in Task 2.2. |
| `apps/api/src/routes/interview.test.ts` | Route tests | Extended in Task 2.2. |
| `apps/api/integration-tests/sessions-stream.test.ts` | End-to-end SSE integration test | Extended in Task 2.3. |

### Mobile

| File | Responsibility | Status |
|---|---|---|
| `apps/mobile/src/components/session/use-session-streaming.ts` | Finalizer fallback branch + idempotency + watchdog cleanup + delete marker regex strip | Modified in Tasks 3.1-3.3. |
| `apps/mobile/src/components/session/use-session-streaming.test.ts` | Hook tests | Extended in Tasks 3.1-3.3. |
| `apps/mobile/src/components/session/SessionMessageActions.tsx` | Chip-gate switches from `isSystemPrompt` to `kind`-based | Modified in Task 3.4. |
| `apps/mobile/src/components/session/SessionMessageActions.test.tsx` | Component tests | Extended in Task 3.4. |

---

## Task Grouping

| Commit | Tasks | Bundled finding ID |
|---|---|---|
| `[EMPTY-REPLY-GUARD-1]` | 1.1 → 1.6 | API detection Layer 1a |
| `[EMPTY-REPLY-GUARD-2]` | 2.1 → 2.4 | API SSE emission Layer 1b |
| `[EMPTY-REPLY-GUARD-3]` | 3.1 → 3.5 | Mobile Layer 2 |

Single PR containing all three commits, per spec §10.

---

# Commit 1 — `[EMPTY-REPLY-GUARD-1]`: Server-Side Detection

## Task 1.1: Unit tests for `isRecognizedMarker`

**Files:**
- Modify: `apps/api/src/services/llm/envelope.test.ts`
- Reference: `apps/api/src/services/llm/envelope.ts:66-107` (already implemented)

- [ ] **Step 1: Add failing tests for `isRecognizedMarker`**

Append to `apps/api/src/services/llm/envelope.test.ts`:

```typescript
import { parseEnvelope, isRecognizedMarker } from './envelope';

describe('isRecognizedMarker', () => {
  it('returns true for a bare notePrompt marker', () => {
    expect(isRecognizedMarker('{"notePrompt":true}')).toBe(true);
  });

  it('returns true for a bare fluencyDrill marker', () => {
    expect(isRecognizedMarker('{"fluencyDrill":{"active":true}}')).toBe(true);
  });

  it('returns true for a bare escalationHold marker', () => {
    expect(isRecognizedMarker('{"escalationHold":true}')).toBe(true);
  });

  it('returns false for a full envelope (has reply)', () => {
    expect(isRecognizedMarker('{"reply":"hi","notePrompt":true}')).toBe(false);
  });

  it('returns false for unknown single-key JSON', () => {
    expect(isRecognizedMarker('{"randomField":true}')).toBe(false);
  });

  it('returns false for non-object JSON', () => {
    expect(isRecognizedMarker('"just a string"')).toBe(false);
    expect(isRecognizedMarker('["array"]')).toBe(false);
    expect(isRecognizedMarker('42')).toBe(false);
  });

  it('returns false for malformed JSON', () => {
    expect(isRecognizedMarker('{"notePrompt":')).toBe(false);
  });

  it('returns false for plain prose', () => {
    expect(isRecognizedMarker('Hello, how are you?')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isRecognizedMarker('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd apps/api && pnpm exec jest src/services/llm/envelope.test.ts --no-coverage
```

Expected: all `isRecognizedMarker` tests PASS (function is already implemented). If any FAIL, fix the implementation at `envelope.ts:66-107` before proceeding.

- [ ] **Step 3: No commit yet** — this work lands with the rest of commit 1 at Task 1.6.

---

## Task 1.2: `classifyExchangeOutcome` wrapper in `exchanges.ts`

This is the core classifier. It wraps `parseExchangeEnvelope` and returns a discriminated `{ parsed, fallback? }` result using the three reason buckets.

**Files:**
- Modify: `apps/api/src/services/exchanges.ts` (add new function after `parseExchangeEnvelope` at line 487 or wherever the function ends)
- Modify: `apps/api/src/services/exchanges.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests first**

Append to `apps/api/src/services/exchanges.test.ts`:

```typescript
import {
  parseExchangeEnvelope,
  classifyExchangeOutcome,
  type ExchangeFallbackReason,
} from './exchanges';

describe('classifyExchangeOutcome', () => {
  const ctx = { sessionId: 's1', profileId: 'p1', flow: 'streamMessage' as const };

  it('no fallback when envelope parses and reply is non-empty', () => {
    const raw = JSON.stringify({
      reply: 'hello',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
    });
    const result = classifyExchangeOutcome(raw, ctx);
    expect(result.fallback).toBeUndefined();
    expect(result.parsed.cleanResponse).toBe('hello');
  });

  it('fallback reason=empty_reply when envelope parses but reply is ""', () => {
    const raw = JSON.stringify({
      reply: '',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
    });
    const result = classifyExchangeOutcome(raw, ctx);
    expect(result.fallback?.reason).toBe('empty_reply');
    expect(result.fallback?.fallbackText).toMatch(/try again/i);
  });

  it('fallback reason=empty_reply when reply is whitespace only', () => {
    const raw = JSON.stringify({
      reply: '   \n\t  ',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
    });
    const result = classifyExchangeOutcome(raw, ctx);
    expect(result.fallback?.reason).toBe('empty_reply');
  });

  it('fallback reason=malformed_envelope on parse failure with non-marker raw', () => {
    const raw = 'plain text, no json';
    const result = classifyExchangeOutcome(raw, ctx);
    expect(result.fallback?.reason).toBe('malformed_envelope');
  });

  it('fallback reason=orphan_marker on bare marker (no handler dispatch)', () => {
    const raw = '{"notePrompt":true}';
    const result = classifyExchangeOutcome(raw, ctx);
    expect(result.fallback?.reason).toBe('orphan_marker');
  });
});
```

- [ ] **Step 2: Run the tests — expect failures**

```bash
cd apps/api && pnpm exec jest src/services/exchanges.test.ts --no-coverage -t classifyExchangeOutcome
```

Expected: FAIL with "classifyExchangeOutcome is not a function" or equivalent.

- [ ] **Step 3: Implement `classifyExchangeOutcome`**

In `apps/api/src/services/exchanges.ts`, after `parseExchangeEnvelope` (current end around line 487), add:

```typescript
// ---------------------------------------------------------------------------
// classifyExchangeOutcome — wraps parseExchangeEnvelope and classifies the
// outcome into a fallback bucket per spec §4.1a. The classification is used
// by streamMessage.onComplete (and interview.ts:onComplete) to decide
// whether to persist the ai_response row, refund quota, and emit a
// dedicated SSE `fallback` event in the route layer.
//
// The three reason buckets are distinct on purpose (spec §7): they let
// triage separate "LLM format drift" (malformed_envelope) from
// "widget-trigger without handler" (orphan_marker) from "LLM refused to
// answer" (empty_reply) without parsing Inngest event names.
// ---------------------------------------------------------------------------

export type ExchangeFallbackReason =
  | 'empty_reply'
  | 'malformed_envelope'
  | 'orphan_marker';

export interface ExchangeFallback {
  reason: ExchangeFallbackReason;
  fallbackText: string;
}

export interface ClassifiedExchangeOutcome {
  parsed: ParsedExchangeEnvelope;
  fallback?: ExchangeFallback;
}

const DEFAULT_FALLBACK_TEXT = "I didn't have a reply — tap to try again.";

export function classifyExchangeOutcome(
  rawResponse: string,
  context?: { sessionId?: string; profileId?: string; flow?: string }
): ClassifiedExchangeOutcome {
  const markerDetected = isRecognizedMarker(rawResponse);
  const parsed = parseExchangeEnvelope(rawResponse, context);

  const cleanTrimmed = parsed.cleanResponse.trim();

  // empty_reply: envelope parsed OK (cleanResponse came from envelope.reply)
  // but the reply string is empty/whitespace.
  //
  // We detect this by checking whether parseEnvelope succeeded AND the
  // clean response is empty. parseExchangeEnvelope does not expose its
  // success/failure flag directly, so we re-run parseEnvelope here for
  // the distinction. This double-parse cost is negligible (happens once
  // per turn) and keeps the classifier self-contained.
  const envelopeResult = parseEnvelope(rawResponse);

  if (envelopeResult.ok && cleanTrimmed === '') {
    return {
      parsed,
      fallback: { reason: 'empty_reply', fallbackText: DEFAULT_FALLBACK_TEXT },
    };
  }

  // orphan_marker: raw is a recognized marker and no handler dispatch
  // applies. For commit 1 scope, treat ALL recognized markers as orphan —
  // real handlers are wired in §4.4 follow-up. If a caller needs to
  // dispatch a marker, it can inspect `isRecognizedMarker(raw)` before
  // calling classifyExchangeOutcome.
  if (markerDetected) {
    return {
      parsed,
      fallback: { reason: 'orphan_marker', fallbackText: DEFAULT_FALLBACK_TEXT },
    };
  }

  // malformed_envelope: envelope parse failed and raw is not a marker.
  if (!envelopeResult.ok) {
    return {
      parsed,
      fallback: {
        reason: 'malformed_envelope',
        fallbackText: DEFAULT_FALLBACK_TEXT,
      },
    };
  }

  // Envelope parsed OK and reply is non-empty — normal path.
  return { parsed };
}
```

Add the `isRecognizedMarker` import at the top of `exchanges.ts`:

```typescript
import {
  routeAndCall,
  routeAndStream,
  parseEnvelope,
  isRecognizedMarker,
  teeEnvelopeStream,
} from './llm';
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
cd apps/api && pnpm exec jest src/services/exchanges.test.ts --no-coverage -t classifyExchangeOutcome
```

Expected: PASS on all 5 new cases.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

Expected: no errors introduced by the new code.

- [ ] **Step 6: No commit yet** — continues in Task 1.3.

---

## Task 1.3: `persistFallbackUserMessage` helper in `session-exchange.ts`

When fallback fires, we still want to preserve the user's message (so the transcript shows what they asked), but **not** write the `ai_response` row and **not** advance `exchangeCount`. This task adds the helper; Task 1.4 wires it in.

**Files:**
- Modify: `apps/api/src/services/session/session-exchange.ts` (add new export function near `persistExchangeResult` around line 838)
- Modify: `apps/api/src/services/session/session-exchange.test.ts` (add tests)

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/services/session/session-exchange.test.ts`:

```typescript
import { persistFallbackUserMessage } from './session-exchange';

describe('persistFallbackUserMessage', () => {
  it('persists only the user_message row and does not advance exchangeCount', async () => {
    const sessionId = await createTestSession();
    const profileId = (await getTestProfile()).id;
    const initialCount = (await getSession(db, profileId, sessionId))
      .exchangeCount;

    await persistFallbackUserMessage(db, profileId, sessionId, 'hello');

    const events = await db.query.sessionEvents.findMany({
      where: eq(sessionEvents.sessionId, sessionId),
      orderBy: desc(sessionEvents.createdAt),
    });

    // Only user_message added — no ai_response
    const added = events.filter((e) =>
      ['user_message', 'ai_response'].includes(e.eventType)
    );
    expect(added.filter((e) => e.eventType === 'ai_response')).toHaveLength(0);
    expect(
      added.filter((e) => e.eventType === 'user_message').at(0)?.content
    ).toBe('hello');

    // exchangeCount unchanged
    const session = await getSession(db, profileId, sessionId);
    expect(session.exchangeCount).toBe(initialCount);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd apps/api && pnpm exec jest src/services/session/session-exchange.test.ts --no-coverage -t persistFallbackUserMessage
```

Expected: FAIL with "persistFallbackUserMessage is not exported" or TypeScript compile error.

- [ ] **Step 3: Implement `persistFallbackUserMessage`**

In `apps/api/src/services/session/session-exchange.ts`, add a new export after `persistExchangeResult`:

```typescript
// ---------------------------------------------------------------------------
// persistFallbackUserMessage — writes ONLY the user_message row when a
// fallback outcome fires (empty_reply / malformed_envelope / orphan_marker).
// Deliberately does NOT:
//   - write an ai_response row (would pollute exchangeHistory on the next
//     turn — this is the cascade fix per spec §2 Prereq 1c / §4.1a)
//   - increment exchangeCount (fallback didn't produce a real exchange)
//   - advance escalationRung (behavioral state is only updated on real
//     exchanges)
//
// Quota refund is handled at the route layer in [EMPTY-REPLY-GUARD-2] by
// reading the fallback flag and calling incrementQuota(-1) on fallback.
// ---------------------------------------------------------------------------

export async function persistFallbackUserMessage(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  await db.insert(sessionEvents).values({
    sessionId,
    profileId,
    subjectId: session.subjectId,
    eventType: 'user_message' as const,
    content: userMessage,
  });
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd apps/api && pnpm exec jest src/services/session/session-exchange.test.ts --no-coverage -t persistFallbackUserMessage
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: No commit yet** — continues in Task 1.4.

---

## Task 1.4: Modify `streamMessage.onComplete` to route through the classifier

**Files:**
- Modify: `apps/api/src/services/session/session-exchange.ts:1065-1111`
- Modify: `apps/api/src/services/session/session-exchange.test.ts`

- [ ] **Step 1: Write failing tests for `onComplete` fallback paths**

Append to `apps/api/src/services/session/session-exchange.test.ts`:

```typescript
import { streamMessage } from './session-exchange';
import { inngest } from '../../inngest/client';

describe('streamMessage.onComplete — fallback paths', () => {
  const inngestSendSpy = jest.spyOn(inngest, 'send').mockResolvedValue({} as never);

  afterEach(() => inngestSendSpy.mockClear());

  it('returns fallback on empty envelope reply and skips persistExchangeResult', async () => {
    const session = await createTestSession();
    const { profileId, sessionId } = session;
    const rawResponse = JSON.stringify({
      reply: '',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
    });
    const result = await runStreamMessageWithStubbedRaw(
      { sessionId, profileId, message: 'hi' },
      rawResponse
    );

    expect(result.fallback?.reason).toBe('empty_reply');
    // Confirm no ai_response row written
    const events = await db.query.sessionEvents.findMany({
      where: eq(sessionEvents.sessionId, sessionId),
    });
    expect(events.filter((e) => e.eventType === 'ai_response')).toHaveLength(0);
  });

  it('returns fallback on malformed envelope', async () => {
    const session = await createTestSession();
    const result = await runStreamMessageWithStubbedRaw(
      { sessionId: session.sessionId, profileId: session.profileId, message: 'hi' },
      'plain prose no envelope'
    );
    expect(result.fallback?.reason).toBe('malformed_envelope');
  });

  it('returns fallback on orphan marker', async () => {
    const session = await createTestSession();
    const result = await runStreamMessageWithStubbedRaw(
      { sessionId: session.sessionId, profileId: session.profileId, message: 'hi' },
      '{"notePrompt":true}'
    );
    expect(result.fallback?.reason).toBe('orphan_marker');
  });

  it('does NOT return fallback on a normal envelope reply', async () => {
    const session = await createTestSession();
    const rawResponse = JSON.stringify({
      reply: 'Hello there!',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
    });
    const result = await runStreamMessageWithStubbedRaw(
      { sessionId: session.sessionId, profileId: session.profileId, message: 'hi' },
      rawResponse
    );
    expect(result.fallback).toBeUndefined();
    // Normal path DID write the ai_response
    const events = await db.query.sessionEvents.findMany({
      where: eq(sessionEvents.sessionId, session.sessionId),
    });
    expect(events.filter((e) => e.eventType === 'ai_response')).toHaveLength(1);
  });

  it('emits inngest event on fallback with correct reason and first 200 chars of raw', async () => {
    const session = await createTestSession();
    const raw = '{"notePrompt":true}';
    await runStreamMessageWithStubbedRaw(
      { sessionId: session.sessionId, profileId: session.profileId, message: 'hi' },
      raw
    );
    expect(inngestSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/exchange.empty_reply_fallback',
        data: expect.objectContaining({
          reason: 'orphan_marker',
          sessionId: session.sessionId,
          profileId: session.profileId,
          flow: 'streamMessage',
          rawPreview: raw.slice(0, 200),
        }),
      })
    );
  });

  it('excludes fallback turns from subsequent exchangeHistory', async () => {
    const session = await createTestSession();
    // First turn: normal success
    await runStreamMessageWithStubbedRaw(
      { sessionId: session.sessionId, profileId: session.profileId, message: 'first' },
      JSON.stringify({
        reply: 'Reply 1',
        signals: {
          partial_progress: false,
          needs_deepening: false,
          understanding_check: false,
        },
      })
    );
    // Second turn: fallback
    await runStreamMessageWithStubbedRaw(
      { sessionId: session.sessionId, profileId: session.profileId, message: 'second' },
      'malformed garbage'
    );
    // Third turn: normal — history should contain turn 1 (user+assistant),
    // turn 2's user_message, and the new turn 3 user_message. NO assistant
    // turn from the fallback exchange.
    const ctx = await prepareExchangeContext(db, session.profileId, session.sessionId, 'third');
    const assistantTurns = ctx.context.exchangeHistory.filter(
      (e) => e.role === 'assistant'
    );
    expect(assistantTurns).toHaveLength(1);
    expect(assistantTurns[0].content).toBe('Reply 1');
  });
});
```

> **Note to implementer:** `runStreamMessageWithStubbedRaw` is a test helper you'll add. The cleanest way: mock `streamExchange` to return a `StreamResult` whose `rawResponsePromise` resolves to the stubbed string, and a `stream` that yields whatever empty/noop chunks your harness expects. Place the helper in the same test file or in a shared test-utils file if one exists. Do **not** add it to production code.

- [ ] **Step 2: Run the tests — expect failures**

```bash
cd apps/api && pnpm exec jest src/services/session/session-exchange.test.ts --no-coverage -t "fallback paths"
```

Expected: FAIL on all six — `result.fallback` is undefined because the production code hasn't been wired yet.

- [ ] **Step 3: Modify `streamMessage.onComplete` to use the classifier**

Replace lines 1063-1111 of `apps/api/src/services/session/session-exchange.ts`:

```typescript
  return {
    stream: result.stream,
    async onComplete() {
      const rawResponse = await result.rawResponsePromise;
      const outcome = classifyExchangeOutcome(rawResponse, {
        sessionId,
        profileId,
        flow: 'streamMessage',
      });

      // Fallback path — skip ai_response persist (spec §4.1a persistence
      // rule, elevated to load-bearing by Prereq 1c cascade evidence).
      if (outcome.fallback) {
        await persistFallbackUserMessage(db, profileId, sessionId, input.message);

        // Pre-persist exchange count — needed because persistExchangeResult
        // (which would normally supply it) is skipped here.
        const sessionNow = await getSession(db, profileId, sessionId);

        void inngest.send({
          name: 'app/exchange.empty_reply_fallback',
          data: {
            reason: outcome.fallback.reason,
            sessionId,
            profileId,
            flow: 'streamMessage',
            exchangeCount: sessionNow.exchangeCount,
            rawPreview: rawResponse.slice(0, 200),
          },
        });

        return {
          exchangeCount: sessionNow.exchangeCount,
          escalationRung: effectiveRung,
          expectedResponseMinutes: null,
          aiEventId: undefined,
          notePrompt: undefined,
          notePromptPostSession: undefined,
          fluencyDrill: undefined,
          confidence: undefined,
          fallback: outcome.fallback, // <-- new field
        };
      }

      // Normal path — unchanged from previous implementation
      const parsed = outcome.parsed;
      const expectedResponseMinutes = estimateExpectedResponseMinutes(
        parsed.cleanResponse,
        context
      );
      const persisted = await persistExchangeResult(
        db,
        profileId,
        sessionId,
        session,
        input.message,
        parsed.cleanResponse,
        effectiveRung,
        {
          isUnderstandingCheck: parsed.understandingCheck,
          timeToAnswerMs,
          hintCountInSession: hintCount,
          expectedResponseMinutes,
          homeworkMode: input.homeworkMode,
          partialProgress: parsed.partialProgress,
          needsDeepening: parsed.needsDeepening,
          confidence: parsed.confidence,
        }
      );
      return {
        exchangeCount: persisted.exchangeCount,
        escalationRung: effectiveRung,
        expectedResponseMinutes,
        aiEventId: persisted.aiEventId,
        notePrompt: parsed.notePrompt || undefined,
        notePromptPostSession: parsed.notePromptPostSession || undefined,
        fluencyDrill: parsed.fluencyDrill ?? undefined,
        confidence: parsed.confidence,
      };
    },
  };
```

Add these imports to the top of `session-exchange.ts`:

```typescript
import {
  processExchange,
  streamExchange,
  estimateExpectedResponseMinutes,
  parseExchangeEnvelope,
  classifyExchangeOutcome,    // NEW
  type ExchangeContext,
  type ExchangeFallback,      // NEW
  type FluencyDrillAnnotation,
  type ImageData,
} from '../exchanges';
```

Update the return-type declaration of `streamMessage` to include the optional `fallback` field. Find the existing return type (it's a `Promise<{...}>` starting near line 1030-1040) and add:

```typescript
): Promise<{
  stream: ReadableStream<Uint8Array>;
  onComplete: () => Promise<{
    exchangeCount: number;
    escalationRung: EscalationRung;
    expectedResponseMinutes: number | null;
    aiEventId: string | undefined;
    notePrompt?: true;
    notePromptPostSession?: true;
    fluencyDrill?: FluencyDrillAnnotation;
    confidence?: 'low' | 'medium' | 'high';
    fallback?: ExchangeFallback;   // NEW
  }>;
}>
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
cd apps/api && pnpm exec jest src/services/session/session-exchange.test.ts --no-coverage -t "fallback paths"
```

Expected: all six tests PASS.

- [ ] **Step 5: Typecheck and lint**

```bash
cd apps/api && pnpm exec tsc --noEmit
pnpm exec nx run api:lint
```

Expected: no errors.

- [ ] **Step 6: No commit yet** — continues in Task 1.5.

---

## Task 1.5: Modify `interview.ts` inline `onComplete`

Interview has two critical constraints:
1. Fallback must **not** advance `currentExchangeCount` (spec §5).
2. Interview `onComplete` is simpler than `streamMessage.onComplete` — it does not directly call `persistExchangeResult`; the interview route handles persistence.

**Files:**
- Modify: `apps/api/src/services/interview.ts:413-436`
- Modify: `apps/api/src/services/interview.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/services/interview.test.ts`:

```typescript
describe('streamInterviewExchange.onComplete — fallback', () => {
  const inngestSendSpy = jest.spyOn(inngest, 'send').mockResolvedValue({} as never);
  afterEach(() => inngestSendSpy.mockClear());

  it('empty-reply fallback does NOT advance currentExchangeCount', async () => {
    const ctx = await createInterviewContext({ exchangeCount: 5 });
    const result = await runInterviewOnComplete(ctx, JSON.stringify({
      reply: '',
      signals: { ready_to_finish: false },
    }));
    expect(result.fallback?.reason).toBe('empty_reply');
    expect(result.isComplete).toBe(false); // must not close interview on fallback
    expect(result.exchangeCount).toBe(5); // unchanged
  });

  it('emits inngest event on interview fallback with flow=streamInterviewExchange', async () => {
    const ctx = await createInterviewContext({ exchangeCount: 2 });
    await runInterviewOnComplete(ctx, 'malformed output');
    expect(inngestSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/exchange.empty_reply_fallback',
        data: expect.objectContaining({
          reason: 'malformed_envelope',
          flow: 'streamInterviewExchange',
          exchangeCount: 2,
        }),
      })
    );
  });

  it('does NOT return fallback on a normal envelope reply', async () => {
    const ctx = await createInterviewContext({ exchangeCount: 1 });
    const result = await runInterviewOnComplete(ctx, JSON.stringify({
      reply: 'How do you feel about math?',
      signals: { ready_to_finish: false },
    }));
    expect(result.fallback).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/api && pnpm exec jest src/services/interview.test.ts --no-coverage -t "fallback"
```

Expected: FAIL.

- [ ] **Step 3: Modify the inline `onComplete` in `interview.ts`**

Replace lines 413-436 of `apps/api/src/services/interview.ts`:

```typescript
  const onComplete = async (
    _fullResponse: string
  ): Promise<InterviewResult> => {
    const rawResponse = await rawResponsePromise;

    // Check for fallback shapes BEFORE checking readyToFinish or advancing
    // the exchange counter — a fallback must not advance state.
    const envelopeResult = parseEnvelope(rawResponse);
    const markerDetected = isRecognizedMarker(rawResponse);
    const { cleanResponse, readyToFinish } = interpretInterviewResponse({
      rawResponse,
      profileId: options?.profileId,
      flow: 'streamInterviewExchange',
    });

    let fallback: ExchangeFallback | undefined;
    if (envelopeResult.ok && cleanResponse.trim() === '') {
      fallback = {
        reason: 'empty_reply',
        fallbackText: "I didn't catch that — tap to try again.",
      };
    } else if (markerDetected) {
      fallback = {
        reason: 'orphan_marker',
        fallbackText: "I didn't catch that — tap to try again.",
      };
    } else if (!envelopeResult.ok) {
      fallback = {
        reason: 'malformed_envelope',
        fallbackText: "I didn't catch that — tap to try again.",
      };
    }

    if (fallback) {
      void inngest.send({
        name: 'app/exchange.empty_reply_fallback',
        data: {
          reason: fallback.reason,
          sessionId: options?.sessionId,
          profileId: options?.profileId,
          flow: 'streamInterviewExchange',
          exchangeCount: currentExchangeCount,
          rawPreview: rawResponse.slice(0, 200),
        },
      });
      // Do NOT advance exchangeCount, do NOT close interview.
      return {
        response: '',
        isComplete: false,
        exchangeCount: currentExchangeCount,
        fallback,
      };
    }

    const isComplete =
      readyToFinish || currentExchangeCount >= MAX_INTERVIEW_EXCHANGES;

    if (isComplete) {
      const signals = await extractSignals([
        ...context.exchangeHistory,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: cleanResponse },
      ]);
      return {
        response: cleanResponse,
        isComplete,
        exchangeCount: currentExchangeCount + 1,
        extractedSignals: signals,
      };
    }

    return {
      response: cleanResponse,
      isComplete,
      exchangeCount: currentExchangeCount + 1,
    };
  };
```

Add imports:

```typescript
import { parseEnvelope, isRecognizedMarker } from './llm';
import type { ExchangeFallback } from './exchanges';
import { inngest } from '../inngest/client';
```

Update the `InterviewResult` type declaration to include optional `exchangeCount` and `fallback`:

```typescript
export interface InterviewResult {
  response: string;
  isComplete: boolean;
  exchangeCount: number;        // NEW — always returned
  extractedSignals?: InterviewSignals;
  fallback?: ExchangeFallback;  // NEW
}
```

Audit callers of `onComplete` for type compatibility — the interview route at `apps/api/src/routes/interview.ts:~155` will need to read the new fields. Leave that wiring for commit 2 / Task 2.2.

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && pnpm exec jest src/services/interview.test.ts --no-coverage -t "fallback"
```

Expected: three new tests PASS. Re-run full interview test suite to confirm no regressions:

```bash
cd apps/api && pnpm exec jest src/services/interview.test.ts --no-coverage
```

Expected: all PASS.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: No commit yet** — final validation in Task 1.6.

---

## Task 1.6: Run full commit-1 test gate and commit

- [ ] **Step 1: Targeted test run on all modified files**

```bash
cd apps/api && pnpm exec jest --findRelatedTests \
  src/services/llm/envelope.ts \
  src/services/exchanges.ts \
  src/services/session/session-exchange.ts \
  src/services/interview.ts \
  --no-coverage
```

Expected: all pass. If any unrelated test fails, investigate before committing.

- [ ] **Step 2: Full API lint + typecheck**

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
```

Expected: clean.

- [ ] **Step 3: Review the diff before staging**

```bash
git diff apps/api/src/services/llm/envelope.ts \
         apps/api/src/services/llm/index.ts \
         apps/api/src/services/exchanges.ts \
         apps/api/src/services/session/session-exchange.ts \
         apps/api/src/services/interview.ts
git diff apps/api/src/services/llm/envelope.test.ts \
         apps/api/src/services/exchanges.test.ts \
         apps/api/src/services/session/session-exchange.test.ts \
         apps/api/src/services/interview.test.ts
```

Confirm: no plan file, no scratch file, no unrelated edits.

- [ ] **Step 4: Stage and commit — targeted `git add` ONLY**

```bash
git add apps/api/src/services/llm/envelope.ts \
        apps/api/src/services/llm/envelope.test.ts \
        apps/api/src/services/llm/index.ts \
        apps/api/src/services/exchanges.ts \
        apps/api/src/services/exchanges.test.ts \
        apps/api/src/services/session/session-exchange.ts \
        apps/api/src/services/session/session-exchange.test.ts \
        apps/api/src/services/interview.ts \
        apps/api/src/services/interview.test.ts

git commit -m "$(cat <<'EOF'
fix(api): return fallback signal from streamMessage.onComplete on empty/malformed envelope [EMPTY-REPLY-GUARD-1]

Adds a `fallback: { reason, fallbackText } | undefined` field to the result
returned by streamMessage.onComplete (session-exchange.ts) and the inline
onComplete in interview.ts. Reason buckets: 'empty_reply',
'malformed_envelope', 'orphan_marker'.

When fallback is set, persistExchangeResult is short-circuited via a new
persistFallbackUserMessage that writes only the user_message row — raw
envelope JSON no longer enters exchangeHistory, preventing the multi-turn
cascade observed in staging sessions 019dbab0, 019dbaad, 019dbb60 (profile
019d8b97-48ed-7924-8ae3-c5f9596109b8). Cascade mechanism documented in
docs/superpowers/plans/2026-04-23-empty-reply-stream-guard.md §2 Prereq 1c.

Adds isRecognizedMarker() canonical detector in services/llm/envelope.ts
and an Inngest event ('app/exchange.empty_reply_fallback', 100% sample)
with three distinct reason values so triage can separate LLM format drift
from widget-trigger-without-handler from LLM-refused-to-answer.

Interview path preserves exchangeCount when fallback fires — a fallback
on exchange 5 does not advance to 6, and does not close the interview.

Route-level SSE emission lands in [EMPTY-REPLY-GUARD-2]; mobile finalizer
handling lands in [EMPTY-REPLY-GUARD-3].
EOF
)"
```

- [ ] **Step 5: Verify the commit landed clean**

```bash
git log -1 --stat
git status --short
```

Expected: one commit, touching only the 9 listed files. `git status` shows the plan file still untracked (correct) and no unexpected extras.

---

# Commit 2 — `[EMPTY-REPLY-GUARD-2]`: Server SSE Emission + Quota Refund

## Task 2.1: Route-level SSE emission in `routes/sessions.ts`

**Files:**
- Modify: `apps/api/src/routes/sessions.ts:225-267` (the onComplete-await-then-done block)
- Modify: `apps/api/src/routes/sessions.test.ts`

**Preflight:** Read `routes/sessions.ts:225-267` before starting to confirm the exact current shape of the SSE write. The line numbers may drift by ±5 lines. The structure to find is: `const result = await onComplete()` followed by a `writeSSE({ data: JSON.stringify({ type: 'done', ... }) })`.

- [ ] **Step 1: Write failing route tests**

Append to `apps/api/src/routes/sessions.test.ts`:

```typescript
describe('POST /sessions/:id/message — fallback SSE', () => {
  it('emits fallback SSE event BEFORE done on empty reply', async () => {
    const session = await createTestSession();
    const { sessionId } = session;
    // Stub streamMessage.onComplete to return a fallback result
    stubStreamMessageOnComplete({
      fallback: { reason: 'empty_reply', fallbackText: "I didn't have a reply — tap to try again." },
      exchangeCount: 3,
      escalationRung: 1,
    });
    const sseFrames = await postMessageAndCollectSSE(sessionId, 'hi');

    const fallbackIdx = sseFrames.findIndex((f) => f.data?.type === 'fallback');
    const doneIdx = sseFrames.findIndex((f) => f.data?.type === 'done');
    expect(fallbackIdx).toBeGreaterThanOrEqual(0);
    expect(doneIdx).toBeGreaterThan(fallbackIdx);
    expect(sseFrames[fallbackIdx].data).toEqual({
      type: 'fallback',
      reason: 'empty_reply',
      fallbackText: expect.stringMatching(/try again/i),
    });
  });

  it('does NOT emit fallback SSE on a normal reply', async () => {
    const session = await createTestSession();
    stubStreamMessageOnComplete({
      exchangeCount: 1,
      escalationRung: 1,
      aiEventId: 'evt-1',
      expectedResponseMinutes: 5,
    });
    const sseFrames = await postMessageAndCollectSSE(session.sessionId, 'hi');
    expect(sseFrames.find((f) => f.data?.type === 'fallback')).toBeUndefined();
    expect(sseFrames.find((f) => f.data?.type === 'done')).toBeDefined();
  });

  it('refunds quota on fallback (calls incrementQuota with -1)', async () => {
    const incSpy = jest.spyOn(quotaService, 'incrementQuota');
    const session = await createTestSession();
    stubStreamMessageOnComplete({
      fallback: { reason: 'malformed_envelope', fallbackText: 'X' },
      exchangeCount: 0,
      escalationRung: 1,
    });
    await postMessageAndCollectSSE(session.sessionId, 'hi');
    // The initial quota increment happened; on fallback we refund
    expect(incSpy).toHaveBeenCalledWith(
      expect.anything(),
      session.profileId,
      -1
    );
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/api && pnpm exec jest src/routes/sessions.test.ts --no-coverage -t "fallback SSE"
```

Expected: FAIL.

- [ ] **Step 3: Modify `routes/sessions.ts` — emit fallback before done, refund quota**

Find the block where `onComplete()` is awaited and the `done` event is written (around line 235-267 in current tree). Replace with:

```typescript
  const onCompleteResult = await onComplete();

  // EMPTY-REPLY-GUARD-2: emit dedicated fallback event BEFORE done, and
  // refund the quota increment we took at request entry. Emit order is
  // load-bearing (spec §4.1b) — if done arrives before fallback, mobile's
  // finalizer marks the stream finished and the fallback branch never
  // fires.
  if (onCompleteResult.fallback) {
    await sseStream.writeSSE({
      data: JSON.stringify({
        type: 'fallback',
        reason: onCompleteResult.fallback.reason,
        fallbackText: onCompleteResult.fallback.fallbackText,
      }),
    });
    // Refund quota (fallback did not produce a real exchange)
    await incrementQuota(db, profileId, -1);
  }

  await sseStream.writeSSE({
    data: JSON.stringify({
      type: 'done',
      exchangeCount: onCompleteResult.exchangeCount,
      escalationRung: onCompleteResult.escalationRung,
      expectedResponseMinutes: onCompleteResult.expectedResponseMinutes,
      aiEventId: onCompleteResult.aiEventId,
      notePrompt: onCompleteResult.notePrompt,
      notePromptPostSession: onCompleteResult.notePromptPostSession,
      fluencyDrill: onCompleteResult.fluencyDrill,
      confidence: onCompleteResult.confidence,
    }),
  });
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && pnpm exec jest src/routes/sessions.test.ts --no-coverage -t "fallback SSE"
```

Expected: all three PASS.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

Expected: clean.

---

## Task 2.2: Route-level SSE emission in `routes/interview.ts`

**Files:**
- Modify: `apps/api/src/routes/interview.ts:~155` (confirm exact line via `grep -n "onComplete" apps/api/src/routes/interview.ts`)
- Modify: `apps/api/src/routes/interview.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/routes/interview.test.ts`:

```typescript
describe('POST /interview/:subjectId/message — fallback SSE', () => {
  it('emits fallback SSE before done on empty interview reply', async () => {
    const draft = await createTestDraft();
    stubStreamInterviewOnComplete({
      fallback: { reason: 'empty_reply', fallbackText: "I didn't catch that — tap to try again." },
      isComplete: false,
      exchangeCount: 2,
      response: '',
    });
    const frames = await postInterviewMessageAndCollectSSE(draft.subjectId, 'tell me more');
    const fallbackIdx = frames.findIndex((f) => f.data?.type === 'fallback');
    const doneIdx = frames.findIndex((f) => f.data?.type === 'done');
    expect(fallbackIdx).toBeGreaterThanOrEqual(0);
    expect(doneIdx).toBeGreaterThan(fallbackIdx);
  });

  it('fallback does not close the interview (isComplete=false propagated)', async () => {
    const draft = await createTestDraft();
    stubStreamInterviewOnComplete({
      fallback: { reason: 'malformed_envelope', fallbackText: 'X' },
      isComplete: false,
      exchangeCount: 3,
      response: '',
    });
    const frames = await postInterviewMessageAndCollectSSE(draft.subjectId, 'x');
    const done = frames.find((f) => f.data?.type === 'done');
    expect(done?.data?.isComplete).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/api && pnpm exec jest src/routes/interview.test.ts --no-coverage -t "fallback SSE"
```

Expected: FAIL.

- [ ] **Step 3: Modify `routes/interview.ts`**

Find the `onComplete` await block and replace with:

```typescript
  const interviewResult = await onComplete(/* args as before */);

  if (interviewResult.fallback) {
    await sseStream.writeSSE({
      data: JSON.stringify({
        type: 'fallback',
        reason: interviewResult.fallback.reason,
        fallbackText: interviewResult.fallback.fallbackText,
      }),
    });
    // Interview has no per-exchange quota; no refund path here.
  }

  await sseStream.writeSSE({
    data: JSON.stringify({
      type: 'done',
      isComplete: interviewResult.isComplete,
      exchangeCount: interviewResult.exchangeCount,
      // extractedSignals only present on real completion, never on fallback
      ...(interviewResult.extractedSignals && {
        extractedSignals: interviewResult.extractedSignals,
      }),
    }),
  });
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/api && pnpm exec jest src/routes/interview.test.ts --no-coverage -t "fallback SSE"
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

Expected: clean.

---

## Task 2.3: End-to-end integration test

**Files:**
- Modify: `apps/api/integration-tests/sessions-stream.test.ts` (or create if the file doesn't exist — first `ls apps/api/integration-tests/` to confirm)

- [ ] **Step 1: Write the integration test**

Append (or create) `apps/api/integration-tests/sessions-stream.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { buildApp } from '../src/app';
import { resetTestDb, seedProfile, seedSession } from './test-utils';
import { registerProvider, mockProvider } from '../src/services/llm';

describe('Integration: sessions stream fallback', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('empty LLM reply produces fallback event end-to-end', async () => {
    const profile = await seedProfile();
    const session = await seedSession({ profileId: profile.id });

    // Register a mock provider that yields an empty-reply envelope
    registerProvider(
      mockProvider({
        streamChunks: [
          '{"reply":"","signals":{"partial_progress":false,"needs_deepening":false,"understanding_check":false}}',
        ],
      })
    );

    const app = buildApp();
    const res = await app.request(`/sessions/${session.id}/message`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${profile.testAuthToken}`,
      },
      body: JSON.stringify({ message: 'hi' }),
    });

    const text = await res.text();
    const frames = parseSSE(text);

    const fallback = frames.find((f) => f.type === 'fallback');
    const done = frames.find((f) => f.type === 'done');
    expect(fallback).toBeDefined();
    expect(fallback?.reason).toBe('empty_reply');
    expect(done).toBeDefined();

    // Verify no ai_response row in DB (cascade protection)
    const events = await queryEvents(session.id);
    expect(events.filter((e) => e.eventType === 'ai_response')).toHaveLength(0);
    expect(events.filter((e) => e.eventType === 'user_message')).toHaveLength(1);
  });
});
```

> **Note:** `parseSSE`, `queryEvents`, `seedProfile`, `seedSession` should exist in `integration-tests/test-utils.ts` or equivalent. If they don't, write the minimal helpers inline rather than blocking on building shared utilities.

- [ ] **Step 2: Run — expect pass**

```bash
cd apps/api && pnpm exec jest integration-tests/sessions-stream.test.ts --no-coverage
```

Expected: PASS. If it fails due to missing test utilities, implement them or simplify the test to use what's available.

---

## Task 2.4: Commit-2 gate and commit

- [ ] **Step 1: Targeted test run**

```bash
cd apps/api && pnpm exec jest --findRelatedTests \
  src/routes/sessions.ts \
  src/routes/interview.ts \
  --no-coverage
```

Expected: all pass.

- [ ] **Step 2: Integration tests**

```bash
cd apps/api && pnpm exec jest integration-tests --no-coverage
```

Expected: all pass.

- [ ] **Step 3: API lint + typecheck**

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
```

Expected: clean.

- [ ] **Step 4: Stage and commit**

```bash
git add apps/api/src/routes/sessions.ts \
        apps/api/src/routes/sessions.test.ts \
        apps/api/src/routes/interview.ts \
        apps/api/src/routes/interview.test.ts \
        apps/api/integration-tests/sessions-stream.test.ts

git commit -m "$(cat <<'EOF'
fix(api): emit fallback SSE event from session/interview routes [EMPTY-REPLY-GUARD-2]

Reads the fallback field from onComplete's result and emits a dedicated
'fallback' SSE event BEFORE the 'done' event when set. Emit order is
load-bearing per spec §4.1b — if done arrived first the mobile finalizer
would mark the stream finished before the fallback branch could fire.

Refunds the per-request quota increment when fallback fires in the
session-exchange route (interview has no per-exchange quota). Fallback
turns therefore do not count against the 10/day or 100/month free cap.

Integration test: stubbed LLM empty-reply → fallback frame present and
strictly precedes done frame; DB contains only the user_message row (no
ai_response pollution — end-to-end verification of the cascade fix
introduced in [EMPTY-REPLY-GUARD-1]).

Mobile handling lands in [EMPTY-REPLY-GUARD-3].
EOF
)"
```

- [ ] **Step 5: Verify**

```bash
git log -1 --stat
git status --short
```

---

# Commit 3 — `[EMPTY-REPLY-GUARD-3]`: Mobile Layer 2

## Task 3.1: Finalizer converts on explicit `fallback` SSE event

**Files:**
- Modify: `apps/mobile/src/components/session/use-session-streaming.ts`
- Modify: `apps/mobile/src/components/session/use-session-streaming.test.ts`

**Preflight:** Read `use-session-streaming.ts` around lines 500-600 and 800-850 to confirm current structure. The precise line numbers in the spec (504-532 for watchdog, 561 for finalizer, 581-593 for marker regex, 800-838 for handleReconnect) may drift by ±10 lines.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/components/session/use-session-streaming.test.ts`:

```typescript
describe('useSessionStreaming — fallback handling', () => {
  it('converts message to reconnect_prompt on fallback SSE event', async () => {
    const { result } = renderHook(() => useSessionStreaming(testSessionProps));

    await act(async () => {
      // Stream sends: initial empty chunk, then a fallback frame, then done
      mockSSE.emit({ type: 'fallback', reason: 'empty_reply', fallbackText: "I didn't have a reply — tap to try again." });
      mockSSE.emit({ type: 'done', exchangeCount: 1 });
    });

    const aiMessage = result.current.messages.find((m) => m.role === 'assistant');
    expect(aiMessage?.kind).toBe('reconnect_prompt');
    expect(aiMessage?.content).toMatch(/try again/i);
    expect(aiMessage?.streaming).toBe(false);
  });

  it('converts empty-content finalized message to reconnect_prompt (zero-chunk stream)', async () => {
    const { result } = renderHook(() => useSessionStreaming(testSessionProps));

    await act(async () => {
      // Stream sends: done with no content chunks, no fallback event
      mockSSE.emit({ type: 'done', exchangeCount: 1 });
    });

    const aiMessage = result.current.messages.find((m) => m.role === 'assistant');
    expect(aiMessage?.kind).toBe('reconnect_prompt');
  });

  it('finalizer does NOT overwrite watchdog-produced reconnect_prompt (idempotency)', async () => {
    const { result } = renderHook(() => useSessionStreaming(testSessionProps));

    await act(async () => {
      // Trigger the 45s watchdog by advancing time without any stream activity
      jest.advanceTimersByTime(45_000);
    });
    // Watchdog has already converted. Now emit a late done — finalizer fires.
    await act(async () => {
      mockSSE.emit({ type: 'done', exchangeCount: 1 });
    });
    const aiMessage = result.current.messages.find((m) => m.role === 'assistant');
    expect(aiMessage?.kind).toBe('reconnect_prompt');
    // Content should still be the watchdog's text, not finalizer's
    expect(aiMessage?.content).toBe(WATCHDOG_RECONNECT_TEXT);
  });

  it('reconnect after Layer 1 fallback replays last user message via continueWithMessage', async () => {
    const { result } = renderHook(() => useSessionStreaming(testSessionProps));

    await act(async () => {
      await result.current.continueWithMessage('original question', {});
      mockSSE.emit({ type: 'fallback', reason: 'empty_reply', fallbackText: 'x' });
      mockSSE.emit({ type: 'done', exchangeCount: 0 });
    });

    const continueSpy = jest.spyOn(result.current, 'continueWithMessage');
    await act(async () => {
      result.current.handleReconnect();
    });
    expect(continueSpy).toHaveBeenCalledWith('original question', expect.anything());
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/mobile && pnpm exec jest src/components/session/use-session-streaming.test.ts --no-coverage -t "fallback handling"
```

Expected: FAIL.

- [ ] **Step 3: Implement the finalizer branch**

In `use-session-streaming.ts`, find the SSE consumer loop. Add handling for the new `fallback` frame:

```typescript
// In the SSE event parser (where 'done', 'chunk', etc. are handled):
case 'fallback': {
  fallbackRef.current = {
    fallbackText: payload.fallbackText,
    reason: payload.reason,
  };
  break;
}
```

Near the top of the hook body, add the ref:

```typescript
const fallbackRef = useRef<{ fallbackText: string; reason: string } | null>(null);
```

Replace the existing finalizer (the `onComplete` handler around line 561) with an idempotent version that reads `fallbackRef`:

```typescript
const finalize = useCallback(
  (streamId: string, result: { aiEventId?: string }) => {
    const fallback = fallbackRef.current;
    fallbackRef.current = null; // reset for next stream

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== streamId) return m;
        // Idempotency: if watchdog already converted, leave it alone
        if (m.kind === 'reconnect_prompt') return m;

        const isEmpty = m.content.trim().length === 0;
        const shouldConvert = fallback !== null || isEmpty;

        if (shouldConvert) {
          return {
            ...m,
            content: fallback?.fallbackText ?? "I didn't have a reply — tap to try again.",
            streaming: false,
            kind: 'reconnect_prompt' as const,
            eventId: result.aiEventId,
          };
        }

        return { ...m, streaming: false, eventId: result.aiEventId };
      })
    );
  },
  [setMessages]
);
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/mobile && pnpm exec jest src/components/session/use-session-streaming.test.ts --no-coverage -t "fallback handling"
```

Expected: all four PASS.

---

## Task 3.2: Remove `isSystemPrompt` from watchdog + delete marker regex strip

**Files:**
- Modify: `apps/mobile/src/components/session/use-session-streaming.ts`
  - Watchdog site (around line 525) — remove `isSystemPrompt: true`
  - Marker regex strip (around lines 581-593) — delete entirely
- Modify: `apps/mobile/src/components/session/use-session-streaming.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `use-session-streaming.test.ts`:

```typescript
describe('useSessionStreaming — isSystemPrompt cleanup', () => {
  it('watchdog reconnect_prompt does NOT set isSystemPrompt', async () => {
    const { result } = renderHook(() => useSessionStreaming(testSessionProps));
    await act(async () => {
      jest.advanceTimersByTime(45_000);
    });
    const aiMessage = result.current.messages.find((m) => m.role === 'assistant');
    expect(aiMessage?.kind).toBe('reconnect_prompt');
    expect((aiMessage as Record<string, unknown>).isSystemPrompt).toBeUndefined();
  });
});

describe('useSessionStreaming — mobile marker regex removed', () => {
  it('does not strip markers client-side (server handles this now)', async () => {
    // With the server change in [EMPTY-REPLY-GUARD-1], markers never reach
    // mobile as chunk text. If they DID reach mobile, we want the raw
    // content to pass through (would be caught by empty-content finalizer
    // branch as a zero-chunk stream + reconnect_prompt). This test simply
    // asserts the regex is no longer present by inspecting the source file.
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('./use-session-streaming.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/notePrompt.*:\s*true/);
    expect(source).not.toMatch(/isSystemPrompt:\s*true/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/mobile && pnpm exec jest src/components/session/use-session-streaming.test.ts --no-coverage -t "cleanup\|regex removed"
```

Expected: FAIL.

- [ ] **Step 3: Edit the watchdog site**

In `use-session-streaming.ts`, find the 45s watchdog block (look for `setTimeout` with 45000 or similar, or search for `isSystemPrompt: true`). Find the line:

```typescript
          isSystemPrompt: true,
```

Delete it (no replacement — leave the watchdog setting just `kind: 'reconnect_prompt'`, `streaming: false`, `content: RECONNECT_TEXT`).

- [ ] **Step 4: Delete the marker regex strip**

Find the block that strips `{"notePrompt":...}`-style JSON residue from incoming chunks (around lines 581-593). It looks approximately like:

```typescript
// Strip marker JSON residue (server may emit raw {"notePrompt":true} etc.)
const MARKER_STRIP_REGEX = /\{[^}]*\b(notePrompt|fluencyDrill)[^}]*\}/g;
content = content.replace(MARKER_STRIP_REGEX, '');
```

Delete the entire block (the `MARKER_STRIP_REGEX` constant and the `.replace(...)` call). The server no longer emits marker JSON as visible chunk text after commit 1.

- [ ] **Step 5: Run tests — expect pass**

```bash
cd apps/mobile && pnpm exec jest src/components/session/use-session-streaming.test.ts --no-coverage
```

Expected: all new tests PASS; no regressions in existing tests.

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: clean.

---

## Task 3.3: Chip-gate in `SessionMessageActions.tsx`

**Files:**
- Modify: `apps/mobile/src/components/session/SessionMessageActions.tsx:56-78`
- Modify: `apps/mobile/src/components/session/SessionMessageActions.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `SessionMessageActions.test.tsx`:

```typescript
describe('SessionMessageActions — chip-gate', () => {
  it('does NOT render feedback chips on kind=reconnect_prompt', () => {
    const { queryByText } = render(
      <SessionMessageActions
        message={{
          id: 'm1',
          role: 'assistant',
          content: 'X',
          kind: 'reconnect_prompt',
          streaming: false,
        }}
        onFeedback={jest.fn()}
      />
    );
    expect(queryByText(/helpful/i)).toBeNull();
    expect(queryByText(/not helpful/i)).toBeNull();
  });

  it('does NOT gate on isSystemPrompt anymore', () => {
    // A message without isSystemPrompt but also not reconnect_prompt should still render chips
    const { getByText } = render(
      <SessionMessageActions
        message={{
          id: 'm2',
          role: 'assistant',
          content: 'Real reply',
          kind: undefined,
          streaming: false,
        }}
        onFeedback={jest.fn()}
      />
    );
    expect(getByText(/helpful/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/mobile && pnpm exec jest src/components/session/SessionMessageActions.test.tsx --no-coverage -t "chip-gate"
```

Expected: FAIL on the first test (chips still render because current gate is `!isSystemPrompt`).

- [ ] **Step 3: Edit `SessionMessageActions.tsx` gate condition**

Find the condition (around line 56-78). Current code looks like:

```typescript
if (message.streaming || message.isSystemPrompt || message.kind === 'quota_exceeded') {
  return null;
}
```

Replace with:

```typescript
if (
  message.streaming ||
  message.kind === 'reconnect_prompt' ||
  message.kind === 'quota_exceeded'
) {
  return null;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/mobile && pnpm exec jest src/components/session/SessionMessageActions.test.tsx --no-coverage
```

Expected: all PASS.

- [ ] **Step 5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: clean.

---

## Task 3.4: Sweep for other `isSystemPrompt` consumers

Per spec §4.5: "If `isSystemPrompt` has no other meaningful consumer after this change, remove the field entirely."

- [ ] **Step 1: Grep for remaining uses**

```bash
cd apps/mobile && grep -rn "isSystemPrompt" src/ || echo "no matches"
```

- [ ] **Step 2: Decision branch**

If zero matches remain (other than type-definition files): remove the field from the message/chat type definition too. If matches remain (used by another feature), leave `isSystemPrompt` in the type but note in the commit message that session-streaming no longer produces it.

- [ ] **Step 3: Type cleanup if applicable**

If `isSystemPrompt` can be fully removed: find the ChatMessage / SessionMessage type (likely in `apps/mobile/src/types/` or near the hook file) and delete the `isSystemPrompt?: boolean` property.

- [ ] **Step 4: Run mobile tests broad**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session --no-coverage
```

Expected: all pass.

---

## Task 3.5: Commit-3 gate and commit

- [ ] **Step 1: Full mobile lint + typecheck**

```bash
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Mobile session tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/session/use-session-streaming.ts \
  src/components/session/SessionMessageActions.tsx \
  --no-coverage
```

Expected: all pass.

- [ ] **Step 3: Stage and commit**

```bash
git add apps/mobile/src/components/session/use-session-streaming.ts \
        apps/mobile/src/components/session/use-session-streaming.test.ts \
        apps/mobile/src/components/session/SessionMessageActions.tsx \
        apps/mobile/src/components/session/SessionMessageActions.test.tsx

# If ChatMessage type changed:
# git add apps/mobile/src/types/chat-message.ts  (or wherever the type lives)

git commit -m "$(cat <<'EOF'
fix(mobile): convert empty/fallback stream completion to reconnect prompt + drop mobile marker regex [EMPTY-REPLY-GUARD-3]

Adds a finalizer branch in use-session-streaming.ts that converts an
assistant message to kind='reconnect_prompt' when EITHER:
  (a) an explicit 'fallback' SSE frame arrived during the stream
      (Layer 1 server signal from [EMPTY-REPLY-GUARD-2]), or
  (b) content.trim().length === 0 at finalize time (zero-chunk stream —
      network loss, upstream abort, etc.)

Idempotency guard prevents double-writing when the existing 45s SSE
freeze watchdog has already converted the message. Removes
isSystemPrompt: true from the watchdog site so both producers emit the
same shape. Chip-gate in SessionMessageActions switches to gating on
kind (reconnect_prompt, quota_exceeded) instead of isSystemPrompt.

Deletes the mobile-side marker regex strip. After [EMPTY-REPLY-GUARD-1]
no marker JSON reaches mobile as chunk text — the server is the single
canonical detector (isRecognizedMarker). Two sources of truth about what
a marker looks like was exactly the adversarial-review antipattern
(project memory: feedback_adversarial_review_patterns).

User-visible result: on the 2–3% of exchanges where the LLM returns
malformed/empty envelopes (staging profile 019d8b97-… cascade),
the empty-bubble + feedback-chips dead-end is replaced with a
reconnect-prompt bubble whose 'Try Again' affordance calls
continueWithMessage() with the last user message.
EOF
)"
```

- [ ] **Step 4: Final verification**

```bash
git log -3 --oneline
git status --short
```

Expected: three new commits tagged EMPTY-REPLY-GUARD-1/2/3 in order. Plan file and any ambient working-tree files still untracked/unstaged.

---

# Post-Commit: Follow-up Issue (Required per Spec §8)

Per spec §8, before this PR merges you must file a GitHub issue tracking the LLM/parser root-cause work.

- [ ] **Step 1: File the issue**

```bash
gh issue create \
  --title "Tune envelope adherence + harden stream envelope parser [EMPTY-REPLY-GUARD followup]" \
  --body "$(cat <<'EOF'
Follow-up to PR for [EMPTY-REPLY-GUARD-1/2/3] which added boundary defense against malformed/empty LLM envelope responses. Layer 1+2 surface the failure as a reconnect-prompt instead of an empty-bubble dead-end, but do not address the root causes.

Two workstreams tracked here:

**1. Prompt tuning — reduce malformed envelope rate.**
Staging DB evidence (sessions `019dbab0`, `019dbaad`, `019dbb60`, profile `019d8b97-48ed-7924-8ae3-c5f9596109b8`) showed the LLM occasionally returning envelopes with unescaped newlines or quotes inside the `reply` string. These fail the streaming envelope parser and fall through to the fallback path.

Deliverable: prompt-tuning PR backed by `pnpm eval:llm` regression fixtures, OR a written no-action memo if current rates are acceptable.

**2. Stream envelope parser hardening.**
The LLM is mostly emitting well-shaped envelopes; `teeEnvelopeStream` / `parseEnvelope` is the brittle link. Candidates: incremental JSON parser, more tolerant reply-extraction heuristic, stricter upstream response-format enforcement at the provider SDK layer.

**Review date:** 2026-05-07 (14 calendar days post-merge).

**Escalation trigger:** if any `reason` bucket (`empty_reply` / `malformed_envelope` / `orphan_marker`) from the Inngest event `app/exchange.empty_reply_fallback` exceeds 2% of exchanges in any 24-hour window, escalate to P1 regardless of calendar date.

**Source:** docs/superpowers/plans/2026-04-23-empty-reply-stream-guard.md §8
EOF
)"
```

- [ ] **Step 2: Link the issue in the PR description** (when the PR is opened).

---

# Final Validation Checklist

- [ ] All three commits present on `proxy-parent-fix`, in order: EMPTY-REPLY-GUARD-1, 2, 3
- [ ] `git log --grep="EMPTY-REPLY-GUARD"` returns exactly three entries
- [ ] `git status --short` shows no plan files staged (local-only policy held)
- [ ] Inngest event `app/exchange.empty_reply_fallback` registered and emitting (verify on staging deploy)
- [ ] Follow-up GitHub issue filed before PR merge (spec §8 gate)
- [ ] Integration test for end-to-end fallback passes
- [ ] Mobile chip-gate no longer reads `isSystemPrompt`
- [ ] Mobile marker regex strip deleted (`grep MARKER_STRIP_REGEX` returns nothing)

When all boxes are ticked → spec §13 Closure Ledger "Open for implementation phase" moves to DONE.
