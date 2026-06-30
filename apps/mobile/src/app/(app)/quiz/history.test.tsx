import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  type RenderScreenResult,
} from '../../../test-utils/screen-render';
import { fetchCallsMatching } from '../../../test-utils/mock-api-routes';
import QuizHistoryScreen from './history';
import * as localDateModule from '../../../lib/local-date';

// ─── Boundary mocks (external / native runtime only) ────────────────────────
//
// CONVERTED in this file (now run for REAL against the routed mock fetch +
// ProfileContext supplied by renderScreen): hooks/use-quiz (useRecentRounds
// runs against the routed /quiz/rounds/recent endpoint) and
// lib/extract-vocabulary-language (a pure utility — the real fn returns null
// for the non-language theme used here, so no stub is needed).
//
// KEPT as boundaries: expo-router (native nav container), lib/navigation
// (imports the expo-router Router type), react-i18next + i18n (i18n boundary),
// lib/theme (native ColorScheme), lib/use-screen-top-inset (native SafeArea).

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'quiz.history.rowLabel') {
        return `${params?.label} ${params?.theme}`;
      }
      return key;
    },
  }),
}));

jest.mock(
  '../../../i18n' /* gc1-allow: i18next init requires native setup not available in unit env */,
  () => ({
    i18next: {
      t: (key: string) => key,
    },
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: useThemeColors requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#111111',
    }),
  }),
);

jest.mock(
  '../../../lib/use-screen-top-inset' /* gc1-allow: uses native SafeAreaContext unavailable in JSDOM */,
  () => ({
    useScreenTopInset: () => ({ top: 24 }),
  }),
);

const RECENT_ROUNDS_ROUTE = '/quiz/rounds/recent';

const ROUND_GUESS_ID = 'cc0e8400-e29b-41d4-a716-446655440001';
const ROUND_BOUNDARY_ID = 'cc0e8400-e29b-41d4-a716-446655440002';

const recentRounds = [
  {
    id: ROUND_GUESS_ID,
    activityType: 'guess_who',
    theme: 'Famous Scientists and Innovators',
    score: 4,
    total: 4,
    xpEarned: 110,
    completedAt: '2026-04-29T12:00:00.000Z',
  },
];

let active: RenderScreenResult | null = null;

function mount(
  routes: Record<string, unknown> = { [RECENT_ROUNDS_ROUTE]: recentRounds },
): RenderScreenResult {
  active = renderScreen(<QuizHistoryScreen />, {
    profile: 'soloLearner',
    routes,
  });
  return active;
}

