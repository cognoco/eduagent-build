import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { QueryClient } from '@tanstack/react-query';

import * as SecureStore from '../lib/secure-storage';
import { platformAlert } from '../lib/platform-alert';
import { setActiveProfileId } from '../lib/api-client';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { usePostSessionNotificationAsk } from './use-post-session-notification-ask';

jest.mock(
  '../lib/platform-alert' /* gc1-allow: native-boundary; platformAlert needs native/web alert shims unavailable in this hook test */,
  () => ({
    platformAlert: jest.fn(),
  }),
);

jest.mock(
  '../lib/secure-storage' /* gc1-allow: native-boundary; secure storage needs mock-controlled per-test responses */,
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);

jest.mock(
  '../lib/sentry' /* gc1-allow: observability boundary; lib/sentry initializes native Sentry transports on import */,
  () => ({
    Sentry: { addBreadcrumb: jest.fn(), captureException: jest.fn() },
  }),
);

const mockSecureGet = SecureStore.getItemAsync as jest.Mock;
const mockSecureSet = SecureStore.setItemAsync as jest.Mock;
const mockGetPerm = Notifications.getPermissionsAsync as jest.Mock;
const mockReqPerm = Notifications.requestPermissionsAsync as jest.Mock;
const mockAlert = platformAlert as jest.Mock;

// [WI-1441] This hook now calls the real useNotificationSettings /
// useUpdateNotificationSettings (via ./use-settings) so the mutation payload
// (preserved fields + pushEnabled) is exercised end to end. GC1-clean: the
// only mocked boundary is global fetch, mirroring
// use-child-cap-notifications.test.ts.
const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

const NOTIF_PREFS = {
  reviewReminders: true,
  dailyReminders: false,
  weeklyProgressPush: false,
  weeklyProgressEmail: true,
  monthlyProgressEmail: false,
  pushEnabled: false,
  // Deliberately non-default so a sync that omits/loses maxDailyPush (and
  // gets reset to the API's hardcoded default of 3) is caught.
  maxDailyPush: 5,
  pushTokenRegistered: false,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function defaultFetchImpl(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.includes('/settings/notifications') && method === 'GET') {
    return Promise.resolve(jsonResponse({ preferences: NOTIF_PREFS }));
  }
  if (url.includes('/settings/notifications') && method === 'PUT') {
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    return Promise.resolve(
      jsonResponse({ preferences: { ...NOTIF_PREFS, ...body } }),
    );
  }
  return Promise.reject(new Error(`Unhandled fetch in test: ${method} ${url}`));
}

/** Finds the JSON body of the first PUT request to /settings/notifications. */
function findPutBody(): Record<string, unknown> | undefined {
  const putCall = mockFetch.mock.calls.find(([, init]) => {
    const reqInit = init as RequestInit | undefined;
    return reqInit?.method === 'PUT';
  });
  const body = (putCall?.[1] as RequestInit | undefined)?.body;
  return typeof body === 'string'
    ? (JSON.parse(body) as Record<string, unknown>)
    : undefined;
}

// The hook under test takes profileId as a plain argument rather than
// reading it from ProfileContext, so a single fixed active profile is enough
// to satisfy useNotificationSettings/useUpdateNotificationSettings — the
// mocked fetch responses don't vary by profile ID.
const testProfile = createTestProfile({ id: 'p1' });

let queryClient: QueryClient | undefined;

function setupWrapper() {
  const wrapped = createHookWrapper({ activeProfile: testProfile });
  queryClient = wrapped.queryClient;
  setActiveProfileId(testProfile.id);
  return wrapped.wrapper;
}

