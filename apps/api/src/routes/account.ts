import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import {
  accountDeletionResponseSchema,
  accountDeletionStatusResponseSchema,
  cancelDeletionResponseSchema,
  dataExportSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import {
  scheduleDeletion,
  cancelDeletion,
  getDeletionStatus,
  getProfileIdsForAccount,
} from '../services/deletion';
import { generateExport } from '../services/export';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';
import { NotFoundError, apiError } from '../errors';

type AccountRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileMeta: ProfileMeta | undefined;
  };
};

export const accountRoutes = new Hono<AccountRouteEnv>()
  .get('/account/deletion-status', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    try {
      const status = await getDeletionStatus(db, account.id);
      return c.json(accountDeletionStatusResponseSchema.parse(status));
    } catch (err) {
      if (!(err instanceof NotFoundError)) {
        throw err;
      }
      return c.json({ code: 'NOT_FOUND', message: 'Account not found' }, 404);
    }
  })
  .post('/account/delete', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    // [CR-2026-05-19-H1] Only the account owner can schedule account deletion.
    const activeProfileMetaDelete = c.get('profileMeta');
    if (activeProfileMetaDelete?.isOwner !== true) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the account owner can delete the account.',
      );
    }

    const { gracePeriodEnds, scheduledNow } = await scheduleDeletion(
      db,
      account.id,
    );

    if (scheduledNow) {
      const profileIds = await getProfileIdsForAccount(db, account.id);

      // [CR-SILENT-RECOVERY-2] Account deletion is GDPR-relevant -- safeSend
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
    }

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

    // [CR-2026-05-19-H1] Only the account owner can cancel account deletion.
    const activeProfileMetaCancelDeletion = c.get('profileMeta');
    if (activeProfileMetaCancelDeletion?.isOwner !== true) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the account owner can cancel account deletion.',
      );
    }

    await cancelDeletion(db, account.id);
    return c.json(
      cancelDeletionResponseSchema.parse({ message: 'Deletion cancelled' }),
    );
  })
  .get('/account/export', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    // [CR-2026-05-19-H1] Only the account owner can export account data.
    const activeProfileMetaExport = c.get('profileMeta');
    if (activeProfileMetaExport?.isOwner !== true) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the account owner can export account data.',
      );
    }

    const data = await generateExport(db, account.id);
    return c.json(dataExportSchema.parse(data));
  });
