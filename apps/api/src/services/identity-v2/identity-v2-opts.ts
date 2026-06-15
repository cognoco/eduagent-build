// ---------------------------------------------------------------------------
// Shared identity-v2 dispatch options, threaded from the route/auth layer into
// the service writers that branch on IDENTITY_V2_ENABLED. Consolidated here so
// settings.ts, learner-profile.ts (and future WP-6/7 callers) import one shape
// instead of each re-declaring it.
// ---------------------------------------------------------------------------

/**
 * Identity-v2 dispatch options.
 *
 * - `identityV2Enabled` — when true, the ownership guards scope to the v2
 *   identity graph (`membership` / `guardianship`) instead of the legacy
 *   `profiles.accountId` column. Default-off keeps the legacy path
 *   byte-identical until WP-FLAG.
 * - `callerPersonId` — the AUTHENTICATED caller's own person id (resolved from
 *   the login→person binding by the account middleware, NOT request-supplied).
 *   Required for the v2 write guard to prove WRITE authority (self OR an
 *   authorized guardianship edge over the target). Without it, a same-org
 *   member could mutate another member's data — membership grants
 *   existence-visibility only, never write authority (canon: data-model.md
 *   §2A.4, ontology.md inv 8).
 */
export interface IdentityV2Opts {
  identityV2Enabled?: boolean;
  callerPersonId?: string;
}
