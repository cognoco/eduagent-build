// GC6: Internal mock (`createUpdateDb`) removed. The verified-path DB tests
// (first-stamp writes, second-stamp idempotent, book rollup) moved to
// retention-mastery.db.integration.test.ts which exercises the real
// applyRetentionUpdate + Drizzle transaction against a real DB.
//
// This unit suite retains only the non-DB branch: when xpChange !== 'verified',
// stampMasteryOnVerify must return without touching the DB at all. Proved via a
// Proxy db that throws on any access.
import type { Database } from '@eduagent/database';
import { stampMasteryOnVerify } from './retention-mastery';

function throwingDb(label: string): Database {
  return new Proxy({} as Database, {
    get(_, prop) {
      throw new Error(
        `[retention-mastery.test] unexpected DB access via .${String(prop)} — ${label}`,
      );
    },
  });
}

describe('stampMasteryOnVerify — non-verify early return', () => {
  const masteredAt = new Date('2026-05-30T12:00:00.000Z');

  it('does not touch the DB when xpChange is "decayed"', async () => {
    const db = throwingDb('xpChange=decayed');
    await expect(
      stampMasteryOnVerify(db, {
        profileId: 'profile-1',
        topicId: 'topic-1',
        cardId: 'card-1',
        xpChange: 'decayed',
        masteredAt,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not touch the DB when xpChange is "none"', async () => {
    const db = throwingDb('xpChange=none');
    await expect(
      stampMasteryOnVerify(db, {
        profileId: 'profile-1',
        topicId: 'topic-1',
        cardId: 'card-1',
        xpChange: 'none',
        masteredAt,
      }),
    ).resolves.toBeUndefined();
  });
});
