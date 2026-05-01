import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { recordOutboxSpillover } from '../services/support/spillover';

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
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const json = await c.req.json().catch(() => null);
    const parsed = outboxSpilloverSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid-body',
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const result = await recordOutboxSpillover(
      db,
      profileId,
      parsed.data.entries
    );
    return c.json(result);
  }
);
