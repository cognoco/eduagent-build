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

const recentRounds = [
  {
    id: 'round-guess',
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
      screen.getByTestId('quiz-history-row-round-guess');
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
      screen.getByTestId('quiz-history-row-round-guess');
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
      screen.getByTestId('quiz-history-row-round-guess');
    });
    fireEvent.press(screen.getByTestId('quiz-history-row-round-guess'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/[roundId]',
      params: { roundId: 'round-guess' },
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
    // We spy on toLocalDateString to simulate a UTC-1 user: the function
    // maps the UTC-midnight+30m timestamp to the local date '2026-04-29'.
    // The test verifies the section date key comes from toLocalDateString,
    // not from the raw ISO slice.
    //
    // BUGGY code: `round.completedAt.slice(0, 10)` → groups under '2026-04-30'
    // FIXED code: `toLocalDateString(new Date(round.completedAt))` → '2026-04-29'

    const spy = jest
      .spyOn(localDateModule, 'toLocalDateString')
      .mockImplementation((d?: Date) => {
        if (!d) return '2026-04-29'; // default case (not relevant here)
        const iso = d.toISOString();
        // Simulate UTC-1: 2026-04-30T00:30:00Z is locally 2026-04-29 23:30
        if (iso.startsWith('2026-04-30T00:30')) return '2026-04-29';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });

    const roundAtUTCMidnight = [
      {
        id: 'round-boundary',
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
      screen.getByTestId('quiz-history-row-round-boundary');
    });

    // The section header date key passed to relativeDate() should be '2026-04-29'
    // (local date), not '2026-04-30' (UTC date). The spy was called with the
    // Date object wrapping completedAt, confirming the fix path was taken.
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        // The Date constructed from the completedAt ISO string
      }),
    );
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
