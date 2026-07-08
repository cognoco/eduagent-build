import type { Database } from '@eduagent/database';
import { pendingNotices } from '@eduagent/database';

import { recordPendingNotice } from './notices';

function makeInsertDb(rows: Array<{ id: string }>, existing?: { id: string }) {
  const returning = jest.fn().mockResolvedValue(rows);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values });
  const findFirst = jest.fn().mockResolvedValue(existing ?? null);

  return {
    db: {
      insert,
      query: { pendingNotices: { findFirst } },
    } as unknown as Database,
    insert,
    values,
    onConflictDoNothing,
    returning,
    findFirst,
  };
}

describe('recordPendingNotice', () => {
  it('returns the inserted notice id and uses the retry dedupe key', async () => {
    const { db, onConflictDoNothing, findFirst } = makeInsertDb([
      { id: 'notice-new' },
    ]);

    await expect(
      recordPendingNotice(db, {
        ownerProfileId: 'owner-1',
        type: 'consent_archived',
        childName: 'Ada',
      }),
    ).resolves.toBe('notice-new');

    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [
        pendingNotices.ownerProfileId,
        pendingNotices.type,
        pendingNotices.payloadJson,
      ],
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns the existing notice id when an Inngest retry repeats the write', async () => {
    const { db, findFirst } = makeInsertDb([], { id: 'notice-existing' });

    await expect(
      recordPendingNotice(db, {
        ownerProfileId: 'owner-1',
        type: 'consent_deleted',
        childName: 'Ada',
      }),
    ).resolves.toBe('notice-existing');

    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
