// ---------------------------------------------------------------------------
// Shared identity-v2 dispatch options, threaded from the route/auth layer into
// the v2 write guards. Consolidated here so settings.ts, learner-profile.ts
// (and future WP-6/7 callers) import one shape instead of each re-declaring it.
// ---------------------------------------------------------------------------

/**
 * Identity-v2 dispatch options.
 *
 * - `callerPersonId` — the AUTHENTICATED caller's own person id (resolved from
 *   the login→person binding by the account middleware, NOT request-supplied).
 *   Required for the v2 write guard to prove WRITE authority (self OR an
 *   authorized guardianship edge over the target). Without it, a same-org
 *   member could mutate another member's data — membership grants
 *   existence-visibility only, never write authority (canon: data-model.md
 *   §2A.4, ontology.md inv 8).
 */
export interface IdentityV2Opts {
  callerPersonId?: string;
}

/**
 * The authenticated caller's own person id is mandatory on the v2 write path —
 * the write-authority guard cannot prove self-or-edge without it. A missing
 * value means the route failed to thread it (a wiring bug); fail closed rather
 * than silently fall back to a membership-only (IDOR-prone) check.
 *
 * Shared by every v2 write guard so the null-check + error message cannot
 * diverge between callers (settings.ts, learner-profile.ts, …).
 */
export function requireCallerPersonId(opts: IdentityV2Opts): string {
  if (!opts.callerPersonId) {
    throw new Error(
      'identity-v2 write guard requires callerPersonId (caller identity not threaded)',
    );
  }
  return opts.callerPersonId;
}
