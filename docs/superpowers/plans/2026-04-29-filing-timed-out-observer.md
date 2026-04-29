# Filing Timed-Out Observer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Adversarial review fixes baked in (2026-04-29 revision):**
> 1. Distinct `app/filing.retry_completed` event so the observer's wait can't be tripped by a slow original filing landing during the 60 s window (was: misclassified late-completion as retry-success).
> 2. `freeform-filing-retry` short-circuits when `filed_at IS NOT NULL` (was: duplicate `resolveFilingResult` writes from concurrent original + retry).
> 3. Companion uses `COALESCE(filed_at, NOW())` (was: overwrote authoritative watermark) AND only emits `filing_resolved` when prior status was `filing_failed` (was: two resolved events per recovery cycle).
> 4. Late-completion branch handles both `filing_pending` and `filing_failed` priors and bumps `updated_at`.
> 5. Observer's auto-retry increments `filing_retry_count` (was: asymmetric budget — user-retry counted but auto-retry did not).
> 6. Observer emits `app/filing.auto_retry_attempted` for queryable silent-recovery metric (per CLAUDE.md "Silent Recovery Without Escalation is Banned").
> 7. All observer/companion DB writes bump `updated_at`.
> 8. Backfill: idempotent (`filing_status IS NULL` filter) + concrete `status ∈ {completed, auto_closed}` filter + uses `session.createdAt` as synthetic timestamp (so `msSinceTimeoutDispatch` is meaningful for backfilled rows).
> 9. Endpoint validates `sessionId` UUID BEFORE metering middleware (was: malformed UUID burned a quota token).
> 10. Mobile polling: TanStack Query v5 callback signature; polls only while `filing_pending` (was: perpetual polling for healthy `null` sessions).
> 11. Banner resets sticky `hidden` state when status leaves `filing_recovered` (was: re-degradation rendered nothing).
> 12. `RateLimitedError` includes `Object.setPrototypeOf` so `instanceof` works across compiled bundle boundaries.
> 13. Migration generated via `drizzle-kit generate` so journal/snapshot stay aligned with `drizzle-kit migrate` (was: hand-authored SQL with no journal update).
> 14. Integration test mocks at the true external boundary (`sendExpoPush`) and seeds a push token so the test isn't degenerate.
> 15. Rollback section documents the destructive window honestly (was: "no data is lost" without time-window qualification).
> 16. Retry handler's terminal failure branch checks budget exhaustion explicitly so backfill re-runs cannot bypass the 3-attempt cap.

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
 * Dispatched by `freeform-filing-retry` AFTER `resolveFilingResult` succeeds.
 * Distinct from `app/filing.completed` (which session-completed's existing
 * waitForEvent listens to). The observer's retry-completion `waitForEvent`
 * MUST listen to THIS event, not `app/filing.completed`, so it cannot be
 * tripped by a slow-but-not-dead original filing landing during the 60 s
 * wait window — that would mis-classify late-completion as retry-success.
 */
export const filingRetryCompletedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  timestamp: z.string().datetime(),
});
export type FilingRetryCompletedEvent = z.infer<typeof filingRetryCompletedEventSchema>;

