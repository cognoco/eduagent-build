import {
  act,
  cleanup,
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
import { ProfileContext, type ProfileContextValue } from '../../lib/profile';
import type { Profile } from '@eduagent/schemas';

let mockLinkedChildren: Array<{
  id: string;
  displayName: string;
  isOwner: boolean;
}> = [];
type TestProfile = {
  id: string;
  displayName: string;
  isOwner: boolean;
  birthYear?: number | null;
};
let mockSubscriptionTier = 'plus';
const mockSwitchProfile = jest.fn(async () => ({ success: true }));
// [ACCOUNT-04] Explicit proxy flag — controls isExplicitProxyMode in the mock
// profile context. Must be set to true only for proxy-mode test cases.
let mockIsExplicitProxyMode = false;
let mockContractHomeScreen: 'LearnerHome' | 'FamilyHome' = 'LearnerHome';
// [HOME-07] Surface a Family setup CTA on the learner home for adult owners
// who can add a child but have not linked one yet. Tests opt in via this flag.
let mockShowAddChild = false;

const mockNavContract = () => ({
  home: {
    screen: mockContractHomeScreen,
    titleKey: 'tabs.myLearning',
    iconName: 'School',
  },
  chrome: { modeSwitcher: 'hidden', proxyBanner: 'hidden' },
  gates: {
    sessionIsOwner: true,
    showFamilyChildActivity: false,
    showFamilyHome: mockContractHomeScreen === 'FamilyHome',
    showLearningActions: !mockIsExplicitProxyMode,
    showAddChild: mockShowAddChild,
  },
  canEnter: () => true,
  isSurfaced: () => true,
  queryScope: { appContext: 'study' as const, profileId: 'test-profile-id' },
  effectiveAppContext: 'study' as const,
  isParentProxy: false,
});

jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: hook wraps profile context, subscription query, and feature flags; not exercisable in isolation */,
  () => ({
    useNavigationContract: () => mockNavContract(),
    useNavigationHomeContract: () => ({
      contract: mockNavContract(),
      proxy: {
        active: mockIsExplicitProxyMode,
        childName: mockIsExplicitProxyMode ? 'Alex' : '',
        childProfileId: mockIsExplicitProxyMode ? 'child-id' : null,
        parentProfileId: mockIsExplicitProxyMode ? 'owner-id' : null,
      },
    }),
    useNavigationDataScopeContract: () => mockNavContract(),
  }),
);

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
  '/progress/inventory': {
    global: { totalSessions: 2 },
    subjects: [],
  },
  '/dashboard': {
    children: [],
    pendingNotices: [],
    demoMode: false,
  },
  '/learner-profile': {
    profile: { accommodationMode: 'none' },
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

jest.mock(
  '../../lib/api-client' /* gc1-allow: API client hook wraps auth/network boundary; test drives screen fetch states */,
  () =>
    require('../../test-utils/mock-api-routes').mockApiClientFactory(((
      ...args: Parameters<typeof fetch>
    ) => mockFetch(...args)) as jest.Mock),
);

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

// [GC6] lib/profile mock removed — test now provides a real ProfileContext.Provider
// via `createWrapper`. `useProfile`, `useLinkedChildren`, `useHasLinkedChildren`,
// and `useParentProxy` (and therefore `useActiveProfileRole`) all read from this
// real context, so each test can vary the active profile, proxy flag, and
// linked-children list through `profiles` / `activeProfile` / `mockIsExplicitProxyMode`.

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockReadSessionRecoveryMarker = jest.fn();
const mockClearSessionRecoveryMarker = jest.fn();
const mockIsRecoveryMarkerFresh = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: mockPush, replace: mockReplace },
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// [GC6] `../common` and `../feedback/FeedbackProvider` mocks removed —
// the real `BookPageFlipAnimation` renders harmlessly under react-native-svg,
// and `useFeedbackContext` falls back to a no-op `openFeedback` when no
// FeedbackProvider is mounted, which is exactly what these tests need.

jest.mock(
  '../../lib/greeting' /* gc1-allow: deterministic greeting avoids clock-dependent assertions */,
  () => ({
    getGreeting: (_name: string) => ({
      title: 'Good morning!',
      subtitle: 'Fresh mind, fresh start',
    }),
    getTimeOfDay: () => 'evening',
  }),
);

