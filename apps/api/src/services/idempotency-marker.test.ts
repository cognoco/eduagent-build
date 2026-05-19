// ---------------------------------------------------------------------------
// Idempotency Marker — Tests
// [BUG-107] Verifies the Inngest dispatch on KV write failure goes through
// safeSend (which captures dispatch failures to Sentry) rather than the
// previous bare inngest.send().catch(() => {}) silent-swallow.
// ---------------------------------------------------------------------------

// KVNamespace is a Cloudflare Workers type absent from tsconfig.spec.json.
// Use a structural stand-in so the mock compiles without importing @cloudflare/workers-types.

type KVNamespace = any;

const mockInngestSend = jest.fn();
jest.mock(
  '../inngest/client' /* gc1-allow: external boundary — Inngest client */,
  () => {
    const actual = jest.requireActual(
      '../inngest/client',
    ) as typeof import('../inngest/client');
    return {
      ...actual,
      inngest: {
        send: (...args: unknown[]) => mockInngestSend(...args),
      },
    };
  },
);

const mockCaptureException = jest.fn();
jest.mock('./sentry' /* gc1-allow: external boundary — Sentry */, () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    addBreadcrumb: jest.fn(),
  };
});

import { markPersisted } from './idempotency-marker';

beforeEach(() => {
  jest.clearAllMocks();
  mockInngestSend.mockResolvedValue(undefined);
});

function makeKV(putImpl: (...args: unknown[]) => Promise<void>): KVNamespace {
  return {
    put: jest.fn(putImpl),
    get: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    getWithMetadata: jest.fn(),
  } as unknown as KVNamespace;
}

describe('markPersisted', () => {
  it('writes to KV on the happy path with TTL', async () => {
    const put = jest.fn().mockResolvedValue(undefined);
    const kv = {
      put,
      get: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      getWithMetadata: jest.fn(),
    } as unknown as KVNamespace;

    await markPersisted({
      kv,
      profileId: 'profile-1',
      flow: 'session',
      key: 'idem-key-1',
    });

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      'idem:profile-1:session:idem-key-1',
      '1',
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('skips silently when key is undefined', async () => {
    const put = jest.fn();
    const kv = {
      put,
      get: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      getWithMetadata: jest.fn(),
    } as unknown as KVNamespace;

    await markPersisted({
      kv,
      profileId: 'profile-1',
      flow: 'session',
      key: undefined,
    });

    expect(put).not.toHaveBeenCalled();
  });

  it('skips silently when profileId is missing', async () => {
    const put = jest.fn();
    const kv = {
      put,
      get: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      getWithMetadata: jest.fn(),
    } as unknown as KVNamespace;

    await markPersisted({
      kv,
      profileId: undefined,
      flow: 'session',
      key: 'idem-key-1',
    });

    expect(put).not.toHaveBeenCalled();
  });

  describe('[BUG-107] KV write failure escalation', () => {
    it('escalates to Sentry via safeSend, NOT a silent .catch(() => {})', async () => {
      // KV write fails — the recovery path used to fire-and-forget an Inngest
      // event with .catch(() => {}). If THAT dispatch also failed, the entire
      // signal evaporated and there was no way to query the failure rate.
      const kvErr = new Error('KV unavailable');
      const kv = makeKV(async () => {
        throw kvErr;
      });

      await markPersisted({
        kv,
        profileId: 'profile-1',
        flow: 'session',
        key: 'idem-key-1',
      });

      // The KV failure itself is captured to Sentry (existing behavior).
      expect(mockCaptureException).toHaveBeenCalledWith(
        kvErr,
        expect.objectContaining({
          profileId: 'profile-1',
          extra: expect.objectContaining({
            context: 'idempotency.markPersisted',
          }),
        }),
      );
      // And the Inngest dispatch was awaited (safeSend awaits, then handles
      // any rejection internally). The send must be called with the right name.
      expect(mockInngestSend).toHaveBeenCalledTimes(1);
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/idempotency.mark_failed',
        data: { profileId: 'profile-1', flow: 'session' },
      });
    });

    it('does NOT throw to the caller when BOTH the KV write and the Inngest dispatch fail', async () => {
      // Break test for the regression: previously the dispatch failure was
      // swallowed by .catch(() => {}) so this test would pass either way.
      // With safeSend, the dispatch failure is captured to Sentry under the
      // `non-core-send` kind — observable in telemetry. The caller still
      // returns cleanly.
      const kv = makeKV(async () => {
        throw new Error('KV outage');
      });
      mockInngestSend.mockRejectedValueOnce(new Error('Inngest outage'));

      // Must not throw.
      await expect(
        markPersisted({
          kv,
          profileId: 'profile-2',
          flow: 'session',
          key: 'idem-key-2',
        }),
      ).resolves.toBeUndefined();

      // captureException was called for the KV failure AND for the Inngest
      // dispatch failure (the second call carries the safeSend `surface` and
      // `kind: 'non-core-send'` metadata, distinguishing it from the KV one).
      const safeSendCapture = mockCaptureException.mock.calls.find(
        (call) =>
          call[1]?.extra?.kind === 'non-core-send' &&
          call[1]?.extra?.surface === 'idempotency.mark_failed',
      );
      expect(safeSendCapture).toBeDefined();
    });
  });
});
