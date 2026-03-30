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
  it('enables Sentry when no birthDate (adult assumed)', () => {
    evaluateSentryForProfile(null, null);
    expect(isSentryEnabled()).toBe(true);
  });

  it('enables Sentry for user aged 13+', () => {
    const thirteenYearsAgo = new Date();
    thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 14);
    const birthDate = thirteenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, null);
    expect(isSentryEnabled()).toBe(true);
  });

  it('enables Sentry for under-13 with CONSENTED status', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, 'CONSENTED');
    expect(isSentryEnabled()).toBe(true);
  });

  it('disables Sentry for under-13 with PENDING consent', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, 'PENDING');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for under-13 with null consent', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, null);
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for under-13 when consent is WITHDRAWN', () => {
    // First enable it (simulate consent was previously granted)
    enableSentry();
    expect(isSentryEnabled()).toBe(true);

    const elevenYearsAgo = new Date();
    elevenYearsAgo.setFullYear(elevenYearsAgo.getFullYear() - 11);
    const birthDate = elevenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, 'WITHDRAWN');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for 14-year-old with PENDING consent', () => {
    const fourteenYearsAgo = new Date();
    fourteenYearsAgo.setFullYear(fourteenYearsAgo.getFullYear() - 14);
    const birthDate = fourteenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, 'PENDING');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for 14-year-old with WITHDRAWN consent', () => {
    enableSentry();
    expect(isSentryEnabled()).toBe(true);

    const fourteenYearsAgo = new Date();
    fourteenYearsAgo.setFullYear(fourteenYearsAgo.getFullYear() - 14);
    const birthDate = fourteenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, 'WITHDRAWN');
    expect(isSentryEnabled()).toBe(false);
  });

  it('enables Sentry for 14-year-old with CONSENTED status', () => {
    const fourteenYearsAgo = new Date();
    fourteenYearsAgo.setFullYear(fourteenYearsAgo.getFullYear() - 14);
    const birthDate = fourteenYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, 'CONSENTED');
    expect(isSentryEnabled()).toBe(true);
  });

  it('enables Sentry for 16+ regardless of consent', () => {
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    const birthDate = twentyYearsAgo.toISOString().split('T')[0]!;

    evaluateSentryForProfile(birthDate, null);
    expect(isSentryEnabled()).toBe(true);
  });
});
