# Filing Timed-Out Observer Design

**Date:** 2026-04-29
**Status:** Design spec — pending implementation plan
**Finding ID:** `[FILING-TIMEOUT-OBS]`
**Companion to:** [`docs/architecture.md`](../../architecture.md) → "Inngest events" section

## 1. Purpose

The event `app/session.filing_timed_out` is dispatched by `session-completed` (`apps/api/src/inngest/functions/session-completed.ts:175`) when filing fails to publish `app/filing.completed` within the 60-second `waitForEvent` window for freeform/homework sessions. **No Inngest function currently subscribes to this event.** Sessions silently continue with stale or null topic placement; downstream steps (retention, recall, post-session-suggestions) run without topic context; users see a degraded session summary with no explanation or recovery path.

This spec defines:
1. A new Inngest function `filing-timed-out-observe` that captures diagnostics, attempts at most one automatic retry, and marks the session in a queryable terminal-failure state if recovery fails.
2. A companion observer `filing-completed-observe` that closes the audit-trail loop when filing eventually succeeds (auto-retry or user-initiated).
3. Schema additions to `learning_sessions` to make filing state queryable from non-Sentry tooling and to support a UI recovery affordance.
4. A user-initiated retry endpoint and a non-blocking session-summary banner that follow the project's UX-resilience rules.
5. A one-shot backfill for the existing cohort of stranded sessions.

This spec satisfies the global rules:
- **"Silent recovery without escalation is banned"** (`~/.claude/CLAUDE.md`) — observability via structured logs, Sentry, *and* a queryable `learning_sessions.filing_status` column plus terminal `app/session.filing_resolved` events.
- **"Every screen state must have an action"** (`~/.claude/CLAUDE.md`) — terminal-failure state surfaces a banner with a retry CTA, replacing the existing dead-end.
- **Specs must include a Failure Modes table** — see §6.

## 2. Scope and trade-offs locked in during design

These are decisions reached during design dialogue and recorded here to anchor the implementation plan.

| Decision | Choice | Rationale |
|---|---|---|
| Observer role | Active reconciliation (B1) | Pure-observer pattern leaves the user with a degraded session and no recovery; reconciliation closes the user-visible gap. |
| Reconciliation depth | Backfill only, no pipeline replay | Re-running the 9-step session-completed pipeline risks duplicate notifications and double-counting. Retention/recall stay un-updated for the timed-out session; the next session organically corrects them. |
| Diagnostic depth | D1: local DB snapshot only | Cheap, no new dependencies. Inngest run-history forensics (D2) is a follow-up if D1 telemetry is insufficient. |
| Observer backoff | None — re-read immediately | The 60-second `waitForEvent` window already gave filing its full retry budget (`freeform-filing` is `retries: 2`). Adding more wall-clock latency before re-read is hostile to users. |
| Retry-wait window | 60 seconds | Matches the original wait window. If `freeform-filing-retry` cannot complete in 60 seconds, escalate. |
| Terminal failure UX | Mark session row + non-blocking banner + push notification | Closes the existing dead-end. Banner has a single retry CTA; no "Dismiss" affordance, since dismissing without state change is the dead-end pattern. |
| Pre-existing sessions | One-shot backfill, 14-day cutoff | Beyond 14 days, filing-relevant context (transcript freshness for the LLM) decays. Older sessions are explicitly not recovered. |

### 2.1 Documented limitations

- **Root-cause chaining is not possible from the observer.** The observer never directly observes the failure inside `freeform-filing` or `freeform-filing-retry`; it only sees absence-of-completion. Sentry exceptions raised by the observer carry the diagnostic snapshot in `extra` but cannot include the original LLM/DB error chain. To investigate a specific terminal failure, query Inngest run history for `freeform-filing-retry` filtered by `sessionId`.
- **Inngest function tests use mocked `step` fixtures.** This matches the established repo precedent (`tests/integration/session-completed-chain.integration.test.ts`); a true `inngest-cli dev` end-to-end test is a deferred follow-up, not a blocker for this spec.

## 3. Architecture and Lifecycle

