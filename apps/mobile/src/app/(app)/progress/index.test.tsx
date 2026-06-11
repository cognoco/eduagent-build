import { act, render, screen, waitFor } from '@testing-library/react-native';
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

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
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
const mockClassifyApiError = jest.fn(() => ({
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
    hashProfileId: (id: string) => `hash-${id}`,
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
      activeProfile: {
        id: 'profile-1',
        createdAt: '2026-01-01T00:00:00Z',
      },
    }),
    useLinkedChildren: () => [],
  }),
);

jest.mock(
  '../../../lib/app-context' /* gc1-allow: app-context requires the full provider tree; stub pins study mode */,
  () => ({
    useAppContext: () => ({ mode: 'study' }),
  }),
);

jest.mock(
  '../../../components/nudge/NudgeActionSheet' /* gc1-allow: bottom-sheet component pulls native gesture/animation deps unavailable in jest */,
  () => ({
    NudgeActionSheet: () => null,
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

jest.mock(
  '../../../hooks/use-progress' /* gc1-allow: hooks need QueryClientProvider + API client; unit-test boundary */,
  () => ({
    useProgressInventory: () => queryStub(EMPTY_INVENTORY),
    useChildInventory: () => queryStub(undefined),
    useChildProgressSummary: () => queryStub(undefined),
    useOverallProgress: () => queryStub(undefined),
    useLearningResumeTarget: () => queryStub(undefined),
    useProfileSessions: () => queryStub([]),
    useProfileReports: () => queryStub([]),
    useProfileWeeklyReports: () => queryStub([]),
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
    useActiveProfileRole: () => 'owner',
  }),
);

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
});
