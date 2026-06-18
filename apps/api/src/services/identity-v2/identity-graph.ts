// ---------------------------------------------------------------------------
// CUT-B1 onboarding-completion bootstrap (cutover-plan §2.2a). The executable
// boundary of OQ-1 option (c): the v2 identity graph is created at onboarding
// completion (when birth date is known), NOT at first authed request. The seam
// is the existing owner-profile create call (POST /v1/profiles, isOwner=true);
// in v2 it dispatches here. No new endpoint, no mobile call-site change.
//
// One DB transaction, all-or-nothing, in order:
//   1. BUG-411 email-reclaim guard (before any insert)
//   2. organization
//   3. person (calendar-validated birth_date + §1.3 preference columns)
//   4. login (clerk_user_id + verified email + person_id)
//   5. UPDATE person SET login_id = login.id   (reverse circular wire)
//   6. membership (roles = {admin, learner})
//   7. pre-repoint legacy anchors (accounts/profiles) for retained FKs
//   8. subscription (plus trial, trial_ends_at = computeTrialEndDate, payer)
//   9. subscription_payers (primary)
//   10. pre-repoint legacy subscription anchor for quota_pools FK
//   11. quota_pools
//
// Idempotency is fenced by login.clerk_user_id UNIQUE; the 23505 catch
// DISCRIMINATES by constraint name (pinned from the 0108 migration):
//   - login_clerk_user_id_unique → idempotent replay (read-and-return graph)
//   - login_email_unique → the BUG-411 race (audited refusal)
//   - anything else → rethrow (never swallow)
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import {
  accounts,
  login,
  membership,
  organization,
  person,
  profiles,
  quotaPools,
  subscription,
  subscriptionPayers,
  subscriptions as legacySubscriptions,
  type Database,
} from '@eduagent/database';
import { ConflictError, BadRequestError } from '../../errors';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { computeTrialEndDate } from '../trial';
import { getTierConfig } from '../subscription';
import { resolveIdentityV2, type ResolvedIdentityV2 } from './identity-resolve';

const logger = createLogger();

// Constraint names pinned from apps/api/drizzle/0108_identity_foundation_baseline.sql
// (lines 66-67). The 23505 discrimination hinges on matching these exactly — a
// wrong name would silently route the email-race to the rethrow branch and
// re-open BUG-411.
const LOGIN_CLERK_UNIQUE = 'login_clerk_user_id_unique';
const LOGIN_EMAIL_UNIQUE = 'login_email_unique';
const legacyTableExistsCache = new Map<string, boolean>();

/**
 * Reverse jurisdiction map: the profile-create `location` input
 * ('EU' | 'US' | 'OTHER') → `person.residence_jurisdiction`
 * ('EU' | 'US' | 'ROW'). The inverse of the reseed JURISDICTION_CASE
 * (verify-identity-reseed.mjs): US→US, EU→EU, OTHER→ROW. Absent location maps
 * to 'ROW' (the legacy NULL-location row reseeds to the 'OTHER'→'ROW' default).
 */
export function locationToJurisdiction(
  location: 'EU' | 'US' | 'OTHER' | null | undefined,
): string {
  switch (location) {
    case 'US':
      return 'US';
    case 'EU':
      return 'EU';
    case 'OTHER':
    default:
      return 'ROW';
  }
}

/**
 * Pairwise real-calendar validation for a full (year, month, day) birth date
 * (§2.2a). Today's schema validates month ∈ 1..12 and day ∈ 1..31
 * INDEPENDENTLY, and the transient consumer normalizes silently via `Date.UTC`
 * (Feb 31 → Mar 3). Acceptable while transient; NOT acceptable as durable
 * `person.birth_date`. Construct `Date.UTC(y, m-1, d)` and require a clean
 * round-trip. Returns the YYYY-MM-DD string for a valid trio, else throws 400.
 */
export function buildValidatedBirthDate(
  birthYear: number,
  birthMonth: number,
  birthDay: number,
): string {
  const dt = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (
    dt.getUTCFullYear() !== birthYear ||
    dt.getUTCMonth() + 1 !== birthMonth ||
    dt.getUTCDate() !== birthDay
  ) {
    throw new BadRequestError(
      `Invalid birth date: ${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')} is not a real calendar date.`,
    );
  }
  return toDateString(dt);
}

