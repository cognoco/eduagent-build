import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import {
  accountDeletionResponseSchema,
  accountDeletionStatusResponseSchema,
  accountEmailUpdateRequestSchema,
  accountEmailUpdateResponseSchema,
  accountSecurityEventRequestSchema,
  accountSecurityEventResponseSchema,
  cancelDeletionResponseSchema,
  dataExportSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireAccount } from '../middleware/profile-scope';

import {
  notifyAccountSecurityEvent,
  updateAccountEmailFromClerk,
} from '../services/account';
import {
  scheduleDeletion,
  cancelDeletion,
  getDeletionStatus,
  getProfileIdsForAccount,
} from '../services/deletion';
import { generateExport } from '../services/export';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { NotFoundError, apiError, validationError } from '../errors';
import { assertOwnerProfile } from '../services/family-access';

type AccountRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    CLERK_SECRET_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const accountRoutes = new Hono<AccountRouteEnv>()
  .get('/account/deletion-status', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime
    // (TS declares it non-nullable but that depends on middleware ordering).
    const account = requireAccount(c.get('account'));
    // [F-125] Owner gate — matches sibling routes /email, /security-event, /export.
    // A non-owner profile (child on a family account) must not be able to read
    // the account owner's deletion schedule.
    assertOwnerProfile(c, 'Only the account owner can view deletion status.');
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
  // [CRITICAL-1] Source of truth for the client-side email reconciler: returns
  // the persisted account email so the mobile app can detect a Clerk-vs-server
  // divergence (e.g. the app died after Clerk promotion but before the sync)
  // and re-fire PATCH /account/email — independent of the ChangeEmail screen.
  .get('/account/email', async (c) => {
    const account = requireAccount(c.get('account'));
    assertOwnerProfile(c, 'Only the account owner can view the account email.');
    return c.json(
      accountEmailUpdateResponseSchema.parse({ email: account.email }),
    );
  })
  // [CRITICAL-2a] Client ping after a Clerk-side credential mutation the mobile
  // app performs directly (password add / change). The server emails an
  // out-of-band security notification to the current account address. The
  // `email_changed` event is NOT accepted here — it is dispatched server-side
  // from updateAccountEmailFromClerk so it cannot be spoofed by a client.
  .post('/account/security-event', async (c) => {
    const account = requireAccount(c.get('account'));
    assertOwnerProfile(
      c,
      'Only the account owner can manage account security.',
    );

    const body = await c.req.json().catch(() => null);
    const parsed = accountSecurityEventRequestSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, parsed.error.issues);
    }

    await notifyAccountSecurityEvent({
      accountId: account.id,
      to: account.email,
      type: parsed.data.event,
      profileId: c.get('profileId') ?? null,
    });

    return c.json(accountSecurityEventResponseSchema.parse({ ok: true }));
  })
  .patch('/account/email', async (c) => {
    const db = c.get('db');
    requireAccount(c.get('account'));
    assertOwnerProfile(c, 'Only the account owner can change account email.');

    const body = await c.req.json().catch(() => null);
    const parsed = accountEmailUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, parsed.error.issues);
    }

    const updated = await updateAccountEmailFromClerk(db, {
      clerkUserId: c.get('user').userId,
      requestedEmail: parsed.data.email,
      clerkSecretKey: c.env.CLERK_SECRET_KEY,
    });

    return c.json(
      accountEmailUpdateResponseSchema.parse({ email: updated.email }),
    );
  })
  .post('/account/delete', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [CR-2026-05-19-H1] Only the account owner can schedule account deletion.
    assertOwnerProfile(c, 'Only the account owner can delete the account.');

    const { gracePeriodEnds, scheduledNow } = await scheduleDeletion(
      db,
      account.id,
    );

    try {
      const profileIds = await getProfileIdsForAccount(db, account.id);

      // core-send: account deletion must not claim scheduling if Inngest rejects the durable handoff.
      // Re-dispatch for already scheduled deletions too; the Inngest function
      // is idempotent by accountId, and retrying recovers a prior orphaned
      // schedule where the DB write succeeded but the durable handoff did not.
      await inngest.send({
        name: 'app/account.deletion-scheduled',
        data: {
          accountId: account.id,
          profileIds,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      captureException(error, {
        extra: {
          surface: 'account.deletion',
          kind: 'core-send',
          accountId: account.id,
        },
      });
      if (scheduledNow) {
        try {
          await cancelDeletion(db, account.id);
        } catch (rollbackError) {
          captureException(rollbackError, {
            extra: {
              surface: 'account.deletion',
              kind: 'core-send-rollback',
              accountId: account.id,
            },
          });
        }
      }
      return apiError(
        c,
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Account deletion could not be scheduled. Please try again.',
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
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [CR-2026-05-19-H1] Only the account owner can cancel account deletion.
    assertOwnerProfile(
      c,
      'Only the account owner can cancel account deletion.',
    );

    // [BUG-412] cancelDeletion now returns a typed result. Return 409 when
    // there is no active scheduled deletion to cancel — previously this path
    // always returned 200 even with nothing to cancel, masking bugs.
    const cancelResult = await cancelDeletion(db, account.id);
    if (cancelResult === 'no_active_deletion') {
      return apiError(
        c,
        409,
        ERROR_CODES.CONFLICT,
        'No active account deletion to cancel.',
      );
    }
    return c.json(
      cancelDeletionResponseSchema.parse({ message: 'Deletion cancelled' }),
    );
  })
  .get('/account/export', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [CR-2026-05-19-H1] Only the account owner can export account data.
    assertOwnerProfile(c, 'Only the account owner can export account data.');

    const data = await generateExport(db, account.id);
    return c.json(dataExportSchema.parse(data));
  });
