# Filing Timed-Out Observer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the five missing test files that complete the spec verification coverage for the Filing Timed-Out Observer feature.

**Architecture:** The Inngest functions (`filing-timed-out-observe`, `filing-completed-observe`, `filing-stranded-backfill`), DB schema columns, mobile `FilingFailedBanner` component, `use-sessions` refetch hook, and `POST /sessions/:id/retry-filing` endpoint are **all already implemented and registered**. This plan only adds tests. Spec: `docs/superpowers/specs/2026-04-29-filing-timed-out-observer-design.md`. Finding ID: `[FILING-TIMEOUT-OBS]`.

**Tech Stack:** Jest, `@testing-library/react-native`, real Postgres for the integration test (loadDatabaseEnv pattern from `weekly-progress-push.integration.test.ts`).

---

## Pre-flight

This plan only adds new test files and appends to `sessions.test.ts` and `use-sessions.test.ts`. Run `git status` first — if the working tree has unrelated unstaged changes, commit or stash them before starting so each task's commit is clean.

---

## File Map

| Status | File | Role |
|--------|------|------|
| **Create** | `apps/api/src/inngest/functions/filing-completed-observe.test.ts` | Unit tests for companion observer (spec §8.2) |
| **Modify** | `apps/api/src/routes/sessions.test.ts` | Add retry-filing describe block (spec §8.3) |
| **Create** | `apps/mobile/src/components/session/FilingFailedBanner.test.tsx` | Component render + interaction tests (spec §8.5) |
| **Modify** | `apps/mobile/src/hooks/use-sessions.test.ts` | Add refetch-interval unit test (spec §8.6 verified-by) |
| **Create** | `apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts` | Real Postgres end-to-end (spec §8.4) |

---

## Task 1: filing-completed-observe.test.ts

**Files:**
- Create: `apps/api/src/inngest/functions/filing-completed-observe.test.ts`

**Reference:** companion function is at `apps/api/src/inngest/functions/filing-completed-observe.ts`. The function:
1. Reads `filingStatus` for the session (step `read-prior-status`)
2. If status is `null` / `filing_recovered` → no-op
3. If status is `filing_pending` or `filing_failed` → UPDATEs to `filing_recovered`, sets `filed_at`
4. If `flipped && priorStatus === 'filing_failed'` → dispatches `app/session.filing_resolved` with `resolution: 'recovered'`

Follow the manual-step-executor pattern from `filing-timed-out-observe.test.ts`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/api/src/inngest/functions/filing-completed-observe.test.ts

// Module mocks — before any imports (Jest hoisting)
const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (_config: unknown, _trigger: unknown, handler: (...args: unknown[]) => unknown) =>
        ({ fn: handler })
    ),
  },
}));

jest.mock('../../services/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { filingCompletedObserve } from './filing-completed-observe';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: { sessionId: SESSION_ID, profileId: PROFILE_ID, ...overrides },
  };
}

async function executeHandler(
  priorStatus: string | null,
  updateReturnsRow: boolean
) {
  const mockUpdate = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(updateReturnsRow ? [{ id: SESSION_ID }] : []),
  };

  const mockDb = {
    query: {
      learningSessions: {
        findFirst: jest.fn().mockResolvedValue(
          priorStatus !== null ? { filingStatus: priorStatus } : { filingStatus: null }
        ),
      },
    },
    update: jest.fn().mockReturnValue(mockUpdate),
  };

  mockGetStepDatabase.mockReturnValue(mockDb);

  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (filingCompletedObserve as any).fn;
  const result = await handler({ event: makeEvent(), step: mockStep });
  return { result, mockStep, mockDb, mockUpdate };
}

