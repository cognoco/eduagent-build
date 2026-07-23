import { AccessibilityInfo, Dimensions, Platform } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type {
  NowCard,
  NowResponse,
  ScopeDescriptor,
  SharedRecord,
} from '@eduagent/schemas';
import { MENTOR_CAPABILITY_CASES } from '@eduagent/test-utils';

import {
  ERROR_RESPONSES,
  NAMED_PROFILES,
  renderScreen,
  type RenderScreenOptions,
} from '../../test-utils/screen-render';

// [WI-2498] useNowFeed now reads the authenticated actor id (Clerk userId) to
// bind the persisted Now-feed cache to actor+profile+policy. External-boundary
// mock (bare specifier), matching the pattern in use-subscription.test.ts.
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({
    userId: 'wi2498-test-actor',
    getToken: jest.fn().mockResolvedValue('test-token'),
  }),
}));

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';
const ORIGINAL_E2E_FLAG = process.env.EXPO_PUBLIC_E2E;
const mockPush = jest.fn();
const mockNowRefetch = jest.fn();
let mockFocusCallback: (() => void | (() => void)) | undefined;
const LEARNER_CAPABILITY_CASES = MENTOR_CAPABILITY_CASES.filter(
  ({ scope }) => scope === 'learner',
);
const WRONG_SCOPE_CAPABILITY_CASES = MENTOR_CAPABILITY_CASES.filter(
  ({ scope }) => scope === 'person',
);
const unsupportedRouteCase = MENTOR_CAPABILITY_CASES.find(
  ({ capability }) => capability === 'unsupported-route',
);

if (!unsupportedRouteCase || unsupportedRouteCase.expectedRawInput === null) {
  throw new Error('Shared Mentor unsupported-route case is incomplete');
}

let cleanupRender: (() => void) | undefined;
let mockNowFeed: {
  data: NowResponse | undefined;
  fallbackFeed: NowResponse | null;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isSlowFallback: boolean;
  refetch: jest.Mock;
  // [WI-2504 bounce 2] Only set by tests exercising the epoch-bound
  // post-mutation navigation guard; other tests leave it undefined.
  observedEpoch?: string;
};
let mockSubjects: Array<{
  subjectId: string;
  subjectName: string;
  status: 'active';
}>;
let mockScopeContext: {
  activeScope: { kind: 'me' } | { kind: 'supporter-hub' } | PersonScope;
  availableScopes: PersonScope[];
  setActiveScope: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocusCallback = callback;
  },
}));

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: real hooks start profile-scoped API queries and native cache timers; this route test injects feed, error, and overflow states without those effects */,
  () => {
    const actual = jest.requireActual(
      '../../hooks/use-now-feed',
    ) as typeof import('../../hooks/use-now-feed');
    return {
      ...actual,
      useNowFeed: () => mockNowFeed,
      useNowOverflow: () => ({ data: undefined, isLoading: false }),
    };
  },
);

jest.mock(
  '../../hooks/use-subjects-index' /* gc1-allow: real hook aggregates three asynchronous subject, library, and progress queries; this route test needs a deterministic name index without those API calls */,
  () => {
    const actual = jest.requireActual(
      '../../hooks/use-subjects-index',
    ) as typeof import('../../hooks/use-subjects-index');
    return {
      ...actual,
      useSubjectsIndex: () => ({
        subjects: mockSubjects,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      }),
    };
  },
);

jest.mock(
  '../../lib/scope-context' /* gc1-allow: real hook throws without its provider and resolves persisted scope asynchronously; this dispatch test injects me, supporter-hub, and person scope states directly */,
  () => {
    const actual = jest.requireActual(
      '../../lib/scope-context',
    ) as typeof import('../../lib/scope-context');
    return {
      ...actual,
      useScopeContext: () => mockScopeContext,
    };
  },
);

const MentorScreen = require('./mentor').default;

