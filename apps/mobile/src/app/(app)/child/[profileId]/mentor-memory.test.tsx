import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object') {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ profileId: 'child-001' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../../lib/platform-alert',
  /* gc1-allow: alert boundary */ () => ({
    platformAlert: jest.fn(),
  }),
);

jest.mock(
  '../../../../lib/navigation',
  /* gc1-allow: navigation boundary */ () => ({
    goBackOrReplace: jest.fn(),
  }),
);

jest.mock(
  '../../../../lib/api-client',
  /* gc1-allow: RPC client boundary */ () => ({
    useApiClient: () => ({
      learnerProfile: {},
    }),
  }),
);

jest.mock(
  '../../../../lib/profile',
  /* gc1-allow: profile context */ () => ({
    useProfile: () => ({
      profiles: [{ id: 'child-001' }],
    }),
  }),
);

jest.mock(
  '../../../../components/tell-mentor-input',
  /* gc1-allow: child component */ () => ({
    TellMentorInput: () => null,
  }),
);

const mockUseChildDetail = jest.fn();
const mockUseChildMemory = jest.fn();

jest.mock(
  '../../../../hooks/use-dashboard',
  /* gc1-allow: dashboard query state */ () => ({
    useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
    useChildMemory: (...args: unknown[]) => mockUseChildMemory(...args),
  }),
);

const mockUseChildLearnerProfile = jest.fn();
const mockUseDeleteAllMemory = jest.fn();
const mockUseDeleteMemoryItem = jest.fn();
const mockUseGrantMemoryConsent = jest.fn();
const mockUseTellMentor = jest.fn();
const mockUseToggleMemoryCollection = jest.fn();
const mockUseToggleMemoryInjection = jest.fn();
const mockUseUnsuppressInference = jest.fn();

jest.mock(
  '../../../../hooks/use-learner-profile',
  /* gc1-allow: learner mutations */ () => ({
    useChildLearnerProfile: (...args: unknown[]) =>
      mockUseChildLearnerProfile(...args),
    useDeleteAllMemory: (...args: unknown[]) => mockUseDeleteAllMemory(...args),
    useDeleteMemoryItem: (...args: unknown[]) =>
      mockUseDeleteMemoryItem(...args),
    useGrantMemoryConsent: (...args: unknown[]) =>
      mockUseGrantMemoryConsent(...args),
    useTellMentor: (...args: unknown[]) => mockUseTellMentor(...args),
    useToggleMemoryCollection: (...args: unknown[]) =>
      mockUseToggleMemoryCollection(...args),
    useToggleMemoryInjection: (...args: unknown[]) =>
      mockUseToggleMemoryInjection(...args),
    useUnsuppressInference: (...args: unknown[]) =>
      mockUseUnsuppressInference(...args),
  }),
);

const mockUpdateInterestsContextMutateAsync = jest.fn();

jest.mock(
  '../../../../hooks/use-onboarding-dimensions',
  /* gc1-allow: interest mutation */ () => ({
    useUpdateInterestsContext: () => ({
      mutateAsync: mockUpdateInterestsContextMutateAsync,
      isPending: false,
    }),
  }),
);

const ChildMentorMemoryScreen = require('./mentor-memory').default;

const childProfileBase = {
  learningStyle: null,
  interests: [
    { label: 'Football', context: 'free_time' },
    { label: 'Astronomy', context: 'school' },
  ],
  interestTimestamps: {},
  strengths: [],
  struggles: [],
  communicationNotes: [],
  suppressedInferences: [],
  memoryConsentStatus: 'granted',
  memoryCollectionEnabled: true,
  memoryInjectionEnabled: true,
};

function setupDefaultMocks(
  profileOverrides: Record<string, unknown> = {},
): void {
  mockUseChildDetail.mockReturnValue({
    data: { displayName: 'Emma', profileId: 'child-001' },
  });
  mockUseChildLearnerProfile.mockReturnValue({
    data: { ...childProfileBase, ...profileOverrides },
    isLoading: false,
  });
  mockUseChildMemory.mockReturnValue({
    data: { categories: [] },
  });
  mockUseDeleteMemoryItem.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseDeleteAllMemory.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseTellMentor.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseToggleMemoryCollection.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseToggleMemoryInjection.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseGrantMemoryConsent.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseUnsuppressInference.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUpdateInterestsContextMutateAsync.mockResolvedValue({ success: true });
}

describe('ChildMentorMemoryScreen — interest context rows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders a context row for each child interest', () => {
    render(<ChildMentorMemoryScreen />);

    screen.getByTestId('child-mentor-memory-interests-section');
    screen.getByText('Football');
    screen.getByText('Astronomy');
    expect(
      screen.getByTestId('interest-context-Football-free_time').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('tapping a context option updates the child profile with the full array', async () => {
    render(<ChildMentorMemoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('interest-context-Football-both'));
    });

    expect(mockUpdateInterestsContextMutateAsync).toHaveBeenCalledWith({
      childProfileId: 'child-001',
      interests: [
        { label: 'Football', context: 'both' },
        { label: 'Astronomy', context: 'school' },
      ],
    });
    expect(
      screen.getByTestId('interest-context-Football-both').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('hides the interest context section when the child has no interests', () => {
    setupDefaultMocks({ interests: [] });

    render(<ChildMentorMemoryScreen />);

    expect(
      screen.queryByTestId('child-mentor-memory-interests-section'),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [BUG-907] Mentor Memory CONTROLS switches must expose an accessibilityLabel.
//
// Before fix: the two Switch components ("Learn about child" / "Use what the
// mentor knows") rendered with role=switch but no label — VoiceOver and
// TalkBack announced them as "switch, off/on" with no context.
// ---------------------------------------------------------------------------

describe('[BUG-907] CONTROLS switches expose accessibilityLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('labels the "Learn about child" switch with the adjacent caption', () => {
    render(<ChildMentorMemoryScreen />);

    const learnSwitch = screen.getByLabelText(
      'parentView.mentorMemory.learnAboutChild',
    );
    expect(learnSwitch.props.accessibilityLabel).toBe(
      'parentView.mentorMemory.learnAboutChild',
    );
    expect(learnSwitch.props.accessibilityHint).toBe(
      'parentView.mentorMemory.learnAboutChildDescription',
    );
  });

  it('labels the "Use what the mentor knows" switch with the adjacent caption', () => {
    render(<ChildMentorMemoryScreen />);

    const useSwitch = screen.getByLabelText(
      'parentView.mentorMemory.useWhatMentorKnows',
    );
    expect(useSwitch.props.accessibilityLabel).toBe(
      'parentView.mentorMemory.useWhatMentorKnows',
    );
    expect(useSwitch.props.accessibilityHint).toBe(
      'parentView.mentorMemory.useWhatMentorKnowsDescription',
    );
  });
});
