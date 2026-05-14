import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import type { Profile } from '@eduagent/schemas';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
  cleanupScreen,
} from '../../../test-utils/screen-render-harness';
import ProgressScreen from './progress/index';
import { useFocusEffect } from 'expo-router';

// ─── Transport boundary — mock only the fetch layer, real hooks + QueryClient run ──

const mockFetch = createRoutedMockFetch();

jest.mock('../../lib/api-client', () => // gc1-allow: transport-boundary — mocks fetch layer only, real hooks execute
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

// ─── Native boundaries (expo-router, safe-area-context) ────────────────────────

let mockRouterPush = jest.fn();
let mockRouterBack = jest.fn();
let mockRouterReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => { // gc1-allow: native-boundary — expo-router requires native bindings
  const ReactReq = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: jest.fn((callback: () => void) => {
      ReactReq.useEffect(() => callback(), [callback]);
    }),
    useLocalSearchParams: () => mockSearchParams,
    useGlobalSearchParams: () => mockSearchParams,
    useRouter: () => ({
      push: mockRouterPush,
      back: mockRouterBack,
      replace: mockRouterReplace,
    }),
    useSegments: () => [],
    usePathname: () => '/',
    Link: require('react-native').Text,
  };
});

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary — safe-area-context requires native bindings
  require('../../test-utils/native-shims').safeAreaShim(),
);

// ─── External boundary — i18n ──────────────────────────────────────────────────

