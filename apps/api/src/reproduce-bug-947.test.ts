/**
 * BUG-947 repro — runs against the staging DB to exercise the exact code path
 * that POST /profiles takes for "parent adds child age 13".
 *
 * Picks a real existing parent owner profile, runs createProfileWithLimitCheck,
 * deletes the created child afterwards. If anything in the service stack
 * throws, the assertion will fail with the actual exception trace.
 *
 * Run with:
 *   doppler run -p mentomate -c stg -- pnpm exec jest src/reproduce-bug-947.test.ts --no-coverage
 */
import { eq, and, sql } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subscriptions,
  createDatabase,
} from '@eduagent/database';
import { createProfileWithLimitCheck } from './services/profile';

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return url;
}

describe('[BUG-947 staging repro] createProfileWithLimitCheck for parent + 13yo', () => {
  it('runs against staging DB and surfaces the actual exception if any', async () => {
    const db = createDatabase(requireDatabaseUrl());

    // Find a parent owner with an active Family subscription. This matches
    // Slot F (parent owner, Family plan, 0 children) in the QA test grid.
    const [candidate] = await db
      .select({
        accountId: accounts.id,
        clerkUserId: accounts.clerkUserId,
        ownerProfileId: profiles.id,
        tier: subscriptions.tier,
        status: subscriptions.status,
      })
      .from(accounts)
      .innerJoin(profiles, eq(profiles.accountId, accounts.id))
      .innerJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
      .where(
        and(
          eq(profiles.isOwner, true),
          eq(subscriptions.tier, 'family'),
          eq(subscriptions.status, 'active')
        )
      )
      .limit(1);

    console.log('parent candidate (Family/active):', candidate);
    if (!candidate) {
      console.warn(
        'No Family-plan parent on staging — falling back to any owner profile'
      );
    }

    // Fallback: any owner profile with a subscription row, regardless of tier.
    let parent = candidate;
    if (!parent) {
      const [fallback] = await db
        .select({
          accountId: accounts.id,
          clerkUserId: accounts.clerkUserId,
          ownerProfileId: profiles.id,
          tier: subscriptions.tier,
          status: subscriptions.status,
        })
        .from(accounts)
        .innerJoin(profiles, eq(profiles.accountId, accounts.id))
        .innerJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
        .where(eq(profiles.isOwner, true))
        .limit(1);
      console.log('fallback parent candidate:', fallback);
      parent = fallback ?? null;
    }

    if (!parent) {
      throw new Error(
        'No parent profile with subscription found on staging — repro impossible'
      );
    }

    const stamp = Date.now();
    const input = {
      displayName: `BUG-947 repro ${stamp}`,
      birthYear: 2013,
    };

    let created: { id: string } | null = null;
    let caught: unknown = null;
    try {
      created = await createProfileWithLimitCheck(db, parent.accountId, input);
      console.log('SUCCESS — created profile id:', created.id);
    } catch (err) {
      caught = err;
      const e = err as Error & {
        code?: string;
        detail?: string;
        cause?: {
          name?: string;
          message?: string;
          code?: string;
          detail?: string;
          stack?: string;
        };
      };
      console.error('REPRO RAISED:');
      console.error('  name:    ', e.name);
      console.error('  message: ', e.message);
      console.error('  code:    ', e.code);
      console.error('  detail:  ', e.detail);
      console.error('  stack:   ', e.stack);
      if (e.cause) {
        console.error('  cause.name:    ', e.cause.name);
        console.error('  cause.message: ', e.cause.message);
        console.error('  cause.code:    ', e.cause.code);
        console.error('  cause.detail:  ', e.cause.detail);
        console.error('  cause.stack:   ', e.cause.stack);
      }
    } finally {
      // Clean up — delete the created profile if it landed.
      if (created) {
        await db.delete(profiles).where(eq(profiles.id, created.id)).execute();
        console.log('cleaned up profile', created.id);
      }
    }

    // Surface caught error so the test result reflects reality.
    if (caught) {
      throw caught;
    }
  }, 60000);
});
