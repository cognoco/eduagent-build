// ---------------------------------------------------------------------------
// CUT-B1 flag-off break test (plan §2.1).
//
// The single-live-store invariant rests on ONE fact: with IDENTITY_V2_ENABLED
// not equal to the literal string 'true', every identity seam selects the
// legacy implementation and no v2 module touches a new-model table. The seam
// dispatchers all gate on `isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED)`.
//
// The failure mode this pins is a JS-truthiness bug: the env value is the
// STRING 'false', and `Boolean('false') === true`. A bare
// `if (config.IDENTITY_V2_ENABLED)` would therefore cut over EVERY deployed
// environment (all of which carry the string 'false'), silently making the
// inert v2 paths live. `isIdentityV2Enabled` must use strict `=== 'true'`
// equality so that 'false' AND undefined both stay on legacy.
//
// This is a forward-only guard: it runs until the flag is removed at the
// WI-586 grep-clean step. Red-green evidence for the truthiness bug is
// recorded in the PR description.
// ---------------------------------------------------------------------------

import { isIdentityV2Enabled, validateEnv } from './config';

describe('isIdentityV2Enabled — flag-off break test (CUT-B1 §2.1)', () => {
  it('returns false for the literal string "false" (the truthiness trap)', () => {
    // Boolean('false') === true in JS. A non-strict check would return true
    // here and cut over every environment that carries the default 'false'.
    expect(isIdentityV2Enabled('false')).toBe(false);
  });

  it('returns false when the binding is unset (undefined → default legacy)', () => {
    expect(isIdentityV2Enabled(undefined)).toBe(false);
  });

  it('returns false for other non-"true" strings (no accidental opt-in)', () => {
    expect(isIdentityV2Enabled('')).toBe(false);
    expect(isIdentityV2Enabled('1')).toBe(false);
    expect(isIdentityV2Enabled('yes')).toBe(false);
    expect(isIdentityV2Enabled('TRUE')).toBe(false);
    expect(isIdentityV2Enabled('True')).toBe(false);
  });

  it('returns true only for the exact literal string "true"', () => {
    expect(isIdentityV2Enabled('true')).toBe(true);
  });

  it('defaults the typed-config field to "false" when the env omits it', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    // The schema default is the literal string 'false', and the helper maps
    // that to legacy. Both legs of the §2.1 contract ("literal 'false' AND
    // unset both select legacy") are exercised: unset env → 'false' default →
    // helper false.
    expect(env.IDENTITY_V2_ENABLED).toBe('false');
    expect(isIdentityV2Enabled(env.IDENTITY_V2_ENABLED)).toBe(false);
  });
});
