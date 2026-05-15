// ---------------------------------------------------------------------------
// Ask Classification Observability handlers — Tests (BUG-836 / F-SVC-002)
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: observability test isolates Sentry */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

const consoleLogSpy = jest
  .spyOn(console, 'log')
  .mockImplementation(() => undefined);
const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../client'),
  ...mockInngestTransport.module,
})); // gc1-allow: inngest framework boundary

import {
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
} from './ask-classification-observe';

beforeEach(() => {
  consoleLogSpy.mockClear();
  consoleErrorSpy.mockClear();
  mockCaptureException.mockClear();
  mockInngestTransport.clear();
});

afterAll(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

async function invoke<T extends Record<string, unknown>>(
  handler: unknown,
  data: T,
) {
  const fn = ((handler as { fn?: unknown }).fn ?? handler) as (args: {
    event: { data: T };
  }) => Promise<unknown>;
  return fn({ event: { data } });
}

function lastJsonLine(spy: jest.SpyInstance): Record<string, unknown> | null {
  const last = spy.mock.calls.at(-1)?.[0];
  if (typeof last !== 'string') return null;
  try {
    return JSON.parse(last) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe('ask classification observe handlers (BUG-836 / F-SVC-002)', () => {
  describe('completed', () => {
    it('listens to app/ask.classification_completed', () => {
      const trigger = (
        askClassificationCompletedObserve as { trigger?: unknown }
      ).trigger;
      expect(trigger).toEqual({ event: 'app/ask.classification_completed' });
    });

    it('returns logged status and structured info log', async () => {
      const result = await invoke(askClassificationCompletedObserve, {
        sessionId: 'sess-1',
        exchangeCount: 3,
        subjectId: 'sub-1',
        subjectName: 'Math',
        confidence: 0.92,
      });

      expect(result).toMatchObject({
        status: 'logged',
        sessionId: 'sess-1',
        analyticsDeferred: 'pending_classification_analytics_pipeline',
      });
      const entry = lastJsonLine(consoleLogSpy);
      expect(entry?.message).toBe('ask.classification_completed.received');
      expect(entry?.level).toBe('info');
      expect(entry?.context).toMatchObject({
        sessionId: 'sess-1',
        subjectId: 'sub-1',
        subjectName: 'Math',
        confidence: 0.92,
      });
    });
  });

  describe('skipped', () => {
    it('listens to app/ask.classification_skipped', () => {
      const trigger = (askClassificationSkippedObserve as { trigger?: unknown })
        .trigger;
      expect(trigger).toEqual({ event: 'app/ask.classification_skipped' });
    });

    it('returns logged status and structured info log', async () => {
      const result = await invoke(askClassificationSkippedObserve, {
        sessionId: 'sess-2',
        exchangeCount: 1,
        reason: 'below_threshold',
        topConfidence: 0.4,
      });

      expect(result).toMatchObject({
        status: 'logged',
        sessionId: 'sess-2',
        reason: 'below_threshold',
        analyticsDeferred: 'pending_classification_analytics_pipeline',
      });
      const entry = lastJsonLine(consoleLogSpy);
      expect(entry?.message).toBe('ask.classification_skipped.received');
      expect(entry?.context).toMatchObject({
        reason: 'below_threshold',
        topConfidence: 0.4,
      });
    });
  });

  describe('failed', () => {
    it('listens to app/ask.classification_failed', () => {
      const trigger = (askClassificationFailedObserve as { trigger?: unknown })
        .trigger;
      expect(trigger).toEqual({ event: 'app/ask.classification_failed' });
    });

    // [BREAK] The _failed event is the onFailure escalation channel for the
    // ask-silent-classify function. Without this consumer, terminal failures
    // vanish — the bug's most consequential symptom. Pin error-level so a
    // future logger refactor can't downgrade the signal.
    it('[BREAK] emits an error-level structured log so terminal failures are queryable', async () => {
      const result = await invoke(askClassificationFailedObserve, {
        sessionId: 'sess-3',
        exchangeCount: 7,
        error: 'classifySubject threw: timeout',
      });

      expect(result).toMatchObject({
        status: 'logged',
        sessionId: 'sess-3',
        error: 'classifySubject threw: timeout',
        escalationDeferred: 'pending_classification_failure_alerting',
      });
      const entry = lastJsonLine(consoleErrorSpy);
      expect(entry?.message).toBe('ask.classification_failed.received');
      expect(entry?.level).toBe('error');
      expect(entry?.context).toMatchObject({
        sessionId: 'sess-3',
        exchangeCount: 7,
        error: 'classifySubject threw: timeout',
      });
    });
  });

  describe('malformed payload handling [CCR-PR126-NEW-2]', () => {
    it('completed: returns skipped on non-object payload without throwing', async () => {
      const result = await invoke(askClassificationCompletedObserve, {
        sessionId: 123,
        exchangeCount: 'not-a-number',
      });
      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'invalid_payload',
      });
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('invalid event payload'),
        }),
        expect.objectContaining({ extra: expect.any(Object) }),
      );
    });

    it('skipped: returns skipped on wrong-type fields without throwing', async () => {
      const result = await invoke(askClassificationSkippedObserve, {
        sessionId: { nested: true },
        reason: 999,
      });
      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'invalid_payload',
      });
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('failed: returns skipped on wrong-type fields without throwing', async () => {
      const result = await invoke(askClassificationFailedObserve, {
        sessionId: [],
        error: 42,
      });
      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'invalid_payload',
      });
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('all handlers accept empty object gracefully (all fields optional)', async () => {
      const completed = await invoke(askClassificationCompletedObserve, {});
      expect(completed).toMatchObject({ status: 'logged' });

      const skipped = await invoke(askClassificationSkippedObserve, {});
      expect(skipped).toMatchObject({ status: 'logged' });

      const failed = await invoke(askClassificationFailedObserve, {});
      expect(failed).toMatchObject({ status: 'logged' });
    });
  });
});