```
session-completed (existing — no functional change)
  └─ waitForEvent('app/filing.completed', 60s) → null
      ├─ captureException + structured warn (existing)
      ├─ step.sendEvent('app/session.filing_timed_out')
      └─ continues pipeline with null/stale topicId (existing)

filing-timed-out-observe (NEW)
  ├─ filingTimedOutEventSchema.parse(event.data)               # Zod gate at entry
  ├─ step.run('capture-diagnostic-snapshot')                    # D1: log session row + event count + time deltas
  ├─ step.run('re-read-session')
  │    ├─ filed_at IS NOT NULL                                  # Late completion (filing finished just past the 60s window)
  │    │    ├─ if filing_status === 'filing_failed' → mark 'filing_recovered'
  │    │    └─ return { resolution: 'late_completion' }
  │    │
  │    └─ filed_at IS NULL
  │         ├─ step.run('mark-pending')                         # filing_status = 'filing_pending'
  │         ├─ step.sendEvent('app/filing.retry')               # typed payload, see §5.4
  │         ├─ step.waitForEvent('app/filing.completed', 60s, match: 'data.sessionId')
  │         │
  │         ├─ event arrives
  │         │    └─ filing-completed-observe (NEW, separate fn) flips 'filing_pending' → 'filing_recovered'
  │         │       observer returns { resolution: 'retry_succeeded' }
  │         │
  │         └─ second timeout (terminal failure)
  │              ├─ step.run('mark-failed')                     # filing_status = 'filing_failed'
  │              ├─ step.sendEvent('app/session.filing_resolved', { resolution: 'unrecoverable' })
  │              ├─ step.sendEvent('app/notification.push')     # deep-link banner
  │              ├─ captureException(escalation, { extra: { snapshot } })
  │              └─ return { resolution: 'unrecoverable' }

filing-completed-observe (NEW companion)
  ├─ on 'app/filing.completed'
  ├─ if learning_sessions.filing_status IN ('filing_pending', 'filing_failed') for this sessionId:
  │    ├─ UPDATE filing_status = 'filing_recovered', filed_at = NOW()
  │    └─ step.sendEvent('app/session.filing_resolved', { resolution: 'recovered' })
  └─ else: no-op (the common path — most filings don't go through the recovery flow)
```

### 3.1 Latency

| Phase | Duration |
|---|---|
| Original `waitForEvent` window | 60 s |
| Continued `session-completed` pipeline (8 remaining steps) | ~30–60 s |
| `app/session.filing_timed_out` dispatch + observer cold start | ~1–3 s |
| Observer re-read decision | < 1 s |
| Retry dispatch + `waitForEvent` | up to 60 s |
| **Total wall-clock from session close to terminal failure mark** | **~155–185 s** |

The user has likely navigated away from the session-summary screen by then. Recovery is therefore delivered via:
1. **In-place TanStack Query refetch** for users still on the screen (see §7.2).
2. **Push notification** with deep-link to the session summary on terminal failure (see §7.3).

### 3.2 Idempotency contract

- The observer uses deterministic Inngest step names (`capture-diagnostic-snapshot`, `re-read-session`, `mark-pending`, `mark-failed`). Inngest infrastructure-level retries short-circuit at whichever step already completed.
- `app/filing.retry` is dispatched at most once per `app/session.filing_timed_out` event.
- `freeform-filing-retry` already self-heals missing transcript from DB (`apps/api/src/inngest/functions/freeform-filing.ts:26-41`). The retry handler must tolerate "topic already filed" if a stale completion event races the observer; this is verified explicitly in §8.4.
- The companion `filing-completed-observe` uses a conditional UPDATE (`WHERE filing_status IN ('filing_pending', 'filing_failed')`) so completion events on healthy sessions are no-ops.

### 3.3 Justification for separate function vs extending `freeform-filing-retry`

A reviewer challenge: why not collapse this into the existing retry handler?

1. **Trigger semantics differ.** The observer fires on `app/session.filing_timed_out`; the retry handler fires on `app/filing.retry`. Merging would require branchy event-type logic in one handler.
2. **The diagnostic snapshot is conceptually pre-retry**, not part-of-retry. Capturing it inside the retry handler would couple observability to retry execution.
3. **The observer is reusable** for future timeout-style observers (e.g., `app/session.summary_timed_out`, `app/quiz.generation_timed_out`).
4. **Separation makes the failure-mode table cleanly testable per branch** — late-completion, retry-success, and terminal-failure each isolate to one function.

