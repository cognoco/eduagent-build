/**
 * Flag-matrix regression test for computeEntryGateBlocked / useEntryGate.
 *
 * Drives the REAL resolveNavigationContract (no internal jest.mock) to verify
 * that the entry-gate predicate produces identical behavior across all three
 * shipped flag states × proxy/non-proxy — including the profile-load window
 * where activeProfile===null (the H5.1 guard that prevents collapsing to
 * !canEnter()).
 *
 * computeEntryGateBlocked accepts v1Enabled as an explicit parameter so it
 * can be exercised as a pure function without mocking the feature-flags module.
 */

import { computeEntryGateBlocked } from './use-entry-gate';
import {
  resolveNavigationContract,
  type ProfileContext,
} from '../lib/navigation-contract';
import type { NavigationProfile } from '../lib/navigation-contract';

// ---------------------------------------------------------------------------
// Shared profile fixtures
// ---------------------------------------------------------------------------

const ISO = '2026-05-21T00:00:00.000Z';

function makeProfile(
  overrides: Partial<NavigationProfile> & { id: string },
): NavigationProfile {
  return {
    accountId: '00000000-0000-7000-a000-000000000001',
    avatarUrl: null,
    birthYear: 1985,
    consentStatus: null,
    conversationLanguage: 'en',
    createdAt: ISO,
    defaultAppContext: null,
    displayName: 'Profile',
    hasFamilyLinks: false,
    hasPremiumLlm: false,
    isOwner: true,
    linkCreatedAt: null,
    location: null,
    pronouns: null,
    updatedAt: ISO,
    ...overrides,
  } as NavigationProfile;
}

const ADULT_OWNER = makeProfile({ id: 'owner-1' });
const ADULT_FAMILY_OWNER = makeProfile({
  id: 'owner-2',
  hasFamilyLinks: true,
  defaultAppContext: 'study',
});
const CHILD_LINKED = makeProfile({
  id: 'child-1',
  birthYear: 2014,
  isOwner: false,
  linkCreatedAt: ISO,
});

function readySubscription(): ProfileContext['subscription'] {
  return {
    status: 'ready',
    tier: 'free',
    effectiveAccessTier: 'free',
    billingAccess: 'current',
  };
}

// ---------------------------------------------------------------------------
// Flag-state helpers
// ---------------------------------------------------------------------------

type FlagState = 'flags-off' | 'v0-on' | 'v1-on';

function flagsFor(state: FlagState): ProfileContext['flags'] {
  switch (state) {
    case 'flags-off':
      return { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: false };
    case 'v0-on':
      return { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false };
    case 'v1-on':
      return { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: true };
  }
}

function v1Enabled(state: FlagState): boolean {
  return state === 'v1-on';
}

function makeContext(
  state: FlagState,
  overrides: Partial<ProfileContext>,
): ProfileContext {
  return {
    activeProfile: ADULT_OWNER,
    profiles: [ADULT_OWNER],
    isParentProxy: false,
    appContext: 'study',
    role: 'owner',
    subscription: readySubscription(),
    flags: flagsFor(state),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: derive gate result through the REAL contract
// ---------------------------------------------------------------------------

function gate(
  flagState: FlagState,
  contextOverrides: Partial<ProfileContext>,
): boolean {
  const context = makeContext(flagState, {
    ...contextOverrides,
    flags: flagsFor(flagState),
  });
  const contract = resolveNavigationContract(context);
  return computeEntryGateBlocked(
    contract,
    'session',
    undefined,
    v1Enabled(flagState),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeEntryGateBlocked — flag-matrix regression (session route)', () => {
  /**
   * Non-proxy adult owner with a loaded profile.
   * Expected: allowed (not blocked) in all three flag states.
   */
  describe('non-proxy, profile loaded', () => {
    it.each<[FlagState]>([['flags-off'], ['v0-on'], ['v1-on']])(
      '%s: adult owner is NOT blocked',
      (flagState) => {
        expect(
          gate(flagState, {
            activeProfile: ADULT_OWNER,
            profiles: [ADULT_OWNER],
            isParentProxy: false,
            appContext: 'study',
            role: 'owner',
          }),
        ).toBe(false);
      },
    );
  });

  /**
   * Parent-proxy active — expected blocked in all three flag states.
   * V0/flags-off arm: isParentProxy=true → blocked.
   * V1 arm: canEnter returns false for proxy users → blocked.
   */
  describe('parent-proxy, profile loaded', () => {
    it.each<[FlagState]>([['flags-off'], ['v0-on'], ['v1-on']])(
      '%s: parent-proxy IS blocked',
      (flagState) => {
        expect(
          gate(flagState, {
            activeProfile: ADULT_FAMILY_OWNER,
            profiles: [ADULT_FAMILY_OWNER, CHILD_LINKED],
            isParentProxy: true,
            appContext: 'family',
            role: 'owner',
          }),
        ).toBe(true);
      },
    );
  });

  /**
   * Profile-load window: activeProfile===null, isParentProxy=false.
   *
   * Under V0/flags-off: the arm reads isParentProxy (false) → NOT blocked.
   *   This is the H5.1 guard — collapsing to !canEnter() would return blocked
   *   here because canEnter returns false when activeProfile===null. That would
   *   cause cold deep-links to redirect to /home. The flag branch keeps the
   *   V0/flags-off arm on isParentProxy instead, preserving allow-through.
   *
   * Under V1: canEnter() with null profile returns only route==='home' → blocked.
   *   V1 consistently blocks during profile-load (safe because V1 lazy-loads
   *   and re-renders once the profile arrives, so the block is transient).
   */
  describe('profile-load window (activeProfile===null)', () => {
    const profileLoadOverrides: Partial<ProfileContext> = {
      activeProfile: null,
      profiles: [],
      isParentProxy: false,
      appContext: null,
      role: null,
      subscription: {
        status: 'loading',
        tier: null,
        effectiveAccessTier: null,
        billingAccess: null,
      },
    };

    it('flags-off: NOT blocked during profile-load (isParentProxy=false arm preserves allow-through)', () => {
      expect(gate('flags-off', profileLoadOverrides)).toBe(false);
    });

    it('v0-on: NOT blocked during profile-load (same isParentProxy arm as flags-off)', () => {
      expect(gate('v0-on', profileLoadOverrides)).toBe(false);
    });

    it('v1-on: IS blocked during profile-load (canEnter returns false when activeProfile===null)', () => {
      expect(gate('v1-on', profileLoadOverrides)).toBe(true);
    });
  });

  /**
   * Profile-load window with isParentProxy=true (proxy flag can arrive before
   * profile resolves). All flag states → blocked.
   */
  describe('profile-load window, isParentProxy=true', () => {
    const proxyLoadOverrides: Partial<ProfileContext> = {
      activeProfile: null,
      profiles: [],
      isParentProxy: true,
      appContext: null,
      role: null,
      subscription: {
        status: 'loading',
        tier: null,
        effectiveAccessTier: null,
        billingAccess: null,
      },
    };

    it.each<[FlagState]>([['flags-off'], ['v0-on'], ['v1-on']])(
      '%s: IS blocked when proxy is true even during profile-load',
      (flagState) => {
        expect(gate(flagState, proxyLoadOverrides)).toBe(true);
      },
    );
  });
});
