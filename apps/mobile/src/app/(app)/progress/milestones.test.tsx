import { waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  ERROR_RESPONSES,
} from '../../../test-utils/screen-render';
import MilestonesListScreen from './milestones';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const count = opts?.count as number | undefined;
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
        'milestoneCard.wordCount': `${count} ${count === 1 ? 'word' : 'words'} learned`,
        'milestoneCard.topicCount': `${count} ${count === 1 ? 'topic' : 'topics'} mastered`,
        'milestoneCard.sessionCount': `${count} learning ${count === 1 ? 'session' : 'sessions'} completed`,
        'milestoneCard.hourCount': `${count} ${count === 1 ? 'hour' : 'hours'} of learning`,
      };
      if (key in map) return map[key]!;
      return key;
    },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const mockMilestones = [
  {
    id: 'm1',
    profileId: 'p1',
    milestoneType: 'topic_mastered_count' as const,
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
    milestoneType: 'session_count' as const,
    threshold: 10,
    subjectId: null,
    bookId: null,
    metadata: null,
    celebratedAt: null,
    createdAt: '2026-04-05T09:00:00Z',
  },
];

describe('MilestonesListScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('renders milestone cards', async () => {
    active = renderScreen(<MilestonesListScreen />, {
      routes: { '/progress/milestones': { milestones: mockMilestones } },
    });
    await active.result.findByText('5 topics mastered');
    active.result.getByText('10 learning sessions completed');
    active.result.getByTestId('milestones-back');
  });

  it('shows empty state when no milestones', async () => {
    active = renderScreen(<MilestonesListScreen />, {
      routes: { '/progress/milestones': { milestones: [] } },
    });
    await active.result.findByTestId('milestones-empty');
  });

  it('shows error state with retry button', async () => {
    active = renderScreen(<MilestonesListScreen />, {
      routes: {
        '/progress/milestones': () =>
          ERROR_RESPONSES.forbidden('Network error'),
      },
    });
    await waitFor(() => {
      active!.result.getByTestId('milestones-error');
    });
  });
});
