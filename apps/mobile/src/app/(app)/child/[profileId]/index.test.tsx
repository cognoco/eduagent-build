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
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockGoBackOrReplace = jest.fn();
let mockLocalSearchParams: { profileId: string; mode?: string } = {
  profileId: 'child-001',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
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
    FAMILY_HOME_PATH: '/(app)/home',
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

const mockUseProfile = jest.fn();

jest.mock(
  '../../../../lib/profile' /* gc1-allow: profile context requires app provider setup; this test controls the owned child profile only */,
  () => ({
    useProfile: (...args: unknown[]) => mockUseProfile(...args),
  }),
);
// ---------------------------------------------------------------------------
// Dashboard hooks
// ---------------------------------------------------------------------------

const mockUseChildDetail = jest.fn();
const mockUseDashboard = jest.fn();
const mockIsSurfaced = jest.fn(() => true);

jest.mock(
  '../../../../hooks/use-dashboard' /* gc1-allow: query hooks require API client and QueryClientProvider; route rendering owns response handling */,
  () => ({
    useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
    useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
  }),
);

jest.mock(
  '../../../../hooks/use-navigation-contract' /* gc1-allow: route test controls contract surfacing without app context providers */,
  () => ({
    useNavigationContract: () => ({ isSurfaced: mockIsSurfaced }),
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
// Common components barrel (includes Reanimated animations — cannot render in JSDOM)
// ---------------------------------------------------------------------------

jest.mock(
  '../../../../components/common' /* gc1-allow: barrel exports RN components including Reanimated animations — cannot render in JSDOM */,
  () => ({
    ErrorFallback: ({
      title,
      message,
      primaryAction,
      secondaryAction,
      testID,
    }: {
      title?: string;
      message?: string;
      primaryAction?: {
        label: string;
        onPress: () => void;
        testID?: string;
      };
      secondaryAction?: {
        label: string;
        onPress: () => void;
        testID?: string;
      };
      testID?: string;
    }) => {
      const { View, Text, Pressable } = require('react-native');
      return (
        <View testID={testID ?? 'error-fallback'}>
          {title ? <Text testID="error-fallback-title">{title}</Text> : null}
          {message ? (
            <Text testID="error-fallback-message">{message}</Text>
          ) : null}
          {primaryAction ? (
            <Pressable
              testID={primaryAction.testID ?? 'error-fallback-primary'}
              onPress={primaryAction.onPress}
            >
              <Text>{primaryAction.label}</Text>
            </Pressable>
          ) : null}
          {secondaryAction ? (
            <Pressable
              testID={secondaryAction.testID ?? 'error-fallback-secondary'}
              onPress={secondaryAction.onPress}
            >
              <Text>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
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

// ---------------------------------------------------------------------------
// Default mock values
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockLocalSearchParams = { profileId: 'child-001' };
  mockIsSurfaced.mockReturnValue(true);

  mockUseProfile.mockReturnValue({
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
    isLoading: false,
  });

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
    screen.getByTestId('child-progress-nudge-card');
    screen.getByTestId('child-subjects-section');
    screen.getByTestId('session-card-22222222-2222-7222-8222-222222222222');
    expect(
      screen.queryByTestId('child-accommodation-row-child-001'),
    ).toBeNull();
    expect(screen.queryByTestId('mentor-memory-link')).toBeNull();
    expect(screen.queryByTestId('child-profile-details')).toBeNull();
    expect(screen.queryByTestId('consent-section')).toBeNull();
  });

  it('back arrow returns to family home instead of whatever screen is in history', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    mockCanGoBack.mockReturnValue(true);

    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('back-button'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('hides subject memory status while the child is still a new learner', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary: 'Getting started',
        currentStreak: 0,
        totalXp: 0,
        totalSessions: 2,
        progress: null,
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    screen.getByTestId('subject-card-11111111-1111-7111-8111-111111111111');
    expect(screen.queryByText('parentView.retention.strong.label')).toBeNull();
    expect(screen.queryByText('strong')).toBeNull();
  });

  it('uses the friendly memory status label after there is enough activity', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary: 'Settled rhythm',
        currentStreak: 0,
        totalXp: 0,
        totalSessions: 4,
        progress: null,
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    screen.getByText(/parentView\.retention\.strong\.label/);
    expect(screen.queryByText('strong')).toBeNull();
  });

  it('uses a fresh progress nudge when the child studied recently', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    mockUseProfileSessions.mockReturnValue({
      data: [
        {
          sessionId: '33333333-3333-7333-8333-333333333333',
          subjectId: '11111111-1111-7111-8111-111111111111',
          subjectName: 'Mathematics',
          topicId: '44444444-4444-7444-8444-444444444444',
          topicTitle: 'Fractions',
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

    screen.getByText(/parentView\.index\.progressNudgeFreshTitle/);
    expect(screen.queryByText(/ease back/)).toBeNull();
  });

  it('opens the nudge subject from the progress action card', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };

    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('child-progress-nudge-card'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId: 'child-001',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
        childName: 'Emma',
      },
    });
  });

  it('opens the latest topic from the progress action card when the session has one', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    mockUseProfileSessions.mockReturnValue({
      data: [
        {
          sessionId: '33333333-3333-7333-8333-333333333333',
          subjectId: '11111111-1111-7111-8111-111111111111',
          subjectName: 'Mathematics',
          topicId: '44444444-4444-7444-8444-444444444444',
          topicTitle: 'Fractions',
          startedAt: '2026-05-13T12:00:00.000Z',
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

    fireEvent.press(screen.getByTestId('child-progress-nudge-card'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/topic/[topicId]',
      params: {
        profileId: 'child-001',
        topicId: '44444444-4444-7444-8444-444444444444',
        title: 'Fractions',
        completionStatus: 'in_progress',
        masteryScore: '',
        retentionStatus: '',
        totalSessions: '1',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
        childName: 'Emma',
      },
    });
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

  it('keeps child profile settings open when the linked profile exists but detail data is unavailable', () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };
    mockUseChildDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-profile-unavailable')).toBeNull();
    screen.getByTestId('child-detail-scroll');
    screen.getByText('Emma');
    screen.getByTestId('mentor-memory-link');
    screen.getByTestId('child-profile-details');
  });

  it('routes subject and report surfaces from child detail', () => {
    render(<ChildDetailScreen />);

    expect(mockIsSurfaced).toHaveBeenCalledWith(
      'child/[profileId]/curriculum',
      { profileId: 'child-001' },
    );
    fireEvent.press(screen.getByTestId('child-curriculum-link'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/curriculum',
      params: { profileId: 'child-001' },
    });

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
        childName: 'Emma',
      },
    });
  });

  it('hides curriculum when the navigation contract does not surface it', () => {
    mockIsSurfaced.mockReturnValue(false);

    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-curriculum-link')).toBeNull();
    screen.getByTestId('child-reports-link');
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

  it('renders the consent-withdrawn empty state (not grace-period banner) for a withdrawn child', () => {
    // WI-263: consent WITHDRAWN now shows the screen-level empty state instead
    // of the ConsentManagementSection grace-period banner. The empty state CTA
    // calls restoreConsent directly.
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

    screen.getByTestId('consent-withdrawn-empty-state');
    expect(screen.queryByTestId('grace-period-banner')).toBeNull();

    fireEvent.press(screen.getByTestId('consent-withdrawn-request-cta'));
    expect(mockRestoreMutate).toHaveBeenCalledWith(undefined);
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

// ---------------------------------------------------------------------------
// deletionGraceDays plural wiring — count=1 (singular) vs count=5 (plural)
//
// WI-263: WITHDRAWN consent now renders the screen-level empty state instead
// of the ConsentManagementSection with the grace-period banner. The
// deletionGraceDays plural key routing is tested at the ConsentManagementSection
// level. These tests now verify the screen correctly shows the empty state for
// withdrawn consent (the banner is not reachable from the screen level).
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — deletionGraceDays plural key routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  function setupWithdrawnConsent(daysAgo: number) {
    // respondedAt is daysAgo days in the past; grace period = 7 days
    // daysRemaining = ceil((7 - daysAgo) * MS_PER_DAY / MS_PER_DAY) = 7 - daysAgo
    const respondedAt = new Date(
      Date.now() - daysAgo * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockUseChildConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'WITHDRAWN',
        respondedAt,
        consentType: 'GDPR',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  }

  it('shows the consent-withdrawn empty state (not grace-period banner) when 1 day remains', () => {
    // WI-263: withdrawn consent now shows screen-level empty state;
    // grace-period-banner is no longer reachable from this screen when WITHDRAWN.
    setupWithdrawnConsent(6);

    render(<ChildDetailScreen />);

    screen.getByTestId('consent-withdrawn-empty-state');
    expect(screen.queryByTestId('grace-period-banner')).toBeNull();
  });

  it('shows the consent-withdrawn empty state (not grace-period banner) when 5 days remain', () => {
    // WI-263: same — empty state replaces the full screen for withdrawn consent.
    setupWithdrawnConsent(2);

    render(<ChildDetailScreen />);

    screen.getByTestId('consent-withdrawn-empty-state');
    expect(screen.queryByTestId('grace-period-banner')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BUG-681: data-absent state renders ErrorFallback (not blank)
// Trigger: isLoading=false + childDetail=null + no dashboard entry + profiles=[]
// Fix: detailUnavailable block now renders <ErrorFallback> with retry + back actions
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — data-absent state (BUG-681)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    // Empty profiles bypasses the no-access guard (profiles.length > 0 is false)
    // and leaves ownedProfile=undefined, so detailUnavailable=true when
    // childDetail is also null/undefined.
    mockUseProfile.mockReturnValue({
      activeProfile: {
        id: 'parent-001',
        displayName: 'Parent',
        isOwner: true,
      },
      profiles: [],
      isLoading: false,
    });

    mockUseChildDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({
      data: { children: [], pendingNotices: [], demoMode: false },
      isLoading: false,
    });
  });

  it('[BUG-681] renders ErrorFallback wrapper when childDetail is null and no known profile', () => {
    render(<ChildDetailScreen />);

    screen.getByTestId('child-profile-unavailable');
    screen.getByTestId('child-profile-unavailable-fallback');
    expect(screen.queryByTestId('child-detail-scroll')).toBeNull();
  });

  it('[BUG-681] ErrorFallback exposes both retry and back-to-dashboard actions', () => {
    render(<ChildDetailScreen />);

    screen.getByTestId('child-profile-retry');
    screen.getByTestId('child-profile-back');
  });

  it('[BUG-681] retry action calls refetch on the child detail query', () => {
    const refetch = jest.fn();
    mockUseChildDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch,
    });

    render(<ChildDetailScreen />);
    fireEvent.press(screen.getByTestId('child-profile-retry'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('[BUG-681] back-to-dashboard action navigates to family home', () => {
    render(<ChildDetailScreen />);
    fireEvent.press(screen.getByTestId('child-profile-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('[BUG-681] renders ErrorFallback when the detail query errors with no fallback data', () => {
    mockUseChildDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<ChildDetailScreen />);

    screen.getByTestId('child-profile-unavailable');
    screen.getByTestId('child-profile-unavailable-fallback');
    expect(screen.queryByTestId('child-detail-scroll')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WI-263: consent-withdrawn gates the learning-profile fetch
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — consent-withdrawn empty state (WI-263)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    mockUseChildConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'WITHDRAWN',
        respondedAt: new Date().toISOString(),
        consentType: 'GDPR',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('[WI-263] renders the consent-withdrawn empty state when consent is WITHDRAWN', () => {
    render(<ChildDetailScreen />);

    screen.getByTestId('consent-withdrawn-empty-state');
    screen.getByTestId('consent-withdrawn-request-cta');
    expect(screen.queryByTestId('child-detail-scroll')).toBeNull();
  });

  it('[WI-263] does NOT call useChildLearnerProfile with the real profileId when consent is WITHDRAWN', () => {
    render(<ChildDetailScreen />);

    // The hook must be called with undefined so the enabled guard blocks the fetch.
    const calls = mockUseChildLearnerProfile.mock.calls;
    expect(calls.every((args: unknown[]) => args[0] !== 'child-001')).toBe(
      true,
    );
  });

  it('[WI-263] request-cta triggers the restore-consent mutation', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('consent-withdrawn-request-cta'));

    expect(mockRestoreMutate).toHaveBeenCalledWith(undefined);
  });
});
