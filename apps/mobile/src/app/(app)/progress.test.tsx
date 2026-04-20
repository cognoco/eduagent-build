import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  useProgressInventory,
  useProgressHistory,
  useProgressMilestones,
  useRefreshProgressSnapshot,
} from '../../hooks/use-progress';
import ProgressScreen from './progress/index';

jest.mock('../../hooks/use-progress');
jest.mock('expo-router', () => {
  const push = jest.fn();
  return { useRouter: () => ({ push, back: jest.fn(), replace: jest.fn() }) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const baseGlobal = {
  topicsAttempted: 0,
  topicsMastered: 0,
  vocabularyTotal: 0,
  vocabularyMastered: 0,
  totalSessions: 0,
  totalActiveMinutes: 0,
  currentStreak: 0,
  longestStreak: 0,
};

const fullSubject = {
  subjectId: 's1',
  subjectName: 'Math',
  pedagogyMode: 'general',
  topics: {
    total: 10,
    explored: 5,
    mastered: 3,
    inProgress: 2,
    notStarted: 5,
  },
  vocabulary: {
    total: 0,
    mastered: 0,
    learning: 0,
    new: 0,
    byCefrLevel: {},
  },
  estimatedProficiency: null,
  estimatedProficiencyLabel: null,
  lastSessionAt: null,
  activeMinutes: 30,
  sessionsCount: 5,
};

function mockHooks(
  overrides: {
    inventory?: { global: typeof baseGlobal; subjects: unknown[] } | undefined;
    isLoading?: boolean;
    isError?: boolean;
  } = {}
) {
  const { inventory, isLoading = false, isError = false } = overrides;
  (useProgressInventory as jest.Mock).mockReturnValue({
    data: inventory,
    isLoading,
    isError,
    isRefetching: false,
    error: isError ? new Error('fail') : null,
    refetch: jest.fn(),
  });
  (useProgressHistory as jest.Mock).mockReturnValue({
    data: undefined,
    isRefetching: false,
  });
  (useProgressMilestones as jest.Mock).mockReturnValue({
    data: [],
  });
  (useRefreshProgressSnapshot as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
}

describe('ProgressScreen — progressive disclosure', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows new learner teaser when totalSessions < 4', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.getByTestId('progress-new-learner-teaser')).toBeTruthy();
    expect(screen.getByText(/2 more sessions/)).toBeTruthy();
    expect(screen.getByTestId('progress-new-learner-start')).toBeTruthy();
  });

  it('shows full progress view when totalSessions >= 4', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    // heroCopy: topicsMastered < 20 && vocabularyTotal === 0 → "You're building your knowledge"
    expect(screen.getByText("You're building your knowledge")).toBeTruthy();
  });

  it('shows teaser with "1 more session" when totalSessions is 3', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 3 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.getByText(/1 more session to/)).toBeTruthy();
  });

  it('shows empty state (not teaser) when totalSessions is 0 and no subjects', () => {
    mockHooks({
      inventory: { global: { ...baseGlobal, totalSessions: 0 }, subjects: [] },
    });
    render(<ProgressScreen />);

    expect(screen.getByTestId('progress-start-learning')).toBeTruthy();
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('shows teaser when totalSessions is 1 with subjects', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 1 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.getByTestId('progress-new-learner-teaser')).toBeTruthy();
    expect(screen.getByText(/3 more sessions/)).toBeTruthy();
  });

  it('shows full view when totalSessions is exactly 4', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 4, topicsMastered: 1 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('navigates to home when Start learning pressed in teaser', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    fireEvent.press(screen.getByTestId('progress-new-learner-start'));

    const { useRouter } = require('expo-router');
    expect(useRouter().push).toHaveBeenCalledWith('/(app)/home');
  });

  it('does not gate when inventory is undefined (loading resolved with no data)', () => {
    mockHooks({ inventory: undefined });
    render(<ProgressScreen />);

    // No teaser and no empty state — just the loading/empty fallthrough
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });
});
