import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';

import { useEmailReconciliation } from './use-email-reconciliation';

// Clerk is an external boundary (bare specifier — not an internal mock).
const mockUseUser = jest.fn();
jest.mock('@clerk/expo', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

type FetchCall = { url: string; method: string; body: unknown };

function installFetch(serverEmail: string | { status: number }): {
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  globalThis.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });

      if (url.includes('/account/email') && method === 'GET') {
        if (typeof serverEmail === 'object') {
          return new Response('forbidden', { status: serverEmail.status });
        }
        return new Response(JSON.stringify({ email: serverEmail }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/account/email') && method === 'PATCH') {
        return new Response(JSON.stringify({ email: 'new@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    },
  ) as unknown as typeof fetch;
  return { calls };
}

function setClerkPrimary(email: string | null): void {
  mockUseUser.mockReturnValue({
    isLoaded: true,
    user: email
      ? { id: 'user_1', primaryEmailAddress: { emailAddress: email } }
      : { id: 'user_1', primaryEmailAddress: null },
  });
}

describe('useEmailReconciliation [CRITICAL-1]', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('re-fires the sync with the Clerk primary when the server email diverges', async () => {
    setClerkPrimary('new@example.com');
    const { calls } = installFetch('old@example.com');

    renderHook(() => useEmailReconciliation(true));

    await waitFor(() => {
      const patch = calls.find(
        (c) => c.url.includes('/account/email') && c.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(patch?.body).toEqual({ email: 'new@example.com' });
    });
  });

  it('does NOT re-fire when the server email already matches Clerk', async () => {
    setClerkPrimary('same@example.com');
    const { calls } = installFetch('same@example.com');

    renderHook(() => useEmailReconciliation(true));

    await waitFor(() => {
      expect(
        calls.find(
          (c) => c.method === 'GET' && c.url.includes('/account/email'),
        ),
      ).toBeDefined();
    });
    expect(
      calls.find(
        (c) => c.method === 'PATCH' && c.url.includes('/account/email'),
      ),
    ).toBeUndefined();
  });

  it('does nothing when disabled (non-owner surface)', async () => {
    setClerkPrimary('new@example.com');
    const { calls } = installFetch('old@example.com');

    renderHook(() => useEmailReconciliation(false));

    // Give any stray async work a tick; the hook must not touch the network.
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });

  it('stays silent (no PATCH) when the server rejects the read', async () => {
    setClerkPrimary('new@example.com');
    const { calls } = installFetch({ status: 403 });

    renderHook(() => useEmailReconciliation(true));

    await waitFor(() => {
      expect(
        calls.find(
          (c) => c.method === 'GET' && c.url.includes('/account/email'),
        ),
      ).toBeDefined();
    });
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
  });

  it('captures to Sentry when the sync throws, without disrupting the UI', async () => {
    jest.useFakeTimers();
    try {
      setClerkPrimary('new@example.com');
      const failure = new Error('network down');
      globalThis.fetch = jest.fn(async () => {
        throw failure;
      }) as unknown as typeof fetch;

      renderHook(() => useEmailReconciliation(true));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(7_500);
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(5);
      // The api-client middleware classifies the raw fetch failure into the
      // typed NetworkError before the hook's catch — assert the classified
      // error reaches Sentry with the queryable feature tag.
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'NetworkError' }),
        expect.objectContaining({
          tags: expect.objectContaining({ feature: 'email_reconciliation' }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
