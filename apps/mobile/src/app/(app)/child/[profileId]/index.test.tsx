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

jest.mock('../../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Profile (IDOR guard — profiles must include child-001)
// ---------------------------------------------------------------------------

jest.mock('../../../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [{ id: 'child-001' }],
  }),
}));

// ---------------------------------------------------------------------------
// Dashboard hooks
// ---------------------------------------------------------------------------

const mockUseChildDetail = jest.fn();
const mockUseChildSessions = jest.fn();

jest.mock('../../../../hooks/use-dashboard', () => ({
  useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
  useChildSessions: (...args: unknown[]) => mockUseChildSessions(...args),
}));

// ---------------------------------------------------------------------------
// Progress hooks
// ---------------------------------------------------------------------------

const mockUseChildInventory = jest.fn();
const mockUseChildProgressHistory = jest.fn();
const mockUseChildReports = jest.fn();
const mockUseProfileReports = jest.fn();

jest.mock('../../../../hooks/use-progress', () => ({
  useChildInventory: (...args: unknown[]) => mockUseChildInventory(...args),
  useChildProgressHistory: (...args: unknown[]) =>
    mockUseChildProgressHistory(...args),
  useChildReports: (...args: unknown[]) => mockUseChildReports(...args),
  useProfileReports: (...args: unknown[]) => mockUseProfileReports(...args),
}));

// ---------------------------------------------------------------------------
// Celebration hooks
// ---------------------------------------------------------------------------

jest.mock('../../../../hooks/use-celebration', () => ({
  useCelebration: () => ({ CelebrationOverlay: null }),
}));

jest.mock('../../../../hooks/use-celebrations', () => ({
  usePendingCelebrations: () => ({ data: [] }),
  useMarkCelebrationsSeen: () => ({ mutateAsync: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Consent hooks
// ---------------------------------------------------------------------------

const mockUseChildConsentStatus = jest.fn();
const mockUseRevokeConsent = jest.fn();
const mockUseRestoreConsent = jest.fn();

jest.mock('../../../../hooks/use-consent', () => ({
  useChildConsentStatus: (...args: unknown[]) =>
    mockUseChildConsentStatus(...args),
  useRevokeConsent: (...args: unknown[]) => mockUseRevokeConsent(...args),
  useRestoreConsent: (...args: unknown[]) => mockUseRestoreConsent(...args),
}));

// ---------------------------------------------------------------------------
// Learner-profile hooks
// ---------------------------------------------------------------------------

const mockUseChildLearnerProfile = jest.fn();
const mockUseUpdateAccommodationMode = jest.fn();

jest.mock('../../../../hooks/use-learner-profile', () => ({
  useChildLearnerProfile: (...args: unknown[]) =>
    mockUseChildLearnerProfile(...args),
  useUpdateAccommodationMode: (...args: unknown[]) =>
    mockUseUpdateAccommodationMode(...args),
}));

jest.mock(
  '../../../../hooks/use-settings' /* gc1-allow: query-hook stub at unit-test boundary; real hooks need QueryClientProvider + API client */,
  () => ({
    useChildCelebrationLevel: () => ({ data: 'big_only' }),
    useUpdateChildCelebrationLevel: () => ({
      mutate: jest.fn(),
      isPending: false,
    }),
  }),
);

// ---------------------------------------------------------------------------
// Progress components (avoid rendering complex chart internals)
// ---------------------------------------------------------------------------

const mockCurrentlyWorkingOnCard = jest.fn();

jest.mock('../../../../components/progress', () => ({
  GrowthChart: () => null,
  CurrentlyWorkingOnCard: (...args: unknown[]) =>
    mockCurrentlyWorkingOnCard(...args),
  RecentSessionsList: () => null,
  ReportsListCard: () => null,
  RetentionSignal: () => null,
  SubjectCard: () => null,
  hasSubjectActivity: () => false,
}));

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

  mockUseChildInventory.mockReturnValue({ data: undefined });
  mockUseChildProgressHistory.mockReturnValue({ data: undefined });
  mockUseChildReports.mockReturnValue({ data: [] });
  mockUseProfileReports.mockReturnValue({ data: [] });

  mockUseChildConsentStatus.mockReturnValue({
    data: { consentStatus: 'CONSENTED', respondedAt: null },
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

  mockUseRevokeConsent.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseRestoreConsent.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  mockUseUpdateAccommodationMode.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  });
  mockCurrentlyWorkingOnCard.mockReturnValue(null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — accommodation guide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders the accommodation guide toggle button', () => {
    render(<ChildDetailScreen />);

    expect(screen.getByTestId('accommodation-guide-toggle')).toBeTruthy();
  });

  it('guide content is not visible before toggle is pressed', () => {
    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('accommodation-guide-content')).toBeNull();
  });

  it('pressing the toggle reveals the guide content', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));

    expect(screen.getByTestId('accommodation-guide-content')).toBeTruthy();
  });

  it('renders the try-it sub-copy', () => {
    render(<ChildDetailScreen />);

    expect(screen.getByTestId('accommodation-try-it')).toBeTruthy();
  });

  it('guide shows a pickable button for short-burst after toggle', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));

    expect(screen.getByTestId('guide-pick-short-burst')).toBeTruthy();
  });

  it('guide shows a pickable button for audio-first after toggle', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));

    expect(screen.getByTestId('guide-pick-audio-first')).toBeTruthy();
  });

  it('guide shows a pickable button for predictable after toggle', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));

    expect(screen.getByTestId('guide-pick-predictable')).toBeTruthy();
  });

  it('guide shows a pickable button for none after toggle', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));

    expect(screen.getByTestId('guide-pick-none')).toBeTruthy();
  });

  it('pressing a guide pick button closes the guide and calls updateAccommodation', () => {
    const mockMutate = jest.fn();
    mockUseUpdateAccommodationMode.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });

    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));
    expect(screen.getByTestId('accommodation-guide-content')).toBeTruthy();

    fireEvent.press(screen.getByTestId('guide-pick-short-burst'));

    // Guide closes after picking
    expect(screen.queryByTestId('accommodation-guide-content')).toBeNull();

    // Accommodation mutation was called with the right mode
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        childProfileId: 'child-001',
        accommodationMode: 'short-burst',
      }),
      expect.any(Object),
    );
  });

  it('pressing the toggle again hides the guide', () => {
    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));
    expect(screen.getByTestId('accommodation-guide-content')).toBeTruthy();

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));
    expect(screen.queryByTestId('accommodation-guide-content')).toBeNull();
  });
});

