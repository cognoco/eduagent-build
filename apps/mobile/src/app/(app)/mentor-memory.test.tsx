import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  extractJsonBody,
  fetchCallsMatching,
} from '../../test-utils/mock-api-routes';

// [BUG-815] Regression test: when a legacy profile row has `interests`
// undefined or null, the Interests section renders the empty placeholder
// rather than crashing with "Cannot read property 'map' of undefined".
// The fix is `(profile?.interests ?? []).map(...)`.

const mockProfileBase = {
  // Required scalar fields that the screen reads.
  learningStyle: null,
  strengths: [],
  struggles: [],
  communicationNotes: [],
  interestTimestamps: {},
  // Mentor-memory consent on so the screen renders the data sections.
  memoryConsentGranted: true,
  memoryConsentStatus: 'granted',
  memoryInjectionEnabled: true,
};

let mockProfileData: Record<string, unknown> = {
  ...mockProfileBase,
  interests: [],
};

const mockPlatformAlert = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
  push: jest.fn(),
  canGoBack: jest.fn(() => true),
};
let mockSearchParams: Record<string, string | string[] | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  Redirect: () => null,
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'test-profile-id',
      accountId: 'test-account-id',
      displayName: 'Test Learner',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    },
  }),
  personaFromBirthYear: () => 'learner',
  ProfileContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

// Fetch-boundary mock: intercepts all useApiClient() calls at the transport layer.
// The route handler closes over `mockProfileData` by reference — update the
// variable before each test to change what useLearnerProfile() returns.
const mockFetch = createRoutedMockFetch({
  'learner-profile/tell': () => ({
    success: true,
    message: 'Saved',
    fieldsUpdated: [],
  }),
  'onboarding/interests/context': () => ({ success: true }),
  'learner-profile': () => ({ profile: mockProfileData }),
});

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

// use-parent-proxy uses setProxyMode from api-client (not the RPC useApiClient hook)
// plus SecureStore reads — not an API hook. Keep as a direct mock.
jest.mock('../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: false }),
}));

// use-active-profile-role is derived from useProfile + useParentProxy — no API calls.
let mockActiveRole: 'owner' | 'child' | 'impersonated-child' | null = 'owner';
jest.mock('../../hooks/use-active-profile-role', () => ({
  useActiveProfileRole: () => mockActiveRole,
}));

