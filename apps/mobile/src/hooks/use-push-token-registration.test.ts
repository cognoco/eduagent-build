import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { usePushTokenRegistration } from './use-push-token-registration';
import { createTestProfile } from '../test-utils/app-hook-test-utils';
import { Sentry } from '../lib/sentry';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../lib/profile';

// ---------------------------------------------------------------------------
// Mock useRegisterPushToken — mock-prefixed variable for Jest hoisting
// ---------------------------------------------------------------------------

const mockMutateAsync = jest.fn().mockResolvedValue({ registered: true });
let mockActiveProfile: Profile | null = createTestProfile({
  id: 'profile-1',
});
let mockProfiles: Profile[] | null = null;
// [ACCOUNT-04] Explicit proxy flag — must be true for the "viewing as child"
// test case since useParentProxy no longer derives from profile shape.
let mockIsExplicitProxyMode = false;

jest.mock(
  './use-settings' /* gc1-allow: useRegisterPushToken fires network mutations; override isolates registration side-effects from actual API calls */,
  () => ({
    ...jest.requireActual('./use-settings'),
    useRegisterPushToken: () => ({ mutateAsync: mockMutateAsync }),
  }),
);

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

function createProfileWrapper() {
  function Wrapper({ children }: { children: ReactNode }) {
    const profiles =
      mockProfiles ?? (mockActiveProfile ? [mockActiveProfile] : []);
    const value: ProfileContextValue = {
      profiles,
      activeProfile: mockActiveProfile,
      isExplicitProxyMode: mockIsExplicitProxyMode,
      switchProfile: async () => ({ success: true }),
      isLoading: false,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
    };

    return createElement(ProfileContext.Provider, { value }, children);
  }

  return Wrapper;
}

describe('usePushTokenRegistration', () => {
  let appStateListeners: Array<(state: AppStateStatus) => void>;
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOS,
    });
    mockActiveProfile = createTestProfile({ id: 'profile-1' });
    appStateListeners = [];
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListeners.push(listener);
        return { remove: jest.fn() };
      });
    // Restore resolved values after clearAllMocks
    mockMutateAsync.mockResolvedValue({ registered: true });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      expires: 'never',
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[mock-token]',
      type: 'expo',
    });
    mockProfiles = null;
    mockIsExplicitProxyMode = false;
  });

  it('registers push token when notification permission is already granted', async () => {
    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'test-project-id',
      });
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        profileId: 'profile-1',
        token: 'ExponentPushToken[mock-token]',
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('registered');
    });
  });

  it('does not request permission or register when not already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

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

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

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

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

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
      expect(mockMutateAsync).toHaveBeenCalledWith({
        profileId: 'profile-1',
        token: 'ExponentPushToken[mock-token]',
      });
    });
  });

  it('exposes a manual retry trigger for settings permission changes', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toMatchObject({
        status: 'failed',
        reason: 'permission_denied',
      });
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });

    await act(async () => {
      await result.current.registerIfAllowed();
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        profileId: 'profile-1',
        token: 'ExponentPushToken[mock-token]',
      });
    });
    await waitFor(() => {
      expect(result.current.status).toBe('registered');
    });
  });

  it('registers again when the active profile changes', async () => {
    const { rerender } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    mockActiveProfile = createTestProfile({ id: 'profile-2' });

    rerender({});

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });
  });

  it('[WI-80] skips API registration if active profile changes while token lookup is in flight', async () => {
    let resolveFirstToken!: (value: { data: string }) => void;
    (Notifications.getExpoPushTokenAsync as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstToken = resolve;
          }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const { rerender } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    });

    mockActiveProfile = createTestProfile({ id: 'profile-2' });
    rerender({});

    await act(async () => {
      resolveFirstToken({ data: 'ExponentPushToken[stale-profile]' });
    });

    expect(mockMutateAsync).not.toHaveBeenCalledWith({
      profileId: 'profile-1',
      token: 'ExponentPushToken[stale-profile]',
    });
  });

  it('[WI-80] passes the captured profile id into the API mutation', async () => {
    mockMutateAsync.mockImplementationOnce(async () => {
      mockActiveProfile = createTestProfile({ id: 'profile-2' });
      return { registered: true };
    });

    renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        profileId: 'profile-1',
        token: 'ExponentPushToken[mock-token]',
      });
    });
  });

  it('registers again when the Expo push token rotates for the same profile', async () => {
    const getExpoPushTokenAsync =
      Notifications.getExpoPushTokenAsync as jest.Mock;
    getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[first-token]',
    });

    renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        profileId: 'profile-1',
        token: 'ExponentPushToken[first-token]',
      });
    });

    getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[rotated-token]',
    });

    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        profileId: 'profile-1',
        token: 'ExponentPushToken[rotated-token]',
      });
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('does not register without an active profile', async () => {
    mockActiveProfile = null;

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });

    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('does not register the parent device while viewing as a child', async () => {
    // [ACCOUNT-04] Proxy must be explicitly set — plain profile switch to a
    // non-owner slot does NOT set proxy. This test simulates the explicit proxy
    // path (retained internal/test proxy mode).
    const ownerProfile = createTestProfile({
      id: 'owner-profile',
      isOwner: true,
    });
    const childProfile = createTestProfile({
      id: 'child-profile',
      isOwner: false,
    });
    mockActiveProfile = childProfile;
    mockProfiles = [ownerProfile, childProfile];
    mockIsExplicitProxyMode = true;

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });

    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('does not capture the local Android Firebase setup error in development', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error(
        'Make sure to complete the guide at https://docs.expo.dev/push-notifications/fcm-credentials/ : Default FirebaseApp is not initialized in this process com.mentomate.app.',
      ),
    );

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        reason: 'expo_token_unavailable',
      });
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not crash on registration error', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error('Token fetch failed'),
    );

    const { result } = renderHook(() => usePushTokenRegistration(), {
      wrapper: createProfileWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        reason: 'expo_token_unavailable',
      });
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
