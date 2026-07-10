import { waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  ERROR_RESPONSES,
} from '../../../test-utils/screen-render';
import MilestonesListScreen from './milestones';

// Shared en.json-resolving mock: assertions stay on rendered English and the
// plural families (milestoneCard.*, progress.milestones.earned) resolve through
// real _one/_other keys instead of a re-implemented English plural ternary.
jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const mockMilestones = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    profileId: '990e8400-e29b-41d4-a716-446655440004',
    milestoneType: 'topic_mastered_count' as const,
    threshold: 5,
    subjectId: null,
    bookId: null,
    metadata: null,
    celebratedAt: null,
    createdAt: '2026-04-10T12:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    profileId: '990e8400-e29b-41d4-a716-446655440004',
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
    await waitFor(
      () => {
        active!.result.getByText('5 topics mastered');
      },
      { timeout: 5000 },
    );
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
