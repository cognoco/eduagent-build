import { eq } from 'drizzle-orm';
import {
  accounts,
  createScopedRepository,
  memoryFacts,
} from '@eduagent/database';

import { seedLearningProfile, setupTestDb } from './helpers/memory-facts';

describe('memory_facts dual-write integration guards', () => {
  it('Profile A cannot read Profile B memory_facts via createScopedRepository', async () => {
    const { db } = await setupTestDb();
    const { profileId: profileA, accountId: accountA } =
      await seedLearningProfile(db, {});
    const { profileId: profileB, accountId: accountB } =
      await seedLearningProfile(db, {});

    try {
      await db.insert(memoryFacts).values([
        {
          profileId: profileA,
          category: 'interest',
          text: 'A',
          textNormalized: 'a',
          metadata: {},
          observedAt: new Date(),
          confidence: 'medium',
        },
        {
          profileId: profileB,
          category: 'interest',
          text: 'B',
          textNormalized: 'b',
          metadata: {},
          observedAt: new Date(),
          confidence: 'medium',
        },
      ]);

      const scopedA = createScopedRepository(db, profileA);
      const rowsA = await scopedA.memoryFacts.findManyActive();
      expect(rowsA.map((row) => row.text)).toEqual(['A']);
    } finally {
      await db.delete(accounts).where(eq(accounts.id, accountA));
      await db.delete(accounts).where(eq(accounts.id, accountB));
    }
  });
});