## 4. Data contract changes

### 4.1 Inngest event schemas (`packages/schemas/src/inngest-events.ts`)

```typescript
// EXISTING dispatch site at session-completed.ts:175 will be updated to validate
// against this schema before calling step.sendEvent.
export const filingTimedOutEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionType: z.enum(['homework', 'freeform', 'curriculum']).nullable(),
  timeoutMs: z.number().int().positive(),
  timestamp: z.string().datetime(),
});

// NEW — replaces the hand-waved object the observer dispatches.
// Both the observer and freeform-filing-retry validate against this.
export const filingRetryEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']),
  sessionTranscript: z.string().optional(), // observer omits; retry handler self-heals from DB
});

// NEW — terminal-outcome event for queryability without dashboard scraping.
// Observer dispatches this with resolution: 'late_completion' | 'retry_succeeded' | 'unrecoverable'.
// The companion filing-completed-observe dispatches with resolution: 'recovered'.
export const filingResolvedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  resolution: z.enum(['late_completion', 'retry_succeeded', 'unrecoverable', 'recovered']),
  timestamp: z.string().datetime(),
});
```

### 4.2 Schema migration — `learning_sessions`

```sql
-- apps/api/drizzle/00XX_add_filing_state_tracking.sql

-- 1. Filing watermark — distinct from topicId (which may be set at session-open
--    for curriculum sessions, before filing has run).
ALTER TABLE "learning_sessions"
  ADD COLUMN "filed_at" timestamp with time zone DEFAULT NULL;

-- 2. User-facing filing state. pgEnum, matching repo convention for state machines.
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

-- 3. Per-session retry budget for user-initiated retries.
ALTER TABLE "learning_sessions"
  ADD COLUMN "filing_retry_count" integer NOT NULL DEFAULT 0;
```

Drizzle schema additions in `packages/database/src/schema/sessions.ts`:

```typescript
export const filingStatusEnum = pgEnum('filing_status', [
  'filing_pending',
  'filing_failed',
  'filing_recovered',
]);

// Inside the existing learningSessions table definition:
filedAt: timestamp('filed_at', { withTimezone: true }),
filingStatus: filingStatusEnum('filing_status'),
filingRetryCount: integer('filing_retry_count').notNull().default(0),
```

### 4.3 Rollback

This migration is **non-destructive**:
- All three columns are nullable (or have a benign default of `0`).
- Rollback is `DROP COLUMN filing_retry_count; DROP COLUMN filing_status; DROP TYPE filing_status; DROP COLUMN filed_at;` plus reverting the code that reads these columns.
- No data loss. Existing rows already have NULL values in the new columns.

### 4.4 `resolveFilingResult` writes `filed_at`

`apps/api/src/services/filing.ts:437` — `resolveFilingResult` is the single point where filing produces a topic association. Inside its existing transaction, add:

```typescript
await tx
  .update(learningSessions)
  .set({ filedAt: new Date() })
  .where(eq(learningSessions.id, sessionId));
```

This makes `filed_at IS NOT NULL` the authoritative filing watermark, independent of `topicId`.

### 4.5 API response — extend session detail

`GET /v1/sessions/:sessionId` response schema gains:

```typescript
filingStatus: z.enum(['filing_pending', 'filing_failed', 'filing_recovered']).nullable(),
filingRetryCount: z.number().int().nonnegative(),
filedAt: z.string().datetime().nullable(),
```

### 4.6 New endpoint — `POST /v1/sessions/:sessionId/retry-filing`

Triggers a user-initiated filing retry from the session-summary banner.

