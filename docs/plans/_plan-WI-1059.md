---
title: parseJson Boundary Helper — Implementation Plan
date: 2026-06-29
profile: code
work_items: [WI-1059]
status: draft
---

# parseJson Boundary Helper — Implementation Plan

**Goal:** Eliminate all 29 unsafe `(await res.json()) as T` casts in the three
highest-blast-radius mobile hooks (`use-sessions.ts`: 17 casts + 2 untyped,
`use-quiz.ts`: 7, `use-consent.ts`: 5) by routing them through a shared
`parseJson<T>(res, schema)` helper that validates response bodies against Zod
schemas at the trust boundary.

**Approach:** Build a single helper in `apps/mobile/src/lib/parse-json.ts` that
reads the response body via `.text()` (preserving the single-use stream contract),
JSON-parses it, and validates against the provided Zod schema — throwing a typed
`ResponseValidationError` on shape mismatch. Add missing Zod schemas for response
types that lack them. Wire the three hooks to use the helper instead of bare casts.

## Scope

In scope:
- `apps/mobile/src/lib/parse-json.ts` (new — helper + `ResponseValidationError`)
- `apps/mobile/src/lib/parse-json.test.ts` (new — unit tests for the helper)
- `packages/schemas/src/sessions.ts` (6 new response schemas)
- `packages/schemas/src/consent.ts` (3 new response schemas)
- `packages/schemas/src/index.ts` (barrel re-exports for all 9 new names)
- `apps/mobile/src/hooks/use-quiz.ts` (7 sites)
- `apps/mobile/src/hooks/use-consent.ts` (5 sites)
- `apps/mobile/src/hooks/use-sessions.ts` (17 typed casts + 2 untyped sites)
- `apps/mobile/src/hooks/use-quiz.test.ts` (negative-path test additions)
- `apps/mobile/src/hooks/use-consent.test.ts` (negative-path test additions)
- `apps/mobile/src/hooks/use-sessions.test.ts` (negative-path test additions)

Out of scope:
- The remaining ~113 sites across ~35 other hook files (tracked in WI-1098)
- Any API-side changes (pure mobile validation layer)
- OTA or CI changes

---

## Schema Inventory

### New schemas needed in `packages/schemas/src/sessions.ts`

| Export name | Shape (exact) |
|---|---|
| `sessionStartResultSchema` | `z.object({ session: learningSessionSchema })` |
| `SessionStartResult` | `z.infer<typeof sessionStartResultSchema>` |
| `homeworkStateSyncResponseSchema` | `z.object({ metadata: homeworkSessionMetadataSchema })` |
| `HomeworkStateSyncResponse` | `z.infer<typeof homeworkStateSyncResponseSchema>` |
| `messageResultSchema` | `z.object({ response: z.string(), escalationRung: z.number().int(), isUnderstandingCheck: z.boolean(), exchangeCount: z.number().int(), expectedResponseMinutes: z.number(), aiEventId: z.string().optional() })` |
| `MessageResult` | `z.infer<typeof messageResultSchema>` |
| `closeResultSchema` | `z.object({ message: z.string(), sessionId: z.string().uuid(), wallClockSeconds: z.number().nonnegative(), summaryStatus: z.enum(['pending','submitted','accepted','skipped','auto_closed']).optional() })` |
| `CloseResult` | `z.infer<typeof closeResultSchema>` |
| `submitSummaryResultSchema` | `z.object({ summary: sessionSummarySchema.pick({ id: true, sessionId: true, content: true, aiFeedback: true, status: true, baseXp: true, reflectionBonusXp: true }) })` |
| `SubmitSummaryResult` | `z.infer<typeof submitSummaryResultSchema>` |
| `sessionSummaryGetResponseSchema` | `z.object({ summary: sessionSummarySchema })` |
| `SessionSummaryGetResponse` | `z.infer<typeof sessionSummaryGetResponseSchema>` |

