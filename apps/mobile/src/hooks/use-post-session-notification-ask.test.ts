import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from '../lib/secure-storage';
import { platformAlert } from '../lib/platform-alert';
import { usePostSessionNotificationAsk } from './use-post-session-notification-ask';

jest.mock('../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

jest.mock('../lib/secure-storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

jest.mock('../lib/sentry', () => ({
  Sentry: { addBreadcrumb: jest.fn(), captureException: jest.fn() },
}));

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
});
