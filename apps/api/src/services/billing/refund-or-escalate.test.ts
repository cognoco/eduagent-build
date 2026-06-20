// [BUG-821] Unit tests for refundQuotaOrEscalate — the gate that previously
// silently dropped the quota refund when a decrement had happened but
// subscriptionId was missing (trial users, edge-cached responses, future
// free-tier bypass). Silent recovery in billing code is banned (AGENTS.md);
// the missing-subscription skip MUST escalate to Sentry + structured log.
//
// Sentry and the logger are true external observability boundaries — the only
// modules mocked here, via the sanctioned requireActual spread pattern.

const mockCaptureException = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../sentry' /* gc1-allow: Sentry observability boundary */, () => {
  const actual = jest.requireActual('../sentry') as typeof import('../sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

jest.mock('../logger' /* gc1-allow: logger observability boundary */, () => {
  const actual = jest.requireActual('../logger') as typeof import('../logger');
  return {
    ...actual,
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: (...args: unknown[]) => mockLoggerError(...args),
    }),
  };
});

import type { Database } from '@eduagent/database';
import { refundQuotaOrEscalate } from './metering';

const SKIP_TAG = 'quota.refund.skipped_no_subscription';

function getSkipCalls() {
  return mockCaptureException.mock.calls.filter(
    (call) =>
      (call[1] as { tags?: { surface?: string } } | undefined)?.tags
        ?.surface === SKIP_TAG,
  );
}

describe('refundQuotaOrEscalate [BUG-821]', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockLoggerError.mockClear();
  });

  it('escalates when a decrement happened but subscriptionId is missing', async () => {
    // A decrement occurred (source set by metering middleware) yet no
    // subscriptionId reached the refund site — the exact BUG-821 condition.
    // No DB access happens on this path, so a stub db is never touched.
    const db = {} as unknown as Database;

    const result = await refundQuotaOrEscalate(db, undefined, {
      route: 'sessions.message',
      profileId: 'profile-123',
      source: 'monthly',
    });

    expect(result).toEqual({ refunded: false });

    const skipCalls = getSkipCalls();
    expect(skipCalls).toHaveLength(1);
    expect(skipCalls[0]?.[1]).toMatchObject({
      profileId: 'profile-123',
      tags: { surface: SKIP_TAG },
      extra: {
        context: SKIP_TAG,
        route: 'sessions.message',
        source: 'monthly',
      },
    });

    // Structured log accompanies the Sentry escalation (not console.warn alone).
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it('escalates for a top_up decrement with no subscriptionId', async () => {
    const db = {} as unknown as Database;

    await refundQuotaOrEscalate(db, undefined, {
      route: 'sessions.stream.llm_error',
      profileId: 'profile-abc',
      sessionId: 'session-xyz',
      source: 'top_up',
    });

    const skipCalls = getSkipCalls();
    expect(skipCalls).toHaveLength(1);
    expect(skipCalls[0]?.[1]).toMatchObject({
      extra: { sessionId: 'session-xyz', source: 'top_up' },
    });
  });

  it('does NOT escalate when no decrement happened (no source) and no subscriptionId', async () => {
    const db = {} as unknown as Database;

    const result = await refundQuotaOrEscalate(db, undefined, {
      route: 'sessions.message',
      profileId: 'profile-123',
      // source omitted: middleware never decremented, so nothing to refund.
    });

    expect(result).toEqual({ refunded: false });
    expect(getSkipCalls()).toHaveLength(0);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('delegates to safeRefundQuota when subscriptionId is present (no skip escalation)', async () => {
    // Force the real safeRefundQuota path to run by making incrementQuota throw
    // (the stub db has no .transaction). safeRefundQuota catches and escalates
    // under its OWN tag — proving we delegated rather than emitting the
    // skip-no-subscription escalation.
    const db = {} as unknown as Database;

    const result = await refundQuotaOrEscalate(db, 'sub-1', {
      route: 'sessions.message',
      profileId: 'profile-123',
      source: 'monthly',
    });

    expect(result).toEqual({ refunded: false });
    // The defining assertion: the missing-subscription escalation must NOT fire.
    expect(getSkipCalls()).toHaveLength(0);
  });
});
