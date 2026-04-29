# Filing Timed-Out Observer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent dead-end after `app/session.filing_timed_out` with an active reconciliation observer, a queryable filing-status state machine on `learning_sessions`, and a non-blocking session-summary banner with a user-initiated retry path.

**Architecture:** Two new Inngest functions cooperate. `filing-timed-out-observe` reacts to the timeout event, captures a diagnostic snapshot, re-reads the session row, runs at most one automatic retry against the existing `freeform-filing-retry` handler, and on terminal failure marks the session and dispatches a push notification. A trivial companion `filing-completed-observe` listens to `app/filing.completed` and flips degraded sessions to `filing_recovered`. The mobile session-summary screen polls a new `filingStatus` field and renders a banner with a retry CTA backed by a new scoped, rate-limited endpoint. A one-shot backfill emits synthetic timeout events for the existing stranded cohort.

**Tech Stack:** Hono + Inngest (Cloudflare Workers), Drizzle ORM + Postgres (Neon HTTP, no interactive transactions — `db.batch()` is the ACID escape hatch), Zod for runtime contracts in `@eduagent/schemas`, React Native + Expo Router + TanStack Query on mobile, Jest with co-located tests.

**Spec:** `docs/superpowers/specs/2026-04-29-filing-timed-out-observer-design.md`
**Finding ID:** `[FILING-TIMEOUT-OBS]`

---

## File Map

This is the inventory of every file the plan creates or modifies, grouped by responsibility. Each task below references a subset of these.

### Created
- `packages/schemas/src/inngest-events.ts` — Zod schemas for `filingTimedOutEventSchema`, `filingRetryEventSchema`, `filingRetryCompletedEventSchema`, `filingResolvedEventSchema`. Single source of truth for these four event payloads. `filing.retry_completed` is distinct from the existing `filing.completed` so the observer can wait for *retry-driven* completion without being tripped by an in-flight original filing landing during the wait window.
- `apps/api/drizzle/0040_filing_state_tracking.sql` — Migration adding `filed_at`, `filing_status` enum + column, `filing_retry_count`.
- `apps/api/src/inngest/functions/filing-timed-out-observe.ts` — The active reconciliation observer.
- `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts` — Unit tests for the observer (mocked `step` fixtures).
- `apps/api/src/inngest/functions/filing-completed-observe.ts` — Companion observer that flips degraded sessions to `filing_recovered`.
- `apps/api/src/inngest/functions/filing-completed-observe.test.ts` — Unit tests for the companion.
- `apps/api/src/inngest/functions/filing-stranded-backfill.ts` — One-shot backfill function for pre-existing stranded sessions.
- `apps/api/src/inngest/functions/filing-stranded-backfill.test.ts` — Unit tests for the backfill.
- `tests/integration/filing-timed-out-observer.integration.test.ts` — Real-Postgres end-to-end test of the observer + companion pair.
- `apps/mobile/src/components/session/FilingFailedBanner.tsx` — The banner component.
- `apps/mobile/src/components/session/FilingFailedBanner.test.tsx` — Component tests.
- `apps/mobile/src/hooks/use-retry-filing.ts` — TanStack Query mutation hook for `POST /v1/sessions/:id/retry-filing`.
- `apps/mobile/src/hooks/use-retry-filing.test.ts` — Hook tests.

### Modified
- `packages/schemas/src/errors.ts` — Add `RateLimitedError` so the API can throw and the mobile client can `instanceof`-match across the package boundary.
- `packages/schemas/src/index.ts` — Re-export the new error and the new inngest-events module.
- `packages/database/src/schema/sessions.ts` — Add `filingStatusEnum`, `filedAt`, `filingStatus`, `filingRetryCount` columns to `learningSessions` (lines 87-135).
- `apps/api/src/services/filing.ts` — Inside `resolveFilingResult` transaction (line 437), set `filedAt: new Date()` so it becomes the authoritative filing watermark.
- `apps/api/src/services/filing.test.ts` (or co-located) — Add break test that `filedAt` lands.
- `apps/api/src/inngest/functions/session-completed.ts` — Replace the inline object literal at line 175 with `filingTimedOutEventSchema.parse(...)` so dispatch is gated by the schema.
- `apps/api/src/inngest/functions/session-completed.test.ts` — Add test for schema gate.
- `apps/api/src/inngest/functions/freeform-filing.ts` — (a) Short-circuit when `filed_at IS NOT NULL` so a retry triggered after the original filing finally lands is a no-op (avoids duplicate `resolveFilingResult` writes). (b) Emit a new `app/filing.retry_completed` event in addition to the existing `app/filing.completed` so observers can correlate against retry attempts specifically.
- `apps/api/src/inngest/functions/freeform-filing.test.ts` — Tests for the short-circuit and the new event.
- `apps/api/src/inngest/index.ts` — Register `filingTimedOutObserve`, `filingCompletedObserve`, `filingStrandedBackfill` in the import block, the re-export block, and the `functions` array.
- `apps/api/src/services/notifications.ts` — Add `'session_filing_failed'` to the `NotificationPayload['type']` union (line 29-46) and a `formatFilingFailedPush()` helper.
- `apps/api/src/services/notifications.test.ts` — Test for the new formatter.
- `apps/api/src/services/session.ts` — Extend the response of `getSession()` (or whichever DTO function feeds `GET /v1/sessions/:id`) to include `filingStatus`, `filingRetryCount`, `filedAt`.
- `apps/api/src/routes/sessions.ts` — Add `POST /v1/sessions/:sessionId/retry-filing` endpoint with scoped repo, atomic increment, and metering middleware.
- `apps/api/src/routes/sessions.test.ts` — Add the eight tests from spec §8.3.
- `apps/mobile/src/lib/api-errors.ts` — Re-export `RateLimitedError` from `@eduagent/schemas` (the mobile-local copy is being hoisted in this plan, so import-renaming any callers).
- `apps/mobile/src/lib/api-client.ts` (or middleware that classifies HTTP errors) — Confirm 429 → `RateLimitedError` mapping is intact after the re-export refactor.
- `apps/mobile/src/hooks/use-sessions.ts` — Add `refetchInterval` predicate that polls every 15 s on `null` / `'filing_pending'` and stops on terminal states.
- `apps/mobile/src/app/session-summary/[sessionId].tsx` — Mount `<FilingFailedBanner />` above the existing summary content, gated by `session.filingStatus`.

---

## Phase 0 — Foundations (no other phase compiles without these)

### Task 0.1: Add `RateLimitedError` to shared schemas package

**Files:**
- Modify: `packages/schemas/src/errors.ts`
- Modify: `packages/schemas/src/index.ts`
- Test: `packages/schemas/src/errors.test.ts` (create or extend)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/schemas/src/errors.test.ts
import { RateLimitedError } from './errors';

