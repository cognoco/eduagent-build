import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { createDatabase, person, type Database } from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  activatePendingNotice,
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
});
