// ---------------------------------------------------------------------------
// CUT-B2 guardianship read twins — integration tests against the real
// guardianship table. Covers the active-edge filter (revoked_at IS NULL), the
// child-enumeration and parent-enumeration reads, and the batched filter — the
// family_links → guardianship re-point the P3 services share.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  guardianship,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import {
  filterChargesUnderGuardian,
  getChargePersonIds,
  getGuardianPersonIds,
  isGuardianOf,
} from './guardianship';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)('guardianship reads (integration)', () => {
  let db: Database;
  const personIds: string[] = [];
  const orgIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    for (const pid of personIds) {
      await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
      await db
        .delete(guardianship)
        .where(eq(guardianship.guardianPersonId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of orgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
    personIds.length = 0;
    orgIds.length = 0;
  });

  async function seedPerson(name: string): Promise<string> {
    const [p] = await db
      .insert(person)
      .values({
        displayName: name,
        birthDate: '2010-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(p!.id);
    return p!.id;
  }

  it('isGuardianOf is true for an active edge, false after revoke', async () => {
    const guardian = await seedPerson('Parent');
    const child = await seedPerson('Child');
    const [edge] = await db
      .insert(guardianship)
      .values({ guardianPersonId: guardian, chargePersonId: child })
      .returning();

    expect(await isGuardianOf(db, guardian, child)).toBe(true);

    await db
      .update(guardianship)
      .set({ revokedAt: new Date() })
      .where(eq(guardianship.id, edge!.id));
    expect(await isGuardianOf(db, guardian, child)).toBe(false);
  });

  it('getChargePersonIds / getGuardianPersonIds return only active edges', async () => {
    const guardian = await seedPerson('Parent');
    const childA = await seedPerson('ChildA');
    const childB = await seedPerson('ChildB');
    await db.insert(guardianship).values([
      { guardianPersonId: guardian, chargePersonId: childA },
      {
        guardianPersonId: guardian,
        chargePersonId: childB,
        revokedAt: new Date(),
      },
    ]);

    expect((await getChargePersonIds(db, guardian)).sort()).toEqual([childA]);
    expect(await getGuardianPersonIds(db, childA)).toEqual([guardian]);
    // childB's only edge is revoked → no active guardians.
    expect(await getGuardianPersonIds(db, childB)).toEqual([]);
  });

  it('filterChargesUnderGuardian filters a candidate set to the guardian active edges', async () => {
    const guardian = await seedPerson('Parent');
    const childA = await seedPerson('ChildA');
    const childB = await seedPerson('ChildB');
    const unrelated = await seedPerson('Unrelated');
    await db
      .insert(guardianship)
      .values({ guardianPersonId: guardian, chargePersonId: childA });

    const filtered = await filterChargesUnderGuardian(db, guardian, [
      childA,
      childB,
      unrelated,
    ]);
    expect(filtered).toEqual([childA]);
  });
});