// [GC6] use-active-profile-role mock removed — the real hook composes
// `useProfile()` + `useParentProxy()`, both of which read from the real
// ProfileContext.Provider set up in `createWrapper`. Tests no longer need
// to stub the role; it is derived from the active profile's `isOwner` flag
// and the `mockIsExplicitProxyMode` switch.

jest.mock(
  '../../hooks/use-subscription' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useSubscriptionStatus: () => ({
      data: { tier: mockSubscriptionTier },
    }),
    useSubscription: () => ({ data: { tier: mockSubscriptionTier } }),
    useFamilySubscription: () => ({
      data: { profileCount: 2, maxProfiles: 5 },
    }),
    useUsage: () => ({
      data: {
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
    }),
  }),
);

jest.mock(
  '../../lib/session-recovery' /* gc1-allow: session recovery wrapper uses persistent storage side effects */,
  () => ({
    readSessionRecoveryMarker: (...args: unknown[]) =>
      mockReadSessionRecoveryMarker(...args),
    clearSessionRecoveryMarker: (...args: unknown[]) =>
      mockClearSessionRecoveryMarker(...args),
    isRecoveryMarkerFresh: (...args: unknown[]) =>
      mockIsRecoveryMarkerFresh(...args),
  }),
);

// Holds the ProfileContext value for the current render. Tests render with the
// repo-standard `render(..., { wrapper: Wrapper })` shape, but the wrapper
// needs to react to per-test overrides (active profile, linked children,
// explicit proxy flag). The wrapper reads from this ref so updates between
// renders take effect without rebuilding the wrapper.
let activeProfilesForRender: Profile[] = [];
let activeProfileForRender: Profile | null = null;

