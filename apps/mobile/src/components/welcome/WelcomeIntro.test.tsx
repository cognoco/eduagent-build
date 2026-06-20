import { BackHandler, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WelcomeIntro, type WelcomeIntroStageColors } from './WelcomeIntro';

const TEST_STAGE_COLORS = {
  background: 'test-stage-background',
} as const satisfies WelcomeIntroStageColors;

const translations: Record<string, string> = {
  // Learner deck
  'welcomeIntro.learner.card1.headline': 'A mentor you can talk to',
  'welcomeIntro.learner.card1.supporting':
    'Ask where you are stuck. Get help that adapts to how you learn.',
  'welcomeIntro.learner.card2.headline':
    'Remembers you, picks up where you left off',
  'welcomeIntro.learner.card2.supporting':
    'Subjects, notes, and pace stay together so you can come back smoothly.',
  'welcomeIntro.learner.card3.headline': 'Built for real learning',
  'welcomeIntro.learner.card3.supporting':
    'Clear explanations, guided questions, and practice that sticks.',
  // Parent deck
  'welcomeIntro.parent.card1.headline': 'A personal mentor for your child',
  'welcomeIntro.parent.card1.supporting':
    'Guides the method and checks their work, without handing over answers to copy.',
  'welcomeIntro.parent.card2.headline':
    'Stay in the loop, step in when it matters',
  'welcomeIntro.parent.card2.supporting':
    'See progress and step in when your child actually needs you.',
  'welcomeIntro.parent.card3.headline': 'No more homework battles',
  'welcomeIntro.parent.card3.supporting':
    'Turn nightly fights into calmer, more useful study time.',
  // Learner scenes
  'welcomeIntro.scene.learner.card1.learner': 'I do not get this yet.',
  'welcomeIntro.scene.learner.card1.mentor':
    "Let's slow it down. What part feels confusing?",
  'welcomeIntro.scene.learner.card2.subjects.math': 'Math',
  'welcomeIntro.scene.learner.card2.subjects.history': 'History',
  'welcomeIntro.scene.learner.card2.subjects.spanish': 'Spanish',
  'welcomeIntro.scene.learner.card2.resume.label': 'Last time',
  'welcomeIntro.scene.learner.card2.resume.body':
    'You wrapped up Cells & DNA basics',
  'welcomeIntro.scene.learner.card3.chips.explain': 'Clear explanation',
  'welcomeIntro.scene.learner.card3.chips.think': 'Think it through',
  'welcomeIntro.scene.learner.card3.chips.practice': 'Practice in context',
  'welcomeIntro.scene.learner.card3.chips.remember': 'Remember it later',
  // Parent scenes
  'welcomeIntro.scene.parent.card1.child': "I'm stuck on question 3.",
  'welcomeIntro.scene.parent.card1.mentor':
    "Let's start with what you've tried. Walk me through step one.",
  'welcomeIntro.scene.parent.card2.thisWeek.label': 'This week',
  'welcomeIntro.scene.parent.card2.thisWeek.body': '4 sessions, 2 subjects',
  'welcomeIntro.scene.parent.card2.strong.label': 'Going well',
  'welcomeIntro.scene.parent.card2.strong.body': 'Fractions are clicking',
  'welcomeIntro.scene.parent.card2.review.label': 'Could use you',
  'welcomeIntro.scene.parent.card2.review.body': 'Long division — stuck twice',
  'welcomeIntro.scene.parent.card3.chips.evenings': 'Calmer evenings',
  'welcomeIntro.scene.parent.card3.chips.nagging': 'Less nagging',
  'welcomeIntro.scene.parent.card3.chips.quality': 'Quality time',
  'welcomeIntro.sceneFrame.brandLabel': 'StudyShell',
  // Shared
  'welcomeIntro.next': 'Next',
  'welcomeIntro.letsStart': "Let's start",
  'welcomeIntro.a11y.previous': 'Previous card',
  'welcomeIntro.a11y.next': 'Next card',
  'welcomeIntro.a11y.dots': 'Page {{current}} of {{total}}',
};

jest.mock(
  'react-i18next',
  /* gc1-allow: external-boundary — i18n library */ () => ({
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        let val = translations[key] ?? key;
        if (opts) {
          Object.entries(opts).forEach(([k, v]) => {
            val = val.replace(`{{${k}}}`, String(v));
          });
        }
        return val;
      },
    }),
  }),
);

jest.mock(
  'react-native-safe-area-context',
  /* gc1-allow: external-boundary — native module needing host bridge */ () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../lib/theme' /* gc1-allow: ThemeProvider requires ThemeContext + accent-preset hooks the unit test does not exercise; stub returns stable color object for deterministic rendering */,
  () => ({
    useThemeColors: () => ({
      background: '#000',
      surface: '#111',
      surfaceElevated: '#222',
      textPrimary: '#fff',
      textSecondary: '#aaa',
      textInverse: '#000',
      accent: '#0af',
      border: '#333',
    }),
  }),
);

