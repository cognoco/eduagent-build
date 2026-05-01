/**
 * Pure helpers for verify-db-target.mjs — kept separate so the unit test can
 * import them without invoking the side-effectful CLI script.
 */

export function extractHost(databaseUrl) {
  try {
    return new URL(databaseUrl).host || null;
  } catch {
    return null;
  }
}

/**
 * Decide whether `host` is acceptable for `expectedSubstring` (the deploy
 * environment's expected substring) and definitely-not-the-other for
 * `wrongEnvSubstring` (the cross-environment substring we must reject).
 *
 * Returns:
 *   { status: 'ok',           reason: string }  // matches expected, no cross-env hit
 *   { status: 'mismatch',     reason: string }  // matches the wrong env, OR fails expected
 *   { status: 'unverifiable', reason: string }  // no substrings supplied — informational
 */
export function hostMatchesEnvironment({ host, expectedSubstring, wrongEnvSubstring }) {
  if (wrongEnvSubstring && host.includes(wrongEnvSubstring)) {
    return {
      status: 'mismatch',
      reason: `host "${host}" matches the wrong environment's expected substring "${wrongEnvSubstring}"`,
    };
  }

  if (expectedSubstring) {
    if (host.includes(expectedSubstring)) {
      return {
        status: 'ok',
        reason: `host "${host}" matches expected substring "${expectedSubstring}"`,
      };
    }
    return {
      status: 'mismatch',
      reason: `host "${host}" does not contain expected substring "${expectedSubstring}"`,
    };
  }

  return {
    status: 'unverifiable',
    reason: 'no expected/wrong-env hostname substrings configured',
  };
}
