import { createElement, type ReactElement, type ReactNode } from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import {
  ProfileContext,
  type ProfileContextValue,
} from '../../../../lib/profile';
import { AppContextProvider } from '../../../../lib/app-context';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../../../test-utils/mock-api-routes';
import {
  createTestProfile,
  renderScreen,
  type RenderScreenResult,
} from '../../../../test-utils/screen-render';

import ProgressSubjectScreen from '.';

// ─── Boundary mocks (external/native runtime only) ──────────────────────
//
// Everything that previously stubbed internal modules
// (lib/profile via direct hook returns, use-progress, use-language-progress,
// use-subjects, use-active-profile-role, use-navigation-contract,
// lib/navigation, lib/format-api-error, components/common, components/progress)
// now runs for real. The screen's real hooks hit the routed mock fetch
// installed by `renderScreen`, the real ProfileContext drives role + proxy
// state, and the real ErrorFallback / ProgressBar render. The only mocks left
// are true native/external boundaries the harness cannot run in JSDOM.

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — pinned translation table for progress.subject assertions */,
  () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        // Minimal translation table for progress.subject assertions in this suite.
        const map: Record<string, string> = {
          'progress.subject.noSubjectTitle': 'No subject selected',
          'progress.subject.noSubjectSubtitle':
            'Pick a subject from your progress page to see details.',
          'progress.subject.backToProgress': 'Back to progress',
          'progress.subject.loadingTooLong': 'Loading is taking too long',
          'progress.subject.checkConnection':
            'Check your connection and try again.',
          'progress.subject.errorTitle': "We couldn't load this subject",
          'progress.subject.errorMessageServer':
            'Something went wrong on our end. Tap below to retry.',
          'progress.subject.errorMessageNetwork':
            'Check your connection and try again.',
          'progress.subject.fallbackTitle': 'Subject progress',
          'progress.subject.topicsMastered': `${opts?.mastered ?? ''}/${
            opts?.total ?? ''
          } planned topics mastered`,
          'progress.subject.noTopicsPlanned': 'No topics planned yet',
          'progress.subject.topicsExplored': `${opts?.count ?? ''} ${
            (opts?.count ?? 0) === 1 ? 'topic' : 'topics'
          } explored`,
          'progress.subject.wordsTracked': `${
            opts?.count ?? ''
          } words tracked in this subject`,
          'progress.subject.sessionsCompleted': `${opts?.count ?? ''} ${
            (opts?.count ?? 0) === 1 ? 'session' : 'sessions'
          } completed`,
          'progress.subject.statStarted': 'Started',
          'progress.subject.statNotStarted': 'Not started',
          'progress.subject.statTimeSpent': 'Time spent',
          'progress.subject.statSessions': 'Sessions',
          'progress.subject.vocabularyTitle': 'Vocabulary',
          'progress.subject.vocabularyBreakdown': `${
            opts?.mastered ?? ''
          } mastered • ${opts?.learning ?? ''} learning • ${opts?.new ?? ''} new`,
          'progress.subject.wordCount': `${opts?.count ?? ''} words`,
          'progress.subject.viewAllVocab': 'View all vocabulary',
          'progress.subject.viewAllVocabLink': 'View all vocabulary →',
          'progress.subject.languageMilestone': 'Language milestone',
          'progress.subject.milestoneLoadError':
            'Could not load milestone data.',
          'progress.subject.retryMilestone': 'Retry loading milestone',
          'progress.subject.wordsProgress': `${opts?.mastered ?? ''}/${
            opts?.target ?? ''
          } words`,
          'progress.subject.phrasesProgress': `${opts?.mastered ?? ''}/${
            opts?.target ?? ''
          } phrases`,
          'progress.subject.upNext': `Up next: ${opts?.level ?? ''} — ${
            opts?.title ?? ''
          }`,
          'progress.subject.upNextLevelOnly': `Up next: ${opts?.level ?? ''}`,
          'progress.subject.upNextTitleOnly': `Up next: ${opts?.title ?? ''}`,
          'progress.subject.upNextNoDetails': 'Up next',
          'progress.subject.milestoneNoData':
            'Complete a session to start tracking your milestone progress.',
          'progress.subject.retentionTitle': 'Current retention',
          'progress.subject.retentionLoadError':
            "We couldn't load retention data right now.",
          'progress.subject.retryRetention': 'Retry loading retention',
          'progress.subject.retentionStrong':
            'Knowledge feels stable right now.',
          'progress.subject.retentionFading':
            'A light review would help keep this fresh.',
          'progress.subject.retentionWeak':
            'This subject would benefit from some extra attention.',
          'progress.register.adult.retentionStrong': 'Still remembered.',
          'progress.register.adult.retentionFading':
            'Getting fuzzy — a quick review will help.',
          'progress.register.adult.retentionWeak': 'Needs a quick refresh.',
          'progress.register.child.retentionStrong':
            'What came back to you this week.',
          'progress.register.child.retentionFading': 'Worth a quick refresh.',
          'progress.register.child.retentionWeak': 'Worth coming back to.',
          'progress.subject.openShelf': 'Open shelf',
          'progress.subject.pastConversations': 'Past conversations',
          'progress.subject.resume': 'Resume',
          'progress.subject.chooseNext': 'Choose next',
          'progress.subject.hideSubject': 'Hide subject',
          'progress.subject.hidingSubject': 'Hiding subject...',
          'progress.subject.hideSubjectHint':
            'Hides this subject from your main student views. You can restore it from Library later.',
          'progress.subject.hideConfirmTitle': `Hide ${opts?.subject ?? ''}?`,
          'progress.subject.hideConfirmTitleNoSubject': 'Hide this subject?',
          'progress.subject.hideConfirmMessage':
            'This will move the subject out of your main views. Your learning history stays saved, and you can restore it from Library.',
          'progress.subject.hideConfirmAction': 'Hide subject',
          'progress.subject.hideErrorTitle': 'Could not hide subject',
          'progress.subject.goneTitle': 'This subject is no longer available',
          'progress.subject.goneSubtitle':
            'It may have been removed or merged into another subject.',
          'proxy.readOnly.hint': 'You are viewing this in read-only mode.',
          'progress.keepLearning': 'Keep learning',
          'common.cancel': 'Cancel',
          'common.retry': 'Retry',
          'common.tryAgain': 'Try Again',
          'common.goBack': 'Go back',
        };
        if (key in map) return map[key]!;
        return key;
      },
    }),
  }),
);

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const ACTIVE_PROFILE_ID = '00000000-0000-4000-8000-000000011000';
const ACTIVE_ACCOUNT_ID = '00000000-0000-4000-8000-000000011001';
const SUBJECT_ID = '00000000-0000-4000-8000-000000011002';
const TOPIC_ID = '00000000-0000-4000-8000-000000011003';
const MILESTONE_ID = '00000000-0000-4000-8000-000000011004';
const SESSION_ID = '00000000-0000-4000-8000-000000011005';
const TEST_NOW = '2026-05-31T00:00:00.000Z';

