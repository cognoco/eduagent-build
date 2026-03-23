import * as Sentry from '@sentry/react-native';
import {
  enableSentry,
  disableSentry,
  isSentryEnabled,
  evaluateSentryForProfile,
} from './sentry';

jest.mock('@sentry/react-native', () => {
  const mockClient = { close: jest.fn() };
  return {
    init: jest.fn(),
    getClient: jest.fn(() => mockClient),
  };
});

// Helper: set EXPO_PUBLIC_SENTRY_DSN so the module doesn't no-op
beforeAll(() => {
  (process.env as Record<string, string>).EXPO_PUBLIC_SENTRY_DSN =
    'https://fake@sentry.io/123';
});

beforeEach(() => {
  // Reset internal state by disabling
  disableSentry();
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

  it('disables Sentry by closing client', () => {
    enableSentry();
    disableSentry();
    expect(Sentry.getClient).toHaveBeenCalled();
    expect(isSentryEnabled()).toBe(false);
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
    const birthDate = thirteenYearsAgo.toISOString().split('T')[0];

    evaluateSentryForProfile(birthDate, null);
    expect(isSentryEnabled()).toBe(true);
  });

  it('enables Sentry for under-13 with CONSENTED status', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0];

    evaluateSentryForProfile(birthDate, 'CONSENTED');
    expect(isSentryEnabled()).toBe(true);
  });

  it('disables Sentry for under-13 with PENDING consent', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0];

    evaluateSentryForProfile(birthDate, 'PENDING');
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for under-13 with null consent', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0];

    evaluateSentryForProfile(birthDate, null);
    expect(isSentryEnabled()).toBe(false);
  });

  it('disables Sentry for under-13 when consent is WITHDRAWN', () => {
    // First enable it (simulate consent was previously granted)
    enableSentry();
    expect(isSentryEnabled()).toBe(true);

    const elevenYearsAgo = new Date();
    elevenYearsAgo.setFullYear(elevenYearsAgo.getFullYear() - 11);
    const birthDate = elevenYearsAgo.toISOString().split('T')[0];

    evaluateSentryForProfile(birthDate, 'WITHDRAWN');
    expect(isSentryEnabled()).toBe(false);
  });

  it('enables Sentry for 16+ regardless of consent', () => {
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    const birthDate = twentyYearsAgo.toISOString().split('T')[0];

    evaluateSentryForProfile(birthDate, null);
    expect(isSentryEnabled()).toBe(true);
  });
});
