import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId, requireAccount } from '../middleware/profile-scope';
import { recordOutboxSpillover } from '../services/support/spillover';
import { createLogger } from '../services/logger';
import { checkAndLogRateLimit } from '../services/settings';
import { apiError } from '../errors';
import { isIdentityV2Enabled } from '../config';
import { outboxSpilloverResultSchema, ERROR_CODES } from '@eduagent/schemas';

const logger = createLogger();

const MAX_CONTENT_SIZE = 8_000;

const outboxSpilloverEntrySchema = z.object({
  id: z.string().min(1).max(128),
  flow: z.enum(['session']),
  surfaceKey: z.string().min(1).max(128),
  content: z.string().min(1).max(MAX_CONTENT_SIZE),
  attempts: z.number().int().nonnegative().max(100),
  firstAttemptedAt: z.string().datetime(),
  failureReason: z.string().max(500).optional(),
});

const outboxSpilloverSchema = z.object({
  entries: z.array(outboxSpilloverEntrySchema).min(1).max(50),
});

// [WI-179] Per-profile rate limit on outbox-spillover writes.
//
// Each call inserts client-supplied rows whose `id` is attacker-chosen — so
// uniqueness alone cannot bound write volume. A misbehaving (or malicious)
// client can keep generating fresh ids and spam the table.
//
// 20 requests/hour is generous for legitimate spillover (the route batches
// up to 50 entries per request, so 20 calls = 1_000 entries of outbox burst —
// well above the steady-state mobile retry cadence). The limit is enforced
// by `checkAndLogRateLimit` using the shared `notification_log` table; the
// `support_outbox_spillover` notification type tags the rate-limit row and
// is NEVER dispatched as an actual notification.
const SPILLOVER_MAX_PER_HOUR = 20;
const SPILLOVER_WINDOW_HOURS = 1;
const SPILLOVER_RETRY_AFTER_SECONDS = SPILLOVER_WINDOW_HOURS * 60 * 60;

type SupportRouteEnv = {
  Bindings: {
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    account: Account;
    callerPersonId: string | undefined;
  };
};

export const supportRoutes = new Hono<SupportRouteEnv>().post(
  '/outbox-spillover',
  zValidator('json', outboxSpilloverSchema),
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const account = requireAccount(c.get('account'));
    const db = c.get('db');
    const { entries } = c.req.valid('json');

    // [WI-179] Atomic per-profile rate-limit check. Must happen BEFORE the
    // DB insert in `recordOutboxSpillover` — otherwise a flood of 21+ calls
    // could land 1_050+ rows before the limiter trips.
    const rateLimited = await checkAndLogRateLimit(
      db,
      profileId,
      account.id,
      'support_outbox_spillover',
      { hours: SPILLOVER_WINDOW_HOURS, maxCount: SPILLOVER_MAX_PER_HOUR },
      {
        identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
        callerPersonId: c.get('callerPersonId'),
      },
    );
    if (rateLimited) {
      c.header('Retry-After', String(SPILLOVER_RETRY_AFTER_SECONDS));
      return apiError(
        c,
        429,
        ERROR_CODES.RATE_LIMITED,
        `Outbox spillover is limited to ${SPILLOVER_MAX_PER_HOUR} requests per hour.`,
        { retryAfter: SPILLOVER_RETRY_AFTER_SECONDS },
      );
    }

    logger.info('outbox_spillover.received', {
      profileId,
      count: entries.length,
      flows: [...new Set(entries.map((e) => e.flow))],
    });

    const result = await recordOutboxSpillover(db, profileId, entries);

    logger.info('outbox_spillover.written', {
      profileId,
      written: result.written,
    });

    return c.json(outboxSpilloverResultSchema.parse(result));
  },
);
