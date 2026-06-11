import React from 'react';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
  ERROR_RESPONSES,
} from '../../../test-utils/screen-render';
import {
  fetchCallsMatching,
  extractJsonBody,
} from '../../../test-utils/mock-api-routes';

// ---------------------------------------------------------------------------
// Boundary mocks (native/external runtime only). Everything else — the
// real ProfileContext, useNavigationContract, useLinkedChildren, useExportData,
// and the withdrawal-archive settings hooks — runs against the routed mock
// fetch installed by `renderScreen`.
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// Deterministic error text so the export-failure assertion is stable
// (per AGENTS.md "Classify errors before formatting" — the screen passes the
// raw error to formatApiError; the test pins the rendered string).
jest.mock(
  '../../../lib/format-api-error' /* gc1-allow: screen test needs deterministic error text */,
  () => ({
    formatApiError: (err: unknown) =>
      err instanceof Error ? err.message : 'Error',
  }),
);

// SettingsRow / LearningModeOption / SectionHeader stubs isolate the rows from
// NativeWind styling without changing behavior under test.
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

const PrivacyScreen = require('./privacy').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ownerProfile = createTestProfile({
  id: 'profile-owner',
  accountId: 'account-1',
  displayName: 'Alex',
  isOwner: true,
});

const childProfile = createTestProfile({
  id: 'profile-child',
  accountId: 'account-1',
  displayName: 'Sam',
  isOwner: false,
});

// Owner + one linked child so useLinkedChildren() returns a non-empty list.
function ownerWithChild() {
  return {
    profile: ownerProfile,
    profiles: [
      ownerProfile,
      createTestProfile({
        id: 'child-1',
        accountId: 'account-1',
        displayName: 'Sam',
        isOwner: false,
      }),
    ],
  };
}

function withdrawalRoute(value: 'auto' | 'always' | 'never' = 'auto') {
  return {
    '/settings/withdrawal-archive': { value },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrivacyScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.clearAllMocks();
  });

  it('renders privacy scroll', () => {
    active = renderScreen(<PrivacyScreen />, { profile: ownerProfile });
    active.result.getByTestId('more-privacy-scroll');
  });

  it('navigates to privacy policy page', () => {
    active = renderScreen(<PrivacyScreen />, { profile: ownerProfile });
    fireEvent.press(active.result.getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/privacy');
  });

  it('navigates to terms page', () => {
    active = renderScreen(<PrivacyScreen />, { profile: ownerProfile });
    fireEvent.press(active.result.getByText('Terms of Service'));
    expect(mockPush).toHaveBeenCalledWith('/terms');
  });

  it('shows export data row for owner', () => {
    active = renderScreen(<PrivacyScreen />, { profile: ownerProfile });
    active.result.getByTestId('more-row-export');
  });

  it('shows delete account row for owner', () => {
    active = renderScreen(<PrivacyScreen />, { profile: ownerProfile });
    active.result.getByTestId('more-row-delete-account');
  });

  it('navigates to delete-account when delete row pressed', () => {
    active = renderScreen(<PrivacyScreen />, { profile: ownerProfile });
    fireEvent.press(active.result.getByTestId('more-row-delete-account'));
    expect(mockPush).toHaveBeenCalledWith('/delete-account');
  });

  it('hides export data row for non-owner', () => {
    // Child on a parent's account — gates.showExportDelete is owner-only.
    active = renderScreen(<PrivacyScreen />, {
      profile: childProfile,
      profiles: [ownerProfile, childProfile],
    });
    expect(active.result.queryByTestId('more-row-export')).toBeNull();
  });

  it('hides delete account row for non-owner', () => {
    active = renderScreen(<PrivacyScreen />, {
      profile: childProfile,
      profiles: [ownerProfile, childProfile],
    });
    expect(active.result.queryByTestId('more-row-delete-account')).toBeNull();
  });

  it('shows withdrawal archive options when owner has linked children', async () => {
    active = renderScreen(<PrivacyScreen />, {
      ...ownerWithChild(),
      routes: withdrawalRoute('auto'),
    });
    await waitFor(() => {
      active!.result.getByTestId('more-withdrawal-archive-auto');
    });
    active.result.getByTestId('more-withdrawal-archive-always');
    active.result.getByTestId('more-withdrawal-archive-never');
  });

  it('does NOT show withdrawal archive options when owner has no linked children', () => {
    active = renderScreen(<PrivacyScreen />, {
      profile: ownerProfile,
      profiles: [ownerProfile],
      routes: withdrawalRoute('auto'),
    });
    expect(
      active.result.queryByTestId('more-withdrawal-archive-auto'),
    ).toBeNull();
  });

  it('PUTs the withdrawal-archive preference when a different option is pressed', async () => {
    active = renderScreen(<PrivacyScreen />, {
      ...ownerWithChild(),
      routes: withdrawalRoute('auto'),
    });
    await waitFor(() => {
      active!.result.getByTestId('more-withdrawal-archive-always');
    });
    await act(async () => {
      fireEvent.press(
        active!.result.getByTestId('more-withdrawal-archive-always'),
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      const calls = fetchCallsMatching(
        active!.routedFetch,
        '/settings/withdrawal-archive',
      ).filter((c) => c.init?.method === 'PUT');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(extractJsonBody(calls[calls.length - 1]?.init)).toEqual({
        value: 'always',
      });
    });
  });

  it('does NOT PUT when pressing the already-selected option', async () => {
    active = renderScreen(<PrivacyScreen />, {
      ...ownerWithChild(),
      routes: withdrawalRoute('auto'),
    });
    await waitFor(() => {
      active!.result.getByTestId('more-withdrawal-archive-auto');
    });
    fireEvent.press(active.result.getByTestId('more-withdrawal-archive-auto'));
    expect(
      fetchCallsMatching(
        active.routedFetch,
        '/settings/withdrawal-archive',
      ).filter((c) => c.init?.method === 'PUT'),
    ).toHaveLength(0);
  });

  it('hits the export endpoint when export row pressed', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as never);
    active = renderScreen(<PrivacyScreen />, {
      profile: ownerProfile,
      routes: { '/account/export': { data: 'test' } },
    });
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('more-row-export'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        fetchCallsMatching(active!.routedFetch, '/account/export').length,
      ).toBeGreaterThanOrEqual(1);
    });
    shareSpy.mockRestore();
  });

  it('shows alert on export failure', async () => {
    active = renderScreen(<PrivacyScreen />, {
      profile: ownerProfile,
      routes: {
        '/account/export': () =>
          ERROR_RESPONSES.forbidden('Export failed', 'FORBIDDEN'),
      },
    });
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('more-row-export'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Export failed'),
      );
    });
  });
});
