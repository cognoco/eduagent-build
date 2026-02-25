import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { usePushTokenRegistration } from './use-push-token-registration';

// ---------------------------------------------------------------------------
// Mock useRegisterPushToken
// ---------------------------------------------------------------------------

const mockMutateAsync = jest.fn().mockResolvedValue({ registered: true });

jest.mock('./use-settings', () => ({
  useRegisterPushToken: () => ({ mutateAsync: mockMutateAsync }),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
  easConfig: { projectId: 'test-project-id' },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePushTokenRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('requests permission when not already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'undetermined',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
    });

    renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });

  it('does not register when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });

    renderHook(() => usePushTokenRegistration());

    // Give time for the async effect to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(mockMutateAsync).not.toHaveBeenCalled();
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
