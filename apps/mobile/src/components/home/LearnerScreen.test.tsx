import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch, extractJsonBody } from '../../test-utils/mock-api-routes';

// Routes most-specific first: coaching-card, quiz/missed-items, progress/resume-target,
// progress/review-summary, subjects.
const mockFetch = createRoutedMockFetch({
  '/coaching-card': { coldStart: false, card: null, fallback: null },
  '/quiz/missed-items/mark-surfaced': { markedCount: 1 },
  '/progress/resume-target': { target: null },
  '/progress/review-summary': { totalOverdue: 0, nextReviewTopic: null, nextUpcomingReviewAt: null },
  '/subjects': { subjects: [] },
});

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch)
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
// [CR-757] LearnerScreen uses the direct `router` singleton from expo-router
// instead of useRouter(). Mock the singleton + the hook so any indirect
// callers in the screen still get the same mockPush. (Hook is unused after
// CR-757 but kept for backward compat with sibling components.)
jest.mock('expo-router', () => ({
  router: { push: mockPush, replace: jest.fn() },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../common', () => ({
  BookPageFlipAnimation: () => null,
  ProfileSwitcher: () => null,
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#ffffff', primary: '#00b4d8' }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

jest.mock('./EarlyAdopterCard', () => ({
  EarlyAdopterCard: () => null,
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

const HOME_RETURN_PARAMS = { returnTo: 'learner-home' };

const defaultProps = {
  profiles: [{ id: 'p1', displayName: 'Alex', isOwner: true }],
  activeProfile: { id: 'p1', displayName: 'Alex', isOwner: true },
  switchProfile: jest.fn(),
};

const QUIZ_DISCOVERY_CARD = {
  id: 'quiz-card-1',
  type: 'quiz_discovery',
  title: 'Discover more',
  body: 'Try a capitals quiz',
  activityType: 'capitals',
};

describe('LearnerScreen', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all routes to "no data" defaults.
    mockFetch.setRoute('/coaching-card', { coldStart: false, card: null, fallback: null });
    mockFetch.setRoute('/quiz/missed-items/mark-surfaced', { markedCount: 1 });
    mockFetch.setRoute('/progress/resume-target', { target: null });
    mockFetch.setRoute('/progress/review-summary', { totalOverdue: 0, nextReviewTopic: null, nextUpcomingReviewAt: null });
    mockFetch.setRoute('/subjects', { subjects: [] });
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
    mockClearSessionRecoveryMarker.mockResolvedValue(undefined);
    mockIsRecoveryMarkerFresh.mockReturnValue(true);
    Wrapper = createWrapper();
  });

  it('renders greeting with profile name', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('Good morning, Alex!');
      screen.getByText('Fresh mind, fresh start');
    });
  });

  it('shows the four always-visible intent cards in order when continue is hidden', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      const cardIds = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cardIds).toEqual([
        'intent-learn',
        'intent-ask',
        'intent-practice',
        'intent-homework',
      ]);
    });
  });

  it('filters session-starting intent cards in parent proxy mode', async () => {
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
    mockFetch.setRoute('/coaching-card', {
      coldStart: false,
      card: QUIZ_DISCOVERY_CARD,
      fallback: null,
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
      { wrapper: Wrapper }
    );

    // Wait for queries to settle, then verify proxy restrictions.
    await waitFor(() => {
      const cardIds = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cardIds).toEqual(['intent-learn']);
      expect(screen.queryByTestId('intent-continue')).toBeNull();
      expect(screen.queryByTestId('intent-quiz-discovery')).toBeNull();
      expect(screen.queryByTestId('intent-ask')).toBeNull();
      screen.getByTestId('intent-proxy-placeholder');
      screen.getByText('Sessions are private to Alex');
    });
  });

  it('navigates to create-subject on the Learn card', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('intent-learn'));
    fireEvent.press(screen.getByTestId('intent-learn'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('navigates to freeform session on the Ask card', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('intent-ask'));
    fireEvent.press(screen.getByTestId('intent-ask'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'freeform', ...HOME_RETURN_PARAMS },
    });
  });

  it('navigates to practice on the Practice card', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('intent-practice'));
    fireEvent.press(screen.getByTestId('intent-practice'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/practice',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('navigates to homework camera on the Homework card', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('intent-homework'));
    fireEvent.press(screen.getByTestId('intent-homework'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/homework/camera',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('shows continue card from continue suggestion when available', async () => {
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
      screen.getByTestId('intent-continue');
      screen.getByText('Continue');
      // U1 copy sweep 2026-04-19: subtitle leads with topic, drops subject label
      screen.getByText('Pick up Fractions');
      expect(screen.queryByText('Math · Fractions')).toBeNull();
    });

    fireEvent.press(screen.getByTestId('intent-continue'));
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

  it('shows continue card when overdue topics exist', async () => {
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
      screen.getByTestId('intent-continue');
      screen.getByText('Math · 3 topics to review');
    });

    fireEvent.press(screen.getByTestId('intent-continue'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: 't1',
        subjectId: 's1',
        topicName: 'Algebra',
        ...HOME_RETURN_PARAMS,
      },
    });
  });

  it('shows recovery continue card first and clears the marker before resuming', async () => {
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
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      subjectId: 's1',
      subjectName: 'Physics',
      topicId: 't1',
      mode: 'learning',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('Physics · resume');
    });

    const cardIds = within(screen.getByTestId('learner-intent-stack'))
      .getAllByRole('button')
      .map((card) => card.props.testID);

    expect(cardIds).toEqual([
      'intent-continue',
      'intent-learn',
      'intent-ask',
      'intent-practice',
      'intent-homework',
    ]);

    fireEvent.press(screen.getByTestId('intent-continue'));
    expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'session-1',
        subjectId: 's1',
        subjectName: 'Physics',
        mode: 'learning',
        topicId: 't1',
        ...HOME_RETURN_PARAMS,
      },
    });
  });

  it('silently clears stale markers without showing the continue card', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
    });
    mockIsRecoveryMarkerFresh.mockReturnValue(false);

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    });

    expect(screen.queryByTestId('intent-continue')).toBeNull();
  });

  it('renders fallback greeting when activeProfile is null', async () => {
    render(<LearnerScreen {...defaultProps} activeProfile={null} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('Good morning, !');
    });
  });

  it('reads recovery marker with undefined profileId when activeProfile is null', async () => {
    render(<LearnerScreen {...defaultProps} activeProfile={null} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalledWith(undefined);
    });
  });

  it('shows back button when onBack is provided', async () => {
    const onBack = jest.fn();

    render(<LearnerScreen {...defaultProps} onBack={onBack} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('learner-back'));
    fireEvent.press(screen.getByTestId('learner-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides back button when onBack is not provided', async () => {
    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('intent-learn'));
    expect(screen.queryByTestId('learner-back')).toBeNull();
  });

  it('marks quiz discovery surfaced when the card is tapped', async () => {
    mockFetch.setRoute('/coaching-card', {
      coldStart: false,
      card: QUIZ_DISCOVERY_CARD,
      fallback: null,
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('intent-quiz-discovery');
    });

    fireEvent.press(screen.getByTestId('intent-quiz-discovery'));

    await waitFor(() => {
      const surfacedCalls = fetchCallsMatching(mockFetch, '/quiz/missed-items/mark-surfaced');
      expect(surfacedCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ activityType: string }>(surfacedCalls[0]?.init);
      expect(body?.activityType).toBe('capitals');
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz',
      params: { activityType: 'capitals', ...HOME_RETURN_PARAMS },
    });
  });

  it('marks quiz discovery surfaced and hides the card when dismissed', async () => {
    mockFetch.setRoute('/coaching-card', {
      coldStart: false,
      card: QUIZ_DISCOVERY_CARD,
      fallback: null,
    });

    render(<LearnerScreen {...defaultProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('intent-quiz-discovery-dismiss');
    });

    fireEvent.press(screen.getByTestId('intent-quiz-discovery-dismiss'));

    await waitFor(() => {
      const surfacedCalls = fetchCallsMatching(mockFetch, '/quiz/missed-items/mark-surfaced');
      expect(surfacedCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ activityType: string }>(surfacedCalls[0]?.init);
      expect(body?.activityType).toBe('capitals');
    });
    expect(mockPush).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByTestId('intent-quiz-discovery')).toBeNull();
    });
  });
});
