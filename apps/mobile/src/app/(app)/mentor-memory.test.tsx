import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
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

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
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
  'learner-profile/tell': () => ({ success: true, message: 'Saved', fieldsUpdated: [] }),
  'learner-profile': () => ({ profile: mockProfileData }),
});

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch)
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
    jest.clearAllMocks();
  });

  it('does not crash when profile.interests is undefined', () => {
    mockProfileData = { ...mockProfileBase, interests: undefined };
    expect(() =>
      render(<MentorMemoryScreen />, { wrapper: makeWrapper() })
    ).not.toThrow();
  });

  it('does not crash when profile.interests is null', () => {
    mockProfileData = { ...mockProfileBase, interests: null };
    expect(() =>
      render(<MentorMemoryScreen />, { wrapper: makeWrapper() })
    ).not.toThrow();
  });

  it('renders interest labels when interests is a populated array', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [
        { label: 'Football', context: 'free-time' },
        { label: 'Astronomy', context: 'school' },
      ],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });
    await screen.findByText('Football');
    await screen.findByText('Astronomy');
  });
});

// [BUG-918] Regression test: the "Set by your parent in their settings."
// helper text below the accommodation badge must be hidden for owner profiles
// (parents on their own account have no parent to attribute the setting to)
// and shown for child profiles. Driven by `useActiveProfileRole() !== 'owner'`.
describe('MentorMemoryScreen — accommodation helper copy is role-gated [BUG-918]', () => {
  const SET_BY_PARENT = /Set by your parent in their settings\./;

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
    expect(screen.queryByText(SET_BY_PARENT)).toBeNull();
  });

  it('shows "Set by your parent" for child profiles with accommodation badge visible', async () => {
    mockActiveRole = 'child';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('accommodation-badge');
    await screen.findByText(SET_BY_PARENT);
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
    expect(screen.queryByText(SET_BY_PARENT)).toBeNull();
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
    mockFetch.setRoute(
      'learner-profile/tell',
      () => ({ success: true, message: 'Saved', fieldsUpdated: [] })
    );
  });

  it('shows the server-specific error message from handleTellMentor, not "Please try again."', async () => {
    // Arrange: configure fetch to return a 403 with SUBJECT_INACTIVE for the
    // tell-mentor endpoint so assertOk throws and formatApiError maps it to
    // the friendly "paused" message.
    mockFetch.setRoute('learner-profile/tell', () =>
      new Response(
        JSON.stringify({ message: 'subject is paused', code: 'SUBJECT_INACTIVE' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
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