const mockLocalSearchParams = jest.fn(() => ({ subjectId: SUBJECT_ID }));

jest.mock(
  'expo-router' /* gc1-allow: expo-router needs a native navigation container unavailable in JSDOM; router spies assert navigation */,
  () => {
    const React = require('react');
    return {
      // Real useFocusEffect fires the callback on focus (mount), NOT on every
      // render. Invoking it via useEffect([]) mirrors that: it runs once after
      // mount. Calling it on every render (the naive `callback()`) would loop
      // forever now that the real query hooks re-render on refetch. The mock is
      // still recorded on every render so the re-focus test can grab the latest
      // callback via `.mock.calls.at(-1)` and invoke it manually.
      useFocusEffect: jest.fn((callback: () => void) => {
        React.useEffect(() => {
          callback();
        }, [callback]);
      }),
      useRouter: () => ({
        back: mockBack,
        replace: mockReplace,
        push: mockPush,
        canGoBack: mockCanGoBack,
      }),
      useLocalSearchParams: () => mockLocalSearchParams(),
    };
  },
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native module that requires device/simulator to resolve insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../../lib/platform-alert' /* gc1-allow: wraps Alert.alert which is unavailable in JSDOM */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fullSubject = {
  subjectId: SUBJECT_ID,
  subjectName: 'Math',
  pedagogyMode: 'socratic',
  topics: { total: 10, explored: 5, mastered: 3, inProgress: 2, notStarted: 5 },
  vocabulary: { total: 0, mastered: 0, learning: 0, new: 0, byCefrLevel: {} },
  estimatedProficiency: null,
  estimatedProficiencyLabel: null,
  lastSessionAt: null,
  activeMinutes: 30,
  wallClockMinutes: 45,
  sessionsCount: 5,
};

const OWNER_PROFILE = createTestProfile({
  id: ACTIVE_PROFILE_ID,
  accountId: ACTIVE_ACCOUNT_ID,
  displayName: 'Test Owner',
  isOwner: true,
  birthYear: 1990,
});

type SubjectFixture = typeof fullSubject;

interface SubjectProgressFixture {
  retentionStatus: string;
  urgencyScore?: number;
  topicsCompleted?: number;
  topicsVerified?: number;
  lastSessionAt?: string | null;
}

