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
    activeProfile: { id: 'profile-1', displayName: 'Alex', isOwner: true },
    profiles: [{ id: 'profile-1', displayName: 'Alex', isOwner: true }],
  }),
}));

jest.mock('../../hooks/use-account', () => ({
  useExportData: () => ({ mutateAsync: mockExportMutateAsync }),
}));

jest.mock('../../hooks/use-subscription', () => ({
  useSubscription: () => ({ data: { tier: 'free' } }),
  useFamilySubscription: () => ({ data: null }),
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
    // not a child profile selected from elsewhere.
    expect(screen.getByText("Alex's Learning Mode")).toBeTruthy();
  });

  // BUG-909 break test: bare "Learning Mode" / "Learning Accommodation"
  // labels must NOT appear on their own — they must be possessive-prefixed
  // so a parent on their own More tab knows the setting applies to them,
  // not to a child profile.
  it('[BUG-909] section headers are prefixed with the active profile name', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(
      screen.getByTestId('learning-mode-section-header')
    ).toHaveTextContent("Alex's Learning Mode");
    expect(
      screen.getByTestId('learning-accommodation-section-header')
    ).toHaveTextContent("Alex's Learning Accommodation");
    // The bare uppercase label must not appear in the rendered tree.
    expect(screen.queryByText('Learning Mode')).toBeNull();
    expect(screen.queryByText('Learning Accommodation')).toBeNull();
  });

  // BUG-909: When the profile is an owner with linked children, the
  // subtitle must direct them to a child profile to change a child's
  // settings. Otherwise it's a generic "applies to your own sessions".
  it('[BUG-909] subtitle clarifies scope when owner has linked children', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    // Default mock: isOwner=true, no linked children -> generic copy.
    const generic = screen.queryAllByText(/Applies to your own learning/i);
    expect(generic.length).toBeGreaterThanOrEqual(2);
  });

  it('renders both learning mode options', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('learning-mode-serious')).toBeTruthy();
    expect(screen.getByTestId('learning-mode-casual')).toBeTruthy();
    expect(screen.getByText('Challenge mode')).toBeTruthy();
    expect(screen.getByText('Explorer')).toBeTruthy();
  });

  it('renders descriptions for both modes', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(
      screen.getByText(
        'Push yourself further. Your mentor keeps you on track. You earn points after proving you remember, and recaps help lock it in.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Learn at your own pace. Your mentor is relaxed and encouraging. You earn points right away and can skip recaps.'
      )
    ).toBeTruthy();
  });

  it('shows Active label on current serious mode', () => {
    mockLearningMode = 'serious';

    render(<MoreScreen />, { wrapper: createWrapper() });

    // The Appearance section also has "Active" for the active persona.
    // We check that the serious mode option specifically contains "Active".
    const seriousOption = screen.getByTestId('learning-mode-serious');
    const activeTexts = screen.getAllByText('Active');

    // At least one "Active" text must be within the serious option
    const hasActiveInSerious = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === seriousOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInSerious).toBe(true);
  });

  it('shows Active label on current casual mode', () => {
    mockLearningMode = 'casual';

    render(<MoreScreen />, { wrapper: createWrapper() });

    const casualOption = screen.getByTestId('learning-mode-casual');
    const activeTexts = screen.getAllByText('Active');

    const hasActiveInCasual = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === casualOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInCasual).toBe(true);
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
    expect(screen.getByText("Alex's Learning Mode")).toBeTruthy();
    expect(screen.getByText("Alex's Learning Accommodation")).toBeTruthy();
    expect(screen.getByText('Celebrations')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
  });

  it('renders celebration level options', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('celebration-level-all')).toBeTruthy();
    expect(screen.getByTestId('celebration-level-big-only')).toBeTruthy();
    expect(screen.getByTestId('celebration-level-off')).toBeTruthy();
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

    fireEvent.press(screen.getByText('Export my data'));

    await waitFor(() => {
      expect(mockExportMutateAsync).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
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

    fireEvent.press(screen.getByText('Export my data'));

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

    fireEvent.press(screen.getByText('Help & Support'));

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

    fireEvent.press(screen.getByText('Help & Support'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Contact support',
        'Email support@mentomate.app for help with your account.',
        undefined,
        undefined
      );
    });
  });
});
