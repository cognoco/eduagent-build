import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
}

let mockNotifPrefs: NotifPrefs | undefined = {
  reviewReminders: false,
  dailyReminders: false,
  weeklyProgressPush: true,
  weeklyProgressEmail: true,
  monthlyProgressEmail: true,
  pushEnabled: false,
};
let mockNotifLoading = false;
const mockUpdateMutate = jest.fn();
let mockUpdateIsPending = false;

jest.mock(
  '../../../hooks/use-settings' /* gc1-allow: settings hooks fetch from API via React Query */,
  () => ({
    useNotificationSettings: () => ({
      data: mockNotifPrefs,
      isLoading: mockNotifLoading,
    }),
    useUpdateNotificationSettings: () => ({
      mutate: mockUpdateMutate,
      isPending: mockUpdateIsPending,
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
    const { Switch, Text, View } = require('react-native');
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
          <Switch
            value={value}
            onValueChange={onToggle}
            disabled={disabled}
            testID={testID}
          />
        </View>
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
    mockUpdateIsPending = false;
    mockNotifPrefs = {
      reviewReminders: false,
      dailyReminders: false,
      weeklyProgressPush: true,
      weeklyProgressEmail: true,
      monthlyProgressEmail: true,
      pushEnabled: false,
    };
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

  it('reflects weeklyProgressPush=true from prefs', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    const toggle = getByTestId('weekly-digest-toggle');
    expect(toggle.props.value).toBe(true);
  });

  it('calls updateNotifications.mutate with updated pushEnabled when push toggle pressed', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ pushEnabled: true }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
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

  it('shows error alert when update fails (via onError callback)', () => {
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    // Capture the onError callback from the last mutate call
    fireEvent(getByTestId('push-notifications-toggle'), 'valueChange', true);
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

  it('defaults to false values when notifPrefs is undefined', () => {
    mockNotifPrefs = undefined;
    const { getByTestId } = render(<NotificationsScreen />, {
      wrapper: createWrapper(),
    });
    // Defaults: pushEnabled=false
    expect(getByTestId('push-notifications-toggle').props.value).toBe(false);
  });
});
