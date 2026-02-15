import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

export const accountRoutes = new Hono<AuthEnv>()
  .post('/account/delete', async (c) => {
    // TODO: Schedule deletion for c.get('user').userId via Inngest
    return c.json({
      message: 'Deletion scheduled',
      gracePeriodEnds: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  })
  .post('/account/cancel-deletion', async (c) => {
    // TODO: Cancel scheduled deletion for c.get('user').userId
    return c.json({ message: 'Deletion cancelled' });
  })
  .get('/account/export', async (c) => {
    // TODO: Trigger data export for c.get('user').userId
    return c.json({ message: 'Export started', status: 'processing' });
  });