jest.mock('react-i18next', () => ({ // gc1-allow: external-boundary — i18n init requires React Native native modules
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
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
      if (key === 'progress.register.child.growthTitle') return 'What you learned';
      if (key === 'progress.register.child.growthSubtitle') return 'Your weekly wins';
      if (key === 'progress.register.child.masteredTopicsHero')
        return `You learned ${opts?.count ?? ''} topics. Steady wins.`;
      if (key === 'progress.register.child.growthPrimaryLegend') return 'Topics learned';
      if (key === 'progress.register.child.growthSecondaryLegend') return 'Words added';
      if (key === 'progress.register.child.currentlyWorkingOnTitle')
        return "What you're working on right now";
      if (key === 'progress.register.child.currentlyWorkingOnDetected')
        return 'Spotted in your recent sessions';
      if (key === 'progress.register.adult.weekTitle') return 'Weekly report';
      if (key === 'progress.register.adult.monthTitle') return 'Monthly report';
      if (key === 'progress.register.adult.growthTitle') return 'Your growth';
      if (key === 'progress.register.adult.growthSubtitle')
        return 'Weekly changes in topics mastered and vocabulary';
      if (key === 'progress.register.adult.growthPrimaryLegend') return 'Topics mastered';
      if (key === 'progress.register.adult.growthSecondaryLegend') return 'Vocabulary growth';
      if (key === 'progress.register.adult.currentlyWorkingOnTitle')
        return 'Currently working on';
      if (key === 'progress.register.adult.currentlyWorkingOnDetected')
        return 'Detected from recent sessions';
      if (key === 'progress.currentlyWorkingOn.andNMore')
        return `and ${opts?.count ?? ''} more`;
      if (key === 'progress.newLearner.title') {
        const count = opts?.count as number;
        return `You've completed ${count} session${count === 1 ? '' : 's'}. Keep going!`;
      }
      if (key === 'progress.newLearner.subtitle') {
        const count = opts?.count as number;
        return `Complete ${count} more ${count === 1 ? 'session' : 'sessions'} to see your full learning journey!`;
      }
      if (key === 'progress.milestones.allReached')
        return "You've reached all session milestones. Keep exploring!";
      if (key === 'progress.milestones.nextMilestone') {
        const count = opts?.count as number;
        return `Complete ${count} more ${count === 1 ? 'session' : 'sessions'} to reach your next milestone.`;
      }
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
      if (key === 'common.tryAgain') return 'Try again';
      if (key === 'common.goBack') return 'Go Back';
      if (key === 'common.goHome') return 'Go Home';
      return key;
    },
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBaseGlobal(
  overrides: Partial<{
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
  }> = {},
) {
  return {
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
    ...overrides,
  };
}

const fullSubject = {
  subjectId: 's1',
  subjectName: 'Math',
  pedagogyMode: 'general',
  topics: { total: 10, explored: 5, mastered: 3, inProgress: 2, notStarted: 5 },
  vocabulary: { total: 0, mastered: 0, learning: 0, new: 0, byCefrLevel: {} },
  estimatedProficiency: null,
  estimatedProficiencyLabel: null,
  lastSessionAt: null,
  activeMinutes: 30,
  wallClockMinutes: 30,
  sessionsCount: 5,
};

function makeChild(overrides?: Partial<Profile>): Profile {
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

const ownerProfile = createTestProfile({
  id: 'test-profile-id',
  displayName: 'Test Learner',
  isOwner: true,
  birthYear: 1990,
});

const childProfile = makeChild();

// ─── Route helpers ────────────────────────────────────────────────────────────

/** Set up routes for the owner's own inventory view. */
function setOwnerRoutes(opts: {
  global?: ReturnType<typeof makeBaseGlobal>;
  subjects?: unknown[];
  currentlyWorkingOn?: string[];
} = {}) {
  const inventory = {
    global: opts.global ?? makeBaseGlobal(),
    subjects: opts.subjects ?? [],
    ...(opts.currentlyWorkingOn !== undefined
      ? { currentlyWorkingOn: opts.currentlyWorkingOn }
      : {}),
  };
  mockFetch.setRoute('/progress/inventory', inventory);
  mockFetch.setRoute('/progress/sessions', { sessions: [] });
  mockFetch.setRoute('/progress/reports', { reports: [] });
  mockFetch.setRoute('/progress/weekly-reports', { reports: [] });
  mockFetch.setRoute('/progress/history', { dataPoints: [] });
  mockFetch.setRoute('/progress/milestones', { milestones: [] });
  mockFetch.setRoute('/progress/resume-target', { target: null });
  mockFetch.setRoute('/progress/refresh', {});
}

/** Set up routes for a child's inventory as seen by a guardian. */
function setChildRoutes(opts: {
  childId?: string;
  global?: ReturnType<typeof makeBaseGlobal>;
  subjects?: unknown[];
  currentlyWorkingOn?: string[];
  summary?: object | null;
} = {}) {
  const childId = opts.childId ?? 'child-1';
  const inventory = {
    global: opts.global ?? makeBaseGlobal(),
    subjects: opts.subjects ?? [],
    ...(opts.currentlyWorkingOn !== undefined
      ? { currentlyWorkingOn: opts.currentlyWorkingOn }
      : {}),
  };
  mockFetch.setRoute(`/dashboard/children/${childId}/inventory`, { inventory });
  mockFetch.setRoute(`/dashboard/children/${childId}/progress-history`, { history: null });
  mockFetch.setRoute(`/dashboard/children/${childId}/sessions`, { sessions: [] });
  mockFetch.setRoute(`/dashboard/children/${childId}/reports`, { reports: [] });
  mockFetch.setRoute(`/dashboard/children/${childId}/weekly-reports`, { reports: [] });
  const defaultSummary = {
    summary: null,
    generatedAt: null,
    basedOnLastSessionAt: null,
    latestSessionId: null,
    activityState: 'fresh',
    nudgeRecommended: false,
  };
  mockFetch.setRoute(
    `/dashboard/children/${childId}/progress-summary`,
    opts.summary !== undefined ? opts.summary : defaultSummary,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProgressScreen — progressive disclosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterPush = jest.fn();
    mockRouterBack = jest.fn();
    mockRouterReplace = jest.fn();
    mockSearchParams = {};
    // Safe defaults for every test
    setOwnerRoutes();
    mockFetch.setRoute('/subjects', { subjects: [] });
  });

  it('shows full progress view when totalSessions < 4', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 2 }), subjects: [fullSubject] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
      screen.getByText('2 sessions completed');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('refreshes progress data when the mounted progress tab is focused again', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 2 }), subjects: [fullSubject] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => { screen.getByText('2 sessions completed'); });

    const callsBefore = mockFetch.mock.calls.length;

    const focusCallback = (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0] as () => void;
    act(() => { focusCallback(); });

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('keeps the focus refresh callback stable across render updates', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 2 }), subjects: [fullSubject] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    const view = render(<ProgressScreen />, { wrapper });

    const initialCallback = (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0];
    view.rerender(<ProgressScreen />);

    expect((useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]).toBe(initialCallback);

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('shows full progress view when totalSessions >= 4', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
      // heroCopy: 5 sessions + low mastery (3 topics, 0 vocab) → leads with sessions
      screen.getByText('5 sessions completed');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('renders weekly delta chips when the learner has prior-week deltas', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({
        totalSessions: 5,
        topicsMastered: 4,
        vocabularyTotal: 12,
        weeklyDeltaTopicsMastered: 3,
        weeklyDeltaVocabularyTotal: 12,
        weeklyDeltaTopicsExplored: 2,
      }),
      subjects: [fullSubject],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-weekly-delta-topicsMastered');
      screen.getByText('+3 topics this week');
      screen.getByTestId('progress-weekly-delta-vocabularyTotal');
      screen.getByText('+12 words this week');
      screen.getByTestId('progress-weekly-delta-topicsExplored');
      screen.getByText('+2 topics explored this week');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('hides weekly delta chips when no prior-week snapshot exists', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => { screen.getByText('5 sessions completed'); });

    expect(screen.queryByTestId('progress-weekly-delta-topicsMastered')).toBeNull();
    expect(screen.queryByTestId('progress-weekly-delta-vocabularyTotal')).toBeNull();
    expect(screen.queryByTestId('progress-weekly-delta-topicsExplored')).toBeNull();

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('hides zero weekly delta chips — no discouraging "+0" pills', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({
        totalSessions: 5,
        topicsMastered: 3,
        weeklyDeltaTopicsMastered: 0,
        weeklyDeltaVocabularyTotal: 0,
        weeklyDeltaTopicsExplored: 0,
      }),
      subjects: [fullSubject],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => { screen.getByText('5 sessions completed'); });

    expect(screen.queryByTestId('progress-weekly-delta-topicsMastered')).toBeNull();
    expect(screen.queryByTestId('progress-weekly-delta-vocabularyTotal')).toBeNull();
    expect(screen.queryByTestId('progress-weekly-delta-topicsExplored')).toBeNull();

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('shows full view when totalSessions is 3', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 3 }), subjects: [fullSubject] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
      screen.getByText('3 sessions completed');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('shows empty state (not teaser) when totalSessions is 0 and no subjects', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 0 }), subjects: [] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-start-learning');
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('points empty progress toward the first active subject when one exists', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 0 }), subjects: [] });
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'subject-italian', name: 'Italian', status: 'active', curriculumStatus: 'ready' }],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByText('Progress unlocks after you study Italian');
      screen.getByText('Study a topic in Italian first.');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('opens the requested child progress profile from route params', async () => {
    mockSearchParams = { profileId: 'child-1' };
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 0 }), subjects: [] });
    setChildRoutes({
      childId: 'child-1',
      global: makeBaseGlobal({ totalSessions: 6, topicsMastered: 2 }),
      subjects: [fullSubject],
    });

    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-pill-child-1');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('opens a valid requested child profile after child links load', async () => {
    mockSearchParams = { profileId: 'child-1' };
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 2 }), subjects: [fullSubject] });
    setChildRoutes({
      childId: 'child-1',
      global: makeBaseGlobal({ totalSessions: 6, topicsMastered: 2 }),
      subjects: [fullSubject],
    });

    // Mount without child profiles (simulating children not yet loaded from cache)
    const { wrapper: Wrapper1, queryClient: qc1 } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    const view = render(<ProgressScreen />, { wrapper: Wrapper1 });

    // Simulate child profiles arriving (cache-race)
    const { wrapper: Wrapper2, queryClient: qc2 } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    view.rerender(
      React.createElement(Wrapper2, null, React.createElement(ProgressScreen)),
    );

    await waitFor(() => {
      screen.getByTestId('progress-pill-child-1');
      screen.getByText('6 sessions');
    });

    await act(async () => { cleanupScreen(qc1); cleanupScreen(qc2); });
  });

  it('ignores an unknown requested child profile when no child link is known', async () => {
    mockSearchParams = { profileId: 'foreign-child' };
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 2 }), subjects: [fullSubject] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => { screen.getByText('2 sessions completed'); });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('ignores an unknown requested child profile after child links load', async () => {
    mockSearchParams = { profileId: 'foreign-child' };
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 2 }), subjects: [fullSubject] });

    const { wrapper: Wrapper1, queryClient: qc1 } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    const view = render(<ProgressScreen />, { wrapper: Wrapper1 });

    await waitFor(() => { screen.getByText('2 sessions completed'); });

    // Simulate children loading — foreign-child is not in the list
    const { wrapper: Wrapper2, queryClient: qc2 } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    view.rerender(
      React.createElement(Wrapper2, null, React.createElement(ProgressScreen)),
    );

    await waitFor(() => {
      // foreign-child is not in linkedChildren, so own view is preserved
      screen.getByText('2 sessions completed');
    });

    await act(async () => { cleanupScreen(qc1); cleanupScreen(qc2); });
  });

  it('shows full view when totalSessions is 1 with subjects', async () => {
    setOwnerRoutes({ global: makeBaseGlobal({ totalSessions: 1 }), subjects: [fullSubject] });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
      screen.getByText('1 session completed');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('shows full view when totalSessions is exactly 4', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 4, topicsMastered: 1 }),
      subjects: [fullSubject],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('uses child register copy for child profiles', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    const child = createTestProfile({
      id: 'child-profile-id',
      displayName: 'Emma',
      isOwner: false,
      birthYear: 2015,
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: child,
      profiles: [ownerProfile, child],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByText('You learned 3 topics. Steady wins.');
      screen.getByText('What you learned');
      // Weekly/Monthly report card titles were removed in PR-6 (reports dedup).
      // Register-aware growth chart title still present.
      expect(screen.queryByText('Your growth')).toBeNull();
      expect(screen.queryByText('Weekly report')).toBeNull();
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('uses adult register copy for owner profiles', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByText('Your growth');
      // Weekly/Monthly report card titles were removed in PR-6 (reports dedup).
      expect(screen.queryByText('Your week')).toBeNull();
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('renders currently working on when inventory has current focus areas', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 1 }),
      subjects: [fullSubject],
      currentlyWorkingOn: ['Fractions', 'Decimals'],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-currently-working-on');
      screen.getByText('Currently working on');
      screen.getByText('Fractions');
      screen.getByText('Decimals');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('keeps currently working on hidden when inventory has no focus areas', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 1 }),
      subjects: [fullSubject],
      currentlyWorkingOn: [],
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => { screen.getByText('5 sessions completed'); });
    expect(screen.queryByTestId('progress-currently-working-on')).toBeNull();

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('does not gate when inventory is undefined (loading resolved with no data)', async () => {
    // Return 404 so inventory query resolves to error/undefined state
    mockFetch.setRoute(
      '/progress/inventory',
      new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 }),
    );
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    render(<ProgressScreen />, { wrapper });

    // Wait a tick for queries to settle — no teaser and no crash
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('renders subject breakdown for parent viewing child', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    setChildRoutes({
      childId: 'child-1',
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
      currentlyWorkingOn: [],
    });

    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-subject-breakdown');
      screen.getByTestId('progress-subject-card-s1');
      screen.getByText('Math');
      screen.getByText('5 sessions · 30 min');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('does not render report cards for parent viewing child', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    setChildRoutes({
      childId: 'child-1',
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
      currentlyWorkingOn: [],
    });

    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByTestId('progress-weekly-report-tracker')).toBeNull();
      expect(screen.queryByTestId('progress-monthly-report-tracker')).toBeNull();
      screen.getByTestId('progress-view-all-reports');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('renders progress summary freshness states for parent viewing child', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    setChildRoutes({
      childId: 'child-1',
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
      currentlyWorkingOn: [],
      summary: {
        summary: 'Emma explored fractions and mastered 3 new topics this week.',
        generatedAt: '2026-05-13T10:00:00Z',
        basedOnLastSessionAt: '2026-05-10T09:00:00Z',
        latestSessionId: 'session-1',
        activityState: 'no_recent_activity',
        nudgeRecommended: true,
      },
    });

    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-summary-header');
      screen.getByText(/Emma explored fractions/);
      screen.getByTestId('progress-summary-no-recent');
      screen.getByTestId('progress-nudge-cta');
    });

    await act(async () => { cleanupScreen(queryClient); });
  });

  it('renders deterministic fallback when no progress summary exists', async () => {
    setOwnerRoutes({
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
    });
    setChildRoutes({
      childId: 'child-1',
      global: makeBaseGlobal({ totalSessions: 5, topicsMastered: 3 }),
      subjects: [fullSubject],
      currentlyWorkingOn: [],
      summary: {
        summary: null,
        generatedAt: null,
        basedOnLastSessionAt: null,
        latestSessionId: null,
        activityState: 'no_recent_activity',
        nudgeRecommended: false,
      },
    });

    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    render(<ProgressScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-summary-fallback');
      expect(screen.queryByTestId('progress-summary-header')).toBeNull();
    });

    await act(async () => { cleanupScreen(queryClient); });
  });
});
