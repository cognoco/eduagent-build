import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as introState from '../../lib/intro-state';

const mockReplace = jest.fn();
const mockTrack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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

// Pattern A — preserve the real analytics surface (other exports like
// `emitHomeworkOcrGateEvent` may be referenced by sibling imports during
// module evaluation) while spying on `track`.
jest.mock('../../lib/analytics', () => ({
  ...jest.requireActual('../../lib/analytics'),
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

// Drives the real <WelcomeIntro> from card 1 to completion: three "Next"
// presses walk the FlatList to the final card, then "Let's start" fires
// onComplete and the route transitions to the bridge.
function completeCards(): void {
  fireEvent.press(screen.getByTestId('welcome-next-button')); // card 1 → 2
  fireEvent.press(screen.getByTestId('welcome-next-button')); // card 2 → 3
  fireEvent.press(screen.getByTestId('welcome-next-button')); // card 3 → 4
  fireEvent.press(screen.getByTestId('welcome-start-button')); // complete
}

describe('<PreAuthWelcomeRoute />', () => {
  let markSeenSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockReset();
    mockTrack.mockReset();
    introState.__resetIntroStateForTests();
    // Spy on the real intro-state module (no internal jest.mock): the route's
    // contract is "mark the intro seen", and intro-state's own behaviour (the
    // SecureStore write + Sentry escalation) is covered by intro-state.test.ts.
    // mockImplementation keeps this route-wiring test off the device storage
    // path while still exercising the real import + call site.
    markSeenSpy = jest
      .spyOn(introState, 'markPreAuthIntroSeenSync')
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    markSeenSpy.mockRestore();
  });

  it('renders the welcome cards on first mount', () => {
    render(<PreAuthWelcomeRoute />);
    expect(screen.getByTestId('welcome-intro')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-1')).toBeTruthy();
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
    fireEvent.press(screen.getByTestId('welcome-next-button')); // card 1 → 2
    expect(mockTrack).toHaveBeenCalledWith('intro_card_advanced', { card: 2 });
  });

  it('moves to the LightBulb bridge when the cards complete', () => {
    render(<PreAuthWelcomeRoute />);
    completeCards();
    expect(screen.getByTestId('pre-auth-bridge')).toBeTruthy();
    expect(screen.queryByTestId('welcome-intro')).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('intro_completed', {});
  });

  it('bridge renders the LightBulb tagline, supporting copy, and both CTAs', () => {
    render(<PreAuthWelcomeRoute />);
    completeCards();
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
    completeCards();
    fireEvent.press(screen.getByTestId('pre-auth-bridge-primary'));
    expect(markSeenSpy).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-up');
  });

  it('"I already have an account" marks intro seen and replaces to /(auth)/sign-in', () => {
    render(<PreAuthWelcomeRoute />);
    completeCards();
    fireEvent.press(screen.getByTestId('pre-auth-bridge-secondary'));
    expect(markSeenSpy).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('hardware-back from the bridge returns to the cards, not app exit', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<PreAuthWelcomeRoute />);
    completeCards();
    expect(screen.getByTestId('pre-auth-bridge')).toBeTruthy();

    // The latest hardwareBackPress handler must be the bridge's (the cards'
    // handler is torn down when <WelcomeIntro> unmounts) — invoking it returns
    // true (consumes the press) and drops back to the cards.
    const calls = addSpy.mock.calls.filter((c) => c[0] === 'hardwareBackPress');
    const latest = calls[calls.length - 1];
    const cb = latest?.[1] as () => boolean;
    let result: boolean | undefined;
    act(() => {
      result = cb();
    });
    expect(result).toBe(true);
    expect(screen.getByTestId('welcome-intro')).toBeTruthy();
    expect(screen.queryByTestId('pre-auth-bridge')).toBeNull();
    addSpy.mockRestore();
  });

  it('does not mark intro seen merely by viewing the cards or bridge', () => {
    render(<PreAuthWelcomeRoute />);
    expect(markSeenSpy).not.toHaveBeenCalled();
    completeCards();
    expect(markSeenSpy).not.toHaveBeenCalled();
  });
});
