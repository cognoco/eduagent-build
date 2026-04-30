import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

const mockTellMentorMutateAsync = jest.fn();
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
    activeProfile: { id: 'prof-1', personaType: 'learner', isOwner: true },
  }),
  personaFromBirthYear: () => 'learner',
}));

jest.mock('../../hooks/use-learner-profile', () => ({
  useLearnerProfile: () => ({
    data: mockProfileData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useDeleteMemoryItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteAllMemory: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useTellMentor: () => ({
    mutateAsync: mockTellMentorMutateAsync,
    isPending: false,
    isSuccess: false,
    reset: jest.fn(),
  }),
  useToggleMemoryInjection: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUnsuppressInference: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useGrantMemoryConsent: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: false }),
}));

jest.mock('../../hooks/use-active-profile-role', () => ({
  useActiveProfileRole: () => 'owner',
}));

jest.mock('../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

const MentorMemoryScreen = require('./mentor-memory').default;

describe('MentorMemoryScreen — interests null guard', () => {
  afterEach(() => {
    mockProfileData = { ...mockProfileBase, interests: [] };
    jest.clearAllMocks();
  });

  it('does not crash when profile.interests is undefined', () => {
    mockProfileData = { ...mockProfileBase, interests: undefined };
    expect(() => render(<MentorMemoryScreen />)).not.toThrow();
  });

  it('does not crash when profile.interests is null', () => {
    mockProfileData = { ...mockProfileBase, interests: null };
    expect(() => render(<MentorMemoryScreen />)).not.toThrow();
  });

  it('renders interest labels when interests is a populated array', () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [
        { label: 'Football', context: 'free-time' },
        { label: 'Astronomy', context: 'school' },
      ],
    };

    render(<MentorMemoryScreen />);
    expect(screen.getByText('Football')).toBeTruthy();
    expect(screen.getByText('Astronomy')).toBeTruthy();
  });
});

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

describe('MentorMemoryScreen — catch blocks use formatApiError not generic copy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };
  });

  it('shows the server-specific error message from handleTellMentor, not "Please try again."', async () => {
    // Arrange: API returns a specific subject-paused error
    const specificError = new Error(
      'API error 403: {"message":"subject is paused","code":"SUBJECT_INACTIVE"}'
    );
    mockTellMentorMutateAsync.mockRejectedValueOnce(specificError);

    render(<MentorMemoryScreen />);

    // Type something so handleTellMentor doesn't early-exit on empty draft
    fireEvent.changeText(
      screen.getByTestId('tell-mentor-text-input'),
      'I prefer visual examples'
    );

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
