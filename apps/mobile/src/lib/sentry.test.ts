import * as Sentry from '@sentry/react-native';
import {
  enableSentry,
  disableSentry,
  isSentryEnabled,
  evaluateSentryForProfile,
  _resetSentryState,
} from './sentry';

// [BUG-555] — Sentry user scope on profile switch

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  getClient: jest.fn(),
  setUser: jest.fn(),
  getCurrentScope: jest.fn(() => ({ clear: jest.fn() })),
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

// ---------------------------------------------------------------------------
// WI-316 — COPPA boundary: year-only age overestimates, gate must use <= 13
// ---------------------------------------------------------------------------

describe('WI-316 — COPPA rounding boundary', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[break-test] year-only age-13 child (born late in year, actually 12) is treated as under-13', () => {
    // A child born on Dec 31 of (currentYear - 13) computes as
    // year-only age = 13, but is actually still 12. The gate must use
    // age <= 13 so this child lands in the COPPA branch (disabled unless CONSENTED).
    const birthYear = new Date().getUTCFullYear() - 13;
    // child is "age 13" by year-only, but we're testing that the gate
    // treats year-only-13 as potentially under-13 (uses <= not <).
    evaluateSentryForProfile(birthYear, null); // no consent
    // Should be DISABLED (under-13 COPPA branch), not enabled as 13-year-old.
    expect(isSentryEnabled()).toBe(false);
  });

  it('[break-test] year-only age-13 with CONSENTED is enabled (parent consented)', () => {
    const birthYear = new Date().getUTCFullYear() - 13;
    evaluateSentryForProfile(birthYear, 'CONSENTED');
    expect(isSentryEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// [BUG-555] Sentry user scope on profile switch
//
// Root cause: on profile switch (parent↔child proxy mode), evaluateSentryForProfile
// is the only call that fires — but it never called Sentry.setUser, so Sentry
// events continued to report under the previously set user identity.
//
// Fix: evaluateSentryForProfile now accepts a profileId param and calls
// Sentry.setUser({ id: profileId }) on every enable path, and relies on
// disableSentry() (which already calls setUser(null)) on every disable path.
// ---------------------------------------------------------------------------

describe('[BUG-555] evaluateSentryForProfile — Sentry user scope on profile switch', () => {
  it('[break-test] calls Sentry.setUser with profileId when enabling for adult', () => {
    const birthYear = new Date().getFullYear() - 25;
    evaluateSentryForProfile(birthYear, null, 'profile-abc-123');

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'profile-abc-123' });
    expect(isSentryEnabled()).toBe(true);
  });

  it('[break-test] calls Sentry.setUser with new profileId on profile switch', () => {
    const birthYear = new Date().getFullYear() - 25;

    // Parent profile
    evaluateSentryForProfile(birthYear, null, 'parent-profile-id');
    expect(Sentry.setUser).toHaveBeenLastCalledWith({
      id: 'parent-profile-id',
    });

    jest.clearAllMocks();

    // Switch to child profile
    evaluateSentryForProfile(birthYear, null, 'child-profile-id');

    // [break-test] Without the fix, setUser would not be called here and
    // Sentry events would still report under parent-profile-id.
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'child-profile-id' });
  });

  it('[break-test] calls Sentry.setUser(null) when disabling for underage user', () => {
    // First enable with a profile
    const adultBirthYear = new Date().getFullYear() - 25;
    evaluateSentryForProfile(adultBirthYear, null, 'parent-profile-id');
    jest.clearAllMocks();

    // Switch to underage child without consent → disable
    const childBirthYear = new Date().getFullYear() - 10;
    evaluateSentryForProfile(childBirthYear, 'PENDING', 'child-profile-id');

    expect(isSentryEnabled()).toBe(false);
    // disableSentry() calls Sentry.setUser(null)
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });

  it('calls Sentry.setUser(null) when profileId is null (no profile active)', () => {
    const birthYear = new Date().getFullYear() - 25;
    evaluateSentryForProfile(birthYear, null, null);

    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });

  it('calls Sentry.setUser with profileId when consent granted for under-13', () => {
    const birthYear = new Date().getFullYear() - 10;
    evaluateSentryForProfile(birthYear, 'CONSENTED', 'child-profile-id');

    expect(isSentryEnabled()).toBe(true);
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'child-profile-id' });
  });

  it('calls Sentry.setUser with profileId when no birthYear (adult assumed)', () => {
    evaluateSentryForProfile(null, null, 'profile-xyz');

    expect(isSentryEnabled()).toBe(true);
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'profile-xyz' });
  });
});
