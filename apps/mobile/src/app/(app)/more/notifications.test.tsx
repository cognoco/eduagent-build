import React from 'react';
import { Linking, Platform } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface NotifPrefs {
  reviewReminders: boolean;
  dailyReminders: boolean;
  weeklyProgressPush: boolean;
  weeklyProgressEmail: boolean;
  monthlyProgressEmail: boolean;
  pushEnabled: boolean;
  pushTokenRegistered: boolean;
}

let mockNotifPrefs: NotifPrefs | undefined = {
  reviewReminders: false,
  dailyReminders: false,
  weeklyProgressPush: true,
  weeklyProgressEmail: true,
  monthlyProgressEmail: true,
  pushEnabled: false,
  pushTokenRegistered: false,
};
let mockNotifLoading = false;
let mockNotifError = false;
const mockUpdateMutate = jest.fn();
let mockUpdateIsPending = false;
const mockRegisterIfAllowed = jest.fn().mockResolvedValue(undefined);
const mockRefetchNotificationSettings = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../../hooks/use-settings' /* gc1-allow: settings hooks fetch from API via React Query */,
  () => ({
    useNotificationSettings: () => ({
      data: mockNotifPrefs,
      isLoading: mockNotifLoading,
      isError: mockNotifError,
      refetch: mockRefetchNotificationSettings,
    }),
    useUpdateNotificationSettings: () => ({
      mutate: mockUpdateMutate,
      isPending: mockUpdateIsPending,
    }),
  }),
);