interface RouteOptions {
  /** subjects[] returned by GET /progress/inventory. */
  subjects?: SubjectFixture[];
  /** Make GET /progress/inventory fail. 'server' → 500 (UpstreamError),
   * 'network' → fetch throws (NetworkError). */
  inventoryError?: 'server' | 'network';
  /** progress returned by GET /subjects/:id/progress (null = no retention). */
  subjectProgress?: SubjectProgressFixture | null;
  /** Make GET /subjects/:id/progress fail with a 500. */
  subjectProgressError?: boolean;
  /** data returned by GET /subjects/:id/cefr-progress. */
  languageProgress?: Record<string, unknown>;
  /** Make GET /subjects/:id/cefr-progress fail with a 500. */
  languageProgressError?: boolean;
  /** target returned by GET /progress/resume-target. */
  resumeTarget?: Record<string, unknown> | null;
  /** Make the PATCH /subjects/:id (hide) fail with this 400 message. */
  hideErrorMessage?: string;
}

function serverError(): Response {
  return new Response(
    JSON.stringify({
      code: 'UPSTREAM_ERROR',
      message: 'Internal server error',
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  );
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ code: 'BAD_REQUEST', message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeInventoryResponse(subjects: SubjectFixture[]): unknown {
  return {
    profileId: ACTIVE_PROFILE_ID,
    snapshotDate: '2026-05-31',
    currentlyWorkingOn: ['Math'],
    thisWeekMini: { sessions: 1, wordsLearned: 0, topicsTouched: 1 },
    global: {
      topicsAttempted: 5,
      topicsMastered: 3,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      weeklyDeltaTopicsMastered: null,
      weeklyDeltaVocabularyTotal: null,
      weeklyDeltaTopicsExplored: null,
      totalSessions: 5,
      totalActiveMinutes: 30,
      totalWallClockMinutes: 45,
      currentStreak: 1,
      longestStreak: 2,
    },
    subjects,
  };
}

function makeSubjectProgress(
  progress: SubjectProgressFixture | undefined,
): unknown {
  return {
    subjectId: SUBJECT_ID,
    name: 'Math',
    topicsTotal: 10,
    topicsCompleted: progress?.topicsCompleted ?? 5,
    topicsVerified: progress?.topicsVerified ?? 3,
    topicsMastered: progress?.topicsVerified ?? 3,
    topicsLearning: 2,
    urgencyScore: progress?.urgencyScore ?? 0,
    retentionStatus: progress?.retentionStatus ?? 'strong',
    lastSessionAt: progress?.lastSessionAt ?? null,
  };
}

function makeLanguageProgress(
  progress: Record<string, unknown> | undefined,
): unknown {
  const currentMilestone =
    typeof progress?.currentMilestone === 'object' &&
    progress.currentMilestone !== null
      ? {
          milestoneId: MILESTONE_ID,
          currentLevel: progress.currentLevel ?? 'A2',
          currentSublevel: progress.currentSublevel ?? 'A2.1',
          ...(progress.currentMilestone as Record<string, unknown>),
        }
      : (progress?.currentMilestone ?? null);
  const nextMilestone =
    typeof progress?.nextMilestone === 'object' &&
    progress.nextMilestone !== null
      ? {
          milestoneId: MILESTONE_ID,
          sublevel: 'B1.1',
          ...(progress.nextMilestone as Record<string, unknown>),
        }
      : (progress?.nextMilestone ?? null);

  return {
    subjectId: SUBJECT_ID,
    languageCode: 'en',
    pedagogyMode: 'four_strands',
    currentLevel: null,
    currentSublevel: null,
    ...progress,
    currentMilestone,
    nextMilestone,
  };
}

function makeSubjectResponse(status = 'archived'): unknown {
  return {
    subject: {
      id: SUBJECT_ID,
      profileId: ACTIVE_PROFILE_ID,
      name: 'Math',
      rawInput: null,
      status,
      curriculumStatus: 'ready',
      pedagogyMode: 'socratic',
      languageCode: null,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
  };
}

/**
 * Build the routes the real hooks hit. Endpoints discovered from the hook
 * sources (apps/mobile/src/hooks/use-progress.ts, use-language-progress.ts,
 * use-subjects.ts) — the Hono RPC base is `${getApiUrl()}/v1`:
 *   - useProgressInventory     → GET  /progress/inventory   → KnowledgeInventory
 *   - useSubjectProgress       → GET  /subjects/:id/progress → { progress }
 *   - useLearningResumeTarget  → GET  /progress/resume-target → { target }
 *   - useLanguageProgress      → GET  /subjects/:id/cefr-progress → LanguageProgress
 *   - useUpdateSubject         → PATCH /subjects/:id          → { subject }
 *
 * Insertion order matters: the routed mock returns the first `includes()`
 * match. The two `/subjects/:id/...` sub-paths and the cefr path precede the
 * bare `/subjects/:id` PATCH route so a GET never falls into the PATCH handler.
 */
function buildRoutes(opts: RouteOptions = {}): Record<string, unknown> {
  const subjects = opts.subjects ?? [fullSubject];

  return {
    [`/subjects/${SUBJECT_ID}/cefr-progress`]: opts.languageProgressError
      ? () => serverError()
      : makeLanguageProgress(opts.languageProgress),
    [`/subjects/${SUBJECT_ID}/progress`]: opts.subjectProgressError
      ? () => serverError()
      : { progress: makeSubjectProgress(opts.subjectProgress ?? undefined) },
    '/progress/resume-target': { target: opts.resumeTarget ?? null },
    '/progress/inventory':
      opts.inventoryError === 'network'
        ? () => {
            throw new TypeError('Network request failed');
          }
        : opts.inventoryError === 'server'
          ? () => serverError()
          : makeInventoryResponse(subjects),
    // Bare subject route — only the PATCH (hide) lands here.
    [`/subjects/${SUBJECT_ID}`]: opts.hideErrorMessage
      ? () => badRequest(opts.hideErrorMessage as string)
      : makeSubjectResponse(),
  };
}

// ─── Render helpers ────────────────────────────────────────────────────────

let active: RenderScreenResult | null = null;

function mount(opts: RouteOptions = {}): RenderScreenResult {
  active = renderScreen(<ProgressSubjectScreen />, {
    profile: OWNER_PROFILE,
    profiles: [OWNER_PROFILE],
    routes: buildRoutes(opts),
  });
  return active;
}

/**
 * Proxy-mode render. `renderScreen` hard-codes `isExplicitProxyMode: false`,
 * and the real `useNavigationContract` → `useParentProxy` derives proxy state
 * purely from that flag, so the proxy write-guard tests build the same provider
 * stack as the harness but with `isExplicitProxyMode: true`. This keeps the
 * navigation contract real instead of mocking it.
 */
function mountProxy(opts: RouteOptions = {}): {
  routedFetch: RoutedMockFetch;
  cleanup: () => void;
} {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const routedFetch = createRoutedMockFetch(buildRoutes(opts));
  const prevFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    routedFetch as unknown as typeof fetch;

  const profileContextValue: ProfileContextValue = {
    profiles: [OWNER_PROFILE],
    activeProfile: OWNER_PROFILE,
    isExplicitProxyMode: true,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        createElement(AppContextProvider, null, children),
      ),
    );
  }

  render(<ProgressSubjectScreen />, { wrapper: Wrapper });

  return {
    routedFetch,
    cleanup: () => {
      void queryClient.cancelQueries();
      queryClient.clear();
      (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgressSubjectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
    mockLocalSearchParams.mockReturnValue({ subjectId: SUBJECT_ID });
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
  });

  // ── Missing subjectId ────────────────────────────────────────────────────
  describe('missing subjectId', () => {
    beforeEach(() => {
      mockLocalSearchParams.mockReturnValue({} as { subjectId: string });
    });

    it('shows "No subject selected" view with correct testID', () => {
      mount();
      screen.getByTestId('progress-subject-missing');
      screen.getByText('No subject selected');
    });

    it('shows a "Back to progress" action button', () => {
      mount();
      screen.getByTestId('progress-subject-missing-back');
    });

    it('navigates to progress list when back button pressed', () => {
      mount();
      fireEvent.press(screen.getByTestId('progress-subject-missing-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows skeleton placeholder with correct testID', () => {
      mount();
      // React Query starts pending; the skeleton renders synchronously before
      // the routed fetch resolves on the next microtask.
      screen.getByTestId('progress-subject-loading');
    });

    it('does not show subject content while loading', () => {
      mount();
      expect(screen.queryByText('Math')).toBeNull();
    });
  });

  // ── Error (inventory query) ──────────────────────────────────────────────
  describe('inventory error state', () => {
    it('shows ErrorFallback with correct testID', async () => {
      mount({ inventoryError: 'server' });
      await screen.findByTestId('progress-subject-error');
    });

    it('shows error title', async () => {
      mount({ inventoryError: 'server' });
      await screen.findByText("We couldn't load this subject");
    });

    it('calls refetch when retry button pressed', async () => {
      const { routedFetch } = mount({ inventoryError: 'server' });
      const retry = await screen.findByTestId('progress-subject-error-retry');
      const before = fetchCallsMatching(
        routedFetch,
        '/progress/inventory',
      ).length;
      fireEvent.press(retry);
      await waitFor(() => {
        expect(
          fetchCallsMatching(routedFetch, '/progress/inventory').length,
        ).toBeGreaterThan(before);
      });
    });

    it('navigates to progress list when error back button pressed', async () => {
      mount({ inventoryError: 'server' });
      const back = await screen.findByTestId('progress-subject-error-back');
      fireEvent.press(back);
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });

    it('shows connection message for non-API errors', async () => {
      mount({ inventoryError: 'network' });
      await screen.findByText('Check your connection and try again.');
    });

    it('shows server error message when error is a server fault', async () => {
      mount({ inventoryError: 'server' });
      await screen.findByText(
        'Something went wrong on our end. Tap below to retry.',
      );
    });
  });

  // ── Subject found (happy path) ───────────────────────────────────────────
  describe('subject found', () => {
    it('displays the subject name', async () => {
      mount();
      await screen.findByText('Math');
    });

    it('refreshes subject progress when the mounted progress tab focuses again', async () => {
      const { routedFetch } = mount();
      await screen.findByText('Math');

      const before = {
        inventory: fetchCallsMatching(routedFetch, '/progress/inventory')
          .length,
        subjectProgress: fetchCallsMatching(
          routedFetch,
          `/subjects/${SUBJECT_ID}/progress`,
        ).length,
        resume: fetchCallsMatching(routedFetch, '/progress/resume-target')
          .length,
        language: fetchCallsMatching(
          routedFetch,
          `/subjects/${SUBJECT_ID}/cefr-progress`,
        ).length,
      };

      // The real screen registers its refetch callback via useFocusEffect; the
      // first focus (fired on mount by the mock) is a no-op guard, so grab the
      // last registered callback and invoke it to simulate a re-focus.
      const focusCallback = (useFocusEffect as jest.Mock).mock.calls.at(
        -1,
      )?.[0] as () => void;
      act(() => {
        focusCallback();
      });

      await waitFor(() => {
        expect(
          fetchCallsMatching(routedFetch, '/progress/inventory').length,
        ).toBeGreaterThan(before.inventory);
        expect(
          fetchCallsMatching(routedFetch, `/subjects/${SUBJECT_ID}/progress`)
            .length,
        ).toBeGreaterThan(before.subjectProgress);
        expect(
          fetchCallsMatching(routedFetch, '/progress/resume-target').length,
        ).toBeGreaterThan(before.resume);
        expect(
          fetchCallsMatching(
            routedFetch,
            `/subjects/${SUBJECT_ID}/cefr-progress`,
          ).length,
        ).toBeGreaterThan(before.language);
      });
    });

    it('shows topics mastered / total heading', async () => {
      mount();
      await screen.findByText('3/10 planned topics mastered');
    });

    it('shows sessions count when vocabulary total is 0', async () => {
      mount();
      await screen.findByText('5 sessions completed');
    });

    it('shows stat cards — Started, Not started, Time spent, Sessions', async () => {
      mount();
      await screen.findByText('Started');
      screen.getByText('Not started');
      screen.getByText('Time spent');
      screen.getByText('Sessions');
    });

    it('shows formatted wallClockMinutes in Time spent stat card (priority over activeMinutes)', async () => {
      mount();
      // wallClockMinutes=45 takes priority over activeMinutes=30; formatMinutes(45) → "45 min"
      await screen.findByText('45 min');
    });

    it('shows "Choose next", "Past conversations", and "Open shelf" buttons when there is no resume target', async () => {
      mount();
      await screen.findByText('Choose next');
      screen.getByText('Past conversations');
      screen.getByText('Open shelf');
      screen.getByText('Hide subject');
    });

    it('navigates to subject sessions on "Past conversations" press', async () => {
      mount();
      const btn = await screen.findByText('Past conversations');
      fireEvent.press(btn);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/progress/[subjectId]/sessions',
        params: { subjectId: SUBJECT_ID },
      });
    });

    it('opens the shelf on primary action press when there is no resume target', async () => {
      mount();
      const btn = await screen.findByText('Choose next');
      fireEvent.press(btn);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      });
    });

    it('resumes the shared subject target on "Resume" press', async () => {
      const target = {
        subjectId: SUBJECT_ID,
        subjectName: 'Math',
        topicId: TOPIC_ID,
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: SESSION_ID,
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Continue Fractions',
      };
      mount({ resumeTarget: target });

      const btn = await screen.findByText('Resume');
      fireEvent.press(btn);

      // Real pushLearningResumeTarget seeds the home stack, then pushes the
      // session route with the resume params — a stronger assertion than the
      // old spy on the helper.
      expect(mockPush).toHaveBeenCalledWith('/(app)/home');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: SUBJECT_ID,
          subjectName: 'Math',
          topicId: TOPIC_ID,
          topicName: 'Fractions',
          resumeFromSessionId: SESSION_ID,
        }),
      });
      expect(mockPush).not.toHaveBeenCalledWith(
        `/(app)/session?mode=learning&subjectId=${SUBJECT_ID}`,
      );
    });

    it('navigates to shelf on "Open shelf" press', async () => {
      mount();
      const btn = await screen.findByText('Open shelf');
      fireEvent.press(btn);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      });
    });

    it('back arrow replaces with progress route when the back-stack is empty', async () => {
      mount();
      const back = await screen.findByTestId('progress-subject-back');
      // canGoBack() defaults to false (deep-link entry), so the real
      // goBackOrReplace falls back to router.replace(backFallback).
      fireEvent.press(back);
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });

    it('asks for confirmation before hiding the subject', async () => {
      const { routedFetch } = mount();
      const hide = await screen.findByTestId('progress-subject-hide');

      fireEvent.press(hide);

      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Hide Math?',
        'This will move the subject out of your main views. Your learning history stays saved, and you can restore it from Library.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({
            text: 'Hide subject',
            style: 'destructive',
          }),
        ]),
        { cancelable: true },
      );
      expect(
        fetchCallsMatching(routedFetch, `/subjects/${SUBJECT_ID}`).filter(
          (c) => c.init?.method === 'PATCH',
        ),
      ).toHaveLength(0);
    });

    it('uses the no-subject confirmation title when the subject name is blank', async () => {
      mount({ subjects: [{ ...fullSubject, subjectName: '   ' }] });
      const hide = await screen.findByTestId('progress-subject-hide');

      fireEvent.press(hide);

      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Hide this subject?',
        expect.any(String),
        expect.any(Array),
        { cancelable: true },
      );
    });

    it('archives the subject and returns to progress after confirmation', async () => {
      const { routedFetch } = mount();
      const hide = await screen.findByTestId('progress-subject-hide');

      fireEvent.press(hide);
      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Hide subject')?.onPress?.();

      await waitFor(() => {
        const patchCalls = fetchCallsMatching(
          routedFetch,
          `/subjects/${SUBJECT_ID}`,
        ).filter((c) => c.init?.method === 'PATCH');
        expect(patchCalls).toHaveLength(1);
        expect(JSON.parse(patchCalls[0]!.init?.body as string)).toEqual({
          status: 'archived',
        });
      });
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
      });
    });

    it('shows a friendly error if hiding fails', async () => {
      mount({ hideErrorMessage: 'Nope' });
      const hide = await screen.findByTestId('progress-subject-hide');

      fireEvent.press(hide);
      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Hide subject')?.onPress?.();

      // The real PATCH returns a 400 with message "Nope"; assertOk throws a
      // BadRequestError and the real formatApiError passes the short,
      // non-technical server message through verbatim.
      await waitFor(() => {
        expect(mockPlatformAlert).toHaveBeenLastCalledWith(
          'Could not hide subject',
          'Nope',
        );
      });
    });

    it('shows topics explored when total is null', async () => {
      const subjectNoTotal = {
        ...fullSubject,
        topics: {
          ...fullSubject.topics,
          total: null as unknown as number,
          explored: 7,
          mastered: 2,
          inProgress: 3,
        },
      };
      mount({ subjects: [subjectNoTotal] });
      // max(explored, mastered+inProgress) = max(7, 5) = 7 topics explored
      await screen.findByText('7 topics explored');
    });
  });

  // ── Vocabulary section ───────────────────────────────────────────────────
  describe('vocabulary section', () => {
    const subjectWithVocab = {
      ...fullSubject,
      vocabulary: {
        total: 42,
        mastered: 20,
        learning: 15,
        new: 7,
        byCefrLevel: { A1: 10, A2: 32 } as Record<string, number>,
      },
    };

    it('shows vocabulary word count when total > 0', async () => {
      mount({ subjects: [subjectWithVocab] });
      await screen.findByText('42 words tracked in this subject');
    });

    it('shows mastered / learning / new breakdown', async () => {
      mount({ subjects: [subjectWithVocab] });
      await screen.findByText(/20 mastered/);
      screen.getByText(/15 learning/);
      screen.getByText(/7 new/);
    });

    it('shows "View all vocabulary" button', async () => {
      mount({ subjects: [subjectWithVocab] });
      await screen.findByTestId('vocab-view-all');
    });

    it('does not show vocabulary section when total is 0', async () => {
      mount();
      await screen.findByText('Math');
      expect(screen.queryByTestId('vocab-view-all')).toBeNull();
    });
  });

  // ── Subject gone ─────────────────────────────────────────────────────────
  describe('subject gone (inventory loaded, subject not found)', () => {
    it('shows "no longer available" card with correct testID', async () => {
      mount({ subjects: [] });
      await screen.findByTestId('progress-subject-gone');
    });

    it('shows explanatory text', async () => {
      mount({ subjects: [] });
      await screen.findByText('This subject is no longer available');
    });

    it('navigates to progress list when gone-back button pressed', async () => {
      mount({ subjects: [] });
      const back = await screen.findByTestId('progress-subject-gone-back');
      fireEvent.press(back);
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });
  });

  // ── Language subject / CEFR milestone card ───────────────────────────────
  describe('language subject (pedagogyMode four_strands)', () => {
    const languageSubject = { ...fullSubject, pedagogyMode: 'four_strands' };

    const milestoneData = {
      currentLevel: 'A2',
      currentMilestone: {
        milestoneTitle: 'Everyday conversations',
        wordsMastered: 80,
        wordsTarget: 150,
        chunksMastered: 20,
        chunksTarget: 40,
        milestoneProgress: 0.5,
      },
      nextMilestone: {
        level: 'B1',
        milestoneTitle: 'Intermediate fluency',
      },
    };

    it('shows CEFR milestone card', async () => {
      mount({
        subjects: [languageSubject],
        languageProgress: milestoneData,
      });
      await screen.findByTestId('cefr-milestone-card');
    });

    it('shows current level and milestone title', async () => {
      mount({
        subjects: [languageSubject],
        languageProgress: milestoneData,
      });
      await screen.findByText(/A2/);
      screen.getByText(/Everyday conversations/);
    });

    it('shows words and phrases progress counts', async () => {
      mount({
        subjects: [languageSubject],
        languageProgress: milestoneData,
      });
      await screen.findByText('80/150 words');
      screen.getByText('20/40 phrases');
    });

    it('shows next milestone label when present', async () => {
      mount({
        subjects: [languageSubject],
        languageProgress: milestoneData,
      });
      await screen.findByText(/Up next: B1/);
    });

    it('uses the level-only next milestone label when the milestone title is blank', async () => {
      mount({
        subjects: [languageSubject],
        languageProgress: {
          ...milestoneData,
          nextMilestone: { level: 'B1', milestoneTitle: '   ' },
        },
      });
      await screen.findByText('Up next: B1');
    });

    it('shows "Complete a session" prompt when no milestone data yet', async () => {
      mount({
        subjects: [languageSubject],
        languageProgress: { currentLevel: 'A1', currentMilestone: null },
      });
      await screen.findByText(
        'Complete a session to start tracking your milestone progress.',
      );
    });

    it('shows CEFR card for general subject when languageProgress is present', async () => {
      // isLanguageSubject = pedagogyMode four_strands OR !!languageProgress
      mount({ languageProgress: milestoneData });
      await screen.findByTestId('cefr-milestone-card');
    });

    it('shows retry button when language progress query errors', async () => {
      const { routedFetch } = mount({
        subjects: [languageSubject],
        languageProgressError: true,
      });
      await screen.findByTestId('cefr-milestone-card');
      const retryBtn = await screen.findByTestId('cefr-milestone-retry');
      const before = fetchCallsMatching(
        routedFetch,
        `/subjects/${SUBJECT_ID}/cefr-progress`,
      ).length;
      fireEvent.press(retryBtn);
      await waitFor(() => {
        expect(
          fetchCallsMatching(
            routedFetch,
            `/subjects/${SUBJECT_ID}/cefr-progress`,
          ).length,
        ).toBeGreaterThan(before);
      });
    });
  });

  // ── Retention error ──────────────────────────────────────────────────────
  describe('retention error state', () => {
    it('shows retention error card with correct testID', async () => {
      mount({ subjectProgressError: true });
      await screen.findByTestId('progress-subject-retention-error');
    });

    it('shows retention error heading', async () => {
      mount({ subjectProgressError: true });
      await screen.findByText('Current retention');
    });

    it('calls subjectProgressQuery.refetch on retry press', async () => {
      const { routedFetch } = mount({ subjectProgressError: true });
      const retry = await screen.findByTestId(
        'progress-subject-retention-retry',
      );
      const before = fetchCallsMatching(
        routedFetch,
        `/subjects/${SUBJECT_ID}/progress`,
      ).length;
      fireEvent.press(retry);
      await waitFor(() => {
        expect(
          fetchCallsMatching(routedFetch, `/subjects/${SUBJECT_ID}/progress`)
            .length,
        ).toBeGreaterThan(before);
      });
    });
  });

  // ── Retention data (legacy progress) ────────────────────────────────────
  describe('retention data present', () => {
    it('shows adult copy for strong retention', async () => {
      mount({ subjectProgress: { retentionStatus: 'strong' } });
      await screen.findByText('Still remembered.');
    });

    it('shows review suggestion for fading retention', async () => {
      mount({ subjectProgress: { retentionStatus: 'fading' } });
      await screen.findByText('Getting fuzzy — a quick review will help.');
    });

    it('shows extra attention message for weak retention', async () => {
      mount({ subjectProgress: { retentionStatus: 'weak' } });
      await screen.findByText('Needs a quick refresh.');
    });

    it('shows the retention card for overdue retention even when no completed sessions are recorded', async () => {
      mount({
        subjects: [{ ...fullSubject, sessionsCount: 0 }],
        subjectProgress: {
          retentionStatus: 'weak',
          urgencyScore: 2,
          topicsCompleted: 0,
          topicsVerified: 0,
          lastSessionAt: null,
        },
      });

      await screen.findByTestId('progress-subject-retention-card');
      screen.getByText('Needs a quick refresh.');
    });

    it('shows the retention card when retention is weak even if activity counters are empty', async () => {
      mount({
        subjects: [{ ...fullSubject, sessionsCount: 0 }],
        subjectProgress: {
          retentionStatus: 'weak',
          urgencyScore: 0,
          topicsCompleted: 0,
          topicsVerified: 0,
          lastSessionAt: null,
        },
      });

      await screen.findByTestId('progress-subject-retention-card');
      screen.getByText('Needs a quick refresh.');
    });

    it('does not show a strong-retention card for a subject with no activity or due reviews', async () => {
      mount({
        subjects: [{ ...fullSubject, sessionsCount: 0 }],
        subjectProgress: {
          retentionStatus: 'strong',
          urgencyScore: 0,
          topicsCompleted: 0,
          topicsVerified: 0,
          lastSessionAt: null,
        },
      });

      // Wait for the subject body to render before asserting the card is absent.
      await screen.findByText('Math');
      expect(
        screen.queryByTestId('progress-subject-retention-card'),
      ).toBeNull();
    });

    it('opens the shelf when the retention card is pressed without a resume target', async () => {
      mount({ subjectProgress: { retentionStatus: 'weak' } });

      const card = await screen.findByTestId('progress-subject-retention-card');
      fireEvent.press(card);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      });
    });

    it('resumes the subject target when the retention card is pressed and a resume target exists', async () => {
      const target = {
        subjectId: SUBJECT_ID,
        subjectName: 'Math',
        topicId: TOPIC_ID,
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: SESSION_ID,
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Continue Fractions',
      };
      mount({
        subjectProgress: { retentionStatus: 'weak' },
        resumeTarget: target,
      });

      const card = await screen.findByTestId('progress-subject-retention-card');
      // Wait for the resume target to load so the card resolves to the resume
      // action rather than the shelf fallback.
      await screen.findByText('Resume');
      fireEvent.press(card);

      expect(mockPush).toHaveBeenCalledWith('/(app)/home');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
        }),
      });
    });
  });

  // ── Proxy mode write guard [WI-279] ──────────────────────────────────────
  describe('proxy mode write guard [WI-279]', () => {
    let proxy: { routedFetch: RoutedMockFetch; cleanup: () => void } | null =
      null;

    afterEach(() => {
      if (proxy) proxy.cleanup();
      proxy = null;
    });

    it('renders the hide button disabled in proxy mode [WI-279]', async () => {
      proxy = mountProxy();
      const hide = await screen.findByTestId('progress-subject-hide');
      expect(hide).toBeDisabled();
    });

    it('shows the proxy read-only hint in proxy mode [WI-279]', async () => {
      proxy = mountProxy();
      await screen.findByTestId('progress-subject-proxy-hint');
    });

    it('does NOT dispatch updateSubject when hide button is pressed in proxy mode [WI-279]', async () => {
      proxy = mountProxy();
      const hide = await screen.findByTestId('progress-subject-hide');
      fireEvent.press(hide);
      expect(mockPlatformAlert).not.toHaveBeenCalled();
      expect(
        fetchCallsMatching(proxy.routedFetch, `/subjects/${SUBJECT_ID}`).filter(
          (c) => c.init?.method === 'PATCH',
        ),
      ).toHaveLength(0);
    });
  });
});
