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
const mockUseChildSessions = jest.fn();

jest.mock(
  '../../../../hooks/use-dashboard' /* gc1-allow: query hooks require API client and QueryClientProvider; route rendering owns response handling */,
  () => ({
    useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
    useChildSessions: (...args: unknown[]) => mockUseChildSessions(...args),
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
  mockUseChildDetail.mockReturnValue({
    data: {
      displayName: 'Emma',
      summary: 'Year 6',
      currentStreak: 0,
      totalXp: 0,
      progress: null,
      subjects: [],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

  mockUseChildSessions.mockReturnValue({
    data: [],
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
    mockUseChildSessions.mockReturnValue({
      data: [
        {
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
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
    render(<ChildDetailScreen />);

    screen.getByText(/No sessions yet|parentView\.index\.noSessionsYet/);
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

  it('does not duplicate progress, reports, subjects, or recent sessions', () => {
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
        subjects: [{ name: 'Math', retentionStatus: 'strong' }],
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

    expect(screen.queryByTestId('child-weekly-headline-card')).toBeNull();
    expect(screen.queryByTestId('child-reports-button')).toBeNull();
    expect(screen.queryByTestId('growth-teaser')).toBeNull();
    screen.getByTestId('consent-section');
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
});
