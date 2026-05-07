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

jest.mock('../../../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

jest.mock('../../../../lib/navigation', () => ({
  goBackOrReplace: jest.fn(),
}));

jest.mock('../../../../lib/api-client', () => ({
  useApiClient: () => ({
    learnerProfile: {},
  }),
}));

jest.mock('../../../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [{ id: 'child-001' }],
  }),
}));

jest.mock('../../../../components/tell-mentor-input', () => ({
  TellMentorInput: () => null,
}));

const mockUseChildDetail = jest.fn();
const mockUseChildMemory = jest.fn();

jest.mock('../../../../hooks/use-dashboard', () => ({
  useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
  useChildMemory: (...args: unknown[]) => mockUseChildMemory(...args),
}));

const mockUseChildLearnerProfile = jest.fn();
const mockUseDeleteAllMemory = jest.fn();
const mockUseDeleteMemoryItem = jest.fn();
const mockUseGrantMemoryConsent = jest.fn();
const mockUseTellMentor = jest.fn();
const mockUseToggleMemoryCollection = jest.fn();
const mockUseToggleMemoryInjection = jest.fn();
const mockUseUnsuppressInference = jest.fn();

jest.mock('../../../../hooks/use-learner-profile', () => ({
  useChildLearnerProfile: (...args: unknown[]) =>
    mockUseChildLearnerProfile(...args),
  useDeleteAllMemory: (...args: unknown[]) => mockUseDeleteAllMemory(...args),
  useDeleteMemoryItem: (...args: unknown[]) => mockUseDeleteMemoryItem(...args),
  useGrantMemoryConsent: (...args: unknown[]) =>
    mockUseGrantMemoryConsent(...args),
  useTellMentor: (...args: unknown[]) => mockUseTellMentor(...args),
  useToggleMemoryCollection: (...args: unknown[]) =>
    mockUseToggleMemoryCollection(...args),
  useToggleMemoryInjection: (...args: unknown[]) =>
    mockUseToggleMemoryInjection(...args),
  useUnsuppressInference: (...args: unknown[]) =>
    mockUseUnsuppressInference(...args),
}));

const mockUpdateInterestsContextMutateAsync = jest.fn();

jest.mock('../../../../hooks/use-onboarding-dimensions', () => ({
  useUpdateInterestsContext: () => ({
    mutateAsync: mockUpdateInterestsContextMutateAsync,
    isPending: false,
  }),
}));

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
  profileOverrides: Record<string, unknown> = {}
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
        .accessibilityState?.selected
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
        .accessibilityState?.selected
    ).toBe(true);
  });

  it('hides the interest context section when the child has no interests', () => {
    setupDefaultMocks({ interests: [] });

    render(<ChildMentorMemoryScreen />);

    expect(
      screen.queryByTestId('child-mentor-memory-interests-section')
    ).toBeNull();
  });
});
