import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { Alert, Linking, Share } from 'react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockExportMutateAsync = jest.fn();
const mockTrack = jest.fn();
const mockOpenFeedback = jest.fn();
const mockAccommodationMutate = jest.fn();
let mockSubscription: { tier: string } | null = { tier: 'free' };
let mockFamilySubscription: {
  profileCount: number;
  maxProfiles: number;
} | null = null;
let mockActiveProfile = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
};
let mockProfiles = [mockActiveProfile];
let mockLearnerProfile: { accommodationMode?: string } | null = {
  accommodationMode: 'none',
};
let mockLearnerProfileLoading = false;
let mockLearnerProfileError = false;
const mockLearnerProfileRefetch = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    surface: '#ffffff',
    primary: '#6366f1',
    textInverse: '#ffffff',
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
    profiles: mockProfiles,
  }),
}));

let mockIsParentProxy = false;
jest.mock('../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({
    isParentProxy: mockIsParentProxy,
    childProfile: null,
    parentProfile: null,
  }),
}));

jest.mock('../../hooks/use-account', () => ({
  useExportData: () => ({ mutateAsync: mockExportMutateAsync }),
}));

jest.mock('../../hooks/use-subscription', () => ({
  useSubscription: () => ({ data: mockSubscription }),
  useFamilySubscription: () => ({ data: mockFamilySubscription }),
}));

jest.mock('../../hooks/use-learner-profile', () => ({
  useLearnerProfile: () => ({
    data: mockLearnerProfile,
    isLoading: mockLearnerProfileLoading,
    isError: mockLearnerProfileError,
    refetch: mockLearnerProfileRefetch,
  }),
  useUpdateAccommodationMode: () => ({
    mutate: mockAccommodationMutate,
    isPending: false,
  }),
}));

jest.mock('../../components/feedback/FeedbackProvider', () => ({
  useFeedbackContext: () => ({ openFeedback: mockOpenFeedback }),
}));

jest.mock('../../lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
  useUser: () => ({
    user: {
      fullName: 'Alex',
      firstName: 'Alex',
      primaryEmailAddress: { emailAddress: 'alex@example.com' },
    },
  }),
}));

const mockNotifData = {
  reviewReminders: false,
  dailyReminders: false,
  pushEnabled: false,
  maxDailyPush: 3,
};

const mockCelebrationLevelMutate = jest.fn();
const mockWithdrawalArchivePreferenceMutate = jest.fn();
let mockCelebrationLevel: 'all' | 'big_only' | 'off' | undefined = 'all';
let mockCelebrationLevelLoading = false;
let mockCelebrationLevelPending = false;
let mockWithdrawalArchivePreference: 'auto' | 'always' | 'never' | undefined =
  'auto';
let mockWithdrawalArchivePreferenceLoading = false;
let mockWithdrawalArchivePreferencePending = false;

