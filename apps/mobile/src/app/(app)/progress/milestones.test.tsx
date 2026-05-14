import { render, screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  errorResponses,
} from '../../../../test-utils/screen-render-harness';
import MilestonesListScreen from './milestones';

const mockFetch = createRoutedMockFetch({
  '/progress/milestones': {
    milestones: [
      {
        id: 'm1',
        profileId: 'p1',
        milestoneType: 'topic_mastered_count',
        threshold: 5,
        subjectId: null,
        bookId: null,
        metadata: null,
        celebratedAt: null,
        createdAt: '2026-04-10T12:00:00Z',
      },
      {
        id: 'm2',
        profileId: 'p1',
        milestoneType: 'session_count',
        threshold: 10,
        subjectId: null,
        bookId: null,
        metadata: null,
        celebratedAt: null,
        createdAt: '2026-04-05T09:00:00Z',
      },
    ],
  },
});

jest.mock('../../../lib/api-client', () => // gc1-allow: api-client shim via mockApiClientFactory test-util (Hono RPC client cannot run in Jest without native fetch + auth chain)
  require('../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock('expo-router', () => // gc1-allow: native-boundary — Expo Router requires native bindings unavailable in Jest
  require('../../../test-utils/native-shims').expoRouterShim(),
);

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary — safe-area context requires native bindings unavailable in Jest
  require('../../../test-utils/native-shims').safeAreaShim(),
);

jest.mock('react-i18next', () => ({ // gc1-allow: external-boundary — i18next initialisation requires the full i18n provider chain unavailable in Jest
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'progress.milestones.pageTitle': 'Your Milestones',
        'progress.milestones.earned': `${opts?.count ?? ''} milestone${
          (opts?.count ?? 0) !== 1 ? 's' : ''
        } earned`,
        'progress.milestones.errorTitle': "We couldn't load your milestones",
        'progress.milestones.errorMessage':
          'Check your connection and try again.',
        'progress.milestones.emptyTitle': 'No milestones yet',
        'progress.milestones.emptySubtitle':
          'Complete sessions and master topics to earn your first milestone.',
        'progress.milestones.emptyBackLabel': 'Go back to Journey',
        'common.tryAgain': 'Try again',
        'common.goBack': 'Go back',
      };
      if (key in map) return map[key]!;
      return key;
    },
  }),
}));

describe('MilestonesListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute('/progress/milestones', {
      milestones: [
        {
          id: 'm1',
          profileId: 'p1',
          milestoneType: 'topic_mastered_count',
          threshold: 5,
          subjectId: null,
          bookId: null,
          metadata: null,
          celebratedAt: null,
          createdAt: '2026-04-10T12:00:00Z',
        },
        {
          id: 'm2',
          profileId: 'p1',
          milestoneType: 'session_count',
          threshold: 10,
          subjectId: null,
          bookId: null,
          metadata: null,
          celebratedAt: null,
          createdAt: '2026-04-05T09:00:00Z',
        },
      ],
    });
  });

  it('renders milestone cards', async () => {
    const { wrapper } = createScreenWrapper();
    render(<MilestonesListScreen />, { wrapper });
    await waitFor(() => {
      screen.getByText('5 topics mastered');
      screen.getByText('10 learning sessions completed');
      screen.getByTestId('milestones-back');
    });
  });

  it('shows empty state when no milestones', async () => {
    mockFetch.setRoute('/progress/milestones', { milestones: [] });
    const { wrapper } = createScreenWrapper();
    render(<MilestonesListScreen />, { wrapper });
    await waitFor(() => {
      screen.getByTestId('milestones-empty');
    });
  });

  it('shows error state with retry button', async () => {
    mockFetch.setRoute('/progress/milestones', errorResponses.serverError());
    const { wrapper } = createScreenWrapper();
    render(<MilestonesListScreen />, { wrapper });
    await waitFor(() => {
      screen.getByTestId('milestones-error');
    });
  });
});
