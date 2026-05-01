// ---------------------------------------------------------------------------
// Profile + onboarding schema tests — BKT-C.1 / BKT-C.2 verification
// ---------------------------------------------------------------------------
// Covers the four Verified-by rows from the onboarding-new-dimensions spec:
//   1. conversationLanguage — rejects invalid ISO codes at the Zod boundary
//      (the DB CHECK is a second line of defense; this catches malformed
//      input before it hits the wire)
//   2. pronouns — rejects strings > 32 chars with a typed error
//   3. forward-compat reader — legacy profile rows without conversation_language
//      or pronouns still parse cleanly via the schema defaults
//   4. interests forward-compat — legacy `string[]` learning_profiles rows are
//      normalised to `InterestEntry[]` with context='both' by the preprocessor
// ---------------------------------------------------------------------------

import {
  conversationLanguageSchema,
  pronounsSchema,
  profileSchema,
  onboardingPronounsPatchSchema,
  onboardingLanguagePatchSchema,
  profileUpdateSchema,
  NEW_LEARNER_SESSION_THRESHOLD,
} from './profiles.js';
import {
  interestsArraySchema,
  interestEntrySchema,
} from './learning-profiles.js';

describe('conversationLanguageSchema', () => {
  it('[BKT-C.1] accepts every code in the canonical 8-language enum', () => {
    // These 8 codes are the contract with the mobile language-picker and the
    // DB CHECK constraint in migration 0035. Adding a 9th requires updating
    // all three (schema enum, DB CHECK, language-picker.tsx).
    for (const code of ['en', 'cs', 'es', 'fr', 'de', 'it', 'pt', 'pl']) {
      expect(conversationLanguageSchema.parse(code)).toBe(code);
    }
  });

  it('[BKT-C.1] rejects invalid ISO code at the Zod boundary', () => {
    // Anything outside the enum is a parse error. This is what reaches the
    // DB layer via Hono zValidator before the CHECK constraint ever fires.
    expect(() => conversationLanguageSchema.parse('xx')).toThrow();
    expect(() => conversationLanguageSchema.parse('eng')).toThrow();
    expect(() => conversationLanguageSchema.parse('EN')).toThrow();
    expect(() => conversationLanguageSchema.parse('')).toThrow();
    expect(() => conversationLanguageSchema.parse(null)).toThrow();
  });

  it('[BKT-C.1] rejects arbitrary strings that look ISO-ish', () => {
    // Guard against "english", "spanish" etc. from a hand-rolled client.
    expect(() => conversationLanguageSchema.parse('english')).toThrow();
    expect(() => conversationLanguageSchema.parse('ja')).toThrow(); // valid ISO but not in our supported set
    expect(() => conversationLanguageSchema.parse('zh')).toThrow();
  });
});

describe('pronounsSchema', () => {
  it('[BKT-C.1] accepts common pronoun strings up to 32 chars', () => {
    expect(pronounsSchema.parse('she/her')).toBe('she/her');
    expect(pronounsSchema.parse('they/them')).toBe('they/them');
    expect(pronounsSchema.parse('he/him')).toBe('he/him');
    // Boundary: exactly 32 chars must parse.
    const exact32 = 'x'.repeat(32);
    expect(pronounsSchema.parse(exact32)).toBe(exact32);
  });

  it('[BKT-C.1] rejects pronouns > 32 chars with a typed error', () => {
    // 33-char string fails — the DB layer intentionally does not enforce
    // length (column is text) so the Zod boundary is the sole guard.
    const tooLong = 'x'.repeat(33);
    expect(() => pronounsSchema.parse(tooLong)).toThrow();
  });

  it('[BKT-C.1] rejects empty string', () => {
    // Empty is meaningless for pronouns — the "clear" operation uses null,
    // not empty string. The patch endpoint accepts null; this schema does
    // not accept empty for the value-present branch.
    expect(() => pronounsSchema.parse('')).toThrow();
  });
});

describe('onboardingPronounsPatchSchema', () => {
  it('[BKT-C.1] accepts null to clear the field', () => {
    // The patch body uses `{ pronouns: null }` to clear — this is how the
    // "I prefer not to say" mobile option reaches the server.
    const parsed = onboardingPronounsPatchSchema.parse({ pronouns: null });
    expect(parsed.pronouns).toBeNull();
  });

  it('[BKT-C.1] rejects body with pronouns > 32 chars', () => {
    expect(() =>
      onboardingPronounsPatchSchema.parse({ pronouns: 'x'.repeat(33) })
    ).toThrow();
  });
});

