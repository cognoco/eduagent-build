// ---------------------------------------------------------------------------
// Activation Events Ingest — WI-1504
//
// A minimal first-party ingest route for activation-funnel events that are
// purely client-observed and may fire before a profile (or even an account)
// exists: app_opened, signup_started, onboarding_completed,
// review_card_seen, review_card_tapped, day2_return. Server-reachable
// touchpoints (signup_completed, first_subject_or_lesson_started,
// first_session_started, first_session_completed) are recorded directly by
// the route/service that owns that transition — NOT through this route —
// so this handler rejects them (they would otherwise let a client spoof a
// server-owned funnel step).
//
// Reachable pre-graph: the Clerk JWT must be valid (authMiddleware), but no
// account/profile row needs to exist yet — see PRE_GRAPH_ALLOWLIST in
// middleware/account.ts, which exempts this path from the account-required
// 401.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  activationEventIngestRequestSchema,
  activationEventIngestResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import {
  buildActivationEventOccurrenceKey,
  recordActivationEventSafely,
} from '../services/activation-events';

type ActivationEventsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const activationEventsRoutes = new Hono<ActivationEventsRouteEnv>().post(
  '/activation-events',
  // `clientActivationEventTypeSchema` (via the request schema) rejects the four
  // server-owned event types at the Zod trust boundary with HTTP 400 — a
  // client cannot forge a server-owned funnel event. No handler-level guard is
  // needed.
  zValidator('json', activationEventIngestRequestSchema),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');

    const profileId = c.get('profileId') ?? null;
    const profileMeta = c.get('profileMeta');

    // WI-1504: non-core write — a telemetry failure must never surface as an
    // error to the client. `recorded` reflects whether the write is likely
    // to have landed, but the client should never branch on it beyond
    // logging; a `false` here (including from a dedupe no-op) is not
    // actionable client-side.
    const occurredAtDate = input.occurredAt
      ? new Date(input.occurredAt)
      : new Date();
    const row = await recordActivationEventSafely(
      db,
      {
        eventType: input.eventType,
        profileId,
        anonymousId: input.anonymousId,
        occurredAt: occurredAtDate,
        environment: input.environment ?? null,
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
        profileMeta,
        route: input.route ?? null,
        occurrenceKey: buildActivationEventOccurrenceKey({
          occurrenceId: input.occurrenceId,
          occurredAt: occurredAtDate,
        }),
        metadata: input.metadata ?? {},
      },
      'activation-events.ingest',
      { eventType: input.eventType, profileId },
    );

    return c.json(
      activationEventIngestResponseSchema.parse({ recorded: row !== null }),
      201,
    );
  },
);
