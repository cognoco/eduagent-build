import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockMarkPreAuthIntroSeen = jest.fn();
const mockMarkAudience = jest.fn();
const mockTrack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock(
  '../../components/welcome/WelcomeIntro' /* gc1-allow: WelcomeIntro is covered by its own focused unit test; stub here exposes audience + onComplete + onCardAdvanced so this route test can drive the state machine without simulating swipes */,
  () => ({
    WelcomeIntro: ({
      audience,
      onComplete,
      onCardAdvanced,
      onBackFromFirstCard,
    }: {
      audience: 'learner' | 'parent';
      onComplete: () => void;
      onCardAdvanced?: (n: number) => void;
      onBackFromFirstCard?: () => void;
    }) => {
      const { View, Pressable, Text } = require('react-native');
      return (
        <View testID="welcome-intro-stub">
          <Text testID="welcome-intro-stub-audience">{audience}</Text>
          <Pressable
            testID="welcome-intro-stub-advance"
            onPress={() => onCardAdvanced?.(2)}
          >
            <Text>advance</Text>
          </Pressable>
          <Pressable testID="welcome-intro-stub-complete" onPress={onComplete}>
            <Text>complete</Text>
          </Pressable>
          <Pressable
            testID="welcome-intro-stub-back"
            onPress={() => onBackFromFirstCard?.()}
          >
            <Text>back-from-first</Text>
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

// Pattern A - preserve the real carrier surface while spying on the write.
jest.mock('../../lib/pre-auth-audience', () => ({
  ...jest.requireActual('../../lib/pre-auth-audience'),
  markPreAuthAudienceSync: (...args: unknown[]) => mockMarkAudience(...args),
}));

// Pattern A - preserve the real analytics surface while spying on `track`.
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
        'welcomeIntro.chooser.question': 'What brings you here?',
        'welcomeIntro.chooser.learnerCta': 'I want to learn',
        'welcomeIntro.chooser.learnerHint':
          "Study, homework help, and a mentor that's yours.",
        'welcomeIntro.chooser.parentCta': "I'm done fighting over homework",
        'welcomeIntro.chooser.parentHint':
          'A mentor for your kids - and your evenings back.',
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
    surfaceElevated: '#222',
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textInverse: '#000',
  }),
}));

const PreAuthWelcomeRoute = require('./welcome').default;

function chooseLearner() {
  fireEvent.press(screen.getByTestId('welcome-chooser-learner'));
}
function chooseParent() {
  fireEvent.press(screen.getByTestId('welcome-chooser-parent'));
}

describe('<PreAuthWelcomeRoute /> - audience chooser', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockMarkPreAuthIntroSeen.mockReset();
    mockMarkAudience.mockReset();
    mockTrack.mockReset();
  });

  it('shows the chooser first, not the cards', () => {
    render(<PreAuthWelcomeRoute />);
    expect(screen.getByTestId('welcome-chooser')).toBeTruthy();
    expect(screen.getByTestId('welcome-chooser-learner')).toBeTruthy();
    expect(screen.getByTestId('welcome-chooser-parent')).toBeTruthy();
    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
    expect(screen.queryByTestId('pre-auth-bridge')).toBeNull();
  });

  it('emits intro_started exactly once on mount', () => {
    render(<PreAuthWelcomeRoute />);
    const started = mockTrack.mock.calls.filter(
      (c) => c[0] === 'intro_started',
    );
    expect(started.length).toBe(1);
  });

  it('"I want to learn" shows the learner deck and logs the choice', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    expect(screen.getByTestId('welcome-intro-stub')).toBeTruthy();
    expect(
      screen.getByTestId('welcome-intro-stub-audience').props.children,
    ).toBe('learner');
    expect(mockTrack).toHaveBeenCalledWith('intro_audience_selected', {
      audience: 'learner',
    });
  });

  it('"I\'m done fighting over homework" shows the parent deck and logs the choice', () => {
    render(<PreAuthWelcomeRoute />);
    chooseParent();
    expect(
      screen.getByTestId('welcome-intro-stub-audience').props.children,
    ).toBe('parent');
    expect(mockTrack).toHaveBeenCalledWith('intro_audience_selected', {
      audience: 'parent',
    });
  });

  it('persists the chosen audience across the signup wall ("I want to learn")', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    expect(mockMarkAudience).toHaveBeenCalledWith('learner');
  });

  it('persists the chosen audience across the signup wall ("I\'m done fighting over homework")', () => {
    render(<PreAuthWelcomeRoute />);
    chooseParent();
    expect(mockMarkAudience).toHaveBeenCalledWith('parent');
  });

  it('does not persist an audience until a choice is made', () => {
    render(<PreAuthWelcomeRoute />);
    expect(mockMarkAudience).not.toHaveBeenCalled();
  });

  it('does not mark intro seen at the chooser or while viewing cards', () => {
    render(<PreAuthWelcomeRoute />);
    expect(mockMarkPreAuthIntroSeen).not.toHaveBeenCalled();
    chooseParent();
    expect(mockMarkPreAuthIntroSeen).not.toHaveBeenCalled();
  });
});

describe('<PreAuthWelcomeRoute /> - cards -> bridge -> auth', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockMarkPreAuthIntroSeen.mockReset();
    mockMarkAudience.mockReset();
    mockTrack.mockReset();
  });

  it('forwards card-advance events as intro_card_advanced telemetry', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-advance'));
    expect(mockTrack).toHaveBeenCalledWith('intro_card_advanced', { card: 2 });
  });

  it('moves to the LightBulb bridge when the cards complete', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(screen.getByTestId('pre-auth-bridge')).toBeTruthy();
    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('intro_completed', {});
  });

  it('bridge renders the tagline, supporting copy, and both CTAs', () => {
    render(<PreAuthWelcomeRoute />);
    chooseParent();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(
      screen.getByText(/Turn "I don't get it" into "I've got this."/),
    ).toBeTruthy();
    expect(screen.getByTestId('pre-auth-bridge-primary')).toBeTruthy();
    expect(screen.getByTestId('pre-auth-bridge-secondary')).toBeTruthy();
  });

  it('"Create free account" marks intro seen and replaces to /(auth)/sign-up', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    fireEvent.press(screen.getByTestId('pre-auth-bridge-primary'));
    expect(mockMarkPreAuthIntroSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-up');
  });

  it('"I already have an account" marks intro seen and replaces to /(auth)/sign-in', () => {
    render(<PreAuthWelcomeRoute />);
    chooseParent();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    fireEvent.press(screen.getByTestId('pre-auth-bridge-secondary'));
    expect(mockMarkPreAuthIntroSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('hardware-back from the bridge returns to the cards, not app exit', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));
    expect(screen.getByTestId('pre-auth-bridge')).toBeTruthy();

    const calls = addSpy.mock.calls.filter((c) => c[0] === 'hardwareBackPress');
    const cb = calls[calls.length - 1]?.[1] as () => boolean;
    let result: boolean | undefined;
    act(() => {
      result = cb();
    });
    expect(result).toBe(true);
    expect(screen.getByTestId('welcome-intro-stub')).toBeTruthy();
    expect(screen.queryByTestId('pre-auth-bridge')).toBeNull();
    addSpy.mockRestore();
  });

  it('back from the first card returns to the chooser (via onBackFromFirstCard)', () => {
    render(<PreAuthWelcomeRoute />);
    chooseParent();
    expect(screen.getByTestId('welcome-intro-stub')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('welcome-intro-stub-back'));
    });

    expect(screen.getByTestId('welcome-chooser')).toBeTruthy();
    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
  });
});
