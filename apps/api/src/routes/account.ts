import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import {
  accountDeletionResponseSchema,
  cancelDeletionResponseSchema,
  dataExportSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  scheduleDeletion,
  cancelDeletion,
  getProfileIdsForAccount,
} from '../services/deletion';
import { generateExport } from '../services/export';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';

type AccountRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database; account: Account };
};

export const accountRoutes = new Hono<AccountRouteEnv>()
  .post('/account/delete', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const { gracePeriodEnds } = await scheduleDeletion(db, account.id);

    const profileIds = await getProfileIdsForAccount(db, account.id);

    // [CR-SILENT-RECOVERY-2] Account deletion is GDPR-relevant — safeSend
    // escalates dispatch failures to Sentry so on-call gets paged on aggregate
    // dispatch-failure spikes. Mirrors the consent.ts [A-23] pattern.
    await safeSend(
      () =>
        inngest.send({
          name: 'app/account.deletion-scheduled',
          data: {
            accountId: account.id,
            profileIds,
            timestamp: new Date().toISOString(),
          },
        }),
      'account.deletion',
      { accountId: account.id },
    );

    return c.json(
      accountDeletionResponseSchema.parse({
        message: 'Deletion scheduled',
        gracePeriodEnds,
      }),
    );
  })
  .post('/account/cancel-deletion', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    await cancelDeletion(db, account.id);
    return c.json(
      cancelDeletionResponseSchema.parse({ message: 'Deletion cancelled' }),
    );
  })
  .get('/account/export', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const data = await generateExport(db, account.id);
    return c.json(dataExportSchema.parse(data));
  });
