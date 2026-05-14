import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
} from '../../../../../test-utils/screen-render-harness';
import { safeAreaShim } from '../../../../test-utils/native-shims';

import ProgressSubjectScreen from '.';

// ─── API mock ────────────────────────────────────────────────────────────────

const mockFetch = createRoutedMockFetch();

jest.mock('../../../../lib/api-client', () =>
  require('../../../../test-utils/mock-api-routes').mockApiClientFactory(
    mockFetch,
  ),
);

// ─── expo-router  (native-boundary) ─────────────────────────────────────────
// Mutable state objects — factories close over these references; per-test
// mutations are picked up because the factory reads the *current* values at
// call time (not at hoist time).

const mockRouterFns = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => false),
  navigate: jest.fn(),
  dismiss: jest.fn(),
};

// Params object mutated per-describe via currentParams assignment.
// The factory returns a stable object ref so Jest's module cache sees updates.
const mockParams: { subjectId?: string } = { subjectId: 's1' };

let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => { // gc1-allow: native-boundary — expo-router requires native navigation stack
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouterFns,
    useLocalSearchParams: () => mockParams,
    useGlobalSearchParams: () => mockParams,
    useSegments: () => [],
    usePathname: () => '/',
    Link: require('react-native').Text,
    useFocusEffect: jest.fn((callback: () => void) => {
      mockFocusCallback = callback;
      useEffect(() => {
        callback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [callback]);
    }),
  };
});

// ─── react-native-safe-area-context  (native-boundary) ───────────────────────

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary — safe-area context requires native insets
  safeAreaShim(),
);

// ─── Internal lib mocks (gc1-allow per reason below) ─────────────────────────

const mockGoBackOrReplace = jest.fn();
const mockPushLearningResumeTarget = jest.fn();
jest.mock('../../../../lib/navigation', () => ({ // gc1-allow: navigation lib wraps router; spy needed to assert call args without full router stack
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  pushLearningResumeTarget: (...args: unknown[]) =>
    mockPushLearningResumeTarget(...args),
  homeHrefForReturnTo: (returnTo: string) => returnTo,
}));

