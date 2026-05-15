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
let mockLocalSearchParams: { profileId: string; mode?: string } = {
  profileId: 'child-001',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => mockLocalSearchParams,
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

jest.mock(
  '../../../../lib/platform-alert' /* gc1-allow: confirmation callback is the behavior under test, not the native alert renderer */,
  () => ({
    platformAlert: (
      _title: string,
      _message?: string,
      buttons?: Array<{ style?: string; onPress?: () => void }>,
    ) => {
      const action = buttons?.find((button) => button.style !== 'cancel');
      action?.onPress?.();
    },
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
const mockUseDashboard = jest.fn();

jest.mock(
  '../../../../hooks/use-dashboard' /* gc1-allow: query hooks require API client and QueryClientProvider; route rendering owns response handling */,
  () => ({
    useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
    useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
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
// Consent hooks
// ---------------------------------------------------------------------------

const mockUseChildConsentStatus = jest.fn();
const mockRevokeMutate = jest.fn();
const mockRestoreMutate = jest.fn();

jest.mock(
  '../../../../hooks/use-consent' /* gc1-allow: query/mutation hooks require API client and QueryClientProvider; child detail only owns rendering and invocation */,
  () => ({
    useChildConsentStatus: (...args: unknown[]) =>
      mockUseChildConsentStatus(...args),
    useRevokeConsent: () => ({
      mutate: mockRevokeMutate,
      isPending: false,
    }),
    useRestoreConsent: () => ({
      mutate: mockRestoreMutate,
      isPending: false,
    }),
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
  mockLocalSearchParams = { profileId: 'child-001' };

  mockUseDashboard.mockReturnValue({
    data: undefined,
    isLoading: false,
  });

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

  mockUseChildConsentStatus.mockReturnValue({
    data: {
      consentStatus: 'CONSENTED',
      respondedAt: '2026-01-01T00:00:00.000Z',
      consentType: 'GDPR',
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
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
    expect(screen.queryByTestId('child-weekly-headline-card')).toBeNull();
    expect(screen.queryByTestId('child-reports-button')).toBeNull();
    expect(screen.queryByTestId('growth-teaser')).toBeNull();
    screen.getByTestId('consent-section');
  });

  it('shows only child settings when opened from the child avatar card', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };

    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-reports-link')).toBeNull();
    expect(screen.queryByTestId('child-subjects-section')).toBeNull();
    expect(
      screen.queryByTestId('session-card-22222222-2222-7222-8222-222222222222'),
    ).toBeNull();
    screen.getByTestId('child-accommodation-row-child-001');
    screen.getByTestId('mentor-memory-link');
    screen.getByTestId('child-profile-details');
    screen.getByTestId('consent-section');
  });

  it('shows only child progress when opened from the Progress action', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };

    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-reports-link')).toBeNull();
    screen.getByTestId('child-subjects-section');
    screen.getByTestId('session-card-22222222-2222-7222-8222-222222222222');
    expect(
      screen.queryByTestId('child-accommodation-row-child-001'),
    ).toBeNull();
    expect(screen.queryByTestId('mentor-memory-link')).toBeNull();
    expect(screen.queryByTestId('child-profile-details')).toBeNull();
    expect(screen.queryByTestId('consent-section')).toBeNull();
  });

  it('keeps the child progress surface open when the detail query fails but dashboard data has the child', () => {
    mockUseChildDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'child-001',
            displayName: 'Emma',
            consentStatus: null,
            respondedAt: null,
            summary: 'Emma is building confidence.',
            sessionsThisWeek: 0,
            sessionsLastWeek: 0,
            totalTimeThisWeek: 0,
            totalTimeLastWeek: 0,
            exchangesThisWeek: 0,
            exchangesLastWeek: 0,
            trend: 'stable',
            subjects: [
              {
                subjectId: '11111111-1111-7111-8111-111111111111',
                name: 'Programming',
                retentionStatus: 'strong',
                rawInput: null,
              },
            ],
            guidedVsImmediateRatio: 0,
            retentionTrend: 'stable',
            totalSessions: 0,
            weeklyHeadline: undefined,
            currentlyWorkingOn: ['Programming'],
            progress: null,
            currentStreak: 0,
            longestStreak: 0,
            totalXp: 0,
          },
        ],
        pendingNotices: [],
        demoMode: false,
      },
      isLoading: false,
    });

    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-profile-unavailable')).toBeNull();
    screen.getByTestId('child-detail-scroll');
    screen.getByText('Emma');
    screen.getByTestId('child-subjects-section');
    screen.getByText('Programming');
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

  it('renders parent consent management for a consented child', () => {
    render(<ChildDetailScreen />);

    screen.getByTestId('consent-section');
    screen.getByTestId('withdraw-consent-button');
    expect(screen.queryByTestId('grace-period-banner')).toBeNull();
  });

  it('invokes consent revocation from the withdraw confirmation', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('withdraw-consent-button'));

    expect(mockRevokeMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('renders the grace-period restore action for a withdrawn child', () => {
    mockUseChildConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'WITHDRAWN',
        respondedAt: new Date().toISOString(),
        consentType: 'GDPR',
      },
      isLoading: false,
      isError: false,
    });

    render(<ChildDetailScreen />);

    screen.getByTestId('grace-period-banner');
    fireEvent.press(screen.getByTestId('cancel-deletion-button'));

    expect(mockRestoreMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('keeps consent management visible and retryable when consent status fails to load', () => {
    const refetch = jest.fn();
    mockUseChildConsentStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<ChildDetailScreen />);

    screen.getByTestId('consent-section');
    screen.getByTestId('consent-status-error');

    fireEvent.press(screen.getByTestId('consent-status-retry'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