- **Auth:** scoped via `createScopedRepository(profileId)` — IDOR-protected per the CR-124-SCOPE pattern.
- **Idempotency:** rejects `409 ConflictError` when `filingStatus !== 'filing_failed'`. Only the terminal-failure state allows a user retry; `filing_pending`, `filing_recovered`, and `null` all 409.
- **Rate limit:** rejects `429` when `filing_retry_count >= 3`. The endpoint atomically increments `filing_retry_count` and sets `filing_status = 'filing_pending'` in the same UPDATE before dispatching `app/filing.retry`.
- **Metering:** routed through the existing `apps/api/src/middleware/metering.ts` middleware so user-initiated retries count against quota. (Auto-retries from the observer do not, because the LLM cost is borne by the existing `freeform-filing-retry` execution path.)
- **Response:** 200 with the updated session row.

## 5. Reconciliation logic detail

> **Note on DB access pattern.** The observer uses raw `getStepDatabase()` rather than `createScopedRepository(profileId)`. The latter is the project rule for HTTP route handlers (`apps/api/src/routes/`); Inngest function handlers in this repo use `getStepDatabase()` directly — see the established precedent at `apps/api/src/inngest/functions/freeform-filing.ts:31,44` and across all other Inngest functions. The `createScopedRepository` rule does apply to the new HTTP endpoint `POST /v1/sessions/:sessionId/retry-filing` (§4.6), where IDOR protection is essential.

### 5.1 Diagnostic snapshot (always logged)

```typescript
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
          summaryStatus: session.summaryStatus,
          updatedAt: session.updatedAt.toISOString(),
        }
      : null,
    eventCount,
    lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
    msSinceTimeoutDispatch: Date.now() - new Date(timestamp).getTime(),
  };
});
logger.warn('[filing-timed-out-observe] snapshot captured', { sessionId, profileId, ...snapshot });
```

Logged on every observer run, including the late-completion success branch, so the distribution of how-late-is-late is visible.

### 5.2 Re-read decision (immediate, no backoff)

```typescript
const recheck = await step.run('re-read-session', async () => {
  const db = getStepDatabase();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
});

if (recheck?.filedAt != null) {
  // Late completion — filing finished between the 60s waitForEvent timeout
  // and observer cold start.
  if (recheck.filingStatus === 'filing_failed') {
    await step.run('mark-recovered', async () => {
      const db = getStepDatabase();
      await db
        .update(learningSessions)
        .set({ filingStatus: 'filing_recovered' })
        .where(eq(learningSessions.id, sessionId));
    });
  }
  await step.sendEvent('emit-resolved', {
    name: 'app/session.filing_resolved',
    data: { sessionId, profileId, resolution: 'late_completion', timestamp: new Date().toISOString() },
  });
  return { resolution: 'late_completion' as const };
}
```

### 5.3 Mark pending + dispatch retry

```typescript
await step.run('mark-pending', async () => {
  const db = getStepDatabase();
  await db
    .update(learningSessions)
    .set({ filingStatus: 'filing_pending' })
    .where(eq(learningSessions.id, sessionId));
});

const sessionMode: 'freeform' | 'homework' =
  recheck.sessionType === 'homework' ? 'homework' : 'freeform';

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

### 5.4 Retry success branch

```typescript
if (retryResult != null) {
  // The companion filing-completed-observe also subscribes to
  // app/filing.completed and runs in parallel with this waitForEvent.
  // The two run concurrently, so by the time we return here, the row's
  // filing_status may still be 'filing_pending' for a brief window before
  // the companion's UPDATE lands. The mobile client's 15-second refetch
  // (§7.2) absorbs this eventual-consistency window. Do not depend on
  // the row state here.
  await step.sendEvent('emit-resolved', {
    name: 'app/session.filing_resolved',
    data: { sessionId, profileId, resolution: 'retry_succeeded', timestamp: new Date().toISOString() },
  });
  return { resolution: 'retry_succeeded' as const };
}
```

### 5.5 Terminal failure branch

```typescript
await step.run('mark-failed', async () => {
  const db = getStepDatabase();
  await db
    .update(learningSessions)
    .set({ filingStatus: 'filing_failed' })
    .where(eq(learningSessions.id, sessionId));
});

await step.sendEvent('emit-resolved', {
  name: 'app/session.filing_resolved',
  data: { sessionId, profileId, resolution: 'unrecoverable', timestamp: new Date().toISOString() },
});