jest.mock('../../../../components/common', () => { // gc1-allow: ErrorFallback uses NativeWind classes that require native CSS interop unavailable in Jest; shim provides stable testID anchors
  const { View, Text, Pressable } = require('react-native');
  return {
    ErrorFallback: (props: {
      testID?: string;
      title?: string;
      message?: string;
      primaryAction?: { testID?: string; onPress: () => void; label: string };
      secondaryAction?: {
        testID?: string;
        onPress: () => void;
        label: string;
      };
    }) => (
      <View testID={props.testID}>
        {props.title ? <Text>{props.title}</Text> : null}
        {props.message ? <Text>{props.message}</Text> : null}
        {props.primaryAction ? (
          <Pressable
            testID={props.primaryAction.testID}
            onPress={props.primaryAction.onPress}
          >
            <Text>{props.primaryAction.label}</Text>
          </Pressable>
        ) : null}
        {props.secondaryAction ? (
          <Pressable
            testID={props.secondaryAction.testID}
            onPress={props.secondaryAction.onPress}
          >
            <Text>{props.secondaryAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

jest.mock('../../../../components/progress', () => ({ // gc1-allow: ProgressBar uses canvas/SVG primitives unavailable in Jest DOM
  ProgressBar: () => null,
}));

const mockPlatformAlert = jest.fn();
jest.mock('../../../../lib/platform-alert', () => ({ // gc1-allow: Alert.alert is a no-op in Jest; capture calls for assertion
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../../../lib/format-api-error', () => ({ // gc1-allow: real formatApiError depends on ApiError class hierarchy from api-client; shim pins output for deterministic assertions
  ...jest.requireActual('../../../../lib/format-api-error'),
  formatApiError: (err: Error) => `formatted: ${err.message}`,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
  wallClockMinutes: 45,
  sessionsCount: 5,
};

// ─── Route helpers ───────────────────────────────────────────────────────────

function setInventoryRoute(
  body: unknown,
  status = 200,
) {
  mockFetch.setRoute(
    '/progress/inventory',
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function setSubjectProgressRoute(
  body: unknown,
  status = 200,
) {
  mockFetch.setRoute(
    '/subjects/s1/progress',
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function setResumeTargetRoute(target: unknown = null) {
  mockFetch.setRoute(
    '/progress/resume-target',
    () =>
      new Response(JSON.stringify({ target }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function setCefrProgressRoute(body: unknown, status = 200) {
  mockFetch.setRoute(
    '/cefr-progress',
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function setSubjectPatchRoute(status = 200) {
  mockFetch.setRoute(
    '/subjects/s1',
    () =>
      new Response(JSON.stringify({ subject: {} }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function setupDefaultRoutes() {
  setInventoryRoute({ subjects: [fullSubject] });
  setSubjectProgressRoute({ progress: { retentionStatus: 'strong' } });
  setResumeTargetRoute(null);
  setCefrProgressRoute({});
  setSubjectPatchRoute();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgressSubjectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallback = null;
    mockParams.subjectId = 's1';
    setupDefaultRoutes();
  });

  // ── Missing subjectId ────────────────────────────────────────────────────
  describe('missing subjectId', () => {
    beforeEach(() => {
      delete mockParams.subjectId;
    });

    it('shows "No subject selected" view with correct testID', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-missing'));
      screen.getByText('No subject selected');
    });

    it('shows a "Back to progress" action button', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-missing-back'),
      );
    });

    it('navigates to progress list when back button pressed', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-missing-back'),
      );
      fireEvent.press(screen.getByTestId('progress-subject-missing-back'));
      expect(mockRouterFns.replace).toHaveBeenCalledWith('/(app)/progress');
    });
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows skeleton placeholder with correct testID', async () => {
      // Stall the inventory response so loading state persists
      mockFetch.setRoute(
        '/progress/inventory',
        () => new Promise<Response>(() => undefined),
      );
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-loading'));
    });

    it('does not show subject content while loading', async () => {
      mockFetch.setRoute(
        '/progress/inventory',
        () => new Promise<Response>(() => undefined),
      );
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-loading'));
      expect(screen.queryByText('Math')).toBeNull();
    });
  });

  // ── Error (inventory query) ──────────────────────────────────────────────
  describe('inventory error state', () => {
    beforeEach(() => {
      setInventoryRoute({}, 500);
    });

    it('shows ErrorFallback with correct testID', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-error'));
    });

    it('shows error title', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText("We couldn't load this subject"),
      );
    });

    it('navigates to progress list when error back button pressed', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-error-back'),
      );
      fireEvent.press(screen.getByTestId('progress-subject-error-back'));
      expect(mockRouterFns.replace).toHaveBeenCalledWith('/(app)/progress');
    });

    it('shows server error message for API errors', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText(
          'Something went wrong on our end. Tap below to retry.',
        ),
      );
    });
  });

  // ── Subject found (happy path) ───────────────────────────────────────────
  describe('subject found', () => {
    it('displays the subject name', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Math'));
    });

    it('refreshes subject progress when the mounted progress tab focuses again', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Math'));

      const callsBefore = mockFetch.mock.calls.length;

      // Simulate a second focus event (first focus fires on mount;
      // hasFocusedOnceRef skips it; second focus triggers the refetches)
      act(() => {
        mockFocusCallback?.();
      });

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });

    it('shows topics mastered / total heading', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText('3/10 planned topics mastered'),
      );
    });

    it('shows sessions count when vocabulary total is 0', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('5 sessions completed'));
    });

    it('shows stat cards — Started, Not started, Time spent, Sessions', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Started'));
      screen.getByText('Not started');
      screen.getByText('Time spent');
      screen.getByText('Sessions');
    });

    it('shows formatted wallClockMinutes in Time spent stat card (priority over activeMinutes)', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      // wallClockMinutes=45 takes priority over activeMinutes=30; formatMinutes(45) → "45 min"
      await waitFor(() => screen.getByText('45 min'));
    });

    it('shows "Choose next", "Past conversations", and "Open shelf" buttons when there is no resume target', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Choose next'));
      screen.getByText('Past conversations');
      screen.getByText('Open shelf');
      screen.getByText('Hide subject');
    });

    it('navigates to subject sessions on "Past conversations" press', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Past conversations'));
      fireEvent.press(screen.getByText('Past conversations'));
      expect(mockRouterFns.push).toHaveBeenCalledWith({
        pathname: '/(app)/progress/[subjectId]/sessions',
        params: { subjectId: 's1' },
      });
    });

    it('opens the shelf on primary action press when there is no resume target', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Choose next'));
      fireEvent.press(screen.getByText('Choose next'));
      expect(mockRouterFns.push).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 's1' },
      });
    });

    it('resumes the shared subject target on "Resume" press', async () => {
      const target = {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: 'prev-session',
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Continue Fractions',
      };
      setResumeTargetRoute(target);

      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Resume'));
      fireEvent.press(screen.getByText('Resume'));

      expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
        expect.anything(),
        target,
      );
      expect(mockRouterFns.push).not.toHaveBeenCalledWith(
        '/(app)/session?mode=learning&subjectId=s1',
      );
    });

    it('navigates to shelf on "Open shelf" press', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Open shelf'));
      fireEvent.press(screen.getByText('Open shelf'));
      expect(mockRouterFns.push).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 's1' },
      });
    });

    it('back arrow calls goBackOrReplace with progress route', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-back'));
      fireEvent.press(screen.getByTestId('progress-subject-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/progress',
      );
    });

    it('asks for confirmation before hiding the subject', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-hide'));

      fireEvent.press(screen.getByTestId('progress-subject-hide'));

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
    });

    it('archives the subject and returns to progress after confirmation', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-hide'));

      fireEvent.press(screen.getByTestId('progress-subject-hide'));
      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Hide subject')?.onPress?.();

      await waitFor(() => {
        expect(mockRouterFns.replace).toHaveBeenCalledWith('/(app)/progress');
      });
    });

    it('shows a friendly error if hiding fails', async () => {
      setSubjectPatchRoute(500);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-hide'));

      fireEvent.press(screen.getByTestId('progress-subject-hide'));
      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Hide subject')?.onPress?.();

      await waitFor(() => {
        expect(mockPlatformAlert).toHaveBeenLastCalledWith(
          'Could not hide subject',
          expect.stringContaining('formatted:'),
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
      setInventoryRoute({ subjects: [subjectNoTotal] });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      // max(explored, mastered+inProgress) = max(7, 5) = 7 topics explored
      await waitFor(() => screen.getByText('7 topics explored'));
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
      setInventoryRoute({ subjects: [subjectWithVocab] });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText('42 words tracked in this subject'),
      );
    });

    it('shows mastered / learning / new breakdown', async () => {
      setInventoryRoute({ subjects: [subjectWithVocab] });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText(/20 mastered/));
      screen.getByText(/15 learning/);
      screen.getByText(/7 new/);
    });

    it('shows "View all vocabulary" button', async () => {
      setInventoryRoute({ subjects: [subjectWithVocab] });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('vocab-view-all'));
    });

    it('does not show vocabulary section when total is 0', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Math'));
      expect(screen.queryByTestId('vocab-view-all')).toBeNull();
    });
  });

  // ── Subject gone ─────────────────────────────────────────────────────────
  describe('subject gone (inventory loaded, subject not found)', () => {
    beforeEach(() => {
      setInventoryRoute({ subjects: [] });
    });

    it('shows "no longer available" card with correct testID', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-gone'));
    });

    it('shows explanatory text', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText('This subject is no longer available'),
      );
    });

    it('navigates to progress list when gone-back button pressed', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('progress-subject-gone-back'));
      fireEvent.press(screen.getByTestId('progress-subject-gone-back'));
      expect(mockRouterFns.replace).toHaveBeenCalledWith('/(app)/progress');
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
      setInventoryRoute({ subjects: [languageSubject] });
      setCefrProgressRoute(milestoneData);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('cefr-milestone-card'));
    });

    it('shows current level and milestone title', async () => {
      setInventoryRoute({ subjects: [languageSubject] });
      setCefrProgressRoute(milestoneData);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText(/A2/));
      screen.getByText(/Everyday conversations/);
    });

    it('shows words and phrases progress counts', async () => {
      setInventoryRoute({ subjects: [languageSubject] });
      setCefrProgressRoute(milestoneData);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('80/150 words'));
      screen.getByText('20/40 phrases');
    });

    it('shows next milestone label when present', async () => {
      setInventoryRoute({ subjects: [languageSubject] });
      setCefrProgressRoute(milestoneData);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText(/Up next: B1/));
    });

    it('shows "Complete a session" prompt when no milestone data yet', async () => {
      setInventoryRoute({ subjects: [languageSubject] });
      setCefrProgressRoute({ currentLevel: 'A1', currentMilestone: null });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText(
          'Complete a session to start tracking your milestone progress.',
        ),
      );
    });

    it('shows CEFR card for general subject when languageProgress is present', async () => {
      // isLanguageSubject = pedagogyMode four_strands OR !!languageProgress
      setCefrProgressRoute(milestoneData);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('cefr-milestone-card'));
    });

    it('shows retry button when language progress query errors', async () => {
      setInventoryRoute({ subjects: [languageSubject] });
      setCefrProgressRoute({}, 500);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByTestId('cefr-milestone-card'));

      const retryBtn = screen.getByTestId('cefr-milestone-retry');

      // Wire up a success response before pressing retry
      setCefrProgressRoute({ currentLevel: 'A1', currentMilestone: null });
      const callsBefore = mockFetch.mock.calls.length;
      fireEvent.press(retryBtn);

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });

  // ── Retention error ──────────────────────────────────────────────────────
  describe('retention error state', () => {
    beforeEach(() => {
      setSubjectProgressRoute({}, 500);
    });

    it('shows retention error card with correct testID', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-retention-error'),
      );
    });

    it('shows retention error heading', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      // Real i18n catalog key progress.subject.retentionTitle = "Memory check"
      await waitFor(() => screen.getByText('Memory check'));
    });

    it('calls subjectProgressQuery.refetch on retry press', async () => {
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-retention-retry'),
      );

      setSubjectProgressRoute(
        { progress: { retentionStatus: 'strong' } },
        200,
      );
      const callsBefore = mockFetch.mock.calls.length;
      fireEvent.press(screen.getByTestId('progress-subject-retention-retry'));

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });

  // ── Retention data (legacy progress) ────────────────────────────────────
  describe('retention data present', () => {
    it('shows adult copy for strong retention', async () => {
      setSubjectProgressRoute({ progress: { retentionStatus: 'strong' } });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Still remembered.'));
    });

    it('shows review suggestion for fading retention', async () => {
      setSubjectProgressRoute({ progress: { retentionStatus: 'fading' } });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByText('Getting fuzzy — a quick review will help.'),
      );
    });

    it('shows extra attention message for weak retention', async () => {
      setSubjectProgressRoute({ progress: { retentionStatus: 'weak' } });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() => screen.getByText('Needs a quick refresh.'));
    });

    it('opens the shelf when the retention card is pressed without a resume target', async () => {
      setSubjectProgressRoute({ progress: { retentionStatus: 'weak' } });
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-retention-card'),
      );
      fireEvent.press(screen.getByTestId('progress-subject-retention-card'));

      expect(mockRouterFns.push).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 's1' },
      });
    });

    it('resumes the subject target when the retention card is pressed and a resume target exists', async () => {
      const target = {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: 'prev-session',
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Continue Fractions',
      };
      setSubjectProgressRoute({ progress: { retentionStatus: 'weak' } });
      setResumeTargetRoute(target);
      const { wrapper } = createScreenWrapper();
      render(<ProgressSubjectScreen />, { wrapper });
      await waitFor(() =>
        screen.getByTestId('progress-subject-retention-card'),
      );
      fireEvent.press(screen.getByTestId('progress-subject-retention-card'));

      expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
        expect.anything(),
        target,
      );
    });
  });
});