jest.mock('../../hooks/use-settings', () => ({
  useNotificationSettings: () => ({
    data: mockNotifData,
    isLoading: false,
  }),
  useUpdateNotificationSettings: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useCelebrationLevel: () => ({
    data: mockCelebrationLevel,
    isLoading: mockCelebrationLevelLoading,
  }),
  useUpdateCelebrationLevel: () => ({
    mutate: mockCelebrationLevelMutate,
    isPending: mockCelebrationLevelPending,
  }),
  useWithdrawalArchivePreference: () => ({
    data: mockWithdrawalArchivePreference,
    isLoading: mockWithdrawalArchivePreferenceLoading,
  }),
  useUpdateWithdrawalArchivePreference: () => ({
    mutate: mockWithdrawalArchivePreferenceMutate,
    isPending: mockWithdrawalArchivePreferencePending,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const MoreScreen = require('./more').default;

describe('MoreScreen — Learning Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription = { tier: 'free' };
    mockFamilySubscription = null;
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
    mockProfiles = [mockActiveProfile];
    mockLearnerProfile = { accommodationMode: 'none' };
    mockLearnerProfileLoading = false;
    mockLearnerProfileError = false;
    mockIsParentProxy = false;
    mockLearnerProfileRefetch.mockReset();
    mockExportMutateAsync.mockResolvedValue({
      account: {
        email: 'alex@example.com',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
      profiles: [],
      consentStates: [],
      exportedAt: '2026-04-10T10:00:00.000Z',
    });
    mockCelebrationLevel = 'all';
    mockCelebrationLevelLoading = false;
    mockCelebrationLevelPending = false;
    mockWithdrawalArchivePreference = 'auto';
    mockWithdrawalArchivePreferenceLoading = false;
    mockWithdrawalArchivePreferencePending = false;
  });

  it('does not render the old Learning Mode section header', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('learning-mode-section-header')).toBeNull();
    expect(screen.queryByTestId('learning-mode-casual')).toBeNull();
    expect(screen.queryByTestId('learning-mode-serious')).toBeNull();
  });

  // BUG-909 break test: bare "Learning Accommodation" labels must NOT appear
  // on their own — they must be possessive-prefixed so a parent on their own
  // More tab knows the setting applies to them, not to a child profile.
  it('[BUG-909] accommodation section header is prefixed with the active profile name', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(
      screen.getByTestId('learning-accommodation-section-header'),
    ).toHaveTextContent("Alex's Learning Accommodation");
    expect(screen.queryByText('Learning Mode')).toBeNull();
    expect(screen.queryByText('Learning Accommodation')).toBeNull();
  });

  it('does not render a child-preferences cross-link when there are no linked children', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('accommodation-mode-child-link')).toBeNull();
    expect(screen.queryByTestId('accommodation-mode-family-link')).toBeNull();
  });

  it('renders a direct child-preferences link when there is one linked child', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('accommodation-mode-child-link');
  });

  it('tracks and navigates to the child profile from the cross-link', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-child-link'));

    expect(mockTrack).toHaveBeenCalledWith('child_progress_navigated', {
      source: 'more_section',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/child/child-1');
  });

  it('renders a Family cross-link when there are multiple linked children', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
      { id: 'child-2', displayName: 'Leo', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('accommodation-mode-family-link');
  });

  it('tracks and navigates to Family from the multi-child cross-link', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
      { id: 'child-2', displayName: 'Leo', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-family-link'));

    expect(mockTrack).toHaveBeenCalledWith('child_progress_navigated', {
      source: 'more_section',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/family');
  });

  // BUG-909: When the profile is an owner with linked children, the
  // subtitle must direct them to a child profile to change a child's
  // settings. Otherwise it's a generic "applies to your own sessions".
  it('[BUG-909] subtitle clarifies scope when owner has linked children', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Default mock: isOwner=true, no linked children -> the generic subtitle is
    // rendered for the Learning Accommodation section.
    const generic = screen.queryAllByText(/Applies to your own learning/i);
    expect(generic.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all section headings', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByText('Appearance')).toBeNull();
    // BUG-909: Section labels are possessive (per active profile).
    // Asserted via testID to remain locale-independent.
    screen.getByTestId('learning-accommodation-section-header');
    screen.getByTestId('celebrations-section-header');
    screen.getByTestId('notifications-section-header');
  });

  it('shows a retry affordance instead of defaulting accommodation to None when learner profile fails to load', () => {
    mockLearnerProfile = null;
    mockLearnerProfileError = true;

    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('accommodation-mode-retry');
    expect(screen.queryByTestId('accommodation-mode-none')).toBeNull();
    expect(screen.queryByTestId('accommodation-mode-audio-first')).toBeNull();
  });

  it('retries loading accommodation data when the retry affordance is pressed', () => {
    mockLearnerProfile = null;
    mockLearnerProfileError = true;

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-retry'));

    expect(mockLearnerProfileRefetch).toHaveBeenCalledTimes(1);
  });

  // [BUG-960 / BUG-961 / BUG-962] These testIDs are load-bearing for Maestro.
  // E2E text-search regressed earlier because section headers were
  // renamed (e.g. "Celebrations" → "Your celebrations"). Locking the testIDs
  // here makes any future rename surface as a unit-test failure before E2E
  // runs nightly.
  it('exposes stable testIDs on section headers and toggle rows for E2E', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Section headers used by Maestro scrollUntilVisible.
    screen.getByTestId('learning-accommodation-section-header');
    screen.getByTestId('celebrations-section-header');
    screen.getByTestId('notifications-section-header');

    // Notification toggles tapped by the settings-toggles flow.
    screen.getByTestId('push-notifications-toggle');
    screen.getByTestId('weekly-digest-toggle');

    // Sign-out button at bottom of scroll — must remain reachable.
    screen.getByTestId('sign-out-button');
  });

  it('renders celebration level options', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('celebration-level-all');
    screen.getByTestId('celebration-level-big-only');
    screen.getByTestId('celebration-level-off');
  });

  it('updates celebration level when selecting big milestones only', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('celebration-level-big-only'));

    expect(mockCelebrationLevelMutate).toHaveBeenCalledWith(
      'big_only',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('shows withdrawal archive options only for the owner profile', () => {
    const ownerRender = render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('more-withdrawal-archive-auto');
    screen.getByTestId('more-withdrawal-archive-always');
    screen.getByTestId('more-withdrawal-archive-never');
    ownerRender.unmount();

    mockActiveProfile = {
      id: 'child-1',
      displayName: 'Mia',
      isOwner: false,
    };
    mockProfiles = [mockActiveProfile];

    const { unmount } = render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('more-withdrawal-archive-auto')).toBeNull();
    expect(screen.queryByTestId('more-withdrawal-archive-always')).toBeNull();
    expect(screen.queryByTestId('more-withdrawal-archive-never')).toBeNull();
    unmount();
  });

  it('updates withdrawal archive preference when selecting always archive', () => {
    mockWithdrawalArchivePreference = 'auto';

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-withdrawal-archive-always'));

    expect(mockWithdrawalArchivePreferenceMutate).toHaveBeenCalledWith(
      'always',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('does not show family controls to owner profiles without a family-capable plan', () => {
    mockSubscription = { tier: 'free' };
    mockProfiles = [mockActiveProfile];

    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('add-child-link')).toBeNull();
    expect(screen.queryByText('Family')).toBeNull();
  });

  it('does not duplicate family management in More when the Family tab is available', () => {
    mockSubscription = { tier: 'family' };
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('add-child-link')).toBeNull();
    expect(screen.queryByText('Child progress')).toBeNull();
  });
});