/** YYYY-MM-DD from a UTC Date (the `date` column's text form). */
function toDateString(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** One-way SHA-256 of an email, safe for logs/Sentry (mirrors account.ts). */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/** Postgres 23505 unique-violation discriminator. */
function uniqueViolationConstraint(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  ) {
    const constraint = (error as { constraint?: unknown }).constraint;
    return typeof constraint === 'string' ? constraint : '';
  }
  return null;
}

/** True iff `public.<table>` exists. Used only for pre-repoint legacy FK anchors. */
async function tableExists(
  db: Database,
  table: 'accounts' | 'profiles' | 'subscriptions',
): Promise<boolean> {
  const cached = legacyTableExistsCache.get(table);
  if (cached !== undefined) return cached;
  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  const exists = rows[0]?.reg != null;
  legacyTableExistsCache.set(table, exists);
  return exists;
}

/**
 * The audited BUG-411 reclaim refusal — verbatim parity with
 * `services/account.ts:203` (warn + captureException + the
 * `app/account.reclaim_attempt` non-core dispatch), then throw ConflictError.
 * Shared by the pre-insert guard and the concurrent-race 23505 branch.
 */
async function refuseReclaim(args: {
  incomingClerkUserId: string;
  existingClerkUserId: string | null;
  email: string;
}): Promise<never> {
  const emailHash = hashEmail(args.email);
  logger.warn('account.reclaim_attempt_blocked', {
    incomingClerkUserId: args.incomingClerkUserId,
    existingClerkUserId: args.existingClerkUserId,
    emailHash,
  });
  captureException(
    new Error(
      'Account reclaim attempt blocked: email matched existing login with different clerkUserId',
    ),
    {
      extra: {
        'account.reclaim_attempt_blocked': true,
        flow: 'createIdentityGraph.reclaimBlock',
        incomingClerkUserId: args.incomingClerkUserId,
        existingClerkUserId: args.existingClerkUserId,
        emailHash,
      },
    },
  );
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: observability-only marker — the reclaim attempt is
        // already BLOCKED in-line (ConflictError below) and escalated via
        // logger.warn + captureException. The Inngest event is a queryable
        // audit signal for the future out-of-band reclaim flow; no automated
        // handler is intended (mirrors account.ts).
        name: 'app/account.reclaim_attempt',
        data: {
          incomingClerkUserId: args.incomingClerkUserId,
          existingClerkUserId: args.existingClerkUserId,
          emailHash,
          timestamp: new Date().toISOString(),
        },
      }),
    'account.reclaim_attempt',
    { incomingClerkUserId: args.incomingClerkUserId, emailHash },
  );
  throw new ConflictError(
    'An account with this email already exists. Contact support to recover access.',
  );
}

/** Inputs to the bootstrap — the graphless Clerk identity + the owner-profile data. */
export interface CreateIdentityGraphInput {
  clerkUserId: string;
  /** Verified Clerk primary email (from the auth context). */
  verifiedEmail: string;
  displayName: string;
  birthYear: number;
  /** WI-297 optional full date — when present, persisted as the exact birth_date. */
  birthMonth?: number;
  birthDay?: number;
  location?: 'EU' | 'US' | 'OTHER' | null;
  conversationLanguage?: string;
  pronouns?: string | null;
  avatarUrl?: string | null;
  /** IANA timezone from the device, stored on the organization for trial expiry. */
  timezone?: string | null;
  /** Organization display name; derived as today when absent. */
  organizationName?: string;
}

/**
 * Create the v2 identity graph at onboarding completion. Idempotent on
 * `login.clerk_user_id`; the BUG-411 email-reclaim guard runs before insert.
 * Returns the resolved graph (same shape resolveIdentityV2 returns) so the
 * caller can build the response/context without a second read.
 */
