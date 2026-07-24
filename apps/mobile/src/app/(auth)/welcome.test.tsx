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
  '../../components/welcome/WelcomeIntro', // gc1-allow: route state-machine test; real deck swipes are covered in WelcomeIntro.test.tsx
  () => ({
    WelcomeIntro: ({
      audience,
      onComplete,
      onCardAdvanced,
      stageColors,
      onBackFromFirstCard,
    }: {
      audience: 'learner' | 'parent';
      onComplete: () => void;
      onCardAdvanced?: (n: number) => void;
      stageColors?: { background?: string };
      onBackFromFirstCard?: () => void;
    }) => {
      const { View, Pressable, Text } = require('react-native');
      return (
        <View testID="welcome-intro-stub">
          <Text testID="welcome-intro-stub-audience">{audience}</Text>
          <Text testID="welcome-intro-stub-stage-bg">
            {stageColors?.background}
          </Text>
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
jest.mock(
  '../../lib/pre-auth-audience' /* gc1-allow: pattern-a conversion; pre-auth-audience reads SecureStore which is a native storage boundary */,
  () => ({
    ...jest.requireActual('../../lib/pre-auth-audience'),
    markPreAuthAudienceSync: (...args: unknown[]) => mockMarkAudience(...args),
  }),
);

// Pattern A - preserve the real analytics surface while spying on `track`.
jest.mock(
  '../../lib/analytics' /* gc1-allow: pattern-a conversion; analytics is a side-effect boundary — real calls hit external telemetry */,
  () => ({
    ...jest.requireActual('../../lib/analytics'),
    track: (...args: unknown[]) => mockTrack(...args),
  }),
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        'welcomeIntro.chooser.question': 'What brings you here?',
        'welcomeIntro.chooser.learnerCta': 'Learn with a mentor',
        'welcomeIntro.chooser.learnerHint':
          'Your personal mentor for a fraction of the price.',
        'welcomeIntro.chooser.parentCta': 'End homework fights',
        'welcomeIntro.chooser.parentHint': 'Get your evenings back.',
        'welcomeIntro.bridge.headline':
          'Turn "I don\'t get it" into "I\'ve got this."',
        'welcomeIntro.bridge.supporting':
          'Create a free account so your mentor can remember your subjects, notes, and progress.',
        'welcomeIntro.bridge.parentHeadline':
          'Continue with your account to support your learner.',
        'welcomeIntro.bridge.parentSupporting':
          'Sign in or sign up to accept the invitation and set up support. Your account does not grant access to learning activity unless the learner authorizes it.',
        'welcomeIntro.bridge.primaryCta': 'Create free account',
        'welcomeIntro.bridge.secondaryCta': 'I already have an account',
        'welcomeIntro.a11y.bridgePrimary': 'Create a free account',
        'welcomeIntro.a11y.bridgeSecondary': 'Sign in to an existing account',
      };
      return dict[key] ?? key;
    },
  }),
}));

const {
  default: PreAuthWelcomeRoute,
  WELCOME_DARK_STAGE_COLORS,
} = require('./welcome');

function chooseLearner() {
  fireEvent.press(screen.getByTestId('welcome-chooser-learner'));
}
function chooseParent() {
  fireEvent.press(screen.getByTestId('welcome-chooser-parent'));
}

const LEARNER_BRIDGE_HEADLINE = 'Turn "I don\'t get it" into "I\'ve got this."';
const LEARNER_BRIDGE_SUPPORTING =
  'Create a free account so your mentor can remember your subjects, notes, and progress.';
const PARENT_BRIDGE_HEADLINE =
  'Continue with your account to support your learner.';
