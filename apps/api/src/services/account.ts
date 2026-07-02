// ---------------------------------------------------------------------------
// Account Service — find-or-create account from Clerk JWT claims
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { accounts, type Database } from '@eduagent/database';
import { createSubscription, getSubscriptionByAccountId } from './billing';
import { isUniqueViolation } from './db-errors';
import {
  invalidateVerifiedClerkEmailCache,
  resolveVerifiedClerkEmail,
} from './clerk-user';
import { computeTrialEndDate } from './trial';
import { getTierConfig } from './subscription';
import { createLogger } from './logger';
import { captureException } from './sentry';
import { safeSend } from './safe-non-core';
import type { SecurityNotificationType } from '@eduagent/schemas';
import { inngest } from '../inngest/client';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import { resolveIdentityV2 } from './identity-v2/identity-resolve';

const logger = createLogger();

/**
 * [CRITICAL-2a] Dispatch a non-core account-security event so the
 * `account-security-notification` Inngest function can email the affected
 * address out-of-band. Failures are captured but never thrown — a notification
 * problem must not break the credential change the user just made.
 */
export async function notifyAccountSecurityEvent(args: {
  accountId: string;
  to: string;
  type: SecurityNotificationType;
  /**
   * Null for the server-side `email_changed` dispatch
   * (`updateAccountEmailFromClerk` runs without a profile context).
   */
  profileId: string | null;
}): Promise<void> {
  await safeSend(
    () =>
      inngest.send({
        name: 'app/account.security-event',
        data: {
          type: args.type,
          to: args.to,
          accountId: args.accountId,
          profileId: args.profileId,
          timestamp: new Date().toISOString(),
        },
      }),
    `account.security_event.${args.type}`,
    { accountId: args.accountId },
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  clerkUserId: string;
  email: string;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapAccountRow(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Finds an existing account by its Clerk user ID.
 *
 * [WI-1254] v2 read: resolves via the login→membership→organization identity
 * graph (`resolveIdentityV2`, the same resolver `accountMiddleware` runs on
 * every authenticated request) rather than the legacy `accounts` table, which
 * is being dropped (WI-1128). Its one live caller is the
 * account-reclaim-attempt Inngest handler, which looks up the already-verified
 * existing owner by clerkUserId to send them a security notification.
 */
export async function findAccountByClerkId(
  db: Database,
  clerkUserId: string,
): Promise<Account | null> {
  const resolved = await resolveIdentityV2(db, clerkUserId);
  return resolved?.account ?? null;
}

/**
 * [WI-1254 dead-sweep] delete with findOrCreateAccount (WI-1139 dead-sweep
 * DELETE-LIST, alongside the legacy `accounts` table def). Legacy-only lookup
 * by clerkUserId, reading the `accounts` table directly. Used exclusively by
 * findOrCreateAccount (below), which has zero live callers — accountMiddleware
 * resolves via resolveIdentityV2, not findOrCreateAccount — and still does its
 * own separate legacy accounts reads/writes out of scope for this WI. Kept
 * separate from findAccountByClerkId (now v2) so this dead-but-tested legacy
 * flow's behavior and tests are unchanged.
 */
async function findLegacyAccountByClerkId(
  db: Database,
  clerkUserId: string,
): Promise<Account | null> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, clerkUserId),
  });
  return row ? mapAccountRow(row) : null;
}

