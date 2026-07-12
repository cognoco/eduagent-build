// [WI-1311] env:sync silently strips EXPO_PUBLIC_*/EAS_EXTRA_VARS keys from eas.json
// whenever Doppler doesn't currently define them.
//
// updateEasJson() used to build mergedEnv by (1) copying only the NON-managed keys
// from the existing eas.json env block, then (2) re-adding ONLY the managed keys
// Doppler returned this run. Any EXPO_PUBLIC_*/EAS_EXTRA_VARS key committed in
// eas.json but absent from the current Doppler download fell through both loops
// and was silently dropped on every `pnpm env:sync` — confirmed live 2026-07-11 with
// EXPO_PUBLIC_ENABLE_MODE_NAV_V2 (not yet in Doppler dev/preview).
//
// This is a durable red-green regression guard: it fails on the pre-fix merge logic
// (the managed-but-missing-from-Doppler key gets dropped) and passes once
// updateEasJson() preserves by default and only overlays keys Doppler actually returned.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { updateEasJson, EAS_EXTRA_VARS, EAS_JSON_DENYLIST } =
  require('./setup-env.js') as {
    updateEasJson: (
      easPath: string,
      fetchSecretsJson: (config: string) => Record<string, string> | null,
    ) => void;
    EAS_EXTRA_VARS: string[];
    EAS_JSON_DENYLIST: string[];
  };

describe('[WI-1311] updateEasJson preserves managed vars Doppler does not currently define', () => {
  let fixturePath: string;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-env-test-'));
    fixturePath = path.join(dir, 'eas.json');

    const fixture = {
      build: {
        development: {
          env: {
            // In Doppler's stub response this run — must be refreshed.
            EXPO_PUBLIC_API_URL: 'https://old.example.com',
            // NOT in Doppler's stub response — must survive (the bug).
            EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true',
            // Non-EXPO_PUBLIC_ managed var (EAS_EXTRA_VARS), also NOT in
            // Doppler's stub response — must survive too (the same live
            // repro also stripped this key, confirming the mechanism isn't
            // EXPO_PUBLIC_-specific).
            SENTRY_DISABLE_AUTO_UPLOAD: 'true',
            // Never managed by this script — must always survive.
            SOME_UNMANAGED_VAR: 'keep-me',
            // Denylisted secret — must be stripped even though it's not in
            // Doppler's stub response (preserve-by-default must not resurrect it).
            EXPO_PUBLIC_SENTRY_DSN: 'leaked-secret',
          },
        },
      },
    };
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  });

  afterEach(() => {
    fs.rmSync(path.dirname(fixturePath), { recursive: true, force: true });
  });

  it("preserves an EXPO_PUBLIC_* key absent from this run's Doppler download", () => {
    const fetchSecretsJson = (
      config: string,
    ): Record<string, string> | null => {
      if (config === 'stg') {
        return { EXPO_PUBLIC_API_URL: 'https://new.example.com' };
      }
      return null; // simulate no prd access — production/other profiles untouched
    };

    updateEasJson(fixturePath, fetchSecretsJson);

    const written = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const env = written.build.development.env;

    expect(env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2).toBe('true');
    expect(EAS_EXTRA_VARS).toContain('SENTRY_DISABLE_AUTO_UPLOAD');
    expect(env.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
    expect(env.EXPO_PUBLIC_API_URL).toBe('https://new.example.com');
    expect(env.SOME_UNMANAGED_VAR).toBe('keep-me');
  });

  it('still strips denylisted secrets under the preserve-by-default merge (AC3)', () => {
    const fetchSecretsJson = (
      config: string,
    ): Record<string, string> | null => {
      if (config === 'stg') {
        return { EXPO_PUBLIC_API_URL: 'https://new.example.com' };
      }
      return null;
    };

    updateEasJson(fixturePath, fetchSecretsJson);

    const written = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const env = written.build.development.env;

    expect(EAS_JSON_DENYLIST).toContain('EXPO_PUBLIC_SENTRY_DSN');
    expect(env.EXPO_PUBLIC_SENTRY_DSN).toBeUndefined();
  });
});

// [WI-1852] Blank-means-clear: a managed var Doppler returns as an explicit empty
// string ('') must be CLEARED from the baked eas.json, while a managed var merely
// ABSENT from the Doppler download stays preserved (the WI-1311 fix). The two must
// not be conflated — that conflation (empty filtered out at the fetch boundary, then
// preserved by default) is exactly the bug this guards. Durable red-green regression:
// it fails on the pre-fix merge (the blanked var survives) and passes once
// updateEasJson() distinguishes present-but-empty from absent.
describe('[WI-1852] updateEasJson clears managed vars explicitly blanked in Doppler', () => {
  let fixturePath: string;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-env-blank-test-'));
    fixturePath = path.join(dir, 'eas.json');

    const fixture = {
      build: {
        development: {
          env: {
            // Baked value Doppler will explicitly blank this run — must be CLEARED.
            EXPO_PUBLIC_FEATURE_X: 'stale-on',
            // Managed key ABSENT from Doppler this run — must be PRESERVED
            // (WI-1311; absent != empty).
            EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true',
            // Managed key Doppler returns with a real value — must be WRITTEN.
            EXPO_PUBLIC_API_URL: 'https://old.example.com',
            // Never managed by this script — must always survive.
            SOME_UNMANAGED_VAR: 'keep-me',
          },
        },
      },
    };
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  });

  afterEach(() => {
    fs.rmSync(path.dirname(fixturePath), { recursive: true, force: true });
  });

  it('clears a blanked var, preserves an absent var, writes a real value', () => {
    const fetchSecretsJson = (
      config: string,
    ): Record<string, string> | null => {
      if (config === 'stg') {
        return {
          EXPO_PUBLIC_FEATURE_X: '', // explicit blank -> must clear
          EXPO_PUBLIC_API_URL: 'https://new.example.com', // real value -> must write
          // EXPO_PUBLIC_ENABLE_MODE_NAV_V2 intentionally absent -> must preserve
        };
      }
      return null; // no prd access — production/other profiles untouched
    };

    updateEasJson(fixturePath, fetchSecretsJson);

    const written = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const env = written.build.development.env;

    // (a) blank-means-clear: the explicitly blanked var is gone
    expect(env.EXPO_PUBLIC_FEATURE_X).toBeUndefined();
    // (b) absent != empty: a managed var Doppler didn't return survives
    expect(env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2).toBe('true');
    // (c) a returned value is written
    expect(env.EXPO_PUBLIC_API_URL).toBe('https://new.example.com');
    // unmanaged vars always survive
    expect(env.SOME_UNMANAGED_VAR).toBe('keep-me');
  });
});
