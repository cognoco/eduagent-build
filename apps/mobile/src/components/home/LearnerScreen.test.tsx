import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  extractJsonBody,
} from '../../test-utils/mock-api-routes';
import {
  LEARNER_HOME_HREF,
  LEARNER_HOME_RETURN_TO,
} from '../../lib/navigation';

const mockFetch = createRoutedMockFetch({
  '/coaching-card': { coldStart: false, card: null, fallback: null },
  '/quiz/missed-items/mark-surfaced': { markedCount: 1 },
  '/progress/resume-target': { target: null },
  '/progress/review-summary': {
    totalOverdue: 0,
    nextReviewTopic: null,
    nextUpcomingReviewAt: null,
  },
  '/progress/overview': {
    subjects: [],
    totalTopicsCompleted: 0,
    totalTopicsVerified: 0,
  },
  '/dashboard': {
    children: [],
    pendingNotices: [],
    demoMode: false,
  },
  '/subjects': { subjects: [] },
  '/usage': {
    usage: {
      monthlyLimit: 100,
      usedThisMonth: 16,
      remainingQuestions: 84,
      topUpCreditsRemaining: 0,
      warningLevel: 'none',
      cycleResetAt: '2026-06-01T00:00:00Z',
      dailyLimit: 10,
      usedToday: 3,
      dailyRemainingQuestions: 7,
    },
  },
});

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'test-profile-id',
      accountId: 'test-account-id',
      displayName: 'Test Learner',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    },
  }),
  ProfileContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

const mockPush = jest.fn();
const mockReadSessionRecoveryMarker = jest.fn();
const mockClearSessionRecoveryMarker = jest.fn();
const mockIsRecoveryMarkerFresh = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: mockPush, replace: jest.fn() },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../common', () => ({
  BookPageFlipAnimation: () => null,
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textTertiary: '#94a3b8',
    primary: '#00b4d8',
    primarySoft: 'rgba(0,180,216,0.16)',
    border: '#2a2a54',
    muted: '#94a3b8',
  }),
  useTheme: () => ({ colorScheme: 'dark' }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (_name: string) => ({
    title: 'Good morning!',
    subtitle: 'Fresh mind, fresh start',
  }),
}));

