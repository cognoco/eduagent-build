import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';
import type { Profile } from '@eduagent/schemas';
import {
  fetchLearningResumeTarget,
  useChildInventory,
  useChildProgressHistory,
  useChildProgressSummary,
  useLearningResumeTarget,
  useProgressInventory,
  useProgressHistory,
  useProgressMilestones,
  useProfileSessions,
  useProfileReports,
  useProfileWeeklyReports,
  useRefreshProgressSnapshot,
} from '../../hooks/use-progress';
import ProgressScreen from './progress/index';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Hero copy translations
      if (key === 'progress.hero.sessionsCompleted') {
        const count = opts?.count as number;
        return `${count} session${count === 1 ? '' : 's'} completed`;
      }
      if (key === 'progress.hero.sessionsCompletedSubtitle')
        return 'Topics mastered and vocabulary will appear as you progress.';
      if (key === 'progress.hero.buildingLanguage')
        return "You're building your language";
      if (key === 'progress.hero.buildingLanguageSubtitle')
        return `${opts?.count ?? ''} words and counting.`;
      if (key === 'progress.hero.knowWords')
        return `You know ${opts?.count ?? ''} words`;
      if (key === 'progress.hero.knowWordsSubtitle')
        return 'That knowledge is yours now.';
      if (key === 'progress.hero.buildingKnowledge')
        return "You're building your knowledge";
      if (key === 'progress.hero.buildingKnowledgeSubtitle')
        return `${opts?.count ?? ''} topics and counting.`;
      if (key === 'progress.hero.masteredTopics')
        return `You've mastered ${opts?.count ?? ''} topics`;
      if (key === 'progress.hero.masteredTopicsSubtitle')
        return 'Your progress keeps stacking up.';
      if (key === 'progress.hero.masteredTopicsAndWords')
        return `And you know ${opts?.words ?? ''} words across your subjects.`;
      if (key === 'progress.empty.withSubjectTitle')
        return `Progress unlocks after you study ${opts?.subject ?? ''}`;
      if (key === 'progress.empty.withSubjectSubtitle')
        return `Study a topic in ${opts?.subject ?? ''} first.`;
      if (key === 'progress.register.child.weekTitle') return 'Your week';
      if (key === 'progress.register.child.monthTitle') return 'Your month';
      if (key === 'progress.register.child.growthTitle')
        return 'What you learned';
      if (key === 'progress.register.child.growthSubtitle')
        return 'Your weekly wins';
      if (key === 'progress.register.child.masteredTopicsHero')
        return `You learned ${opts?.count ?? ''} topics. Steady wins.`;
      if (key === 'progress.register.child.growthPrimaryLegend')
        return 'Topics learned';
      if (key === 'progress.register.child.growthSecondaryLegend')
        return 'Words added';
      if (key === 'progress.register.child.currentlyWorkingOnTitle')
        return "What you're working on right now";
      if (key === 'progress.register.child.currentlyWorkingOnDetected')
        return 'Spotted in your recent sessions';
      if (key === 'progress.register.adult.weekTitle') return 'Weekly report';
      if (key === 'progress.register.adult.monthTitle') return 'Monthly report';
      if (key === 'progress.register.adult.growthTitle') return 'Your growth';
      if (key === 'progress.register.adult.growthSubtitle')
        return 'Weekly changes in topics mastered and vocabulary';
      if (key === 'progress.register.adult.growthPrimaryLegend')
        return 'Topics mastered';
      if (key === 'progress.register.adult.growthSecondaryLegend')
        return 'Vocabulary growth';
      if (key === 'progress.register.adult.currentlyWorkingOnTitle')
        return 'Currently working on';
      if (key === 'progress.register.adult.currentlyWorkingOnDetected')
        return 'Detected from recent sessions';
      if (key === 'progress.currentlyWorkingOn.andNMore')
        return `and ${opts?.count ?? ''} more`;
      // New learner
      if (key === 'progress.newLearner.title') {
        const count = opts?.count as number;
        return `You've completed ${count} session${
          count === 1 ? '' : 's'
        }. Keep going!`;
      }
      if (key === 'progress.newLearner.subtitle') {
        const count = opts?.count as number;
        return `Complete ${count} more ${
          count === 1 ? 'session' : 'sessions'
        } to see your full learning journey!`;
      }
      // Milestone next label
      if (key === 'progress.milestones.allReached')
        return "You've reached all session milestones. Keep exploring!";
      if (key === 'progress.milestones.nextMilestone') {
        const count = opts?.count as number;
        return `Complete ${count} more ${
          count === 1 ? 'session' : 'sessions'
        } to reach your next milestone.`;
      }
      // Stats
      if (key === 'progress.stats.sessions') {
        const count = opts?.count as number;
        return `${count} sessions`;
      }
      if (key === 'progress.stats.streak') {
        const count = opts?.count as number;
        return `${count}-day streak`;
      }
      if (key === 'progress.weeklyDelta.topicsMastered') {
        const count = opts?.count as number;
        return `+${count} topic${count === 1 ? '' : 's'} this week`;
      }
      if (key === 'progress.weeklyDelta.vocabularyTotal') {
        const count = opts?.count as number;
        return `+${count} word${count === 1 ? '' : 's'} this week`;
      }
      if (key === 'progress.weeklyDelta.topicsExplored') {
        const count = opts?.count as number;
        return `+${count} topic${count === 1 ? '' : 's'} explored this week`;
      }
      // Guardian view
      if (key === 'progress.guardian.sessionCount') {
        const count = opts?.count as number;
        return `${count} ${count === 1 ? 'session' : 'sessions'}`;
      }
      if (key === 'progress.guardian.lastStudied')
        return `Last studied ${opts?.date ?? ''}`;
      if (key === 'progress.guardian.topicsMastered')
        return `${opts?.mastered ?? ''}/${opts?.total ?? ''} topics mastered`;
      if (key === 'progress.guardian.summaryFallback')
        return 'No summary available yet. One will appear after the next session.';
      if (key === 'progress.guardian.noRecentSessions')
        return `No new sessions since ${opts?.date ?? ''}.`;
      if (key === 'progress.guardian.noRecentSessionsFallback')
        return 'No new sessions since a while ago.';
      if (key === 'progress.guardian.staleSummary')
        return 'Summary may not reflect the latest activity yet.';
      if (key === 'progress.guardian.nudgeCta')
        return `A short nudge might help ${opts?.name ?? ''} restart`;
      if (key === 'progress.guardian.nudgeA11y')
        return `Send ${opts?.name ?? ''} a nudge`;
      if (key === 'progress.guardian.viewAllReports') return 'View all reports';
      // Common fallbacks
      if (key === 'common.tryAgain') return 'Try again';
      if (key === 'common.goBack') return 'Go Back';
      if (key === 'common.goHome') return 'Go Home';
      return key;
    },
  }),
}));

