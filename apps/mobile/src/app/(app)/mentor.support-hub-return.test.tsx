import { act, fireEvent, screen } from '@testing-library/react-native';
import type { NowCard, NowResponse } from '@eduagent/schemas';

import { renderScreen } from '../../test-utils/screen-render';
import { ScopeContextProvider, useScopeContext } from '../../lib/scope-context';

// [WI-2223 AC-3] Companion to mentor.test.tsx's dispatch-mock suite. That
// file mocks `../../lib/scope-context` entirely (see its gc1-allow note) so
// its own AC-3 case can only compare two independently hand-set
// `activeScope` values — it never drives an actual scope transition. This
// file leaves `scope-context` UNMOCKED so the support-hub selection and the
// return to Me both happen through the real `ScopeContextProvider` /
// `setActiveScope`, the same mechanism AC-1 proves at the `pushNowDeepLink`
// call site (now-deep-link.ts).
//
// Why this isn't a `router.back()` test: `ScopeContextProvider` mounts once
// at `apps/mobile/src/app/(app)/_layout.tsx`, ABOVE the Tabs navigator, and
// nothing in `scope-context.tsx` subscribes to navigation events (no
// `useFocusEffect`/blur handler) — activeScope is deliberately sticky
// (persisted via SecureStore) and structurally cannot be mutated by a
// back/pop event. "Returning to Me" is therefore an explicit scope switch
// (the ScopeChip in `_layout.tsx` calling `setActiveScope`), not a
// navigation consequence, so this test drives that same real switch rather
// than a `router.back()` this screen has no code path to react to. The
// visible-layout claim for the full navigation shell is covered separately
// by a named `nav-shell.spec.ts` case.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: () => undefined,
}));

let mockNowFeed: {
  data: NowResponse | undefined;
  fallbackFeed: NowResponse | null;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isSlowFallback: boolean;
  refetch: jest.Mock;
};

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: real hook starts profile-scoped API queries and native cache timers; this route test injects a fixed feed instead */,
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
  '../../hooks/use-subjects-index' /* gc1-allow: real hook aggregates three asynchronous subject, library, and progress queries; this route test needs a deterministic empty index without those API calls */,
  () => {
    const actual = jest.requireActual(
      '../../hooks/use-subjects-index',
    ) as typeof import('../../hooks/use-subjects-index');
    return {
      ...actual,
      useSubjectsIndex: () => ({
        subjects: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      }),
    };
  },
);

const MentorScreen = require('./mentor').default;

function supportHubCard(): NowCard {
  return {
    kind: 'unfinished_session',
    templateKey: 'now.unfinished_session.default',
    params: { topicTitle: 'Support hub' },
    deepLink: { route: 'support.hub', params: {}, chain: [] },
    scope: 'self',
  };
}

function feed(cards: NowCard[]): NowResponse {
  return {
    scope: 'self',
    cards,
    overflowCount: 0,
    generatedAt: '2026-07-19T00:00:00.000Z',
  };
}

// Exposes the real `setActiveScope` from the same `ScopeContextProvider`
// instance MentorScreen reads from, so the test can drive the "return to
// Me" transition through the actual mechanism (the ScopeChip's call site)
// rather than re-implementing or mocking it.
let capturedSetActiveScope: ReturnType<
  typeof useScopeContext
>['setActiveScope'];

function ScopeCapture(): null {
  ({ setActiveScope: capturedSetActiveScope } = useScopeContext());
  return null;
}

describe('MentorScreen — support-hub return path (real ScopeContextProvider)', () => {
  let cleanupRender: (() => void) | undefined;

  afterEach(() => {
    cleanupRender?.();
    cleanupRender = undefined;
    jest.clearAllMocks();
  });

  it('[WI-2223 AC-3] returning to Me after a real support.hub selection shows no Support-hub content', () => {
    mockNowFeed = {
      data: feed([supportHubCard()]),
      fallbackFeed: null,
      isLoading: false,
      isError: false,
      isFetching: false,
      isSlowFallback: false,
      refetch: jest.fn(),
    };

    const rendered = renderScreen(
      <ScopeContextProvider
        initialScopeList={{
          shape: 'supporter',
          scopes: [{ kind: 'supporter-hub' }, { kind: 'me' }],
          defaultScopeIndex: 1,
        }}
      >
        <ScopeCapture />
        <MentorScreen />
      </ScopeContextProvider>,
    );
    cleanupRender = rendered.cleanup;

    // Starts on the Me (learner) surface.
    screen.getByTestId('mentor-screen');
    expect(screen.queryByTestId('support-hub-mentor-tab')).toBeNull();

    // Real deep-link mechanism (same call site AC-1 covers): pressing the
    // support.hub-linked card's continue action calls the real
    // `setActiveScope({kind:'supporter-hub'})` before the push.
    fireEvent.press(screen.getByTestId('now-card-continue'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/mentor');
    screen.getByTestId('support-hub-mentor-tab');
    expect(screen.queryByTestId('mentor-screen')).toBeNull();

    // The real "return to Me" switch — the same `setActiveScope` call the
    // ScopeChip (`_layout.tsx`) makes; scope-context.tsx has no navigation
    // listener to drive this from a back/pop event instead (see file header).
    expect(capturedSetActiveScope).toBeDefined();
    act(() => {
      capturedSetActiveScope({ kind: 'me' });
    });

    screen.getByTestId('mentor-screen');
    expect(screen.queryByTestId('support-hub-mentor-tab')).toBeNull();
  });
});