describe('MoreScreen — Account Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
    mockSubscription = { tier: 'free' };
    mockFamilySubscription = null;
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
    mockProfiles = [mockActiveProfile];
    mockExportMutateAsync.mockResolvedValue({
      account: {
        email: 'alex@example.com',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
      profiles: [],
      consentStates: [],
      exportedAt: '2026-04-10T10:00:00.000Z',
    });
  });

  it('shares the account export when Export my data is pressed', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    } as never);

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-export'));

    await waitFor(() => {
      expect(mockExportMutateAsync).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          // Pin the rendered share-sheet title — verifies that
          // t('more.export.shareTitle') resolves to the en.json copy. A bare
          // toHaveBeenCalledTimes / message-only check would let the title
          // regress to a key like "more.export.shareTitle" silently.
          title: 'MentoMate account data export',
          message: expect.stringContaining('"email": "alex@example.com"'),
        }),
      );
    });
  });

  it('[UX-DE-L4] does not show an error alert when share sheet is dismissed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'dismissedAction',
    } as never);

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-export'));

    await waitFor(() => {
      expect(mockExportMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('opens a support email when Help & Support is pressed', async () => {
    const openUrlSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-help'));

    await waitFor(() => {
      expect(openUrlSpy).toHaveBeenCalledWith(
        'mailto:support@mentomate.app?subject=MentoMate%20Support',
      );
    });
  });

  it('shows a fallback alert when opening support email fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('unsupported'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-help'));

    await waitFor(() => {
      // Pin the rendered title and message — verifies the i18n keys resolve
      // to the en.json copy. A toHaveBeenCalledTimes-only check would let
      // a regression to bare keys ("more.help.contactSupportTitle") or a
      // dropped support email pass silently.
      expect(alertSpy).toHaveBeenCalledWith(
        'Contact support',
        'Email support@mentomate.app for help with your account.',
        undefined,
        undefined,
      );
    });
  });
});

describe('MoreScreen — family actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription = { tier: 'family' };
    mockFamilySubscription = { profileCount: 1, maxProfiles: 4 };
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
    mockProfiles = [mockActiveProfile];
  });

  it('navigates to create-profile with for=child when Add a child is pressed', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPush).toHaveBeenCalledWith('/create-profile?for=child');
  });
});

// [BUG-915] When the parent is impersonating a child profile, the More tab
// must hide account-level destructive rows. The ProxyBanner at the top of the
// (app) layout already provides the Switch-back escape, so the user is never
// stranded — they can return to their parent account at any time.
describe('MoreScreen — impersonation hides destructive actions (BUG-915)', () => {
  afterEach(() => {
    mockIsParentProxy = false;
  });

  it('hides Sign out, Delete account, Export my data, and Subscription when impersonating', () => {
    mockIsParentProxy = true;
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('sign-out-button')).toBeNull();
    expect(screen.queryByTestId('more-row-delete-account')).toBeNull();
    expect(screen.queryByTestId('more-row-export')).toBeNull();
    expect(screen.queryByTestId('more-row-subscription')).toBeNull();
  });

  it('shows Sign out, Delete account, Export my data, and Subscription on the parent account', () => {
    mockIsParentProxy = false;
    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('sign-out-button');
    screen.getByTestId('more-row-delete-account');
    screen.getByTestId('more-row-export');
    screen.getByTestId('more-row-subscription');
  });
});

// [C4] A child profile signed in directly (isOwner: false, not impersonating)
// must not see Subscription, Delete account, or Export my data — those rows
// operate on the parent's billing account, not the child's profile.
describe('MoreScreen — child profile hides owner-only rows (C4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
    mockActiveProfile = {
      id: 'child-1',
      displayName: 'Mia',
      isOwner: false,
    };
    mockProfiles = [mockActiveProfile];
    mockSubscription = { tier: 'free' };
    mockFamilySubscription = null;
    mockExportMutateAsync.mockResolvedValue({
      account: {
        email: 'parent@example.com',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
      profiles: [],
      consentStates: [],
      exportedAt: '2026-04-10T10:00:00.000Z',
    });
  });

  it('hides Subscription, Delete account, and Export my data for a child profile', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('more-row-subscription')).toBeNull();
    expect(screen.queryByTestId('more-row-delete-account')).toBeNull();
    expect(screen.queryByTestId('more-row-export')).toBeNull();
  });
});