function buildProfileContextValue(): ProfileContextValue {
  return {
    profiles: activeProfilesForRender,
    activeProfile: activeProfileForRender,
    isExplicitProxyMode: mockIsExplicitProxyMode,
    switchProfile: mockSwitchProfile,
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={buildProfileContextValue()}>
          {children}
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

const { LearnerScreen } = require('./LearnerScreen');
const { fetchCallsMatching } = require('../../test-utils/mock-api-routes');

const HOME_RETURN_PARAMS = { returnTo: LEARNER_HOME_RETURN_TO };

const defaultProps = {
  profiles: [{ id: 'p1', displayName: 'Alex', isOwner: true, birthYear: 1990 }],
  activeProfile: {
    id: 'p1',
    displayName: 'Alex',
    isOwner: true,
    birthYear: 1990,
  },
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
  let queryClient: QueryClient | null = null;

  // `renderLearner` mirrors the LearnerScreen props into module-level refs the
  // wrapper reads from before rendering. This keeps the screen's `profiles` /
  // `activeProfile` props in sync with what `useProfile()` / `useLinkedChildren()`
  // / `useParentProxy()` see — without ever mocking the real profile module.
  function renderLearner(
    props: Partial<{
      profiles: TestProfile[];
      activeProfile: TestProfile | null;
    }> = {},
  ): ReturnType<typeof render> {
    const merged = { ...defaultProps, ...props };
    // When the test explicitly sets `mockLinkedChildren`, merge them in too so
    // useLinkedChildren returns the same set the legacy mock did.
    const childrenAlreadyInProfiles = new Set(
      (merged.profiles ?? []).map((p) => p.id),
    );
    const extraChildren = mockLinkedChildren.filter(
      (c) => !childrenAlreadyInProfiles.has(c.id),
    );
    activeProfilesForRender = [
      ...(merged.profiles ?? []),
      ...extraChildren,
    ] as Profile[];
    activeProfileForRender = (merged.activeProfile ?? null) as Profile | null;
    return render(<LearnerScreen {...merged} />, { wrapper: Wrapper });
  }

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
    mockFetch.setRoute('/progress/inventory', {
      global: { totalSessions: 2 },
      subjects: [],
    });
    mockFetch.setRoute('/dashboard', {
      children: [],
      pendingNotices: [],
      demoMode: false,
    });
    mockFetch.setRoute('/learner-profile', {
      profile: { accommodationMode: 'none' },
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
    mockLinkedChildren = [];
    mockSubscriptionTier = 'plus';
    mockSwitchProfile.mockResolvedValue({ success: true });
    mockIsExplicitProxyMode = false;
    mockContractHomeScreen = 'LearnerHome';
    mockShowAddChild = false;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    Wrapper = createWrapper(queryClient);
  });

  afterEach(async () => {
    await act(async () => {
      cleanup();
      await Promise.resolve();
    });
    if (queryClient) {
      await queryClient.cancelQueries();
      queryClient.getMutationCache().clear();
      queryClient.clear();
      queryClient = null;
    }
  });

  it('renders greeting with first name', async () => {
    renderLearner();

    await waitFor(() => {
      screen.getByText('Hey Alex!');
      screen.getByText('Fresh mind, fresh start');
    });
  });

  it('shows empty-subjects state, ask-anything, and actions when no subjects', async () => {
    renderLearner();

    await waitFor(() => {
      screen.getByText('What do you need right now?');
      screen.getByTestId('home-my-notes');
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

  it('opens My Notes from learner Home', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-my-notes'));
    fireEvent.press(screen.getByTestId('home-my-notes'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes',
      params: { returnTo: 'learner-home' },
    });
  });

  // [HOME-07] Adult owner without linked children must see a Family setup
  // entry on the learner home. Routes to More so the existing handleAddChild
  // flow owns subscription/quota gating.
  it('shows Family setup CTA when adult owner can add child and has no children', async () => {
    mockShowAddChild = true;
    mockLinkedChildren = [];
    renderLearner();

    await waitFor(() => screen.getByTestId('home-family-setup-cta-button'));
    fireEvent.press(screen.getByTestId('home-family-setup-cta-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more');
  });

  it('hides Family setup CTA when owner already has linked children', async () => {
    mockShowAddChild = true;
    mockLinkedChildren = [
      { id: 'child-id', displayName: 'Emma', isOwner: false },
    ];
    renderLearner();

    await waitFor(() => screen.getByTestId('learner-screen'));
    expect(screen.queryByTestId('home-family-setup-cta-button')).toBeNull();
  });

  it('hides Family setup CTA when gates.showAddChild is false', async () => {
    mockShowAddChild = false;
    mockSubscriptionTier = 'plus';
    mockLinkedChildren = [];
    renderLearner();

    await waitFor(() => screen.getByTestId('learner-screen'));
    expect(screen.queryByTestId('home-family-setup-cta-button')).toBeNull();
  });

  it('keeps Family setup CTA for a family-plan owner while the navigation gate catches up', async () => {
    mockShowAddChild = false;
    mockSubscriptionTier = 'family';
    mockLinkedChildren = [];
    renderLearner();

    await waitFor(() => screen.getByTestId('home-family-setup-cta-button'));
  });

  it('keeps home actions available when the subject list fails to load', async () => {
    mockFetch.setRoute(
      '/subjects',
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'timeout exceeded when trying to connect',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('learner-screen');
      screen.getByText('What do you need right now?');
      screen.getByTestId('home-ask-anything');
      screen.getByTestId('home-subjects-load-error');
      expect(screen.queryByTestId('learner-error-state')).toBeNull();
      expect(screen.queryByTestId('home-empty-subjects')).toBeNull();
    });
  });

  it('shows the topics-learned momentum line on Home', async () => {
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
      totalTopicsCompleted: 5,
      totalTopicsVerified: 5,
    });

    renderLearner();

    await waitFor(() => {
      screen.getByText(/5 topics learned/);
    });
  });

  it('shows task-first intent choices when subjects exist', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner();

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

    renderLearner();

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

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('home-subject-card-sub-preparing');
      screen.getByText('Ancient History');
      screen.getByText('Setting up Ancient History...');
      expect(screen.queryByText('Open')).toBeNull();
    });
  });

  it('hides learner-only elements in parent proxy mode', async () => {
    // [ACCOUNT-04] Proxy mode must be explicitly set — plain profile switches
    // to a non-owner profile do NOT trigger proxy chrome.
    mockIsExplicitProxyMode = true;
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner({
      profiles: [
        { id: 'owner-id', displayName: 'Parent', isOwner: true },
        { id: 'child-id', displayName: 'Alex', isOwner: false },
      ],
      activeProfile: {
        id: 'child-id',
        displayName: 'Alex',
        isOwner: false,
      },
    });

    await waitFor(() => {
      screen.getByTestId('home-subject-carousel');
      expect(screen.queryByTestId('home-coach-band')).toBeNull();
      expect(screen.queryByTestId('home-ask-anything')).toBeNull();
      expect(screen.queryByTestId('home-action-study-new')).toBeNull();
      expect(screen.queryByTestId('home-add-subject-tile')).toBeNull();
      expect(screen.queryByTestId('home-my-notes')).toBeNull();
      screen.getByTestId('intent-proxy-placeholder');
      screen.getByText('Session recaps are in your parent view');
      screen.getByTestId('proxy-view-session-summaries');
    });
  });

  it('[ACCOUNT-04] shows learner UI (not proxy chrome) when non-owner profile switches via plain switchProfile', async () => {
    // Plain profile switch: isExplicitProxyMode stays false (the default).
    // The child IS the user — must see normal learner surfaces.
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner({
      profiles: [
        { id: 'owner-id', displayName: 'Parent', isOwner: true },
        { id: 'child-id', displayName: 'Alex', isOwner: false },
      ],
      activeProfile: {
        id: 'child-id',
        displayName: 'Alex',
        isOwner: false,
      },
    });

    await waitFor(() => {
      screen.getByTestId('home-subject-carousel');
      // Learner affordances must be visible — NOT hidden behind proxy chrome.
      screen.getByTestId('home-ask-anything');
      screen.getByTestId('home-action-study-new');
      screen.getByTestId('home-add-subject-tile');
      screen.getByTestId('home-my-notes');
      // Proxy-specific elements must be absent.
      expect(screen.queryByTestId('intent-proxy-placeholder')).toBeNull();
    });
  });

  it('switches back to parent view before opening child session summaries', async () => {
    // [ACCOUNT-04] This is the legitimate proxy path — explicit proxy mode set.
    mockIsExplicitProxyMode = true;
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner({
      profiles: [
        { id: 'owner-id', displayName: 'Parent', isOwner: true },
        { id: 'child-id', displayName: 'Alex', isOwner: false },
      ],
      activeProfile: {
        id: 'child-id',
        displayName: 'Alex',
        isOwner: false,
      },
    });

    await waitFor(() => screen.getByTestId('proxy-view-session-summaries'));
    fireEvent.press(screen.getByTestId('proxy-view-session-summaries'));

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('owner-id');
      expect(mockPush).toHaveBeenCalledWith('/(app)/child/child-id');
    });
  });

  it('navigates to create-subject on Study new action', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-action-study-new'));
    fireEvent.press(screen.getByTestId('home-action-study-new'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: HOME_RETURN_PARAMS,
    });
  });

  it('navigates to freeform session on Ask anything', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-ask-anything'));
    fireEvent.press(screen.getByTestId('home-ask-anything'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'freeform', ...HOME_RETURN_PARAMS },
    });
  });

  it('navigates to practice on Practice action', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-action-practice'));
    fireEvent.press(screen.getByTestId('home-action-practice'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/practice',
      params: HOME_RETURN_PARAMS,
    });
  });

  // [CR-2026-05-19-H29] Break test: the Homework action must push the camera
  // route exactly once. Prior implementation pushed `homeHref` then `camera`,
  // duplicating the Home stack entry (back from camera → home → home again)
  // because LearnerScreen IS the Home tab — there's no need to seed it.
  it('navigates to homework camera on Homework action (single push, no home pre-seed)', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-action-homework'));
    fireEvent.press(screen.getByTestId('home-action-homework'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/homework/camera',
      params: HOME_RETURN_PARAMS,
    });
    // Guard against regression: home href must NOT be pushed before camera.
    expect(mockPush).not.toHaveBeenCalledWith(LEARNER_HOME_HREF);
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

    renderLearner();

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

    renderLearner();

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

    renderLearner();

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

  // [CC-05 / WI-865] Priority-collision proof. The coach-band priority chain in
  // LearnerScreen's `coachBand` useMemo is: fresh recovery marker > server resume
  // target > overdue review > quiz discovery. The single-arm tests above each
  // assert one arm in isolation; this test is the deterministic proof that a
  // FRESH recovery marker wins when a server resume target AND overdue review
  // topics are ALSO present at the same time — the exact collision a continuation
  // regression would silently break. It is the unit-side proof for the parked
  // native cold-start E2E (apps/mobile/e2e/flows/learning/resume-crash-recovery.yaml).
  it('[CC-05] fresh recovery marker wins over resume target AND overdue review collision', async () => {
    // Fresh recovery marker (recovery arm — priority 1).
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'recovery-session',
      subjectId: 'recovery-subject',
      subjectName: 'Physics',
      topicId: 'recovery-topic',
      topicName: 'Velocity',
      mode: 'learning',
      updatedAt: new Date().toISOString(),
    });

    // Server resume target ALSO present (resume arm — priority 2). Distinct
    // sessionId so we can prove the recovery sessionId — not this one — is used.
    mockFetch.setRoute('/progress/resume-target', {
      target: {
        subjectId: 'resume-subject',
        subjectName: 'Math',
        topicId: 'resume-topic',
        topicTitle: 'Fractions',
        sessionId: 'resume-session',
        resumeFromSessionId: null,
        resumeKind: 'active_session',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Resume Fractions',
      },
    });

    // Overdue review ALSO present (overdue arm — priority 3).
    mockFetch.setRoute('/progress/review-summary', {
      totalOverdue: 3,
      nextReviewTopic: {
        topicId: 'overdue-topic',
        subjectId: 'overdue-subject',
        subjectName: 'History',
        topicTitle: 'Algebra',
      },
      nextUpcomingReviewAt: null,
    });

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      // Recovery headline shown; resume + overdue headlines suppressed.
      screen.getByText(/Pick up where you stopped in Velocity/);
    });
    expect(
      screen.queryByText(/Pick up where you left off in Fractions/),
    ).toBeNull();
    expect(screen.queryByText(/Revisit Algebra/)).toBeNull();

    fireEvent.press(screen.getByTestId('home-coach-band-continue'));

    // Recovery Continue: profile-scoped marker cleared, pushes the SESSION route
    // with the recovery sessionId/params.
    expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'recovery-session',
        subjectId: 'recovery-subject',
        subjectName: 'Physics',
        mode: 'learning',
        topicId: 'recovery-topic',
        topicName: 'Velocity',
        ...HOME_RETURN_PARAMS,
      },
    });

    // The resume arm (pushLearningResumeTarget) seeds /(app)/home before the
    // session push — it must NOT have run. The overdue arm pushes
    // /(app)/topic/relearn — it must NOT have run either.
    expect(mockPush).not.toHaveBeenCalledWith('/(app)/home');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/topic/relearn' }),
    );
    // And the resume sessionId must never reach a session push.
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ sessionId: 'resume-session' }),
      }),
    );
  });

  // [CC-05 / WI-865] Sibling priority proof: with NO recovery marker, a server
  // resume target beats overdue review (priority 2 > priority 3). Proves the
  // ordering below the recovery arm, completing the collision matrix.
  it('[CC-05] resume target wins over overdue review when no recovery marker', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue(null);

    mockFetch.setRoute('/progress/resume-target', {
      target: {
        subjectId: 'resume-subject',
        subjectName: 'Math',
        topicId: 'resume-topic',
        topicTitle: 'Fractions',
        sessionId: 'resume-session',
        resumeFromSessionId: null,
        resumeKind: 'active_session',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Resume Fractions',
      },
    });
    mockFetch.setRoute('/progress/review-summary', {
      totalOverdue: 3,
      nextReviewTopic: {
        topicId: 'overdue-topic',
        subjectId: 'overdue-subject',
        subjectName: 'History',
        topicTitle: 'Algebra',
      },
      nextUpcomingReviewAt: null,
    });

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      screen.getByText(/Pick up where you left off in Fractions/);
    });
    expect(screen.queryByText(/Revisit Algebra/)).toBeNull();

    fireEvent.press(screen.getByTestId('home-coach-band-continue'));

    // Resume arm ran (pushLearningResumeTarget seeds /(app)/home, then session).
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'resume-subject',
        subjectName: 'Math',
        topicId: 'resume-topic',
        topicName: 'Fractions',
        sessionId: 'resume-session',
        ...HOME_RETURN_PARAMS,
      },
    });
    // Overdue arm did NOT run.
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/topic/relearn' }),
    );
  });

  it('silently clears stale markers without showing coach band', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
    });
    mockIsRecoveryMarkerFresh.mockReturnValue(false);

    renderLearner();

    await waitFor(() => {
      expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    });

    expect(screen.queryByTestId('home-coach-band')).toBeNull();
  });

  it('renders fallback greeting when activeProfile is null', async () => {
    renderLearner({ activeProfile: null });

    await waitFor(() => {
      screen.getByText('Hey there!');
    });
  });

  it('reads recovery marker with undefined profileId when activeProfile is null', async () => {
    renderLearner({ activeProfile: null });

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalledWith(undefined);
    });
  });

  it('does not render a gateway back button', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-action-study-new'));
    expect(screen.queryByTestId('learner-back')).toBeNull();
  });

  it('shows quiz discovery in coach band and marks surfaced on Continue', async () => {
    mockFetch.setRoute('/coaching-card', {
      coldStart: false,
      card: QUIZ_DISCOVERY_CARD,
      fallback: null,
    });

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
      screen.getByText('Discover more');
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('home-coach-band-continue'));
      await Promise.resolve();
    });

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
      pathname: '/(app)/quiz/launch',
      params: { activityType: 'capitals', ...HOME_RETURN_PARAMS },
    });
    await waitFor(() => {
      expect(queryClient?.isMutating()).toBe(0);
      expect(queryClient?.isFetching()).toBe(0);
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

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('home-coach-band');
    });

    fireEvent.press(screen.getByTestId('home-coach-band-dismiss'));

    await waitFor(() => {
      expect(screen.queryByTestId('home-coach-band')).toBeNull();
    });
  });

  it('navigates to the subject shelf when subject card is tapped', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner();

    await waitFor(() => screen.getByTestId('home-subject-card-sub-1'));
    fireEvent.press(screen.getByTestId('home-subject-card-sub-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1', returnTo: 'learner-home' },
    });
  });

  it('navigates to the subject shelf when subject card is tapped after a plain child switch', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner({
      profiles: [
        { id: 'owner-id', displayName: 'Parent', isOwner: true },
        { id: 'child-id', displayName: 'Alex', isOwner: false },
      ],
      activeProfile: {
        id: 'child-id',
        displayName: 'Alex',
        isOwner: false,
      },
    });

    await waitFor(() => screen.getByTestId('home-subject-card-sub-1'));
    fireEvent.press(screen.getByTestId('home-subject-card-sub-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1', returnTo: 'learner-home' },
    });
  });

  it('shows empty-state CTA when no subjects', async () => {
    renderLearner();

    await waitFor(() => {
      screen.getByTestId('home-empty-subjects');
      screen.getByTestId('home-add-first-subject');
      screen.getByText('Your subjects will show up here');
      screen.getByText('Add a subject');
    });
  });

  it('navigates to create-subject on empty-state Add a subject CTA', async () => {
    renderLearner();

    await waitFor(() => screen.getByTestId('home-add-first-subject'));
    fireEvent.press(screen.getByTestId('home-add-first-subject'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: { returnTo: 'learner-home' },
    });
  });

  it('shows withdrawal-countdown-banner when a child has withdrawn consent within the grace period', async () => {
    const respondedAt = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockFetch.setRoute('/dashboard', {
      children: [
        {
          profileId: 'child-id',
          displayName: 'Emma',
          consentStatus: 'WITHDRAWN',
          respondedAt,
          summary: '',
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalTimeThisWeek: 0,
          totalTimeLastWeek: 0,
          exchangesThisWeek: 0,
          exchangesLastWeek: 0,
          trend: 'stable',
          subjects: [],
          guidedVsImmediateRatio: 0,
          retentionTrend: 'stable',
          totalSessions: 0,
          weeklyHeadline: null,
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

    renderLearner();

    await waitFor(() => {
      screen.getByTestId('withdrawal-countdown-banner');
    });
  });

  it('navigates to create-subject on carousel New subject tile', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    renderLearner();

    await waitFor(() => screen.getByTestId('home-add-subject-tile'));
    fireEvent.press(screen.getByTestId('home-add-subject-tile'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: { returnTo: 'learner-home' },
    });
  });

  // [HOME-08] Subject-loading timeout escape actions.
  //
  // When the /subjects query is still loading after 15 seconds, the loading
  // screen must surface two escape routes (Retry and Go to Library) so the
  // learner is never stuck with a spinner and no way out.
  //
  // Strategy: set /subjects to hang (never resolve), use fake timers to advance
  // past the 15-second threshold, then assert the timeout container and both
  // CTAs appear. The react-query retry budget is set to 0 in createWrapper()
  // so the query stays in isLoading without firing real retries.
  describe('[HOME-08] loading timeout escape actions', () => {
    let hangingFetchResolve: (() => void) | null = null;

    beforeEach(() => {
      // Hang the subjects fetch so isLoading stays true.
      // The outer beforeEach runs first and sets /subjects to {subjects:[]};
      // this inner beforeEach overrides it to a handler FUNCTION that returns a
      // never-resolving Promise, keeping the component in isLoading state.
      //
      // IMPORTANT: setRoute must receive a function, not a Promise value.
      // createRoutedMockFetch checks `typeof handler === 'function'` — if the
      // handler is a Promise object (not a function), it JSON.stringify-es the
      // Promise to '{}' and returns an immediate 200 response, which resolves
      // isLoading immediately. Wrapping in an arrow function prevents that.
      mockFetch.setRoute('/subjects', () => {
        return new Promise<Response>((resolve) => {
          hangingFetchResolve = () =>
            resolve(
              new Response(JSON.stringify({ subjects: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
        });
      });

      jest.useFakeTimers();
    });

    afterEach(async () => {
      // Resolve the hanging promise to prevent open-handle warnings.
      await act(async () => {
        hangingFetchResolve?.();
        await Promise.resolve();
      });
      hangingFetchResolve = null;
      jest.useRealTimers();
    });

    it('shows the timeout container with loading message after 15 s', async () => {
      renderLearner();

      // Loading state appears immediately — no timeout text yet.
      screen.getByTestId('learner-loading-state');
      expect(screen.queryByTestId('learner-loading-timeout')).toBeNull();

      // Advance past the 15-second threshold and flush React state updates.
      act(() => {
        jest.advanceTimersByTime(16_000);
      });

      await waitFor(() => {
        screen.getByTestId('learner-loading-timeout');
        screen.getByText('Almost there — just a moment more...');
      });
    });

    it('shows the Retry CTA after timeout', async () => {
      renderLearner();

      act(() => {
        jest.advanceTimersByTime(16_000);
      });

      await waitFor(() => screen.getByTestId('learner-loading-retry'));
      // Retry button is present and pressable — pressing must not throw.
      expect(() =>
        fireEvent.press(screen.getByTestId('learner-loading-retry')),
      ).not.toThrow();
    });

    it('[HOME-08] "Go to Library" CTA navigates to Library (not back to Home)', async () => {
      // This is the core regression test for HOME-08: the prior "Go home" button
      // looped back to the same screen (LearnerScreen IS the Home tab).
      // The fix replaces it with Library + More routes that change state.
      renderLearner();

      act(() => {
        jest.advanceTimersByTime(16_000);
      });

      await waitFor(() => screen.getByTestId('learner-loading-go-library'));
      fireEvent.press(screen.getByTestId('learner-loading-go-library'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
      // Must NOT navigate to home — that would be a self-referential loop.
      expect(mockReplace).not.toHaveBeenCalledWith('/(app)/home');
    });

    it('"More options" CTA navigates to More tab', async () => {
      renderLearner();

      act(() => {
        jest.advanceTimersByTime(16_000);
      });

      await waitFor(() => screen.getByTestId('learner-loading-go-more'));
      fireEvent.press(screen.getByTestId('learner-loading-go-more'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
    });
  });
});