jest.mock('../../lib/session-recovery', () => ({
  readSessionRecoveryMarker: (...args: unknown[]) =>
    mockReadSessionRecoveryMarker(...args),
  clearSessionRecoveryMarker: (...args: unknown[]) =>
    mockClearSessionRecoveryMarker(...args),
  isRecoveryMarkerFresh: (...args: unknown[]) =>
    mockIsRecoveryMarkerFresh(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const { LearnerScreen } = require('./LearnerScreen');
const { fetchCallsMatching } = require('../../test-utils/mock-api-routes');

const HOME_RETURN_PARAMS = { returnTo: LEARNER_HOME_RETURN_TO };

const defaultProps = {
  profiles: [{ id: 'p1', displayName: 'Alex', isOwner: true }],
  activeProfile: { id: 'p1', displayName: 'Alex', isOwner: true },
};

const QUIZ_DISCOVERY_CARD = {
  id: 'quiz-card-1',
  type: 'quiz_discovery',
  title: 'Discover more',
  body: 'Try a capitals quiz',
  activityType: 'capitals',
  missedItemCount: 3,
};

describe('LearnerScreen', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute('/coaching-card', {
      coldStart: false,
      card: null,
      fallback: null,
    });
    mockFetch.setRoute('/quiz/missed-items/mark-surfaced', { markedCount: 1 });
    mockFetch.setRoute('/progress/resume-target', { target: null });
    mockFetch.setRoute('/progress/review-summary', {
      totalOverdue: 0,
      nextReviewTopic: null,
      nextUpcomingReviewAt: null,
    });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });
    mockFetch.setRoute('/dashboard', {
      children: [],
      pendingNotices: [],
      demoMode: false,
    });
    mockFetch.setRoute('/subjects', { subjects: [] });
    mockFetch.setRoute('/usage', {
      usage: {
        monthlyLimit: 100,
        usedThisMonth: 16,
        remainingQuestions: 84,
        topUpCreditsRemaining: 0,
        warningLevel: 'none',
        cycleResetAt: '2026-06-01T00:00:00Z',
        dailyLimit: 10,
        usedToday: 3,
        dailyRemainingQuestions: 7,
      },
    });
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
    mockClearSessionRecoveryMarker.mockResolvedValue(undefined);
    mockIsRecoveryMarkerFresh.mockReturnValue(true);
    Wrapper = createWrapper();
  });

  it('renders greeting with first name', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('Hey Alex!');
      screen.getByText('Fresh mind, fresh start');
    });
  });

  it('shows empty-subjects state, ask-anything, and actions when no subjects', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('What do you need right now?');
      screen.getByText('Help with an assignment');
      screen.getByText('Take a photo or type the problem');
      screen.getByText('Test yourself');
      screen.getByText('Review what is fading or quiz yourself');
      screen.getByText('Learn something new');
      screen.getByTestId('home-empty-subjects');
      screen.getByTestId('home-add-first-subject');
      screen.getByTestId('home-ask-anything');
      screen.getByTestId('home-action-study-new');
      screen.getByTestId('home-action-homework');
      screen.getByTestId('home-action-practice');
      screen.getByText('Your subjects will show up here');
      expect(screen.queryByTestId('home-subject-carousel')).toBeNull();
    });
  });

  it('shows the child quota line on Home', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText(/7 questions left today.*84 left this month/);
    });
  });

  it('shows child card and hides quota line for owner with linked children', async () => {
    mockFetch.setRoute('/dashboard', {
      children: [
        {
          profileId: 'child-id',
          displayName: 'Emma',
          consentStatus: null,
          respondedAt: null,
          summary: 'Emma: steady progress.',
          sessionsThisWeek: 2,
          sessionsLastWeek: 1,
          totalTimeThisWeek: 24,
          totalTimeLastWeek: 12,
          exchangesThisWeek: 8,
          exchangesLastWeek: 4,
          trend: 'up',
          subjects: [],
          guidedVsImmediateRatio: 0,
          retentionTrend: 'stable',
          totalSessions: 4,
          weeklyHeadline: {
            label: 'Words learned',
            value: 12,
            comparison: 'up from 5 last week',
          },
          currentlyWorkingOn: [],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        },
      ],
      pendingNotices: [],
      demoMode: false,
    });

    render(
      <LearnerScreen
        profiles={[
          { id: 'owner-id', displayName: 'Parent', isOwner: true },
          { id: 'child-id', displayName: 'Emma', isOwner: false },
        ]}
        activeProfile={{
          id: 'owner-id',
          displayName: 'Parent',
          isOwner: true,
        }}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      screen.getByTestId('home-child-card');
      screen.getByText('Emma');
      screen.getByText('12 words learned - up from 5 last week');
      expect(screen.queryByText(/questions left today/)).toBeNull();
    });
  });

  it('shows task-first intent choices when subjects exist', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('What do you need right now?');
      screen.getByTestId('home-subject-carousel');
      screen.getByTestId('home-ask-anything');
      screen.getByTestId('home-action-study-new');
      screen.getByTestId('home-action-homework');
      screen.getByTestId('home-action-practice');
      screen.getByTestId('home-add-subject-tile');
    });
  });

  it('renders subject cards in carousel', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [
        { id: 'sub-1', name: 'Math', status: 'active' },
        { id: 'sub-2', name: 'Physics', status: 'active' },
      ],
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-subject-card-sub-1');
      screen.getByTestId('home-subject-card-sub-2');
      screen.getByText('Math');
      screen.getByText('Physics');
    });
  });

  it('labels subjects as preparing while curriculum is not ready', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [
        {
          id: 'sub-preparing',
          name: 'Ancient History',
          status: 'active',
          curriculumStatus: 'preparing',
        },
      ],
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-subject-card-sub-preparing');
      screen.getByText('Ancient History');
      screen.getByText('Preparing...');
      expect(screen.queryByText('Open')).toBeNull();
    });
  });

  it('hides learner-only elements in parent proxy mode', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    render(
      <LearnerScreen
        {...defaultProps}
        profiles={[
          { id: 'owner-id', displayName: 'Parent', isOwner: true },
          { id: 'child-id', displayName: 'Alex', isOwner: false },
        ]}
        activeProfile={{
          id: 'child-id',
          displayName: 'Alex',
          isOwner: false,
        }}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      screen.getByTestId('home-subject-carousel');
      expect(screen.queryByTestId('home-coach-band')).toBeNull();
      expect(screen.queryByTestId('home-ask-anything')).toBeNull();
      expect(screen.queryByTestId('home-action-study-new')).toBeNull();
      expect(screen.queryByTestId('home-add-subject-tile')).toBeNull();
      screen.getByTestId('intent-proxy-placeholder');
      screen.getByText(/Sessions are private to Alex/);
    });
  });

  it('navigates to create-subject on Study new action', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-action-study-new'));
    fireEvent.press(screen.getByTestId('home-action-study-new'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('navigates to freeform session on Ask anything', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-ask-anything'));
    fireEvent.press(screen.getByTestId('home-ask-anything'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'freeform', ...HOME_RETURN_PARAMS },
    });
  });

  it('navigates to practice on Practice action', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-action-practice'));
    fireEvent.press(screen.getByTestId('home-action-practice'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/practice',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('navigates to homework camera on Homework action', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-action-homework'));
    fireEvent.press(screen.getByTestId('home-action-homework'));
    expect(mockPush).toHaveBeenNthCalledWith(1, LEARNER_HOME_HREF);
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/homework/camera',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('shows coach band from resume target', async () => {
    mockFetch.setRoute('/progress/resume-target', {
      target: {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        sessionId: 'session-1',
        resumeFromSessionId: null,
        resumeKind: 'active_session',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Resume Fractions',
      },
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      screen.getByText(/Pick up where you left off in Fractions/);
    });

    fireEvent.press(screen.getByTestId('home-coach-band-continue'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'session-1',
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicName: 'Fractions',
        mode: 'learning',
        ...HOME_RETURN_PARAMS,
      },
    });
  });

  it('shows coach band when overdue topics exist', async () => {
    mockFetch.setRoute('/progress/review-summary', {
      totalOverdue: 3,
      nextReviewTopic: {
        topicId: 't1',
        subjectId: 's1',
        subjectName: 'Math',
        topicTitle: 'Algebra',
      },
      nextUpcomingReviewAt: null,
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      screen.getByText(/Revisit Algebra/);
    });

    fireEvent.press(screen.getByTestId('home-coach-band-continue'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('shows recovery coach band and clears marker on Continue', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      subjectId: 's1',
      subjectName: 'Physics',
      topicId: 't1',
      topicName: 'Velocity',
      mode: 'learning',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      screen.getByText(/Pick up where you stopped in Velocity/);
    });

    fireEvent.press(screen.getByTestId('home-coach-band-continue'));
    expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'session-1',
        subjectId: 's1',
        subjectName: 'Physics',
        mode: 'learning',
        topicId: 't1',
        topicName: 'Velocity',
        ...HOME_RETURN_PARAMS,
      },
    });
  });

  it('silently clears stale markers without showing coach band', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
    });
    mockIsRecoveryMarkerFresh.mockReturnValue(false);

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    });

    expect(screen.queryByTestId('home-coach-band')).toBeNull();
  });

  it('renders fallback greeting when activeProfile is null', async () => {
    render(<LearnerScreen {...defaultProps} activeProfile={null} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      screen.getByText('Hey there!');
    });
  });

  it('reads recovery marker with undefined profileId when activeProfile is null', async () => {
    render(<LearnerScreen {...defaultProps} activeProfile={null} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalledWith(undefined);
    });
  });

  it('does not render a gateway back button', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-action-study-new'));
    expect(screen.queryByTestId('learner-back')).toBeNull();
  });

  it('shows quiz discovery in coach band and marks surfaced on Continue', async () => {
    mockFetch.setRoute('/coaching-card', {
      coldStart: false,
      card: QUIZ_DISCOVERY_CARD,
      fallback: null,
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      screen.getByText('Discover more');
    });

    fireEvent.press(screen.getByTestId('home-coach-band-continue'));

    await waitFor(() => {
      const surfacedCalls = fetchCallsMatching(
        mockFetch,
        '/quiz/missed-items/mark-surfaced',
      );
      expect(surfacedCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ activityType: string }>(
        surfacedCalls[0]?.init,
      );
      expect(body?.activityType).toBe('capitals');
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz',
      params: { activityType: 'capitals', ...HOME_RETURN_PARAMS },
    });
  });

  it('dismisses coach band on dismiss tap', async () => {
    mockFetch.setRoute('/progress/resume-target', {
      target: {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: null,
        resumeKind: 'next_topic',
        lastActivityAt: null,
        reason: 'Start Fractions',
      },
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
    });

    fireEvent.press(screen.getByTestId('home-coach-band-dismiss'));

    await waitFor(() => {
      expect(screen.queryByTestId('home-coach-band')).toBeNull();
    });
  });

  it('navigates to subject progress overview when subject card is tapped', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-subject-card-sub-1'));
    fireEvent.press(screen.getByTestId('home-subject-card-sub-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('navigates to subject progress overview when subject card is tapped in proxy mode', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    render(
      <LearnerScreen
        {...defaultProps}
        profiles={[
          { id: 'owner-id', displayName: 'Parent', isOwner: true },
          { id: 'child-id', displayName: 'Alex', isOwner: false },
        ]}
        activeProfile={{
          id: 'child-id',
          displayName: 'Alex',
          isOwner: false,
        }}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => screen.getByTestId('home-subject-card-sub-1'));
    fireEvent.press(screen.getByTestId('home-subject-card-sub-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('shows empty-state CTA when no subjects', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('home-empty-subjects');
      screen.getByTestId('home-add-first-subject');
      screen.getByText('Your subjects will show up here');
      screen.getByText('Add a subject');
    });
  });

  it('navigates to create-subject on empty-state Add a subject CTA', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-add-first-subject'));
    fireEvent.press(screen.getByTestId('home-add-first-subject'));
    expect(mockPush).toHaveBeenCalledWith('/create-subject');
  });

  it('navigates to create-subject on carousel New subject tile', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('home-add-subject-tile'));
    fireEvent.press(screen.getByTestId('home-add-subject-tile'));
    expect(mockPush).toHaveBeenCalledWith('/create-subject');
  });
});
