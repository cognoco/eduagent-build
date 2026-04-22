import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { usePushTokenRegistration } from './use-push-token-registration';

// ---------------------------------------------------------------------------
// Mock useRegisterPushToken — mock-prefixed variable for Jest hoisting
// ---------------------------------------------------------------------------

const mockMutateAsync = jest.fn().mockResolvedValue({ registered: true });

jest.mock('./use-settings', () => ({
  useRegisterPushToken: () => ({ mutateAsync: mockMutateAsync }),
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
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore resolved values after clearAllMocks
    mockMutateAsync.mockResolvedValue({ registered: true });
  });

  it('requests permissions and registers push token', async () => {
    renderHook(() => usePushTokenRegistration());

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
        'ExponentPushToken[mock-token]'
      );
    });
  });

  it('does not request permission or register when not already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'undetermined',
    });

    renderHook(() => usePushTokenRegistration());

    await new Promise((r) => setTimeout(r, 50));

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('does not register when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });

    renderHook(() => usePushTokenRegistration());

    // Give time for the async effect to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('registers token when notificationGranted flips from false to true', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });

    const { rerender } = renderHook(
      ({ granted }: { granted: boolean }) => usePushTokenRegistration(granted),
      { initialProps: { granted: false } }
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(mockMutateAsync).not.toHaveBeenCalled();

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });

    rerender({ granted: true });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        'ExponentPushToken[mock-token]'
      );
    });
  });

  it('does not crash on registration error', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Token fetch failed')
    );

    // Should not throw
    renderHook(() => usePushTokenRegistration());

    await new Promise((r) => setTimeout(r, 50));

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
