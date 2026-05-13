/**
 * Shared Hono route environment types and context helpers.
 *
 * Removes the per-file boilerplate where every route file redeclares the
 * same `Bindings` + `Variables` shapes, and the same `requireProfileId`
 * unwrap in every handler. Routes that need additional variables (e.g.
 * `account` on /account routes) extend `RouteVariables` locally.
 *
 * See docs/_archive/plans/done/2026-05-03-governance-audit.md item H4.
 */

import type { Context } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';

export interface RouteBindings {
  DATABASE_URL: string;
  CLERK_JWKS_URL?: string;
}

export interface RouteVariables {
  user: AuthUser;
  db: Database;
  profileId: string | undefined;
}

export interface RouteEnv {
  Bindings: RouteBindings;
  Variables: RouteVariables;
}

/**
 * Pull the common request-scoped values out of a Hono Context with
 * profileId already validated. Replaces the per-handler 3-liner:
 *
 *     const db = c.get('db');
 *     const profileId = requireProfileId(c.get('profileId'));
 *     const user = c.get('user');
 */
export function withProfile<E extends RouteEnv>(c: Context<E>) {
  return {
    db: c.get('db'),
    profileId: requireProfileId(c.get('profileId')),
    user: c.get('user'),
  };
}
