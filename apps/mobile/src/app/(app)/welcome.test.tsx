import { fireEvent, render, screen } from '@testing-library/react-native';

import WelcomeRoute from './welcome';

const mockReplace = jest.fn();
let mockRedirectParam: string | undefined;
let mockUserId: string | null = 'user_test_1';

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
    useUser: () => ({
      user: mockUserId ? { id: mockUserId } : null,
    }),
  }),
);

jest.mock('../../lib/intro-state', () => ({
  // gc1-allow: markIntroSeenSync is the assertion surface — the test verifies the route calls it with the Clerk userId, not the SecureStore-write behavior (covered by intro-state.test.ts).
  markIntroSeenSync: (...args: unknown[]) => mockMarkIntroSeenSync(...args),
}));

jest.mock('../../lib/analytics', () => ({
  // gc1-allow: track() is the assertion surface — the test verifies intro_started/intro_card_advanced/intro_completed events fire with the right payloads.
  track: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock('../../components/welcome/WelcomeIntro', () => ({
  // gc1-allow: WelcomeIntro is covered by its own unit suite (WelcomeIntro.test.tsx); the route test stubs it to a minimal driver so we can verify ONLY the route's wiring (analytics + intro-state + redirect param + router.replace).
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
}));

describe('<WelcomeRoute />', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockMarkIntroSeenSync.mockReset();
    mockTrack.mockReset();
    mockRedirectParam = undefined;
    mockUserId = 'user_test_1';
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

  it('renders null and never fires markIntroSeenSync when Clerk has not hydrated the user', () => {
    mockUserId = null;
    render(<WelcomeRoute />);
    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
    expect(mockMarkIntroSeenSync).not.toHaveBeenCalled();
  });
});