function renderPostSessionAsk(
  profileId: string | undefined,
  hasCompletedSession: boolean,
  isParentProxy: boolean,
) {
  return renderHook(
    () =>
      usePostSessionNotificationAsk(
        profileId,
        hasCompletedSession,
        isParentProxy,
      ),
    { wrapper: setupWrapper() },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSecureGet.mockResolvedValue(null);
  mockSecureSet.mockResolvedValue(undefined);
  mockGetPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  mockReqPerm.mockResolvedValue({ status: 'granted' });
  mockFetch.mockReset();
  mockFetch.mockImplementation(defaultFetchImpl);
  globalThis.fetch = mockFetch as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('usePostSessionNotificationAsk', () => {
  it('does nothing without a profileId', async () => {
    renderPostSessionAsk(undefined, true, false);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does nothing when no session has been completed', async () => {
    renderPostSessionAsk('p1', false, false);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does nothing in parent-proxy mode', async () => {
    renderPostSessionAsk('p1', true, true);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does not prompt if SecureStore says we already asked', async () => {
    mockSecureGet.mockResolvedValue('true');
    renderPostSessionAsk('p1', true, false);
    await waitFor(() => {
      expect(mockSecureGet).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  // [WI-1441 round 3] The already-granted path now also drives the
  // pushEnabled sync silently (no OS dialog), instead of marking seen
  // unconditionally — see the "silent repair" regression tests below for the
  // retry behavior when this sync fails.
  it('already-granted path silently syncs pushEnabled and marks seen without showing the OS prompt', async () => {
    mockGetPerm.mockResolvedValue({ status: 'granted', canAskAgain: true });
    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(findPutBody()).toBeDefined();
    });
    expect(findPutBody()).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      weeklyProgressPush: false,
      weeklyProgressEmail: true,
      monthlyProgressEmail: false,
      maxDailyPush: 5,
      pushEnabled: true,
    });
    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining('notificationFirstAskShown_p1'),
        'true',
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it('marks seen and skips prompt when OS has blocked re-asking', async () => {
    mockGetPerm.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });
    renderPostSessionAsk('p1', true, false);
    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining('notificationFirstAskShown_p1'),
        'true',
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it('shows primer after delay; Allow fires OS prompt and marks seen', async () => {
    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });
    expect(mockAlert).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      text: string;
      style?: string;
      onPress?: () => void;
    }>;
    const allowBtn = buttons.find((b) => b.style !== 'cancel');
    await act(async () => {
      allowBtn?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReqPerm).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining('notificationFirstAskShown_p1'),
        'true',
      );
    });
  });

  it('resets firedRef when profileId changes — second profile can prime', async () => {
    // Render with profileId=A and trigger the primer.
    const { rerender } = renderHook(
      ({ profileId }: { profileId: string }) =>
        usePostSessionNotificationAsk(profileId, true, false),
      { initialProps: { profileId: 'profile-A' }, wrapper: setupWrapper() },
    );

    // Wait for permissions check to complete for profile A.
    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalledTimes(1);
    });

    // Advance past the delay so the primer fires for profile A.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockAlert).toHaveBeenCalledTimes(1);

    // Clear mocks before testing profile B.
    jest.clearAllMocks();
    mockSecureGet.mockResolvedValue(null);
    mockSecureSet.mockResolvedValue(undefined);
    mockGetPerm.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    // Swap to profileId=B — firedRef must reset so the primer can fire again.
    rerender({ profileId: 'profile-B' });

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // The primer should fire for the new profile.
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  // [correctness High] A transient SecureStore failure must NOT permanently
  // latch the guard. The original bug set firedForProfileRef at the top of the
  // effect, so any blip on the first attempt suppressed the primer for the
  // rest of the mount. After the fix, a later re-run (e.g. i18n language
  // change re-fires the effect via the `t` dep) retries and can surface the
  // primer.
  it('retries the primer after a transient SecureStore failure (guard not latched on the same mount)', async () => {
    // First attempt: SecureStore throws → early return. With the pre-fix code
    // the guard was latched at the TOP of the effect, so the next effect run
    // for the same profile short-circuited and the primer never appeared. The
    // fix latches only at real terminal points, leaving the guard open here.
    mockSecureGet.mockRejectedValueOnce(new Error('Keystore contention'));

    // Re-run the effect on the SAME mount by toggling a real dependency
    // (isParentProxy). This is the genuine retry the bug suppressed.
    const { rerender } = renderHook(
      ({ proxy }: { proxy: boolean }) =>
        usePostSessionNotificationAsk('p1', true, proxy),
      // Start in proxy mode so the first render does no work, then flip to
      // non-proxy to drive the first real attempt (which fails on SecureStore).
      { initialProps: { proxy: true }, wrapper: setupWrapper() },
    );

    // Flip to non-proxy → first real attempt runs and hits the throwing get.
    rerender({ proxy: false });
    await waitFor(() => {
      expect(mockSecureGet).toHaveBeenCalledTimes(1);
    });
    expect(mockGetPerm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();

    // SecureStore recovers. Toggle the dependency again to force a fresh
    // effect run on the SAME mount. Because the guard was never latched, this
    // run must proceed to the permission check and schedule the primer.
    mockSecureGet.mockResolvedValue(null);
    rerender({ proxy: true });
    rerender({ proxy: false });

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it('Not now marks seen and does not fire OS prompt', async () => {
    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      text: string;
      style?: string;
      onPress?: () => void;
    }>;
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    act(() => {
      cancelBtn?.onPress?.();
    });

    expect(mockReqPerm).not.toHaveBeenCalled();
    expect(mockSecureSet).toHaveBeenCalledWith(
      expect.stringContaining('notificationFirstAskShown_p1'),
      'true',
    );
  });

  // [WI-1441] Regression guard: granting OS permission via this primer must
  // sync pushEnabled=true server-side, preserving the rest of the user's
  // existing notification preferences. Before the fix, requestPermissionsAsync
  // resolving 'granted' never called the settings-update mutation at all.
  it('Allow syncs pushEnabled=true server-side, preserving other preference fields', async () => {
    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowBtn = buttons.find((b) => b.style !== 'cancel');

    await act(async () => {
      allowBtn?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(findPutBody()).toBeDefined();
    });
    expect(findPutBody()).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      weeklyProgressPush: false,
      weeklyProgressEmail: true,
      monthlyProgressEmail: false,
      maxDailyPush: 5,
      pushEnabled: true,
    });
  });

  // [WI-1441 rework] Regression guard: a grant landing before the settings
  // query has resolved must not silently skip the sync. Before this fix,
  // `if (prefs)` guarded the mutate with no fallback, so a user who granted
  // permission during the query's initial load never got pushEnabled synced.
  // Hangs the initial GET so notifQuery.data is still undefined when Allow
  // fires, then lets it resolve and confirms the sync still lands.
  it('syncs pushEnabled once notification prefs load, even if unavailable at grant time', async () => {
    let resolveGet: ((value: Response) => void) | undefined;
    const pendingGet = new Promise<Response>((resolve) => {
      resolveGet = resolve;
    });
    mockFetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/settings/notifications') && method === 'GET') {
          return pendingGet;
        }
        if (url.includes('/settings/notifications') && method === 'PUT') {
          const body =
            typeof init?.body === 'string'
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : {};
          return Promise.resolve(
            jsonResponse({ preferences: { ...NOTIF_PREFS, ...body } }),
          );
        }
        return Promise.reject(
          new Error(`Unhandled fetch in test: ${method} ${url}`),
        );
      },
    );

    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowBtn = buttons.find((b) => b.style !== 'cancel');

    await act(async () => {
      allowBtn?.onPress?.();
      await Promise.resolve();
    });

    // The settings query is still pending (GET never resolved) — the sync
    // must not have fired yet.
    expect(findPutBody()).toBeUndefined();

    await act(async () => {
      resolveGet?.(jsonResponse({ preferences: NOTIF_PREFS }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(findPutBody()).toBeDefined();
    });
    expect(findPutBody()).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      weeklyProgressPush: false,
      weeklyProgressEmail: true,
      monthlyProgressEmail: false,
      maxDailyPush: 5,
      pushEnabled: true,
    });
  });

  it('Allow does not sync pushEnabled when the OS request does not resolve granted', async () => {
    mockReqPerm.mockResolvedValue({ status: 'denied' });
    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowBtn = buttons.find((b) => b.style !== 'cancel');

    await act(async () => {
      allowBtn?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReqPerm).toHaveBeenCalledTimes(1);
    });
    expect(findPutBody()).toBeUndefined();
  });

  // [WI-1441 round 3] Regression guard: if notification prefs cannot be
  // loaded when permission is already granted, the primer must NOT be marked
  // seen — otherwise the sync is lost forever with no further retry. A later
  // mount (a fresh session-summary instance) must retry, and — because
  // permission is already granted — do so via the silent repair path (no OS
  // dialog).
  it('granted with prefs unavailable does not consume the primer, and a later mount retries via silent repair', async () => {
    mockGetPerm.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockFetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/settings/notifications') && method === 'GET') {
          return Promise.reject(new Error('network down'));
        }
        return Promise.reject(
          new Error(`Unhandled fetch in test: ${method} ${url}`),
        );
      },
    );

    const { unmount } = renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSecureSet).not.toHaveBeenCalled();
    unmount();

    // A later mount — a fresh component instance, so a fresh in-memory guard
    // — with permission still granted must retry. Once prefs are reachable
    // it persists and marks seen, all without ever showing the OS Alert.
    mockFetch.mockImplementation(defaultFetchImpl);
    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(findPutBody()).toBeDefined();
    });
    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining('notificationFirstAskShown_p1'),
        'true',
      );
    });
    expect(mockAlert).not.toHaveBeenCalled();
  });

  // [WI-1441 round 3] Regression guard: if the persist mutation itself fails
  // after a granted OS response, the primer must NOT be marked seen either —
  // otherwise the OS grant is recorded as "asked" while the server's
  // pushEnabled silently stays false with no further retry.
  it('Allow with a failing persist does not consume the primer', async () => {
    mockFetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/settings/notifications') && method === 'GET') {
          return Promise.resolve(jsonResponse({ preferences: NOTIF_PREFS }));
        }
        if (url.includes('/settings/notifications') && method === 'PUT') {
          return Promise.resolve(
            new Response('Internal Error', { status: 500 }),
          );
        }
        return Promise.reject(
          new Error(`Unhandled fetch in test: ${method} ${url}`),
        );
      },
    );

    renderPostSessionAsk('p1', true, false);

    await waitFor(() => {
      expect(mockGetPerm).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowBtn = buttons.find((b) => b.style !== 'cancel');

    await act(async () => {
      allowBtn?.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(findPutBody()).toBeDefined();
    });
    // The mutation was attempted (and failed) — the primer must not be
    // consumed so a later attempt can retry.
    expect(mockSecureSet).not.toHaveBeenCalled();
  });
});