const SHARED_RECORD: SharedRecord = {
  supportershipId: EDGE_ID,
  generatedAt: '2026-06-30T12:00:00.000Z',
  factIds: ['fact-1'],
  supporterView: {
    audience: 'supporter',
    factIds: ['fact-1'],
    headline: 'Emma has 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
  supporteeView: {
    audience: 'supportee',
    factIds: ['fact-1'],
    headline: 'Your supporter can see 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
};

function card(overrides: Partial<NowCard> = {}): NowCard {
  return {
    kind: 'unfinished_session',
    templateKey: 'now.unfinished_session.default',
    params: { topicTitle: 'Fractions' },
    deepLink: {
      route: 'session.resume',
      params: { sessionId: 'session-1' },
      chain: [],
    },
    scope: 'self',
    ...overrides,
  };
}

function feed(cards: NowCard[], overflowCount = 0): NowResponse {
  return {
    scope: 'self',
    cards,
    overflowCount,
    generatedAt: '2026-06-14T00:00:00.000Z',
  };
}

function firstCallOrder(mockFn: jest.Mock): number {
  const order = mockFn.mock.invocationCallOrder[0];
  if (order === undefined) {
    throw new Error('expected mock to have been called');
  }
  return order;
}

function renderMentorScreen(
  profileOverrides: Pick<RenderScreenOptions, 'profile' | 'profiles'> = {},
  extraRoutes: RenderScreenOptions['routes'] = {},
) {
  const rendered = renderScreen(<MentorScreen />, {
    routes: {
      [`/visibility/reports/${PERSON_ID}/shared-record`]: SHARED_RECORD,
      // [WI-2226] SupportHubMentorTab now mounts SupporterColdStart, whose
      // query fires whenever activeScope.kind === 'supporter-hub'. Default
      // to the empty per-child fixture (renders nothing) so mounting it
      // doesn't change any assertion in this file, which isn't testing the
      // cold-start doorway itself (see SupportHubMentorTab.test.tsx).
      '/scopes/coldstart': {
        variant: 'per-child',
        cards: [],
        selfLearningDoorway: true,
      },
      ...extraRoutes,
    },
    ...profileOverrides,
  });
  cleanupRender = rendered.cleanup;
  return rendered;
}

function expectFreeformRoute(rawInput: string): void {
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(app)/session',
    params: {
      entrySource: 'mentor',
      returnTo: 'mentor',
      mode: 'freeform',
      rawInput,
    },
  });
}

function expectVisibleClarification(input?: string): void {
  const clarification = screen.getByTestId('mentor-bar-clarification');
  within(clarification).getByText('What exactly do you want to learn?');
  if (input) {
    within(clarification).getByText(input);
  }
  expect(clarification.props.accessibilityLiveRegion).toBe('polite');
}

