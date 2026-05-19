import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockRole: 'owner' | 'child' | 'impersonated-child' | null = 'owner';

jest.mock(
  '../../../hooks/use-active-profile-role' /* gc1-allow: depends on profile + parentProxy context */,
  () => ({
    useActiveProfileRole: () => mockRole,
  }),
);

let mockLinkedChildren: { id: string; displayName: string }[] = [];

jest.mock(
  '../../../lib/profile' /* gc1-allow: profile context requires full provider tree */,
  () => ({
    useLinkedChildren: () => mockLinkedChildren,
  }),
);

let mockWithdrawalArchivePreference: 'auto' | 'always' | 'never' | undefined =
  'auto';
let mockArchivePrefLoading = false;
const mockUpdateWithdrawalMutate = jest.fn();
let mockUpdateWithdrawalIsPending = false;

jest.mock(
  '../../../hooks/use-settings' /* gc1-allow: settings hooks fetch from API via React Query */,
  () => ({
    useWithdrawalArchivePreference: () => ({
      data: mockWithdrawalArchivePreference,
      isLoading: mockArchivePrefLoading,
    }),
    useUpdateWithdrawalArchivePreference: () => ({
      mutate: mockUpdateWithdrawalMutate,
      isPending: mockUpdateWithdrawalIsPending,
    }),
  }),
);

const mockExportMutateAsync = jest.fn();
let mockExportIsPending = false;

jest.mock(
  '../../../hooks/use-account' /* gc1-allow: account hooks fetch from API via React Query */,
  () => ({
    useExportData: () => ({
      mutateAsync: mockExportMutateAsync,
      isPending: mockExportIsPending,
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

jest.mock(
  '../../../lib/format-api-error' /* gc1-allow: screen test needs deterministic error text */,
  () => ({
    formatApiError: (err: unknown) =>
      err instanceof Error ? err.message : 'Error',
  }),
);

// SettingsRow / LearningModeOption / SectionHeader stubs
jest.mock(
  '../../../components/more/settings-rows' /* gc1-allow: isolates settings rows from NativeWind styling in screen test */,
  () => {
    const { Pressable, Text } = require('react-native');
    return {
      SectionHeader: ({ children }: { children: React.ReactNode }) => (
        <Text>{children}</Text>
      ),
      SettingsRow: ({
        label,
        value,
        onPress,
        testID,
      }: {
        label: string;
        value?: string;
        onPress?: () => void;
        testID?: string;
      }) => (
        <Pressable onPress={onPress} testID={testID ?? `row-${label}`}>
          <Text>{label}</Text>
          {value ? <Text>{value}</Text> : null}
        </Pressable>
      ),
      LearningModeOption: ({
        title,
        selected,
        onPress,
        disabled,
        testID,
      }: {
        title: string;
        description: string;
        selected: boolean;
        disabled?: boolean;
        onPress?: () => void;
        testID?: string;
      }) => (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          testID={testID}
          accessibilityState={{ selected }}
        >
          <Text>{title}</Text>
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

const PrivacyScreen = require('./privacy').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrivacyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'owner';
    mockLinkedChildren = [];
    mockWithdrawalArchivePreference = 'auto';
    mockArchivePrefLoading = false;
    mockUpdateWithdrawalIsPending = false;
    mockExportIsPending = false;
  });

  it('renders privacy scroll', () => {
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-privacy-scroll');
  });

  it('navigates to privacy policy page', () => {
    const { getByText } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/privacy');
  });

  it('navigates to terms page', () => {
    const { getByText } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByText('Terms of Service'));
    expect(mockPush).toHaveBeenCalledWith('/terms');
  });

  it('shows export data row for owner', () => {
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-row-export');
  });

  it('shows delete account row for owner', () => {
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-row-delete-account');
  });

  it('navigates to delete-account when delete row pressed', () => {
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByTestId('more-row-delete-account'));
    expect(mockPush).toHaveBeenCalledWith('/delete-account');
  });

  it('hides export data row for non-owner', () => {
    mockRole = 'child';
    const { queryByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    expect(queryByTestId('more-row-export')).toBeNull();
  });

  it('hides delete account row for non-owner', () => {
    mockRole = 'child';
    const { queryByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    expect(queryByTestId('more-row-delete-account')).toBeNull();
  });

  it('shows withdrawal archive options when owner has linked children', () => {
    mockLinkedChildren = [{ id: 'child-1', displayName: 'Sam' }];
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-withdrawal-archive-auto');
    getByTestId('more-withdrawal-archive-always');
    getByTestId('more-withdrawal-archive-never');
  });

  it('does NOT show withdrawal archive options when owner has no linked children', () => {
    mockLinkedChildren = [];
    const { queryByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    expect(queryByTestId('more-withdrawal-archive-auto')).toBeNull();
  });

  it('calls updateWithdrawalArchivePreference.mutate when a different option is pressed', () => {
    mockLinkedChildren = [{ id: 'child-1', displayName: 'Sam' }];
    mockWithdrawalArchivePreference = 'auto';
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByTestId('more-withdrawal-archive-always'));
    expect(mockUpdateWithdrawalMutate).toHaveBeenCalledWith(
      'always',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('does NOT call mutate when pressing the already-selected option', () => {
    mockLinkedChildren = [{ id: 'child-1', displayName: 'Sam' }];
    mockWithdrawalArchivePreference = 'auto';
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByTestId('more-withdrawal-archive-auto'));
    expect(mockUpdateWithdrawalMutate).not.toHaveBeenCalled();
  });

  it('calls export mutateAsync when export row pressed', async () => {
    mockExportMutateAsync.mockResolvedValueOnce({ data: 'test' });
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    await act(async () => {
      fireEvent.press(getByTestId('more-row-export'));
      await Promise.resolve();
    });
    expect(mockExportMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('shows alert on export failure', async () => {
    mockExportMutateAsync.mockRejectedValueOnce(new Error('Export failed'));
    const { getByTestId } = render(<PrivacyScreen />, {
      wrapper: createWrapper(),
    });
    await act(async () => {
      fireEvent.press(getByTestId('more-row-export'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Export failed'),
    );
  });
});
