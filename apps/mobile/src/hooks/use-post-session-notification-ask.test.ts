import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from '../lib/secure-storage';
import { platformAlert } from '../lib/platform-alert';
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

// [WI-1441] Settings hooks fetch over the network via React Query (no real
// backend in the jest environment) — same gc1-allow rationale as the
// established precedent in app/(app)/more/notifications.test.tsx, which mocks
// this same module for the same reason. Kept minimal: only the two exports
// this hook actually calls.
let mockNotifPrefs:
  | {
      reviewReminders: boolean;
      dailyReminders: boolean;
      weeklyProgressPush: boolean;
      weeklyProgressEmail: boolean;
      monthlyProgressEmail: boolean;
    }
  | undefined;
const mockUpdateMutate = jest.fn();
jest.mock(
  './use-settings' /* gc1-allow: settings hooks fetch from API via React Query; see notifications.test.tsx precedent */,
  () => ({
    useNotificationSettings: () => ({ data: mockNotifPrefs }),
    useUpdateNotificationSettings: () => ({ mutate: mockUpdateMutate }),
  }),
);

const mockSecureGet = SecureStore.getItemAsync as jest.Mock;
const mockSecureSet = SecureStore.setItemAsync as jest.Mock;
const mockGetPerm = Notifications.getPermissionsAsync as jest.Mock;
const mockReqPerm = Notifications.requestPermissionsAsync as jest.Mock;
const mockAlert = platformAlert as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSecureGet.mockResolvedValue(null);
  mockSecureSet.mockResolvedValue(undefined);
  mockGetPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  mockReqPerm.mockResolvedValue({ status: 'granted' });
  mockNotifPrefs = {
    reviewReminders: true,
    dailyReminders: false,
    weeklyProgressPush: false,
    weeklyProgressEmail: true,
    monthlyProgressEmail: false,
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePostSessionNotificationAsk', () => {
  it('does nothing without a profileId', async () => {
    renderHook(() => usePostSessionNotificationAsk(undefined, true, false));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does nothing when no session has been completed', async () => {
    renderHook(() => usePostSessionNotificationAsk('p1', false, false));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does nothing in parent-proxy mode', async () => {
    renderHook(() => usePostSessionNotificationAsk('p1', true, true));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does not prompt if SecureStore says we already asked', async () => {
    mockSecureGet.mockResolvedValue('true');
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));
    await waitFor(() => {
      expect(mockSecureGet).toHaveBeenCalled();
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it('marks seen and skips prompt when permission is already granted', async () => {
    mockGetPerm.mockResolvedValue({ status: 'granted', canAskAgain: true });
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));
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
  });

  it('marks seen and skips prompt when OS has blocked re-asking', async () => {
    mockGetPerm.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));
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
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));

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
      { initialProps: { profileId: 'profile-A' } },
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
      { initialProps: { proxy: true } },
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
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));

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
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));

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
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        {
          reviewReminders: true,
          dailyReminders: false,
          weeklyProgressPush: false,
          weeklyProgressEmail: true,
          monthlyProgressEmail: false,
          pushEnabled: true,
        },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });
  });

  it('Allow does not sync pushEnabled when the OS request does not resolve granted', async () => {
    mockReqPerm.mockResolvedValue({ status: 'denied' });
    renderHook(() => usePostSessionNotificationAsk('p1', true, false));

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
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });
});
