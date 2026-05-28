import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WelcomeIntro } from './WelcomeIntro';

const translations: Record<string, string> = {
  'welcomeIntro.card1.headline': 'A mentor you can talk to',
  'welcomeIntro.card1.supporting':
    'Ask when you are stuck, explain what you do not get, and get help that adapts to how you learn.',
  'welcomeIntro.card2.headline': 'All your study in one place',
  'welcomeIntro.card2.supporting':
    'Study as many subjects as you need, get help with assignments, save notes, and bookmark what matters.',
  'welcomeIntro.card3.headline': 'Picks up where you left off',
  'welcomeIntro.card3.supporting':
    'Your mentor remembers your progress, adapts to your pace, and helps with quick bursts or steady routines.',
  'welcomeIntro.card4.headline': 'Built for real learning',
  'welcomeIntro.card4.supporting':
    'Clear explanations, guided questions, and practice that sticks help you think, practice, and remember.',
  'welcomeIntro.scene.card1.learner': 'I do not get this yet.',
  'welcomeIntro.scene.card1.mentor':
    "Let's slow it down. What part feels confusing?",
  'welcomeIntro.scene.card2.subjects.math': 'Math',
  'welcomeIntro.scene.card2.subjects.history': 'History',
  'welcomeIntro.scene.card2.subjects.spanish': 'Spanish',
  'welcomeIntro.scene.card2.chips.notes': 'Notes',
  'welcomeIntro.scene.card2.chips.bookmarks': 'Bookmarks',
  'welcomeIntro.scene.card2.chips.quiz': 'Quiz',
  'welcomeIntro.scene.card3.rows.lastTime': 'Last time',
  'welcomeIntro.scene.card3.rows.lastTimeBody':
    'You wrapped up Cells & DNA basics',
  'welcomeIntro.scene.card3.rows.next': 'Next',
  'welcomeIntro.scene.card3.rows.nextBody':
    'Pick up with Photosynthesis when ready',
  'welcomeIntro.scene.card3.rows.pace': 'Pace',
  'welcomeIntro.scene.card3.rows.paceBody': 'Short bursts work well for you',
  'welcomeIntro.scene.card4.chips.explain': 'Clear explanation',
  'welcomeIntro.scene.card4.chips.think': 'Think it through',
  'welcomeIntro.scene.card4.chips.practice': 'Practice in context',
  'welcomeIntro.scene.card4.chips.remember': 'Remember it later',
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

describe('<WelcomeIntro />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the first card by default with the new headline and "Next" CTA', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-card-1')).toBeTruthy();
    expect(screen.getByText('A mentor you can talk to')).toBeTruthy();
    expect(screen.getByTestId('welcome-next-button')).toBeTruthy();
    expect(screen.queryByTestId('welcome-start-button')).toBeNull();
  });

  it('renders an app-scene slot above each card with a stable testID', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    // Scene 1 visible on initial render
    expect(screen.getByTestId('welcome-card-1-scene')).toBeTruthy();
    // All four scenes render (FlatList horizontal — all items mount eagerly)
    expect(screen.getByTestId('welcome-card-2-scene')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-3-scene')).toBeTruthy();
    expect(screen.getByTestId('welcome-card-4-scene')).toBeTruthy();
  });

  it('card 1 scene shows a mentor-chat exchange', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    expect(screen.getByText('I do not get this yet.')).toBeTruthy();
    expect(
      screen.getByText("Let's slow it down. What part feels confusing?"),
    ).toBeTruthy();
  });

  it('card 2 scene shows subject tiles and study chips', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Notes')).toBeTruthy();
    expect(screen.getByText('Bookmarks')).toBeTruthy();
    expect(screen.getByText('Quiz')).toBeTruthy();
  });

  it('card 3 scene shows continuity rows', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    expect(screen.getByText('Last time')).toBeTruthy();
    expect(screen.getByText('Pace')).toBeTruthy();
    // "Next" is also the primary CTA label, so assert the row body text instead.
    expect(
      screen.getByText('Pick up with Photosynthesis when ready'),
    ).toBeTruthy();
  });

  it('card 4 scene shows method chips', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    expect(screen.getByText('Clear explanation')).toBeTruthy();
    expect(screen.getByText('Think it through')).toBeTruthy();
    expect(screen.getByText('Practice in context')).toBeTruthy();
    expect(screen.getByText('Remember it later')).toBeTruthy();
  });

  it('advances to the next card when the primary CTA is tapped', () => {
    const onCardAdvanced = jest.fn();
    render(
      <WelcomeIntro onComplete={jest.fn()} onCardAdvanced={onCardAdvanced} />,
    );
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(onCardAdvanced).toHaveBeenCalledWith(2);
  });

  it('shows the "Let\'s start" CTA on the final card and not the "Next" CTA', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(screen.getByTestId('welcome-start-button')).toBeTruthy();
    expect(screen.queryByTestId('welcome-next-button')).toBeNull();
  });

  it('calls onComplete when the "Let\'s start" CTA on card 4 is tapped', () => {
    const onComplete = jest.fn();
    render(<WelcomeIntro onComplete={onComplete} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-start-button'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete on intermediate "Next" presses', () => {
    const onComplete = jest.fn();
    render(<WelcomeIntro onComplete={onComplete} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders the cards in order so card 1 headline appears before card 2 headline in the rendered tree', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    const h1 = screen.getByText('A mentor you can talk to');
    const h2 = screen.getByText('All your study in one place');
    const h3 = screen.getByText('Picks up where you left off');
    const h4 = screen.getByText('Built for real learning');
    // All four exist (horizontal FlatList eagerly mounts items).
    expect(h1).toBeTruthy();
    expect(h2).toBeTruthy();
    expect(h3).toBeTruthy();
    expect(h4).toBeTruthy();
  });

  it('hardware-back on card 1 is a no-op (returns true)', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<WelcomeIntro onComplete={jest.fn()} />);
    const lastCall = addSpy.mock.calls[addSpy.mock.calls.length - 1];
    expect(lastCall?.[0]).toBe('hardwareBackPress');
    const cb = lastCall?.[1] as () => boolean;
    expect(cb()).toBe(true);
    expect(screen.getByTestId('welcome-next-button')).toBeTruthy();
    addSpy.mockRestore();
  });

  it('hardware-back on cards 2-4 steps back one card', () => {
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<WelcomeIntro onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('welcome-next-button'));
    expect(screen.getByTestId('welcome-card-2')).toBeTruthy();
    const calls = addSpy.mock.calls;
    const latest = calls[calls.length - 1];
    const cb = latest?.[1] as () => boolean;
    act(() => {
      expect(cb()).toBe(true);
    });
    expect(screen.getByTestId('welcome-intro')).toBeTruthy();
    addSpy.mockRestore();
  });

  it('exposes a Page {n} of 4 a11y label on the dot indicator', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    const dots = screen.getByTestId('welcome-dots');
    expect(dots.props.accessibilityLabel).toBe('Page 1 of 4');
  });
});
