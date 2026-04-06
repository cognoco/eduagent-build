import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

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
  }),
}));

jest.mock('../../hooks/use-account', () => ({
  useExportData: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../hooks/use-subscription', () => ({
  useSubscription: () => ({ data: { tier: 'free' } }),
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
    mockLearningMode = 'serious';
    mockLearningModeLoading = false;
    mockLearningModePending = false;
    mockCelebrationLevel = 'all';
    mockCelebrationLevelLoading = false;
    mockCelebrationLevelPending = false;
  });

  it('renders the Learning Mode section header', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Learning Mode')).toBeTruthy();
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

    expect(mockLearningModeMutate).toHaveBeenCalledWith('casual');
  });

  it('calls updateLearningMode when switching to serious', () => {
    mockLearningMode = 'casual';

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-serious'));

    expect(mockLearningModeMutate).toHaveBeenCalledWith('serious');
  });

  it('does not call updateLearningMode when pressing already active mode', () => {
    mockLearningMode = 'serious';

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('learning-mode-serious'));

    expect(mockLearningModeMutate).not.toHaveBeenCalled();
  });

  it('renders other sections alongside learning mode', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByText('Appearance')).toBeNull();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Learning Mode')).toBeTruthy();
    expect(screen.getByText('Celebrations')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
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

    expect(mockCelebrationLevelMutate).toHaveBeenCalledWith('big_only');
  });
});

describe('MoreScreen — Account Security', () => {
  it('renders Account Security section', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Account Security')).toBeTruthy();
  });
});
