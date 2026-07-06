import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

import ProgressScreen from './index';

// ── Translation stub ─────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ── Expo Router ──────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockRouterReplace = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    back: jest.fn(),
    replace: mockRouterReplace,
    push: mockPush,
  }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => callback(), [callback]);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Ionicons uses native font loading — stub it out
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// ── External native/UI module boundaries (gc1-allow) ────────────────────────

const mockFormatApiError = jest.fn((err: unknown) =>
  err instanceof Error ? `classified:${err.message}` : 'classified:unknown',
);
const mockClassifyApiError = jest.fn((_err: unknown) => ({
  message: 'classified',
  category: 'unknown' as const,
  recovery: 'retry' as const,
}));
jest.mock(
  '../../../lib/format-api-error' /* gc1-allow: format-api-error calls i18next which requires expo-localization/async-storage init unavailable in jest */,
  () => ({
    formatApiError: (err: unknown) => mockFormatApiError(err),
    classifyApiError: (err: unknown) => mockClassifyApiError(err),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: Alert.alert is native; stub captures calls for assertion */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useTheme: () => ({ colorScheme: 'dark' }),
  }),
);

jest.mock(
  '../../../lib/analytics' /* gc1-allow: analytics emits network/native telemetry; stub captures calls */,
  () => ({
    track: jest.fn(),
    hashProfileId: (id: string) => Promise.resolve(`hash-${id}`),
    bucketAccountAge: () => 'new',
  }),
);

jest.mock(
  '../../../lib/navigation' /* gc1-allow: unit test boundary; real impl requires expo-router Router */,
  () => ({
    pushChildReport: jest.fn(),
    pushChildWeeklyReport: jest.fn(),
    pushLearningResumeTarget: jest.fn(),
  }),
);

jest.mock(
  '../../../lib/profile' /* gc1-allow: useProfile requires the ProfileContext provider tree; stub pins the active profile */,
  () => ({
    useProfile: () => ({
      activeProfile: mockActiveProfile,
    }),
    useLinkedChildren: () => mockLinkedChildren,
  }),
);

let mockAppContextMode: 'study' | 'family' = 'study';
jest.mock(
  '../../../lib/app-context' /* gc1-allow: app-context requires the full provider tree; stub pins study mode */,
  () => ({
    useAppContext: () => ({ mode: mockAppContextMode }),
  }),
);

// [PARENT-25] The NudgeActionSheet's own behavior (templates, send, error
// copy) is covered in NudgeActionSheet.test.tsx. Here we only need to prove the
// ProgressScreen branch that mounts it, so the boundary stub renders a probe
// with the props the screen passes plus a close affordance that drives the real
// onClose handler (setShowProgressNudge(false)).
jest.mock(
  '../../../components/nudge/NudgeActionSheet' /* gc1-allow: bottom-sheet component pulls native gesture/animation deps unavailable in jest; internals covered by NudgeActionSheet.test.tsx */,
  () => ({
    NudgeActionSheet: ({
      childName,
      childProfileId,
      onClose,
    }: {
      childName: string;
      childProfileId: string;
      onClose: () => void;
    }) => {
      const { View, Text, Pressable } = require('react-native');
      return (
        <View testID="nudge-action-sheet">
          <Text testID="nudge-action-sheet-child-name">{childName}</Text>
          <Text testID="nudge-action-sheet-child-id">{childProfileId}</Text>
          <Pressable testID="nudge-action-sheet-close" onPress={onClose}>
            <Text>close</Text>
          </Pressable>
        </View>
      );
    },
  }),
);

// ── Hooks under test boundary (gc1-allow) ────────────────────────────────────

const mockRefreshSnapshot = jest.fn();

const queryStub = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  isRefetching: false,
  refetch: jest.fn(),
});

const EMPTY_INVENTORY = {
  global: { topicsMastered: 0, vocabularyTotal: 0, totalSessions: 0 },
  subjects: [],
};

const LANGUAGE_INVENTORY = {
  global: {
    topicsMastered: 1,
    topicsAttempted: 1,
    topicsExplored: 1,
    vocabularyTotal: 7,
    vocabularyMastered: 3,
    totalSessions: 2,
    totalActiveMinutes: 11,
    totalWallClockMinutes: 12,
    currentStreak: 4,
    weeklyDeltaTopicsMastered: 0,
    weeklyDeltaVocabularyTotal: 0,
    weeklyDeltaTopicsExplored: 0,
  },
  subjects: [
    {
      subjectId: 'subject-language',
      name: 'French',
      pedagogyMode: 'four_strands',
      topics: {
        mastered: 1,
        inProgress: 0,
        explored: 1,
        notStarted: 0,
        total: 1,
      },
      topicsMastered: 1,
      topicsAttempted: 1,
      progressPercentage: 100,
      currentStreak: 4,
    },
  ],
};

let mockActiveProfile = {
  id: 'profile-1',
  createdAt: '2026-01-01T00:00:00Z',
  displayName: 'Owner',
};
let mockLinkedChildren: Array<{ id: string; displayName: string }> = [];
let mockOwnInventory = EMPTY_INVENTORY;
let mockChildInventory: unknown = undefined;
const mockUseChildInventory = jest.fn();
const mockUseProfileSessions = jest.fn();
const mockUseProfileReports = jest.fn();
const mockUseProfileWeeklyReports = jest.fn();