await step.sendEvent('dispatch-push', {
  name: 'app/notification.push',
  data: {
    profileId,
    type: 'session_filing_failed',
    sessionId,
    deepLinkPath: `/session-summary/${sessionId}`,
  },
});

const escalationErr = new Error(
  `filing-timed-out-observe: retry failed after ${60_000 + 60_000}ms for session ${sessionId}`
);
captureException(escalationErr, {
  profileId,
  extra: { sessionId, snapshot, hint: 'See Inngest run history for freeform-filing-retry filtered by sessionId for root cause.' },
});

return { resolution: 'unrecoverable' as const, snapshot };
```

The structured-log + Sentry + DB marker + Inngest event combination satisfies the "queryable from non-Sentry tooling" rule via two independent channels.

### 5.6 Companion observer — `filing-completed-observe`

```typescript
export const filingCompletedObserve = inngest.createFunction(
  { id: 'filing-completed-observe', name: 'Filing completion audit observer' },
  { event: 'app/filing.completed' },
  async ({ event, step }) => {
    const { sessionId, profileId } = event.data;

    const updated = await step.run('flip-status-if-recovering', async () => {
      const db = getStepDatabase();
      const result = await db
        .update(learningSessions)
        .set({ filingStatus: 'filing_recovered', filedAt: new Date() })
        .where(
          and(
            eq(learningSessions.id, sessionId),
            inArray(learningSessions.filingStatus, ['filing_pending', 'filing_failed'])
          )
        )
        .returning({ id: learningSessions.id });
      return result.length > 0;
    });

    if (updated) {
      await step.sendEvent('emit-resolved', {
        name: 'app/session.filing_resolved',
        data: { sessionId, profileId, resolution: 'recovered', timestamp: new Date().toISOString() },
      });
    }

    return { recovered: updated };
  }
);
```

This handler is intentionally trivial: it converts "filing eventually completed for a session that was previously degraded" into a queryable audit-trail row + event.

## 6. Failure modes table

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Normal close | Filing completes within 60 s | Session summary with topic context | None needed |
| Late completion | Filing event arrives 60–63 s after dispatch (between the original timeout and observer cold start) | Session summary with topic context (TanStack refetch) | None — auto-resolves |
| Retry recovers | Observer's `app/filing.retry` succeeds within 60 s | Session summary with topic context (refetch within ~120 s) | None — automatic |
| Filing unrecoverable | Both initial wait and retry timeouts exhausted | Banner: "Topic placement unavailable — your overall progress isn't affected." + "Try again" button. Push notification with deep-link if user navigated away. | User taps "Try again" or opens the deep-link push and taps "Try again" |
| User retry succeeds | User-initiated retry produces `app/filing.completed` | `filing-completed-observe` flips status to `filing_recovered`; banner replaced with normal session summary on next refetch | None — automatic |
| User retry fails | User-initiated retry also times out | `freeform-filing-retry` exhausts its own retries; observer is not re-triggered (this path produces no `filing_timed_out` event); status stays `filing_pending` until next user action | User can retry again until `filing_retry_count` hits 3 |
| Retry budget exhausted | `filing_retry_count >= 3` | Banner shows "Topic placement could not be recovered. This session won't affect your overall progress." Retry button disabled. Help link to support. | None — manual support escalation |
| Concurrent retries | User taps "Try again" while observer's retry is in flight | `filingStatus = 'filing_pending'` (set by observer). Endpoint returns 409. UI shows "Retry already in progress" inline. | Wait for in-flight retry to resolve |
| Stranded pre-existing session | Session created before this spec ships, with `topic_id IS NULL AND filed_at IS NULL` | One-shot `filing-stranded-backfill` (§9) dispatches synthetic `filing_timed_out` events for sessions <14 days old; older sessions remain unrecovered | None for sessions >14 days; documented limitation |

## 7. Mobile UI surfacing

### 7.1 Component — `FilingFailedBanner`

`apps/mobile/src/components/session/FilingFailedBanner.tsx`. Renders inside `apps/mobile/src/app/session-summary/[sessionId].tsx` above the existing summary content, gated by `session.filingStatus`.

| `filingStatus` value | Banner state |
|---|---|
| `null` | Not rendered |
| `'filing_pending'` | Rendered with spinner + "Retrying topic placement…". No interactive elements; refetch keeps polling. |
| `'filing_failed'` and `filing_retry_count < 3` | Rendered with primary action: "Try again". Calls the retry mutation. |
| `'filing_failed'` and `filing_retry_count >= 3` | Rendered with disabled button + help link. No retry path. |
| `'filing_recovered'` | Rendered briefly with success state; auto-dismisses after 3 seconds via local timer; then unmounts. |

**No "Dismiss" affordance.** Per the UX-resilience rules, dismissing a banner that doesn't change underlying state is the dead-end pattern this design exists to eliminate. The user's existing back-navigation (`goBackOrReplace`) is the implicit secondary action.

### 7.2 TanStack Query refetch mechanism

`apps/mobile/src/hooks/use-sessions.ts` — `useSession(sessionId)` adds:

```typescript
refetchInterval: (data) => {
  // Poll while filing state is non-terminal so the banner reflects current
  // state without requiring screen focus changes.
  if (data?.session.filingStatus === null || data?.session.filingStatus === 'filing_pending') {
    return 15_000; // 15-second poll
  }
  return false; // Stop polling on terminal states
},
```

This is symmetric with the existing `persistedSummary` polling in `session-summary/[sessionId].tsx:131`.

### 7.3 Push notification on terminal failure

When the observer's terminal-failure branch dispatches `app/notification.push` with `type: 'session_filing_failed'`, the existing push pipeline delivers a notification with title "Session topic placement needs attention" and a deep-link to `/session-summary/{sessionId}`. The deep-link uses the full ancestor-chain push pattern (per CLAUDE.md repo-specific guardrails on Expo Router cross-tab navigation) so `router.back()` from the summary returns to the user's previous tab, not the Tabs first-route.

### 7.4 Error handling on user retry

```typescript
const retryMutation = useRetryFiling();

