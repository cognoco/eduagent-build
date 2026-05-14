// ---------------------------------------------------------------------------
// Ask Silent Classify — Tests
//
// Co-located with ask-silent-classify.ts. Focus is on the [BUG-697 / J-8]
// safeParse-fail branch: a malformed event payload must NOT throw (which
// burns Inngest retries on a permanently-bad input) and MUST emit a
// structured `app/ask.classification_failed` event so the case is queryable.
//
// Manual step-executor pattern matches session-stale-cleanup.test.ts —
// InngestTestEngine is incompatible with this codebase's per-step error
// isolation patterns.
// ---------------------------------------------------------------------------

const mockClassifySubject = jest.fn();
const mockGetStepDatabase = jest.fn();

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/subject-classify' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../../services/subject-classify'),
    // gc1-allow: external service boundary — prevents real LLM calls in unit tests
    classifySubject: (...args: unknown[]) => mockClassifySubject(...args),
  }),
);

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../helpers'),
  // gc1-allow: isolates step-database helper from real DB config reads
  getStepDatabase: () => mockGetStepDatabase(),
}));

const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../client'),
  ...mockInngestTransport.module,
})); // gc1-allow: inngest framework boundary

// Import AFTER mocks
import { TEST_PROFILE_ID, TEST_SESSION_ID } from '@eduagent/test-utils';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

import { askSilentClassify } from './ask-silent-classify';

async function executeHandler(eventData: unknown) {
  const { step, runCalls, sendEventCalls, sleepCalls, waitForEventCalls } =
    createInngestStepRunner();
  const handler = (askSilentClassify as any).fn;
  const result = await handler({ event: { data: eventData }, step });
  return { result, runCalls, sendEventCalls, sleepCalls, waitForEventCalls };
}

describe('ask-silent-classify Inngest function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({});
  });

  describe('[BUG-697 / J-8] invalid payload handling', () => {
    // The pre-fix code called classifySilentlyEventDataSchema.parse() OUTSIDE
    // any step.run. The ZodError surfaced as a function-level throw, so
    // Inngest treated it as transient and retried 2× — burning quota on a
    // payload that would never become valid. The fix uses safeParse and
    // returns { skipped: true, reason: 'invalid_payload' } cleanly.

    it('does NOT throw when event.data is missing required fields', async () => {
      // No sessionId / profileId / classifyInput / exchangeCount — the legacy
      // .parse() path threw ZodError here. Now we expect a clean resolve.
      await expect(executeHandler({})).resolves.toBeTruthy();
    });

    it('returns skipped:true with reason:invalid_payload', async () => {
      const { result } = await executeHandler({});

      expect(result).toMatchObject({
        skipped: true,
        reason: 'invalid_payload',
      });
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('does not call classifySubject — short-circuits before any work', async () => {
      // The fix's whole point is to AVOID expensive work on a bad payload.
      // If anyone moves the safeParse below classify, this test fires.
      await executeHandler({ sessionId: 123 /* wrong type */ });

      expect(mockClassifySubject).not.toHaveBeenCalled();
      expect(mockGetStepDatabase).not.toHaveBeenCalled();
    });

    it('emits app/ask.classification_failed for observability', async () => {
      // Per global CLAUDE.md "Silent Recovery Without Escalation is Banned":
      // the safeParse-fail path must emit a structured event so the case is
      // queryable via dashboards / metrics, not buried in logger.warn.
      // ask-classification-observe.ts:38-66 is the consumer that turns this
      // event into a structured log line.
      const { sendEventCalls } = await executeHandler({
        sessionId: 'sess-1',
        // Missing the rest — partial payloads still emit best-effort sessionId.
      });

      expect(sendEventCalls).toContainEqual({
        name: 'classification-invalid-payload',
        payload: expect.objectContaining({
          name: 'app/ask.classification_failed',
          data: expect.objectContaining({
            sessionId: 'sess-1',
            error: expect.stringContaining('invalid_payload'),
          }),
        }),
      });
    });

    it('emits failure event even when sessionId itself is invalid', async () => {
      const { sendEventCalls } = await executeHandler(null);

      expect(sendEventCalls).toContainEqual({
        name: 'classification-invalid-payload',
        payload: expect.objectContaining({
          name: 'app/ask.classification_failed',
          data: expect.objectContaining({
            sessionId: undefined,
            error: expect.stringContaining('invalid_payload'),
          }),
        }),
      });
    });
  });

  describe('[BUG-845 / F-SVC-014] idempotency dedup', () => {
    // Concurrency=1 serializes execution but does NOT prevent two events from
    // both passing the `check-existing` step before either writes. The
    // idempotency key (24h dedup window) short-circuits the second event at
    // the Inngest queue level — guaranteed at-most-once semantics for racing
    // duplicate classify events for the same session.
    it('declares idempotency key on event.data.sessionId', () => {
      const cfg = (askSilentClassify as any).opts as {
        idempotency?: string;
      };
      expect(cfg.idempotency).toBe('event.data.sessionId');
    });

    it('keeps concurrency=1 as defence-in-depth alongside idempotency', () => {
      const cfg = (askSilentClassify as any).opts as {
        concurrency?: { key?: string; limit?: number };
      };
      expect(cfg.concurrency?.key).toBe('event.data.sessionId');
      expect(cfg.concurrency?.limit).toBe(1);
    });
  });

  describe('valid payload — happy path proxies', () => {
    // Smoke checks that the safeParse fix did not regress the happy path —
    // a fully-valid payload must still pass through to classifySubject.
    it('invokes classifySubject when payload validates', async () => {
      mockClassifySubject.mockResolvedValue({ candidates: [] });
      mockGetStepDatabase.mockReturnValue({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => [{ metadata: {} }] }),
          }),
        }),
      });

      await executeHandler({
        sessionId: TEST_SESSION_ID,
        profileId: TEST_PROFILE_ID,
        classifyInput: 'photosynthesis basics',
        exchangeCount: 1,
      });

      expect(mockClassifySubject).toHaveBeenCalled();
    });
  });
});
