import { createDatabase } from '@eduagent/database';

/**
 * Returns a Database instance for use within Inngest step functions.
 *
 * In Cloudflare Workers, env bindings are request-scoped and not directly
 * accessible inside Inngest step closures. This helper reads DATABASE_URL
 * from process.env at call time — must be called INSIDE step.run() closures,
 * never at the handler top level.
 *
 * TODO: Inject DATABASE_URL via Inngest middleware when wiring Neon (Layer 2).
 */
export function getStepDatabase() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL not available — ensure Inngest middleware provides env bindings'
    );
  }
  return createDatabase(url);
}
