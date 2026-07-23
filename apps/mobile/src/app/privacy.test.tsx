import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () =>
  // native-boundary
  require('../test-utils/native-shims').expoRouterShim({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
);

jest.mock('react-native-safe-area-context', () =>
  // native-boundary
  require('../test-utils/native-shims').safeAreaShim(),
);

jest.mock(
  '../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({ textPrimary: '#111111' }),
  }),
);

const PrivacyPolicyScreen = require('./privacy').default;
const appConfig = require('../../app.json');
const german = require('../i18n/locales/de.json');
const english = require('../i18n/locales/en.json');
const norwegian = require('../i18n/locales/nb.json');
const portuguese = require('../i18n/locales/pt.json');

describe('PrivacyPolicyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('back button calls router.back() when history exists', () => {
    render(<PrivacyPolicyScreen />);

    fireEvent.press(screen.getByTestId('back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('back button replaces more when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<PrivacyPolicyScreen />);

    fireEvent.press(screen.getByTestId('back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('points the app-store privacy policy URL at the live notice', () => {
    expect(appConfig.expo.privacyPolicyUrl).toBe(
      'https://mentomate.com/privacy',
    );
  });

  it('renders the July 2026 eleven-section privacy notice', () => {
    render(<PrivacyPolicyScreen />);

    expect(screen.getByText('Last updated: July 2026')).toBeOnTheScreen();
    expect(
      screen.getByText('7. International Data Transfers'),
    ).toBeOnTheScreen();
    expect(screen.getByText('8. Data Retention')).toBeOnTheScreen();
    expect(screen.getByText('11. Contact')).toBeOnTheScreen();
  });

  it('accurately distinguishes minor and adult name disclosure to AI providers', () => {
    render(<PrivacyPolicyScreen />);

    expect(
      screen.getByText(/For minors, we exclude names and account identifiers/),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        /For unambiguously adult account owners, a display name/,
      ),
    ).toBeOnTheScreen();
  });

  it('states the 13+ launch floor in the active terms copy', () => {
    expect(english.legal.terms.s2Body).toContain('aged 13 and older');
    expect(english.legal.terms.s2Body).not.toContain('11-15');
  });

  it('keeps the reviewed legal translations internally consistent', () => {
    expect(german.legal.privacy.s9Body).toContain('Du hast das Recht');
    expect(german.legal.privacy.s9Body).not.toMatch(/\bSie\b|\bIhre\b/);

    expect(norwegian.legal.privacy.s2Body4).toContain('mikrofontilgang');
    expect(norwegian.legal.privacy.s2Body4).not.toContain('mikfontilgang');
    expect(norwegian.legal.privacy.s4Body2).toContain('7-dagers frist');
    expect(norwegian.legal.privacy.s4Body2).not.toContain('angrefrist');

    const portuguesePrivacy = JSON.stringify(portuguese.legal.privacy);
    expect(portuguese.legal.privacy.s2Title).toBe('2. Dados que Recolhemos');
    expect(portuguese.legal.privacy.s11Body).toContain(
      'responsável pelo tratamento',
    );
    for (const brazilianTerm of [
      'Coletamos',
      'Compartilhamento',
      'Você',
      'controladora',
      'aplicativo',
    ]) {
      expect(portuguesePrivacy).not.toContain(brazilianTerm);
    }
  });

  it('keeps the repository HTML notice blocked on external evidence', () => {
    const policyHtml = readFileSync(
      join(__dirname, '../../../../docs/privacy-policy.html'),
      'utf8',
    );

    expect(policyHtml).toContain('Pre-launch draft');
    expect(policyHtml).toContain('not approved for publication');
    expect(policyHtml).toContain(
      'must be verified for every active provider before learner data is processed in production',
    );
    expect(policyHtml).toContain(
      'Before any international transfer of learner data occurs',
    );
  });
});
