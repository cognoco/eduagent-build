import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { recordOutboxSpillover } from '../services/support/spillover';
import { createLogger } from '../services/logger';
import { outboxSpilloverResultSchema } from '@eduagent/schemas';

const logger = createLogger();

const MAX_CONTENT_SIZE = 8_000;

const outboxSpilloverEntrySchema = z.object({
  id: z.string().min(1).max(128),
  flow: z.enum(['session', 'interview']),
  surfaceKey: z.string().min(1).max(128),
  content: z.string().min(1).max(MAX_CONTENT_SIZE),
  attempts: z.number().int().nonnegative().max(100),
  firstAttemptedAt: z.string().datetime(),
  failureReason: z.string().max(500).optional(),
});

const outboxSpilloverSchema = z.object({
  entries: z.array(outboxSpilloverEntrySchema).min(1).max(50),
});

type SupportRouteEnv = {
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const supportRoutes = new Hono<SupportRouteEnv>().post(
  '/outbox-spillover',
  zValidator('json', outboxSpilloverSchema),
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const { entries } = c.req.valid('json');

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
  }
);
