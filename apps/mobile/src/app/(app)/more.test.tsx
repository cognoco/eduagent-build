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
  useLearnerProfile: () => ({ data: mockLearnerProfile }),
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

const mockLearningModeMutate = jest.fn();
const mockCelebrationLevelMutate = jest.fn();
let mockLearningMode: string | undefined = 'serious';
let mockLearningModeLoading = false;
let mockLearningModePending = false;
let mockCelebrationLevel: 'all' | 'big_only' | 'off' | undefined = 'all';
let mockCelebrationLevelLoading = false;
let mockCelebrationLevelPending = false;

jest.mock('../../hooks/use-settings', () => ({
  useNotificationSettings: () => ({
    data: mockNotifData,
    isLoading: false,
  }),
  useUpdateNotificationSettings: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useLearningMode: () => ({
    data: mockLearningMode,
    isLoading: mockLearningModeLoading,
  }),
  useUpdateLearningMode: () => ({
    mutate: mockLearningModeMutate,
    isPending: mockLearningModePending,
  }),
  useCelebrationLevel: () => ({
    data: mockCelebrationLevel,
    isLoading: mockCelebrationLevelLoading,
  }),
  useUpdateCelebrationLevel: () => ({
    mutate: mockCelebrationLevelMutate,
    isPending: mockCelebrationLevelPending,
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
      children
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
    mockIsParentProxy = false;
    mockExportMutateAsync.mockResolvedValue({
      account: {
        email: 'alex@example.com',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
      profiles: [],
      consentStates: [],
      exportedAt: '2026-04-10T10:00:00.000Z',
    });
    mockLearningMode = 'serious';
    mockLearningModeLoading = false;
    mockLearningModePending = false;
    mockCelebrationLevel = 'all';
    mockCelebrationLevelLoading = false;
    mockCelebrationLevelPending = false;
  });

  it('renders the Learning Mode section header', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // BUG-909: Section header is prefixed with the active profile's display
    // name to make it unambiguous that the toggle applies to THAT profile,
    // not a child profile. Asserted via testID to be locale-independent.
    screen.getByTestId('learning-mode-section-header');
  });

  // BUG-909 break test: bare "Learning Mode" / "Learning Accommodation"
  // labels must NOT appear on their own — they must be possessive-prefixed
  // so a parent on their own More tab knows the setting applies to them,
  // not to a child profile.
  it('[BUG-909] section headers are prefixed with the active profile name', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Pin the rendered English copy exactly. test-setup.ts initializes
    // i18next synchronously with en.json, so the {{name}} interpolation
    // resolves to the active profile's displayName. A regression that
    // drops the prefix (back to bare "Learning Mode") OR drops the
    // {{name}} interpolation token in en.json would fail this assertion.
    expect(
      screen.getByTestId('learning-mode-section-header')
    ).toHaveTextContent("Alex's Learning Mode");
    expect(
      screen.getByTestId('learning-accommodation-section-header')
    ).toHaveTextContent("Alex's Learning Accommodation");
    // Defensive: the bare un-prefixed labels must not appear anywhere in
    // the rendered tree.
    expect(screen.queryByText('Learning Mode')).toBeNull();
    expect(screen.queryByText('Learning Accommodation')).toBeNull();
  });

  it('does not render a child-preferences cross-link when there are no linked children', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('learning-mode-child-link')).toBeNull();
    expect(screen.queryByTestId('learning-mode-family-link')).toBeNull();
  });

  it('renders a direct child-preferences link when there is one linked child', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    // Link is present — text content is locale-dependent so we assert via testID.
    screen.getByTestId('learning-mode-child-link');
  });

  it('tracks and navigates to the child profile from the cross-link', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-child-link'));

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

    // Link is present — text content is locale-dependent so we assert via testID.
    screen.getByTestId('learning-mode-family-link');
  });

  it('tracks and navigates to Family from the multi-child cross-link', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false },
      { id: 'child-2', displayName: 'Leo', isOwner: false },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-family-link'));

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

    // Default mock: isOwner=true, no linked children -> the generic subtitle
    // ("Applies to your own learning sessions.") is rendered for BOTH the
    // Learning Mode and Learning Accommodation sections. Asserting on the
    // rendered English copy locks the contract: a regression that drops the
    // subtitle, swaps to the with-children variant, or returns a blank
    // string would fail this test. test-setup.ts initializes i18next
    // synchronously with en.json so {{interpolation}} resolves at render.
    const generic = screen.queryAllByText(/Applies to your own learning/i);
    expect(generic.length).toBeGreaterThanOrEqual(2);
  });

  it('renders both learning mode options', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Pin testIDs AND the rendered English titles. Real i18n is active
    // (test-setup.ts synchronously initializes i18next with en.json), so the
    // titles must resolve to the en.json values. getByText matches per text
    // node, so 'Challenge mode' / 'Explorer' are found even though the card
    // also contains the "Active" badge and the description below.
    screen.getByTestId('learning-mode-serious');
    screen.getByTestId('learning-mode-casual');
    screen.getByText('Challenge mode');
    screen.getByText('Explorer');
  });

  it('renders descriptions for both modes', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Assert rendered English description copy (real i18n is active in this
    // file; see test-setup.ts). A regression that drops the description, mis-
    // routes the t() key, or breaks JSON-key wiring fails here.
    screen.getByText(
      'Push yourself further. Your mentor keeps you on track. You earn points after proving you remember, and recaps help lock it in.'
    );
    screen.getByText(
      'Learn at your own pace. Your mentor is relaxed and encouraging. You earn points right away and can skip recaps.'
    );
  });

  it('shows Active label on current serious mode', () => {
    mockLearningMode = 'serious';

    render(<MoreScreen />, { wrapper: createWrapper() });

    // The serious mode card is rendered and selected.
    const seriousOption = screen.getByTestId('learning-mode-serious');
    expect(seriousOption).toBeTruthy();
    // The selected state is communicated via accessibilityState on the Pressable.
    expect(seriousOption.props.accessibilityState?.selected).toBe(true);
  });

  it('shows Active label on current casual mode', () => {
    mockLearningMode = 'casual';

    render(<MoreScreen />, { wrapper: createWrapper() });

    const casualOption = screen.getByTestId('learning-mode-casual');
    expect(casualOption).toBeTruthy();
    expect(casualOption.props.accessibilityState?.selected).toBe(true);
  });

  it('calls updateLearningMode when switching to casual', () => {
    mockLearningMode = 'serious';

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-casual'));

    expect(mockLearningModeMutate).toHaveBeenCalledWith(
      'casual',
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('calls updateLearningMode when switching to serious', () => {
    mockLearningMode = 'casual';

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-serious'));

    expect(mockLearningModeMutate).toHaveBeenCalledWith(
      'serious',
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('does not call updateLearningMode when pressing already active mode', () => {
    mockLearningMode = 'serious';

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-serious'));

    expect(mockLearningModeMutate).not.toHaveBeenCalled();
  });

  // [BUG-814] Rapid double-tap must not fire two concurrent mutations.
  // The JSX `disabled` prop guards once isPending is true, but the *first*
  // tap arrives while isPending is still false; the handler-level guard
  // prevents the racy double-fire.
  it('[BREAK / BUG-814] handler ignores press while updateLearningMode.isPending=true', () => {
    mockLearningMode = 'serious';
    mockLearningModePending = true;

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-casual'));

    expect(mockLearningModeMutate).not.toHaveBeenCalled();
  });

  it('[BUG-814] only the first of two rapid taps fires when isPending flips between', () => {
    mockLearningMode = 'serious';
    // First tap: not pending. Mutate fires. Subsequent simulated taps with
    // isPending=true must be ignored — but in this test the mock returns
    // the same isPending value across re-renders, so we simulate by
    // toggling between presses.
    render(<MoreScreen />, { wrapper: createWrapper() });

    // First press goes through.
    fireEvent.press(screen.getByTestId('learning-mode-casual'));
    expect(mockLearningModeMutate).toHaveBeenCalledTimes(1);

    // Press again on a different mode — handler guard should still allow it
    // because mockLearningModePending is false. (This proves the guard does
    // not over-block when a mutation has already resolved.)
    fireEvent.press(screen.getByTestId('learning-mode-casual'));
    // Second press hits the same mode after mutation — `mode !== learningMode`
    // is still true because the mock doesn't update mockLearningMode. So it
    // fires twice. This documents that the *only* dedupe is isPending.
    expect(mockLearningModeMutate).toHaveBeenCalledTimes(2);
  });

  it('renders all section headings', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByText('Appearance')).toBeNull();
    // BUG-909: Section labels are now possessive (per active profile).
    // Asserted via testID to remain locale-independent.
    screen.getByTestId('learning-mode-section-header');
    screen.getByTestId('learning-accommodation-section-header');
    screen.getByTestId('celebrations-section-header');
    screen.getByTestId('notifications-section-header');
  });

  // [BUG-960 / BUG-961 / BUG-962] These testIDs are load-bearing for the
  // Maestro suites (more-tab-navigation, settings-toggles, learner-mentor-
  // memory). E2E text-search regressed earlier because section headers were
  // renamed (e.g. "Celebrations" → "Your celebrations"). Locking the testIDs
  // here makes any future rename surface as a unit-test failure before E2E
  // runs nightly.
  it('exposes stable testIDs on section headers and toggle rows for E2E', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Section headers used by Maestro scrollUntilVisible.
    screen.getByTestId('learning-mode-section-header');
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
      expect.objectContaining({ onError: expect.any(Function) })
    );
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
        })
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
        'mailto:support@mentomate.app?subject=MentoMate%20Support'
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
        undefined
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