const onRetry = async () => {
  try {
    await retryMutation.mutateAsync({ sessionId });
  } catch (err) {
    if (err instanceof ConflictError) {
      showToast('Retry already in progress.');
    } else if (err instanceof RateLimitError) {
      showToast('Retry limit reached for this session.');
    } else {
      showToast('Could not start retry. Please try again in a moment.');
      Sentry.captureException(err);
    }
  }
};
```

Typed errors (`ConflictError`, `RateLimitError`) are classified at the API-client middleware boundary per the BUG-887 fix (commit `7f83cac5`). Screens never parse HTTP status codes.

### 7.5 Accessibility

- Banner uses `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` so screen readers announce it on appearance and on state transitions (`filing_pending` → `filing_failed`, `filing_failed` → `filing_recovered`).
- "Try again" button has `accessibilityLabel="Retry topic placement for this session"`.
- Disabled-button state has `accessibilityState={{ disabled: true }}` and `accessibilityHint="Retry limit reached. Open help for support."`.
- Color contrast meets WCAG AA on both light and dark themes via existing semantic tokens.

## 8. Testing and verification

### 8.1 Unit tests — `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`

| Test | What it verifies |
|---|---|
| `validates payload against filingTimedOutEventSchema at entry` | Schema gate; rejects malformed events |
| `captures diagnostic snapshot on every run, including late_completion` | D1 always-logged contract |
| `does not dispatch retry when filed_at is set on re-read` | Late-completion branch |
| `flips filing_failed → filing_recovered on late completion` | Audit-trail correctness when re-entering after a previous failure |
| `marks filing_pending then dispatches app/filing.retry on null filed_at` | Retry branch start |
| `dispatches typed filingRetryEventSchema payload to retry handler` | Contract between observer and `freeform-filing-retry` |
| `returns retry_succeeded when waitForEvent resolves` | Happy retry path |
| `marks filing_failed and captures exception on terminal timeout` | Terminal failure escalation (break test) |
| `dispatches app/session.filing_resolved on every terminal branch` | Queryability contract |
| `dispatches push notification on terminal failure` | UX recovery contract |

### 8.2 Unit tests — `apps/api/src/inngest/functions/filing-completed-observe.test.ts`

| Test | What it verifies |
|---|---|
| `flips filing_pending → filing_recovered on completion event` | Auto-recovery audit trail |
| `flips filing_failed → filing_recovered on user-initiated retry success` | User-recovery audit trail |
| `is a no-op for sessions with filing_status NULL` | Healthy-path correctness — does not interfere with normal filings |
| `dispatches app/session.filing_resolved with resolution: 'recovered'` | Queryability contract |

### 8.3 Endpoint tests — `apps/api/src/routes/sessions.test.ts` (additions)

| Test | What it verifies |
|---|---|
| `POST /retry-filing returns 200 and dispatches app/filing.retry on filing_failed state` | Happy path |
| `POST /retry-filing rejects 409 when filing_status is null` | Cannot retry healthy sessions |
| `POST /retry-filing rejects 409 when filing_status is filing_pending` | Cannot double-retry concurrent in-flight |
| `POST /retry-filing rejects 409 when filing_status is filing_recovered` | Cannot retry already-recovered sessions |
| `POST /retry-filing rejects 429 when filing_retry_count >= 3` | Rate-limit budget enforcement |
| `POST /retry-filing rejects 403 when sessionId belongs to a different profile` | IDOR guard (break test, mirrors CR-124-SCOPE) |
| `POST /retry-filing increments filing_retry_count atomically` | Race protection on concurrent user taps |
| `POST /retry-filing passes through metering middleware` | Quota accounting on user-initiated retries |

### 8.4 Integration test — `tests/integration/filing-timed-out-observer.integration.test.ts`

End-to-end through real Postgres (no service-layer mocks per CLAUDE.md), with mocked `step` fixtures (matching the precedent in `session-completed-chain.integration.test.ts`).

1. Insert a `learning_session` with `topic_id = NULL`, `filed_at = NULL`, `summary_status = 'final'`.
2. Invoke the observer handler with mocked Inngest `step` and an event matching `filingTimedOutEventSchema`.
3. After the terminal-failure path, assert from a fresh DB read:
   - `learning_sessions.filing_status === 'filing_failed'`
   - `learning_sessions.filed_at IS NULL`
   - `filing_retry_count === 0` (only user-initiated retries increment this)
4. Then insert a synthetic `app/filing.completed` event and invoke `filing-completed-observe`. Assert:
   - `filing_status === 'filing_recovered'`
   - `filed_at` is now set

### 8.5 Mobile component test — `apps/mobile/src/components/session/FilingFailedBanner.test.tsx`

| Test | What it verifies |
|---|---|
| `does not render when filingStatus is null` | Healthy session — banner absent |
| `renders pending state with spinner when filingStatus is filing_pending` | Auto-retry visibility |
| `renders Try again button when filingStatus is filing_failed and retry_count < 3` | Recovery affordance present |
| `disables retry button when filing_retry_count >= 3` | Budget enforcement at UI |
| `calls retry mutation and shows ConflictError toast on 409` | Typed error surfacing |
| `auto-dismisses after 3 s when filingStatus transitions to filing_recovered` | Success-state cleanup |
| `has accessibilityRole='alert' and announces state transitions` | A11y compliance |

### 8.6 Verified-by table

| Item | Verified by |
|---|---|
| Observer subscribes to `app/session.filing_timed_out` | `test: filing-timed-out-observe.test.ts:"is registered with correct event"` |
| Schema gate at observer entry | `test: filing-timed-out-observe.test.ts:"validates payload against filingTimedOutEventSchema..."` |
| Diagnostic snapshot logged on every run | `test: filing-timed-out-observe.test.ts:"captures diagnostic snapshot..."` |
| Late completion does not trigger retry | `test: filing-timed-out-observe.test.ts:"does not dispatch retry when filed_at is set..."` |
| `filed_at` is the filing watermark | `test: filing.test.ts:"resolveFilingResult sets filed_at inside the transaction"` |
| Terminal failure marks `filing_status = 'filing_failed'` and escalates | `test: filing-timed-out-observe.test.ts:"marks filing_failed and captures exception..."` |
| Terminal failure dispatches push notification | `test: filing-timed-out-observe.test.ts:"dispatches push notification on terminal failure"` |
| Companion observer flips state on completion | `test: filing-completed-observe.test.ts:"flips filing_pending → filing_recovered..."` |
| Companion observer is a no-op on healthy paths | `test: filing-completed-observe.test.ts:"is a no-op for sessions with filing_status NULL"` |
| User retry endpoint scoped + rate-limited + idempotent | `test: sessions.test.ts:"POST /retry-filing rejects 429..."` and `:"...rejects 409..."` and `:"...rejects 403..."` |
| User retry passes through metering | `test: sessions.test.ts:"POST /retry-filing passes through metering middleware"` |
| Mobile banner renders only on non-null `filingStatus` | `test: FilingFailedBanner.test.tsx:"does not render when filingStatus is null"` and four sibling state tests |
| Refetch interval polls only on non-terminal states | `test: use-sessions.test.ts:"useSession refetchInterval returns 15000 for filing_pending..."` |
| Migration is non-destructive | manual: column is NULL-defaulted, `ALTER TABLE DROP COLUMN` rollback verified locally before deploy |
| Stranded backfill scoped to <14 days old | `test: filing-stranded-backfill.test.ts:"only emits events for sessions newer than 14 days"` |

### 8.7 Commit message convention

All commits in this work tagged with `[FILING-TIMEOUT-OBS]`:

- `feat(api): add filing-timed-out-observe Inngest function [FILING-TIMEOUT-OBS]`
- `feat(api): add filing-completed-observe companion + filing_resolved events [FILING-TIMEOUT-OBS]`
- `feat(database): add filed_at, filing_status enum, filing_retry_count to learning_sessions [FILING-TIMEOUT-OBS]`
- `feat(api): add POST /v1/sessions/:id/retry-filing endpoint [FILING-TIMEOUT-OBS]`
- `feat(mobile): add FilingFailedBanner with retry CTA + 15s refetch [FILING-TIMEOUT-OBS]`
- `feat(api): one-shot filing-stranded-backfill function [FILING-TIMEOUT-OBS]`

## 9. One-shot backfill — `filing-stranded-backfill`

The cohort that motivates this spec is the existing set of freeform/homework sessions where filing failed silently before the observer existed.

```typescript
export const filingStrandedBackfill = inngest.createFunction(
  { id: 'filing-stranded-backfill', name: 'One-shot backfill of stranded filing sessions' },
  { event: 'app/maintenance.filing_stranded_backfill' },
  async ({ step }) => {
    const stranded = await step.run('find-stranded', async () => {
      const db = getStepDatabase();
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      return db.query.learningSessions.findMany({
        where: and(
          isNull(learningSessions.topicId),
          isNull(learningSessions.filedAt),
          inArray(learningSessions.sessionType, ['freeform', 'homework']),
          gte(learningSessions.createdAt, cutoff),
          eq(learningSessions.summaryStatus, 'final')
        ),
        columns: { id: true, profileId: true, sessionType: true },
      });
    });

    for (const session of stranded) {
      await step.sendEvent(`synthetic-timeout-${session.id}`, {
        name: 'app/session.filing_timed_out',
        data: filingTimedOutEventSchema.parse({
          sessionId: session.id,
          profileId: session.profileId,
          sessionType: session.sessionType,
          timeoutMs: 60_000,
          timestamp: new Date().toISOString(),
        }),
      });
    }

    return { dispatched: stranded.length };
  }
);
```

Triggered manually after deploy via the Inngest dashboard with a single `app/maintenance.filing_stranded_backfill` event. **Pre-existing sessions older than 14 days are not recovered** — this is documented and accepted.

## 10. Open items deferred to implementation plan

These are not design decisions; they are tactical items that the implementation plan in `docs/plans/2026-04-29-filing-timed-out-observer.md` will resolve:

1. Confirm Inngest event name `app/notification.push` matches the existing push-dispatch event used elsewhere in the codebase (or substitute the actual name).
2. Confirm `RateLimitError` exists in the typed-error hierarchy or add it alongside `ConflictError`.
3. Confirm the existing push-pipeline supports `type: 'session_filing_failed'` or add the type.
4. Decide whether `filing-stranded-backfill` triggers manually post-deploy (recommended) or auto-runs once via a deploy hook.