jest.mock(
  '../../../hooks/use-push-token-registration' /* gc1-allow: screen test controls the native push registration boundary */,
  () => ({
    usePushTokenRegistration: () => ({
      status: 'idle',
      registerIfAllowed: mockRegisterIfAllowed,
    }),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// ToggleRow / SectionHeader stubs
jest.mock(
  '../../../components/more/settings-rows' /* gc1-allow: isolates settings rows from NativeWind styling in screen test */,
  () => {
    const { Pressable, Switch, Text, View } = require('react-native');
    return {
      SectionHeader: ({
        children,
        testID,
      }: {
        children: React.ReactNode;
        testID?: string;
      }) => (
        <View testID={testID}>
          <Text>{children}</Text>
        </View>
      ),
      ToggleRow: ({
        label,
        description,
        value,
        onToggle,
        disabled,
        testID,
      }: {
        label: string;
        description?: string;
        value: boolean;
        onToggle: (v: boolean) => void;
        disabled?: boolean;
        testID?: string;
      }) => (
        <View testID={testID ? `row-${testID}` : undefined}>
          <Text>{label}</Text>
          {description ? <Text>{description}</Text> : null}
          <Switch
            value={value}
            onValueChange={onToggle}
            disabled={disabled}
            testID={testID}
          />
        </View>
      ),
      SettingsRow: ({
        label,
        description,
        onPress,
        testID,
      }: {
        label: string;
        description?: string;
        onPress?: () => void;
        testID?: string;
      }) => (
        <Pressable onPress={onPress} testID={testID}>
          <Text>{label}</Text>
          {description ? <Text>{description}</Text> : null}
        </Pressable>
      ),
    };
  },
);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const NotificationsScreen = require('./notifications')
  .default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifLoading = false;
    mockNotifError = false;
    mockUpdateIsPending = false;
    mockNotifPrefs = {
      reviewReminders: false,
      dailyReminders: false,
      weeklyProgressPush: true,
      weeklyProgressEmail: true,
      monthlyProgressEmail: true,
      pushEnabled: false,
      pushTokenRegistered: false,
    };
    mockRegisterIfAllowed.mockResolvedValue(undefined);
    mockRefetchNotificationSettings.mockResolvedValue(undefined);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
      expires: 'never',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
      expires: 'never',
    });
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
  });

  it('renders all toggle rows', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-notifications-scroll');
    getByTestId('push-notifications-toggle');
    getByTestId('weekly-digest-toggle');
    getByTestId('weekly-email-digest-toggle');
    getByTestId('monthly-email-digest-toggle');
  });

  it('reflects pushEnabled=false from prefs', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    const toggle = getByTestId('push-notifications-toggle');
    expect(toggle.props.value).toBe(false);
  });

  it('renders push as on only when OS permission, server flag, and token are present', async () => {
    mockNotifPrefs = {
      reviewReminders: false,
      dailyReminders: false,
      weeklyProgressPush: true,
      weeklyProgressEmail: true,
      monthlyProgressEmail: true,
      pushEnabled: true,
      pushTokenRegistered: true,
    };

    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(getByTestId('push-notifications-toggle').props.value).toBe(true);
    });
  });

  it.each([
    {
      name: 'OS permission missing',
      permission: { status: 'denied', canAskAgain: true },
      prefs: { pushEnabled: true, pushTokenRegistered: true },
      description: 'Allow notifications from your device.',
    },
    {
      name: 'server switch missing',
      permission: { status: 'granted', canAskAgain: true },
      prefs: { pushEnabled: false, pushTokenRegistered: true },
      description: 'Turn on push notifications here.',
    },
    {
      name: 'token missing',
      permission: { status: 'granted', canAskAgain: true },
      prefs: { pushEnabled: true, pushTokenRegistered: false },
      description: 'Register this device for push notifications.',
    },
  ])(
    'renders push as off and explains the missing signal: $name',
    async ({ permission, prefs, description }) => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(
        permission,
      );
      mockNotifPrefs = {
        reviewReminders: false,
        dailyReminders: false,
        weeklyProgressPush: true,
        weeklyProgressEmail: true,
        monthlyProgressEmail: true,
        ...prefs,
      };

      const { getByTestId, getByText } = render(<NotificationsScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(getByTestId('push-notifications-toggle').props.value).toBe(
          false,
        );
      });
      getByText(description);
    },
  );

  it('reflects weeklyProgressPush=true from prefs', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    const toggle = getByTestId('weekly-digest-toggle');
    expect(toggle.props.value).toBe(true);
  });

  it('requests OS permission and registers a token when enabling from an undetermined state', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    mockUpdateMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.();
    });

    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);

    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ pushEnabled: true }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    await waitFor(() => {
      expect(mockRegisterIfAllowed).toHaveBeenCalledTimes(1);
    });
  });

  it('requests Android POST_NOTIFICATIONS when Android can still ask', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      canAskAgain: true,
    });
    mockUpdateMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.();
    });

    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);

    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockRegisterIfAllowed).toHaveBeenCalledTimes(1);
    });
  });

  it('renders an Open Settings action when OS permission cannot be requested again', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });

    const { getByTestId, findByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });

    const settingsAction = await findByTestId(
      'push-notifications-open-settings',
    );

    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockUpdateMutate).not.toHaveBeenCalled();

    fireEvent.press(settingsAction);
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('calls updateNotifications.mutate with updated weeklyProgressPush when digest toggle pressed', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent(getByTestId('weekly-digest-toggle'), 'valueChange', false);
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyProgressPush: false }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('calls updateNotifications.mutate with updated weeklyProgressEmail when email digest toggle pressed', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent(getByTestId('weekly-email-digest-toggle'), 'valueChange', false);
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyProgressEmail: false }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('calls updateNotifications.mutate with updated monthlyProgressEmail when monthly toggle pressed', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent(getByTestId('monthly-email-digest-toggle'), 'valueChange', false);
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyProgressEmail: false }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('shows error alert when update fails (via onError callback)', async () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    // Capture the onError callback from the last mutate call
    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalled();
    });
    const mutateCall = mockUpdateMutate.mock.calls[0];
    const { onError } = mutateCall[1];
    onError();
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it('disables toggles when loading', () => {
    mockNotifLoading = true;
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    expect(getByTestId('push-notifications-toggle').props.disabled).toBe(true);
  });

  it('disables toggles when update is pending', () => {
    mockUpdateIsPending = true;
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    expect(getByTestId('push-notifications-toggle').props.disabled).toBe(true);
  });

  it('[WI-78 DS-202] disables toggles and does not submit defaults when settings are missing', () => {
    mockNotifPrefs = undefined;
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    expect(getByTestId('push-notifications-toggle').props.value).toBe(false);
    expect(getByTestId('push-notifications-toggle').props.disabled).toBe(true);

    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);

    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('[WI-78 DS-202] disables toggles and does not submit defaults after load error', () => {
    mockNotifPrefs = undefined;
    mockNotifError = true;

    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });

    expect(getByTestId('weekly-digest-toggle').props.disabled).toBe(true);
    fireEvent(getByTestId('weekly-digest-toggle'), 'valueChange', false);

    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });
});
