/// <reference types="jest" />
// ---------------------------------------------------------------------------
// Shared continuity mock for the v2 profile-scope seam (WI-867).
//
// After the IDENTITY_V2_ENABLED collapse, profile-scope middleware resolves the
// caller via `findOwnerPersonScope` (auto-resolve, no X-Profile-Id) and
// `getPersonScope` (explicit X-Profile-Id) from
// `services/identity-v2/profile-v2`. Both resolve through `db.select()` join
// chains that the unit mock DB cannot satisfy per-query (one polymorphic chain
// serves many selects, so it can't return an owner row for THIS query without
// corrupting the handler's other selects) -- so the real impl genuinely cannot
// run in a unit test.
//
// This is NOT new mock debt: pre-collapse these suites already mocked the LEGACY
// equivalent (`services/profile` `findOwnerProfile` / `getProfile`). This is the
// same mock under the renamed v2 function -- continuity. The real resolution is
// exercised by the identity integration suite.
//
// Usage (per test file -- `jest.mock` is hoisted, so the mock fns MUST be
// `mock`-prefixed consts; the file-relative path can't be centralized, but the
// `personScope` shape can):
//
//   const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(personScope());
//   const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
//   jest.mock(
//     '../services/identity-v2/profile-v2', // gc1-allow: continuity -- replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite
//     () => ({
//       ...jest.requireActual('../services/identity-v2/profile-v2'),
//       findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
//       getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
//     }),
//   );
//   // non-owner / explicit-profile case:
//   mockGetPersonScope.mockResolvedValue(
//     personScope({ profileId: NON_OWNER_PROFILE_ID, isOwner: false }),
//   );
// ---------------------------------------------------------------------------

export interface PersonScopeOverrides {
  profileId?: string;
  birthYear?: number | null;
  location?: string | null;
  consentStatus?: string | null;
  isOwner?: boolean;
  hasPremiumLlm?: boolean;
  conversationLanguage?: string | null;
}

/**
 * Build a `{ profileId, meta }` person-scope matching the byte-identical
 * `ProfileMeta` the profile-scope middleware sets. Owner by default; override
 * `isOwner`/`profileId` for non-owner and explicit-profile cases.
 */
export function personScope(overrides: PersonScopeOverrides = {}) {
  return {
    profileId: overrides.profileId ?? 'test-profile-id',
    meta: {
      birthYear: overrides.birthYear ?? null,
      location: overrides.location ?? null,
      consentStatus: overrides.consentStatus ?? 'CONSENTED',
      hasPremiumLlm: overrides.hasPremiumLlm ?? false,
      conversationLanguage: overrides.conversationLanguage ?? 'en',
      isOwner: overrides.isOwner ?? true,
    },
  };
}
