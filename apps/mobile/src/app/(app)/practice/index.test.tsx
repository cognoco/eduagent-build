import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  type RenderScreenResult,
} from '../../../test-utils/screen-render';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

// ─── Boundary mocks (external / native runtime only) ────────────────────────
//
// CONVERTED in this file (now run for REAL against the routed mock fetch +
// ProfileContext supplied by renderScreen): hooks/use-progress
// (useReviewSummary → /progress/review-summary), hooks/use-quiz (useQuizStats
// → /quiz/stats), hooks/use-subjects (useSubjects → /subjects), and
// hooks/use-assessments (useAssessmentEligibleTopics →
// /retention/assessment-eligible). Each is a fetch-only React Query hook; the
// per-test fixtures move into the `routes` map.
//
// KEPT as boundaries: expo-router (native nav container + Redirect),
// react-native-safe-area-context (native insets), lib/theme (native
// ColorScheme), lib/navigation (imports expo-router Router type),
// react-i18next (i18n boundary, real en.json strings via mock-i18n), and
// hooks/use-navigation-contract — it composes useParentProxy (reads
// SecureStore) and is the screen's parent-proxy gating control surface
// (canEnter / isParentProxy are driven per-test here, not via fetch).

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockCanEnterPractice = jest.fn();
let mockCanEnterPracticeValue = true;
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    useLocalSearchParams: () => mockSearchParams,
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{href}</Text>
    ),
  };
});

jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: composes useParentProxy (SecureStore); parent-proxy gating is the test's control surface. requireActual keeps useNavigationDataScopeContract (used by real use-progress) real; only useNavigationContract is overridden. */,
  () => ({
    ...jest.requireActual('../../../hooks/use-navigation-contract'),
    useNavigationContract: () => ({
      // V0 fallback in the screen layouts reads `isParentProxy` when
      // MODE_NAV_V1_ENABLED is off — keep it congruent with mockCanEnterPracticeValue
      // so tests pass under either flag value.
      isParentProxy: !mockCanEnterPracticeValue,
      canEnter: mockCanEnterPractice,
      gates: {},
    }),
  }),
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useTheme: () => ({ colorScheme: 'light' }),
    useThemeColors: () => ({
      textPrimary: '#ffffff',
      textSecondary: '#a0a0a0',
      primary: '#00b4d8',
      border: '#303030',
      surface: '#1e1e1e',
      background: '#faf5ef',
    }),
  }),
);

jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type */,
  () => ({
    ...jest.requireActual('../../../lib/navigation'),
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const PracticeScreen = require('./index').default;

const PROFILE_ID = '990e8400-e29b-41d4-a716-446655440004';
const REVIEW_TOPIC_ID = '11111111-1111-4111-8111-111111111111';
const MATH_SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const ITALIAN_SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
const JAPANESE_SUBJECT_ID = '44444444-4444-4444-8444-444444444444';
const HISTORY_SUBJECT_ID = '55555555-5555-4555-8555-555555555555';
const ARCHIVED_SPANISH_SUBJECT_ID = '66666666-6666-4666-8666-666666666666';
const FIXTURE_NOW = '2026-04-18T12:00:00.000Z';

// ─── Route fixtures ─────────────────────────────────────────────────────────
//
// Real hooks fetch from these endpoints:
//   useReviewSummary            → /progress/review-summary  (ReviewSummary)
//   useQuizStats                → /quiz/stats               (QuizStats[])
//   useSubjects                 → /subjects                 ({ subjects: [] })
//   useAssessmentEligibleTopics → /retention/assessment-eligible ({ topics: [] })

interface PracticeRouteOptions {
  reviewSummary?: unknown;
  quizStats?: unknown[];
  subjects?: unknown[];
  assessmentTopics?: unknown[];
}

function buildRoutes(opts: PracticeRouteOptions = {}): Record<string, unknown> {
  return {
    '/progress/review-summary': opts.reviewSummary ?? {
      totalOverdue: 2,
      nextReviewTopic: {
        topicId: REVIEW_TOPIC_ID,
        subjectId: MATH_SUBJECT_ID,
        subjectName: 'Math',
        topicTitle: 'Algebra',
      },
      nextUpcomingReviewAt: null,
    },
    '/quiz/stats': opts.quizStats ?? [],
    '/subjects': {
      subjects: opts.subjects ?? [
        {
          id: ITALIAN_SUBJECT_ID,
          profileId: PROFILE_ID,
          name: 'Italian',
          pedagogyMode: 'four_strands',
          languageCode: 'it',
          status: 'active',
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
      ],
    },
    '/retention/assessment-eligible': {
      topics: opts.assessmentTopics ?? [
        {
          topicId: REVIEW_TOPIC_ID,
          subjectId: MATH_SUBJECT_ID,
          subjectName: 'Math',
          topicTitle: 'Algebra',
          topicDescription: 'Variables, expressions, and equations',
          pedagogyMode: 'socratic',
          languageCode: null,
          lastStudiedAt: FIXTURE_NOW,
        },
      ],
    },
  };
}

let active: RenderScreenResult | null = null;

function mount(opts: PracticeRouteOptions = {}): RenderScreenResult {
  active = renderScreen(<PracticeScreen />, {
    profile: 'soloLearner',
    routes: buildRoutes(opts),
  });
  return active;
}

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockCanEnterPracticeValue = true;
    mockCanEnterPractice.mockReturnValue(true);
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-04-18T12:00:00.000Z').getTime());
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    jest.restoreAllMocks();
  });

  it('frames the hub as a test-yourself surface', async () => {
    mount();

    await waitFor(() => {
      screen.getByText('Italian basics');
    });
    screen.getByText('Test yourself');
    screen.getByText('Pick a quick win. Every round helps your memory stick.');
    screen.getByText("Today's review");
    screen.getByText('Knowledge check');
    screen.getByText('Quick quiz');
    screen.getByText('Capitals');
    screen.getByText("Who's who");
    screen.getByText('Recite from memory');
    screen.getByText('Beta');
    screen.getByText('Dictation');
    screen.getByText('Quiz history');
  });

  it('routes the back button to home', async () => {
    mount();
    await waitFor(() => screen.getByTestId('practice-back'));

    fireEvent.press(screen.getByTestId('practice-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home',
    );
  });

  it('routes the back button to the learner home view when launched from learner home', async () => {
    mockSearchParams = { returnTo: 'learner-home' };

    mount();
    await waitFor(() => screen.getByTestId('practice-back'));

    fireEvent.press(screen.getByTestId('practice-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home',
    );
  });

  it('routes the back button to Journal when launched from the Journal practice section', async () => {
    mockSearchParams = { returnTo: 'journal' };

    mount();
    await waitFor(() => screen.getByTestId('practice-back'));

    fireEvent.press(screen.getByTestId('practice-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/journal');
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('navigates to the relearn picker when review topics are available', async () => {
    mount();
    await waitFor(() => screen.getByTestId('practice-review'));

    fireEvent.press(screen.getByTestId('practice-review'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: { returnTo: 'practice' },
    });
  });

  it('marks practice as the return target when opening relearn from practice', async () => {
    mockSearchParams = { returnTo: 'learner-home' };

    mount();
    await waitFor(() => screen.getByTestId('practice-review'));

    fireEvent.press(screen.getByTestId('practice-review'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        returnTo: 'practice',
      },
    });
  });

  it('shows the empty-state block without a tap when nothing is overdue', async () => {
    mount({
      reviewSummary: {
        totalOverdue: 0,
        nextReviewTopic: null,
        nextUpcomingReviewAt: '2026-04-18T15:00:00.000Z',
      },
    });

    await waitFor(() => {
      screen.getByTestId('review-empty-state');
    });
    screen.getAllByText('All caught up');
    screen.getByText('Your next review is in 3 hours');
  });

  describe('review-empty browse CTA destination [WI-2219]', () => {
    let originalV2: boolean;

    beforeEach(() => {
      originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    });

    afterEach(() => {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    });

    it('lets the learner browse topics from the empty state, going to library when V2 nav is off', async () => {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        false;
      mount({
        reviewSummary: {
          totalOverdue: 0,
          nextReviewTopic: null,
          nextUpcomingReviewAt: null,
        },
      });

      await waitFor(() => screen.getByTestId('review-empty-browse'));
      fireEvent.press(screen.getByTestId('review-empty-browse'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    });

    it('lets the learner browse topics from the empty state, going to V2 Subjects when V2 nav is on', async () => {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        true;
      mount({
        reviewSummary: {
          totalOverdue: 0,
          nextReviewTopic: null,
          nextUpcomingReviewAt: null,
        },
      });

      await waitFor(() => screen.getByTestId('review-empty-browse'));
      fireEvent.press(screen.getByTestId('review-empty-browse'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/subjects');
    });
  });

  it('shows quiz XP in the header and quick quiz cue before any XP is earned', async () => {
    mount();

    await waitFor(() => screen.getByTestId('practice-quiz-xp'));
    // XP appears in both the header pill and the quiz card; target by testID
    expect(
      screen
        .getByTestId('practice-xp-header')
        .findByProps({ children: '0 XP' }),
    ).toBeTruthy();
    expect(
      screen.getByTestId('practice-quiz-xp').findByProps({ children: '0 XP' }),
    ).toBeTruthy();
    screen.getByText('Test yourself with multiple choice questions · 0 XP');
  });

  it('navigates to the assessment picker when assessment topics are available', async () => {
    mount();
    await waitFor(() => screen.getByTestId('practice-assessment'));

    fireEvent.press(screen.getByTestId('practice-assessment'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/practice/assessment-picker');
  });

  it('hides the assessment action and keeps unlock guidance when no topics are ready', async () => {
    mount({ subjects: [], assessmentTopics: [] });

    await waitFor(() => {
      screen.getByText('Available after you finish a topic');
    });
    screen.getByTestId('practice-assessment-locked-hint');
    expect(screen.queryByTestId('practice-assessment')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('hides the assessment action with active-subject unlock guidance', async () => {
    mount({ assessmentTopics: [] });

    await waitFor(() => {
      screen.getByText('Study Italian first to unlock this');
    });
    screen.getByTestId('practice-assessment-locked-hint');
    expect(screen.queryByTestId('practice-assessment')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[WI-2191] has no quick-quiz button ancestor containing Capitals or Guess Who buttons', async () => {
    mount();
    await waitFor(() => screen.getByTestId('practice-quiz'));

    const quizAction = screen.getByTestId('practice-quiz');
    const nestedQuizButtons = quizAction
      .findAll(
        (node: { props?: Record<string, unknown> }) =>
          node.props?.accessibilityRole === 'button' &&
          typeof node.props?.testID === 'string' &&
          node.props.testID !== 'practice-quiz',
      )
      .map(
        (node: { props?: Record<string, unknown> }) =>
          node.props?.testID as string,
      );

    expect([...new Set(nestedQuizButtons)]).toEqual([]);
  });

  it('[WI-2191] exposes a labelled group with three separate actions in logical read order', async () => {
    mount();
    await waitFor(() => screen.getByTestId('practice-quiz-group'));

    const quizGroup = screen.getByTestId('practice-quiz-group');
    const quizActionOrder = quizGroup
      .findAll(
        (node: { props?: Record<string, unknown> }) =>
          node.props?.accessibilityRole === 'button' &&
          typeof node.props?.testID === 'string',
      )
      .map(
        (node: { props?: Record<string, unknown> }) =>
          node.props?.testID as string,
      );

    expect(quizGroup.props.role).toBe('group');
    expect(quizGroup.props.accessibilityLabel).toBe('Quick quiz');
    expect([...new Set(quizActionOrder)]).toEqual([
      'practice-quiz',
      'practice-quiz-capitals',
      'practice-quiz-guess-who',
    ]);
  });

  it.each([
    {
      testID: 'practice-quiz',
      expectedRoute: {
        pathname: '/(app)/quiz',
        params: { returnTo: 'practice' },
      },
    },
    {
      testID: 'practice-quiz-capitals',
      expectedRoute: {
        pathname: '/(app)/quiz/launch',
        params: { activityType: 'capitals', returnTo: 'practice' },
      },
    },
    {
      testID: 'practice-quiz-guess-who',
      expectedRoute: {
        pathname: '/(app)/quiz/launch',
        params: { activityType: 'guess_who', returnTo: 'practice' },
      },
    },
  ])(
    '[WI-2191] native accessibility activation of $testID launches only its chosen route once',
    async ({ testID, expectedRoute }) => {
      mount();
      await waitFor(() => screen.getByTestId(testID));

      fireEvent.press(screen.getByTestId(testID));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(expectedRoute);
    },
  );

  it('routes vocabulary, recitation, dictation, and quiz history to their flows', async () => {
    mount();
    await waitFor(() =>
      screen.getByTestId(`practice-vocabulary-${ITALIAN_SUBJECT_ID}`),
    );

    fireEvent.press(
      screen.getByTestId(`practice-vocabulary-${ITALIAN_SUBJECT_ID}`),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/launch',
      params: {
        activityType: 'vocabulary',
        subjectId: ITALIAN_SUBJECT_ID,
        languageName: 'Italian',
        returnTo: 'practice',
      },
    });

    fireEvent.press(screen.getByTestId('practice-recitation'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'recitation', returnTo: 'practice' },
    });

    fireEvent.press(screen.getByTestId('practice-dictation'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/dictation',
      params: { returnTo: 'practice' },
    });

    fireEvent.press(screen.getByTestId('practice-quiz-history'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/history',
      params: { returnTo: 'practice' },
    });
  });

  it('renders and routes a vocabulary quiz for every active language subject', async () => {
    mount({
      subjects: [
        {
          id: ITALIAN_SUBJECT_ID,
          profileId: PROFILE_ID,
          name: 'Italian',
          pedagogyMode: 'four_strands',
          languageCode: 'it',
          status: 'active',
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
        {
          id: JAPANESE_SUBJECT_ID,
          profileId: PROFILE_ID,
          name: 'Japanese',
          pedagogyMode: 'four_strands',
          languageCode: 'ja',
          status: 'active',
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
        {
          id: HISTORY_SUBJECT_ID,
          profileId: PROFILE_ID,
          name: 'History',
          pedagogyMode: 'socratic',
          languageCode: null,
          status: 'active',
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
        {
          id: ARCHIVED_SPANISH_SUBJECT_ID,
          profileId: PROFILE_ID,
          name: 'Spanish',
          pedagogyMode: 'four_strands',
          languageCode: 'es',
          status: 'archived',
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
      ],
    });

    await waitFor(() => {
      screen.getByText('Italian basics');
    });
    screen.getByText('Japanese basics');
    expect(
      screen.queryByTestId(`practice-vocabulary-${HISTORY_SUBJECT_ID}`),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        `practice-vocabulary-${ARCHIVED_SPANISH_SUBJECT_ID}`,
      ),
    ).toBeNull();

    fireEvent.press(
      screen.getByTestId(`practice-vocabulary-${ITALIAN_SUBJECT_ID}`),
    );
    fireEvent.press(
      screen.getByTestId(`practice-vocabulary-${JAPANESE_SUBJECT_ID}`),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/launch',
      params: {
        activityType: 'vocabulary',
        subjectId: ITALIAN_SUBJECT_ID,
        languageName: 'Italian',
        returnTo: 'practice',
      },
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/launch',
      params: {
        activityType: 'vocabulary',
        subjectId: JAPANESE_SUBJECT_ID,
        languageName: 'Japanese',
        returnTo: 'practice',
      },
    });
  });

  it('shows per-option quiz cues from activity stats', async () => {
    mount({
      quizStats: [
        {
          activityType: 'capitals',
          languageCode: null,
          roundsPlayed: 3,
          bestScore: 4,
          bestTotal: 5,
          totalXp: 120,
        },
        {
          activityType: 'guess_who',
          languageCode: null,
          roundsPlayed: 2,
          bestScore: null,
          bestTotal: null,
          totalXp: 80,
        },
      ],
    });

    await waitFor(() => {
      screen.getByText('Best 4/5');
    });
    screen.getByText('Played 2');
    // 200 XP appears in both header pill and quiz card; target the quiz card chip
    expect(
      screen
        .getByTestId('practice-quiz-xp')
        .findByProps({ children: '200 XP' }),
    ).toBeTruthy();
  });

  it('places recitation and dictation after the main review and test actions', async () => {
    const view = mount();
    await waitFor(() =>
      screen.getByTestId(`practice-vocabulary-${ITALIAN_SUBJECT_ID}`),
    );

    // node is typed as ReactTestInstance (from react-test-renderer which ships no
    // .d.ts in v19), so the predicate parameter is effectively `any`. Explicit
    // structural annotation silences noImplicitAny without using `any` directly.
    type RNTestNode = { props?: Record<string, unknown> };
    const cardOrder = view.result.UNSAFE_root.findAll(
      (node: RNTestNode) =>
        typeof node.props?.testID === 'string' &&
        (node.props.testID as string).startsWith('practice-') &&
        !(node.props.testID as string).includes('-icon') &&
        !(node.props.testID as string).includes('-chevron'),
    )
      .map((node: RNTestNode) => node.props?.testID as string)
      .filter((testID: string) =>
        [
          'practice-review',
          'practice-assessment',
          'practice-quiz',
          `practice-vocabulary-${ITALIAN_SUBJECT_ID}`,
          'practice-recitation',
          'practice-dictation',
          'practice-quiz-history',
        ].includes(testID),
      );
    const uniqueCardOrder = [...new Set(cardOrder)];

    expect(uniqueCardOrder).toEqual([
      'practice-review',
      'practice-assessment',
      'practice-quiz',
      `practice-vocabulary-${ITALIAN_SUBJECT_ID}`,
      'practice-dictation',
      'practice-recitation',
      'practice-quiz-history',
    ]);
  });

  it('renders quiz history as a quiet recent-progress row', async () => {
    mount();
    await waitFor(() => screen.getByTestId('practice-quiz-history'));

    const quizHistoryRow = screen.getByTestId('practice-quiz-history');
    expect(quizHistoryRow.props.className).toContain('min-h-[56px]');
    screen.getByText('No rounds yet');
  });

  it('redirects to home when in parent proxy session', () => {
    mockCanEnterPracticeValue = false;
    mockCanEnterPractice.mockReturnValue(false);

    mount();

    expect(screen.getByTestId('redirect').props.children).toBe('/(app)/home');
  });
});
