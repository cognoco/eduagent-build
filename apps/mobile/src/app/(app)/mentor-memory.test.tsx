import { render, screen } from '@testing-library/react-native';

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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  Redirect: () => null,
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'prof-1', personaType: 'learner' },
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
  useDeleteMemoryItem: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteAllMemory: () => ({ mutate: jest.fn(), isPending: false }),
  useTellMentor: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
    isSuccess: false,
    reset: jest.fn(),
  }),
  useToggleMemoryInjection: () => ({ mutate: jest.fn(), isPending: false }),
  useUnsuppressInference: () => ({ mutate: jest.fn(), isPending: false }),
  useGrantMemoryConsent: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: false }),
}));

const MentorMemoryScreen = require('./mentor-memory').default;

describe('MentorMemoryScreen — interests null guard', () => {
  afterEach(() => {
    mockProfileData = { ...mockProfileBase, interests: [] };
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