describe('RateLimitedError', () => {
  it('exposes name, message, code, and retryAfter', () => {
    const err = new RateLimitedError('too fast', 'RATE_LIMITED', undefined, 30);
    expect(err.name).toBe('RateLimitedError');
    expect(err.message).toBe('too fast');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfter).toBe(30);
    expect(err).toBeInstanceOf(Error);
  });

  it('matches instanceof checks across module boundary', () => {
    const err: unknown = new RateLimitedError('x');
    expect(err instanceof RateLimitedError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest packages/schemas/src/errors.test.ts --no-coverage`
Expected: FAIL with `RateLimitedError is not exported`.

- [ ] **Step 3: Add the class to `packages/schemas/src/errors.ts`**

Insert above `export class UpstreamLlmError`:

```typescript
export class RateLimitedError extends Error {
  readonly code: string | undefined;
  /** Seconds until the client may retry (from Retry-After header). */
  readonly retryAfter: number | undefined;

  constructor(
    message = "You've hit the limit. Wait a moment and try again.",
    code?: string,
    _details?: unknown,
    retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitedError';
    this.code = code;
    this.retryAfter = retryAfter;
    // Required for `instanceof` to work on transpiled `extends Error` subclasses
    // (target ≤ ES5 in the React Native bundle). Without this line the cross-package
    // hoist fails silently — `err instanceof RateLimitedError` returns `false` even
    // for genuine instances thrown from the API client.
    Object.setPrototypeOf(this, RateLimitedError.prototype);
  }
}
```

Mirror the same pattern for any *other* shared error classes the mobile bundle uses for `instanceof` checks (`ConflictError`, `UpstreamLlmError`, etc.) if they don't already have it. Add a dedicated test that proves the cross-bundle behavior:

```typescript
// packages/schemas/src/errors.test.ts (additional case)
it('preserves instanceof when re-imported through the package barrel', async () => {
  const { RateLimitedError: FromBarrel } = await import('./index');
  const err = new FromBarrel('barrel');
  expect(err instanceof FromBarrel).toBe(true);
});
```

- [ ] **Step 4: Re-export from the package barrel**

In `packages/schemas/src/index.ts`, ensure `errors` is re-exported (it almost certainly already is). Confirm `RateLimitedError` is now visible.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec jest packages/schemas/src/errors.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 6: Replace the mobile-local copy**

In `apps/mobile/src/lib/api-errors.ts`:
- Delete the local `export class RateLimitedError { ... }` block (lines 80–99).
- Replace with `export { RateLimitedError } from '@eduagent/schemas';`

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: no errors. Any `instanceof RateLimitedError` checks now match across the package boundary.

- [ ] **Step 7: Commit**

```bash
git add packages/schemas/src/errors.ts packages/schemas/src/errors.test.ts apps/mobile/src/lib/api-errors.ts
git commit -m "feat(schemas): hoist RateLimitedError to shared package [FILING-TIMEOUT-OBS]"
```

### Task 0.2: Add `'session_filing_failed'` notification type

**Files:**
- Modify: `apps/api/src/services/notifications.ts`
- Test: `apps/api/src/services/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/notifications.test.ts (append to existing file)
import { formatFilingFailedPush } from './notifications';

describe('formatFilingFailedPush', () => {
  it('returns title and body referencing the session', () => {
    const { title, body } = formatFilingFailedPush();
    expect(title).toMatch(/topic placement/i);
    expect(body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/services/notifications.test.ts --no-coverage`
Expected: FAIL with `formatFilingFailedPush is not exported`.

- [ ] **Step 3: Extend `NotificationPayload['type']` and add formatter**

In `apps/api/src/services/notifications.ts`:

Append `'session_filing_failed'` to the `type:` union (line ~46).

Add the formatter near the other `format*` helpers:

```typescript
export function formatFilingFailedPush(): { title: string; body: string } {
  return {
    title: 'Topic placement needs attention',
    body: "We couldn't sort your last session into a topic. Tap to try again.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/services/notifications.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications.ts apps/api/src/services/notifications.test.ts
git commit -m "feat(api): add session_filing_failed push notification type [FILING-TIMEOUT-OBS]"
```

### Task 0.3: Create Inngest event Zod schemas

**Files:**
- Create: `packages/schemas/src/inngest-events.ts`
- Modify: `packages/schemas/src/index.ts`
- Test: `packages/schemas/src/inngest-events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/schemas/src/inngest-events.test.ts
import {
  filingTimedOutEventSchema,
  filingRetryEventSchema,
  filingResolvedEventSchema,
} from './inngest-events';

const validUuid = '00000000-0000-4000-8000-000000000001';

describe('filingTimedOutEventSchema', () => {
  it('accepts a valid payload', () => {
    expect(() =>
      filingTimedOutEventSchema.parse({
        sessionId: validUuid,
        profileId: validUuid,
        sessionType: 'learning',
        timeoutMs: 60_000,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).not.toThrow();
  });

  it('accepts null sessionType (matches dispatch site)', () => {
    expect(() =>
      filingTimedOutEventSchema.parse({
        sessionId: validUuid,
        profileId: validUuid,
        sessionType: null,
        timeoutMs: 60_000,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).not.toThrow();
  });

  it('rejects non-UUID sessionId', () => {
    expect(() =>
      filingTimedOutEventSchema.parse({
        sessionId: 'not-a-uuid',
        profileId: validUuid,
        sessionType: null,
        timeoutMs: 60_000,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).toThrow();
  });
});

describe('filingRetryEventSchema', () => {
  it('accepts a payload with optional sessionTranscript omitted', () => {
    expect(() =>
      filingRetryEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionMode: 'freeform',
      })
    ).not.toThrow();
  });
});

describe('filingRetryCompletedEventSchema', () => {
  it('accepts a valid payload', () => {
    expect(() =>
      filingRetryCompletedEventSchema.parse({
        sessionId: validUuid,
        profileId: validUuid,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).not.toThrow();
  });
});

describe('filingResolvedEventSchema', () => {
  it.each(['late_completion', 'retry_succeeded', 'unrecoverable', 'recovered'] as const)(
    'accepts resolution: %s',
    (resolution) => {
      expect(() =>
        filingResolvedEventSchema.parse({
          sessionId: validUuid,
          profileId: validUuid,
          resolution,
          timestamp: '2026-04-29T10:00:00.000Z',
        })
      ).not.toThrow();
    }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest packages/schemas/src/inngest-events.test.ts --no-coverage`
Expected: FAIL with `Cannot find module './inngest-events'`.

- [ ] **Step 3: Create `packages/schemas/src/inngest-events.ts`**

```typescript
import { z } from 'zod';

/**
 * Dispatched by `session-completed` when filing fails to publish
 * `app/filing.completed` within its 60-second waitForEvent window.
 *
 * NOTE: `sessionType` is the raw value from `event.data.sessionType` at the
 * dispatch site, which can be `'learning' | 'homework' | 'interleaved' |
 * null`. We accept any nullable string here because the observer does not
 * branch on it directly — it derives `sessionMode` for the retry payload.
 */
export const filingTimedOutEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionType: z.string().nullable(),
  timeoutMs: z.number().int().positive(),
  timestamp: z.string().datetime(),
});
export type FilingTimedOutEvent = z.infer<typeof filingTimedOutEventSchema>;

/**
 * Dispatched by the observer (auto-retry) AND by the user-retry endpoint to
 * trigger `freeform-filing-retry`. The handler self-heals an absent transcript
 * from the DB, so `sessionTranscript` is optional.
 */
export const filingRetryEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']),
  sessionTranscript: z.string().optional(),
});
export type FilingRetryEvent = z.infer<typeof filingRetryEventSchema>;

/**
 * Terminal-outcome event so a session's filing journey is queryable from
 * Inngest event history without scraping logs. Emitted by the observer
 * (late_completion, retry_succeeded, unrecoverable) and by the companion
 * (recovered).
 */
export const filingResolvedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  resolution: z.enum([
    'late_completion',
    'retry_succeeded',
    'unrecoverable',
    'recovered',
  ]),
  timestamp: z.string().datetime(),
});
export type FilingResolvedEvent = z.infer<typeof filingResolvedEventSchema>;
```

- [ ] **Step 4: Re-export from the package barrel**

In `packages/schemas/src/index.ts`, add:

```typescript
export * from './inngest-events';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec jest packages/schemas/src/inngest-events.test.ts --no-coverage`
Expected: PASS — all three describe blocks green.

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/inngest-events.ts packages/schemas/src/inngest-events.test.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): add Zod schemas for filing lifecycle Inngest events [FILING-TIMEOUT-OBS]"
```

---

## Phase 1 — Database

### Task 1.1: Author migration `0040_filing_state_tracking.sql`

**Files:**
- Create: `apps/api/drizzle/0040_filing_state_tracking.sql`

- [ ] **Step 1: Create the migration**

```sql
-- 0040_filing_state_tracking.sql
-- [FILING-TIMEOUT-OBS] Add filing watermark + state machine + retry budget.
-- Non-destructive: all columns nullable or default 0. Rollback procedure in
-- the spec at docs/superpowers/specs/2026-04-29-filing-timed-out-observer-design.md §4.3.

ALTER TABLE "learning_sessions"
  ADD COLUMN "filed_at" timestamp with time zone DEFAULT NULL;

CREATE TYPE "filing_status" AS ENUM (
  'filing_pending',
  'filing_failed',
  'filing_recovered'
);

ALTER TABLE "learning_sessions"
  ADD COLUMN "filing_status" "filing_status" DEFAULT NULL;

CREATE INDEX "learning_sessions_filing_status_idx"
  ON "learning_sessions" ("filing_status")
  WHERE "filing_status" IS NOT NULL;

ALTER TABLE "learning_sessions"
  ADD COLUMN "filing_retry_count" integer NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply to local dev DB**

Run: `pnpm run db:push:dev`
Expected: applies the new migration. `psql` (or any DB explorer) confirms the three columns + enum + partial index exist.

### Task 1.2: Update Drizzle schema

**Files:**
- Modify: `packages/database/src/schema/sessions.ts`

- [ ] **Step 1: Write a (compile-time) test that the schema exports the new enum**

```typescript
// packages/database/src/schema/sessions.test.ts (create file)
import { filingStatusEnum, learningSessions } from './sessions';

describe('learning_sessions filing fields', () => {
  it('exports filingStatusEnum with three variants', () => {
    expect(filingStatusEnum.enumValues).toEqual([
      'filing_pending',
      'filing_failed',
      'filing_recovered',
    ]);
  });

  it('learningSessions table object exposes filedAt, filingStatus, filingRetryCount', () => {
    expect(learningSessions.filedAt).toBeDefined();
    expect(learningSessions.filingStatus).toBeDefined();
    expect(learningSessions.filingRetryCount).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest packages/database/src/schema/sessions.test.ts --no-coverage`
Expected: FAIL — `filingStatusEnum` does not exist.

- [ ] **Step 3: Add to `packages/database/src/schema/sessions.ts`**

After the existing `summaryStatusEnum` declaration, add:

```typescript
export const filingStatusEnum = pgEnum('filing_status', [
  'filing_pending',
  'filing_failed',
  'filing_recovered',
]);
```

Inside the `learningSessions = pgTable('learning_sessions', { ... })` columns block (after `rawInput`):

```typescript
filedAt: timestamp('filed_at', { withTimezone: true }),
filingStatus: filingStatusEnum('filing_status'),
filingRetryCount: integer('filing_retry_count').notNull().default(0),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest packages/database/src/schema/sessions.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 5: Confirm typecheck passes**

Run: `pnpm exec nx run api:typecheck`
Expected: green. (If `learningSessions.filedAt` etc. are referenced by any existing service that does not yet handle the new columns, fix those compile errors here — the new columns are nullable so no logic change is required, only the type widening propagates.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/drizzle/0040_filing_state_tracking.sql packages/database/src/schema/sessions.ts packages/database/src/schema/sessions.test.ts
git commit -m "feat(database): add filed_at + filing_status + filing_retry_count to learning_sessions [FILING-TIMEOUT-OBS]"
```

---

## Phase 2 — `filed_at` becomes the filing watermark

### Task 2.1: `resolveFilingResult` writes `filed_at` inside its transaction

**Files:**
- Modify: `apps/api/src/services/filing.ts` (around line 437, inside the transaction body)
- Test: `apps/api/src/services/filing.test.ts`

- [ ] **Step 1: Write the failing test**

Find the existing `resolveFilingResult` describe block and add:

```typescript
// apps/api/src/services/filing.test.ts (append within existing describe)
it('sets filed_at on the session row inside the same transaction', async () => {
  // Arrange — insert profile + session with filed_at = null
  const sessionId = '00000000-0000-4000-8000-000000000099';
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    sessionType: 'learning',
    inputMode: 'text',
    /* filedAt intentionally omitted — defaults to null */
  });

  // Act
  await resolveFilingResult(db, {
    profileId,
    filingResponse: validFilingResponseFixture,
    filedFrom: 'freeform_filing',
    sessionId,
  });

  // Assert
  const row = await db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
  expect(row?.filedAt).toBeInstanceOf(Date);
});
```

(Use the test-suite's existing helper for inserting a profile + subject; reuse the existing `validFilingResponseFixture` if one exists — otherwise extract from a passing sibling test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/services/filing.test.ts -t "sets filed_at" --no-coverage`
Expected: FAIL — `row?.filedAt` is `null` because no UPDATE was issued.

- [ ] **Step 3: Modify `resolveFilingResult` inside the transaction**

In `apps/api/src/services/filing.ts`, locate the `db.transaction(async (tx) => { ... })` block at line 445. Find the existing point where the topic is resolved and the session row would be touched (search for `learningSessions` references inside the transaction). Just before the transaction returns its result, add:

```typescript
if (sessionId) {
  await txDb
    .update(learningSessions)
    .set({ filedAt: new Date() })
    .where(eq(learningSessions.id, sessionId));
}
```

If a prior `update(learningSessions)` already runs to set `topicId`, fold `filedAt: new Date()` into that same `set({...})` call to keep the write count down.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/services/filing.test.ts -t "sets filed_at" --no-coverage`
Expected: PASS.

- [ ] **Step 5: Run the rest of the filing test file**

Run: `pnpm exec jest apps/api/src/services/filing.test.ts --no-coverage`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/filing.ts apps/api/src/services/filing.test.ts
git commit -m "feat(api): resolveFilingResult writes filed_at inside tx [FILING-TIMEOUT-OBS]"
```

---

## Phase 3 — Validate the existing dispatch site

### Task 3.1: Gate the `app/session.filing_timed_out` dispatch with the new schema

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts` (around line 175)
- Test: `apps/api/src/inngest/functions/session-completed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/inngest/functions/session-completed.test.ts (append)
it('dispatches a payload that conforms to filingTimedOutEventSchema', async () => {
  const sentEvents: Array<{ name: string; data: unknown }> = [];
  const step = makeStepStub({
    waitForEvent: async () => null, // force the timeout branch
    sendEvent: async (_id: string, payload: { name: string; data: unknown }) => {
      sentEvents.push(payload);
    },
  });

  await sessionCompleted.fn({
    event: {
      data: {
        sessionId: validUuid,
        profileId: validUuid,
        sessionType: 'learning',
        exchangeCount: 5,
      },
    },
    step,
  } as never);

  const dispatched = sentEvents.find(
    (e) => e.name === 'app/session.filing_timed_out'
  );
  expect(dispatched).toBeDefined();
  expect(() => filingTimedOutEventSchema.parse(dispatched!.data)).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/inngest/functions/session-completed.test.ts -t "filingTimedOutEventSchema" --no-coverage`
Expected: FAIL — the existing dispatch builds a `timestamp: string` but does not validate. The test will pass *coincidentally* if the existing object is already conformant, in which case adjust the test to verify the call is wrapped in `.parse(...)` by spying on the schema (mock `filingTimedOutEventSchema.parse` to throw).

- [ ] **Step 3: Update the dispatch site at `session-completed.ts:175`**

Replace:

```typescript
await step.sendEvent('filing-timed-out', {
  name: 'app/session.filing_timed_out',
  data: {
    sessionId,
    profileId,
    sessionType: sessionType ?? null,
    timeoutMs: 60_000,
    timestamp: new Date().toISOString(),
  },
});
```

with:

```typescript
import { filingTimedOutEventSchema } from '@eduagent/schemas';
// ...
const filingTimedOutPayload = filingTimedOutEventSchema.parse({
  sessionId,
  profileId,
  sessionType: sessionType ?? null,
  timeoutMs: 60_000,
  timestamp: new Date().toISOString(),
});
await step.sendEvent('filing-timed-out', {
  name: 'app/session.filing_timed_out',
  data: filingTimedOutPayload,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/inngest/functions/session-completed.test.ts --no-coverage`
Expected: PASS (full suite).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inngest/functions/session-completed.ts apps/api/src/inngest/functions/session-completed.test.ts
git commit -m "fix(api): validate filing_timed_out dispatch via Zod schema [FILING-TIMEOUT-OBS]"
```

---

## Phase 4 — `filing-completed-observe` (the simple companion)

### Task 4.1: Write tests for the companion observer

**Files:**
- Create: `apps/api/src/inngest/functions/filing-completed-observe.test.ts`

- [ ] **Step 1: Write four failing tests**

```typescript
// apps/api/src/inngest/functions/filing-completed-observe.test.ts
import { filingCompletedObserve } from './filing-completed-observe';
import { getStepDatabase } from '../helpers';
// ... shared test helpers (use the same setup as ask-classification-observe.test.ts)

const validUuid = '00000000-0000-4000-8000-000000000001';

describe('filing-completed-observe', () => {
  it('flips filing_pending → filing_recovered on completion event', async () => {
    // seed: insert a session row with filing_status = 'filing_pending'
    // act: invoke filingCompletedObserve.fn with mocked step
    // assert: row's filing_status === 'filing_recovered' AND filed_at is set
    // assert: a 'app/session.filing_resolved' event with resolution: 'recovered' was dispatched
  });

  it('flips filing_failed → filing_recovered on completion event', async () => {
    // seed: filing_status = 'filing_failed'
    // assert: same as above
  });

  it('is a no-op for sessions with filing_status = null', async () => {
    // seed: filing_status = null (the healthy case)
    // act + assert: row unchanged, no resolved event dispatched
  });

  it('dispatches app/session.filing_resolved with resolution recovered', async () => {
    // covered by the first two — assert the dispatched payload conforms
    // to filingResolvedEventSchema with resolution === 'recovered'
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-completed-observe.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './filing-completed-observe'`.

### Task 4.2: Implement the companion observer

**Files:**
- Create: `apps/api/src/inngest/functions/filing-completed-observe.ts`

- [ ] **Step 1: Implement the function**

```typescript
// apps/api/src/inngest/functions/filing-completed-observe.ts
import { and, eq, inArray } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { filingResolvedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const filingCompletedObserve = inngest.createFunction(
  {
    id: 'filing-completed-observe',
    name: 'Filing completion audit observer',
  },
  { event: 'app/filing.completed' },
  async ({ event, step }) => {
    const data = event.data as { sessionId?: string; profileId?: string };
    const sessionId = data.sessionId;
    const profileId = data.profileId;

    if (!sessionId || !profileId) {
      logger.warn('[filing-completed-observe] missing sessionId/profileId', { data });
      return { recovered: false };
    }

    const updated = await step.run('flip-status-if-recovering', async () => {
      const db = getStepDatabase();
      const result = await db
        .update(learningSessions)
        .set({ filingStatus: 'filing_recovered', filedAt: new Date() })
        .where(
          and(
            eq(learningSessions.id, sessionId),
            inArray(learningSessions.filingStatus, [
              'filing_pending',
              'filing_failed',
            ])
          )
        )
        .returning({ id: learningSessions.id });
      return result.length > 0;
    });

    if (updated) {
      const resolvedPayload = filingResolvedEventSchema.parse({
        sessionId,
        profileId,
        resolution: 'recovered',
        timestamp: new Date().toISOString(),
      });
      await step.sendEvent('emit-resolved', {
        name: 'app/session.filing_resolved',
        data: resolvedPayload,
      });
      logger.info('[filing-completed-observe] session recovered', {
        sessionId,
        profileId,
      });
    }

    return { recovered: updated };
  }
);
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-completed-observe.test.ts --no-coverage`
Expected: all four PASS.

### Task 4.3: Register companion in Inngest function list

**Files:**
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Add the import, re-export, and register the function**

Add `import { filingCompletedObserve } from './functions/filing-completed-observe';` alongside the other imports. Add `filingCompletedObserve,` to the re-export block and to the `functions` array.

- [ ] **Step 2: Run typecheck + Inngest registration test**

Run: `pnpm exec nx run api:typecheck && pnpm exec jest apps/api/src/inngest/index.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/inngest/functions/filing-completed-observe.ts apps/api/src/inngest/functions/filing-completed-observe.test.ts apps/api/src/inngest/index.ts
git commit -m "feat(api): add filing-completed-observe companion + filing_resolved events [FILING-TIMEOUT-OBS]"
```

---

## Phase 5 — `filing-timed-out-observe` (the active reconciliation observer)

This phase is the bulk of the change. Each branch of the state machine is its own task so a regression in one branch doesn't mask others.

### Task 5.1: Skeleton + schema gate

**Files:**
- Create: `apps/api/src/inngest/functions/filing-timed-out-observe.ts`
- Create: `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/inngest/functions/filing-timed-out-observe.test.ts
import { filingTimedOutObserve } from './filing-timed-out-observe';

describe('filing-timed-out-observe — schema gate', () => {
  it('throws when payload fails filingTimedOutEventSchema', async () => {
    const step = { run: jest.fn(), sendEvent: jest.fn(), waitForEvent: jest.fn() };
    await expect(
      filingTimedOutObserve.fn({
        event: { data: { not: 'a real payload' } },
        step,
      } as never)
    ).rejects.toThrow();
    expect(step.run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts -t "schema gate" --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the skeleton**

```typescript
// apps/api/src/inngest/functions/filing-timed-out-observe.ts
import { filingTimedOutEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const filingTimedOutObserve = inngest.createFunction(
  {
    id: 'filing-timed-out-observe',
    name: 'Filing timed-out observer + active reconciliation',
  },
  { event: 'app/session.filing_timed_out' },
  async ({ event, step }) => {
    const parsed = filingTimedOutEventSchema.parse(event.data);
    const { sessionId, profileId } = parsed;
    logger.info('[filing-timed-out-observe] payload accepted', {
      sessionId,
      profileId,
    });
    return { resolution: 'noop' as const };
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts -t "schema gate" --no-coverage`
Expected: PASS.

### Task 5.2: Diagnostic snapshot step

**Files:**
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.ts`
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('captures a diagnostic snapshot on every run', async () => {
  // Seed: insert a session row + 3 session_events
  // Mock step.run to capture which step IDs were invoked and the snapshot return value.
  // Mock step.waitForEvent to return null (terminal path).
  // Assert: a step named 'capture-diagnostic-snapshot' ran and its
  //         result included sessionRow, eventCount: 3, lastEventAt, msSinceTimeoutDispatch
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts -t "diagnostic snapshot" --no-coverage`
Expected: FAIL — no `capture-diagnostic-snapshot` step exists yet.

- [ ] **Step 3: Add the step**

Inside the function body, after the schema parse:

```typescript
import { count, desc, eq } from 'drizzle-orm';
import { learningSessions, sessionEvents } from '@eduagent/database';
import { getStepDatabase } from '../helpers';
// ...

const snapshot = await step.run('capture-diagnostic-snapshot', async () => {
  const db = getStepDatabase();
  const session = await db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
  const [{ count: eventCount } = { count: 0 }] = await db
    .select({ count: count() })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId));
  const lastEvent = await db.query.sessionEvents.findFirst({
    where: eq(sessionEvents.sessionId, sessionId),
    orderBy: desc(sessionEvents.createdAt),
  });
  return {
    sessionRow: session
      ? {
          topicId: session.topicId,
          filedAt: session.filedAt?.toISOString() ?? null,
          filingStatus: session.filingStatus,
          exchangeCount: session.exchangeCount,
          updatedAt: session.updatedAt.toISOString(),
        }
      : null,
    eventCount: Number(eventCount),
    lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
    msSinceTimeoutDispatch: Date.now() - new Date(parsed.timestamp).getTime(),
  };
});
logger.warn('[filing-timed-out-observe] snapshot captured', {
  sessionId,
  profileId,
  ...snapshot,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts -t "diagnostic snapshot" --no-coverage`
Expected: PASS.

### Task 5.3: Late-completion branch

**Files:**
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.ts`
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`

- [ ] **Step 1: Write two failing tests**

```typescript
it('does not dispatch retry when re-read shows filed_at IS NOT NULL', async () => {
  // Seed: session with filed_at = now() (filing finished just past the 60s window)
  // Act: invoke observer
  // Assert: result.resolution === 'late_completion'
  //         step.sendEvent was NOT called with 'app/filing.retry'
  //         step.sendEvent WAS called with 'app/session.filing_resolved'
  //         and the resolved payload has resolution: 'late_completion'
});

it('flips filing_failed → filing_recovered on late completion', async () => {
  // Seed: session with filed_at = now() AND filing_status = 'filing_failed'
  //       (an earlier observer run had marked it failed; now filing finally arrived)
  // Assert: row's filing_status === 'filing_recovered'
  //         result.resolution === 'late_completion'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts -t "late" --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Add the late-completion branch**

Append to the observer body:

```typescript
import { filingResolvedEventSchema } from '@eduagent/schemas';

const recheck = await step.run('re-read-session', async () => {
  const db = getStepDatabase();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
});

if (recheck?.filedAt != null) {
  if (recheck.filingStatus === 'filing_failed') {
    await step.run('mark-recovered', async () => {
      const db = getStepDatabase();
      await db
        .update(learningSessions)
        .set({ filingStatus: 'filing_recovered' })
        .where(eq(learningSessions.id, sessionId));
    });
  }
  const resolvedPayload = filingResolvedEventSchema.parse({
    sessionId,
    profileId,
    resolution: 'late_completion',
    timestamp: new Date().toISOString(),
  });
  await step.sendEvent('emit-resolved', {
    name: 'app/session.filing_resolved',
    data: resolvedPayload,
  });
  return { resolution: 'late_completion' as const };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts -t "late" --no-coverage`
Expected: PASS (both tests).

### Task 5.4: Mark pending + dispatch retry

**Files:**
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.ts`
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`

- [ ] **Step 1: Write two failing tests**

```typescript
it('marks filing_pending and dispatches typed app/filing.retry payload', async () => {
  // Seed: session with filed_at = null, sessionType = 'learning'
  // Act + mock step.waitForEvent → null (so we don't proceed past retry dispatch this test)
  // Assert: row's filing_status === 'filing_pending'
  //         step.sendEvent('dispatch-filing-retry', { name: 'app/filing.retry', ... }) called once
  //         The dispatched data conforms to filingRetryEventSchema
  //         The dispatched data omits sessionTranscript
  //         The dispatched data has sessionMode === 'freeform' (default for non-homework)
});

it('maps sessionType homework → sessionMode homework in retry payload', async () => {
  // Seed: session row with sessionType = 'homework'
  // Assert: dispatched data has sessionMode === 'homework'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — no retry dispatch yet.

- [ ] **Step 3: Add the retry branch**

Append after the late-completion early-return:

```typescript
import { filingRetryEventSchema } from '@eduagent/schemas';

await step.run('mark-pending', async () => {
  const db = getStepDatabase();
  await db
    .update(learningSessions)
    .set({ filingStatus: 'filing_pending' })
    .where(eq(learningSessions.id, sessionId));
});

const sessionMode: 'freeform' | 'homework' =
  recheck?.sessionType === 'homework' ? 'homework' : 'freeform';

const retryPayload = filingRetryEventSchema.parse({
  profileId,
  sessionId,
  sessionMode,
});

await step.sendEvent('dispatch-filing-retry', {
  name: 'app/filing.retry',
  data: retryPayload,
});

const retryResult = await step.waitForEvent('wait-for-retry-completion', {
  event: 'app/filing.completed',
  match: 'data.sessionId',
  timeout: '60s',
});
```

- [ ] **Step 4: Run tests to verify they pass**

Expected: PASS (both).

### Task 5.5: Retry-success and terminal-failure branches

**Files:**
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.ts`
- Modify: `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`
- Modify: `apps/api/src/services/sentry.ts` is already used elsewhere — import `captureException`.

- [ ] **Step 1: Write four failing tests**

```typescript
it('returns retry_succeeded when waitForEvent resolves with a payload', async () => {
  // Mock step.waitForEvent to return { name: 'app/filing.completed', data: {...} }
  // Assert: result.resolution === 'retry_succeeded'
  //         dispatched 'app/session.filing_resolved' with resolution 'retry_succeeded'
});

it('marks filing_failed and captures Sentry exception on second timeout', async () => {
  // Mock step.waitForEvent → null
  // Assert: row's filing_status === 'filing_failed'
  //         captureException was called with an Error including the snapshot in `extra`
  //         result.resolution === 'unrecoverable'
});

it('dispatches push notification on terminal failure', async () => {
  // Mock step.waitForEvent → null
  // Spy on sendPushNotification
  // Assert: sendPushNotification called once with type: 'session_filing_failed'
});

it('emits app/session.filing_resolved with resolution unrecoverable on terminal failure', async () => {
  // Same setup as above
  // Assert: a sendEvent call had name === 'app/session.filing_resolved' and resolution === 'unrecoverable'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL.

- [ ] **Step 3: Add both branches**

Append to the observer body:

```typescript
import { captureException } from '../../services/sentry';
import {
  sendPushNotification,
  formatFilingFailedPush,
} from '../../services/notifications';

if (retryResult != null) {
  const resolvedPayload = filingResolvedEventSchema.parse({
    sessionId,
    profileId,
    resolution: 'retry_succeeded',
    timestamp: new Date().toISOString(),
  });
  await step.sendEvent('emit-resolved', {
    name: 'app/session.filing_resolved',
    data: resolvedPayload,
  });
  return { resolution: 'retry_succeeded' as const };
}

// Terminal failure
await step.run('mark-failed', async () => {
  const db = getStepDatabase();
  await db
    .update(learningSessions)
    .set({ filingStatus: 'filing_failed' })
    .where(eq(learningSessions.id, sessionId));
});

const terminalResolved = filingResolvedEventSchema.parse({
  sessionId,
  profileId,
  resolution: 'unrecoverable',
  timestamp: new Date().toISOString(),
});
await step.sendEvent('emit-resolved', {
  name: 'app/session.filing_resolved',
  data: terminalResolved,
});

await step.run('send-failure-push', async () => {
  const db = getStepDatabase();
  const { title, body } = formatFilingFailedPush();
  await sendPushNotification(db, {
    profileId,
    title,
    body,
    type: 'session_filing_failed',
  });
});

const escalation = new Error(
  `filing-timed-out-observe: retry failed after 120s for session ${sessionId}`
);
captureException(escalation, {
  profileId,
  extra: {
    sessionId,
    snapshot,
    hint: 'See Inngest run history for freeform-filing-retry filtered by sessionId for root cause.',
  },
});

return { resolution: 'unrecoverable' as const, snapshot };
```

- [ ] **Step 4: Run all observer tests**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-timed-out-observe.test.ts --no-coverage`
Expected: all 9 PASS.

### Task 5.6: Register the observer

**Files:**
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Wire up imports, re-exports, and the `functions` array entry for `filingTimedOutObserve`.**

- [ ] **Step 2: Run typecheck + index test**

Run: `pnpm exec nx run api:typecheck && pnpm exec jest apps/api/src/inngest/index.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/inngest/functions/filing-timed-out-observe.ts apps/api/src/inngest/functions/filing-timed-out-observe.test.ts apps/api/src/inngest/index.ts
git commit -m "feat(api): add filing-timed-out-observe with retry + push escalation [FILING-TIMEOUT-OBS]"
```

---

## Phase 6 — Session detail API surface

### Task 6.1: Extend `GET /v1/sessions/:sessionId` response

**Files:**
- Modify: `apps/api/src/services/session.ts` (the function that returns the DTO)
- Modify: `apps/api/src/routes/sessions.ts` (response zod schema, if defined inline)
- Modify: `packages/schemas/src/session.ts` (or wherever the session detail DTO schema lives)
- Test: `apps/api/src/routes/sessions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/routes/sessions.test.ts (append)
it('GET /v1/sessions/:id includes filingStatus, filingRetryCount, filedAt', async () => {
  const sessionId = await seedSessionRow({
    profileId: testProfileId,
    filingStatus: 'filing_failed',
    filingRetryCount: 1,
    filedAt: null,
  });

  const res = await app.request(`/v1/sessions/${sessionId}`, {
    headers: authHeader(testProfileId),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.session.filingStatus).toBe('filing_failed');
  expect(body.session.filingRetryCount).toBe(1);
  expect(body.session.filedAt).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest apps/api/src/routes/sessions.test.ts -t "filingStatus" --no-coverage`
Expected: FAIL — body does not include those fields.

- [ ] **Step 3: Extend the response schema and the service DTO**

In the schemas package (find the existing session-detail Zod schema by grepping for an existing field name like `exchangeCount`), add:

```typescript
filingStatus: z.enum(['filing_pending', 'filing_failed', 'filing_recovered']).nullable(),
filingRetryCount: z.number().int().nonnegative(),
filedAt: z.string().datetime().nullable(),
```

In `apps/api/src/services/session.ts`, find the function that maps a `learningSessions` row to the API DTO and add those three fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec jest apps/api/src/routes/sessions.test.ts -t "filingStatus" --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/session.ts apps/api/src/routes/sessions.ts apps/api/src/routes/sessions.test.ts packages/schemas/src/
git commit -m "feat(api): expose filingStatus + filedAt + filingRetryCount on session DTO [FILING-TIMEOUT-OBS]"
```

---

## Phase 7 — `POST /v1/sessions/:sessionId/retry-filing`

### Task 7.1: Write all eight endpoint tests

**Files:**
- Modify: `apps/api/src/routes/sessions.test.ts`

- [ ] **Step 1: Add eight failing tests**

```typescript
// apps/api/src/routes/sessions.test.ts (append)
describe('POST /v1/sessions/:id/retry-filing', () => {
  it('returns 200 and dispatches app/filing.retry on filing_failed state', async () => {
    const sessionId = await seedSessionRow({
      profileId: testProfileId,
      sessionType: 'learning',
      filingStatus: 'filing_failed',
      filingRetryCount: 0,
    });
    const sentEvents = captureInngestEvents();

    const res = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    expect(res.status).toBe(200);
    expect(sentEvents.byName('app/filing.retry')).toHaveLength(1);

    const row = await db.query.learningSessions.findFirst({ where: eq(learningSessions.id, sessionId) });
    expect(row?.filingStatus).toBe('filing_pending');
    expect(row?.filingRetryCount).toBe(1);
  });

  it.each(['filing_pending', 'filing_recovered', null] as const)(
    'rejects 409 when filing_status is %s',
    async (status) => {
      const sessionId = await seedSessionRow({ profileId: testProfileId, filingStatus: status });
      const res = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
        method: 'POST',
        headers: authHeader(testProfileId),
      });
      expect(res.status).toBe(409);
    }
  );

  it('rejects 429 when filing_retry_count >= 3', async () => {
    const sessionId = await seedSessionRow({
      profileId: testProfileId,
      filingStatus: 'filing_failed',
      filingRetryCount: 3,
    });
    const res = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    expect(res.status).toBe(429);
  });

  it('rejects 403 when sessionId belongs to a different profile (IDOR break test)', async () => {
    const otherProfileId = await seedProfile();
    const sessionId = await seedSessionRow({
      profileId: otherProfileId,
      filingStatus: 'filing_failed',
    });
    const res = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    // CR-124-SCOPE pattern: scoped repo returns no row → handler emits 404
    // (404 vs 403 is acceptable here because we are not leaking existence;
    //  if the route already standardises on 403, assert 403 instead.)
    expect([403, 404]).toContain(res.status);
  });

  it('increments filing_retry_count atomically (concurrent taps)', async () => {
    const sessionId = await seedSessionRow({
      profileId: testProfileId,
      filingStatus: 'filing_failed',
      filingRetryCount: 0,
    });
    const [r1, r2] = await Promise.all([
      app.request(`/v1/sessions/${sessionId}/retry-filing`, { method: 'POST', headers: authHeader(testProfileId) }),
      app.request(`/v1/sessions/${sessionId}/retry-filing`, { method: 'POST', headers: authHeader(testProfileId) }),
    ]);
    // Exactly one should win (200); the other should 409 (filing is now pending).
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const row = await db.query.learningSessions.findFirst({ where: eq(learningSessions.id, sessionId) });
    expect(row?.filingRetryCount).toBe(1);
  });

  it('passes through metering middleware', async () => {
    const sessionId = await seedSessionRow({
      profileId: testProfileId,
      filingStatus: 'filing_failed',
      filingRetryCount: 0,
    });
    const quotaBefore = await getQuotaUsage(testProfileId);

    const res = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    expect(res.status).toBe(200);

    const quotaAfter = await getQuotaUsage(testProfileId);
    expect(quotaAfter.used).toBe(quotaBefore.used + 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — endpoint not registered.

### Task 7.2: Implement the endpoint

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`

- [ ] **Step 1: Add the route handler**

```typescript
import { ConflictError, RateLimitedError, filingRetryEventSchema } from '@eduagent/schemas';
import { metering } from '../middleware/metering'; // confirm exact import path

// Inside the sessionRoutes builder chain:
.post(
  '/sessions/:sessionId/retry-filing',
  metering(),
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const sessionId = c.req.param('sessionId');
    const db = c.get('db');
    const repo = createScopedRepository(db, profileId);

    // 1. Confirm the session belongs to this profile (scoped repo handles IDOR).
    const session = await repo.learningSessions.findById(sessionId);
    if (!session) return notFound(c, 'Session');

    // 2. Atomic guard + increment in one UPDATE. The WHERE clause enforces:
    //    - filing_status === 'filing_failed' (otherwise 409)
    //    - filing_retry_count < 3 (otherwise 429)
    //    - profileId matches (defense in depth — repo also enforced)
    const [updated] = await db
      .update(learningSessions)
      .set({
        filingStatus: 'filing_pending',
        filingRetryCount: sql`${learningSessions.filingRetryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
          eq(learningSessions.filingStatus, 'filing_failed'),
          lt(learningSessions.filingRetryCount, 3)
        )
      )
      .returning();

    if (!updated) {
      // Re-read to disambiguate 409 vs 429 for the client.
      const fresh = await repo.learningSessions.findById(sessionId);
      if (!fresh) return notFound(c, 'Session');
      if (fresh.filingRetryCount >= 3) {
        throw new RateLimitedError(
          'Retry limit reached for this session.',
          ERROR_CODES.RATE_LIMITED
        );
      }
      throw new ConflictError(
        `Session is not in a retriable state (status: ${fresh.filingStatus ?? 'null'})`
      );
    }

    // 3. Dispatch retry event.
    const sessionMode: 'freeform' | 'homework' =
      session.sessionType === 'homework' ? 'homework' : 'freeform';
    const retryPayload = filingRetryEventSchema.parse({
      profileId,
      sessionId,
      sessionMode,
    });
    await inngest.send({ name: 'app/filing.retry', data: retryPayload });

    return c.json({ session: toSessionDto(updated) });
  }
)
```

(Adjust `createScopedRepository` import + helper names to match repo conventions. If the existing route file already imports a scoped-repo helper, mirror that pattern.)

- [ ] **Step 2: Run all endpoint tests**

Run: `pnpm exec jest apps/api/src/routes/sessions.test.ts -t "retry-filing" --no-coverage`
Expected: all 8 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/sessions.test.ts
git commit -m "feat(api): add POST /v1/sessions/:id/retry-filing with idempotent guard [FILING-TIMEOUT-OBS]"
```

---

## Phase 8 — Mobile retry mutation hook

### Task 8.1: `useRetryFiling` mutation

**Files:**
- Create: `apps/mobile/src/hooks/use-retry-filing.ts`
- Create: `apps/mobile/src/hooks/use-retry-filing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/hooks/use-retry-filing.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { useRetryFiling } from './use-retry-filing';
import { withQueryClient } from '../testing/with-query-client';
import { server, rest } from '../testing/msw';

describe('useRetryFiling', () => {
  it('sends POST and invalidates the session query on success', async () => {
    server.use(
      rest.post('*/v1/sessions/:id/retry-filing', (_req, res, ctx) =>
        res(ctx.status(200), ctx.json({ session: { id: 'sid', filingStatus: 'filing_pending', filingRetryCount: 1 } }))
      )
    );
    const { result } = renderHook(() => useRetryFiling(), { wrapper: withQueryClient });
    await result.current.mutateAsync({ sessionId: 'sid' });
    expect(result.current.data?.session.filingStatus).toBe('filing_pending');
  });

  it('throws ConflictError on 409', async () => {
    server.use(
      rest.post('*/v1/sessions/:id/retry-filing', (_req, res, ctx) =>
        res(ctx.status(409), ctx.json({ error: { code: 'CONFLICT', message: 'pending' } }))
      )
    );
    const { result } = renderHook(() => useRetryFiling(), { wrapper: withQueryClient });
    await expect(result.current.mutateAsync({ sessionId: 'sid' })).rejects.toThrow(/pending/);
  });

  it('throws RateLimitedError on 429', async () => {
    server.use(
      rest.post('*/v1/sessions/:id/retry-filing', (_req, res, ctx) =>
        res(ctx.status(429), ctx.json({ error: { code: 'RATE_LIMITED', message: 'too many' } }))
      )
    );
    const { result } = renderHook(() => useRetryFiling(), { wrapper: withQueryClient });
    await expect(result.current.mutateAsync({ sessionId: 'sid' })).rejects.toThrow(/too many/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-retry-filing.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```typescript
// apps/mobile/src/hooks/use-retry-filing.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export function useRetryFiling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      return apiClient.post(`/v1/sessions/${sessionId}/retry-filing`).json<{
        session: {
          id: string;
          filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null;
          filingRetryCount: number;
          filedAt: string | null;
        };
      }>();
    },
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}
```

(Adjust `apiClient` usage to match the existing client API in the repo — it likely provides typed `post()` already, with errors classified into the typed error hierarchy by middleware.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-retry-filing.test.ts --no-coverage`
Expected: PASS.

### Task 8.2: `useSession` polls on non-terminal filing state

**Files:**
- Modify: `apps/mobile/src/hooks/use-sessions.ts`
- Modify: `apps/mobile/src/hooks/use-sessions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/hooks/use-sessions.test.ts (append)
it('useSession refetchInterval returns 15000 for null and filing_pending', () => {
  const opts = useSessionQueryOptions('sid'); // export the options builder if not already
  expect(opts.refetchInterval({ session: { filingStatus: null } } as never)).toBe(15_000);
  expect(opts.refetchInterval({ session: { filingStatus: 'filing_pending' } } as never)).toBe(15_000);
  expect(opts.refetchInterval({ session: { filingStatus: 'filing_failed' } } as never)).toBe(false);
  expect(opts.refetchInterval({ session: { filingStatus: 'filing_recovered' } } as never)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-sessions.test.ts -t "refetchInterval" --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Add `refetchInterval` to the existing `useSession` query options**

Find the `useSession` declaration in `apps/mobile/src/hooks/use-sessions.ts` and add:

```typescript
refetchInterval: (data) => {
  const status = data?.session.filingStatus ?? null;
  if (status === null || status === 'filing_pending') return 15_000;
  return false;
},
```

If the hook does not currently export an options builder, refactor minimally so the test can call it without mounting React.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-sessions.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-retry-filing.ts apps/mobile/src/hooks/use-retry-filing.test.ts apps/mobile/src/hooks/use-sessions.ts apps/mobile/src/hooks/use-sessions.test.ts
git commit -m "feat(mobile): useRetryFiling mutation + useSession polls on pending [FILING-TIMEOUT-OBS]"
```

---

## Phase 9 — Mobile `<FilingFailedBanner />`

### Task 9.1: Component tests

**Files:**
- Create: `apps/mobile/src/components/session/FilingFailedBanner.test.tsx`

- [ ] **Step 1: Write seven failing tests (one per row of spec §8.5)**

```typescript
// apps/mobile/src/components/session/FilingFailedBanner.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FilingFailedBanner } from './FilingFailedBanner';
import { withQueryClient } from '../../testing/with-query-client';
import { ConflictError, RateLimitedError } from '@eduagent/schemas';

const session = (overrides: Partial<{
  filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null;
  filingRetryCount: number;
}> = {}) => ({
  id: 'sid',
  filingStatus: null,
  filingRetryCount: 0,
  ...overrides,
});

describe('FilingFailedBanner', () => {
  it('does not render when filingStatus is null', () => {
    const { queryByRole } = render(<FilingFailedBanner session={session({ filingStatus: null })} />, { wrapper: withQueryClient });
    expect(queryByRole('alert')).toBeNull();
  });

  it('renders pending state with spinner when filingStatus is filing_pending', () => {
    const { getByRole, queryByText } = render(<FilingFailedBanner session={session({ filingStatus: 'filing_pending' })} />, { wrapper: withQueryClient });
    expect(getByRole('alert')).toBeTruthy();
    expect(queryByText(/retrying/i)).toBeTruthy();
  });

  it('renders Try again button when filing_failed and retry_count < 3', () => {
    const { getByText } = render(<FilingFailedBanner session={session({ filingStatus: 'filing_failed', filingRetryCount: 1 })} />, { wrapper: withQueryClient });
    expect(getByText(/try again/i)).toBeTruthy();
  });

  it('disables retry button when filing_retry_count >= 3', () => {
    const { getByLabelText } = render(<FilingFailedBanner session={session({ filingStatus: 'filing_failed', filingRetryCount: 3 })} />, { wrapper: withQueryClient });
    const btn = getByLabelText(/retry topic placement/i);
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('shows ConflictError toast on 409', async () => {
    // mock useRetryFiling().mutateAsync to throw ConflictError
    // render, fire press, assert toast
  });

  it('auto-dismisses after 3 seconds when transitioning to filing_recovered', async () => {
    jest.useFakeTimers();
    const { rerender, queryByRole } = render(<FilingFailedBanner session={session({ filingStatus: 'filing_failed' })} />, { wrapper: withQueryClient });
    rerender(<FilingFailedBanner session={session({ filingStatus: 'filing_recovered' })} />);
    expect(queryByRole('alert')).toBeTruthy();
    jest.advanceTimersByTime(3_000);
    await waitFor(() => expect(queryByRole('alert')).toBeNull());
    jest.useRealTimers();
  });

  it('has accessibilityRole alert and announces transitions politely', () => {
    const { getByRole } = render(<FilingFailedBanner session={session({ filingStatus: 'filing_failed' })} />, { wrapper: withQueryClient });
    const banner = getByRole('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/session/FilingFailedBanner.test.tsx --no-coverage`
Expected: FAIL — module not found.

### Task 9.2: Implement the banner

**Files:**
- Create: `apps/mobile/src/components/session/FilingFailedBanner.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// apps/mobile/src/components/session/FilingFailedBanner.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ConflictError, RateLimitedError } from '@eduagent/schemas';
import * as Sentry from '@sentry/react-native';
import { useRetryFiling } from '../../hooks/use-retry-filing';
import { showToast } from '../../lib/toast';

const MAX_RETRIES = 3;
const SUCCESS_DISMISS_MS = 3_000;

interface SessionLike {
  id: string;
  filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null;
  filingRetryCount: number;
}

export function FilingFailedBanner({ session }: { session: SessionLike }) {
  const [hidden, setHidden] = useState(false);
  const retry = useRetryFiling();

  useEffect(() => {
    if (session.filingStatus === 'filing_recovered' && !hidden) {
      const t = setTimeout(() => setHidden(true), SUCCESS_DISMISS_MS);
      return () => clearTimeout(t);
    }
  }, [session.filingStatus, hidden]);

  if (session.filingStatus == null || hidden) return null;

  const onRetry = async () => {
    try {
      await retry.mutateAsync({ sessionId: session.id });
    } catch (err) {
      if (err instanceof ConflictError) {
        showToast('Retry already in progress.');
      } else if (err instanceof RateLimitedError) {
        showToast('Retry limit reached for this session.');
      } else {
        showToast('Could not start retry. Please try again in a moment.');
        Sentry.captureException(err);
      }
    }
  };

  const retryDisabled = session.filingRetryCount >= MAX_RETRIES;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      // styling via existing semantic tokens — placeholder shown:
      style={{ padding: 12, borderRadius: 8 }}
    >
      {session.filingStatus === 'filing_pending' && (
        <View>
          <ActivityIndicator />
          <Text>Retrying topic placement…</Text>
        </View>
      )}
      {session.filingStatus === 'filing_failed' && (
        <View>
          <Text>Topic placement unavailable — your overall progress isn't affected.</Text>
          <Pressable
            onPress={onRetry}
            disabled={retryDisabled || retry.isPending}
            accessibilityLabel="Retry topic placement for this session"
            accessibilityState={{ disabled: retryDisabled || retry.isPending }}
            accessibilityHint={retryDisabled ? 'Retry limit reached. Open help for support.' : undefined}
          >
            <Text>{retry.isPending ? 'Retrying…' : 'Try again'}</Text>
          </Pressable>
        </View>
      )}
      {session.filingStatus === 'filing_recovered' && (
        <Text>Topic placement recovered.</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/session/FilingFailedBanner.test.tsx --no-coverage`
Expected: all 7 PASS.

### Task 9.3: Mount the banner in the session-summary screen

**Files:**
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx`

- [ ] **Step 1: Mount above the existing summary content**

```tsx
import { FilingFailedBanner } from '../../components/session/FilingFailedBanner';
// ...
{session && <FilingFailedBanner session={session} />}
```

- [ ] **Step 2: Manual verification**

Run the dev server (`pnpm exec nx run mobile:start` or the project's launcher) and open the session-summary screen with a seeded session in `filing_failed` state. Confirm:
- Banner appears with "Try again" button.
- Tapping "Try again" sets state to `filing_pending`, banner shows spinner.
- After retry succeeds (use the seeded retry mock or real flow), banner shows recovered state and self-dismisses after 3 s.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/session/FilingFailedBanner.tsx apps/mobile/src/components/session/FilingFailedBanner.test.tsx apps/mobile/src/app/session-summary/[sessionId].tsx
git commit -m "feat(mobile): add FilingFailedBanner with retry CTA + a11y compliance [FILING-TIMEOUT-OBS]"
```

---

## Phase 10 — One-shot backfill

### Task 10.1: `filing-stranded-backfill` tests

**Files:**
- Create: `apps/api/src/inngest/functions/filing-stranded-backfill.test.ts`

- [ ] **Step 1: Write three failing tests**

```typescript
// apps/api/src/inngest/functions/filing-stranded-backfill.test.ts
import { filingStrandedBackfill } from './filing-stranded-backfill';

describe('filing-stranded-backfill', () => {
  it('emits one synthetic timeout event per stranded session within 14 days', async () => {
    // Seed: 3 stranded sessions (topic_id NULL, filed_at NULL, summary_status 'final', sessionType in (homework, learning))
    //       1 stranded but >14 days old
    //       1 healthy (topic_id set)
    // Act + capture sendEvent calls
    // Assert: exactly 3 events dispatched
    //         Each conforms to filingTimedOutEventSchema
  });

  it('only emits for freeform/homework sessionType', async () => {
    // Seed: 1 stranded with sessionType 'interleaved' — not in scope
    // Assert: no event dispatched for it
  });

  it('only emits for sessions with summary_status = final', async () => {
    // Seed: 1 stranded with summary_status 'pending'
    // Assert: not dispatched
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — module not found.

### Task 10.2: Implement the backfill

**Files:**
- Create: `apps/api/src/inngest/functions/filing-stranded-backfill.ts`

```typescript
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { filingTimedOutEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

export const filingStrandedBackfill = inngest.createFunction(
  {
    id: 'filing-stranded-backfill',
    name: 'One-shot backfill of stranded filing sessions',
  },
  { event: 'app/maintenance.filing_stranded_backfill' },
  async ({ step }) => {
    const stranded = await step.run('find-stranded', async () => {
      const db = getStepDatabase();
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      return db.query.learningSessions.findMany({
        where: and(
          isNull(learningSessions.topicId),
          isNull(learningSessions.filedAt),
          inArray(learningSessions.sessionType, ['learning', 'homework']),
          gte(learningSessions.createdAt, cutoff)
        ),
        columns: { id: true, profileId: true, sessionType: true },
      });
    });

    for (const session of stranded) {
      const payload = filingTimedOutEventSchema.parse({
        sessionId: session.id,
        profileId: session.profileId,
        sessionType: session.sessionType,
        timeoutMs: 60_000,
        timestamp: new Date().toISOString(),
      });
      await step.sendEvent(`synthetic-timeout-${session.id}`, {
        name: 'app/session.filing_timed_out',
        data: payload,
      });
    }

    return { dispatched: stranded.length };
  }
);
```

> **Note on summary_status:** the spec text mentions `summary_status === 'final'`, but the actual enum is `summaryStatusEnum: ['pending','submitted','accepted','skipped','auto_closed']` — there is no `'final'`. The intent ("session is closed") corresponds to `'submitted'`, `'accepted'`, `'skipped'`, or `'auto_closed'`. The query above intentionally omits the `summary_status` filter and lets the observer's idempotent re-read decide; if the implementer wants stricter scoping, replace with `inArray(learningSessions.status, ['completed', 'auto_closed'])` against the *session* status column instead. Update the test in 10.1 accordingly to match whichever choice you make.

- [ ] **Step 1: Run tests to verify they pass**

Run: `pnpm exec jest apps/api/src/inngest/functions/filing-stranded-backfill.test.ts --no-coverage`
Expected: PASS.

### Task 10.3: Register backfill

**Files:**
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Register `filingStrandedBackfill`** in the import + re-export + `functions` array.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/inngest/functions/filing-stranded-backfill.ts apps/api/src/inngest/functions/filing-stranded-backfill.test.ts apps/api/src/inngest/index.ts
git commit -m "feat(api): one-shot filing-stranded-backfill function [FILING-TIMEOUT-OBS]"
```

---

## Phase 11 — Integration test

### Task 11.1: Real-Postgres end-to-end test

**Files:**
- Create: `tests/integration/filing-timed-out-observer.integration.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// tests/integration/filing-timed-out-observer.integration.test.ts
// Mirrors the precedent in tests/integration/session-completed-chain.integration.test.ts.
// Real Postgres, no internal mocks. Mocked Inngest `step` only.

describe('filing-timed-out-observer (integration)', () => {
  it('terminal failure path leaves session in filing_failed and the companion recovers it on completion', async () => {
    // 1. Seed profile + subject + learning_session (topic_id null, filed_at null,
    //    summary_status 'submitted')
    // 2. Invoke filingTimedOutObserve.fn with mocked step where:
    //      - capture-diagnostic-snapshot uses real DB
    //      - re-read-session uses real DB
    //      - mark-pending uses real DB
    //      - waitForEvent('app/filing.completed') resolves to null (timeout)
    //      - mark-failed uses real DB
    //      - sendEvent recorded
    //      - send-failure-push uses real DB (sendPushNotification can be a no-op
    //        in this env if no push token exists — that's fine)
    // 3. Assert: row.filing_status === 'filing_failed', row.filed_at === null
    //          row.filing_retry_count === 0
    // 4. Invoke filingCompletedObserve.fn with synthetic event { sessionId, profileId }
    //    using mocked step that runs the real DB update.
    // 5. Assert: row.filing_status === 'filing_recovered', row.filed_at is a Date
    //          A 'app/session.filing_resolved' event with resolution 'recovered'
    //          was dispatched.
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm exec jest tests/integration/filing-timed-out-observer.integration.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/filing-timed-out-observer.integration.test.ts
git commit -m "test(api): integration test for filing observer + companion recovery [FILING-TIMEOUT-OBS]"
```

---

## Phase 12 — Final validation

### Task 12.1: Full-project validation sweep

- [ ] **Step 1: Run full lint + typecheck**

Run, in parallel where possible:
```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
```
Expected: all green.

- [ ] **Step 2: Run targeted Jest sweep against everything this plan touched**

```bash
pnpm exec jest --findRelatedTests \
  packages/schemas/src/errors.ts \
  packages/schemas/src/inngest-events.ts \
  packages/database/src/schema/sessions.ts \
  apps/api/src/services/filing.ts \
  apps/api/src/services/session.ts \
  apps/api/src/services/notifications.ts \
  apps/api/src/inngest/functions/session-completed.ts \
  apps/api/src/inngest/functions/filing-timed-out-observe.ts \
  apps/api/src/inngest/functions/filing-completed-observe.ts \
  apps/api/src/inngest/functions/filing-stranded-backfill.ts \
  apps/api/src/routes/sessions.ts \
  --no-coverage
```
Expected: all green.

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/hooks/use-sessions.ts \
  src/hooks/use-retry-filing.ts \
  src/components/session/FilingFailedBanner.tsx \
  src/app/session-summary/[sessionId].tsx \
  --no-coverage
```
Expected: all green.

- [ ] **Step 3: Run integration tests**

```bash
pnpm exec jest tests/integration --no-coverage
```
Expected: all green (the new test plus the existing chain test, which remains untouched).

- [ ] **Step 4: Manual UI verification**

Per CLAUDE.md "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." Verify the four banner states (null, filing_pending, filing_failed at <3 retries, filing_failed at 3 retries) on the session-summary screen with seeded data.

- [ ] **Step 5: Push**

```bash
git push
```

---

## Failure-Modes coverage check

Mapping each row of spec §6 to the task that delivers it:

| Failure mode | Delivered by |
|---|---|
| Normal close | No change. Existing flow. |
| Late completion | Phase 5 Task 5.3 (late-completion branch + `mark-recovered`). |
| Retry recovers | Phase 5 Task 5.5 (retry-success branch) + Phase 4 Task 4.2 (companion flips state). |
| Filing unrecoverable | Phase 5 Task 5.5 (terminal failure: `mark-failed` + push) + Phase 9 Task 9.2 (banner). |
| User retry succeeds | Phase 7 Task 7.2 (endpoint dispatches retry) + Phase 4 Task 4.2 (companion flips state). |
| User retry fails | Phase 7 Task 7.2 (state stays `filing_pending`; user can retry until budget). |
| Retry budget exhausted | Phase 7 Task 7.2 (429) + Phase 9 Task 9.2 (disabled button + help link). |
| Concurrent retries | Phase 7 Task 7.2 (atomic guard returns 409). |
| Stranded pre-existing session | Phase 10 Tasks 10.1–10.3 (one-shot backfill, 14-day cutoff). |

## Verified-by table (from spec §8.6)

Every fix row from the spec is covered by a numbered test in this plan; the integration test in Phase 11 closes the end-to-end loop. No row in spec §8.6 is left without a corresponding test step in this plan.

## Rollback

The migration in Phase 1 Task 1.1 is non-destructive (all new columns are nullable or default 0). To roll back:

1. Revert the application commits in reverse order — start from Phase 12 and walk back. Inngest functions can be left registered in the codebase but un-deployed if any intermediate state is unsafe.
2. Apply the inverse migration:
   ```sql
   DROP INDEX IF EXISTS "learning_sessions_filing_status_idx";
   ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "filing_retry_count";
   ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "filing_status";
   DROP TYPE IF EXISTS "filing_status";
   ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "filed_at";
   ```
3. No data is lost — the new columns hold purely additive state. Existing `learning_sessions` rows are unaffected.
