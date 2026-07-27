import { resolveSupporterColdStart } from './supporter-coldstart';

type SelectResult = Array<Record<string, unknown>>;

interface FakeSelectBuilder {
  from: (...args: unknown[]) => FakeSelectBuilder;
  leftJoin: (...args: unknown[]) => FakeSelectBuilder;
  innerJoin: (...args: unknown[]) => FakeSelectBuilder;
  where: (...args: unknown[]) => FakeSelectBuilder;
  orderBy: (...args: unknown[]) => FakeSelectBuilder;
  limit: (...args: unknown[]) => Promise<SelectResult>;
}

function dbWithSelectResults(results: SelectResult[]) {
  const pending = [...results];
  const select = jest.fn((): FakeSelectBuilder => {
    const builder: FakeSelectBuilder = {
      from: jest.fn((..._args: unknown[]) => builder),
      leftJoin: jest.fn((..._args: unknown[]) => builder),
      innerJoin: jest.fn((..._args: unknown[]) => builder),
      where: jest.fn((..._args: unknown[]) => builder),
      orderBy: jest.fn((..._args: unknown[]) => builder),
      limit: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  return { select } as never;
}

const supporterPersonId = '00000000-0000-4000-8000-000000000001';

describe('resolveSupporterColdStart', () => {
  it('returns variant-zero when no accepted supportership edge exists', async () => {
    const db = dbWithSelectResults([[]]);

    await expect(
      resolveSupporterColdStart(db, supporterPersonId),
    ).resolves.toEqual({
      variant: 'variant-zero',
      cards: [{ state: 'none', anchor: 'add-child' }],
      selfLearningDoorway: true,
    });
  });

  // [WI-2541] The card-class discriminator is `credentialed` (a Login row
  // exists — the EXISTS clause in the edges query), NOT person.hasOwnAccount.
  // The fake-db returns edge rows verbatim, so these unit rows carry the
  // resolved `credentialed` value directly; the real login-presence predicate
  // (and every partition of the (credentialed, learning-state, same-org) tuple)
  // is proven against a real DB by supporter-coldstart.integration.test.ts.
  it('branches accepted edges into managed, granted-idle, and active states', async () => {
    const db = dbWithSelectResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000101',
          personId: '00000000-0000-4000-8000-000000000201',
          displayName: 'Managed Child',
          credentialed: false,
        },
        {
          edgeId: '00000000-0000-4000-8000-000000000102',
          personId: '00000000-0000-4000-8000-000000000202',
          displayName: 'Idle Teen',
          credentialed: true,
        },
        {
          edgeId: '00000000-0000-4000-8000-000000000103',
          personId: '00000000-0000-4000-8000-000000000203',
          displayName: 'Active Teen',
          credentialed: true,
        },
      ],
      // [WI-2226 owner-gate] getPersonOrganizationId(supporterPersonId) —
      // the supporter's own org.
      [{ organizationId: '00000000-0000-4000-8000-000000000901' }],
      // isPersonInOrg(managed candidate, supporter org) — non-empty = in org.
      [{ id: '00000000-0000-4000-8000-000000000201' }],
      [],
      [],
      [{ surfaceCount: 3 }],
      [{ id: 'subject-1' }],
    ]);

    await expect(
      resolveSupporterColdStart(db, supporterPersonId),
    ).resolves.toEqual({
      variant: 'per-child',
      selfLearningDoorway: true,
      cards: [
        {
          personId: '00000000-0000-4000-8000-000000000201',
          edgeId: '00000000-0000-4000-8000-000000000101',
          displayName: 'Managed Child',
          state: 'managed',
          anchor: 'handoff',
        },
        {
          personId: '00000000-0000-4000-8000-000000000202',
          edgeId: '00000000-0000-4000-8000-000000000102',
          displayName: 'Idle Teen',
          state: 'granted-idle',
          anchor: 'kickstart',
          staleIdleStep: 2,
        },
      ],
    });
  });

  it('does not synthesize consent-pending cards without an S5 pending-link source', async () => {
    const db = dbWithSelectResults([[]]);

    const result = await resolveSupporterColdStart(db, supporterPersonId);

    expect(JSON.stringify(result)).not.toContain('consent-pending');
  });

  // [WI-2226 owner-gate] Routing-level check that an uncredentialed candidate
  // (credentialed=false) outside the supporter's own org is suppressed, not
  // rendered. The real predicate (does the supportee's membership actually
  // resolve under the supporter's org id) is proven against a real DB by
  // supporter-coldstart.integration.test.ts — this fake-db unit test only
  // exercises the branch given canned inputs.
  it("suppresses a managed card for a candidate outside the supporter's own org", async () => {
    const db = dbWithSelectResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000101',
          personId: '00000000-0000-4000-8000-000000000201',
          displayName: 'Cross-Org Candidate',
          credentialed: false,
        },
      ],
      // getPersonOrganizationId(supporterPersonId).
      [{ organizationId: '00000000-0000-4000-8000-000000000901' }],
      // isPersonInOrg(candidate, supporter org) — empty = NOT in org.
      [],
    ]);

    await expect(
      resolveSupporterColdStart(db, supporterPersonId),
    ).resolves.toEqual({
      variant: 'per-child',
      selfLearningDoorway: true,
      cards: [],
    });
  });
});
