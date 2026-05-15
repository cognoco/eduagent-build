import { render, screen, fireEvent } from '@testing-library/react-native';

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

// ---------------------------------------------------------------------------
// Router + navigation
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => ({ profileId: 'child-001' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: route fallback helper is asserted through focused route behavior here */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

// ---------------------------------------------------------------------------
// Profile (IDOR guard — profiles must include child-001)
// ---------------------------------------------------------------------------

jest.mock(
  '../../../../lib/profile' /* gc1-allow: profile context requires app provider setup; this test controls the owned child profile only */,
  () => ({
    useProfile: () => ({
      activeProfile: {
        id: 'parent-001',
        displayName: 'Parent',
        isOwner: true,
      },
      profiles: [
        {
          id: 'child-001',
          displayName: 'Emma',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Dashboard hooks
// ---------------------------------------------------------------------------

const mockUseChildDetail = jest.fn();

jest.mock(
  '../../../../hooks/use-dashboard' /* gc1-allow: query hooks require API client and QueryClientProvider; route rendering owns response handling */,
  () => ({
    useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
  }),
);

const mockUseProfileSessions = jest.fn();

jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: recent-session list owns API query wiring; child-detail tests assert rendered navigation surface */,
  () => ({
    useProfileSessions: (...args: unknown[]) => mockUseProfileSessions(...args),
  }),
);

// ---------------------------------------------------------------------------
// Learner-profile hooks
// ---------------------------------------------------------------------------

const mockUseChildLearnerProfile = jest.fn();

jest.mock(
  '../../../../hooks/use-learner-profile' /* gc1-allow: query hook requires API client and QueryClientProvider; row rendering only needs the selected preference */,
  () => ({
    useChildLearnerProfile: (...args: unknown[]) =>
      mockUseChildLearnerProfile(...args),
  }),
);

// ---------------------------------------------------------------------------
// Module under test (required AFTER all mocks are set up)
// ---------------------------------------------------------------------------

const { default: ChildDetailScreen } = require('./index') as {
  default: React.ComponentType;
};

// ---------------------------------------------------------------------------
// Default mock values
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockUseChildDetail.mockReturnValue({
    data: {
      displayName: 'Emma',
      summary: 'Year 6',
      currentStreak: 0,
      totalXp: 0,
      progress: null,
      subjects: [
        {
          subjectId: '11111111-1111-7111-8111-111111111111',
          name: 'Mathematics',
          retentionStatus: 'strong',
          rawInput: 'fractions homework',
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

  mockUseProfileSessions.mockReturnValue({
    data: [
      {
        sessionId: '22222222-2222-7222-8222-222222222222',
        startedAt: '2026-05-13T12:00:00.000Z',
        sessionType: 'learning',
        durationSeconds: 600,
        wallClockSeconds: 900,
        displaySummary: null,
        highlight: 'Used a number line to compare fractions.',
        homeworkSummary: null,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

  mockUseChildLearnerProfile.mockReturnValue({
    data: {
      accommodationMode: 'none',
      memoryConsentStatus: 'granted',
      updatedAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — accommodation nav row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders the accommodation nav row', () => {
    render(<ChildDetailScreen />);

    expect(
      screen.getByTestId('child-accommodation-row-child-001'),
    ).toBeTruthy();
  });

  it('navigates to the accommodation screen when pressed', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('child-accommodation-row-child-001'));

    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/more/accommodation?childProfileId=child-001',
    );
  });

  it('shows the active accommodation mode name', () => {
    mockUseChildLearnerProfile.mockReturnValue({
      data: {
        accommodationMode: 'audio-first',
        memoryConsentStatus: 'granted',
        updatedAt: null,
      },
      isLoading: false,
    });

    render(<ChildDetailScreen />);

    const row = screen.getByTestId('child-accommodation-row-child-001');
    expect(row).toHaveTextContent(/Audio-First/);
  });
});

describe('ChildDetailScreen — profile overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows a last-session signal in the header when sessions exist', () => {
    mockUseProfileSessions.mockReturnValue({
      data: [
        {
          sessionId: '33333333-3333-7333-8333-333333333333',
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          sessionType: 'learning',
          durationSeconds: 600,
          wallClockSeconds: 900,
          displaySummary: null,
          highlight: null,
          homeworkSummary: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    screen.getByText(/2 hours ago/);
  });

  it('shows a no-sessions-yet header signal when there is no session history', () => {
    mockUseProfileSessions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    expect(
      screen.getAllByText(/No sessions yet|parentView\.index\.noSessionsYet/),
    ).not.toHaveLength(0);
  });

  it('links to the child mentor memory management screen', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('mentor-memory-link'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/mentor-memory',
      params: { profileId: 'child-001' },
    });
  });

  it('shows profile details when the profile already has a created date', () => {
    render(<ChildDetailScreen />);

    screen.getByTestId('child-profile-details');
  });

  it('shows parent data surfaces for reports, subjects, raw input, and recent sessions', () => {
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary: 'Year 6',
        currentStreak: 0,
        totalXp: 0,
        progress: {
          snapshotDate: '2026-05-13',
          topicsMastered: 3,
          vocabularyTotal: 10,
          minutesThisWeek: 20,
          weeklyDeltaTopicsMastered: 1,
          weeklyDeltaVocabularyTotal: 2,
          weeklyDeltaTopicsExplored: 3,
          engagementTrend: 'stable',
          guidance: 'Keep going',
        },
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: 'fractions homework',
          },
        ],
        weeklyHeadline: {
          label: 'Topics mastered',
          value: 5,
          comparison: 'up from 3 last week',
        },
        currentlyWorkingOn: ['Algebra'],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    screen.getByTestId('child-reports-link');
    screen.getByTestId('child-subjects-section');
    screen.getByTestId('subject-card-11111111-1111-7111-8111-111111111111');
    screen.getByTestId(
      'subject-raw-input-11111111-1111-7111-8111-111111111111',
    );
    screen.getByTestId('session-card-22222222-2222-7222-8222-222222222222');
  });

  it('routes subject and report surfaces from child detail', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('child-reports-link'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/reports',
      params: { profileId: 'child-001' },
    });

    fireEvent.press(
      screen.getByTestId('subject-card-11111111-1111-7111-8111-111111111111'),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId: 'child-001',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
      },
    });
  });
});