describe('profileSchema forward-compat', () => {
  // Complete legacy row missing the two BKT-C.1 fields. These rows exist in
  // prod until migration 0035 backfills; the schema must parse them cleanly
  // with the documented defaults ('en' and null) so the mobile client does
  // not crash when a pre-backfill profile reaches it during the rollout.
  const legacyRowWithoutC1Fields = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    accountId: '660e8400-e29b-41d4-a716-446655440000',
    displayName: 'Alex',
    avatarUrl: null,
    birthYear: 2013,
    location: null,
    isOwner: true,
    consentStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('[BKT-C.1] defaults conversationLanguage to "en" when absent', () => {
    const parsed = profileSchema.parse(legacyRowWithoutC1Fields);
    expect(parsed.conversationLanguage).toBe('en');
  });

  it('[BKT-C.1] defaults pronouns to null when absent', () => {
    const parsed = profileSchema.parse(legacyRowWithoutC1Fields);
    expect(parsed.pronouns).toBeNull();
  });

  it('[BKT-C.1] preserves explicit conversationLanguage when present', () => {
    const parsed = profileSchema.parse({
      ...legacyRowWithoutC1Fields,
      conversationLanguage: 'cs',
    });
    expect(parsed.conversationLanguage).toBe('cs');
  });

  it('[BKT-C.1] preserves explicit pronouns when present', () => {
    const parsed = profileSchema.parse({
      ...legacyRowWithoutC1Fields,
      pronouns: 'they/them',
    });
    expect(parsed.pronouns).toBe('they/them');
  });
});

describe('interestsArraySchema forward-compat', () => {
  it('[BKT-C.2] normalizes legacy string[] to InterestEntry[] with context="both"', () => {
    // learning_profiles.interests rows written before the shape migration
    // contained plain string arrays. The preprocessor lifts each string into
    // { label, context: 'both' } so downstream consumers see a uniform shape.
    const parsed = interestsArraySchema.parse(['chess', 'football']);
    expect(parsed).toEqual([
      { label: 'chess', context: 'both' },
      { label: 'football', context: 'both' },
    ]);
  });

  it('[BKT-C.2] passes through already-structured entries unchanged', () => {
    const entries = [
      { label: 'chess', context: 'school' as const },
      { label: 'anime', context: 'free_time' as const },
    ];
    expect(interestsArraySchema.parse(entries)).toEqual(entries);
  });

  it('[BKT-C.2] handles mixed legacy + structured arrays', () => {
    const parsed = interestsArraySchema.parse([
      'chess',
      { label: 'anime', context: 'free_time' as const },
    ]);
    expect(parsed).toEqual([
      { label: 'chess', context: 'both' },
      { label: 'anime', context: 'free_time' },
    ]);
  });

  it('[BKT-C.2] rejects labels over 60 chars', () => {
    // Per the picker contract: one-line rendering, picker caps at 12 entries.
    // A 60-char cap keeps layout predictable.
    expect(() =>
      interestsArraySchema.parse([{ label: 'x'.repeat(61), context: 'both' }])
    ).toThrow();
  });

  it('[BKT-C.2] rejects entries with invalid context enum value', () => {
    expect(() =>
      interestEntrySchema.parse({ label: 'chess', context: 'mixed' })
    ).toThrow();
  });
});

describe('[BUG-906] NEW_LEARNER_SESSION_THRESHOLD contract', () => {
  // This test pins the value so a future change must update it deliberately.
  // Drift prevention comes from both the API (dashboard.ts) and mobile
  // (progressive-disclosure.ts) importing this single constant — there is no
  // longer a separate declaration that can diverge.
  it('equals the documented product value of 4', () => {
    expect(NEW_LEARNER_SESSION_THRESHOLD).toBe(4);
  });
});

describe('[BUG-780] onboarding patch schemas mirror profileUpdateSchema', () => {
  // Onboarding endpoints are single-field PATCH variants of the broader
  // profile-update path. They MUST be subsets of profileUpdateSchema —
  // otherwise an onboarding step could write a column that the regular
  // profile-edit screen cannot also reach. This guards the cross-reference.
  const updateKeys = new Set(Object.keys(profileUpdateSchema.shape));

  it.each([
    ['onboardingLanguagePatchSchema', onboardingLanguagePatchSchema],
    ['onboardingPronounsPatchSchema', onboardingPronounsPatchSchema],
  ])('every key in %s is also in profileUpdateSchema', (_name, schema) => {
    for (const key of Object.keys(schema.shape)) {
      expect(updateKeys.has(key)).toBe(true);
    }
  });
});