describe('<WelcomeIntro audience="learner" />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the 3 learner cards with the learner headlines', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-card-1')).toBeTruthy();
    expect(screen.getByText('A mentor you can talk to')).toBeTruthy();
    expect(
      screen.getByText('Remembers you, picks up where you left off'),
    ).toBeTruthy();
    expect(screen.getByText('Built for real learning')).toBeTruthy();
    // Only 3 cards — no 4th.
    expect(screen.queryByTestId('welcome-card-4')).toBeNull();
  });

  it('renders a stable scene slot per learner card', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-card-1-scene')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-2-scene')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-3-scene')).toBeTruthy();
  });

  it('lets each card scroll vertically on short screens', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    const card = screen.getByTestId('welcome-card-1');
    expect(StyleSheet.flatten(card.props.contentContainerStyle)).toEqual(
      expect.objectContaining({
        minHeight: '100%',
        paddingVertical: 24,
      }),
    );
  });

  it('frames each learner scene as a mini app screen', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-card-1-scene-frame')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-2-scene-frame')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-3-scene-frame')).toBeTruthy();
  });

  it('learner card 1 shows the mentor-chat exchange', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    expect(screen.getByText('I do not get this yet.')).toBeTruthy();
    expect(
      screen.getByText("Let's slow it down. What part feels confusing?"),
    ).toBeTruthy();
  });

  it('reaches the "Let\'s start" CTA after 2 Next taps (3 cards total)', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(screen.getByTestId('welcome-start-button')).toBeTruthy();
    expect(screen.queryByTestId('welcome-next-button')).toBeNull();
  });

  it('calls onComplete from the final learner card', () => {
    const onComplete = jest.fn();
    render(<WelcomeIntro audience="learner" onComplete={onComplete} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-start-button'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('exposes a "Page 1 of 3" a11y label', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-dots').props.accessibilityLabel).toBe(
      'Page 1 of 3',
    );
  });
});

describe('<WelcomeIntro audience="parent" />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the 3 parent cards with the parent headlines', () => {
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    expect(screen.getByText('A personal mentor for your child')).toBeTruthy();
    expect(
      screen.getByText('Stay in the loop, step in when it matters'),
    ).toBeTruthy();
    expect(screen.getByText('No more homework battles')).toBeTruthy();
    expect(screen.queryByTestId('welcome-card-4')).toBeNull();
  });

  it('parent card 1 supporting copy is truthful about homework help (no answer hand-over)', () => {
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    expect(
      screen.getByText(/without handing over answers to copy/),
    ).toBeTruthy();
  });

  it('parent card 1 shows a child-homework chat where the mentor guides, not answers', () => {
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    expect(screen.getByText("I'm stuck on question 3.")).toBeTruthy();
    expect(
      screen.getByText(
        "Let's start with what you've tried. Walk me through step one.",
      ),
    ).toBeTruthy();
  });

  it('frames each parent scene as a mini app screen', () => {
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-card-1-scene-frame')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-2-scene-frame')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-3-scene-frame')).toBeTruthy();
  });

  it('parent card 2 shows a progress overview', () => {
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Going well')).toBeTruthy();
    expect(screen.getByText('Could use you')).toBeTruthy();
  });

  it('parent card 3 shows the quality-time payoff chips', () => {
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    expect(screen.getByText('Calmer evenings')).toBeTruthy();
    expect(screen.getByText('Less nagging')).toBeTruthy();
    expect(screen.getByText('Quality time')).toBeTruthy();
  });

  it('calls onComplete from the final parent card', () => {
    const onComplete = jest.fn();
    render(<WelcomeIntro audience="parent" onComplete={onComplete} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-start-button'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('<WelcomeIntro /> shared behaviour', () => {
  it('uses the supplied brand-stage background for the welcome moment', () => {
    render(
      <WelcomeIntro
        audience="learner"
        onComplete={jest.fn()}
        stageColors={TEST_STAGE_COLORS}
      />,
    );
    const style = StyleSheet.flatten(
      screen.getByTestId('welcome-intro').props.style,
    );
    expect(style.backgroundColor).toBe(TEST_STAGE_COLORS.background);
  });

  it('uses the translated brand label inside the mini app scene frame', () => {
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    expect(screen.getAllByText('StudyShell').length).toBeGreaterThan(0);
    expect(screen.queryByText('MentoMate')).toBeNull();
  });

  it('hardware-back on card 1 is a no-op (returns true)', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<WelcomeIntro audience="learner" onComplete={jest.fn()} />);
    const lastCall = addSpy.mock.calls[addSpy.mock.calls.length - 1];
    expect(lastCall?.[0]).toBe('hardwareBackPress');
    const cb = lastCall?.[1] as () => boolean;
    expect(cb()).toBe(true);
    expect(screen.getByTestId('welcome-next-button')).toBeTruthy();
    addSpy.mockRestore();
  });

  it('advances and reports card index via onCardAdvanced', () => {
    const onCardAdvanced = jest.fn();
    render(
      <WelcomeIntro
        audience="learner"
        onComplete={jest.fn()}
        onCardAdvanced={onCardAdvanced}
      />,
    );
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(onCardAdvanced).toHaveBeenCalledWith(2);
  });

  it('calls onBackFromFirstCard when hardware-back is pressed on card 1', () => {
    const onBackFromFirstCard = jest.fn();
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(
      <WelcomeIntro
        audience="learner"
        onComplete={jest.fn()}
        onBackFromFirstCard={onBackFromFirstCard}
      />,
    );
    const cb = addSpy.mock.calls[addSpy.mock.calls.length - 1]?.[1] as () =>
      | boolean
      | undefined;
    act(() => {
      expect(cb()).toBe(true);
    });
    expect(onBackFromFirstCard).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  it('reports hardware-back stepping back one card on card 2', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<WelcomeIntro audience="parent" onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(screen.getByTestId('welcome-card-2')).toBeTruthy();
    const calls = addSpy.mock.calls;
    const cb = calls[calls.length - 1]?.[1] as () => boolean;
    act(() => {
      expect(cb()).toBe(true);
    });
    expect(screen.getByTestId('welcome-intro')).toBeTruthy();
    addSpy.mockRestore();
  });
});
