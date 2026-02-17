// ---------------------------------------------------------------------------
// Account Service — find-or-create account from Clerk JWT claims
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  clerkUserId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Finds an existing account by its Clerk user ID.
 *
 * TODO: db.query.accounts.findFirst({ where: eq(accounts.clerkUserId, clerkUserId) })
 */
export async function findAccountByClerkId(
  db: Database,
  clerkUserId: string
): Promise<Account | null> {
  void db;
  void clerkUserId;
  return null;
}

/**
 * Finds an account by Clerk user ID or creates one if it doesn't exist.
 *
 * This is the primary entry point for account provisioning. Clerk manages
 * auth externally — the first time a JWT-verified user hits our API, we
 * lazily create their local account row. This avoids a separate "create
 * account" step and handles the webhook-vs-lazy-provision race gracefully.
 *
 * TODO: Upsert — find by clerkUserId, create if missing
 * TODO: db.insert(accounts).values({ clerkUserId, email }).onConflictDoNothing()
 */
export async function findOrCreateAccount(
  db: Database,
  clerkUserId: string,
  email: string
): Promise<Account> {
  void db;
  const now = new Date().toISOString();
  return {
    id: 'placeholder-account-id',
    clerkUserId,
    email,
    createdAt: now,
    updatedAt: now,
  };
}
