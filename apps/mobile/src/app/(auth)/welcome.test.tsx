import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockMarkPreAuthIntroSeen = jest.fn();
const mockTrack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock(
  '../../components/welcome/WelcomeIntro' /* gc1-allow: WelcomeIntro is covered by its own focused unit test; stub here exposes onComplete + onCardAdvanced triggers so this route test can drive the state machine without simulating four swipes */,
  () => ({
    WelcomeIntro: ({
      onComplete,
      onCardAdvanced,
    }: {
      onComplete: () => void;
      onCardAdvanced?: (n: number) => void;
    }) => {
      const { View, Pressable, Text } = require('react-native');
      return (
        <View testID="welcome-intro-stub">
          <Pressable
            testID="welcome-intro-stub-advance"
            onPress={() => onCardAdvanced?.(2)}
          >
            <Text>advance</Text>
          </Pressable>
          <Pressable testID="welcome-intro-stub-complete" onPress={onComplete}>
            <Text>complete</Text>
          </Pressable>
        </View>
      );
    },
  }),
);

jest.mock(
  '../../components/common' /* gc1-allow: GateContent renders fine; LightBulbAnimation depends on Reanimated/SVG that don't run in JSDOM */,
  () => {
    const { View } = require('react-native');
    return {
      GateContent: ({ children }: { children: React.ReactNode }) => (
        <View testID="gate-content">{children}</View>
      ),
      LightBulbAnimation: ({ testID }: { testID?: string }) => (
        <View testID={testID ?? 'lightbulb'} />
      ),
    };
  },
);

jest.mock(
  '../../lib/intro-state' /* gc1-allow: this route test asserts the mark-seen side-effect; stubbing keeps the assertion focused on the route's wiring (intro-state's own behavior is covered by intro-state.test.ts) */,
  () => ({
    markPreAuthIntroSeenSync: () => mockMarkPreAuthIntroSeen(),
  }),
);

jest.mock('../../lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        'welcomeIntro.bridge.headline':
          'Turn "I don\'t get it" into "I\'ve got this."',
        'welcomeIntro.bridge.supporting':
          'Create a free account so your mentor can remember your subjects, notes, and progress.',
        'welcomeIntro.bridge.primaryCta': 'Create free account',
        'welcomeIntro.bridge.secondaryCta': 'I already have an account',
        'welcomeIntro.a11y.bridgePrimary': 'Create a free account',
        'welcomeIntro.a11y.bridgeSecondary': 'Sign in to an existing account',
      };
      return dict[key] ?? key;
    },
  }),
}));

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({
    background: '#000',
    accent: '#0af',
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textInverse: '#000',
  }),
}));

const PreAuthWelcomeRoute = require('./welcome').default;

describe('<PreAuthWelcomeRoute />', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockMarkPreAuthIntroSeen.mockReset();
    mockTrack.mockReset();
  });

  it('renders the welcome cards on first mount', () => {
    render(<PreAuthWelcomeRoute />);
    expect(screen.getByTestId('welcome-intro-stub')).toBeTruthy();
    expect(screen.queryByTestId('pre-auth-bridge')).toBeNull();
  });

  it('emits intro_started exactly once on mount', () => {
    render(<PreAuthWelcomeRoute />);
    const started = mockTrack.mock.calls.filter(
      (call) => call[0] === 'intro_started',
    );
    expect(started.length).toBe(1);
  });

  it('forwards card-advance events as intro_card_advanced telemetry', () => {
    render(<PreAuthWelcomeRoute />);
    fireEvent.press(screen.getByTestId('welcome-intro-stub-advance'));
    expect(mockTrack).toHaveBeenCalledWith('intro_card_advanced', { card: 2 });
  });

  it('moves to the LightBulb bridge when the cards complete', () => {
    render(<PreAuthWelcomeRoute />);
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(screen.getByTestId('pre-auth-bridge')).toBeTruthy();
    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('intro_completed', {});
  });

  it('bridge renders the LightBulb tagline, supporting copy, and both CTAs', () => {
    render(<PreAuthWelcomeRoute />);
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(
      screen.getByText(/Turn "I don't get it" into "I've got this."/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Create a free account so your mentor can remember your subjects, notes, and progress\./,
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('pre-auth-bridge-primary')).toBeTruthy();
    expect(screen.getByTestId('pre-auth-bridge-secondary')).toBeTruthy();
  });

  it('"Create free account" marks intro seen and replaces to /(auth)/sign-up', () => {
    render(<PreAuthWelcomeRoute />);
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    fireEvent.press(screen.getByTestId('pre-auth-bridge-primary'));
    expect(mockMarkPreAuthIntroSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-up');
  });

  it('"I already have an account" marks intro seen and replaces to /(auth)/sign-in', () => {
    render(<PreAuthWelcomeRoute />);
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    fireEvent.press(screen.getByTestId('pre-auth-bridge-secondary'));
    expect(mockMarkPreAuthIntroSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('hardware-back from the bridge returns to the cards, not app exit', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<PreAuthWelcomeRoute />);
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(screen.getByTestId('pre-auth-bridge')).toBeTruthy();

    // The latest hardwareBackPress handler must be the bridge's — invoking
    // it returns true (consumes the press) and drops back to the cards.
    const calls = addSpy.mock.calls.filter((c) => c[0] === 'hardwareBackPress');
    const latest = calls[calls.length - 1];
    const cb = latest?.[1] as () => boolean;
    let result: boolean | undefined;
    act(() => {
      result = cb();
    });
    expect(result).toBe(true);
    expect(screen.getByTestId('welcome-intro-stub')).toBeTruthy();
    expect(screen.queryByTestId('pre-auth-bridge')).toBeNull();
    addSpy.mockRestore();
  });

  it('does not mark intro seen merely by viewing the cards or bridge', () => {
    render(<PreAuthWelcomeRoute />);
    expect(mockMarkPreAuthIntroSeen).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(mockMarkPreAuthIntroSeen).not.toHaveBeenCalled();
  });
});
