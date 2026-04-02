import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockClearSessionRecoveryMarker = jest.fn().mockResolvedValue(undefined);
const mockReadSessionRecoveryMarker = jest.fn();
const mockSessionGet = jest.fn();
const mockTrackHomeCardInteraction = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../components/coaching', () => ({
  HomeActionCard: ({
    title,
    subtitle,
    primaryLabel,
    secondaryLabel,
    onPrimary,
    onSecondary,
    testID,
  }: {
    title: string;
    subtitle: string;
    primaryLabel: string;
    secondaryLabel?: string;
    onPrimary: () => void;
    onSecondary?: () => void;
    testID?: string;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View testID={testID}>
        <Text>{title}</Text>
        <Text>{subtitle}</Text>
        <Pressable onPress={onPrimary}>
          <Text>{primaryLabel}</Text>
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable onPress={onSecondary}>
            <Text>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
}));

jest.mock('../../components/progress', () => ({
  RetentionSignal: () => null,
}));

jest.mock('../../components/common', () => ({
  AnimatedEntry: ({ children }: { children: React.ReactNode }) => children,
  ApiUnreachableBanner: () => null,
  ProfileSwitcher: () => null,
  PenWritingAnimation: () => null,
}));

jest.mock('../../hooks/use-celebrations', () => ({
  usePendingCelebrations: () => ({ data: [] }),
  useMarkCelebrationsSeen: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: [{ id: 'subject-1', name: 'Math', status: 'active' }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

jest.mock('../../hooks/use-home-cards', () => ({
  useHomeCards: () => ({
    data: {
      coldStart: false,
      cards: [
        {
          id: 'study',
          title: 'Continue Math',
          subtitle: 'Fractions',
          badge: 'Continue',
          primaryLabel: 'Continue topic',
          priority: 82,
          compact: false,
          subjectId: 'subject-1',
          subjectName: 'Math',
          topicId: 'topic-1',
        },
        {
          id: 'homework',
          title: 'Homework help',
          subtitle: 'Snap a question and get direct help.',
          badge: 'Quick start',
          primaryLabel: 'Open camera',
          priority: 74,
          compact: true,
          subjectId: 'subject-1',
          subjectName: 'Math',
        },
      ],
    },
    isLoading: false,
  }),
  useTrackHomeCardInteraction: () => ({
    mutate: mockTrackHomeCardInteraction,
  }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useOverallProgress: () => ({
    data: { totalTopicsCompleted: 0, subjects: [] },
  }),
  useContinueSuggestion: () => ({
    data: null,
    isLoading: false,
  }),
}));

jest.mock('../../hooks/use-streaks', () => ({
  useStreaks: () => ({
    data: { currentStreak: 0, longestStreak: 0 },
  }),
}));

jest.mock('../../hooks/use-subscription', () => ({
  useSubscriptionStatus: () => ({
    data: { monthlyLimit: 0, usedThisMonth: 0 },
  }),
}));

jest.mock('../../hooks/use-api-reachability', () => ({
  useApiReachability: () => ({
    isApiReachable: true,
    isChecked: true,
    recheck: jest.fn(),
  }),
}));

jest.mock('../../lib/theme', () => ({
  useTheme: () => ({ persona: 'learner' }),
  useThemeColors: () => ({
    muted: '#9ca3af',
    textInverse: '#ffffff',
    accent: '#2563eb',
  }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useCelebrationLevel: () => ({ data: 'all' }),
}));

jest.mock('../../hooks/use-celebration', () => ({
  useCelebration: () => ({
    CelebrationOverlay: null,
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [{ id: 'profile-1', displayName: 'Alex', isOwner: true }],
    activeProfile: { id: 'profile-1', displayName: 'Alex', isOwner: true },
    switchProfile: jest.fn(),
  }),
}));

jest.mock('../../lib/session-recovery', () => ({
  clearSessionRecoveryMarker: mockClearSessionRecoveryMarker,
  isRecoveryMarkerFresh: jest.fn().mockReturnValue(true),
  readSessionRecoveryMarker: mockReadSessionRecoveryMarker,
}));

jest.mock('../../lib/api-client', () => ({
  useApiClient: () => ({
    sessions: {
      ':sessionId': {
        $get: mockSessionGet,
        close: {
          $post: jest.fn(),
        },
      },
    },
  }),
}));

const HomeScreen = require('./home').default;

describe('HomeScreen session recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-123',
      subjectName: 'Math',
      updatedAt: new Date().toISOString(),
    });
    mockSessionGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: 'session-123', status: 'active' },
      }),
    });
  });

  it('keeps the recovery marker available when continuing an active session', async () => {
    render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('unfinished-session-card')).toBeTruthy();
      expect(screen.getByText('Continue Session')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Continue Session'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(learner)/session',
      params: { sessionId: 'session-123' },
    });
    expect(mockClearSessionRecoveryMarker).not.toHaveBeenCalled();
  });

  it('navigates from API-ranked home cards and records taps', async () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByText('Continue topic'));

    await waitFor(() => {
      expect(mockTrackHomeCardInteraction).toHaveBeenCalledWith({
        cardId: 'study',
        interactionType: 'tap',
      });
      expect(mockPush).toHaveBeenCalledWith(
        '/(learner)/session?mode=practice&subjectId=subject-1&topicId=topic-1'
      );
    });
  });
});