Remove matching local `interface` declarations from `use-sessions.ts` after T6:
`SessionStartResult`, `MessageResult`, `CloseResult`, `SubmitSummaryResult`,
`SkipSummaryResult` (the local `SkipSummaryResult` interface is replaced by
importing the existing `skipSummaryResponseSchema` — the schema is a superset
with an optional `pipelineQueued` field that doesn't affect `.summary` access).

### New schemas needed in `packages/schemas/src/consent.ts`

`isoDateField` is already imported in that file. Add:

| Export name | Shape (exact) |
|---|---|
| `consentStatusDataSchema` | `z.object({ consentStatus: consentStatusSchema.nullable(), parentEmail: z.string().email().nullable(), consentType: consentTypeSchema.nullable() })` |
| `ConsentStatusData` | `z.infer<typeof consentStatusDataSchema>` |
| `childConsentDataSchema` | `z.object({ consentStatus: consentStatusSchema.nullable(), respondedAt: isoDateField.nullable(), consentType: consentTypeSchema.nullable() })` |
| `ChildConsentData` | `z.infer<typeof childConsentDataSchema>` |
| `revokeConsentResultSchema` | `z.object({ message: z.string(), consentStatus: consentStatusSchema })` |
| `RevokeConsentResult` | `z.infer<typeof revokeConsentResultSchema>` |

The existing exported interfaces `ConsentStatusData` and `ChildConsentData` in
`use-consent.ts` will be replaced by these schema-derived types. After T5, the
hook re-exports the types from `@eduagent/schemas` so existing screen importers
don't break:

```ts
export type { ConsentStatusData, ChildConsentData } from '@eduagent/schemas';
```

### Existing schemas that cover remaining sites (no addition needed)

| Site(s) | Schema to use |
|---|---|
| `use-quiz.ts` — `QuizRoundResponse` | `quizRoundResponseSchema` |
| `use-quiz.ts` — `QuestionCheckResponse` | `questionCheckResponseSchema` |
| `use-quiz.ts` — `CompleteRoundResponse` | `completeRoundResponseSchema` |
| `use-quiz.ts` — `RecentRound[]` (line 159) | `z.array(recentRoundSchema)` |
| `use-quiz.ts` — `QuizStats[]` (line 211) | `quizStatsListResponseSchema` |
| `use-consent.ts` — `ConsentRequestResult` | `consentRequestResultSchema` |
| `use-sessions.ts` — `TranscriptResponse` (line 633) | `transcriptResponseSchema` (already used there) |
| `use-sessions.ts` — `{ items: ParkingLotItem[] }` (lines 752, 783) | `parkingLotItemsResponseSchema` (superset; `.items` still accessible) |
| `use-sessions.ts` — `{ item: ParkingLotItem }` (line 807) | `parkingLotAddResponseSchema` |
| `use-sessions.ts` — `SkipSummaryResult` (line 896) | `skipSummaryResponseSchema` |
| `use-sessions.ts` — `RecallBridgeResult` (line 922) | `recallBridgeResultSchema` |

### Inline schemas (no named export needed)

Used in exactly one place each in `use-sessions.ts`:
- Lines 697, 714: `z.object({ ok: z.boolean() })`
- Line 731: `z.object({ message: z.string() })`

---

## Tasks

- [ ] T1: Write `parse-json.test.ts` (red) — done when: the test file exists at
  `apps/mobile/src/lib/parse-json.test.ts` and ALL tests in it fail (the module
  doesn't exist yet)

  Full test body:

  ```ts
  import { parseJson, ResponseValidationError } from './parse-json';
  import { z } from 'zod';

  const schema = z.object({ id: z.string(), value: z.number() });

  describe('parseJson', () => {
    it('returns parsed+validated data for a conforming response body', async () => {
      const res = new Response(JSON.stringify({ id: 'abc', value: 42 }), { status: 200 });
      const data = await parseJson(res, schema);
      expect(data).toEqual({ id: 'abc', value: 42 });
    });

    it('throws ResponseValidationError for a structurally invalid body', async () => {
      const res = new Response(
        JSON.stringify({ id: 123, value: 'not-a-number' }),
        { status: 200 },
      );
      await expect(parseJson(res, schema)).rejects.toBeInstanceOf(ResponseValidationError);
    });

    it('throws ResponseValidationError for a missing required field', async () => {
      const res = new Response(JSON.stringify({ id: 'abc' }), { status: 200 });
      await expect(parseJson(res, schema)).rejects.toBeInstanceOf(ResponseValidationError);
    });

    it('throws ResponseValidationError for a non-JSON body', async () => {
      const res = new Response('not json', { status: 200 });
      await expect(parseJson(res, schema)).rejects.toBeInstanceOf(ResponseValidationError);
    });

    it('ResponseValidationError carries the underlying ZodError', async () => {
      const res = new Response(JSON.stringify({ id: 123 }), { status: 200 });
      try {
        await parseJson(res, schema);
        fail('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ResponseValidationError);
        expect((err as ResponseValidationError).zodError).toBeDefined();
      }
    });

    it('ResponseValidationError has errorCode RESPONSE_VALIDATION_ERROR', async () => {
      const res = new Response('{}', { status: 200 });
      try {
        await parseJson(res, schema);
        fail('expected to throw');
      } catch (err) {
        expect((err as ResponseValidationError).errorCode).toBe('RESPONSE_VALIDATION_ERROR');
      }
    });
  });
  ```

- [ ] T2: Implement `parse-json.ts` (make T1 green) — done when: all T1 tests pass
  with `pnpm exec jest --findRelatedTests apps/mobile/src/lib/parse-json.ts --no-coverage`

  Full file: `apps/mobile/src/lib/parse-json.ts`

  ```ts
  import { ZodError, type ZodSchema } from 'zod';

  /**
   * [WI-1059] Thrown when a 2xx API response body fails Zod schema validation
   * at the mobile trust boundary.
   *
   * Screens MUST NOT match on error message text or error code string —
   * use `err instanceof ResponseValidationError` to detect this class, then
   * surface a generic "unexpected server response" fallback. Classification
   * must happen here, not per-screen (UX resilience rule).
   */
  export class ResponseValidationError extends Error {
    readonly errorCode = 'RESPONSE_VALIDATION_ERROR' as const;
    readonly zodError: ZodError;

    constructor(zodError: ZodError) {
      super(`API response validation failed: ${zodError.message}`);
      this.name = 'ResponseValidationError';
      this.zodError = zodError;
      Object.setPrototypeOf(this, ResponseValidationError.prototype);
    }
  }

  /**
   * [WI-1059] Trust-boundary response parser for mobile API hooks.
   *
   * Reads the response body ONCE (via `.text()`, to respect the single-use
   * stream constraint), JSON-parses it, validates against the provided Zod
   * schema, and returns the typed result.
   *
   * PRE-CONDITION: `await assertOk(res)` MUST be called before `parseJson`.
   * Calling this on an error response whose body was already consumed by
   * `assertOk` will produce a parse failure wrapped in `ResponseValidationError`.
   *
   * @throws {ResponseValidationError} on JSON parse failure or schema mismatch.
   */
  export async function parseJson<T>(res: Response, schema: ZodSchema<T>): Promise<T> {
    const text = await res.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new ResponseValidationError(
        new ZodError([{ code: 'custom', message: `Invalid JSON: ${String(err)}`, path: [] }]),
      );
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new ResponseValidationError(result.error);
    }
    return result.data;
  }
  ```

- [ ] T3: Add missing schemas to `@eduagent/schemas` — done when: all 9 new
  schema constants and their `z.infer` types are exported from
  `packages/schemas/src/index.ts`; `pnpm exec nx run schemas:typecheck` passes

  **packages/schemas/src/sessions.ts** — append before the final line of the file:

  ```ts
  // [WI-1059] Session API response schemas — trust-boundary validation at the
  // mobile client. Types derived here replace local interface declarations in
  // apps/mobile/src/hooks/use-sessions.ts.

  export const sessionStartResultSchema = z.object({
    session: learningSessionSchema,
  });
  export type SessionStartResult = z.infer<typeof sessionStartResultSchema>;

  export const homeworkStateSyncResponseSchema = z.object({
    metadata: homeworkSessionMetadataSchema,
  });
  export type HomeworkStateSyncResponse = z.infer<typeof homeworkStateSyncResponseSchema>;

  export const messageResultSchema = z.object({
    response: z.string(),
    escalationRung: z.number().int(),
    isUnderstandingCheck: z.boolean(),
    exchangeCount: z.number().int(),
    expectedResponseMinutes: z.number(),
    aiEventId: z.string().optional(),
  });
  export type MessageResult = z.infer<typeof messageResultSchema>;

  export const closeResultSchema = z.object({
    message: z.string(),
    sessionId: z.string().uuid(),
    wallClockSeconds: z.number().nonnegative(),
    summaryStatus: z
      .enum(['pending', 'submitted', 'accepted', 'skipped', 'auto_closed'])
      .optional(),
  });
  export type CloseResult = z.infer<typeof closeResultSchema>;

  export const submitSummaryResultSchema = z.object({
    summary: sessionSummarySchema.pick({
      id: true,
      sessionId: true,
      content: true,
      aiFeedback: true,
      status: true,
      baseXp: true,
      reflectionBonusXp: true,
    }),
  });
  export type SubmitSummaryResult = z.infer<typeof submitSummaryResultSchema>;

  export const sessionSummaryGetResponseSchema = z.object({
    summary: sessionSummarySchema,
  });
  export type SessionSummaryGetResponse = z.infer<typeof sessionSummaryGetResponseSchema>;
  ```

  **packages/schemas/src/consent.ts** — append before the final line of the file:

  ```ts
  // [WI-1059] Consent API response schemas — trust-boundary validation.

  export const consentStatusDataSchema = z.object({
    consentStatus: consentStatusSchema.nullable(),
    parentEmail: z.string().email().nullable(),
    consentType: consentTypeSchema.nullable(),
  });
  export type ConsentStatusData = z.infer<typeof consentStatusDataSchema>;

  export const childConsentDataSchema = z.object({
    consentStatus: consentStatusSchema.nullable(),
    respondedAt: isoDateField.nullable(),
    consentType: consentTypeSchema.nullable(),
  });
  export type ChildConsentData = z.infer<typeof childConsentDataSchema>;

  export const revokeConsentResultSchema = z.object({
    message: z.string(),
    consentStatus: consentStatusSchema,
  });
  export type RevokeConsentResult = z.infer<typeof revokeConsentResultSchema>;
  ```

  **packages/schemas/src/index.ts** — add all 9 new schema exports in the
  sections that match their source files (`sessions`, `consent`). Find the
  existing re-export blocks for those files and append the new names.

- [ ] T4: Wire `use-quiz.ts` (7 sites) — done when: all 7 `(await res.json()) as T`
  casts are replaced with `await parseJson(res, schema)` and
  `pnpm exec jest --findRelatedTests apps/mobile/src/hooks/use-quiz.ts --no-coverage`
  passes

  Add to imports:
  ```ts
  import { parseJson } from '../lib/parse-json';
  import {
    quizRoundResponseSchema,
    questionCheckResponseSchema,
    completeRoundResponseSchema,
    recentRoundSchema,
    quizStatsListResponseSchema,
  } from '@eduagent/schemas';
  import { z } from 'zod';
  ```

  Site replacements (the `type` imports `QuizRoundResponse`, `QuestionCheckResponse`,
  etc. stay — they're still used as the hook return type generics):

  | Line | Before | After |
  |------|--------|-------|
  | 38 | `(await res.json()) as QuizRoundResponse` | `await parseJson(res, quizRoundResponseSchema)` |
  | 64 | `(await res.json()) as QuizRoundResponse` | `await parseJson(res, quizRoundResponseSchema)` |
  | 109 | `(await res.json()) as QuestionCheckResponse` | `await parseJson(res, questionCheckResponseSchema)` |
  | 129 | `(await res.json()) as CompleteRoundResponse` | `await parseJson(res, completeRoundResponseSchema)` |
  | 159 | `(await res.json()) as RecentRound[]` | `await parseJson(res, z.array(recentRoundSchema))` |
  | 189 | `(await res.json()) as QuizRoundResponse` | `await parseJson(res, quizRoundResponseSchema)` |
  | 211 | `(await res.json()) as QuizStats[]` | `await parseJson(res, quizStatsListResponseSchema)` |

- [ ] T5: Wire `use-consent.ts` (5 sites) — done when: all 5 casts replaced,
  local `ConsentStatusData` and `ChildConsentData` interface declarations removed,
  re-exports added, and
  `pnpm exec jest --findRelatedTests apps/mobile/src/hooks/use-consent.ts --no-coverage`
  passes

  Add to imports:
  ```ts
  import { parseJson } from '../lib/parse-json';
  import {
    consentRequestResultSchema,
    consentStatusDataSchema,
    childConsentDataSchema,
    revokeConsentResultSchema,
    type ConsentStatusData,
    type ChildConsentData,
  } from '@eduagent/schemas';
  ```

  Remove the local `export interface ConsentStatusData { … }` and
  `export interface ChildConsentData { … }` declarations from the hook file.
  Add re-exports so screen importers don't need to change their import source:

  ```ts
  export type { ConsentStatusData, ChildConsentData } from '@eduagent/schemas';
  ```

  Site replacements:

  | Line | Before | After |
  |------|--------|-------|
  | 33 | `(await res.json()) as ConsentRequestResult` | `await parseJson(res, consentRequestResultSchema)` |
  | 68 | `(await res.json()) as ConsentRequestResult` | `await parseJson(res, consentRequestResultSchema)` |
  | 109 | `(await res.json()) as ConsentStatusData` | `await parseJson(res, consentStatusDataSchema)` |
  | 177 | `(await res.json()) as ChildConsentData` | `await parseJson(res, childConsentDataSchema)` |
  | 210 | `(await res.json()) as RevokeConsentResult` | `await parseJson(res, revokeConsentResultSchema)` |

- [ ] T6: Wire `use-sessions.ts` (17 casted + 2 untyped sites) — done when: all
  19 `res.json()` calls replaced with `await parseJson(res, schema)`, local
  interface declarations for `SessionStartResult`, `MessageResult`, `CloseResult`,
  `SubmitSummaryResult`, `SkipSummaryResult` removed, and
  `pnpm exec jest --findRelatedTests apps/mobile/src/hooks/use-sessions.ts --no-coverage`
  passes

  Add to imports:
  ```ts
  import { parseJson } from '../lib/parse-json';
  import { z } from 'zod';
  import {
    sessionStartResultSchema,
    homeworkStateSyncResponseSchema,
    messageResultSchema,
    closeResultSchema,
    submitSummaryResultSchema,
    skipSummaryResponseSchema,
    recallBridgeResultSchema,
    parkingLotItemsResponseSchema,
    parkingLotAddResponseSchema,
    sessionSummaryGetResponseSchema,
    type SessionStartResult,
    type MessageResult,
    type CloseResult,
    type SubmitSummaryResult,
  } from '@eduagent/schemas';
  ```

  `transcriptResponseSchema` is already imported. `parkingLotItemsResponseSchema`,
  `parkingLotAddResponseSchema`, `skipSummaryResponseSchema`, `recallBridgeResultSchema`
  may already be imported — add if missing.

  Site-by-site replacements:

  | Line | Before | After | Schema source |
  |------|--------|-------|---------------|
  | 230 | `(await res.json()) as SessionStartResult` | `await parseJson(res, sessionStartResultSchema)` | new (T3) |
  | 269 | `(await res.json()) as SessionStartResult` | `await parseJson(res, sessionStartResultSchema)` | new (T3) |
  | 291 | `(await res.json()) as SessionStartResult` | `await parseJson(res, sessionStartResultSchema)` | new (T3) |
  | 326 | `(await res.json()) as SessionStartResult` | `await parseJson(res, sessionStartResultSchema)` | new (T3) |
  | 355 | `(await res.json()) as { metadata: HomeworkSessionMetadata }` | `await parseJson(res, homeworkStateSyncResponseSchema)` | new (T3) |
  | 375 | `(await res.json()) as MessageResult` | `await parseJson(res, messageResultSchema)` | new (T3) |
  | 404 | `(await res.json()) as unknown as CloseResult` | `await parseJson(res, closeResultSchema)` | new (T3) |
  | 633 | `const raw = await res.json(); return transcriptResponseSchema.parse(raw)` | `return await parseJson(res, transcriptResponseSchema)` | exists |
  | 666 | `(await res.json()) as { session: LearningSession }` | `await parseJson(res, sessionStartResultSchema)` | new (T3) |
  | 697 | `(await res.json()) as { ok: boolean }` | `await parseJson(res, z.object({ ok: z.boolean() }))` | inline |
  | 714 | `(await res.json()) as { ok: boolean }` | `await parseJson(res, z.object({ ok: z.boolean() }))` | inline |
  | 731 | `(await res.json()) as { message: string }` | `await parseJson(res, z.object({ message: z.string() }))` | inline |
  | 752 | `(await res.json()) as { items: ParkingLotItem[] }` | `(await parseJson(res, parkingLotItemsResponseSchema)).items` | exists |
  | 783 | `(await res.json()) as { items: ParkingLotItem[] }` | `(await parseJson(res, parkingLotItemsResponseSchema)).items` | exists |
  | 807 | `(await res.json()) as { item: ParkingLotItem }` | `await parseJson(res, parkingLotAddResponseSchema)` | exists |
  | 841 | `const data = await res.json(); return data.summary` | `const data = await parseJson(res, sessionSummaryGetResponseSchema); return data.summary` | new (T3) |
  | 868 | `(await res.json()) as SubmitSummaryResult` | `await parseJson(res, submitSummaryResultSchema)` | new (T3) |
  | 896 | `(await res.json()) as SkipSummaryResult` | `await parseJson(res, skipSummaryResponseSchema)` | exists |
  | 922 | `(await res.json()) as RecallBridgeResult` | `await parseJson(res, recallBridgeResultSchema)` | exists |

  Lines 752/783: the current code assigns to `const data` then returns `data.items`.
  After migration, inline the `.items` accessor as shown above, or keep
  `const data = await parseJson(res, parkingLotItemsResponseSchema)` and
  `return data.items` — both are equivalent. Prefer the two-line form if the
  surrounding code already uses `data`.

  Remove local interface declarations: `SessionStartResult`, `MessageResult`,
  `CloseResult`, `SubmitSummaryResult`, `SkipSummaryResult`. The `FilingStatus`
  type alias and `StreamMessageDoneResult` type remain (they are not response types).

- [ ] T7: Add negative-path (malformed-payload) rejection tests to all three hook
  test files — done when: each file has at least one new `it` test per file that
  (a) mocks a malformed response body, (b) triggers the hook, and (c) asserts
  `result.current.error` is an instance of `ResponseValidationError`; all three
  targeted jest runs pass

  **use-quiz.test.ts** — add inside or after the `useGenerateRound` describe block:

  ```ts
  import { ResponseValidationError } from '../lib/parse-json';

  it('[WI-1059] rejects a malformed round response with ResponseValidationError', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 123, activityType: null }), { status: 200 }),
    );

    const { result } = renderHook(() => useGenerateRound(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ activityType: 'vocabulary' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(ResponseValidationError);
  });
  ```

  **use-consent.test.ts** — add inside or after the `useConsentStatus` describe block
  (or `useRequestConsent` if `useConsentStatus` isn't already tested):

  ```ts
  import { ResponseValidationError } from '../lib/parse-json';

  it('[WI-1059] rejects a malformed consent status response with ResponseValidationError', async () => {
    mockFetch.mockResolvedValueOnce(
      // missing consentStatus field
      new Response(JSON.stringify({ parentEmail: 'x@x.com' }), { status: 200 }),
    );

    const { result } = renderHook(() => useConsentStatus(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(ResponseValidationError);
  });
  ```

  Note: `consentStatusDataSchema` requires `consentStatus`, `parentEmail`,
  and `consentType` — all nullable but required keys. An object missing
  `consentStatus` entirely will fail validation.

  **use-sessions.test.ts** — add a test for the simplest start-session hook;
  check the existing test file for how `useStartSession` is rendered, follow
  the same wrapper/mockFetch pattern:

  ```ts
  import { ResponseValidationError } from '../lib/parse-json';

  it('[WI-1059] rejects a malformed session-start response with ResponseValidationError', async () => {
    mockFetch.mockResolvedValueOnce(
      // missing required `session` field
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useStartSession('subject-id'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(ResponseValidationError);
  });
  ```

- [ ] T8: Final typecheck + full targeted test run — done when: all commands below
  exit clean with zero errors or failures

  ```bash
  # schemas package (new exports)
  pnpm exec nx run schemas:typecheck

  # mobile type-check (wiring changes)
  cd apps/mobile && pnpm exec tsc --noEmit

  # helper unit tests
  pnpm exec jest --findRelatedTests apps/mobile/src/lib/parse-json.ts --no-coverage

  # hook tests (positive + negative paths)
  pnpm exec jest --findRelatedTests \
    apps/mobile/src/hooks/use-quiz.ts \
    apps/mobile/src/hooks/use-consent.ts \
    apps/mobile/src/hooks/use-sessions.ts \
    --no-coverage
  ```