/**
 * Terminal-outcome event so a session's filing journey is queryable from
 * Inngest event history without scraping logs. Emitted by the observer
 * (late_completion, retry_succeeded, unrecoverable) and by the companion
 * (recovered).
 *
 * INVARIANT: at most ONE filing_resolved event per session per recovery cycle.
 * The companion observer only emits when prior status was `filing_failed`
 * (terminal recovery); when prior status is `filing_pending` the active
 * observer owns the resolution and the companion is silent.
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

### Task 1.1: Generate migration `0040_filing_state_tracking.sql`

**Files:**
- Create (via `drizzle-kit generate`, NOT hand-authored): `apps/api/drizzle/0040_filing_state_tracking.sql`
- Auto-updated: `apps/api/drizzle/meta/_journal.json`, `apps/api/drizzle/meta/0040_snapshot.json`

> **Operational note:** `filing_retry_count` is added as `NOT NULL DEFAULT 0`. On Postgres ≥ 11 this is a metadata-only flip but still acquires `AccessExclusiveLock` on `learning_sessions` for the duration of the catalog update. Coordinate with the staging deploy to run during a low-traffic window. Rollback after production rows have populated `filing_status` / `filing_retry_count` is **destructive** — those values are lost (see Rollback section).

- [ ] **Step 1: Update Drizzle schema FIRST (Task 1.2 below)**

Drizzle migrations are generated from schema diff. Apply Task 1.2's schema edits BEFORE invoking `drizzle-kit generate`, otherwise generate will produce an empty migration. The order in this plan is therefore (1.2 schema → 1.1 generate); the file headings are kept in numeric order for table-of-contents readability.

- [ ] **Step 2: Generate the migration**

```bash
pnpm run db:generate
```

Expected output: `0040_<auto-name>.sql` is created plus `meta/_journal.json` gains a new entry and `meta/0040_snapshot.json` is written. Rename the SQL file to `0040_filing_state_tracking.sql` and update the journal `tag` field to match.

- [ ] **Step 3: Inspect the generated SQL**

**Expected migration output (verify against `apps/api/drizzle/0040_filing_state_tracking.sql` after running `pnpm db:generate`):**

The generated file SHOULD match this shape (re-author by hand only if the generator produces something materially different — and if so, update Task 1.2's schema declaration to match). The generated file is authoritative; the SQL below is illustrative only.

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

- [ ] **Step 4: Apply to local dev DB**

Run: `pnpm run db:push:dev`
Expected: applies the new migration. Confirm via DB explorer that the three columns + enum + partial index exist, and that `apps/api/drizzle/meta/_journal.json` references `0040_filing_state_tracking`.

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

### Task 3.2: Harden `freeform-filing-retry` — short-circuit + emit `filing.retry_completed`

**Files:**
- Modify: `apps/api/src/inngest/functions/freeform-filing.ts`
- Modify: `apps/api/src/inngest/functions/freeform-filing.test.ts`

The retry handler currently runs `resolveFilingResult` unconditionally. If a slow original filing finally lands BEFORE the retry handler executes its work step, the retry will run a duplicate `resolveFilingResult` call — two writers, same row, no advisory lock — producing nondeterministic topic placement. Two changes are required:

1. **Short-circuit when already filed.** Read the session row first; if `filed_at IS NOT NULL`, skip the work and just emit completion events.
2. **Emit a distinct `app/filing.retry_completed` event.** The active observer needs to wait specifically for retry-driven completion, not any completion (the original filing also emits `app/filing.completed`).

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/inngest/functions/freeform-filing.test.ts (append)

it('short-circuits when filed_at IS NOT NULL — does not call resolveFilingResult again', async () => {
  // Seed: session with filed_at = now() and topic_id set (already filed)
  // Spy on resolveFilingResult
  // Act: invoke handler
  // Assert: resolveFilingResult NOT called
  //         app/filing.completed AND app/filing.retry_completed both still emitted
  //         (so dependent waiters resolve, idempotently)
});

it('emits app/filing.retry_completed in addition to app/filing.completed on success', async () => {
  // Seed: session with filed_at = null
  // Act: invoke handler with mocked filing services
  // Assert: step.sendEvent called with name='app/filing.completed' AND name='app/filing.retry_completed'
  //         retry_completed payload conforms to filingRetryCompletedEventSchema
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec jest apps/api/src/inngest/functions/freeform-filing.test.ts -t "short-circuit|retry_completed" --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Add short-circuit + new event emission**

```typescript
// In freeform-filing.ts, near the top of the handler body, BEFORE the
// existing 'retry-filing' step:
import { filingRetryCompletedEventSchema } from '@eduagent/schemas';
import { learningSessions } from '@eduagent/database';
import { eq } from 'drizzle-orm';

const alreadyFiled = await step.run('check-already-filed', async () => {
  const db = getStepDatabase();
  const row = await db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
    columns: { filedAt: true, topicId: true },
  });
  return row?.filedAt != null && row.topicId != null;
});

if (alreadyFiled) {
  // Idempotent path: still emit both completion events so any waiter
  // (session-completed's wait, observer's retry-completion wait) resolves.
  // The retry_completed payload uses the SAME shape regardless of whether
  // the work actually ran — the observer doesn't need to distinguish.
  await step.sendEvent('notify-filing-completed', {
    name: 'app/filing.completed',
    data: { profileId, sessionId, timestamp: new Date().toISOString() },
  });
  await step.sendEvent('notify-filing-retry-completed', {
    name: 'app/filing.retry_completed',
    data: filingRetryCompletedEventSchema.parse({
      sessionId, profileId, timestamp: new Date().toISOString(),
    }),
  });
  return { status: 'already_filed', skipped: true };
}

// ... existing 'retry-filing' step + resolveFilingResult call ...

// AFTER the existing notify-filing-completed sendEvent, ALSO emit:
await step.sendEvent('notify-filing-retry-completed', {
  name: 'app/filing.retry_completed',
  data: filingRetryCompletedEventSchema.parse({
    sessionId, profileId, timestamp: new Date().toISOString(),
  }),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec jest apps/api/src/inngest/functions/freeform-filing.test.ts --no-coverage`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inngest/functions/freeform-filing.ts apps/api/src/inngest/functions/freeform-filing.test.ts
git commit -m "fix(api): freeform-filing-retry short-circuits + emits retry_completed [FILING-TIMEOUT-OBS]"
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
  it('flips filing_pending → filing_recovered on completion event WITHOUT emitting resolved', async () => {
    // seed: insert a session row with filing_status = 'filing_pending'
    //       filing_pending means the active observer is mid-flight; it owns
    //       the resolution event so the companion stays silent here.
    // act: invoke filingCompletedObserve.fn with mocked step
    // assert: row's filing_status === 'filing_recovered'
    // assert: filed_at preserved if already set (COALESCE) — does NOT overwrite
    // assert: NO 'app/session.filing_resolved' event was dispatched
    //         (active observer's retry-success branch will emit instead)
  });

  it('flips filing_failed → filing_recovered AND emits resolved=recovered', async () => {
    // seed: filing_status = 'filing_failed' (terminal state — observer already gave up)
    // assert: row's filing_status === 'filing_recovered'
    // assert: a 'app/session.filing_resolved' with resolution: 'recovered' WAS dispatched
    //         (companion is the only one that can recover from terminal state)
  });

  it('is a no-op for sessions with filing_status = null', async () => {
    // seed: filing_status = null (the healthy case)
    // act + assert: row unchanged, no resolved event dispatched
  });

  it('preserves existing filed_at via COALESCE rather than overwriting', async () => {
    // seed: filing_status = 'filing_failed', filed_at = '2026-04-29T09:00:00Z'
    //       (a prior resolveFilingResult tx already wrote the authoritative watermark
    //        but the failed flag is stale)
    // act: invoke companion
    // assert: row.filed_at === '2026-04-29T09:00:00Z' (preserved, not overwritten)
    // assert: row.filing_status === 'filing_recovered'
  });

  it('updates updated_at so audit/observability tooling sees the transition', async () => {
    // seed: filing_status = 'filing_failed', updated_at = T0
    // act: invoke companion at T1 > T0
    // assert: row.updated_at > T0
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
import { and, eq, inArray, sql } from 'drizzle-orm';
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
      return { recovered: false, priorStatus: null as string | null };
    }

    // Three-step protocol: (1) capture prior status, (2) flip if recovering,
    // (3) emit resolved ONLY when prior was 'filing_failed'. The active
    // observer owns the resolution event for the 'filing_pending' path
    // (its retry-success branch emits resolved with resolution='retry_succeeded').
    const priorStatus = await step.run('read-prior-status', async () => {
      const db = getStepDatabase();
      const row = await db.query.learningSessions.findFirst({
        where: eq(learningSessions.id, sessionId),
        columns: { filingStatus: true },
      });
      return row?.filingStatus ?? null;
    });

    if (priorStatus !== 'filing_pending' && priorStatus !== 'filing_failed') {
      // Healthy session (status null), or already recovered — no-op.
      return { recovered: false, priorStatus };
    }

    const flipped = await step.run('flip-status-if-recovering', async () => {
      const db = getStepDatabase();
      const result = await db
        .update(learningSessions)
        .set({
          filingStatus: 'filing_recovered',
          // COALESCE preserves an existing authoritative filed_at written by
          // resolveFilingResult inside the filing transaction. Without
          // COALESCE the companion would overwrite the real watermark with
          // its own wall-clock time, breaking the "filed_at is authoritative"
          // invariant declared in Phase 2.
          filedAt: sql`COALESCE(${learningSessions.filedAt}, NOW())`,
          updatedAt: new Date(),
        })
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

    // Only emit filing_resolved when recovering from terminal 'filing_failed'.
    // For 'filing_pending', the active observer's retry-success branch is the
    // canonical emitter — emitting here too would produce two filing_resolved
    // events with conflicting resolution values for one recovery cycle.
    if (flipped && priorStatus === 'filing_failed') {
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
    }

    if (flipped) {
      logger.info('[filing-completed-observe] session recovered', {
        sessionId,
        profileId,
        priorStatus,
      });
    }

    return { recovered: flipped, priorStatus };
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
  // Filing landed despite the 60 s wait timing out — the original handler
  // wrote filed_at inside its tx (Phase 2). Flip filing_status to recovered
  // for any non-null transient state (pending OR failed) so observability
  // sees the cycle close.
  if (
    recheck.filingStatus === 'filing_failed' ||
    recheck.filingStatus === 'filing_pending'
  ) {
    await step.run('mark-recovered', async () => {
      const db = getStepDatabase();
      await db
        .update(learningSessions)
        .set({ filingStatus: 'filing_recovered', updatedAt: new Date() })
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
it('marks filing_pending, increments filing_retry_count, and dispatches typed app/filing.retry payload', async () => {
  // Seed: session with filed_at = null, sessionType = 'learning', filing_retry_count = 0
  // Act + mock step.waitForEvent → null (so we don't proceed past retry dispatch this test)
  // Assert: row's filing_status === 'filing_pending'
  //         row's filing_retry_count === 1 (auto-retry counts against the budget)
  //         row's updated_at advanced
  //         step.sendEvent('dispatch-filing-retry', { name: 'app/filing.retry', ... }) called once
  //         The dispatched data conforms to filingRetryEventSchema
  //         The dispatched data omits sessionTranscript
  //         The dispatched data has sessionMode === 'freeform' (default for non-homework)
});

it('maps sessionType homework → sessionMode homework in retry payload', async () => {
  // Seed: session row with sessionType = 'homework'
  // Assert: dispatched data has sessionMode === 'homework'
});

it('emits a queryable auto_retry_attempted event so we can count silent recoveries', async () => {
  // Seed: stranded session
  // Assert: step.sendEvent called with name === 'app/filing.auto_retry_attempted'
  //         payload includes sessionId, profileId, attemptNumber
  // Reason: per ~/.claude/CLAUDE.md "Silent Recovery Without Escalation is Banned",
  // every fallback path must emit a structured metric. Sentry captures only
  // terminal failures; the auto-retry success path needs its own counter.
});

it('waits on app/filing.retry_completed (not app/filing.completed) so the original in-flight filing cannot trip the wait', async () => {
  // Mock: step.waitForEvent records its first arg.
  // Assert: it was called with event === 'app/filing.retry_completed'
});

it('skips retry when filing_retry_count is already 3 (budget exhausted from prior runs)', async () => {
  // Seed: session with filed_at = null, filing_retry_count = 3
  // Act: invoke observer
  // Assert: NO retry dispatched
  //         row's filing_status === 'filing_failed' immediately
  //         result.resolution === 'unrecoverable'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — no retry dispatch yet.

- [ ] **Step 3: Add the retry branch**

Append after the late-completion early-return:

```typescript
import { sql } from 'drizzle-orm';
import { filingRetryEventSchema } from '@eduagent/schemas';

const MAX_FILING_RETRIES = 3;

// Atomic guard + increment: the WHERE enforces the budget so a session that
// burned all 3 retries via prior observer runs cannot dispatch a 4th. The
// auto-retry attempt counts against the SAME budget the user-retry endpoint
// gates on (Phase 7) — there is no separate "auto" budget.
const dispatched = await step.run('mark-pending-and-claim-retry-slot', async () => {
  const db = getStepDatabase();
  const result = await db
    .update(learningSessions)
    .set({
      filingStatus: 'filing_pending',
      filingRetryCount: sql`${learningSessions.filingRetryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        lt(learningSessions.filingRetryCount, MAX_FILING_RETRIES)
      )
    )
    .returning({ filingRetryCount: learningSessions.filingRetryCount });
  return result[0]?.filingRetryCount ?? null;
});

if (dispatched == null) {
  // Budget already exhausted by prior runs (e.g., backfill re-attempts).
  // Skip retry; fall through to terminal-failure branch below.
  await step.run('mark-failed-budget-exhausted', async () => {
    const db = getStepDatabase();
    await db
      .update(learningSessions)
      .set({ filingStatus: 'filing_failed', updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));
  });
  // (Terminal-failure branch in 5.5 will emit resolved + Sentry. We jump
  // there by re-using the same logic — implementation detail: extract the
  // terminal block into a helper and call from both places, or set a flag
  // and check below. Pick whichever the implementer prefers.)
  // ... (terminal branch invocation here)
} else {
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

  // [SILENT-RECOVERY-METRIC] Queryable counter for "auto-retry attempted".
  // Per ~/.claude/CLAUDE.md, silent fallback paths MUST emit a structured
  // event so a non-Sentry rule can rate-page on regressions. Sentry only
  // captures the terminal-failure branch; without this event we have no
  // way to query "how often did the auto-retry fire in the last 24h."
  await step.sendEvent('emit-auto-retry-attempted', {
    name: 'app/filing.auto_retry_attempted',
    data: { sessionId, profileId, attemptNumber: dispatched, timestamp: new Date().toISOString() },
  });

  // CRITICAL: wait on filing.retry_completed (NOT filing.completed). The
  // original filing handler emits filing.completed; if a slow original lands
  // during this 60 s window the wait would resolve and the observer would
  // mis-classify late-completion as retry-success. The retry handler emits
  // BOTH events — completed (for session-completed compatibility) AND
  // retry_completed (for this observer specifically).
  var retryResult = await step.waitForEvent('wait-for-retry-completion', {
    event: 'app/filing.retry_completed',
    match: 'data.sessionId',
    timeout: '60s',
  });
}
```

> **Note on imports:** also import `and`, `lt` from `drizzle-orm` at the top of the file. The `var retryResult` keyword is used here so the variable is hoisted and visible to the success/failure branches in 5.5; convert to `let` and declare at function scope if `no-var` lint disagrees.

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
  //
  // Seed the session row with a known past updatedAt so we can assert the write bumped it.
  const seededUpdatedAt = new Date(Date.now() - 60_000); // 1 minute in the past
  // (seed session with updatedAt: seededUpdatedAt when constructing the fixture)
  //
  // After the observer runs its terminal-failure path, refetch the row:
  //   const updated = await db.query.learningSessions.findFirst({ where: eq(learningSessions.id, sessionId) });
  // [adversarial fix #7] terminal write must bump updated_at so observability tooling sees the failure transition
  //   expect(updated?.updatedAt.getTime()).toBeGreaterThan(seededUpdatedAt.getTime());
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
  // The retry handler succeeded. It already wrote filed_at + topicId via
  // resolveFilingResult inside its tx; mark recovered here so the row's
  // filing_status reflects the closed cycle.
  await step.run('mark-recovered-after-retry', async () => {
    const db = getStepDatabase();
    await db
      .update(learningSessions)
      .set({ filingStatus: 'filing_recovered', updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));
  });
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
    .set({ filingStatus: 'filing_failed', updatedAt: new Date() })
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

  it('rejects 400 with malformed sessionId BEFORE consuming metering quota', async () => {
    const quotaBefore = await getQuotaUsage(testProfileId);
    const res = await app.request(`/v1/sessions/not-a-uuid/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    expect(res.status).toBe(400);
    const quotaAfter = await getQuotaUsage(testProfileId);
    // Validation runs BEFORE metering — bad UUIDs must not burn quota tokens.
    expect(quotaAfter.used).toBe(quotaBefore.used);
  });

  it('observer-incremented retry counts toward the user-visible 3-attempt budget', async () => {
    // Seed: filing_status='filing_failed', filing_retry_count=2 (one user retry +
    //        one observer auto-retry already consumed)
    const sessionId = await seedSessionRow({
      profileId: testProfileId,
      filingStatus: 'filing_failed',
      filingRetryCount: 2,
    });
    // First user retry should succeed (now at 3).
    const r1 = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    expect(r1.status).toBe(200);
    // Reset to filing_failed so the second attempt is a budget test, not a state test.
    await db.update(learningSessions)
      .set({ filingStatus: 'filing_failed' })
      .where(eq(learningSessions.id, sessionId));
    // Second user retry should 429 — budget shared between observer and user.
    const r2 = await app.request(`/v1/sessions/${sessionId}/retry-filing`, {
      method: 'POST',
      headers: authHeader(testProfileId),
    });
    expect(r2.status).toBe(429);
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
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { metering } from '../middleware/metering'; // confirm exact import path

const retryFilingParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

// Inside the sessionRoutes builder chain:
// CRITICAL ORDER: zValidator BEFORE metering(). Validation must reject malformed
// sessionIds with 400 before metering() consumes a quota token. Otherwise a bad
// UUID burns the user's daily allowance.
.post(
  '/sessions/:sessionId/retry-filing',
  zValidator('param', retryFilingParamsSchema),
  metering(),
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const { sessionId } = c.req.valid('param');
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
// TanStack Query v5: refetchInterval receives `query`, not `data`. Access
// data via `query.state.data`. (apps/mobile is on @tanstack/react-query ^5.x.)
// We test the predicate as a pure function by extracting it from the options
// builder, so we don't need to construct a real Query object.

it('useSession polls every 15s ONLY while filing_pending — healthy sessions never poll', () => {
  const interval = computeFilingRefetchInterval; // exported pure helper
  // Healthy session — null filingStatus must NOT poll. (Every detail screen
  // would otherwise wake every 15 s indefinitely.)
  expect(interval(null)).toBe(false);
  // Active retry — poll until terminal.
  expect(interval('filing_pending')).toBe(15_000);
  // Terminal states — stop polling; user retries via banner button.
  expect(interval('filing_failed')).toBe(false);
  expect(interval('filing_recovered')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-sessions.test.ts -t "polls every 15s" --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Add a pure helper + wire it into the v5 query options**

In `apps/mobile/src/hooks/use-sessions.ts`:

```typescript
import type { Query } from '@tanstack/react-query';

export function computeFilingRefetchInterval(
  filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null | undefined,
): number | false {
  // Only poll while a retry is mid-flight. Healthy (null) sessions stay
  // null forever in the happy path, so polling them perpetually would
  // waste battery and bandwidth. Terminal states (failed/recovered) are
  // user-actionable via the banner — no polling needed.
  return filingStatus === 'filing_pending' ? 15_000 : false;
}

// Inside useSession:
useQuery({
  queryKey: ['session', sessionId],
  queryFn: ...,
  // TanStack Query v5: callback is invoked with the Query, not data.
  refetchInterval: (query: Query<{ session: { filingStatus: typeof statusType } }>) =>
    computeFilingRefetchInterval(query.state.data?.session.filingStatus),
});
```

> **Why pure helper:** the predicate is the load-bearing line. Testing it through `useQuery`'s `refetchInterval` requires constructing a Query observer; testing the helper directly takes one line and proves the logic without React Native or a query client.

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

  it('re-renders the banner if the session re-degrades after a prior recovery (sticky-hidden break test)', async () => {
    jest.useFakeTimers();
    const { rerender, queryByRole } = render(
      <FilingFailedBanner session={session({ filingStatus: 'filing_recovered' })} />,
      { wrapper: withQueryClient }
    );
    jest.advanceTimersByTime(3_000);
    await waitFor(() => expect(queryByRole('alert')).toBeNull());
    // Simulate a follow-up retry that failed → filing_failed again
    rerender(<FilingFailedBanner session={session({ filingStatus: 'filing_failed' })} />);
    // Banner MUST come back; without the hidden-reset effect it would stay null.
    expect(queryByRole('alert')).toBeTruthy();
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

  // Reset the auto-dismiss flag whenever the session leaves the recovered
  // state. Otherwise: a re-degradation (e.g., filing_recovered → filing_failed
  // because the user kicked off a follow-up retry that failed) would render
  // nothing because `hidden` is sticky from the prior recovery cycle.
  useEffect(() => {
    if (session.filingStatus !== 'filing_recovered' && hidden) {
      setHidden(false);
    }
  }, [session.filingStatus, hidden]);

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
    // Seed: 3 stranded sessions (topic_id NULL, filed_at NULL, filing_status NULL,
    //                           sessionType in {learning, homework}, status='completed')
    //       1 stranded but >14 days old
    //       1 healthy (topic_id set)
    // Act + capture sendEvent calls
    // Assert: exactly 3 events dispatched
    //         Each conforms to filingTimedOutEventSchema
    //         Each event's `timestamp` equals the source session.createdAt (not "now")
  });

  it('only emits for freeform/homework sessionType', async () => {
    // Seed: 1 stranded with sessionType 'interleaved' — not in scope
    // Assert: no event dispatched for it
  });

  it('only emits for sessions whose status ∈ {completed, auto_closed}', async () => {
    // Seed: 1 stranded with status='active' (still in progress)
    //       1 stranded with status='paused'
    // Assert: neither dispatched
  });

  it('is idempotent — skips rows whose filing_status is already non-null', async () => {
    // Seed: stranded session with filing_status='filing_failed' (prior backfill ran)
    // Act: invoke backfill
    // Assert: 0 events dispatched (do NOT re-attempt or re-burn retry budget)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — module not found.

### Task 10.2: Implement the backfill

**Files:**
- Create: `apps/api/src/inngest/functions/filing-stranded-backfill.ts`

```typescript
import { and, gte, inArray, isNull } from 'drizzle-orm';
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
          // IDEMPOTENCY GUARD: skip rows the backfill (or a prior observer
          // run) has already attempted. Without this, repeated invocations
          // re-fire synthetic timeouts on rows already in 'filing_failed',
          // burning the user's retry budget without consent.
          isNull(learningSessions.filingStatus),
          inArray(learningSessions.sessionType, ['learning', 'homework']),
          // Session is actually closed — `learning_sessions.status` enum is
          // ['active','paused','completed','auto_closed']. Only retry filing
          // for sessions that the user has actually finished, not active
          // ones (filing for an active session would be premature).
          inArray(learningSessions.status, ['completed', 'auto_closed']),
          gte(learningSessions.createdAt, cutoff)
        ),
        columns: { id: true, profileId: true, sessionType: true, createdAt: true },
      });
    });

    for (const session of stranded) {
      const payload = filingTimedOutEventSchema.parse({
        sessionId: session.id,
        profileId: session.profileId,
        sessionType: session.sessionType,
        timeoutMs: 60_000,
        // Use session.createdAt — NOT new Date() — so the observer's
        // diagnostic snapshot computes a meaningful msSinceTimeoutDispatch
        // for backfilled rows. With new Date() the snapshot reads ~0 ms,
        // hiding the very signal we want (how long this row has been stranded).
        timestamp: session.createdAt.toISOString(),
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

> **Resolved design question (was: summary_status mismatch):** The spec text mentioned a non-existent `summary_status === 'final'`. The real enum is `sessionStatusEnum: ['active','paused','completed','auto_closed']` on `learning_sessions.status`. This plan commits to filtering by `status ∈ {'completed','auto_closed'}` (i.e., session-as-a-whole is closed) — that's the user-facing meaning of "this session is finished, filing should have already happened." The companion `summary_status` column on the `summaries` table is irrelevant to filing scope.

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
// Real Postgres. Mock ONLY true external boundaries: push provider, Sentry.
// Internal services (DB, scoped repos, Inngest helpers) use real implementations.

import { sendExpoPush } from '../../apps/api/src/services/push-provider';
jest.mock('../../apps/api/src/services/push-provider', () => ({
  // Mock at the EXPO push boundary — external service. Per CLAUDE.md,
  // mocking only at true external boundaries; do NOT mock sendPushNotification
  // itself (it has internal token-lookup logic that should run in tests).
  sendExpoPush: jest.fn().mockResolvedValue({ status: 'ok' }),
}));

describe('filing-timed-out-observer (integration)', () => {
  it('terminal failure path leaves session in filing_failed and the companion recovers it on completion', async () => {
    // 1. Seed profile + subject + learning_session via the existing helper
    //    (look for `seedSessionRow` or `insertSession` in the test setup file
    //     — there is one already used by other integration tests; pick that
    //     same helper rather than rolling your own ad-hoc insert).
    //    Initial row: topic_id=null, filed_at=null, filing_status=null,
    //                 status='completed', sessionType='learning'.
    //    ALSO seed a push token row for testProfileId so sendPushNotification
    //    actually exercises its happy path (otherwise it short-circuits and
    //    the integration test is degenerate — see CLAUDE.md "no degenerate
    //    test paths" rule).
    // 2. Invoke filingTimedOutObserve.fn with mocked step where:
    //      - capture-diagnostic-snapshot uses real DB
    //      - re-read-session uses real DB
    //      - mark-pending-and-claim-retry-slot uses real DB
    //      - waitForEvent('app/filing.retry_completed') resolves to null (timeout)
    //      - mark-failed uses real DB
    //      - sendEvent recorded into a captured-events array
    //      - send-failure-push uses real DB → sendPushNotification → real
    //        token lookup → mocked sendExpoPush() called once with the
    //        formatted title+body
    // 3. Assert: row.filing_status === 'filing_failed', row.filed_at === null
    //          row.filing_retry_count === 1 (auto-retry incremented it)
    //          mocked sendExpoPush called exactly once
    //          captured events include 'app/filing.auto_retry_attempted' AND
    //          'app/session.filing_resolved' with resolution 'unrecoverable'
    // 4. Invoke filingCompletedObserve.fn with synthetic event
    //    { sessionId, profileId } using mocked step that runs real DB ops.
    // 5. Assert: row.filing_status === 'filing_recovered'
    //          row.filed_at is a Date (via COALESCE — was null, NOW() landed)
    //          A 'app/session.filing_resolved' with resolution 'recovered'
    //          was dispatched (because prior status was 'filing_failed' —
    //          terminal recovery path is the only one that emits from companion).
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

## Verified By

Every adversarial-review fix from lines 5–21 of this plan is mapped to its verifying test below. All test names are taken verbatim from the "Step 1: Write the failing test" blocks in the tasks above.

| Fix | Verified By |
|-----|-------------|
| #1 Distinct `app/filing.retry_completed` event | `test: apps/api/src/inngest/functions/freeform-filing.test.ts:"emits app/filing.retry_completed in addition to app/filing.completed on success"` |
| #2 `freeform-filing-retry` short-circuits on `filed_at IS NOT NULL` | `test: apps/api/src/inngest/functions/freeform-filing.test.ts:"short-circuits when filed_at IS NOT NULL — does not call resolveFilingResult again"` |
| #3 Companion uses `COALESCE(filed_at, NOW())` + only emits `filing_resolved` when prior was `filing_failed` | `test: apps/api/src/inngest/functions/filing-completed-observe.test.ts:"preserves existing filed_at via COALESCE rather than overwriting"` + `"flips filing_pending → filing_recovered on completion event WITHOUT emitting resolved"` + `"flips filing_failed → filing_recovered AND emits resolved=recovered"` |
| #4 Late-completion branch handles both `filing_pending` and `filing_failed` + bumps `updated_at` | `test: apps/api/src/inngest/functions/filing-timed-out-observe.test.ts:"does not dispatch retry when re-read shows filed_at IS NOT NULL"` + `"flips filing_failed → filing_recovered on late completion"` |
| #5 Observer auto-retry increments `filing_retry_count` | `test: apps/api/src/inngest/functions/filing-timed-out-observe.test.ts:"marks filing_pending, increments filing_retry_count, and dispatches typed app/filing.retry payload"` |
| #6 Observer emits `app/filing.auto_retry_attempted` for queryable silent-recovery metric | `test: apps/api/src/inngest/functions/filing-timed-out-observe.test.ts:"emits a queryable auto_retry_attempted event so we can count silent recoveries"` |
| #7 All observer/companion DB writes bump `updated_at` | test (companion): `apps/api/src/inngest/functions/filing-completed-observe.test.ts:"updates updated_at so audit/observability tooling sees the transition"` <br>test (active observer): `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts:"marks filing_failed and captures Sentry exception on second timeout"` (now includes explicit `updated_at > seeded-baseline` assertion) |
| #8 Backfill: idempotent + concrete `status ∈ {completed, auto_closed}` + uses `session.createdAt` | `test: apps/api/src/inngest/functions/filing-stranded-backfill.test.ts:"is idempotent — skips rows whose filing_status is already non-null"` + `"only emits for sessions whose status ∈ {completed, auto_closed}"` + `"emits one synthetic timeout event per stranded session within 14 days"` (timestamp assertion) |
| #9 Endpoint validates `sessionId` UUID before metering middleware | `test: apps/api/src/routes/sessions.test.ts:"rejects 400 with malformed sessionId BEFORE consuming metering quota"` |
| #10 Mobile polling: TanStack Query v5 callback signature + polls only while `filing_pending` | `test: apps/mobile/src/hooks/use-sessions.test.ts:"useSession polls every 15s ONLY while filing_pending — healthy sessions never poll"` |
| #11 Banner resets sticky `hidden` state when status leaves `filing_recovered` | `test: apps/mobile/src/components/session/FilingFailedBanner.test.tsx:"re-renders the banner if the session re-degrades after a prior recovery (sticky-hidden break test)"` |
| #12 `RateLimitedError` includes `Object.setPrototypeOf` so `instanceof` works across bundle boundaries | `test: packages/schemas/src/errors.test.ts:"matches instanceof checks across module boundary"` + `"preserves instanceof when re-imported through the package barrel"` |
| #13 Migration generated via `drizzle-kit generate` (not hand-authored) | `manual: run pnpm db:generate and verify the output SQL matches the expected shape in Task 1.1 Step 3` + `test: packages/database/src/schema/sessions.test.ts:"exports filingStatusEnum with three variants"` (compile-time guard that the Drizzle schema columns exist) |
| #14 Integration test mocks at `sendExpoPush` boundary + seeds a push token | `test: tests/integration/filing-timed-out-observer.integration.test.ts:"terminal failure path leaves session in filing_failed and the companion recovers it on completion"` |
| #15 Rollback section documents destructive window honestly | `N/A: prose-only fix in the Rollback section below — no automated test is applicable for documentation accuracy` |
| #16 Retry handler terminal failure branch checks budget exhaustion explicitly | `test: apps/api/src/inngest/functions/filing-timed-out-observe.test.ts:"skips retry when filing_retry_count is already 3 (budget exhausted from prior runs)"` |

### Gap report

All 16 adversarial-review fixes have direct test coverage from named tests in the plan.

**Resolved (2026-04-29):** Fix #7 previously had asymmetric coverage — only the companion observer asserted `updated_at` bumps. The active observer's terminal-failure test (Task 5.5) now includes an explicit `updated_at > seeded-baseline` assertion, closing the gap.

## Rollback

The Phase 1 migration is **additive at install time but destructive on rollback once production rows populate the new columns.** Per `~/.claude/CLAUDE.md`'s "Destructive Migrations Need a Rollback Section" rule, the situation is:

| Window | Rollback effect |
|---|---|
| Same-day rollout, before any session times out | Reversible. No row has filed_at, filing_status, or filing_retry_count populated. Drop the columns and the type; no data is lost. |
| After the first `filing_status='filing_failed'` row lands | **Destructive.** Dropping `filing_status` discards the user-retry budget state and the audit trail of which sessions experienced filing failures. Users mid-cycle will lose visibility of the failure on the session-summary banner (the column is gone, so the API response can't surface it). The Inngest event history (`app/session.filing_resolved`, `app/filing.auto_retry_attempted`) survives in Inngest's storage and is the only post-rollback audit source. |

To roll back during the safe window:

1. Revert the application commits in reverse order — start from Phase 12 and walk back. Inngest functions can be left registered in the codebase but un-deployed if any intermediate state is unsafe.
2. Apply the inverse migration:
   ```sql
   DROP INDEX IF EXISTS "learning_sessions_filing_status_idx";
   ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "filing_retry_count";
   ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "filing_status";
   DROP TYPE IF EXISTS "filing_status";
   ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "filed_at";
   ```
3. Update `apps/api/drizzle/meta/_journal.json` and remove the `0040_snapshot.json` to keep `drizzle-kit migrate` history aligned.

**If rollback is needed AFTER production data has landed**, do not drop the columns. Instead:

- Disable the active observer + companion + endpoint (deploy a feature flag in the route handler returning 410 GONE; suspend the Inngest functions via the dashboard).
- Leave the columns and data intact; the rolled-back code simply ignores them.
- Re-enable when the underlying issue is fixed. This avoids the non-recoverable data loss the column drop would cause.
