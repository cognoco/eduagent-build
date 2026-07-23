import { createElement, type ReactNode } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileContext, type ProfileContextValue } from '../../../lib/profile';
import * as navigationContractModule from '../../../hooks/use-navigation-contract';
import * as platformAlertModule from '../../../lib/platform-alert';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router' /* gc1-allow: native router boundary */, () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock(
  '@expo/vector-icons/Ionicons' /* gc1-allow: native font boundary */,
  () => 'Ionicons',
);

const FamilySettingsScreen = require('./family').default;
let cleanupActiveRender: (() => void) | undefined;

function renderFamily({
  isParentProxy = false,
  familyPoolBreakdownRoute = { value: false },
  gates = {
    sessionIsOwner: true,
    showAddChild: true,
    showBilling: true,
    showRemoveFamilyMember: true,
  },
}: {
  isParentProxy?: boolean;
  gates?: Record<string, boolean>;
  familyPoolBreakdownRoute?: unknown;
} = {}) {
  jest
    .spyOn(navigationContractModule, 'useNavigationContract')
    .mockReturnValue({
      isParentProxy,
      gates,
    } as unknown as ReturnType<
      typeof navigationContractModule.useNavigationContract
    >);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const value: ProfileContextValue = {
    profiles: [
      { id: 'owner-1', displayName: 'Owner', isOwner: true },
      { id: 'child-1', displayName: 'Mia', isOwner: false },
    ],
    activeProfile: { id: 'owner-1', displayName: 'Owner', isOwner: true },
    isExplicitProxyMode: isParentProxy,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  } as unknown as ProfileContextValue;
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProfileContext.Provider, { value }, children),
    );
  }
  const previousFetch = globalThis.fetch;
  const mockFetch = createRoutedMockFetch({
    '/settings/family-pool-breakdown-sharing': familyPoolBreakdownRoute,
  });
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  const result = render(<FamilySettingsScreen />, { wrapper: Wrapper });
  cleanupActiveRender = () => {
    result.unmount();
    void queryClient.cancelQueries();
    queryClient.clear();
    globalThis.fetch = previousFetch;
  };
  return { ...result, mockFetch };
}

describe('Account family settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupActiveRender?.();
    cleanupActiveRender = undefined;
    jest.restoreAllMocks();
  });

  it('renders only titled family controls and sends canonical actions to their existing destinations', async () => {
    const { mockFetch } = renderFamily();

    screen.getByRole('header', { name: 'Family settings' });
    fireEvent.press(screen.getByTestId('family-settings-add-child'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
    fireEvent.press(screen.getByTestId('family-settings-subscription'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
    fireEvent.press(screen.getByTestId('family-settings-members'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/account/profiles');
    expect(screen.queryByText('Profile')).toBeNull();
    expect(screen.queryByText('Help & feedback')).toBeNull();

    const sharingSwitch = screen.getByTestId(
      'family-settings-breakdown-sharing',
    );
    expect(sharingSwitch.props.accessibilityLabel).toBe('Share family usage');
    expect(sharingSwitch.props.value).toBe(false);
    fireEvent(sharingSwitch, 'valueChange', true);

    await waitFor(() => {
      expect(
        fetchCallsMatching(
          mockFetch,
          '/settings/family-pool-breakdown-sharing',
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            init: expect.objectContaining({ method: 'PUT' }),
          }),
        ]),
      );
    });
  });

  it('keeps sharing disabled while its value is loading and while an update is pending', async () => {
    let resolveValue: ((value: { value: boolean }) => void) | undefined;
    let resolveUpdate: ((value: { value: boolean }) => void) | undefined;
    renderFamily({
      familyPoolBreakdownRoute: (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return new Promise<{ value: boolean }>((resolve) => {
            resolveUpdate = resolve;
          });
        }
        return new Promise<{ value: boolean }>((resolve) => {
          resolveValue = resolve;
        });
      },
    });

    expect(
      screen.getByTestId('family-settings-breakdown-sharing').props.disabled,
    ).toBe(true);
    await waitFor(() => expect(resolveValue).toBeDefined());
    resolveValue!({ value: false });

    await waitFor(() =>
      expect(
        screen.getByTestId('family-settings-breakdown-sharing').props.disabled,
      ).toBe(false),
    );
    fireEvent(
      screen.getByTestId('family-settings-breakdown-sharing'),
      'valueChange',
      true,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('family-settings-breakdown-sharing').props.disabled,
      ).toBe(true),
    );
    resolveUpdate!({ value: true });
  });

  it('alerts when updating family sharing fails', async () => {
    const alertSpy = jest.spyOn(platformAlertModule, 'platformAlert');
    renderFamily({
      familyPoolBreakdownRoute: (_url: string, init?: RequestInit) =>
        init?.method === 'PUT'
          ? new Response(JSON.stringify({}), { status: 500 })
          : { value: false },
    });

    fireEvent(
      screen.getByTestId('family-settings-breakdown-sharing'),
      'valueChange',
      true,
    );

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not save setting',
        "Couldn't update setting. Try again.",
      );
    });
  });

  it.each([
    ['non-owner', false, false],
    ['parent proxy', true, true],
  ])(
    'fails closed for %s direct entry',
    async (_label, isParentProxy, sessionIsOwner) => {
      const { mockFetch } = renderFamily({
        isParentProxy,
        gates: {
          sessionIsOwner,
          showAddChild: true,
          showBilling: true,
          showRemoveFamilyMember: true,
        },
      });

      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      expect(screen.queryByTestId('family-settings-screen')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        fetchCallsMatching(
          mockFetch,
          '/settings/family-pool-breakdown-sharing',
        ),
      ).toHaveLength(0);
    },
  );

  it.each([
    [
      'free and unlinked',
      { showAddChild: true, showBilling: false, showRemoveFamilyMember: false },
    ],
    [
      'paid and linked',
      { showAddChild: true, showBilling: true, showRemoveFamilyMember: true },
    ],
  ])(
    'applies canonical controls for %s owner variants',
    (_label, variantGates) => {
      renderFamily({
        gates: { sessionIsOwner: true, ...variantGates },
      });

      expect(screen.queryByTestId('family-settings-add-child')).not.toBeNull();
      if (variantGates.showBilling) {
        screen.getByTestId('family-settings-subscription');
      } else {
        expect(screen.queryByTestId('family-settings-subscription')).toBeNull();
      }
      if (variantGates.showRemoveFamilyMember) {
        screen.getByTestId('family-settings-members');
      } else {
        expect(screen.queryByTestId('family-settings-members')).toBeNull();
      }
    },
  );
});
