import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { scheduleDeletion, cancelDeletion } from '../services/deletion';
import { generateExport } from '../services/export';
import { inngest } from '../inngest/client';

export const accountRoutes = new Hono<AuthEnv>()
  .post('/account/delete', async (c) => {
    const userId = c.get('user').userId;
    const { gracePeriodEnds } = await scheduleDeletion(userId);

    await inngest.send({
      name: 'app/account.deletion-scheduled',
      data: {
        accountId: userId,
        profileIds: [], // TODO: look up profile IDs
      },
    });

    return c.json({
      message: 'Deletion scheduled',
      gracePeriodEnds,
    });
  })
  .post('/account/cancel-deletion', async (c) => {
    const userId = c.get('user').userId;
    await cancelDeletion(userId);
    return c.json({ message: 'Deletion cancelled' });
  })
  .get('/account/export', async (c) => {
    const userId = c.get('user').userId;
    const data = await generateExport(userId);
    return c.json(data);
  });
