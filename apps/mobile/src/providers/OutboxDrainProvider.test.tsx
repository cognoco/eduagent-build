/**
 * Break tests for OutboxDrainProvider bugs #540, #541, #542.
 *
 * Strategy:
 * - Real message-outbox with the AsyncStorage mock from test-setup.ts.
 * - Real api-client + getApiUrl: Clerk's useAuth is globally mocked in
 *   test-setup, and importing screen-render sets EXPO_PUBLIC_API_URL, so the
 *   real Hono client and URL resolver run. The provider's escalation $post
 *   resolves against the routed mock fetch installed below (default 200).
 * - Fake XHR replacing global.XMLHttpRequest (same technique as sse.test.ts) so
 *   streamSSEViaXHR is exercised for real — no internal mock of the sse module.
 * - useProfile is mocked as a per-render control surface: the bug scenarios
 *   switch the active profile mid-drain while the provider stays mounted, which
 *   a static ProfileContext wrapper cannot express (rerender keeps the wrapper
 *   value fixed). KEEP.
 * - lib/sentry is the local re-export of the external @sentry/react-native
 *   boundary (mocked globally in test-setup); mocked here so addBreadcrumb /
 *   captureException are observable. KEEP.
 */

import { render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Importing screen-render sets EXPO_PUBLIC_API_URL so the real getApiUrl()
// returns a usable base URL for the provider's XHR/Hono calls.
import { createRoutedMockFetch } from '../test-utils/screen-render';
import { enqueue } from '../lib/message-outbox';

import { OutboxDrainProvider } from './OutboxDrainProvider';
import { useProfile } from '../lib/profile';
import { Sentry } from '../lib/sentry';

// gc1-allow: useProfile is a per-render control surface here. The bug scenarios
// switch the active profile mid-drain while the provider stays mounted; a
// static ProfileContext wrapper cannot change its value across rerender, so the
// real provider would never see the switch the tests assert on.
// prettier-ignore
jest.mock('../lib/profile', () => ({ // gc1-allow: mid-drain profile-switch control surface
  ...jest.requireActual('../lib/profile'),
  useProfile: jest.fn(),
}));

// gc1-allow: Sentry.captureException / addBreadcrumb are side-effect sinks;
// the real implementation imports native sentry modules that fail in Jest.
// The @sentry/react-native global mock in test-setup.ts does not cover
// the local re-export at lib/sentry.ts.
// prettier-ignore
jest.mock('../lib/sentry', () => ({ // gc1-allow: native Sentry
  Sentry: { captureException: jest.fn(), addBreadcrumb: jest.fn() },
}));

let prevFetch: typeof globalThis.fetch;

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
}

// Kept for parity with the implementation file's renderProvider helper, but
// the tests below inline render() so the JSX fragment can be customised per
// scenario. Suppress unused-symbol noise with a no-op reference.
function _renderProvider(profileId: string) {
  setupMocks(profileId);
  return render(<OutboxDrainProvider>{null}</OutboxDrainProvider>);
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
    // Route the real api-client's escalation $post through a default-200 mock
    // fetch so the Hono client resolves without a live server.
    prevFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      createRoutedMockFetch() as unknown as typeof fetch;
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest =
      originalXhr;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
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

      render(<OutboxDrainProvider>{null}</OutboxDrainProvider>);

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

      render(<OutboxDrainProvider>{null}</OutboxDrainProvider>);

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
        <OutboxDrainProvider>{null}</OutboxDrainProvider>,
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
        <OutboxDrainProvider>{null}</OutboxDrainProvider>,
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
        <OutboxDrainProvider>{null}</OutboxDrainProvider>,
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
        rerender(<OutboxDrainProvider>{null}</OutboxDrainProvider>);
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

      const { rerender } = render(
        <OutboxDrainProvider>{null}</OutboxDrainProvider>,
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
        rerender(<OutboxDrainProvider>{null}</OutboxDrainProvider>);
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

    it('adds a Sentry breadcrumb when drain is skipped due to missing activeProfile (CR-2026-05-21-152)', async () => {
      // Arrange: no active profile (simulates mid-sign-out race).
      (useProfile as jest.Mock).mockReturnValue({ activeProfile: undefined });

      render(<OutboxDrainProvider>{null}</OutboxDrainProvider>);

      // No XHR should be opened — the guard must return early.
      expect(getXhrInstances()).toHaveLength(0);

      // The breadcrumb must be emitted so the skip is observable in Sentry.
      await waitFor(() =>
        expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
          expect.objectContaining({
            category: 'outbox',
            level: 'info',
            message: 'drain skipped — no activeProfile',
          }),
        ),
      );
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

      const { rerender } = render(
        <OutboxDrainProvider>{null}</OutboxDrainProvider>,
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
        rerender(<OutboxDrainProvider>{null}</OutboxDrainProvider>);
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