/**
 * One-way SHA-256 of an email address, safe to include in logs and Sentry
 * extra fields. The full email is never stored outside the accounts table.
 */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Finds an account by Clerk user ID or creates one if it doesn't exist.
 *
 * This is the primary entry point for account provisioning. Clerk manages
 * auth externally — the first time a JWT-verified user hits our API, we
 * lazily create their local account row. This avoids a separate "create
 * account" step and handles the webhook-vs-lazy-provision race gracefully.
 *
 * @param timezone - IANA timezone string (e.g. 'Europe/Prague') inferred from
 *   device via `Intl.DateTimeFormat().resolvedOptions().timeZone`. Falls back
 *   to UTC if null/undefined. Stored on the account record and used for
 *   timezone-aware trial expiry (end of day in user's timezone).
 */
export async function findOrCreateAccount(
  db: Database,
  clerkUserId: string,
  email: string | undefined,
  timezone?: string | null,
): Promise<Account> {
  const existing = await findLegacyAccountByClerkId(db, clerkUserId);
  if (existing) {
    // [BUG-417] Idempotent trial repair: if this account exists but was created
    // by a request that failed mid-flight after inserting the account row but
    // before committing the trial subscription, subsequent requests hit this
    // branch and skip trial creation. Guard: check for a missing subscription
    // and provision the trial if absent.
    const existingSub = await getSubscriptionByAccountId(db, existing.id);
    if (!existingSub) {
      // Account exists but has no subscription — race-condition recovery path.
      logger.warn('account.trial_missing_repair_attempted', {
        accountId: existing.id,
      });
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: observability-only marker. Recovery is in-line (trial
            // provisioned below); escalation already happens via logger.warn +
            // (on failure) captureException. The Inngest event exists purely so
            // ops can query repair-attempt frequency in the dashboard — no
            // downstream handler is needed or intended.
            name: 'app/account.trial_missing_repair_attempted',
            data: {
              accountId: existing.id,
              timestamp: new Date().toISOString(),
            },
          }),
        'account.trial_missing_repair_attempted',
        { accountId: existing.id },
      );
      try {
        const plusTier = getTierConfig('plus');
        const trialEndsAt = computeTrialEndDate(new Date(), timezone);
        await createSubscription(
          db,
          existing.id,
          'plus',
          plusTier.monthlyQuota,
          {
            status: 'trial',
            trialEndsAt: trialEndsAt.toISOString(),
          },
        );
      } catch (error) {
        logger.error('billing.trial_missing_repair_failed', {
          accountId: existing.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        captureException(error, {
          profileId: undefined,
          extra: {
            flow: 'findOrCreateAccount.trialMissingRepair',
            accountId: existing.id,
          },
        });
      }
    }
    return existing;
  }

  // [BUG-411] Email-based reclaim is unsafe without out-of-band verification.
  // If email matches an existing row owned by a DIFFERENT clerkUserId, we
  // MUST NOT silently rewire — that would hand an attacker the victim's data
  // whenever they register with the same email on a new Clerk account.
  //
  // Safe path: block the attempt with a loud, auditable failure so the
  // legitimate "I lost my Clerk account" case is handled out-of-band until a
  // proper confirmation-token flow is built.
  //
  // BUG-784: The attempt stays blocked here and is dispatched as
  // app/account.reclaim_attempt. The Inngest handler notifies the original
  // email owner out-of-band and directs them through support verification; it
  // never rewires ownership automatically.
  if (email) {
    const existingByEmail = await db.query.accounts.findFirst({
      where: eq(accounts.email, email),
    });

    if (existingByEmail && existingByEmail.clerkUserId !== clerkUserId) {
      // Hash the email before logging to avoid PII in structured logs / Sentry.
      const emailHash = hashEmail(email);

      logger.warn('account.reclaim_attempt_blocked', {
        // Retained: only available Clerk audit join key — no accountId at this point
        incomingClerkUserId: clerkUserId,
        existingClerkUserId: existingByEmail.clerkUserId,
        emailHash,
      });

      captureException(
        new Error(
          `Account reclaim attempt blocked: email matched existing account with different clerkUserId`,
        ),
        {
          extra: {
            // tag included in extra so it is queryable in Sentry extras;
            // a proper scope.setTag would require ErrorContext extension.
            'account.reclaim_attempt_blocked': true,
            flow: 'findOrCreateAccount.reclaimBlock',
            incomingClerkUserId: clerkUserId,
            existingClerkUserId: existingByEmail.clerkUserId,
            emailHash,
          },
        },
      );

      // Dispatch non-core event for future workflow (notify original email, etc.)
      await safeSend(
        () =>
          inngest.send({
            name: 'app/account.reclaim_attempt',
            data: {
              incomingClerkUserId: clerkUserId,
              existingClerkUserId: existingByEmail.clerkUserId,
              emailHash,
              timestamp: new Date().toISOString(),
            },
          }),
        'account.reclaim_attempt',
        { incomingClerkUserId: clerkUserId, emailHash },
      );

      throw new ConflictError(
        'An account with this email already exists. Contact support to recover access.',
      );
    }
  }

  // onConflictDoNothing guards against the TOCTOU race where two concurrent
  // requests both pass the findFirst check and attempt to insert. The unique
  // constraint on accounts.clerkUserId ensures only one row is created.
  //
  // The DB schema requires email NOT NULL. If email is undefined here it means
  // the caller bypassed the middleware guard (BUG-497) — surface a hard error
  // rather than silently creating a bad row or masking the misconfiguration.
  if (!email) {
    throw new Error(
      'findOrCreateAccount: email is required for new account creation but was undefined. ' +
        'Verify the account middleware email_verified guard is in place.',
    );
  }

  const [row] = await db
    .insert(accounts)
    .values({ clerkUserId, email, timezone: timezone ?? null })
    .onConflictDoNothing({ target: accounts.clerkUserId })
    .returning();

  // If conflict occurred (row is undefined), the other request won — re-query.
  if (!row) {
    const found = await findLegacyAccountByClerkId(db, clerkUserId);
    if (!found) throw new Error('Account creation failed after conflict');
    return found;
  }

  // FR108: Auto-create a 14-day trial subscription with full Plus access.
  // Trial expires at end of day (midnight) in user's timezone.
  // Tier is 'plus' during trial to grant full Plus features.
  try {
    const plusTier = getTierConfig('plus');
    const trialEndsAt = computeTrialEndDate(new Date(), timezone);
    await createSubscription(db, row.id, 'plus', plusTier.monthlyQuota, {
      status: 'trial',
      trialEndsAt: trialEndsAt.toISOString(),
    });
  } catch (error) {
    // [BUG-837 / F-SVC-003] Don't fail account creation — but billing-adjacent
    // catches MUST escalate per AGENTS.md ("Silent recovery without
    // escalation is banned in billing/auth/webhook code"). Emit:
    //   1. Structured error log so it's queryable via observability.
    //   2. Sentry capture so on-call gets paged on aggregate spikes.
    //   3. Inngest event so a follow-up handler can retry/alert without
    //      coupling to the lazy-provision path.
    logger.error('billing.trial_subscription_creation_failed', {
      accountId: row.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    captureException(error, {
      profileId: undefined,
      extra: {
        flow: 'findOrCreateAccount.trialSubscription',
        accountId: row.id,
      },
    });
    // Inngest failure must not mask the primary error path. The structured
    // log + Sentry capture above already cover the primary failure; safeSend
    // separately logs/escalates the missed dispatch so a follow-up handler
    // can retry/alert without coupling to the lazy-provision path.
    await safeSend(
      () =>
        inngest.send({
          name: 'app/billing.trial_subscription_failed',
          data: {
            accountId: row.id,
            reason: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        }),
      'billing.trial_subscription_failed',
      { accountId: row.id },
    );
  }

  return mapAccountRow(row);
}

export async function updateAccountEmailFromClerk(
  db: Database,
  args: {
    clerkUserId: string;
    requestedEmail: string;
    clerkSecretKey?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<Account> {
  const requestedEmail = normalizeEmail(args.requestedEmail);

  // The caller may still hold a JWT with the old email claim immediately after
  // Clerk promotion. Force a Clerk API lookup by omitting token claims, and
  // drop any stale cache entry before and after the sync.
  invalidateVerifiedClerkEmailCache(args.clerkUserId);
  const verified = await resolveVerifiedClerkEmail({
    userId: args.clerkUserId,
    clerkSecretKey: args.clerkSecretKey,
    fetchImpl: args.fetchImpl,
  });

  if (!verified.ok) {
    throw new BadRequestError(verified.message);
  }

  if (normalizeEmail(verified.email) !== requestedEmail) {
    throw new BadRequestError(
      'Requested email does not match the verified Clerk primary email.',
    );
  }

  try {
    const { account: updated, previousEmail } = await db.transaction(
      async (tx) => {
        const existingByEmail = await tx.query.accounts.findFirst({
          where: eq(accounts.email, requestedEmail),
        });

        if (
          existingByEmail &&
          existingByEmail.clerkUserId !== args.clerkUserId
        ) {
          throw new ConflictError(
            'An account with this email already exists. Contact support to recover access.',
          );
        }

        // Capture the prior login email before overwriting it so the
        // security-notification can be sent to the address losing access.
        const current = await tx.query.accounts.findFirst({
          where: eq(accounts.clerkUserId, args.clerkUserId),
        });

        const [row] = await tx
          .update(accounts)
          .set({ email: requestedEmail, updatedAt: new Date() })
          .where(eq(accounts.clerkUserId, args.clerkUserId))
          .returning();

        if (!row) {
          throw new NotFoundError('Account');
        }

        return {
          account: mapAccountRow(row),
          previousEmail: current?.email ?? null,
        };
      },
    );

    invalidateVerifiedClerkEmailCache(args.clerkUserId);

    // [CRITICAL-2a] Alert the OLD address out-of-band that the login email
    // changed. Non-core (safeSend): a delivery failure must never undo a
    // completed email change.
    if (previousEmail && normalizeEmail(previousEmail) !== requestedEmail) {
      await notifyAccountSecurityEvent({
        accountId: updated.id,
        to: previousEmail,
        type: 'email_changed',
        profileId: null,
      });
    }

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'An account with this email already exists. Contact support to recover access.',
      );
    }
    throw error;
  }
}
