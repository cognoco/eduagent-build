import { fireEvent, render, screen } from '@testing-library/react-native';

import WelcomeRoute from './welcome';

const mockReplace = jest.fn();
let mockRedirectParam: string | undefined;
let mockAuthUserId: string | null = 'user_test_1';
let mockHydratedUserId: string | null = 'user_test_1';

const mockMarkIntroSeenSync = jest.fn();
const mockTrack = jest.fn();

jest.mock(
  'expo-router',
  /* gc1-allow: external-boundary — Expo Router framework */ () => ({
    useRouter: () => ({ replace: mockReplace }),
    useLocalSearchParams: () => ({ redirect: mockRedirectParam }),
  }),
);

jest.mock(
  '@clerk/clerk-expo',
  /* gc1-allow: external-boundary — Clerk SDK */ () => ({
    useAuth: () => ({
      userId: mockAuthUserId,
    }),
    useUser: () => ({
      user: mockHydratedUserId ? { id: mockHydratedUserId } : null,
    }),
  }),
);

jest.mock('../../lib/intro-state', () => ({
  ...jest.requireActual('../../lib/intro-state'),
  markIntroSeenSync: (...args: unknown[]) => mockMarkIntroSeenSync(...args),
}));

jest.mock('../../lib/analytics', () => ({
  ...jest.requireActual('../../lib/analytics'),
  track: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock(
  '../../components/welcome/WelcomeIntro' /* gc1-allow: WelcomeIntro is fully covered by WelcomeIntro.test.tsx; this route test stubs the component to a minimal driver so it can verify ONLY the route's wiring (analytics + intro-state + redirect param + router.replace) without re-exercising the pager UI. */,
  () => ({
    WelcomeIntro: ({
      onComplete,
      onCardAdvanced,
    }: {
      onComplete: () => void;
      onCardAdvanced?: (n: number) => void;
    }) => {
      const { Pressable, Text, View } = jest.requireActual('react-native');
      return (
        <View testID="welcome-intro-stub">
          <Pressable testID="stub-advance" onPress={() => onCardAdvanced?.(2)}>
            <Text>Advance</Text>
          </Pressable>
          <Pressable testID="stub-complete" onPress={onComplete}>
            <Text>Complete</Text>
          </Pressable>
        </View>
      );
    },
  }),
);

describe('<WelcomeRoute />', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockMarkIntroSeenSync.mockReset();
    mockTrack.mockReset();
    mockRedirectParam = undefined;
    mockAuthUserId = 'user_test_1';
    mockHydratedUserId = 'user_test_1';
  });

  it('fires intro_started exactly once on mount', () => {
    const { rerender } = render(<WelcomeRoute />);
    rerender(<WelcomeRoute />);
    const startedCalls = mockTrack.mock.calls.filter(
      (c) => c[0] === 'intro_started',
    );
    expect(startedCalls).toHaveLength(1);
  });

  it('fires intro_card_advanced with the new card index', () => {
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByTestId('stub-advance'));
    expect(mockTrack).toHaveBeenCalledWith('intro_card_advanced', { card: 2 });
  });

  it('on complete: tracks intro_completed, marks intro seen, replaces to /(app)/home by default', () => {
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByTestId('stub-complete'));
    expect(mockTrack).toHaveBeenCalledWith('intro_completed', {});
    expect(mockMarkIntroSeenSync).toHaveBeenCalledWith('user_test_1');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('on complete: respects the redirect query param (deep-link stash)', () => {
    mockRedirectParam = '/(app)/homework/H-42';
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByTestId('stub-complete'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/homework/H-42');
  });

  it('ignores an empty-string redirect param and falls back to /(app)/home', () => {
    mockRedirectParam = '';
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByTestId('stub-complete'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('[BUG] renders the intro when auth userId is ready but useUser has not hydrated yet', () => {
    mockHydratedUserId = null;

    render(<WelcomeRoute />);

    expect(screen.getByTestId('welcome-intro-stub')).toBeTruthy();

    fireEvent.press(screen.getByTestId('stub-complete'));
    expect(mockMarkIntroSeenSync).toHaveBeenCalledWith('user_test_1');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('shows a visible loading fallback and never fires markIntroSeenSync before Clerk userId is ready', () => {
    mockAuthUserId = null;
    mockHydratedUserId = null;

    render(<WelcomeRoute />);

    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
    expect(screen.getByTestId('welcome-auth-loading')).toBeTruthy();
    expect(mockMarkIntroSeenSync).not.toHaveBeenCalled();
  });
});
