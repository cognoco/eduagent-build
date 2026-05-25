import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WelcomeIntro } from './WelcomeIntro';

const translations: Record<string, string> = {
  'welcomeIntro.card1.headline': 'Your notebook fills up as you learn',
  'welcomeIntro.card1.supporting':
    'Notes and what your mentor remembers about you build a study record you can come back to.',
  'welcomeIntro.card2.headline': 'Recaps and progress save automatically',
  'welcomeIntro.card2.supporting':
    "After every session, you'll see what you covered and what's worth revisiting.",
  'welcomeIntro.card3.headline': 'Your mentor remembers you',
  'welcomeIntro.card3.supporting':
    "Tell it once — your interests, how you learn, what's hard — and it carries that forward.",
  'welcomeIntro.card4.headline': 'Built for families',
  'welcomeIntro.card4.supporting':
    'Parents see what their kids worked on and get conversation starters for the week.',
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

  it('renders the first card by default with the "Next" primary CTA', () => {
    render(<WelcomeIntro onComplete={jest.fn()} />);
    expect(screen.getByTestId('welcome-card-1')).toBeTruthy();
    expect(screen.getByTestId('welcome-next-button')).toBeTruthy();
    expect(screen.queryByTestId('welcome-start-button')).toBeNull();
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