const PARENT_BRIDGE_SUPPORTING =
  'Sign in or sign up to accept the invitation and set up support. Your account does not grant access to learning activity unless the learner authorizes it.';

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
    expect(screen.getByText('Learn with a mentor')).toBeTruthy();
    expect(
      screen.getByText('Your personal mentor for a fraction of the price.'),
    ).toBeTruthy();
    expect(screen.getByText('End homework fights')).toBeTruthy();
    expect(screen.getByText('Get your evenings back.')).toBeTruthy();
    expect(screen.queryByTestId('welcome-intro-stub')).toBeNull();
    expect(screen.queryByTestId('pre-auth-bridge')).toBeNull();
  });

  it('renders the chooser on the dark brand-stage palette', () => {
    render(<PreAuthWelcomeRoute />);
    expect(screen.getByTestId('welcome-chooser').props.style).toEqual(
      expect.objectContaining({
        backgroundColor: WELCOME_DARK_STAGE_COLORS.background,
      }),
    );
    expect(screen.getByTestId('welcome-chooser-learner').props.style).toEqual(
      expect.objectContaining({
        backgroundColor: WELCOME_DARK_STAGE_COLORS.surfaceElevated,
      }),
    );
  });

  it('emits intro_started exactly once on mount', () => {
    render(<PreAuthWelcomeRoute />);
    const started = mockTrack.mock.calls.filter(
      (c) => c[0] === 'intro_started',
    );
    expect(started.length).toBe(1);
  });

  it('"Learn with a mentor" shows the learner deck and logs the choice', () => {
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

  it('injects the dark brand-stage palette into the card deck', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    expect(
      screen.getByTestId('welcome-intro-stub-stage-bg').props.children,
    ).toBe(WELCOME_DARK_STAGE_COLORS.background);
  });

  it('"End homework fights" shows the parent deck and logs the choice', () => {
    render(<PreAuthWelcomeRoute />);
    chooseParent();
    expect(
      screen.getByTestId('welcome-intro-stub-audience').props.children,
    ).toBe('parent');
    expect(mockTrack).toHaveBeenCalledWith('intro_audience_selected', {
      audience: 'parent',
    });
  });

  it('persists the chosen audience across the signup wall ("Learn with a mentor")', () => {
    render(<PreAuthWelcomeRoute />);
    chooseLearner();
    expect(mockMarkAudience).toHaveBeenCalledWith('learner');
  });

  it('persists the chosen audience across the signup wall ("End homework fights")', () => {
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

  it.each([
    {
      audience: 'learner' as const,
      choose: chooseLearner,
      ctaTestId: 'pre-auth-bridge-primary',
      destination: '/(auth)/sign-up',
      headline: LEARNER_BRIDGE_HEADLINE,
      supporting: LEARNER_BRIDGE_SUPPORTING,
      excludedHeadline: PARENT_BRIDGE_HEADLINE,
      excludedSupporting: PARENT_BRIDGE_SUPPORTING,
    },
    {
      audience: 'learner' as const,
      choose: chooseLearner,
      ctaTestId: 'pre-auth-bridge-secondary',
      destination: '/(auth)/sign-in',
      headline: LEARNER_BRIDGE_HEADLINE,
      supporting: LEARNER_BRIDGE_SUPPORTING,
      excludedHeadline: PARENT_BRIDGE_HEADLINE,
      excludedSupporting: PARENT_BRIDGE_SUPPORTING,
    },
    {
      audience: 'parent' as const,
      choose: chooseParent,
      ctaTestId: 'pre-auth-bridge-primary',
      destination: '/(auth)/sign-up',
      headline: PARENT_BRIDGE_HEADLINE,
      supporting: PARENT_BRIDGE_SUPPORTING,
      excludedHeadline: LEARNER_BRIDGE_HEADLINE,
      excludedSupporting: LEARNER_BRIDGE_SUPPORTING,
    },
    {
      audience: 'parent' as const,
      choose: chooseParent,
      ctaTestId: 'pre-auth-bridge-secondary',
      destination: '/(auth)/sign-in',
      headline: PARENT_BRIDGE_HEADLINE,
      supporting: PARENT_BRIDGE_SUPPORTING,
      excludedHeadline: LEARNER_BRIDGE_HEADLINE,
      excludedSupporting: LEARNER_BRIDGE_SUPPORTING,
    },
  ])(
    'renders audience-specific bridge copy and preserves the audience through each auth CTA: $audience → $destination',
    ({
      audience,
      choose,
      ctaTestId,
      destination,
      headline,
      supporting,
      excludedHeadline,
      excludedSupporting,
    }) => {
      render(<PreAuthWelcomeRoute />);
      choose();
      fireEvent.press(screen.getByTestId('welcome-intro-stub-complete'));

      expect(screen.getByTestId('pre-auth-bridge').props.style).toEqual(
        expect.objectContaining({
          backgroundColor: WELCOME_DARK_STAGE_COLORS.background,
        }),
      );
      expect(screen.getByText(headline)).toBeTruthy();
      expect(screen.getByText(supporting)).toBeTruthy();
      expect(screen.queryByText(excludedHeadline)).toBeNull();
      expect(screen.queryByText(excludedSupporting)).toBeNull();
      expect(screen.getByTestId('pre-auth-bridge-primary')).toBeTruthy();
      expect(screen.getByTestId('pre-auth-bridge-secondary')).toBeTruthy();
      expect(mockMarkAudience).toHaveBeenCalledTimes(1);
      expect(mockMarkAudience).toHaveBeenCalledWith(audience);

      fireEvent.press(screen.getByTestId(ctaTestId));

      expect(mockMarkAudience).toHaveBeenCalledTimes(1);
      expect(mockMarkPreAuthIntroSeen).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(destination);
    },
  );

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