jest.mock('../../hooks/use-progress');
const mockUseSubjects = jest.fn(() => ({
  data: [] as Array<{ id: string; name: string; status: string }>,
}));
jest.mock(
  '../../hooks/use-subjects' /* gc1-allow: hook requires QueryClientProvider; not runnable in unit env */,
  () => ({
    useSubjects: () => mockUseSubjects(),
  }),
);
const mockUseActiveProfileRole = jest.fn();
jest.mock('../../hooks/use-active-profile-role' /* gc1-allow */, () => ({
  useActiveProfileRole: () => mockUseActiveProfileRole(),
}));
let mockLinkedChildren: Profile[] = [];
jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'test-profile-id',
      displayName: 'Test Learner',
      createdAt: '2026-01-01T00:00:00Z',
      isOwner: true,
    },
    profiles: [],
  }),
  useLinkedChildren: () => mockLinkedChildren,
}));
jest.mock('../../lib/analytics', () => ({
  bucketAccountAge: jest.fn(() => '91+'),
  hashProfileId: jest.fn((id: string) => `hashed-${id}`),
  track: jest.fn(),
}));
jest.mock('../../lib/api-client', () => ({
  useApiClient: () => ({}),
}));
let mockSearchParams: { profileId?: string | string[] } = {};
jest.mock('expo-router', () => {
  const ReactReq = jest.requireActual<typeof import('react')>('react');
  const push = jest.fn();
  return {
    useFocusEffect: jest.fn((callback: () => void) => {
      ReactReq.useEffect(() => callback(), [callback]);
    }),
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ push, back: jest.fn(), replace: jest.fn() }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const baseGlobal: {
  topicsAttempted: number;
  topicsMastered: number;
  vocabularyTotal: number;
  vocabularyMastered: number;
  weeklyDeltaTopicsMastered: number | null;
  weeklyDeltaVocabularyTotal: number | null;
  weeklyDeltaTopicsExplored: number | null;
  totalSessions: number;
  totalActiveMinutes: number;
  totalWallClockMinutes: number;
  currentStreak: number;
  longestStreak: number;
} = {
  topicsAttempted: 0,
  topicsMastered: 0,
  vocabularyTotal: 0,
  vocabularyMastered: 0,
  weeklyDeltaTopicsMastered: null,
  weeklyDeltaVocabularyTotal: null,
  weeklyDeltaTopicsExplored: null,
  totalSessions: 0,
  totalActiveMinutes: 0,
  totalWallClockMinutes: 0,
  currentStreak: 0,
  longestStreak: 0,
};

function makeLinkedChild(overrides?: Partial<Profile>): Profile {
  return {
    id: 'child-1',
    accountId: 'account-1',
    displayName: 'Emma',
    isOwner: false,
    hasPremiumLlm: false,
    consentStatus: null,
    linkCreatedAt: null,
    conversationLanguage: 'en',
    pronouns: null,
    birthYear: 2015,
    avatarUrl: null,
    location: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

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

const childProgressProfile: Profile = {
  id: 'child-1',
  accountId: 'account-1',
  displayName: 'Emma',
  isOwner: false,
  hasPremiumLlm: false,
  consentStatus: null,
  linkCreatedAt: null,
  conversationLanguage: 'en',
  pronouns: null,
  birthYear: 2015,
  avatarUrl: null,
  location: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function mockHooks(
  overrides: {
    inventory?:
      | {
          global: typeof baseGlobal;
          subjects: unknown[];
          currentlyWorkingOn?: string[];
          thisWeekMini?: {
            sessions: number;
            wordsLearned: number;
            topicsTouched: number;
          };
        }
      | undefined;
    childInventory?:
      | {
          global: typeof baseGlobal;
          subjects: unknown[];
          currentlyWorkingOn?: string[];
          thisWeekMini?: {
            sessions: number;
            wordsLearned: number;
            topicsTouched: number;
          };
        }
      | undefined;
    isLoading?: boolean;
    isError?: boolean;
  } = {},
) {
  const {
    childInventory,
    inventory,
    isLoading = false,
    isError = false,
  } = overrides;
  const inventoryRefetch = jest.fn();
  const historyRefetch = jest.fn();
  const milestonesRefetch = jest.fn();
  const refreshSnapshot = jest.fn().mockResolvedValue(undefined);
  const monthlyReportsRefetch = jest.fn();
  const weeklyReportsRefetch = jest.fn();
  (useProgressInventory as jest.Mock).mockReturnValue({
    data: inventory,
    isLoading,
    isError,
    isRefetching: false,
    error: isError ? new Error('fail') : null,
    refetch: inventoryRefetch,
  });
  (useProgressHistory as jest.Mock).mockReturnValue({
    data: undefined,
    isRefetching: false,
    refetch: historyRefetch,
  });
  (useProgressMilestones as jest.Mock).mockReturnValue({
    data: [],
    refetch: milestonesRefetch,
  });
  (useRefreshProgressSnapshot as jest.Mock).mockReturnValue({
    mutateAsync: refreshSnapshot,
    isPending: false,
  });
  (useProfileSessions as jest.Mock).mockReturnValue({
    data:
      inventory && inventory.global.totalSessions > 0
        ? [
            {
              sessionId: 'session-1',
              subjectId: 'subject-1',
              subjectName: 'Math',
              topicId: null,
              topicTitle: null,
              sessionType: 'learning',
              startedAt: new Date().toISOString(),
              endedAt: null,
              exchangeCount: 1,
              escalationRung: 1,
              durationSeconds: 60,
              wallClockSeconds: 60,
              displayTitle: 'Learning',
              displaySummary: null,
              homeworkSummary: null,
              highlight: null,
              narrative: null,
              conversationPrompt: null,
              engagementSignal: null,
            },
          ]
        : [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  (useProfileReports as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: monthlyReportsRefetch,
  });
  (useProfileWeeklyReports as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: weeklyReportsRefetch,
  });
  (useChildInventory as jest.Mock).mockReturnValue({
    data: childInventory ?? null,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  });
  (useChildProgressHistory as jest.Mock).mockReturnValue({
    data: null,
    isRefetching: false,
    refetch: jest.fn(),
  });
  (useChildProgressSummary as jest.Mock).mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  (useLearningResumeTarget as jest.Mock).mockReturnValue({
    data: null,
  });
  (fetchLearningResumeTarget as jest.Mock).mockResolvedValue(null);

  return {
    historyRefetch,
    inventoryRefetch,
    milestonesRefetch,
    monthlyReportsRefetch,
    refreshSnapshot,
    weeklyReportsRefetch,
  };
}

describe('ProgressScreen — progressive disclosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseActiveProfileRole.mockReturnValue('owner');
    mockUseSubjects.mockReturnValue({ data: [] });
    mockLinkedChildren = [];
    mockSearchParams = {};
  });

  it('shows full progress view when totalSessions < 4', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    screen.getByText('2 sessions completed');
  });

  it('refreshes progress data when the mounted progress tab is focused again', async () => {
    const refs = mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(refs.inventoryRefetch).not.toHaveBeenCalled();

    const focusCallback = (useFocusEffect as jest.Mock).mock.calls.at(
      -1,
    )?.[0] as () => void;
    act(() => {
      focusCallback();
    });

    await waitFor(() => {
      expect(refs.inventoryRefetch).toHaveBeenCalled();
    });
    expect(refs.refreshSnapshot).toHaveBeenCalled();
    expect(refs.historyRefetch).toHaveBeenCalled();
    expect(refs.monthlyReportsRefetch).toHaveBeenCalled();
    expect(refs.weeklyReportsRefetch).toHaveBeenCalled();
    expect(refs.milestonesRefetch).toHaveBeenCalled();
  });

  it('keeps the focus refresh callback stable across render updates', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });
    const view = render(<ProgressScreen />);

    const initialCallback = (useFocusEffect as jest.Mock).mock.calls.at(
      -1,
    )?.[0];
    view.rerender(<ProgressScreen />);

    expect((useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]).toBe(
      initialCallback,
    );
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
    // heroCopy: 5 sessions + low mastery (3 topics, 0 vocab) → leads with sessions
    screen.getByText('5 sessions completed');
  });

  it('renders weekly delta chips when the learner has prior-week deltas', () => {
    mockHooks({
      inventory: {
        global: {
          ...baseGlobal,
          totalSessions: 5,
          topicsMastered: 4,
          vocabularyTotal: 12,
          weeklyDeltaTopicsMastered: 3,
          weeklyDeltaVocabularyTotal: 12,
          weeklyDeltaTopicsExplored: 2,
        },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    screen.getByTestId('progress-weekly-delta-topicsMastered');
    screen.getByText('+3 topics this week');
    screen.getByTestId('progress-weekly-delta-vocabularyTotal');
    screen.getByText('+12 words this week');
    screen.getByTestId('progress-weekly-delta-topicsExplored');
    screen.getByText('+2 topics explored this week');
  });

  it('hides weekly delta chips when no prior-week snapshot exists', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    expect(
      screen.queryByTestId('progress-weekly-delta-topicsMastered'),
    ).toBeNull();
    expect(
      screen.queryByTestId('progress-weekly-delta-vocabularyTotal'),
    ).toBeNull();
    expect(
      screen.queryByTestId('progress-weekly-delta-topicsExplored'),
    ).toBeNull();
  });

  it('hides zero weekly delta chips — no discouraging "+0" pills', () => {
    mockHooks({
      inventory: {
        global: {
          ...baseGlobal,
          totalSessions: 5,
          topicsMastered: 3,
          weeklyDeltaTopicsMastered: 0,
          weeklyDeltaVocabularyTotal: 0,
          weeklyDeltaTopicsExplored: 0,
        },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    expect(
      screen.queryByTestId('progress-weekly-delta-topicsMastered'),
    ).toBeNull();
    expect(
      screen.queryByTestId('progress-weekly-delta-vocabularyTotal'),
    ).toBeNull();
    expect(
      screen.queryByTestId('progress-weekly-delta-topicsExplored'),
    ).toBeNull();
  });

  it('shows full view when totalSessions is 3', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 3 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    screen.getByText('3 sessions completed');
  });

  it('shows empty state (not teaser) when totalSessions is 0 and no subjects', () => {
    mockHooks({
      inventory: { global: { ...baseGlobal, totalSessions: 0 }, subjects: [] },
    });
    render(<ProgressScreen />);

    screen.getByTestId('progress-start-learning');
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('points empty progress toward the first active subject when one exists', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'subject-italian', name: 'Italian', status: 'active' }],
    });
    mockHooks({
      inventory: { global: { ...baseGlobal, totalSessions: 0 }, subjects: [] },
    });

    render(<ProgressScreen />);

    screen.getByText('Progress unlocks after you study Italian');
    screen.getByText('Study a topic in Italian first.');
  });

  it('opens the requested child progress profile from route params', () => {
    mockLinkedChildren = [childProgressProfile];
    mockSearchParams = { profileId: 'child-1' };
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 0 },
        subjects: [],
      },
      childInventory: {
        global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    screen.getByTestId('progress-pill-child-1');
    expect(useChildInventory).toHaveBeenCalledWith('child-1', {
      enabled: true,
    });
  });

  it('opens a valid requested child profile after child links load', async () => {
    mockSearchParams = { profileId: 'child-1' };
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
      childInventory: {
        global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
        subjects: [fullSubject],
      },
    });

    const view = render(<ProgressScreen />);

    expect(useChildInventory).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });

    mockLinkedChildren = [childProgressProfile];
    view.rerender(<ProgressScreen />);

    await waitFor(() => {
      expect(useChildInventory).toHaveBeenLastCalledWith('child-1', {
        enabled: true,
      });
      screen.getByTestId('progress-pill-child-1');
      screen.getByText('6 sessions');
    });
  });

  it('ignores an unknown requested child profile when no child link is known', () => {
    mockSearchParams = { profileId: 'foreign-child' };
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    expect(useChildInventory).toHaveBeenCalledWith(undefined, {
      enabled: false,
    });
    screen.getByText('2 sessions completed');
  });

  it('ignores an unknown requested child profile after child links load', async () => {
    mockSearchParams = { profileId: 'foreign-child' };
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 2 },
        subjects: [fullSubject],
      },
    });

    const view = render(<ProgressScreen />);

    expect(useChildInventory).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });

    mockLinkedChildren = [childProgressProfile];
    view.rerender(<ProgressScreen />);

    await waitFor(() => {
      expect(useChildInventory).toHaveBeenLastCalledWith(undefined, {
        enabled: false,
      });
      screen.getByText('2 sessions completed');
    });
  });

  it('shows full view when totalSessions is 1 with subjects', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 1 },
        subjects: [fullSubject],
      },
    });
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    screen.getByText('1 session completed');
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

  it('uses child register copy for child profiles', () => {
    mockUseActiveProfileRole.mockReturnValue('child');
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    screen.getByText('You learned 3 topics. Steady wins.');
    screen.getByText('What you learned');
    // Weekly/Monthly report card titles (WeeklyReportCard/MonthlyReportCard) were removed
    // in PR-6 (reports dedup). Register-aware growth chart title still present.
    expect(screen.queryByText('Your growth')).toBeNull();
    expect(screen.queryByText('Weekly report')).toBeNull();
  });

  it('uses adult register copy for owner profiles', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });

    render(<ProgressScreen />);

    screen.getByText('Your growth');
    // Weekly/Monthly report card titles (WeeklyReportCard/MonthlyReportCard) were removed
    // in PR-6 (reports dedup). Register-aware growth chart title still present.
    expect(screen.queryByText('Your week')).toBeNull();
  });

  it('renders currently working on when inventory has current focus areas', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 1 },
        subjects: [fullSubject],
        currentlyWorkingOn: ['Fractions', 'Decimals'],
      },
    });
    render(<ProgressScreen />);

    screen.getByTestId('progress-currently-working-on');
    screen.getByText('Currently working on');
    screen.getByText('Fractions');
    screen.getByText('Decimals');
  });

  it('keeps currently working on hidden when inventory has no focus areas', () => {
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 1 },
        subjects: [fullSubject],
        currentlyWorkingOn: [],
      },
    });
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-currently-working-on')).toBeNull();
  });

  it('does not gate when inventory is undefined (loading resolved with no data)', () => {
    mockHooks({ inventory: undefined });
    render(<ProgressScreen />);

    // No teaser and no empty state — just the loading/empty fallthrough
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('renders subject breakdown for parent viewing child', () => {
    mockLinkedChildren = [makeLinkedChild()];
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });
    (useChildInventory as jest.Mock).mockReturnValue({
      data: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
        currentlyWorkingOn: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    render(<ProgressScreen />);

    screen.getByTestId('progress-subject-breakdown');
    screen.getByTestId('progress-subject-card-s1');
    screen.getByText('Math');
    screen.getByText('5 sessions · 30 min');
  });

  it('uses compact subject breakdown cards when a child has many subjects', () => {
    const manySubjects = Array.from({ length: 7 }, (_, index) => ({
      ...fullSubject,
      subjectId: `s${index + 1}`,
      subjectName: `Subject ${index + 1}`,
      lastSessionAt: '2026-05-01T10:00:00Z',
    }));

    mockLinkedChildren = [makeLinkedChild()];
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });
    (useChildInventory as jest.Mock).mockReturnValue({
      data: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: manySubjects,
        currentlyWorkingOn: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    render(<ProgressScreen />);

    screen.getByTestId('progress-subject-card-s1');
    screen.getByTestId('progress-subject-card-s7');
    screen.getByText('Subject 7');
    screen.getAllByText('3/10 topics mastered');
    expect(screen.queryByText(/Last studied/)).toBeNull();
  });

  it('does not render report cards for parent viewing child', () => {
    mockLinkedChildren = [makeLinkedChild()];
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });
    (useChildInventory as jest.Mock).mockReturnValue({
      data: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
        currentlyWorkingOn: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-weekly-report-tracker')).toBeNull();
    expect(screen.queryByTestId('progress-monthly-report-tracker')).toBeNull();
    screen.getByTestId('progress-view-all-reports');
  });

  it('renders progress summary freshness states for parent viewing child', () => {
    mockLinkedChildren = [makeLinkedChild()];
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });
    (useChildInventory as jest.Mock).mockReturnValue({
      data: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
        currentlyWorkingOn: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    (useChildProgressSummary as jest.Mock).mockReturnValue({
      data: {
        summary: 'Emma explored fractions and mastered 3 new topics this week.',
        generatedAt: '2026-05-13T10:00:00Z',
        basedOnLastSessionAt: '2026-05-10T09:00:00Z',
        latestSessionId: 'session-1',
        activityState: 'no_recent_activity',
        nudgeRecommended: true,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ProgressScreen />);

    screen.getByTestId('progress-summary-header');
    screen.getByText(/Emma explored fractions/);
    screen.getByTestId('progress-summary-no-recent');
    screen.getByTestId('progress-nudge-cta');
  });

  it('renders deterministic fallback when no progress summary exists', () => {
    mockLinkedChildren = [makeLinkedChild()];
    mockHooks({
      inventory: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
      },
    });
    (useChildInventory as jest.Mock).mockReturnValue({
      data: {
        global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
        subjects: [fullSubject],
        currentlyWorkingOn: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    (useChildProgressSummary as jest.Mock).mockReturnValue({
      data: {
        summary: null,
        generatedAt: null,
        basedOnLastSessionAt: null,
        latestSessionId: null,
        activityState: 'no_recent_activity',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ProgressScreen />);

    screen.getByTestId('progress-summary-fallback');
    expect(screen.queryByTestId('progress-summary-header')).toBeNull();
  });
});
