/**
 * Break tests for OutboxDrainProvider bugs #540, #541, #542.
 *
 * Strategy:
 * - Real message-outbox with the AsyncStorage mock from test-setup.ts (no gc1 issue).
 * - Fake XHR replacing global.XMLHttpRequest (same technique as sse.test.ts) so
 *   streamSSEViaXHR is exercised for real — no internal mock of the sse module.
 * - useProfile, useApiClient, getApiUrl, Sentry are mocked (gc1-allow below).
 */

import { render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueue } from '../lib/message-outbox';

import { OutboxDrainProvider } from './OutboxDrainProvider';
import { useProfile } from '../lib/profile';
import { useApiClient } from '../lib/api-client';

// gc1-allow: useProfile drives the entire provider behaviour; the real
// implementation pulls in Clerk, SecureStore, QueryClient, and full profile
// state machine — instantiating that tree here would exercise auth/storage
// internals unrelated to the three outbox bugs under test.
jest.mock('../lib/profile', () => ({
  useProfile: jest.fn(),
}));

// gc1-allow: useApiClient, getProxyMode, withIdempotencyKey are Hono-RPC
// wrappers; building a real client requires a running Hono server.  The
// provider only calls client.support['outbox-spillover'].$post for escalation,
// which is exercised through postToSupport and is irrelevant to these 3 bugs.
jest.mock('../lib/api-client', () => ({
  useApiClient: jest.fn(),
  getProxyMode: jest.fn().mockReturnValue(false),
  withIdempotencyKey: jest.fn(
    (headers: Record<string, string>, key: string) => ({
      ...headers,
      'Idempotency-Key': key,
    }),
  ),
}));

// gc1-allow: getApiUrl is a thin env-var reader; real implementation reads
// EXPO_PUBLIC_API_URL from the environment, which is not set in Jest.
jest.mock('../lib/api', () => ({
  getApiUrl: jest.fn().mockReturnValue('http://localhost:8787'),
}));

