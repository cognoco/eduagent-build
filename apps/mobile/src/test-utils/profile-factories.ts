import type { NavigationProfile } from '../lib/navigation-contract';

export const PROFILE_FACTORY_ISO = '2026-05-21T00:00:00.000Z';
export const PROFILE_FACTORY_ADULT_BIRTH_YEAR = 1985;
export const PROFILE_FACTORY_CHILD_BIRTH_YEAR = 2014;

export function makeProfile(
  overrides: Partial<NavigationProfile> & { id: string },
): NavigationProfile {
  return {
    accountId: '00000000-0000-7000-a000-000000000001',
    avatarUrl: null,
    birthYear: PROFILE_FACTORY_ADULT_BIRTH_YEAR,
    consentStatus: null,
    conversationLanguage: 'en',
    createdAt: PROFILE_FACTORY_ISO,
    defaultAppContext: null,
    displayName: 'Profile',
    hasFamilyLinks: false,
    hasPremiumLlm: false,
    isOwner: true,
    linkCreatedAt: null,
    location: null,
    pronouns: null,
    updatedAt: PROFILE_FACTORY_ISO,
    ...overrides,
  } as NavigationProfile;
}
