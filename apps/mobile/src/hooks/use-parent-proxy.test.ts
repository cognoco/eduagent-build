import { renderHook } from '@testing-library/react-native';
import { useParentProxy } from './use-parent-proxy';
import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import type { Profile } from '../lib/profile';

// [ACCOUNT-04] useParentProxy now reads isExplicitProxyMode from ProfileContext
// rather than deriving proxy state from profile shape. SecureStore writes and
// setProxyMode calls are owned by ProfileProvider.switchProfile — the hook is
// a pure reader of context-provided state.

const ownerProfile: Profile = {
  id: 'owner-1',
  accountId: 'test-account-id',
  displayName: 'Parent',
  avatarUrl: null,
  birthYear: 1990,
  birthMonth: null,
  birthDay: null,
  location: null,
  isOwner: true,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const childProfile: Profile = {
  id: 'child-1',
  accountId: 'test-account-id',
  displayName: 'Kid',
  avatarUrl: null,
  birthYear: 2015,
  birthMonth: null,
  birthDay: null,
  location: null,
  isOwner: false,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useParentProxy', () => {
  it('returns isParentProxy=false when active profile is the owner (no explicit proxy)', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
      isExplicitProxyMode: false,
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(false);
    expect(result.current.childProfile).toBeNull();
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('[ACCOUNT-04] returns isParentProxy=false when active profile is non-owner but explicit proxy not set', () => {
    // Plain profile switch into child slot — NOT proxy mode.
    // isExplicitProxyMode defaults to false (not passed = not confirmed via modal).
    const { wrapper } = createHookWrapper({
      activeProfile: childProfile,
      profiles: [ownerProfile, childProfile],
      isExplicitProxyMode: false,
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(false);
    expect(result.current.childProfile).toBeNull();
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('returns isParentProxy=true when explicit proxy mode is set by a retained path', () => {
    // Retained internal/test proxy path:
    // switchProfile(id, { proxyMode: true }).
    const { wrapper } = createHookWrapper({
      activeProfile: childProfile,
      profiles: [ownerProfile, childProfile],
      isExplicitProxyMode: true,
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(true);
    expect(result.current.childProfile).toEqual(childProfile);
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('returns isParentProxy=false for a solo owner account with no children', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
      isExplicitProxyMode: false,
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(false);
  });

  it('returns isParentProxy=false when active profile is null (still loading)', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: null,
      profiles: [ownerProfile, childProfile],
      isExplicitProxyMode: false,
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(false);
    expect(result.current.childProfile).toBeNull();
  });
});
