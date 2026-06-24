import { listEligibleSelfReportPersonIdsV2 } from './solo-progress-reports-v2';
import type { Database } from '@eduagent/database';
import * as guardianship from './guardianship';
import * as consentStatusV2 from './consent-status-v2';

// ---------------------------------------------------------------------------
// [WI-961] listEligibleSelfReportPersonIdsV2 — guardian + consent fan-out.
//
// The function ran two serial for-loops:
//   1. per-owner getGuardianPersonIds  (exclude linked children)
//   2. per-self-managed resolveConsentStatus (GDPR gate)
// The fix fans both out with Promise.all. These tests prove:
//   - correctness: the returned person-id set is unchanged
//   - parallelism: the second owner's lookup STARTS before the first owner's
//     deferred lookup RESOLVES (impossible under serial awaiting)
//
// We spy on getGuardianPersonIds / resolveConsentStatus (real exported module
// functions — jest.spyOn on the namespace, NOT jest.mock of an internal path,
// so GC1/GC6 are satisfied). The DB is a hand-built fake standing in for the
// two SELECT query builders the function issues before the loops.
// ---------------------------------------------------------------------------

const WINDOW = {
  start: new Date('2026-06-01T00:00:00.000Z'),
  endExclusive: new Date('2026-06-08T00:00:00.000Z'),
};

// Two owners, both old enough (birthDate → age >= MINIMUM_AGE), both admins.
const PERSON_A = '11111111-1111-1111-1111-111111111111';
const PERSON_B = '22222222-2222-2222-2222-222222222222';
const ORG = '99999999-9999-9999-9999-999999999999';

/**
 * Builds a fake Database covering the two queries the function issues before
 * the loops:
 *   1. selectDistinct(...).from(learningSessions).where(...)  → activity rows
 *   2. select(...).from(person).innerJoin(membership).where(...) → candidates
 * Both are thenable query builders; we resolve them with fixed fixtures.
 */
function makeFakeDb(): Database {
  let selectCall = 0;
  const db = {
    // selectDistinct → activity rows (candidate person ids)
    selectDistinct: () => ({
      from: () => ({
        where: () =>
          Promise.resolve([{ profileId: PERSON_A }, { profileId: PERSON_B }]),
      }),
    }),
    // select → candidates (person + membership join)
    select: () => {
      selectCall += 1;
      return {
        from: () => ({
          innerJoin: () => ({
            where: () =>
              Promise.resolve([
                {
                  personId: PERSON_A,
                  birthDate: '1990-01-01',
                  organizationId: ORG,
                },
                {
                  personId: PERSON_B,
                  birthDate: '1992-01-01',
                  organizationId: ORG,
                },
              ]),
          }),
        }),
      };
    },
    __selectCallCount: () => selectCall,
  } as unknown as Database;
  return db;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('[WI-961] listEligibleSelfReportPersonIdsV2', () => {
  it('returns the self-managed, GDPR-consented owner person ids', async () => {
    const db = makeFakeDb();
    // Neither owner is a charge (no guardians) → both self-managed.
    jest.spyOn(guardianship, 'getGuardianPersonIds').mockResolvedValue([]);
    // A: no consent row (null → allowed). B: explicitly CONSENTED.
    jest
      .spyOn(consentStatusV2, 'resolveConsentStatus')
      .mockImplementation(async (_db, personId) =>
        personId === PERSON_A ? null : 'CONSENTED',
      );

    const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

    expect(result.sort()).toEqual([PERSON_A, PERSON_B].sort());
  });

  it('excludes a linked child (guardian present) and a non-consented owner', async () => {
    const db = makeFakeDb();
    // A has a guardian → linked child → excluded before the consent stage.
    jest
      .spyOn(guardianship, 'getGuardianPersonIds')
      .mockImplementation(async (_db, personId) =>
        personId === PERSON_A ? ['guardian-x'] : [],
      );
    // B reaches consent and is WITHDRAWN → excluded.
    jest
      .spyOn(consentStatusV2, 'resolveConsentStatus')
      .mockResolvedValue('WITHDRAWN');

    const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

    expect(result).toEqual([]);
  });

  it('fans out the per-owner guardianship lookups in parallel', async () => {
    const db = makeFakeDb();
    const callOrder: string[] = [];

    jest
      .spyOn(guardianship, 'getGuardianPersonIds')
      .mockImplementation(async (_db, personId) => {
        callOrder.push(`guardian-start-${personId}`);
        if (personId === PERSON_A) {
          // Defer A by a microtask so B's lookup can start meanwhile.
          await new Promise<void>((resolve) => resolve());
        }
        callOrder.push(`guardian-done-${personId}`);
        return [];
      });
    jest
      .spyOn(consentStatusV2, 'resolveConsentStatus')
      .mockResolvedValue('CONSENTED');

    await listEligibleSelfReportPersonIdsV2(db, WINDOW);

    const startB = callOrder.indexOf(`guardian-start-${PERSON_B}`);
    const doneA = callOrder.indexOf(`guardian-done-${PERSON_A}`);
    expect(startB).toBeGreaterThanOrEqual(0);
    expect(doneA).toBeGreaterThanOrEqual(0);
    // Parallel: B's lookup starts before A's deferred lookup resolves.
    // Serial awaiting would force doneA < startB, failing this assertion.
    expect(startB).toBeLessThan(doneA);
  });

  it('fans out the per-owner consent-status reads in parallel', async () => {
    const db = makeFakeDb();
    const callOrder: string[] = [];

    jest.spyOn(guardianship, 'getGuardianPersonIds').mockResolvedValue([]);
    jest
      .spyOn(consentStatusV2, 'resolveConsentStatus')
      .mockImplementation(async (_db, personId) => {
        callOrder.push(`consent-start-${personId}`);
        if (personId === PERSON_A) {
          await new Promise<void>((resolve) => resolve());
        }
        callOrder.push(`consent-done-${personId}`);
        return 'CONSENTED';
      });

    await listEligibleSelfReportPersonIdsV2(db, WINDOW);

    const startB = callOrder.indexOf(`consent-start-${PERSON_B}`);
    const doneA = callOrder.indexOf(`consent-done-${PERSON_A}`);
    expect(startB).toBeGreaterThanOrEqual(0);
    expect(doneA).toBeGreaterThanOrEqual(0);
    expect(startB).toBeLessThan(doneA);
  });
});
