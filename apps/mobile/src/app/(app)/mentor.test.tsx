import { Dimensions } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type {
  NowCard,
  NowResponse,
  ScopeDescriptor,
  SharedRecord,
} from '@eduagent/schemas';

import {
  NAMED_PROFILES,
  renderScreen,
  type RenderScreenOptions,
} from '../../test-utils/screen-render';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';
const mockPush = jest.fn();
const mockNowRefetch = jest.fn();
let cleanupRender: (() => void) | undefined;
let mockNowFeed: {
  data: NowResponse | undefined;
  fallbackFeed: NowResponse | null;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isSlowFallback: boolean;
  refetch: jest.Mock;
};
let mockSubjectsCount = 1;
let mockScopeContext: {
  activeScope: { kind: 'me' } | { kind: 'supporter-hub' } | PersonScope;
  availableScopes: PersonScope[];
  setActiveScope: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: pattern-a conversion */,
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
  '../../hooks/use-subjects-index' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../hooks/use-subjects-index',
    ) as typeof import('../../hooks/use-subjects-index');
    return {
      ...actual,
      useSubjectsIndex: () => ({
        subjects: Array.from({ length: mockSubjectsCount }, (_, index) => ({
          subjectId: `subject-${index}`,
          status: 'active',
        })),
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      }),
    };
  },
);

jest.mock(
  '../../lib/scope-context' /* gc1-allow: pattern-a conversion */,
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

function renderMentorScreen(
  profileOverrides: Pick<RenderScreenOptions, 'profile' | 'profiles'> = {},
): void {
  const rendered = renderScreen(<MentorScreen />, {
    routes: {
      [`/visibility/reports/${PERSON_ID}/shared-record`]: SHARED_RECORD,
    },
    ...profileOverrides,
  });
  cleanupRender = rendered.cleanup;
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

function expectVisibleClarification(): void {
  const clarification = screen.getByTestId('mentor-bar-clarification');
  within(clarification).getByText('What exactly do you want to learn?');
  expect(clarification.props.accessibilityLiveRegion).toBe('polite');
}

describe('MentorScreen', () => {
  afterEach(() => {
    cleanupRender?.();
    cleanupRender = undefined;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjectsCount = 1;
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

  it('shows the ask box and light practice instead of a dead-end on an empty feed', () => {
    // Real first state (a subject exists) but the now-feed is empty: the old
    // build showed a "Nothing needs you / Browse" card whose tap did nothing.
    mockSubjectsCount = 1;
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

  it('renders the person-scope Mentor variant without loading the Me feed', () => {
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

    screen.getByTestId('person-scope-mentor-tab');
    expect(screen.getAllByText('Emma').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('mentor-screen')).toBeNull();
  });

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
    mockSubjectsCount = 0;
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([]),
    };

    renderMentorScreen();

    screen.getByTestId('mentor-cold-start-card');
    expect(screen.queryByTestId('now-card-stack')).toBeNull();
  });

  it('closed-catalog-jump — pushes deterministic route phrases through the closed mapper', () => {
    renderMentorScreen();

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'open subject spanish',
    );
    fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

    expect(mockPush).toHaveBeenCalledWith('/(app)/subject-hub/spanish');
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

  it('unsupported-library — reveals clarification without expanding the route catalog', () => {
    renderMentorScreen();

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'take me to the library',
    );
    fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

    expectVisibleClarification();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each(['review', 'open dashboard'])(
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

      expect(Dimensions.get('window').width).toBe(360);
      const scroll = screen.getByTestId('mentor-scroll');
      const input = within(scroll).getByTestId('mentor-bar-input');
      const send = within(scroll).getByTestId('mentor-bar-send');
      expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
      expect(input.props.className).toContain('min-w-0');
      fireEvent.changeText(input, 'Teach me about neon');
      fireEvent.press(send);

      expectFreeformRoute('Teach me about neon');
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