describe('ChildDetailScreen — new sections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // Weekly headline card
  it('shows child-weekly-headline-card when weeklyHeadline is set', () => {
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary: 'Year 6',
        currentStreak: 0,
        totalXp: 0,
        progress: null,
        subjects: [],
        weeklyHeadline: {
          label: 'Topics mastered',
          value: 5,
          comparison: 'up from 3 last week',
        },
        currentlyWorkingOn: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    expect(screen.getByTestId('child-weekly-headline-card')).toBeTruthy();
  });

  it('hides child-weekly-headline-card when weeklyHeadline is absent', () => {
    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-weekly-headline-card')).toBeNull();
  });

  // Monthly highlights card
  it('shows child-latest-monthly-card when a monthly report exists', () => {
    mockUseProfileReports.mockReturnValue({
      data: [
        {
          id: 'report-1',
          reportMonth: '2026-04-01',
          viewedAt: null,
          createdAt: '2026-04-30T00:00:00Z',
          headlineStat: {
            label: 'Topics mastered',
            value: 5,
            comparison: 'up from 3 last month',
          },
          highlights: ['Made great progress this month!'],
          nextSteps: ['Try the next chapter.'],
        },
      ],
    });

    render(<ChildDetailScreen />);

    expect(screen.getByTestId('child-latest-monthly-card')).toBeTruthy();
  });

  it('hides child-latest-monthly-card when no reports exist', () => {
    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-latest-monthly-card')).toBeNull();
  });

  // Currently-working-on card
  it('mounts CurrentlyWorkingOnCard with child-currently-working-on testID when items exist', () => {
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary: 'Year 6',
        currentStreak: 0,
        totalXp: 0,
        progress: null,
        subjects: [],
        currentlyWorkingOn: [
          { topicId: 't1', topicTitle: 'Algebra', subjectName: 'Math' },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    expect(mockCurrentlyWorkingOnCard).toHaveBeenCalledWith(
      expect.objectContaining({ testID: 'child-currently-working-on' }),
      undefined,
    );
  });

  it('does not mount CurrentlyWorkingOnCard when currentlyWorkingOn is empty', () => {
    render(<ChildDetailScreen />);

    expect(mockCurrentlyWorkingOnCard).not.toHaveBeenCalled();
  });

  // Celebration follow-up
  it('shows celebration follow-up when accommodationMode is short-burst', () => {
    mockUseChildLearnerProfile.mockReturnValue({
      data: {
        accommodationMode: 'short-burst',
        memoryConsentStatus: 'granted',
        updatedAt: null,
      },
    });

    render(<ChildDetailScreen />);

    expect(
      screen.getByTestId('child-celebration-followup-short-burst'),
    ).toBeTruthy();
  });

  it('hides celebration follow-up when accommodationMode is none', () => {
    render(<ChildDetailScreen />);

    expect(screen.queryByTestId('child-celebration-followup-none')).toBeNull();
    expect(
      screen.queryByTestId('child-celebration-followup-short-burst'),
    ).toBeNull();
    expect(
      screen.queryByTestId('child-celebration-followup-predictable'),
    ).toBeNull();
  });
});

describe('ChildDetailScreen — restricted consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows a consent-focused page instead of learning controls while consent is pending', () => {
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary:
          'Emma: consent is pending. Learning metrics are hidden until consent is active.',
        consentStatus: 'PENDING',
        currentStreak: 0,
        totalXp: 0,
        progress: null,
        subjects: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseChildConsentStatus.mockReturnValue({
      data: { consentStatus: 'PENDING', respondedAt: null },
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    screen.getByTestId('consent-required-panel');
    screen.getByTestId('check-consent-status-button');
    expect(screen.queryByTestId('accommodation-guide-toggle')).toBeNull();
    expect(mockUseChildInventory).toHaveBeenCalledWith('child-001', {
      enabled: false,
    });
  });

  it('makes restore consent the single primary action for withdrawn consent', () => {
    const mutateAsync = jest.fn();
    mockUseRestoreConsent.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockUseChildDetail.mockReturnValue({
      data: {
        displayName: 'Emma',
        summary:
          'Emma: consent has been withdrawn. Learning metrics are hidden.',
        consentStatus: 'WITHDRAWN',
        currentStreak: 0,
        totalXp: 0,
        progress: null,
        subjects: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseChildConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'WITHDRAWN',
        respondedAt: new Date().toISOString(),
      },
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildDetailScreen />);

    fireEvent.press(screen.getByTestId('cancel-deletion-button'));
    expect(mutateAsync).toHaveBeenCalled();
    expect(screen.queryByTestId('check-consent-status-button')).toBeNull();
  });
});