jest.mock('../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

// Break test: catch blocks must surface the server's specific error message,
// not the generic "Please try again." fallback.
// Strategy: mock TellMentorInput to expose a testID-tagged submit button so
// we can trigger onSubmit directly without depending on TellMentorInput internals.
jest.mock('../../components/tell-mentor-input', () => ({
  TellMentorInput: ({
    onSubmit,
    onChangeText,
  }: {
    onSubmit: () => void;
    onChangeText: (text: string) => void;
  }) => {
    const { Pressable, TextInput } = require('react-native');
    return (
      <>
        <TextInput
          testID="tell-mentor-text-input"
          onChangeText={onChangeText}
        />
        <Pressable testID="tell-mentor-submit" onPress={onSubmit} />
      </>
    );
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const MentorMemoryScreen = require('./mentor-memory').default;

describe('MentorMemoryScreen — interests null guard', () => {
  afterEach(() => {
    mockProfileData = { ...mockProfileBase, interests: [] };
    mockSearchParams = {};
    jest.clearAllMocks();
  });

  it('does not crash when profile.interests is undefined', () => {
    mockProfileData = { ...mockProfileBase, interests: undefined };
    expect(() =>
      render(<MentorMemoryScreen />, { wrapper: makeWrapper() }),
    ).not.toThrow();
  });

  it('does not crash when profile.interests is null', () => {
    mockProfileData = { ...mockProfileBase, interests: null };
    expect(() =>
      render(<MentorMemoryScreen />, { wrapper: makeWrapper() }),
    ).not.toThrow();
  });

  it('renders interest labels when interests is a populated array', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [
        { label: 'Football', context: 'free_time' },
        { label: 'Astronomy', context: 'school' },
      ],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });
    await screen.findByText('Football');
    await screen.findByText('Astronomy');
  });

  it('renders context controls for interests', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [{ label: 'Football', context: 'free_time' }],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('mentor-memory-interests-section');
    expect(
      screen.getByTestId('interest-context-Football-free_time').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('tapping a context writes the full interests array', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [
        { label: 'Football', context: 'free_time' },
        { label: 'Astronomy', context: 'school' },
      ],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const bothOption = await screen.findByTestId(
      'interest-context-Football-both',
    );
    await act(async () => {
      fireEvent.press(bothOption);
    });

    const calls = fetchCallsMatching(mockFetch, 'onboarding/interests/context');
    expect(calls).toHaveLength(1);
    expect(extractJsonBody(calls[0]?.init)).toEqual({
      interests: [
        { label: 'Football', context: 'both' },
        { label: 'Astronomy', context: 'school' },
      ],
    });
  });

  it('shows the tapped context optimistically', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [{ label: 'Football', context: 'free_time' }],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const bothOption = await screen.findByTestId(
      'interest-context-Football-both',
    );
    await act(async () => {
      fireEvent.press(bothOption);
    });

    expect(
      screen.getByTestId('interest-context-Football-both').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('hides the interests section when there are no interests', () => {
    mockProfileData = { ...mockProfileBase, interests: [] };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId('mentor-memory-interests-section')).toBeNull();
  });
});

// [BUG-918] Regression test: the "Set by your parent in their settings."
// helper text below the accommodation badge must be hidden for owner profiles
// (parents on their own account have no parent to attribute the setting to)
// and shown for child profiles. Driven by `useActiveProfileRole() !== 'owner'`.
// The text element carries testID="accommodation-set-by-parent" for stable
// assertions that are independent of i18n key resolution state.
describe('MentorMemoryScreen — accommodation helper copy is role-gated [BUG-918]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveRole = 'owner';
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      accommodationMode: 'audio-first',
    };
  });

  afterEach(() => {
    mockActiveRole = 'owner';
  });

  it('hides "Set by your parent" for owner profiles even with accommodation badge visible', async () => {
    mockActiveRole = 'owner';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('accommodation-badge');
    expect(screen.queryByTestId('accommodation-set-by-parent')).toBeNull();
  });

  it('shows "Set by your parent" for child profiles with accommodation badge visible', async () => {
    mockActiveRole = 'child';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('accommodation-badge');
    await screen.findByTestId('accommodation-set-by-parent');
  });

  it('hides "Set by your parent" when accommodation badge is not shown', () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      accommodationMode: 'none',
    };
    mockActiveRole = 'child';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId('accommodation-badge')).toBeNull();
    expect(screen.queryByTestId('accommodation-set-by-parent')).toBeNull();
  });
});

describe('MentorMemoryScreen — catch blocks use formatApiError not generic copy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };
    // Reset the tell route to the default success response
    mockFetch.setRoute('learner-profile/tell', () => ({
      success: true,
      message: 'Saved',
      fieldsUpdated: [],
    }));
  });

  it('shows the server-specific error message from handleTellMentor, not "Please try again."', async () => {
    // Arrange: configure fetch to return a 403 with SUBJECT_INACTIVE for the
    // tell-mentor endpoint so assertOk throws and formatApiError maps it to
    // the friendly "paused" message.
    mockFetch.setRoute(
      'learner-profile/tell',
      () =>
        new Response(
          JSON.stringify({
            message: 'subject is paused',
            code: 'SUBJECT_INACTIVE',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    // Wait for useLearnerProfile query to resolve and TellMentorInput to render.
    const textInput = await screen.findByTestId('tell-mentor-text-input');

    // Type something so handleTellMentor doesn't early-exit on empty draft
    fireEvent.changeText(textInput, 'I prefer visual examples');

    await act(async () => {
      fireEvent.press(screen.getByTestId('tell-mentor-submit'));
    });

    // The alert must NOT use the generic copy; it must use the formatted
    // server message (which for SUBJECT_INACTIVE maps to the friendly text).
    expect(mockPlatformAlert).toHaveBeenCalledTimes(1);
    const alertMessage = mockPlatformAlert.mock.calls[0][1] as string;
    expect(alertMessage).not.toBe('Please try again.');
    // formatApiError for SUBJECT_INACTIVE maps to the friendly paused message
    expect(alertMessage).toMatch(/paused|archived|resume/i);
  });
});

describe('MentorMemoryScreen — explicit return target from More', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { returnTo: 'more' };
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };
  });

  afterEach(() => {
    mockSearchParams = {};
  });

  it('replaces to /(app)/more instead of calling router.back() when opened from More', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const backButton = await screen.findByLabelText('Go Back');
    fireEvent.press(backButton);

    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/more');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
