import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoutedMockFetch } from '../../../test-utils/mock-api-routes';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../../../lib/profile';
import { createTestProfile } from '../../../test-utils/app-hook-test-utils';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    subjectId: '50000000-0000-4000-8000-000000000001',
    subjectName: 'Mathematics',
  }),
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const MockSafeAreaView = View;
  MockSafeAreaView.displayName = 'SafeAreaView';
  const MockSafeAreaProvider = ({ children }: { children: React.ReactNode }) =>
    children;
  MockSafeAreaProvider.displayName = 'SafeAreaProvider';
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: MockSafeAreaView,
    SafeAreaProvider: MockSafeAreaProvider,
    SafeAreaInsetsContext: { Consumer: View },
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch assigned inside factory to bypass hoisting
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../lib/api-client', // gc1-allow: fetch-boundary — mockApiClientFactory installs hc() with a controlled mock fetch so real hooks exercise real request logic
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

// ---------------------------------------------------------------------------
// Profile context
// ---------------------------------------------------------------------------

const testProfile: Profile = createTestProfile({
  id: 'test-profile-id',
  accountId: 'test-account-id',
  displayName: 'Test Learner',
  isOwner: true,
  birthYear: 1990,
});

const profileContextValue: ProfileContextValue = {
  profiles: [testProfile],
  activeProfile: testProfile,
  isExplicitProxyMode: false,
  switchProfile: async () => ({ success: true }),
  isLoading: false,
  profileLoadError: null,
  profileWasRemoved: false,
  acknowledgeProfileRemoval: () => undefined,
};

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

interface SetupOptions {
  analogyDomain?: string | null;
  subjects?: Array<Record<string, unknown>>;
  analogyLoading?: boolean;
}

const SUBJECT_ID = '50000000-0000-4000-8000-000000000001';
const PROFILE_ID = '50000000-0000-4000-8000-000000000002';

function subjectFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: SUBJECT_ID,
    profileId: PROFILE_ID,
    name: 'Mathematics',
    status: 'active',
    pedagogyMode: 'socratic',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setupRoutes(opts: SetupOptions = {}) {
  const {
    analogyDomain = null,
    subjects = [subjectFixture()],
    analogyLoading = false,
  } = opts;

  if (analogyLoading) {
    mockFetch.setRoute('analogy-domain', () => new Promise(() => undefined));
  } else {
    mockFetch.setRoute('analogy-domain', { analogyDomain });
  }
  mockFetch.setRoute('/subjects', { subjects });
}

// ---------------------------------------------------------------------------
// QueryClient + ProfileContext wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={profileContextValue}>
          {children}
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

const SubjectSettingsScreen = require('./[subjectId]').default;

describe('SubjectSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRoutes();
  });

  it('renders the subject name in the header', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByText('Mathematics');
    });
  });

  it('renders the Analogy Preference section header', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByText('Analogy Preference');
    });
  });

  it('renders the description text', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByText(
        "Choose a domain for analogies. The mentor will prefer analogies from this world when explaining concepts, but won't force them when a direct explanation is clearer.",
      );
    });
  });

  it('renders the analogy domain picker', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-picker');
    });
  });

  it('renders all domain options', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-none');
    });
    screen.getByTestId('analogy-domain-cooking');
    screen.getByTestId('analogy-domain-sports');
    screen.getByTestId('analogy-domain-building');
    screen.getByTestId('analogy-domain-music');
    screen.getByTestId('analogy-domain-nature');
    screen.getByTestId('analogy-domain-gaming');
  });

  it('shows "No preference" as active when analogyDomain is null', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-picker');
    });
    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);
  });

  it('shows selected domain as active', async () => {
    setupRoutes({ analogyDomain: 'cooking' });

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-picker');
    });
    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);

    const cookingOption = screen.getByTestId('analogy-domain-cooking');
    const hasActiveInCooking = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === cookingOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInCooking).toBe(true);
  });

  it('calls updateAnalogyDomain when a domain is selected', async () => {
    // Stub the PUT route so the mutation succeeds
    mockFetch.setRoute('analogy-domain', { analogyDomain: 'sports' });

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-sports');
    });
    fireEvent.press(screen.getByTestId('analogy-domain-sports'));

    await waitFor(() => {
      const putCall = (
        mockFetch.mock.calls as [string, RequestInit | undefined][]
      ).find(
        ([url, init]) =>
          url.includes('analogy-domain') && init?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall![1]?.body as string);
      expect(body.analogyDomain).toBe('sports');
    });
  });

  it('calls updateAnalogyDomain with null when "No preference" pressed', async () => {
    setupRoutes({ analogyDomain: 'cooking' });
    mockFetch.setRoute('analogy-domain', { analogyDomain: null });

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-none');
    });
    fireEvent.press(screen.getByTestId('analogy-domain-none'));

    await waitFor(() => {
      const putCall = (
        mockFetch.mock.calls as [string, RequestInit | undefined][]
      ).find(
        ([url, init]) =>
          url.includes('analogy-domain') && init?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall![1]?.body as string);
      expect(body.analogyDomain).toBeNull();
    });
  });

  it('shows loading state when data is loading', async () => {
    setupRoutes({ analogyLoading: true });

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('analogy-domain-loading');
    });
  });

  it('returns to the subject shelf when back button is pressed', async () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-settings-back');
    });
    fireEvent.press(screen.getByTestId('subject-settings-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: '50000000-0000-4000-8000-000000000001' },
    });
  });

  // [BUG-939] Analogy Preference is meaningless for language subjects
  // (pedagogyMode 'four_strands') because the four-strands pedagogy teaches
  // vocabulary directly without analogy framing.
  describe('language subject handling [BUG-939]', () => {
    it('hides Analogy Preference for four_strands subjects', async () => {
      setupRoutes({
        subjects: [
          subjectFixture({ name: 'Italian', pedagogyMode: 'four_strands' }),
        ],
      });

      render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByText('Analogy Preference')).toBeNull();
      });
      expect(screen.queryByTestId('analogy-domain-picker')).toBeNull();
      expect(
        screen.getByTestId('subject-settings-language-empty'),
      ).toBeTruthy();
    });

    it('shows Analogy Preference for non-language subjects', async () => {
      setupRoutes({
        subjects: [subjectFixture()],
      });

      render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByText('Analogy Preference');
      });
      expect(
        screen.queryByTestId('subject-settings-language-empty'),
      ).toBeNull();
    });

    it('still shows the back button on the language-subject empty state', async () => {
      setupRoutes({
        subjects: [
          subjectFixture({ name: 'Italian', pedagogyMode: 'four_strands' }),
        ],
      });

      render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

      // Empty state must not be a dead-end — back button is reachable.
      await waitFor(() => {
        screen.getByTestId('subject-settings-back');
      });
    });
  });
});