describe('filing-completed-observe', () => {
  beforeEach(() => jest.clearAllMocks());

  it('flips filing_pending → filing_recovered on completion event', async () => {
    const { result, mockUpdate } = await executeHandler('filing_pending', true);

    expect(mockUpdate.returning).toHaveBeenCalled();
    expect(result).toEqual({ recovered: true, priorStatus: 'filing_pending' });
  });

  it('flips filing_failed → filing_recovered and dispatches app/session.filing_resolved', async () => {
    const { result, mockStep } = await executeHandler('filing_failed', true);

    expect(result).toEqual({ recovered: true, priorStatus: 'filing_failed' });

    const emitCall = mockStep.sendEvent.mock.calls.find(
      ([name]: [string]) => name === 'emit-resolved'
    );
    expect(emitCall).toBeDefined();
    expect(emitCall[1]).toMatchObject({
      name: 'app/session.filing_resolved',
      data: expect.objectContaining({
        resolution: 'recovered',
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
      }),
    });
  });

  it('is a no-op for sessions with filing_status null', async () => {
    const { result, mockStep, mockDb } = await executeHandler(null, false);

    // read-prior-status ran but returned null → early return
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ recovered: false, priorStatus: null });
  });

  it('does NOT dispatch filing_resolved when flipping from filing_pending (observer handles it)', async () => {
    const { mockStep } = await executeHandler('filing_pending', true);

    // Only filing_failed → recovered triggers the event; filing_pending does not.
    const emitCalls = mockStep.sendEvent.mock.calls.filter(
      ([name]: [string]) => name === 'emit-resolved'
    );
    expect(emitCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/api && pnpm exec jest src/inngest/functions/filing-completed-observe.test.ts --no-coverage
```

Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/inngest/functions/filing-completed-observe.test.ts
git commit -m "test(api): add filing-completed-observe unit tests [FILING-TIMEOUT-OBS]"
```

---

## Task 2: sessions.test.ts — retry-filing describe block

**Files:**
- Modify: `apps/api/src/routes/sessions.test.ts`

**Reference:** retry-filing endpoint is at `apps/api/src/routes/sessions.ts:123-178`. Logic:
1. `getSession(db, profileId, sessionId)` — null → 404
2. `db.update(...).where(filingStatus='filing_failed' AND filingRetryCount < 3).returning()` — empty array → re-read and throw `ConflictError` or `RateLimitedError`
3. Non-empty → `inngest.send('app/filing.retry', ...)` → `getSession` → 200

In the test file, the mock database (`mockDatabaseModule.db`) is a `createMockDb()` instance. Its `update` chain returns a Proxy; the default destructure `const [updated] = proxy` resolves to a truthy value. To test the failure path, override `mockDatabaseModule.db.update` with `.mockReturnValueOnce(failChain)`.

The `getSession` service is mocked via `jest.mock('../services/session')` at the top of the file. Import `getSession` to override it per-test.

- [ ] **Step 1: Add `getSession` to the existing service import**

Find this block in `apps/api/src/routes/sessions.test.ts` (around line 364):

```typescript
import {
  closeSession,
  processMessage,
  streamMessage,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  setSessionInputMode,
  SessionExchangeLimitError,
} from '../services/session';
```

Replace with:

```typescript
import {
  closeSession,
  processMessage,
  streamMessage,
  getSession,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  setSessionInputMode,
  SessionExchangeLimitError,
} from '../services/session';
```

- [ ] **Step 2: Add the retry-filing describe block at the end of the outer `describe('session routes')`**

Append before the final closing `});` of `describe('session routes')`:

```typescript
describe('POST /v1/sessions/:sessionId/retry-filing', () => {
  // Helper: chain that resolves returning() to an empty array (failure path)
  function makeFailUpdateChain() {
    return {
      set: () => ({
        where: () => ({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
  }

  // Helper: chain that resolves returning() to one row (success path)
  function makeSuccessUpdateChain(row: Record<string, unknown> = { id: SESSION_ID }) {
    return {
      set: () => ({
        where: () => ({
          returning: jest.fn().mockResolvedValue([row]),
        }),
      }),
    };
  }

  // Build a session row in the requested filing state. Used both for the auth
  // pre-read AND (where applicable) for the error-discrimination re-read.
  function sessionRow(
    overrides: Partial<{
      filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null;
      filingRetryCount: number;
    }> = {}
  ) {
    return {
      id: SESSION_ID,
      subjectId: SUBJECT_ID,
      topicId: null,
      sessionType: 'learning',
      status: 'completed',
      filingStatus: 'filing_failed' as const,
      filingRetryCount: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Sensible default for the auth pre-read; tests that need a different
    // discrimination read explicitly chain a second mockResolvedValueOnce.
    (getSession as jest.Mock).mockResolvedValue(sessionRow());
  });

  it('returns 200 and dispatches app/filing.retry on filing_failed state', async () => {
    // Success path: getSession is called twice — once for auth, once for the
    // final response payload after inngest.send. Both reads return the
    // (now retry_count=1) row.
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_failed', filingRetryCount: 0 }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_pending', filingRetryCount: 1 }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(
      makeSuccessUpdateChain({ id: SESSION_ID })
    );

    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/filing.retry' })
    );
  });

  it('returns 409 when filing_status is null (not in retriable state)', async () => {
    // The route reads getSession TWICE on the failure path: first for auth,
    // then again to discriminate "wrong state" (409) from "budget exhausted"
    // (429). Mock both calls explicitly — do NOT rely on the beforeEach
    // default for the auth read, because future test reordering can break
    // implicit ordering.
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: null }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: null }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(makeFailUpdateChain());

    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(409);
    expect(getSession as jest.Mock).toHaveBeenCalledTimes(2);
  });

  it('returns 409 when filing_status is filing_pending (in-flight retry)', async () => {
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_pending', filingRetryCount: 1 }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_pending', filingRetryCount: 1 }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(makeFailUpdateChain());

    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(409);
  });

  it('returns 409 when filing_status is filing_recovered', async () => {
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_recovered', filingRetryCount: 1 }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_recovered', filingRetryCount: 1 }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(makeFailUpdateChain());

    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(409);
  });

  it('returns 429 when filing_retry_count >= 3 (budget exhausted)', async () => {
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_failed', filingRetryCount: 3 }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_failed', filingRetryCount: 3 }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(makeFailUpdateChain());

    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(429);
  });

  // [break test: FILING-TIMEOUT-OBS-IDOR] getSession returning null on the
  // auth pre-read MUST short-circuit the route to 404 — without ever touching
  // the UPDATE or dispatching app/filing.retry. This is the IDOR break test
  // required by CLAUDE.md → "Security fixes require a 'break test'".
  it('returns 404 when sessionId belongs to a different profile (IDOR break test)', async () => {
    // Override the beforeEach default so the FIRST getSession call (auth) is null.
    (getSession as jest.Mock).mockReset();
    (getSession as jest.Mock).mockResolvedValueOnce(null);

    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    expect(mockDatabaseModule.db.update).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('passes the WHERE-guarded UPDATE through to the DB on the success path', async () => {
    // We do not assert SQL atomicity here (mocked DB cannot prove that). We
    // assert the ROUTE reached the UPDATE step AND dispatched exactly one
    // app/filing.retry — i.e. the success branch executed end-to-end.
    // The WHERE-clause atomicity itself is verified by the integration test
    // in Task 5, which exercises the real Postgres CAS.
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_failed', filingRetryCount: 0 }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_pending', filingRetryCount: 1 }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(
      makeSuccessUpdateChain({ id: SESSION_ID })
    );

    await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(mockDatabaseModule.db.update).toHaveBeenCalledWith(
      expect.anything() // learningSessions table reference
    );
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/filing.retry' })
    );
  });

  it('does not dispatch app/filing.retry when the WHERE guard matches 0 rows', async () => {
    (getSession as jest.Mock)
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_pending', filingRetryCount: 1 }))
      .mockResolvedValueOnce(sessionRow({ filingStatus: 'filing_pending', filingRetryCount: 1 }));
    (mockDatabaseModule.db.update as jest.Mock).mockReturnValueOnce(makeFailUpdateChain());

    await app.request(
      `/v1/sessions/${SESSION_ID}/retry-filing`,
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd apps/api && pnpm exec jest src/routes/sessions.test.ts --no-coverage --testNamePattern="retry-filing"
```

Expected: 8 tests PASS. If any fail due to the default mock chain behaviour for the success path, check that `makeSuccessUpdateChain` resolves correctly and `getSession` has been called 2× (first call returns `filing_failed` session, second call returns the updated session).

- [ ] **Step 4: Run full sessions suite to check for regressions**

```bash
cd apps/api && pnpm exec jest src/routes/sessions.test.ts --no-coverage
```

Expected: all pre-existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/sessions.test.ts
git commit -m "test(api): add POST /sessions/:id/retry-filing tests [FILING-TIMEOUT-OBS]"
```

---

## Task 3: FilingFailedBanner.test.tsx

**Files:**
- Create: `apps/mobile/src/components/session/FilingFailedBanner.test.tsx`

**Reference:** component at `apps/mobile/src/components/session/FilingFailedBanner.tsx`. It:
- Renders nothing when `filingStatus === null` or `hidden === true`
- Shows spinner when `filing_pending`
- Shows "Try again" button when `filing_failed` and `filingRetryCount < 3`
- Disables button when `filingRetryCount >= 3`
- Auto-dismisses after 3 s on `filing_recovered` state
- Calls `retry.mutateAsync({ sessionId })` on button press; catches `ConflictError` / `RateLimitedError`
- `accessibilityRole="alert"` on the wrapper View

**Mocks needed:**
- `../../hooks/use-retry-filing` → returns `{ mutateAsync, isPending }`
- `../../lib/sentry` → `{ Sentry: { captureException: jest.fn() } }`

- [ ] **Step 1: Create the test file**

```typescript
// apps/mobile/src/components/session/FilingFailedBanner.test.tsx

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ConflictError, RateLimitedError } from '@eduagent/schemas';
import { FilingFailedBanner } from './FilingFailedBanner';

const mockMutateAsync = jest.fn();
const mockUseRetryFiling = jest.fn();

jest.mock('../../hooks/use-retry-filing', () => ({
  useRetryFiling: () => mockUseRetryFiling(),
}));

const mockCaptureException = jest.fn();
jest.mock('../../lib/sentry', () => ({
  Sentry: { captureException: (...args: unknown[]) => mockCaptureException(...args) },
}));

function makeSession(
  filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null,
  filingRetryCount = 0
) {
  return { id: 'sess-1', filingStatus, filingRetryCount };
}

describe('FilingFailedBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseRetryFiling.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockMutateAsync.mockResolvedValue({ session: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render when filingStatus is null', () => {
    const { queryByTestId } = render(<FilingFailedBanner session={makeSession(null)} />);
    expect(queryByTestId('filing-failed-banner')).toBeNull();
  });

  it('renders pending state with spinner when filingStatus is filing_pending', () => {
    const { getByTestId, getByText } = render(
      <FilingFailedBanner session={makeSession('filing_pending')} />
    );
    expect(getByTestId('filing-failed-banner')).toBeTruthy();
    expect(getByText('Retrying topic placement...')).toBeTruthy();
    // No retry button in pending state
    expect(() => getByTestId('filing-retry-button')).toThrow();
  });

  it('renders Try again button when filingStatus is filing_failed and retry_count < 3', () => {
    const { getByTestId } = render(
      <FilingFailedBanner session={makeSession('filing_failed', 0)} />
    );
    const button = getByTestId('filing-retry-button');
    expect(button).toBeTruthy();
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('disables retry button when filing_retry_count >= 3', () => {
    const { getByTestId } = render(
      <FilingFailedBanner session={makeSession('filing_failed', 3)} />
    );
    const button = getByTestId('filing-retry-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
    expect(button.props.disabled).toBe(true);
  });

  it('calls retry mutation and shows ConflictError inline message on 409', async () => {
    mockMutateAsync.mockRejectedValueOnce(new ConflictError('retry in progress'));

    const { getByTestId, findByText } = render(
      <FilingFailedBanner session={makeSession('filing_failed', 0)} />
    );

    fireEvent.press(getByTestId('filing-retry-button'));

    expect(await findByText('Retry already in progress.')).toBeTruthy();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('auto-dismisses after 3 s when filingStatus transitions to filing_recovered', () => {
    // Render once with filing_recovered. The dismiss-timer useEffect fires on
    // mount because filingStatus === 'filing_recovered' && hidden === false.
    // NOTE: do NOT use waitFor here — under fake timers waitFor's polling
    // loop sleeps in real time and either hangs or times out. Wrap the timer
    // advance in act() so the setHidden(true) state update is flushed
    // synchronously, then assert with queryByTestId immediately after.
    const { getByTestId, queryByTestId } = render(
      <FilingFailedBanner session={makeSession('filing_recovered')} />
    );

    expect(getByTestId('filing-failed-banner')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3100);
    });

    expect(queryByTestId('filing-failed-banner')).toBeNull();
  });

  it('has accessibilityRole="alert" on the banner wrapper', () => {
    const { getByTestId } = render(
      <FilingFailedBanner session={makeSession('filing_failed', 0)} />
    );
    expect(getByTestId('filing-failed-banner').props.accessibilityRole).toBe('alert');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm exec jest src/components/session/FilingFailedBanner.test.tsx --no-coverage
```

Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/session/FilingFailedBanner.test.tsx
git commit -m "test(mobile): add FilingFailedBanner component tests [FILING-TIMEOUT-OBS]"
```

---

## Task 4: use-sessions.test.ts — refetch interval

**Files:**
- Modify: `apps/mobile/src/hooks/use-sessions.test.ts`

**Reference:** `computeFilingRefetchInterval` is exported from `apps/mobile/src/hooks/use-sessions.ts:44-48`. It returns `15_000` for `'filing_pending'` and `false` for all other values.

- [ ] **Step 1: Add the import at the top of `use-sessions.test.ts`**

Find the existing import block at lines 1-15. Add `computeFilingRefetchInterval` to it:

```typescript
import {
  useStartSession,
  useSetSessionInputMode,
  useSendMessage,
  useCloseSession,
  useSyncHomeworkState,
  useStreamMessage,
  useSessionSummary,
  useSkipSummary,
  useSubmitSummary,
  useTopicParkingLot,
  computeFilingRefetchInterval,
} from './use-sessions';
```

- [ ] **Step 2: Append the describe block at the end of the test file**

```typescript
describe('computeFilingRefetchInterval', () => {
  it('returns 15000 for filing_pending so useSession polls while retry is in flight', () => {
    expect(computeFilingRefetchInterval('filing_pending')).toBe(15_000);
  });

  it('returns false for filing_failed (terminal — no polling needed)', () => {
    expect(computeFilingRefetchInterval('filing_failed')).toBe(false);
  });

  it('returns false for filing_recovered (terminal — banner auto-dismisses)', () => {
    expect(computeFilingRefetchInterval('filing_recovered')).toBe(false);
  });

  it('returns false for null (healthy session)', () => {
    expect(computeFilingRefetchInterval(null)).toBe(false);
  });

  it('returns false for undefined (data not yet loaded)', () => {
    expect(computeFilingRefetchInterval(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm exec jest src/hooks/use-sessions.test.ts --no-coverage --testNamePattern="computeFilingRefetchInterval"
```

Expected: 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/use-sessions.test.ts
git commit -m "test(mobile): add computeFilingRefetchInterval unit tests [FILING-TIMEOUT-OBS]"
```

---

## Task 5: filing-timed-out-observer.integration.test.ts

**Files:**
- Create: `apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts`

**Reference:** real-Postgres integration test pattern from `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts`. The `loadDatabaseEnv` path is relative: `resolve(__dirname, '../../../..')` from `src/inngest/functions/`. Seed: account → profile → subject → learning_session. Call handler functions with mocked `step` objects. Assert DB state via fresh `db.query` reads. **Cleanup is via `afterAll` deleting accounts by `clerkUserId` prefix; FK ON DELETE CASCADE handles child rows.**

**What the spec requires (§8.4):**
1. Insert session with `topic_id = NULL`, `filed_at = NULL`, `summary_status = 'final'`
2. Invoke observer handler — terminal-failure path (step returns empty `returning()`, waitForEvent returns null)
3. Assert `filing_status = 'filing_failed'`, `filed_at IS NULL`, `filing_retry_count = 0`
4. Invoke `filing-completed-observe` handler with synthetic completion event
5. Assert `filing_status = 'filing_recovered'`, `filed_at IS NOT NULL`

The three integration tests below cover both terminal paths the observer can take, with **tight equality assertions** (no disjunctions):
- **Test 1**: status starts as `null` → mark-failed CAS does NOT match (status was never `filing_pending`) → emits `recovered_after_window`. Asserts `filingStatus IS NULL` and `filedAt IS NULL`.
- **Test 2**: status pre-flighted to `filing_pending` → mark-failed CAS matches → emits `unrecoverable`. Asserts `filingStatus = 'filing_failed'` per spec §8.4 step 3.
- **Test 3**: full recovery round-trip via `filing-completed-observe`. Asserts `filingStatus = 'filing_recovered'` and `filedAt IS NOT NULL` per spec §8.4 step 5.

`filing_retry_count` stays `0` in Tests 1 and 2 because we override `mark-pending-and-claim-retry-slot` to return `null` (no retry slot claimed → counter never incremented).

- [ ] **Step 1: Create the integration test file**

```typescript
// apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts

import { resolve } from 'path';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { eq, like } from 'drizzle-orm';
import { filingTimedOutObserve } from './filing-timed-out-observe';
import { filingCompletedObserve } from './filing-completed-observe';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

// Unique prefix for THIS test run. afterAll deletes by this prefix; FK
// cascades clean profiles → subjects → sessions. Mirrors the pattern in
// weekly-progress-push.integration.test.ts.
const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_filing_obs_${RUN_ID}`;

beforeAll(async () => {
  db = createDatabase(process.env.DATABASE_URL!);
});

afterAll(async () => {
  // Cascade-delete every account this test run created. Deletes profiles,
  // subjects, and learning_sessions transitively via FK ON DELETE CASCADE.
  await db.delete(accounts).where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedProfile(): Promise<{ accountId: string; profileId: string }> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await db.insert(accounts).values({
    id: accountId,
    clerkUserId: `${CLERK_PREFIX}_${accountId}`,
    email: `test_${accountId}@example.invalid`,
  });
  await db.insert(profiles).values({
    id: profileId,
    accountId,
    displayName: 'Test User',
  });
  return { accountId, profileId };
}

async function seedSubject(profileId: string): Promise<string> {
  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name: 'Test Subject',
    language: 'English',
    status: 'active',
  });
  return subjectId;
}

async function seedStrandedSession(
  profileId: string,
  subjectId: string
): Promise<string> {
  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    sessionType: 'learning',
    status: 'completed',
    summaryStatus: 'final',
    // topicId, filedAt, filingStatus all NULL — stranded state
  });
  return sessionId;
}

// ── Step mock builder ─────────────────────────────────────────────────────────

function makeStep(overrides: Record<string, () => Promise<unknown>> = {}) {
  return {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (name in overrides) return overrides[name]();
      return fn();
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    waitForEvent: jest.fn().mockResolvedValue(null), // default: timeout
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('filing-timed-out-observer integration', () => {
  let profileId: string;
  let subjectId: string;

  beforeAll(async () => {
    const seeded = await seedProfile();
    profileId = seeded.profileId;
    subjectId = await seedSubject(profileId);
  });

  it('emits recovered_after_window when no retry slot is claimed and CAS does not match', async () => {
    // The seeded session has filingStatus === null. We override
    // mark-pending-and-claim-retry-slot to return null (i.e. simulate "the
    // CAS that flips null→pending matched 0 rows" — typically because retry
    // budget is exhausted). All other steps run their real inner fn against
    // real Postgres.
    //
    // Expected sequence (see filing-timed-out-observe.ts:202-244):
    //   - re-read-session sees filedAt=null → skip late_completion branch
    //   - mark-pending-and-claim-retry-slot returns null (overridden)
    //   - retryResult stays null → skip retry-success branch
    //   - mark-failed CAS WHERE filingStatus='filing_pending' matches 0 rows
    //     (status is still null) → markFailedResult is false
    //   - emit-resolved-recovered-after-window fires
    //   - return resolution: 'recovered_after_window'
    const sessionId = await seedStrandedSession(profileId, subjectId);

    const step = makeStep({
      'mark-pending-and-claim-retry-slot': async () => null,
    });

    const handler = (filingTimedOutObserve as any).fn;
    const result = await handler({
      event: {
        data: {
          sessionId,
          profileId,
          sessionType: 'learning',
          timeoutMs: 60_000,
          timestamp: new Date().toISOString(),
        },
      },
      step,
    });

    // Tight assertion — no disjunction. The behaviour above is deterministic
    // given the overrides; if it changes, this test SHOULD fail loudly so we
    // know the state machine drifted.
    expect(result.resolution).toBe('recovered_after_window');

    // DB state: nothing was filed, no retry was claimed, status was never
    // advanced past null because the CAS guards prevented every flip.
    const fresh = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });

    expect(fresh).toBeDefined();
    expect(fresh!.filingStatus).toBeNull();
    expect(fresh!.filedAt).toBeNull();
    expect(fresh!.filingRetryCount).toBe(0);

    // emit-resolved-recovered-after-window must have been sent (per spec §8.4
    // and the [CR-FIL-SILENT-01] no-silent-recovery rule).
    const emitCall = step.sendEvent.mock.calls.find(
      ([name]: [string]) => name === 'emit-resolved-recovered-after-window'
    );
    expect(emitCall).toBeDefined();
  });

  it('emits unrecoverable + filingStatus=filing_failed when status was already filing_pending', async () => {
    // Spec §8.4 explicit requirement: "Assert filing_status = 'filing_failed'".
    // To exercise the path that actually sets filing_failed, the session must
    // already be in 'filing_pending' when mark-failed runs (the CAS guard
    // requires it). Pre-flight the DB into that state, then drive the
    // terminal-failure path by overriding mark-pending-and-claim-retry-slot
    // to return null (no retry attempted, falls through to mark-failed which
    // now matches because status IS filing_pending).
    const sessionId = await seedStrandedSession(profileId, subjectId);
    await db
      .update(learningSessions)
      .set({ filingStatus: 'filing_pending' })
      .where(eq(learningSessions.id, sessionId));

    const step = makeStep({
      'mark-pending-and-claim-retry-slot': async () => null,
    });

    const handler = (filingTimedOutObserve as any).fn;
    const result = await handler({
      event: {
        data: {
          sessionId,
          profileId,
          sessionType: 'learning',
          timeoutMs: 60_000,
          timestamp: new Date().toISOString(),
        },
      },
      step,
    });

    expect(result.resolution).toBe('unrecoverable');

    const fresh = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });
    expect(fresh!.filingStatus).toBe('filing_failed');
    expect(fresh!.filedAt).toBeNull();
  });

  it('full terminal-failure → filing-completed-observe recovery round trip', async () => {
    const sessionId = await seedStrandedSession(profileId, subjectId);

    // 1. Force the session into filing_failed state by setting it directly.
    await db
      .update(learningSessions)
      .set({ filingStatus: 'filing_failed' })
      .where(eq(learningSessions.id, sessionId));

    // 2. Invoke filing-completed-observe with a synthetic filing.completed event.
    const step = makeStep();
    const compHandler = (filingCompletedObserve as any).fn;
    const compResult = await compHandler({
      event: {
        data: { sessionId, profileId },
      },
      step,
    });

    // 3. Assert from a fresh DB read.
    const recovered = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });

    expect(recovered).toBeDefined();
    expect(recovered!.filingStatus).toBe('filing_recovered');
    expect(recovered!.filedAt).not.toBeNull();
    expect(compResult.recovered).toBe(true);
    expect(compResult.priorStatus).toBe('filing_failed');
  });
});
```

- [ ] **Step 2: Run the integration test (requires real Postgres via Doppler)**

```bash
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest src/inngest/functions/filing-timed-out-observer.integration.test.ts --no-coverage --testTimeout=30000
```

Expected: 3 tests PASS. After the suite finishes, the `afterAll` hook deletes all rows seeded by this run via the `CLERK_PREFIX`. If you run the suite repeatedly in the same DB instance and see leftover rows, query `SELECT * FROM accounts WHERE clerk_user_id LIKE 'clerk_filing_obs_%'` — anything left is a sign cleanup failed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts
git commit -m "test(api): add filing-timed-out-observer integration test [FILING-TIMEOUT-OBS]"
```

---

## Self-review against spec

### Spec coverage check

| Spec requirement | Covered by | Notes |
|---|---|---|
| §8.2 filing-completed-observe tests (4 tests) | Task 1 | |
| §8.3 sessions endpoint tests (8 tests) | Task 2 | Includes IDOR break test per CLAUDE.md "Security fixes require a 'break test'" |
| §8.5 FilingFailedBanner tests (7 tests) | Task 3 | Auto-dismiss uses `act` + sync `queryByTestId` (no `waitFor` under fake timers) |
| §8.6 verified-by: `computeFilingRefetchInterval` | Task 4 | Pure function only — does NOT verify `useSession` actually polls. Add a hook test if §8.6 demands the latter |
| §8.4 integration test (real Postgres) | Task 5 | THREE tests with tight equality assertions. Cleanup via `afterAll` + `CLERK_PREFIX` + FK cascades |

### What is already done (do NOT re-implement)

- `apps/api/src/inngest/functions/filing-timed-out-observe.ts` ✅
- `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts` ✅ (CAS break tests + 24h dedup)
- `apps/api/src/inngest/functions/filing-completed-observe.ts` ✅
- `apps/api/src/inngest/functions/filing-stranded-backfill.ts` ✅
- `apps/api/src/inngest/functions/filing-stranded-backfill.test.ts` ✅ (cap + auto-resume)
- `apps/api/src/inngest/index.ts` ✅ (all 3 functions registered)
- `apps/api/drizzle/0041_filing_state_tracking.sql` ✅
- `apps/api/drizzle/0042_session_filing_failed_notification_type.sql` ✅
- `packages/database/src/schema/sessions.ts` filedAt / filingStatus / filingRetryCount columns ✅
- `packages/schemas/src/inngest-events.ts` all 4 event schemas ✅ (including `recovered_after_window`)
- `apps/api/src/routes/sessions.ts` retry-filing endpoint ✅
- `apps/mobile/src/components/session/FilingFailedBanner.tsx` ✅
- `apps/mobile/src/hooks/use-sessions.ts` refetchInterval + `computeFilingRefetchInterval` ✅
- `apps/mobile/src/hooks/use-retry-filing.ts` ✅
- `apps/api/src/services/filing.ts` writes `filedAt` in `resolveFilingResult` ✅

### No placeholder scan

All steps contain actual test code. No "TBD" or "similar to Task N" patterns.

### Type consistency check

- `filingStatus` values: `'filing_pending' | 'filing_failed' | 'filing_recovered' | null` — used consistently across all 5 tasks.
- `resolution` values: `'late_completion' | 'retry_succeeded' | 'unrecoverable' | 'recovered' | 'recovered_after_window'` — matches `filingResolvedEventSchema` in `packages/schemas/src/inngest-events.ts`.
- `SESSION_ID` / `PROFILE_ID` fixtures: Tasks 1, 2, 5 each define their own locally to avoid cross-task coupling.

### Changes vs. previous revision

1. **Removed false pre-flight** — the claimed `UU` merge conflict in `subjects.test.ts` was stale; section now just instructs a clean working tree and notes that the previous claim was wrong.
2. **Task 2** — every retry-filing test now sets BOTH `getSession` calls via explicit `.mockResolvedValueOnce(...).mockResolvedValueOnce(...)` chains; no implicit reliance on `beforeEach` defaults. The atomicity test renamed to "passes the WHERE-guarded UPDATE through" with assertion tightened to `inngest.send` shape (mocked DB cannot prove SQL atomicity — that's Task 5's job). IDOR break test annotated with `[break test: …]` finding tag per CLAUDE.md.
3. **Task 3** — auto-dismiss test no longer uses `waitFor` under fake timers; uses `act() + jest.advanceTimersByTime + sync queryByTestId` instead, which is the documented RTL pattern for fake-timer assertions. Removed unused `waitFor` import.
4. **Task 5** — split into THREE tests instead of two; assertions tightened from disjunctive (`'unrecoverable' OR 'recovered_after_window'`) to exact equality. The `'unrecoverable + filing_failed'` test pre-flights `filing_pending` so the CAS actually matches and the spec's "Assert filing_status = 'filing_failed'" requirement is verified directly. Added `afterAll` cleanup via `CLERK_PREFIX` + FK cascades — mirrors `weekly-progress-push.integration.test.ts`. Added `like` to drizzle-orm imports.
5. **§8.6 scope** — explicit note that Task 4 only verifies the pure function, not the `useSession` polling effect. Add a hook test if a strict reading of §8.6 demands it.
