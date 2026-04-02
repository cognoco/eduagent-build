import * as Sentry from '@sentry/react-native';
import {
  enableSentry,
  disableSentry,
  isSentryEnabled,
  evaluateSentryForProfile,
  _resetSentryState,
} from './sentry';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  getClient: jest.fn(),
  setUser: jest.fn(),
}));

// Helper: set EXPO_PUBLIC_SENTRY_DSN so the module doesn't no-op
beforeAll(() => {
  (process.env as Record<string, string>).EXPO_PUBLIC_SENTRY_DSN =
    'https://fake@sentry.io/123';
});

beforeEach(() => {
  _resetSentryState();
  jest.clearAllMocks();
});

describe('enableSentry / disableSentry', () => {
  it('initializes Sentry on first call', () => {
    enableSentry();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(isSentryEnabled()).toBe(true);
  });

  it('does not re-initialize if already enabled', () => {
    enableSentry();
    enableSentry();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });

  it('disables Sentry and clears user', () => {
    enableSentry();
    disableSentry();
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
    expect(isSentryEnabled()).toBe(false);
  });

  it('does not call init() twice after disable → re-enable', () => {
    enableSentry();
    disableSentry();
    enableSentry();
    // init() called once total — re-enable uses beforeSend gate
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(isSentryEnabled()).toBe(true);
  });
});

describe('evaluateSentryForProfile', () => {
  it('enables Sentry when no birthYear (adult assumed)', () => {
    evaluateSentryForProfile(null, null);
    expect(isSentryEnabled()).toBe(true);
  });

  it('enables Sentry for user aged 13+', () => {
    const birthYear = new Date().getFullYear() - 14;

    evaluateSentryForProfile(birthYear, null);
    expect(isSentryEnabled()).toBe(true);
  });

  it('enables Sentry for under-13 with CONSENTED status', () => {
    const birthYear = new Date().getFullYear() - 10;

    evaluateSentryForProfile(birthYear, 'CONSENTED');
    expect(isSentryEnabled()).toBe(true);
  });

  it('disables Sentry for under-13 with PENDING consent', () => {
    const birthYear = new Date().getFullYear() - 10;

    evaluateSentryForProfile(birthYear, 'PENDING');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for under-13 with null consent', () => {
    const birthYear = new Date().getFullYear() - 10;

    evaluateSentryForProfile(birthYear, null);
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for under-13 when consent is WITHDRAWN', () => {
    // First enable it (simulate consent was previously granted)
    enableSentry();
    expect(isSentryEnabled()).toBe(true);

    const birthYear = new Date().getFullYear() - 11;

    evaluateSentryForProfile(birthYear, 'WITHDRAWN');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for 14-year-old with PENDING consent', () => {
    const birthYear = new Date().getFullYear() - 14;

    evaluateSentryForProfile(birthYear, 'PENDING');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for 14-year-old with WITHDRAWN consent', () => {
    enableSentry();
    expect(isSentryEnabled()).toBe(true);

    const birthYear = new Date().getFullYear() - 14;

    evaluateSentryForProfile(birthYear, 'WITHDRAWN');
    expect(isSentryEnabled()).toBe(false);
  });

  it('enables Sentry for 14-year-old with CONSENTED status', () => {
    const birthYear = new Date().getFullYear() - 14;

    evaluateSentryForProfile(birthYear, 'CONSENTED');
    expect(isSentryEnabled()).toBe(true);
  });

  it('disables Sentry for 16-year-old with WITHDRAWN consent', () => {
    enableSentry();
    const birthYear = new Date().getFullYear() - 16;

    evaluateSentryForProfile(birthYear, 'WITHDRAWN');
    expect(isSentryEnabled()).toBe(false);
  });

  it('enables Sentry for 17+ regardless of consent', () => {
    const birthYear = new Date().getFullYear() - 20;

    evaluateSentryForProfile(birthYear, null);
    expect(isSentryEnabled()).toBe(true);
  });
});
