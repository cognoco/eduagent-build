import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';
import { usePushTokenRegistration } from './use-push-token-registration';

// ---------------------------------------------------------------------------
// Mock useRegisterPushToken — mock-prefixed variable for Jest hoisting
// ---------------------------------------------------------------------------

const mockMutateAsync = jest.fn().mockResolvedValue({ registered: true });
let mockActiveProfile: { id: string } | null = { id: 'profile-1' };

jest.mock('./use-settings', () => ({
  useRegisterPushToken: () => ({ mutateAsync: mockMutateAsync }),
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({ activeProfile: mockActiveProfile }),
}));

jest.mock('expo-constants', () => {
  const constants = {
    expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
    easConfig: { projectId: 'test-project-id' },
  };
  return { __esModule: true, default: constants, ...constants };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePushTokenRegistration', () => {
  let appStateListeners: Array<(state: AppStateStatus) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveProfile = { id: 'profile-1' };
    appStateListeners = [];
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListeners.push(listener);
        return { remove: jest.fn() };
      });
    // Restore resolved values after clearAllMocks
    mockMutateAsync.mockResolvedValue({ registered: true });
  });

  it('registers push token when notification permission is already granted', async () => {
    const { result } = renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'test-project-id',
      });
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        'ExponentPushToken[mock-token]',
      );
    });

    await waitFor(() => {
      expect(result.current.status).toBe('registered');
    });
  });

  it('does not request permission or register when not already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });

    const { result } = renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        reason: 'permission_denied',
      });
    });

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('does not register when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });

    const { result } = renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        reason: 'permission_denied',
      });
    });

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('registers token after returning active with newly granted permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });

    const { result } = renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        reason: 'permission_denied',
      });
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });

    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        'ExponentPushToken[mock-token]',
      );
    });
  });

  it('registers again when the active profile changes', async () => {
    const { rerender } = renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    mockActiveProfile = { id: 'profile-2' };

    rerender({});

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });
  });

  it('does not register without an active profile', async () => {
    mockActiveProfile = null;

    const { result } = renderHook(() => usePushTokenRegistration());

    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });

    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('does not crash on registration error', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error('Token fetch failed'),
    );

    const { result } = renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        reason: 'expo_token_unavailable',
      });
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