// gc1-allow: Sentry.captureException is a side-effect sink; its real
// implementation imports native sentry modules that fail in Jest.
// The @sentry/react-native global mock in test-setup.ts does not cover
// the local re-export at lib/sentry.ts.
jest.mock('../lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Fake XHR helpers (mirrors pattern from sse.test.ts)
// ---------------------------------------------------------------------------

interface FakeXhrInstance {
  open: jest.Mock;
  send: jest.Mock;
  setRequestHeader: jest.Mock;
  abort: jest.Mock;
  onreadystatechange: (() => void) | null;
  onprogress: (() => void) | null;
  onerror: (() => void) | null;
  onloadend: (() => void) | null;
  readyState: number;
  status: number;
  statusText: string;
  responseText: string;
  responseType: string;
  getResponseHeader: jest.Mock;
  /** Capture every request header set on this instance. */
  _headers: Record<string, string>;
  _emitProgress(text: string): void;
  _emitDoneEvent(): void;
  _emitReplay(): void;
  _emitLoadend(status: number, body?: string): void;
}

let _xhrInstances: FakeXhrInstance[] = [];

function installFakeXhr(): () => FakeXhrInstance[] {
  _xhrInstances = [];

  const OriginalXHR = (global as unknown as { XMLHttpRequest?: unknown })
    .XMLHttpRequest;

  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = jest.fn(
    () => {
      const instance: FakeXhrInstance = {
        open: jest.fn(),
        send: jest.fn(),
        setRequestHeader: jest.fn((key: string, value: string) => {
          instance._headers[key] = value;
        }),
        abort: jest.fn(() => {
          // When abort is called, fire onloadend with status 0 to terminate the
          // generator cleanly (mirrors real XHR behaviour on abort).
          if (!instance.onloadend) return;
          instance.status = 0;
          instance.readyState = 4;
          instance.onloadend();
        }),
        onreadystatechange: null,
        onprogress: null,
        onerror: null,
        onloadend: null,
        readyState: 0,
        status: 0,
        statusText: '',
        responseText: '',
        responseType: '',
        getResponseHeader: jest.fn().mockReturnValue(null),
        _headers: {},
        _emitProgress(text: string) {
          this.responseText += text;
          this.onprogress?.();
        },
        _emitDoneEvent() {
          const payload = JSON.stringify({
            type: 'done',
            exchangeCount: 1,
            escalationRung: 1,
          });
          this._emitProgress(`data: ${payload}\n\n`);
        },
        _emitReplay() {
          this.readyState = 4;
          this.status = 200;
          this.getResponseHeader = jest.fn().mockReturnValue('true'); // Idempotency-Replay: true
          const body = JSON.stringify({
            replayed: true,
            clientId: 'c1',
            status: 'persisted',
            assistantTurnReady: true,
            latestExchangeId: null,
          });
          this.responseText = body;
          this.onloadend?.();
        },
        _emitLoadend(status: number, body = '') {
          this.readyState = 4;
          this.status = status;
          this.responseText = body;
          this.onloadend?.();
        },
      };
      _xhrInstances.push(instance);
      return instance;
    },
  ) as unknown;

  return () => _xhrInstances;

  void OriginalXHR; // restored in afterEach
}

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

function makeProfile(id: string) {
  return {
    id,
    displayName: id,
    role: 'owner' as const,
  };
}

function setupMocks(profileId: string) {
  (useProfile as jest.Mock).mockReturnValue({
    activeProfile: makeProfile(profileId),
  });
  const mockPost = jest.fn().mockResolvedValue({ ok: true });
  (useApiClient as jest.Mock).mockReturnValue({
    support: { 'outbox-spillover': { $post: mockPost } },
  });
  return { mockPost };
}

// Kept for parity with the implementation file's renderProvider helper, but
// the tests below inline render() so the JSX fragment can be customised per
// scenario. Suppress unused-symbol noise with a no-op reference.
function _renderProvider(profileId: string) {
  setupMocks(profileId);
  return render(
    <OutboxDrainProvider>
      <></>
    </OutboxDrainProvider>,
  );
}
void _renderProvider;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OutboxDrainProvider', () => {
  let originalXhr: unknown;
  let getXhrInstances: () => FakeXhrInstance[];

  beforeEach(async () => {
    originalXhr = (global as unknown as { XMLHttpRequest?: unknown })
      .XMLHttpRequest;
    getXhrInstances = installFakeXhr();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest =
      originalXhr;
  });

  // -------------------------------------------------------------------------
  // #540 — X-Profile-Id header must be snapshotted at drain-start
  // -------------------------------------------------------------------------

  describe('[#540] X-Profile-Id header is snapshotted at drain-start', () => {
    it('uses the profileId that was active when drain started, not the one at header-build time', async () => {
      // Arrange: enqueue a session entry for profile-A.
      await enqueue({
        profileId: 'profile-A',
        flow: 'session',
        surfaceKey: 'session-1',
        content: 'hello',
        metadata: { sessionId: 'session-1' },
      });

      setupMocks('profile-A');

      render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      // Wait for the XHR to be created.
      await waitFor(() => expect(getXhrInstances().length).toBeGreaterThan(0));

      const xhr = getXhrInstances()[0]!;

      // X-Profile-Id must match the snapshotted profile-A, not any future change.
      expect(xhr._headers['X-Profile-Id']).toBe('profile-A');

      // Verify the header is set — it was previously read from the closure and
      // could be stale. The fix passes snapshotProfileId explicitly.
      expect(xhr.setRequestHeader).toHaveBeenCalledWith(
        'X-Profile-Id',
        'profile-A',
      );

      // Clean up: emit a done so the drain completes.
      await act(async () => {
        xhr._emitDoneEvent();
        xhr._emitLoadend(200);
      });
    });

    it('does not silently use undefined for X-Profile-Id when profile is present', async () => {
      await enqueue({
        profileId: 'profile-B',
        flow: 'session',
        surfaceKey: 'session-2',
        content: 'test',
        metadata: { sessionId: 'session-2' },
      });

      setupMocks('profile-B');

      render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      await waitFor(() => expect(getXhrInstances().length).toBeGreaterThan(0));

      const xhr = getXhrInstances()[0]!;

      // The header must always be set — never absent or empty.
      expect(xhr._headers['X-Profile-Id']).toBeDefined();
      expect(xhr._headers['X-Profile-Id']).not.toBe('');
      expect(xhr._headers['X-Profile-Id']).toBe('profile-B');

      await act(async () => {
        xhr._emitDoneEvent();
        xhr._emitLoadend(200);
      });
    });
  });

  // -------------------------------------------------------------------------
  // #541 — abort on unmount
  // -------------------------------------------------------------------------

  describe('[#541] SSE stream is aborted on unmount', () => {
    it('calls abort() on the in-flight XHR when the provider unmounts mid-drain', async () => {
      await enqueue({
        profileId: 'profile-C',
        flow: 'session',
        surfaceKey: 'session-3',
        content: 'hello',
        metadata: { sessionId: 'session-3' },
      });

      setupMocks('profile-C');

      const { unmount } = render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      // Wait for XHR to be created and the drain to be in-flight.
      await waitFor(() => expect(getXhrInstances().length).toBeGreaterThan(0));

      const xhr = getXhrInstances()[0]!;
      expect(xhr.abort).not.toHaveBeenCalled();

      // Unmount the provider — should abort the in-flight XHR immediately.
      await act(async () => {
        unmount();
      });

      // The XHR must have been aborted, not left running until the 45s idle timer.
      expect(xhr.abort).toHaveBeenCalledTimes(1);
    });

    it('does not throw or leave orphaned XHRs when unmounting with no active drain', async () => {
      // No entries in the outbox — provider renders and has nothing to drain.
      setupMocks('profile-D');

      const { unmount } = render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      // No XHR should have been created since the outbox is empty.
      expect(getXhrInstances()).toHaveLength(0);

      // Unmounting should be a no-op (no throw, no abort calls).
      await act(async () => {
        unmount();
      });

      // Still no XHR instances created.
      expect(getXhrInstances()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // #542 — profile change mid-drain: cancellation + new drain for new profile
  // -------------------------------------------------------------------------

  describe('[#542] Profile change mid-drain cancels old drain and starts new one', () => {
    it('aborts the in-flight XHR when the profile changes mid-drain', async () => {
      // Enqueue for profile-E.
      await enqueue({
        profileId: 'profile-E',
        flow: 'session',
        surfaceKey: 'session-5',
        content: 'hello',
        metadata: { sessionId: 'session-5' },
      });

      setupMocks('profile-E');

      const { rerender } = render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      // Wait for profile-E's XHR to be created.
      await waitFor(() => expect(getXhrInstances().length).toBeGreaterThan(0));

      const xhrE = getXhrInstances()[0]!;
      expect(xhrE._headers['X-Profile-Id']).toBe('profile-E');
      expect(xhrE.abort).not.toHaveBeenCalled();

      // Switch to profile-F mid-drain.
      (useProfile as jest.Mock).mockReturnValue({
        activeProfile: makeProfile('profile-F'),
      });

      await act(async () => {
        rerender(
          <OutboxDrainProvider>
            <></>
          </OutboxDrainProvider>,
        );
      });

      // The old XHR for profile-E must have been aborted.
      expect(xhrE.abort).toHaveBeenCalledTimes(1);
    });

    it('runDrain for the new profile can start after profile change', async () => {
      // Enqueue an entry for profile-F so the new drain has work to do.
      await enqueue({
        profileId: 'profile-F',
        flow: 'session',
        surfaceKey: 'session-6',
        content: 'hello',
        metadata: { sessionId: 'session-6' },
      });

      // Also enqueue for profile-G (long-running drain to block the lock).
      await enqueue({
        profileId: 'profile-G',
        flow: 'session',
        surfaceKey: 'session-7',
        content: 'hello',
        metadata: { sessionId: 'session-7' },
      });

      // Start with profile-G.
      (useProfile as jest.Mock).mockReturnValue({
        activeProfile: makeProfile('profile-G'),
      });
      (useApiClient as jest.Mock).mockReturnValue({
        support: {
          'outbox-spillover': {
            $post: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      });

      const { rerender } = render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      // Wait for profile-G's XHR to be active.
      await waitFor(() => expect(getXhrInstances().length).toBeGreaterThan(0));

      const xhrG = getXhrInstances()[0]!;
      expect(xhrG._headers['X-Profile-Id']).toBe('profile-G');

      // Switch to profile-F.
      (useProfile as jest.Mock).mockReturnValue({
        activeProfile: makeProfile('profile-F'),
      });

      await act(async () => {
        rerender(
          <OutboxDrainProvider>
            <></>
          </OutboxDrainProvider>,
        );
      });

      // profile-G XHR aborted.
      expect(xhrG.abort).toHaveBeenCalledTimes(1);

      // Wait for profile-F's drain to start (a new XHR should be created).
      await waitFor(() =>
        expect(getXhrInstances().length).toBeGreaterThanOrEqual(2),
      );

      const xhrF = getXhrInstances()[1]!;
      // The new drain must use profile-F's id — not the old profile-G.
      expect(xhrF._headers['X-Profile-Id']).toBe('profile-F');

      // Complete profile-F's drain cleanly.
      await act(async () => {
        xhrF._emitDoneEvent();
        xhrF._emitLoadend(200);
      });
    });

    it('in-flight requests carry the snapshotted profileId, not the new profile after switch', async () => {
      // This is the cross-profile data-safety invariant:
      // any request that started for profile-H must never send X-Profile-Id: profile-I.
      await enqueue({
        profileId: 'profile-H',
        flow: 'session',
        surfaceKey: 'session-8',
        content: 'hi',
        metadata: { sessionId: 'session-8' },
      });

      (useProfile as jest.Mock).mockReturnValue({
        activeProfile: makeProfile('profile-H'),
      });
      (useApiClient as jest.Mock).mockReturnValue({
        support: {
          'outbox-spillover': {
            $post: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      });

      const { rerender } = render(
        <OutboxDrainProvider>
          <></>
        </OutboxDrainProvider>,
      );

      await waitFor(() => expect(getXhrInstances().length).toBeGreaterThan(0));

      const xhrH = getXhrInstances()[0]!;

      // The header was already set when the XHR was opened — it must be H's id.
      expect(xhrH._headers['X-Profile-Id']).toBe('profile-H');

      // Now switch to profile-I (profile-H's drain is still in-flight).
      (useProfile as jest.Mock).mockReturnValue({
        activeProfile: makeProfile('profile-I'),
      });

      await act(async () => {
        rerender(
          <OutboxDrainProvider>
            <></>
          </OutboxDrainProvider>,
        );
      });

      // The X-Profile-Id on the already-opened XHR must still be profile-H.
      // (Headers are set at request construction time — the fix snapshotted the
      // id before any profile change could intervene.)
      expect(xhrH._headers['X-Profile-Id']).toBe('profile-H');
      expect(xhrH._headers['X-Profile-Id']).not.toBe('profile-I');

      // The old XHR must be aborted (not left running under the new profile's session).
      expect(xhrH.abort).toHaveBeenCalledTimes(1);
    });
  });
});
