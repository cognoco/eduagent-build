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
import { useGuardianNotificationAsk } from './use-guardian-notification-ask';

jest.mock(
  '../lib/platform-alert' /* gc1-allow: native-boundary; platformAlert wraps React Native Alert/web globals */,
  () => ({
    platformAlert: jest.fn(),
  }),
);

jest.mock(
  '../lib/secure-storage' /* gc1-allow: native-boundary; SecureStore is controlled per test */,
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);

jest.mock(
  '../lib/sentry' /* gc1-allow: observability boundary; lib/sentry initializes native transports on import */,
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
// use-child-cap-notifications.test.ts. (The sibling
// use-post-session-notification-ask.test.ts still mocks ./use-settings
// internally — that file's ~10 pre-existing bare-renderHook() tests have no
// QueryClientProvider/ProfileContext wrapper, so switching it to this
// fetch-boundary approach would require rewriting all of them; tracked as a
// known GC1 deferral rather than done here.)
const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

const NOTIF_PREFS = {
  reviewReminders: true,
  dailyReminders: false,
  weeklyProgressPush: false,
  weeklyProgressEmail: true,
  monthlyProgressEmail: false,
  pushEnabled: false,
  maxDailyPush: 3,
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

const guardian = createTestProfile({
  id: 'guardian-profile',
  displayName: 'Alex Parent',
  isOwner: true,
  birthYear: 2012,
});

const child = createTestProfile({
  id: 'child-profile',
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2014,
});

const soloOwner = createTestProfile({
  id: 'solo-owner',
  displayName: 'Solo Owner',
  isOwner: true,
});

let queryClient: QueryClient | undefined;

function renderGuardianAsk({
  activeProfile = guardian,
  profiles = [guardian, child],
  isExplicitProxyMode = false,
}: {
  activeProfile?: typeof guardian | null;
  profiles?: (typeof guardian)[];
  isExplicitProxyMode?: boolean;
} = {}): void {
  const wrapped = createHookWrapper({
    activeProfile,
    profiles,
    isExplicitProxyMode,
  });
  queryClient = wrapped.queryClient;
  setActiveProfileId(activeProfile?.id);
  renderHook(() => useGuardianNotificationAsk(), { wrapper: wrapped.wrapper });
}

async function waitForPermissionCheck(): Promise<void> {
  await waitFor(() => {
    expect(mockGetPerm).toHaveBeenCalled();
  });
}

async function advancePastPrimerDelay(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
}

describe('useGuardianNotificationAsk', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSecureGet.mockResolvedValue(null);
    mockSecureSet.mockResolvedValue(undefined);
    mockGetPerm.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
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

  it('prompts only an owner with linked children without using age as eligibility', async () => {
    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockSecureGet).toHaveBeenCalledWith(
      expect.stringContaining('guardianNotificationAskShown_guardian-profile'),
    );

    jest.clearAllMocks();
    renderGuardianAsk({ activeProfile: soloOwner, profiles: [soloOwner] });
    await advancePastPrimerDelay();

    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();

    jest.clearAllMocks();
    renderGuardianAsk({ activeProfile: child, profiles: [guardian, child] });
    await advancePastPrimerDelay();

    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('skips the guardian ask in parent-proxy mode', async () => {
    renderGuardianAsk({ isExplicitProxyMode: true });

    await advancePastPrimerDelay();

    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockGetPerm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('deduplicates with a dedicated guardian key', async () => {
    mockSecureGet.mockResolvedValue('true');

    renderGuardianAsk();

    await waitFor(() => {
      expect(mockSecureGet).toHaveBeenCalledWith(
        expect.stringContaining(
          'guardianNotificationAskShown_guardian-profile',
        ),
      );
    });
    await advancePastPrimerDelay();

    expect(mockGetPerm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockSecureGet).not.toHaveBeenCalledWith(
      expect.stringContaining('notificationFirstAskShown_guardian-profile'),
    );
  });

  it('does not let the learner primer key suppress the guardian ask', async () => {
    mockSecureGet.mockImplementation(async (key: string) =>
      key.includes('notificationFirstAskShown_') ? 'true' : null,
    );

    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const cancelButton = buttons.find((button) => button.style === 'cancel');

    act(() => {
      cancelButton?.onPress?.();
    });

    expect(mockSecureSet).toHaveBeenCalledWith(
      expect.stringContaining('guardianNotificationAskShown_guardian-profile'),
      'true',
    );
    expect(mockSecureSet).not.toHaveBeenCalledWith(
      expect.stringContaining('notificationFirstAskShown_guardian-profile'),
      'true',
    );
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it('marks seen after Allow requests OS permission', async () => {
    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowButton = buttons.find((button) => button.style !== 'cancel');

    await act(async () => {
      allowButton?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReqPerm).toHaveBeenCalledTimes(1);
    });
    expect(mockSecureSet).toHaveBeenCalledWith(
      expect.stringContaining('guardianNotificationAskShown_guardian-profile'),
      'true',
    );
  });

  it('marks seen without prompting when permission is already granted or cannot ask again', async () => {
    mockGetPerm.mockResolvedValue({ status: 'granted', canAskAgain: true });
    renderGuardianAsk();

    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining(
          'guardianNotificationAskShown_guardian-profile',
        ),
        'true',
      );
    });
    expect(mockAlert).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockSecureGet.mockResolvedValue(null);
    mockSecureSet.mockResolvedValue(undefined);
    mockGetPerm.mockResolvedValue({ status: 'denied', canAskAgain: false });
    renderGuardianAsk();

    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining(
          'guardianNotificationAskShown_guardian-profile',
        ),
        'true',
      );
    });
    expect(mockAlert).not.toHaveBeenCalled();
  });

  // [WI-1441] Regression guard: granting OS permission via this primer must
  // sync pushEnabled=true server-side, preserving the rest of the user's
  // existing notification preferences. Before the fix, requestPermissionsAsync
  // resolving 'granted' never called the settings-update mutation at all.
  it('Allow syncs pushEnabled=true server-side, preserving other preference fields', async () => {
    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowButton = buttons.find((button) => button.style !== 'cancel');

    await act(async () => {
      allowButton?.onPress?.();
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
      pushEnabled: true,
    });
  });

  it('does not sync pushEnabled when the OS request does not resolve granted', async () => {
    mockReqPerm.mockResolvedValue({ status: 'denied' });
    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowButton = buttons.find((button) => button.style !== 'cancel');

    await act(async () => {
      allowButton?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReqPerm).toHaveBeenCalledTimes(1);
    });
    expect(findPutBody()).toBeUndefined();
  });
});