describe('QuizHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    jest.useRealTimers();
  });

  it('navigates back to quiz index via goBackOrReplace when no returnTo param', async () => {
    mount();
    await waitFor(() => {
      screen.getByTestId(`quiz-history-row-${ROUND_GUESS_ID}`);
    });
    fireEvent.press(screen.getByTestId('quiz-history-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush }),
      '/(app)/quiz',
    );
  });

  it('[QUIZ-09] honors returnTo=practice: loaded-list back button routes to /(app)/practice', async () => {
    // Break test: before the fix, the loaded-list back button hardcoded '/(app)/quiz'
    // ignoring the returnTo param that loading/empty/error states already honored.
    mockSearchParams = { returnTo: 'practice' };
    mount();
    await waitFor(() => {
      screen.getByTestId(`quiz-history-row-${ROUND_GUESS_ID}`);
    });
    fireEvent.press(screen.getByTestId('quiz-history-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush }),
      '/(app)/practice',
    );
    // Must not fall back to the hardcoded quiz route.
    expect(mockGoBackOrReplace).not.toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/quiz',
    );
  });

  it('navigates to round detail on row press', async () => {
    mount();
    await waitFor(() => {
      screen.getByTestId(`quiz-history-row-${ROUND_GUESS_ID}`);
    });
    fireEvent.press(screen.getByTestId(`quiz-history-row-${ROUND_GUESS_ID}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/[roundId]',
      params: { roundId: ROUND_GUESS_ID },
    });
  });

  it('shows loading state', () => {
    // A route handler that never resolves keeps the real useRecentRounds query
    // in its loading state, exactly like a slow network.
    mount({ [RECENT_ROUNDS_ROUTE]: () => new Promise<never>(() => undefined) });
    expect(screen.getByTestId('quiz-history-loading'));
    screen.getByText('quiz.history.loadingText');
    screen.getByTestId('quiz-history-loading-back');
  });

  it('turns the loading state into retry and back actions after timeout', async () => {
    jest.useFakeTimers();
    // Stay loading: the query never settles, so the TimeoutLoader's internal
    // 15s timer flips it to the retry/back surface. Pressing retry calls the
    // real refetch(), which re-invokes the queryFn → a second fetch (verified
    // via fetchCallsMatching).
    const view = mount({
      [RECENT_ROUNDS_ROUTE]: () => new Promise<never>(() => undefined),
    });

    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    const callsBefore = fetchCallsMatching(
      view.routedFetch,
      RECENT_ROUNDS_ROUTE,
    ).length;
    fireEvent.press(screen.getByTestId('quiz-history-timeout-retry'));
    await waitFor(() => {
      expect(
        fetchCallsMatching(view.routedFetch, RECENT_ROUNDS_ROUTE).length,
      ).toBeGreaterThan(callsBefore);
    });

    fireEvent.press(screen.getByTestId('quiz-history-timeout-go-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('shows empty state with try-quiz CTA', async () => {
    mount({ [RECENT_ROUNDS_ROUTE]: [] });
    await waitFor(() => {
      screen.getByTestId('quiz-history-empty');
    });
    fireEvent.press(screen.getByTestId('quiz-history-try-quiz'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz',
      params: {},
    });
  });

  it('[F-178] groups rounds by local date, not UTC date (midnight boundary)', async () => {
    // RED-GREEN evidence for F-178.
    //
    // Scenario: user is in UTC-1. Round completed at 2026-04-30T00:30:00Z.
    //   - UTC date: '2026-04-30' (what the old `.slice(0,10)` would give)
    //   - Local date: '2026-04-29' (what toLocalDateString() correctly returns)
    //
    // We spy on toLocalDateString to simulate a UTC-1 user: the timestamp at
    // UTC midnight + 30m maps to the previous local day. Any other call falls
    // through to the REAL implementation so unexpected calls stay visible.
    //
    // BUGGY code: `round.completedAt.slice(0, 10)` → groups under '2026-04-30'
    // FIXED code: `toLocalDateString(new Date(round.completedAt))` → '2026-04-29'

    const realToLocalDateString = localDateModule.toLocalDateString;
    const spy = jest
      .spyOn(localDateModule, 'toLocalDateString')
      .mockImplementation((d?: Date) => {
        // Simulate UTC-1: 2026-04-30T00:30:00Z is locally 2026-04-29 23:30
        if (d && d.toISOString() === '2026-04-30T00:30:00.000Z') {
          return '2026-04-29';
        }
        return realToLocalDateString(d);
      });

    const roundAtUTCMidnight = [
      {
        id: ROUND_BOUNDARY_ID,
        activityType: 'vocabulary',
        theme: 'Animals',
        score: 3,
        total: 5,
        xpEarned: 60,
        completedAt: '2026-04-30T00:30:00.000Z', // April 30 UTC, April 29 locally
      },
    ];

    mount({ [RECENT_ROUNDS_ROUTE]: roundAtUTCMidnight });
    await waitFor(() => {
      screen.getByTestId(`quiz-history-row-${ROUND_BOUNDARY_ID}`);
    });

    // 1. The grouping path must hand the helper the exact Date built from
    //    completedAt (jest Date equality compares timestamps). With the buggy
    //    `.slice(0, 10)` key the helper is never called for this round.
    expect(spy).toHaveBeenCalledWith(new Date('2026-04-30T00:30:00.000Z'));

    // 2. The rendered section header must show the LOCAL day (Apr 29), not the
    //    UTC day (Apr 30). The header renders relativeDate('<key>T00:00:00');
    //    for a >30-day-old date the real useRelativeDate hook formats it via
    //    toLocaleDateString — replicate that exact formatting here.
    const headerFor = (localMidnightIso: string): string => {
      const d = new Date(localMidnightIso);
      const includeYear = d.getFullYear() !== new Date().getFullYear();
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' } : {}),
      });
    };
    expect(screen.getByText(headerFor('2026-04-29T00:00:00'))).toBeTruthy();
    expect(screen.queryByText(headerFor('2026-04-30T00:00:00'))).toBeNull();

    spy.mockRestore();
  });

  it('shows error state with retry and go-back actions', async () => {
    // A throwing route handler makes the real query enter its error state.
    let attempts = 0;
    const view = mount({
      [RECENT_ROUNDS_ROUTE]: () => {
        attempts += 1;
        throw new TypeError('Network request failed');
      },
    });
    await waitFor(() => {
      screen.getByTestId('quiz-history-error');
    });

    const attemptsBefore = attempts;
    fireEvent.press(screen.getByTestId('quiz-history-retry'));
    await waitFor(() => {
      expect(
        fetchCallsMatching(view.routedFetch, RECENT_ROUNDS_ROUTE).length,
      ).toBeGreaterThan(0);
    });
    expect(attempts).toBeGreaterThan(attemptsBefore);

    fireEvent.press(screen.getByTestId('quiz-history-go-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });
});