describe('MentorScreen', () => {
  afterEach(() => {
    cleanupRender?.();
    cleanupRender = undefined;
    if (ORIGINAL_E2E_FLAG === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = ORIGINAL_E2E_FLAG;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallback = undefined;
    mockSubjects = [
      {
        subjectId: 'subject-0',
        subjectName: 'Mathematics',
        status: 'active',
      },
    ];
    mockNowFeed = {
      data: feed([card()]),
      fallbackFeed: null,
      isLoading: false,
      isError: false,
      isFetching: false,
      isSlowFallback: false,
      refetch: mockNowRefetch,
    };
    mockScopeContext = {
      activeScope: { kind: 'me' },
      availableScopes: [
        {
          kind: 'person',
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        },
      ],
      setActiveScope: jest.fn(),
    };
  });

  it('[WI-2113 AC-1] does not inject a Challenge during idle time and accepts it on the next focus boundary', async () => {
    const start = new Date('2026-07-20T12:00:00.000Z').getTime();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(start);
    const initial = feed([card()]);
    const challenge = card({
      kind: 'challenge_ready',
      templateKey: 'now.challenge_ready.default',
      deepLink: {
        route: 'challenge.start',
        params: { subjectId: 'subject-1', topicId: 'topic-1' },
        chain: [],
      },
    });
    mockNowFeed = { ...mockNowFeed, data: initial };

    try {
      const rendered = renderMentorScreen();
      expect(screen.queryByTestId('now-card-challenge_ready')).toBeNull();

      nowSpy.mockReturnValue(start + 3 * 60 * 1000);
      mockNowFeed = {
        ...mockNowFeed,
        data: feed([card(), challenge]),
      };
      rendered.result.rerender(<MentorScreen />);

      expect(screen.queryByTestId('now-card-challenge_ready')).toBeNull();

      mockNowRefetch.mockResolvedValueOnce({ data: mockNowFeed.data });
      await act(async () => {
        mockFocusCallback?.();
        await Promise.resolve();
      });

      screen.getByTestId('now-card-challenge_ready');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('[WI-2113 AC-3] keeps a mid-scroll refetch from inserting a new card', async () => {
    const rendered = renderMentorScreen();
    const challenge = card({
      kind: 'challenge_ready',
      templateKey: 'now.challenge_ready.default',
      deepLink: {
        route: 'challenge.start',
        params: { subjectId: 'subject-1', topicId: 'topic-1' },
        chain: [],
      },
    });
    const refreshed = feed([card(), challenge]);
    mockNowRefetch.mockResolvedValueOnce({ data: refreshed });

    await act(async () => {
      const result = await mockNowFeed.refetch();
      mockNowFeed = { ...mockNowFeed, data: result.data };
      rendered.result.rerender(<MentorScreen />);
    });

    expect(screen.queryByTestId('now-card-challenge_ready')).toBeNull();
  });

  it('renders the feed stack, on-track badge, and inline ask affordances', () => {
    renderMentorScreen();

    screen.getByTestId('mentor-screen');
    screen.getByTestId('now-card-stack');
    screen.getByTestId('mentor-on-track-badge');
    // Ask box is now inline in the scroll area (moved up from a bottom bar).
    screen.getByTestId('mentor-input-bar');
    screen.getByTestId('mentor-bar-camera');
    screen.getByTestId('mentor-bar-homework-chip');
    screen.getByTestId('mentor-bar-mic');
  });

  it('routes the E2E homework chip directly to manual entry with the active subject', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    renderMentorScreen();

    fireEvent.press(screen.getByTestId('mentor-bar-homework-chip'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/homework/manual',
      params: {
        entrySource: 'mentor',
        returnTo: 'mentor',
        subjectId: 'subject-0',
        subjectName: 'Mathematics',
      },
    });
  });

  it('keeps the camera affordance on the device-QA route in E2E builds', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    renderMentorScreen();

    fireEvent.press(screen.getByTestId('mentor-bar-camera'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/homework/camera',
      params: { entrySource: 'mentor', returnTo: 'mentor' },
    });
  });

  it('retains the camera route for the homework chip outside E2E builds', () => {
    process.env.EXPO_PUBLIC_E2E = 'false';
    renderMentorScreen();

    fireEvent.press(screen.getByTestId('mentor-bar-homework-chip'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/homework/camera',
      params: { entrySource: 'mentor', returnTo: 'mentor' },
    });
  });

  it('shows the ask box and light practice instead of a dead-end on an empty feed', () => {
    // Real first state (a subject exists) but the now-feed is empty: the old
    // build showed a "Nothing needs you / Browse" card whose tap did nothing.
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([]),
    };

    renderMentorScreen();

    expect(screen.queryByTestId('now-empty-card')).toBeNull();
    expect(screen.queryByTestId('now-card-stack')).toBeNull();
    screen.getByTestId('mentor-input-bar');
    screen.getByTestId('mentor-light-practice');
  });

  it('renders the Support hub Mentor variant without loading the Me feed', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };

    renderMentorScreen();

    screen.getByTestId('support-hub-mentor-tab');
    expect(screen.queryByTestId('mentor-screen')).toBeNull();
  });

  // [WI-2223 AC-1] activating a support.hub pointer must select the
  // Support-hub scope BEFORE the Mentor tab opens, or the learner Mentor
  // surface renders instead (activeScope is otherwise unchanged by the push).
  it('[WI-2223] AC-1: selects the Support-hub scope before pushing a support.hub-linked card', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([
        card({ deepLink: { route: 'support.hub', params: {}, chain: [] } }),
      ]),
    };

    renderMentorScreen();

    fireEvent.press(screen.getByTestId('now-card-continue'));

    expect(mockScopeContext.setActiveScope).toHaveBeenCalledWith({
      kind: 'supporter-hub',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/mentor');
    expect(firstCallOrder(mockScopeContext.setActiveScope)).toBeLessThan(
      firstCallOrder(mockPush),
    );
  });

  // [WI-2223 AC-3] the Support-hub Mentor surface and the Me Mentor surface
  // are mutually exclusive — returning to Me scope never carries Support-hub
  // content along (no duplication of support content into the Me scope).
  it('[WI-2223] AC-3: the Me scope render carries no Support-hub content after a Support-hub render', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };
    renderMentorScreen();
    screen.getByTestId('support-hub-mentor-tab');
    expect(screen.queryByTestId('mentor-screen')).toBeNull();
    cleanupRender?.();

    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'me' },
    };
    renderMentorScreen();

    screen.getByTestId('mentor-screen');
    expect(screen.queryByTestId('support-hub-mentor-tab')).toBeNull();
  });

  it('routes Support hub cockpit actions through the selected person scope', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };
    const emmaScope = mockScopeContext.availableScopes[0]!;

    renderMentorScreen();

    fireEvent.press(
      screen.getByTestId(`support-hub-mentor-open-${emmaScope.personId}`),
    );
    expect(mockScopeContext.setActiveScope).toHaveBeenCalledWith(emmaScope);

    fireEvent.press(
      screen.getByTestId(`support-hub-subjects-open-${emmaScope.personId}`),
    );
    expect(mockScopeContext.setActiveScope).toHaveBeenCalledWith(emmaScope);
    expect(mockPush).toHaveBeenCalledWith('/(app)/subjects');

    fireEvent.press(
      screen.getByTestId(`support-hub-journal-open-${emmaScope.personId}`),
    );
    expect(mockScopeContext.setActiveScope).toHaveBeenCalledWith(emmaScope);
    expect(mockPush).toHaveBeenCalledWith('/(app)/journal');
  });

  it.each(WRONG_SCOPE_CAPABILITY_CASES)(
    '$id denies learner Mentor dispatch in person scope',
    (capabilityCase) => {
      mockScopeContext = {
        ...mockScopeContext,
        activeScope: {
          kind: 'person',
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        },
      };

      renderMentorScreen();

      expect(capabilityCase.expectedRoute.kind).toBe('none');
      screen.getByTestId('person-scope-mentor-tab');
      expect(screen.getAllByText('Emma').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('mentor-screen')).toBeNull();
      expect(screen.queryByTestId('mentor-bar-input')).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('surfaces the school-day-evening homework highlight above the feed, tappable to camera [T11]', () => {
    jest.useFakeTimers();
    // 2026-06-15 is a Monday; 18:00 local = weekday evening.
    jest.setSystemTime(new Date(2026, 5, 15, 18, 0, 0));
    try {
      renderMentorScreen();

      const prompt = screen.getByTestId('mentor-homework-prompt');
      fireEvent.press(prompt);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/homework/camera',
        params: { entrySource: 'mentor', returnTo: 'mentor' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('hides the homework highlight on a weekend [T11]', () => {
    jest.useFakeTimers();
    // 2026-06-13 is a Saturday afternoon.
    jest.setSystemTime(new Date(2026, 5, 13, 15, 0, 0));
    try {
      renderMentorScreen();
      expect(screen.queryByTestId('mentor-homework-prompt')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders ColdStartCard in the anchor slot for a profile with no first real state', () => {
    mockSubjects = [];
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([]),
    };

    renderMentorScreen();

    screen.getByTestId('mentor-cold-start-card');
    expect(screen.queryByTestId('now-card-stack')).toBeNull();
  });

  it('cold-start pedagogical literal ID routes exact input through the shared freeform boundary', () => {
    mockSubjects = [];
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([]),
    };
    renderMentorScreen();

    fireEvent.changeText(
      screen.getByTestId('cold-start-input'),
      'show me how subject subject-123 works',
    );
    fireEvent.press(screen.getByTestId('cold-start-send'));

    expectFreeformRoute('show me how subject subject-123 works');
  });

  it.each(LEARNER_CAPABILITY_CASES)(
    '$id drives the learner-scope capability boundary',
    (capabilityCase) => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        capabilityCase.input,
      );
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      if (capabilityCase.expectedRoute.kind === 'path') {
        expect(mockPush).toHaveBeenCalledWith(
          capabilityCase.expectedRoute.href,
        );
        return;
      }
      if (capabilityCase.expectedRoute.kind === 'session') {
        expect(mockPush).toHaveBeenCalledWith({
          pathname: capabilityCase.expectedRoute.pathname,
          params: {
            ...capabilityCase.expectedRoute.params,
            rawInput: capabilityCase.expectedRawInput,
          },
        });
        return;
      }

      expectVisibleClarification(capabilityCase.expectedRawInput ?? undefined);
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('closed-catalog-jump — pushes deterministic route phrases through the closed mapper', () => {
    renderMentorScreen();

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'open subject spanish',
    );
    fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

    expect(mockPush).toHaveBeenCalledWith('/(app)/subject-hub/spanish');
  });

  it('closed-catalog-named-subject-jump — routes a confident named subject to its hub', () => {
    mockSubjects = [
      {
        subjectId: 'subject-maths',
        subjectName: 'Maths',
        status: 'active',
      },
    ];
    renderMentorScreen();

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'resume my maths learning',
    );
    fireEvent.press(screen.getByTestId('mentor-bar-send'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/subject-hub/subject-maths');
  });

  describe('all submit mechanisms', () => {
    it('declarative-would-like-neon — arrow press preserves exact freeform route params', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'I would like to learn about neon',
      );
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      expectFreeformRoute('I would like to learn about neon');
    });

    it('declarative-teach-neon — keyboard submit preserves exact freeform route params', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'Teach me about neon',
      );
      fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

      expectFreeformRoute('Teach me about neon');
    });

    it('declarative-learn-more — routes exact raw input to freeform', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'I want to learn more about neon',
      );
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      expectFreeformRoute('I want to learn more about neon');
    });

    it('question-more — routes exact raw input to freeform', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'what should I learn more about?',
      );
      fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

      expectFreeformRoute('what should I learn more about?');
    });

    it('pedagogical-show-how-photosynthesis — routes exact raw input to freeform', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'show me how photosynthesis works',
      );
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      expectFreeformRoute('show me how photosynthesis works');
    });

    it('pedagogical-literal-id — routes exact raw input to freeform before literal extraction', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'show me how subject subject-123 works',
      );
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      expectFreeformRoute('show me how subject subject-123 works');
    });

    it('literal-question-unchanged — preserves exact question raw input before literal extraction', () => {
      renderMentorScreen();

      fireEvent.changeText(
        screen.getByTestId('mentor-bar-input'),
        'should I open subject spanish?',
      );
      fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

      expectFreeformRoute('should I open subject spanish?');
    });
  });

  it('editing then submit routes the latest text instead of the initial draft', () => {
    renderMentorScreen();

    const input = screen.getByTestId('mentor-bar-input');
    fireEvent.changeText(input, 'Teach me about argon');
    fireEvent.changeText(input, 'Teach me about neon');
    fireEvent.press(screen.getByTestId('mentor-bar-send'));

    expectFreeformRoute('Teach me about neon');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ rawInput: 'Teach me about argon' }),
      }),
    );
  });

  it('question-unchanged — carries the exact question into the freeform session [T25]', () => {
    renderMentorScreen();

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'what is photosynthesis?',
    );
    fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

    expectFreeformRoute('what is photosynthesis?');
  });

  it('ambiguous-progress — reveals clarification instead of silently doing nothing', () => {
    renderMentorScreen();

    expect(screen.queryByTestId('mentor-bar-clarification')).toBeNull();
    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'show my progress',
    );
    fireEvent.press(screen.getByTestId('mentor-bar-send'));

    expectVisibleClarification();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    'progress report',
    'journal entries',
    'subjects list',
    'show subject list',
  ])(
    'unsupported destination "%s" reveals clarification instead of starting Mentor',
    (input) => {
      renderMentorScreen();

      fireEvent.changeText(screen.getByTestId('mentor-bar-input'), input);
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      expectVisibleClarification(input);
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('consecutive-uncertain-refresh — visibly refreshes clarification for the second command', () => {
    renderMentorScreen();

    const input = screen.getByTestId('mentor-bar-input');
    const send = screen.getByTestId('mentor-bar-send');
    fireEvent.changeText(input, 'show my progress');
    fireEvent.press(send);
    expectVisibleClarification('show my progress');

    fireEvent.changeText(input, unsupportedRouteCase.input);
    fireEvent.press(send);

    const refreshed = screen.getByTestId('mentor-bar-clarification');
    within(refreshed).getByText(unsupportedRouteCase.expectedRawInput);
    expect(within(refreshed).queryByText('show my progress')).toBeNull();
    expect(refreshed.props.accessibilityLiveRegion).toBe('polite');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('identical-uncertain-repeat-visible — visibly changes the clarification after the same command is submitted twice', () => {
    renderMentorScreen();

    const input = screen.getByTestId('mentor-bar-input');
    const send = screen.getByTestId('mentor-bar-send');
    fireEvent.changeText(input, 'show my progress');
    fireEvent.press(send);

    let clarification = screen.getByTestId('mentor-bar-clarification');
    expect(within(clarification).queryByText('Try Again')).toBeNull();

    fireEvent.changeText(input, 'show my progress');
    fireEvent.press(send);

    clarification = screen.getByTestId('mentor-bar-clarification');
    within(clarification).getByText('Try Again');
    within(clarification).getByText('show my progress');
    expect(clarification.props.accessibilityLiveRegion).toBe('polite');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('announces every clarification revision explicitly on iOS without announcing the initial empty state', () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      renderMentorScreen();
      expect(announce).not.toHaveBeenCalled();

      const input = screen.getByTestId('mentor-bar-input');
      const send = screen.getByTestId('mentor-bar-send');
      fireEvent.changeText(input, 'show my progress');
      fireEvent.press(send);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenLastCalledWith(
        'What exactly do you want to learn? show my progress',
      );

      fireEvent.changeText(input, 'show my progress');
      fireEvent.press(send);
      expect(announce).toHaveBeenCalledTimes(2);
      expect(announce).toHaveBeenLastCalledWith(
        'Try Again What exactly do you want to learn? show my progress',
      );
      within(screen.getByTestId('mentor-bar-clarification')).getByText(
        'Try Again',
      );
    } finally {
      announce.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  });

  it('keeps Android clarification on the polite live-region path without an explicit announcement', () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      renderMentorScreen();

      const input = screen.getByTestId('mentor-bar-input');
      const send = screen.getByTestId('mentor-bar-send');
      fireEvent.changeText(input, 'show my progress');
      fireEvent.press(send);
      expectVisibleClarification('show my progress');

      fireEvent.changeText(input, unsupportedRouteCase.input);
      fireEvent.press(send);
      expectVisibleClarification(unsupportedRouteCase.expectedRawInput);

      expect(announce).not.toHaveBeenCalled();
    } finally {
      announce.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  });

  it.each(['open dashboard'])(
    '%s takes the explicit clarification path',
    (input) => {
      renderMentorScreen();

      fireEvent.changeText(screen.getByTestId('mentor-bar-input'), input);
      fireEvent.press(screen.getByTestId('mentor-bar-send'));

      expectVisibleClarification();
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('small-screen-360 — keeps the ask action interactive inside the scroll container', () => {
    const dimensions = jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 360,
      height: 720,
      scale: 2,
      fontScale: 1,
    });
    try {
      renderMentorScreen();

      const scroll = screen.getByTestId('mentor-scroll');
      const input = within(scroll).getByTestId('mentor-bar-input');
      const send = within(scroll).getByTestId('mentor-bar-send');
      expect(dimensions).toHaveBeenCalledWith('window');
      expect(scroll.props.contentContainerStyle).toEqual(
        expect.objectContaining({ paddingHorizontal: 12 }),
      );
      expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
      expect(input.props.className).toContain('min-w-0');
      fireEvent.changeText(input, 'Teach me about neon');
      fireEvent.press(send);

      expectFreeformRoute('Teach me about neon');
    } finally {
      dimensions.mockRestore();
    }
  });

  it('[WI-2111 AC-3] keeps action, receipt, and composer order in the small-screen scroll surface', () => {
    const dimensions = jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 360,
      height: 720,
      scale: 2,
      fontScale: 1,
    });
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([
        card({
          kind: 'ledger_moment',
          templateKey: 'now.ledger_moment.session_filed',
          params: { ledgerKind: 'session_filed' },
        }),
        card({ kind: 'unfinished_session' }),
      ]),
    };

    try {
      const rendered = renderMentorScreen();
      const scroll = screen.getByTestId('mentor-scroll');
      within(scroll).getByTestId('now-card-slot-anchor');
      within(scroll).getByTestId('now-card-slot-receipt-0');
      within(scroll).getByTestId('mentor-bar-input');

      const tree = JSON.stringify(rendered.result.toJSON());
      expect(tree.indexOf('now-card-slot-anchor')).toBeLessThan(
        tree.indexOf('now-card-slot-receipt-0'),
      );
      expect(tree.indexOf('now-card-slot-receipt-0')).toBeLessThan(
        tree.indexOf('mentor-bar-input'),
      );
      expect(scroll.props.contentContainerStyle).toEqual(
        expect.objectContaining({ paddingHorizontal: 12 }),
      );
      expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    } finally {
      dimensions.mockRestore();
    }
  });

  it('uses cached feed on feed failure and keeps the screen usable', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: undefined,
      fallbackFeed: feed([card({ kind: 'retention_due' })]),
      isError: true,
      isSlowFallback: true,
    };

    renderMentorScreen();

    screen.getByTestId('mentor-feed-fallback');
    screen.getByTestId('now-card-stack');
  });

  it('renders a continue-where-you-left-off fallback card on error with populated cache (never a dead-end) [T11]', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: undefined,
      fallbackFeed: feed([card({ kind: 'unfinished_session' })]),
      isError: true,
      isSlowFallback: true,
    };

    renderMentorScreen();

    // Cached cards still render...
    screen.getByTestId('now-card-stack');
    // ...PLUS a continue-where-you-left-off fallback that is actionable.
    const fallback = screen.getByTestId('continue-fallback-card');
    fireEvent.press(fallback);

    // The cached unfinished_session deep-links straight back into that session.
    expect(mockPush).toHaveBeenCalledWith('/(app)/session?sessionId=session-1');
  });

  it('falls back to the session spine when the cache has no resumable session [T11]', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: undefined,
      fallbackFeed: feed([card({ kind: 'retention_due' })]),
      isError: true,
      isSlowFallback: true,
    };

    renderMentorScreen();

    fireEvent.press(screen.getByTestId('continue-fallback-card'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { entrySource: 'mentor', returnTo: 'mentor' },
    });
  });

  it('renders retryable error state when there is no feed or cache', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: undefined,
      fallbackFeed: null,
      isError: true,
    };

    renderMentorScreen();

    fireEvent.press(screen.getByTestId('mentor-feed-retry'));
    expect(mockNowRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps light practice discoverable on a thin feed', () => {
    renderMentorScreen();

    fireEvent.press(screen.getByTestId('light-practice-capitals'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz',
      params: { activityType: 'capitals', returnTo: 'mentor' },
    });
  });

  it('V2 parity: routes the dictation light-practice affordance to the dictation screen', () => {
    renderMentorScreen();

    fireEvent.press(screen.getByTestId('light-practice-dictation'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/dictation');
  });

  it('advances the anchor arc and shows the mentor celebration when a card is completed', () => {
    renderMentorScreen();

    screen.getByText('Ready to pick back up');
    fireEvent.press(screen.getByTestId('now-card-complete'));

    screen.getByText('Session wrapped');
    screen.getByText('You chose the next step.');
  });

  function noticeCard(overrides: Partial<NowCard> = {}): NowCard {
    return card({
      kind: 'mentor_notice',
      templateKey: 'now.mentor_notice.default',
      params: { concept: 'changing signs', subjectName: 'Algebra' },
      deepLink: {
        route: 'notice.recheck',
        params: { noticeId: 'notice-1', subjectId: 'subject-1' },
        chain: [],
      },
      ...overrides,
    });
  }

  // [WI-2499 AC-2/AC-3] Not now defers a mentor notice for the current
  // learning day; it must never look like a generic decline. Removal from
  // the feed is only ever server-authoritative (the defer mutation's
  // onSuccess invalidate triggers a refetch) — the screen itself must not
  // locally hide the card or fall into the "prefer something light" success
  // affordance the generic decline path uses.
  it('[WI-2499 AC-2/AC-3] keeps the mentor-notice card on screen and shows no light-practice success after a successful "Not now" defer', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/defer': {
          noticeId: 'notice-1',
          deferredAt: '2026-07-21T12:00:00.000Z',
        },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(screen.queryByTestId('light-practice-capitals')).toBeNull();
  });

  // [WI-2499 AC-3] Navigation may only happen after a schema-valid server
  // success — the counterpart to the rejected-recheck test below. A
  // successful recheck must navigate to the returned session.
  it('[WI-2499 AC-3] navigates to the returned session when the recheck mutation succeeds', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/recheck': {
          sessionId: '550e8400-e29b-41d4-a716-446655440001',
        },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Check it now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/session?sessionId=550e8400-e29b-41d4-a716-446655440001',
    );
  });

  // [WI-2504 bounce 2] The recheck mutation is async — the observed policy
  // epoch can flip (e.g. a sibling surface observes a disabled epoch) while
  // it is still in flight. A result that resolves AFTER that flip must not
  // navigate into a surface the client has since suppressed.
  it('[WI-2504 bounce 2] does not navigate when the observed policy epoch changes while the recheck mutation is in flight', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
      observedEpoch: 'epoch-enabled',
    };

    let resolveRecheck: ((body: unknown) => void) | undefined;
    const recheckPending = new Promise((resolve) => {
      resolveRecheck = resolve;
    });

    const rendered = renderMentorScreen(
      {},
      { '/mentor-notices/notice-1/recheck': () => recheckPending },
    );

    fireEvent.press(screen.getByText('Check it now'));

    // The epoch flips while the recheck request is still pending.
    await act(async () => {
      mockNowFeed = { ...mockNowFeed, observedEpoch: 'epoch-disabled' };
      rendered.result.rerender(<MentorScreen />);
    });

    await act(async () => {
      resolveRecheck?.({
        sessionId: '550e8400-e29b-41d4-a716-446655440001',
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/(app)/session?sessionId='),
    );
    screen.getByTestId('now-card-mentor_notice');
  });

  // [WI-2504 bounce 3 / AC-2] Class-closing coverage for the LAST open
  // stale-feed leak layer: `useTransitionBoundFeed`. A warm notice feed
  // (enabled epoch) is rendered on the mentor tab; then the server flips the
  // policy off and a `refetchOnWindowFocus` re-key delivers the disabled-epoch
  // feed (no notice) WITHOUT a nav refocus — so `useFocusEffect` does NOT fire
  // (mockFocusCallback is left uncalled). On the pre-fix code the snapshot is
  // keyed only on profileId, so it pins the stale enabled-epoch NOTICE feed and
  // the card renders indefinitely after observed-disabled — an AC-2 violation
  // ("no mentor-notice Now card may render after observed-disabled") even
  // though the bounce-2 handleContinue guard already blocks the stale
  // navigation. The epoch-change branch in the snapshot effect closes it.
  it('[WI-2504 bounce 3 / AC-2] drops the mentor-notice card when a window-focus refetch re-keys to a disabled epoch without a nav refocus', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
      observedEpoch: 'epoch-enabled',
    };

    const rendered = renderMentorScreen();

    // The enabled-epoch feed renders the notice card.
    screen.getByTestId('now-card-mentor_notice');
    screen.getByText('Check it now');

    // Server flips the policy off: the now-feed query re-keys to the disabled
    // epoch and the fetch delivers a notice-free feed. This is a
    // refetchOnWindowFocus re-key WHILE ALREADY ON THE TAB — no navigation
    // refocus — so `useFocusEffect` is deliberately NOT triggered here.
    await act(async () => {
      mockNowFeed = {
        ...mockNowFeed,
        data: feed([card()]),
        observedEpoch: 'epoch-disabled',
      };
      rendered.result.rerender(<MentorScreen />);
    });

    // AC-2: no mentor-notice Now card, and no actionable notice affordance,
    // may survive observed-disabled.
    expect(screen.queryByTestId('now-card-mentor_notice')).toBeNull();
    expect(screen.queryByText('Check it now')).toBeNull();
  });

  // [WI-2499 AC-3] On a rejected/failed defer, no success state may appear —
  // the card stays exactly as it was, and the generic light-practice success
  // affordance never shows.
  it('[WI-2499 AC-3] keeps the mentor-notice card on screen and shows no light-practice success when the defer mutation is rejected', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/defer': () => ERROR_RESPONSES.forbidden(),
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(screen.queryByTestId('light-practice-capitals')).toBeNull();
  });

  // [WI-2499 AC-3] Continue starts/resumes the server re-check; navigation
  // may only happen after a schema-valid server success. On a rejected
  // recheck, the card must stay put with no navigation and no success state.
  it('[WI-2499 AC-3] does not navigate and keeps the mentor-notice card when the recheck mutation is rejected', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/recheck': () => ERROR_RESPONSES.forbidden(),
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Check it now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/(app)/session?sessionId='),
    );
  });

  // [WI-2499 AC-3/AC-6 rework] The three remaining failure modes the AC names
  // for "Not now" beyond the 403 case above: server-authoritative conflict,
  // a transport failure before any response arrives, and a schema-malformed
  // 200. All three must land in the same place as the 403 case — card stays,
  // no light-practice success — because removal is only ever driven by the
  // defer mutation's onSuccess invalidate.
  it('[WI-2499 AC-3/AC-6] keeps the mentor-notice card on screen and shows no light-practice success when the defer mutation conflicts (409)', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/defer': () =>
          new Response(
            JSON.stringify({ code: 'CONFLICT', message: 'Already resolved' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(screen.queryByTestId('light-practice-capitals')).toBeNull();
  });

  it('[WI-2499 AC-3/AC-6] keeps the mentor-notice card on screen and shows no light-practice success when the defer mutation fails at the transport layer', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/defer': () => {
          throw new TypeError('Network request failed');
        },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(screen.queryByTestId('light-practice-capitals')).toBeNull();
  });

  it('[WI-2499 AC-3/AC-6] keeps the mentor-notice card on screen and shows no light-practice success when the defer response is schema-malformed', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        // Missing the required `deferredAt`, so `mentorNoticeDeferResponseSchema`
        // rejects it even though the HTTP layer reports 200.
        '/mentor-notices/notice-1/defer': { noticeId: 'notice-1' },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(screen.queryByTestId('light-practice-capitals')).toBeNull();
  });

  // [WI-2499 AC-3/AC-6 rework] Same three failure modes on "Continue" —
  // navigation may only ever follow a schema-valid server success.
  it('[WI-2499 AC-3/AC-6] does not navigate and keeps the mentor-notice card when the recheck mutation conflicts (409)', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/recheck': () =>
          new Response(
            JSON.stringify({ code: 'CONFLICT', message: 'Already resolved' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Check it now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/(app)/session?sessionId='),
    );
  });

  it('[WI-2499 AC-3/AC-6] does not navigate and keeps the mentor-notice card when the recheck mutation fails at the transport layer', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        '/mentor-notices/notice-1/recheck': () => {
          throw new TypeError('Network request failed');
        },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Check it now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/(app)/session?sessionId='),
    );
  });

  it('[WI-2499 AC-3/AC-6] does not navigate and keeps the mentor-notice card when the recheck response is schema-malformed', async () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([noticeCard(), card()]),
    };

    renderMentorScreen(
      {},
      {
        // Not a valid UUID, so `mentorNoticeRecheckResponseSchema` rejects it
        // even though the HTTP layer reports 200.
        '/mentor-notices/notice-1/recheck': { sessionId: 'not-a-uuid' },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Check it now'));
      await Promise.resolve();
      await Promise.resolve();
    });

    screen.getByTestId('now-card-mentor_notice');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/(app)/session?sessionId='),
    );
  });

  // WI-1393: the V2 shell previously had zero forward navigation to
  // /(app)/link/initiate — this proves the cold-start empty-state anchor (A1)
  // actually reaches it with a supporteePersonId, so the missing-param
  // ErrorFallback on that screen is never hit from this trigger.
  it('[WI-1393] reaches /(app)/link/initiate with supporteePersonId via the empty-state picker when an eligible managed person exists', () => {
    mockScopeContext = {
      activeScope: { kind: 'supporter-hub' },
      availableScopes: [],
      setActiveScope: jest.fn(),
    };

    renderMentorScreen({
      profile: NAMED_PROFILES.guardian,
      profiles: [NAMED_PROFILES.guardian, NAMED_PROFILES.linkedChild],
    });

    fireEvent.press(screen.getByTestId('support-hub-mentor-empty-add'));
    fireEvent.press(
      screen.getByTestId(
        `support-person-picker-option-${NAMED_PROFILES.linkedChild.id}`,
      ),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/link/initiate',
      params: {
        supporteePersonId: NAMED_PROFILES.linkedChild.id,
        supporteeName: NAMED_PROFILES.linkedChild.displayName,
        relation: 'parent',
      },
    });
  });

  // WI-1393 AC2: zero eligible managed persons must degrade to add-a-child,
  // never a param-less push to /(app)/link/initiate.
  it('[WI-1393] degrades to add-a-child when there are zero eligible managed persons', () => {
    mockScopeContext = {
      activeScope: { kind: 'supporter-hub' },
      availableScopes: [],
      setActiveScope: jest.fn(),
    };

    renderMentorScreen({
      profile: NAMED_PROFILES.guardian,
      profiles: [NAMED_PROFILES.guardian],
    });

    fireEvent.press(screen.getByTestId('support-hub-mentor-empty-add'));
    screen.getByTestId('support-person-picker-empty');
    fireEvent.press(screen.getByTestId('support-person-picker-add-child'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/link/initiate' }),
    );
  });

  // [WI-1137 Codex P2] the join-my-family existing-teen path must be
  // reachable from the SupportHub picker regardless of eligible-child count
  // — it must not be nested under, or gated by, the zero-eligible degrade.
  it('[WI-1137] reaches /(app)/link/initiate param-less via the "link an existing family member" option', () => {
    mockScopeContext = {
      activeScope: { kind: 'supporter-hub' },
      availableScopes: [],
      setActiveScope: jest.fn(),
    };

    renderMentorScreen({
      profile: NAMED_PROFILES.guardian,
      profiles: [NAMED_PROFILES.guardian, NAMED_PROFILES.linkedChild],
    });

    fireEvent.press(screen.getByTestId('support-hub-mentor-empty-add'));
    fireEvent.press(screen.getByTestId('support-person-picker-existing-teen'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/link/initiate');
  });
});
