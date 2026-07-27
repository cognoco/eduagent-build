/**
 * Integration: recordActivationEvent (WI-1504)
 *
 * Exercises the writer service against the real Neon/local-pg database — no
 * mocks. Verifies the two invariants the whole activation-funnel design
 * depends on:
 *   - profileId is genuinely nullable (pre-signup events)
 *   - dedupeKey enforces "first occurrence only" semantics via
 *     onConflictDoNothing, even across two separate calls
 */

import { eq, sql } from 'drizzle-orm';
import { activationEvents, person } from '@eduagent/database';
import { createIntegrationDb } from '../../../../tests/integration/helpers';
import {
  buildActivationEventOccurrenceKey,
  recordActivationEvent,
  recordActivationEventSafely,
  deriveActivationProfileShape,
} from './activation-events';

const db = createIntegrationDb();

async function cleanupDedupeKey(dedupeKey: string): Promise<void> {
  await db
    .delete(activationEvents)
    .where(eq(activationEvents.dedupeKey, dedupeKey));
}

describe('Integration: recordActivationEvent', () => {
  it('preserves the first-session event fields when recording through the shared safe helper', async () => {
    const [profile] = await db
      .insert(person)
      .values({
        displayName: 'Activation event helper test',
        birthDate: '2016-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    const profileId = profile!.id;
    const dedupeKey = `activation=first_session_started|actor=${profileId}|occurrence=null`;

    try {
      const row = await recordActivationEventSafely(
        db,
        {
          eventType: 'first_session_started',
          profileId,
          profileMeta: { isOwner: false },
          route: 'POST /sessions',
          metadata: { sessionId: 'session-1' },
        },
        'sessions.start.first_session_started',
        { profileId, sessionId: 'session-1' },
      );

      expect(row).toMatchObject({
        eventType: 'first_session_started',
        profileId,
        anonymousId: null,
        environment: null,
        appVersion: null,
        platform: null,
        profileShape: 'child',
        route: 'POST /sessions',
        dedupeKey,
        metadata: { sessionId: 'session-1' },
      });
    } finally {
      await cleanupDedupeKey(dedupeKey);
      await db.delete(person).where(eq(person.id, profileId));
    }
  });

  it('records a pre-signup event with profileId null and anonymousId set', async () => {
    const dedupeKey = `test-activation-${Date.now()}-app-opened`;
    await cleanupDedupeKey(dedupeKey);

    const row = await recordActivationEvent(db, {
      eventType: 'app_opened',
      anonymousId: 'anon-device-123',
      dedupeKey,
      environment: 'test',
      platform: 'ios',
      route: 'app_launch',
    });

    expect(row).not.toBeNull();
    expect(row?.profileId).toBeNull();
    expect(row?.anonymousId).toBe('anon-device-123');
    expect(row?.eventType).toBe('app_opened');

    const [persisted] = await db
      .select()
      .from(activationEvents)
      .where(eq(activationEvents.dedupeKey, dedupeKey));
    expect(persisted).toBeDefined();
    expect(persisted.profileId).toBeNull();

    await cleanupDedupeKey(dedupeKey);
  });

  it('keeps only the first row when the same dedupeKey is inserted twice', async () => {
    const dedupeKey = `test-activation-${Date.now()}-first-session`;
    await cleanupDedupeKey(dedupeKey);

    const first = await recordActivationEvent(db, {
      eventType: 'first_session_started',
      anonymousId: 'anon-device-dedupe',
      dedupeKey,
      metadata: { sessionId: 'session-1' },
    });
    expect(first).not.toBeNull();

    const second = await recordActivationEvent(db, {
      eventType: 'first_session_started',
      anonymousId: 'anon-device-dedupe',
      dedupeKey,
      metadata: { sessionId: 'session-2' },
    });
    // onConflictDoNothing → no row returned on the duplicate insert.
    expect(second).toBeNull();

    const rows = await db
      .select()
      .from(activationEvents)
      .where(eq(activationEvents.dedupeKey, dedupeKey));
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({ sessionId: 'session-1' });

    await cleanupDedupeKey(dedupeKey);
  });

  it('rejects an unrecognized eventType at the database layer (CHECK constraint)', async () => {
    const dedupeKey = `test-activation-${Date.now()}-bad-type`;
    await cleanupDedupeKey(dedupeKey);

    await expect(
      db.insert(activationEvents).values({
        eventType: 'not_a_real_event' as never,
        dedupeKey,
        metadata: {},
      }),
    ).rejects.toThrow();

    await cleanupDedupeKey(dedupeKey);
  });
});

describe('buildActivationEventOccurrenceKey', () => {
  const occurredAt = new Date('2026-07-21T23:59:59.000Z');

  it('uses the supplied occurrence id without changing it', () => {
    expect(
      buildActivationEventOccurrenceKey({
        occurrenceId: 'review-card/42',
        occurredAt,
      }),
    ).toBe('review-card/42');
  });

  it('uses the UTC day when the occurrence id is absent', () => {
    expect(buildActivationEventOccurrenceKey({ occurredAt })).toBe(
      '2026-07-21',
    );
  });
});

describe('activation_events RLS policy [WI-1504 / ASSUMP-F14]', () => {
  // The production role (neondb_owner) has BYPASSRLS, so the policy cannot be
  // exercised by an INSERT here (and SET ROLE to the non-bypass app_user is
  // denied on this managed instance). Instead we assert the deployed policy's
  // SHAPE straight from the catalog: RLS enabled + the nullable clause present.
  // This runs in CI's integration lane against a freshly-migrated DB, so it is
  // a genuine RED-GREEN on migration 0131 landing the `profile_id IS NULL`
  // clause — the exact clause that lets pre-account (NULL-profile) rows through
  // once RLS is enforced under app_user in a future S-06 phase. It goes RED if
  // someone reverts activation_events to the bare sibling
  // `profile_id = current_setting(...)` policy (which would block those writes).
  it('has ROW LEVEL SECURITY enabled on the table', async () => {
    const res = (await db.execute(
      sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'activation_events'`,
    )) as unknown as { rows: Array<{ relrowsecurity: boolean }> };
    expect(res.rows[0]?.relrowsecurity).toBe(true);
  });

  it('has a profile-isolation policy whose USING and WITH CHECK admit NULL profile_id', async () => {
    const res = (await db.execute(
      sql`SELECT qual, with_check FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'activation_events'
            AND policyname = 'activation_events_profile_isolation'`,
    )) as unknown as {
      rows: Array<{ qual: string | null; with_check: string | null }>;
    };
    expect(res.rows).toHaveLength(1);
    const { qual, with_check } = res.rows[0]!;
    // Both the read (USING) and write (WITH CHECK) predicates must admit
    // NULL-profile rows AND scope non-null rows to the active profile.
    expect(qual).toMatch(/profile_id\s+IS\s+NULL/i);
    expect(qual).toMatch(/current_setting\('app\.current_profile_id'/i);
    expect(with_check).toMatch(/profile_id\s+IS\s+NULL/i);
    expect(with_check).toMatch(/current_setting\('app\.current_profile_id'/i);
  });
});

describe('deriveActivationProfileShape', () => {
  it('returns child for a non-owner profile', () => {
    expect(deriveActivationProfileShape({ isOwner: false })).toBe('child');
  });

  it('returns unknown for an owner profile (cannot distinguish solo vs guardian without an extra query)', () => {
    expect(deriveActivationProfileShape({ isOwner: true })).toBe('unknown');
  });
});
