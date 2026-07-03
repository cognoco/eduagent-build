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

import { eq } from 'drizzle-orm';
import { activationEvents } from '@eduagent/database';
import { createIntegrationDb } from '../../../../tests/integration/helpers';
import {
  recordActivationEvent,
  deriveActivationProfileShape,
} from './activation-events';

const db = createIntegrationDb();

async function cleanupDedupeKey(dedupeKey: string): Promise<void> {
  await db
    .delete(activationEvents)
    .where(eq(activationEvents.dedupeKey, dedupeKey));
}

describe('Integration: recordActivationEvent', () => {
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

describe('deriveActivationProfileShape', () => {
  it('returns child for a non-owner profile', () => {
    expect(deriveActivationProfileShape({ isOwner: false })).toBe('child');
  });

  it('returns unknown for an owner profile (cannot distinguish solo vs guardian without an extra query)', () => {
    expect(deriveActivationProfileShape({ isOwner: true })).toBe('unknown');
  });
});
