import type { Database } from '@eduagent/database';

import { cascadeDeleteFactWithAncestry } from './cascade-delete';

describe('cascadeDeleteFactWithAncestry', () => {
  it('emits deleted IDs from the recursive delete', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValue({ rows: [{ id: 'a' }, { id: 'b' }] }),
    } as unknown as Database;
    const emit = jest.fn();

    await expect(
      cascadeDeleteFactWithAncestry(db, 'p1', 'a', { emit })
    ).resolves.toEqual({ deletedIds: ['a', 'b'] });
    expect(emit).toHaveBeenCalledWith('memory.fact.deleted', {
      profileId: 'p1',
      deletedIds: ['a', 'b'],
    });
  });
});