export async function createIdentityGraph(
  db: Database,
  input: CreateIdentityGraphInput,
): Promise<ResolvedIdentityV2> {
  // birth_date: exact full date when WI-297 parts present (calendar-validated),
  // else birthYear-01-01 (the reseed convention).
  const birthDate =
    input.birthMonth != null && input.birthDay != null
      ? buildValidatedBirthDate(
          input.birthYear,
          input.birthMonth,
          input.birthDay,
        )
      : `${input.birthYear}-01-01`;

  try {
    return await db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;

      // (1) BUG-411 email-reclaim guard — before any insert. login.email is
      // UNIQUE; a same-email/different-Clerk registration must be blocked
      // loudly, never silently rewired.
      const existingByEmail = await txDb.query.login.findFirst({
        where: eq(login.email, input.verifiedEmail),
      });
      if (
        existingByEmail &&
        existingByEmail.clerkUserId !== input.clerkUserId
      ) {
        await refuseReclaim({
          incomingClerkUserId: input.clerkUserId,
          existingClerkUserId: existingByEmail.clerkUserId,
          email: input.verifiedEmail,
        });
      }
      // Same clerk id + same email already wired → idempotent replay.
      if (
        existingByEmail &&
        existingByEmail.clerkUserId === input.clerkUserId
      ) {
        const resolved = await resolveIdentityV2(txDb, input.clerkUserId);
        if (resolved) return resolved;
        // Login exists but graph is incomplete — fall through is unsafe (would
        // re-insert login → 23505); surface as a conflict for the caller.
        throw new ConflictError(
          'Identity already partially provisioned; retry after resolution.',
        );
      }

      // (2) organization
      const [orgRow] = await txDb
        .insert(organization)
        .values({
          name: input.organizationName ?? `${input.displayName}'s organization`,
          timezone: input.timezone ?? null,
        })
        .returning();
      if (!orgRow) throw new Error('organization insert did not return a row');

      // (3) person
      const [personRow] = await txDb
        .insert(person)
        .values({
          displayName: input.displayName,
          birthDate,
          residenceJurisdiction: locationToJurisdiction(input.location),
          ...(input.conversationLanguage !== undefined
            ? { conversationLanguage: input.conversationLanguage }
            : {}),
          pronouns: input.pronouns ?? null,
          avatarUrl: input.avatarUrl ?? null,
        })
        .returning();
      if (!personRow) throw new Error('person insert did not return a row');

      // (4) login
      const [loginRow] = await txDb
        .insert(login)
        .values({
          personId: personRow.id,
          clerkUserId: input.clerkUserId,
          email: input.verifiedEmail,
        })
        .returning();
      if (!loginRow) throw new Error('login insert did not return a row');

      // (5) reverse wire person.login_id = login.id (the circular pair; canon
      // reads login_id IS NULL as managed/no-credential, so an owner MUST be
      // bound to their login — the verify check pins this).
      await txDb
        .update(person)
        .set({ loginId: loginRow.id, updatedAt: new Date() })
        .where(eq(person.id, personRow.id));

      // (6) membership {admin, learner}
      await txDb.insert(membership).values({
        personId: personRow.id,
        organizationId: orgRow.id,
        roles: ['admin', 'learner'],
      });

      // (7) Pre-M-REPOINT bridge: retained learning/quota satellites still have
      // FKs to legacy accounts/profiles/subscriptions in the committed schema.
      // Keep ids aligned with the v2 graph so flag-on CI can exercise real
      // onboarding before the convergence FK re-point. Remove with M-DROP.
      const legacyAccountsPresent = await tableExists(txDb, 'accounts');
      if (legacyAccountsPresent) {
        await txDb.insert(accounts).values({
          id: orgRow.id,
          clerkUserId: input.clerkUserId,
          email: input.verifiedEmail,
          timezone: input.timezone ?? null,
        });
        if (await tableExists(txDb, 'profiles')) {
          await txDb.insert(profiles).values({
            id: personRow.id,
            accountId: orgRow.id,
            displayName: input.displayName,
            avatarUrl: input.avatarUrl ?? null,
            birthYear: input.birthYear,
            location: input.location ?? null,
            isOwner: true,
            hasPremiumLlm: false,
            conversationLanguage: input.conversationLanguage ?? 'en',
            pronouns: input.pronouns ?? null,
          });
        }
      }

      // (8) subscription — FR108 14-day plus trial, end-of-day in the org tz.
      const trialEndsAt = computeTrialEndDate(new Date(), orgRow.timezone);
      const [subRow] = await txDb
        .insert(subscription)
        .values({
          organizationId: orgRow.id,
          planTier: 'plus',
          status: 'trial',
          payerPersonId: personRow.id,
          trialEndsAt,
        })
        .returning();
      if (!subRow) throw new Error('subscription insert did not return a row');

      // (9) subscription_payers — primary
      await txDb.insert(subscriptionPayers).values({
        subscriptionId: subRow.id,
        personId: personRow.id,
        role: 'primary',
      });

      // (10) Pre-M-REPOINT bridge for quota_pools.subscription_id, whose FK
      // still targets legacy subscriptions(id) until WI-586 re-points it. The
      // v2 subscription remains authoritative; this row is only the FK parent.
      if (legacyAccountsPresent && (await tableExists(txDb, 'subscriptions'))) {
        await txDb.insert(legacySubscriptions).values({
          id: subRow.id,
          accountId: orgRow.id,
          tier: 'plus',
          status: 'trial',
          trialEndsAt,
        });
      }

      // (11) quota_pools — same cycle-reset convention as legacy
      // createSubscription. This row keys on subRow.id and is store-agnostic
      // once the pre-repoint legacy parent above exists.
      const plusTier = getTierConfig('plus');
      const cycleResetAt = new Date();
      cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
      await txDb.insert(quotaPools).values({
        subscriptionId: subRow.id,
        monthlyLimit: plusTier.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: plusTier.dailyLimit,
        usedToday: 0,
        cycleResetAt,
      });

      return {
        account: {
          id: orgRow.id,
          clerkUserId: loginRow.clerkUserId,
          email: loginRow.email,
          timezone: orgRow.timezone,
          createdAt: orgRow.createdAt.toISOString(),
          updatedAt: orgRow.updatedAt.toISOString(),
        },
        personId: personRow.id,
        organizationId: orgRow.id,
        isOwner: true,
        roles: ['admin', 'learner'],
      };
    });
  } catch (error) {
    // 23505 discrimination (atomicity already rolled back the partial graph).
    const constraint = uniqueViolationConstraint(error);
    if (constraint !== null) {
      if (constraint === LOGIN_CLERK_UNIQUE) {
        // Genuine idempotent replay (network retry / client double-tap / the
        // winning concurrent first request). Read-and-return the existing graph.
        const resolved = await resolveIdentityV2(db, input.clerkUserId);
        if (resolved) return resolved;
        // Race: the winner is mid-commit. Surface as conflict for a clean retry.
        throw new ConflictError(
          'Identity provisioning in progress; please retry.',
        );
      }
      if (constraint === LOGIN_EMAIL_UNIQUE) {
        // The loser of a concurrent race landed on the email unique. Two cases
        // (the discrimination MUST distinguish them — re-read the row by email):
        //   - same Clerk id → a same-email/same-Clerk idempotent replay whose
        //     pre-insert guard happened to miss the racing winner. Return the
        //     now-committed graph (idempotent), NOT a refusal.
        //   - different Clerk id → the BUG-411 reclaim race (two concurrent
        //     same-email/different-Clerk bootstraps). Route through the SAME
        //     audited refusal — never a raw 500.
        const existingByEmail = await db.query.login.findFirst({
          where: eq(login.email, input.verifiedEmail),
        });
        if (existingByEmail?.clerkUserId === input.clerkUserId) {
          const resolved = await resolveIdentityV2(db, input.clerkUserId);
          if (resolved) return resolved;
          throw new ConflictError(
            'Identity provisioning in progress; please retry.',
          );
        }
        return await refuseReclaim({
          incomingClerkUserId: input.clerkUserId,
          existingClerkUserId: existingByEmail?.clerkUserId ?? null,
          email: input.verifiedEmail,
        });
      }
    }
    throw error;
  }
}
