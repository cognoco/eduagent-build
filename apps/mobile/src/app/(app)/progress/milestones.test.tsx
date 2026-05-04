import { render, screen } from '@testing-library/react-native';
import { useProgressMilestones } from '../../../hooks/use-progress';
import MilestonesListScreen from './milestones';

jest.mock('react-i18next', () => ({
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

jest.mock('../../../hooks/use-progress');
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
  beforeEach(() => {
    (useProgressMilestones as jest.Mock).mockReturnValue({
      data: mockMilestones,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('renders milestone cards', () => {
    render(<MilestonesListScreen />);
    screen.getByText('5 topics mastered');
    screen.getByText('10 learning sessions completed');
    screen.getByTestId('milestones-back');
  });

  it('shows empty state when no milestones', () => {
    (useProgressMilestones as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<MilestonesListScreen />);
    screen.getByTestId('milestones-empty');
  });

  it('shows error state with retry button', () => {
    (useProgressMilestones as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });
    render(<MilestonesListScreen />);
    screen.getByTestId('milestones-error');
  });
});
