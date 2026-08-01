import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  pendingNotices,
  person,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  activatePendingNotice,
  deleteStalePreparedNotices,
  listPendingNotices,
  recordPendingNotice,
} from './notices';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)('prepared pending notices', () => {
  let db: Database;
  let ownerProfileId: string | undefined;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    if (ownerProfileId) {
      await db.delete(person).where(eq(person.id, ownerProfileId));
      ownerProfileId = undefined;
    }
  });

  it('[WI-2788] hides a prepared deletion notice until erasure activates it', async () => {
    const [owner] = await db
      .insert(person)
      .values({
        displayName: 'Notice Owner',
        birthDate: '1990-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning({ id: person.id });
    ownerProfileId = owner!.id;
    const noticeId = await recordPendingNotice(db, {
      ownerProfileId,
      type: 'consent_deleted',
      childName: 'Prepared Child',
      sourceId: `wi2788:${ownerProfileId}`,
      ready: false,
    });

    await expect(listPendingNotices(db, ownerProfileId)).resolves.toEqual([]);
    await expect(
      activatePendingNotice(db, ownerProfileId, noticeId),
    ).resolves.toBe(true);
    await expect(listPendingNotices(db, ownerProfileId)).resolves.toEqual([
      expect.objectContaining({ id: noticeId, type: 'consent_deleted' }),
    ]);
  });

  it('[WI-2788] expires only stale unready child-name notices', async () => {
    const [owner] = await db
      .insert(person)
      .values({
        displayName: 'Retention Owner',
        birthDate: '1990-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning({ id: person.id });
    ownerProfileId = owner!.id;
    const now = Date.now();
    await db.insert(pendingNotices).values([
      {
        ownerProfileId,
        type: 'consent_deleted',
        payloadJson: { childName: 'Stale Hidden' },
        createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
        readyAt: null,
      },
      {
        ownerProfileId,
        type: 'consent_deleted',
        payloadJson: { childName: 'Visible Historical' },
        createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
        readyAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
      },
      {
        ownerProfileId,
        type: 'consent_deleted',
        payloadJson: { childName: 'Recent Hidden' },
        createdAt: new Date(now - 60 * 60 * 1000),
        readyAt: null,
      },
    ]);

    await expect(deleteStalePreparedNotices(db)).resolves.toBe(1);
    const survivors = await db
      .select({ payload: pendingNotices.payloadJson })
      .from(pendingNotices)
      .where(eq(pendingNotices.ownerProfileId, ownerProfileId));
    expect(survivors).toEqual(
      expect.arrayContaining([
        { payload: { childName: 'Visible Historical' } },
        { payload: { childName: 'Recent Hidden' } },
      ]),
    );
    expect(survivors).toHaveLength(2);
  });
});