jest.mock(
  '../../../hooks/use-progress' /* gc1-allow: hooks need QueryClientProvider + API client; unit-test boundary */,
  () => ({
    useProgressInventory: () => queryStub(mockOwnInventory),
    useChildInventory: (...args: unknown[]) => {
      mockUseChildInventory(...args);
      return queryStub(mockChildInventory);
    },
    useChildProgressSummary: () => queryStub(undefined),
    useOverallProgress: () => queryStub(undefined),
    useLearningResumeTarget: () => queryStub(undefined),
    useProfileSessions: (...args: unknown[]) => {
      mockUseProfileSessions(...args);
      return queryStub([]);
    },
    useProfileReports: (...args: unknown[]) => {
      mockUseProfileReports(...args);
      return queryStub([]);
    },
    useProfileWeeklyReports: (...args: unknown[]) => {
      mockUseProfileWeeklyReports(...args);
      return queryStub([]);
    },
    useRefreshProgressSnapshot: () => ({
      mutateAsync: mockRefreshSnapshot,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../../hooks/use-subjects' /* gc1-allow: hook needs QueryClientProvider + API client; unit-test boundary */,
  () => ({
    useSubjects: () => queryStub([]),
  }),
);

jest.mock(
  '../../../hooks/use-active-profile-role' /* gc1-allow: hook depends on the profile provider tree; stub pins owner role */,
  () => ({
    useActiveProfileRole: () => mockActiveProfileRole,
  }),
);

let mockActiveProfileRole: 'owner' | 'child' | 'impersonated-child' = 'owner';

const mockUseNavigationContract = jest.fn(() => ({
  effectiveAppContext: 'study',
  isParentProxy: false,
  gates: {
    progressScope: 'self',
    showProgressProfilePicker: false,
  },
}));
jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: hook depends on full app provider tree; stub pins gates for deterministic tests */,
  () => ({
    useNavigationContract: () => mockUseNavigationContract(),
  }),
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProgressScreen refresh error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockAppContextMode = 'study';
    mockActiveProfileRole = 'owner';
    mockActiveProfile = {
      id: 'profile-1',
      createdAt: '2026-01-01T00:00:00Z',
      displayName: 'Owner',
    };
    mockLinkedChildren = [];
    mockOwnInventory = EMPTY_INVENTORY;
    mockChildInventory = undefined;
    mockUseNavigationContract.mockReturnValue({
      effectiveAppContext: 'study',
      isParentProxy: false,
      gates: {
        progressScope: 'self',
        showProgressProfilePicker: false,
      },
    });
    mockRefreshSnapshot.mockResolvedValue(undefined);
  });

  it('[F-110] routes pull-to-refresh error through formatApiError boundary, not raw instanceof check', async () => {
    render(<ProgressScreen />);

    await waitFor(() => {
      screen.getByTestId('progress-screen');
    });
    // Mount-time silent metrics load has fired; only the pull-to-refresh
    // call below may alert.
    expect(mockPlatformAlert).not.toHaveBeenCalled();

    const refreshError = new Error('Snapshot refresh failed');
    mockRefreshSnapshot.mockRejectedValueOnce(refreshError);

    const refreshControl = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'progress.refreshFailedTitle',
        'classified:Snapshot refresh failed',
      );
    });
    expect(mockFormatApiError).toHaveBeenCalledWith(refreshError);
  });

  it('honors requestedProfileId by loading linked-child inventory and profile-scoped lists', async () => {
    mockSearchParams = { profileId: 'child-1' };
    mockAppContextMode = 'family';
    mockLinkedChildren = [{ id: 'child-1', displayName: 'Ari' }];
    mockChildInventory = LANGUAGE_INVENTORY;

    render(<ProgressScreen />);

    await waitFor(() => {
      screen.getByText('progress.pageTitleProfile');
    });

    expect(mockUseChildInventory).toHaveBeenCalledWith('child-1', {
      enabled: true,
    });
    expect(mockUseProfileSessions).toHaveBeenCalledWith('child-1');
    expect(mockUseProfileReports).toHaveBeenCalledWith('child-1');
    expect(mockUseProfileWeeklyReports).toHaveBeenCalledWith('child-1');
  });

  it('routes parent-proxy empty-state CTA to the child curriculum, not the adult library', async () => {
    mockActiveProfileRole = 'impersonated-child';
    mockActiveProfile = {
      id: 'child-1',
      createdAt: '2026-01-01T00:00:00Z',
      displayName: 'Ari',
    };

    render(<ProgressScreen />);

    await waitFor(() => {
      screen.getByTestId('progress-start-learning');
    });
    fireEvent.press(screen.getByTestId('progress-start-learning'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/curriculum',
      params: { profileId: 'child-1' },
    });
    expect(mockPush).not.toHaveBeenCalledWith('/(app)/library');
  });

  it('renders vocabulary stats read-only when viewing a linked child profile', async () => {
    mockSearchParams = { profileId: 'child-1' };
    mockAppContextMode = 'family';
    mockLinkedChildren = [{ id: 'child-1', displayName: 'Ari' }];
    mockChildInventory = LANGUAGE_INVENTORY;

    render(<ProgressScreen />);

    await waitFor(() => {
      screen.getByTestId('progress-vocab-stat-readonly');
    });
    expect(screen.queryByTestId('progress-vocab-stat')).toBeNull();
  });
});
