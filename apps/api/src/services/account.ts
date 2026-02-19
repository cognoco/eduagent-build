// ---------------------------------------------------------------------------
// Account Service — find-or-create account from Clerk JWT claims
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { accounts, type Database } from '@eduagent/database';
import { createSubscription } from './billing';
import { computeTrialEndDate } from './trial';
import { getTierConfig } from './subscription';

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
 */
export async function findAccountByClerkId(
  db: Database,
  clerkUserId: string
): Promise<Account | null> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, clerkUserId),
  });
  return row ? mapAccountRow(row) : null;
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
  email: string,
  timezone?: string | null
): Promise<Account> {
  const existing = await findAccountByClerkId(db, clerkUserId);
  if (existing) return existing;

  // onConflictDoNothing guards against the TOCTOU race where two concurrent
  // requests both pass the findFirst check and attempt to insert. The unique
  // constraint on accounts.clerkUserId ensures only one row is created.
  const [row] = await db
    .insert(accounts)
    .values({ clerkUserId, email, timezone: timezone ?? null })
    .onConflictDoNothing({ target: accounts.clerkUserId })
    .returning();

  // If conflict occurred (row is undefined), the other request won — re-query.
  if (!row) {
    const found = await findAccountByClerkId(db, clerkUserId);
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
    // Log but don't fail account creation — subscription can be retried
    console.error(
      'Failed to create trial subscription for new account:',
      error
    );
  }

  return mapAccountRow(row);
}
