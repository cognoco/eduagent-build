/**
 * [WI-2226 bounce-recovery] Managed cold-start card owner-gate (real DB, no
 * internal mocks — GC1/GC6).
 *
 * resolveSupporterColdStart renders a `state: 'managed'` card for any
 * hasOwnAccount=false supportee. That card's CTA (ManagedCard ->
 * switchProfile) only works when the supportee is a profile on the
 * SUPPORTER's own account — POST /profiles/switch (getPersonScope) rejects
 * a cross-org person with 403. The reviewer bounce on the WI-2226 mount
 * found the isolated component test masked this by manually adding the
 * managed child as an available person scope, which does not reflect
 * production: `initiateLink` performs no org check, so a hasOwnAccount=false
 * candidate is not guaranteed to be on the supporter's own org. This suite
 * proves the owner-gate against real membership rows — no manual scope or
 * profile injection.
 */
import { resolve } from 'path';

import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';

import { acceptLink, initiateLink } from './linking-ceremony';
import {
  createSubjectWithCurriculum,
  deleteOrganizationGraph,
} from './test-seed';
import { resolveSupporterColdStart } from './supporter-coldstart';
import { getPersonScope } from './identity-v2/profile-v2';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  '[WI-2226 bounce-recovery] resolveSupporterColdStart managed-card owner-gate (integration)',
  () => {
    let db: Database;
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createIntegrationDb();
    });

    afterAll(async () => {
      await deleteOrganizationGraph(db, orgIds);
    });

    async function seedPerson(input: {
      displayName: string;
      isOwner: boolean;
      orgId?: string;
    }): Promise<{ orgId: string; personId: string }> {
      let orgId = input.orgId;
      if (!orgId) {
        const [org] = await db
          .insert(organization)
          .values({
            name: `WI-2226 owner-gate test org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          })
          .returning({ id: organization.id });
        orgId = org!.id;
        orgIds.push(orgId);
      }
      const [p] = await db
        .insert(person)
        .values({
          displayName: input.displayName,
          birthDate: input.isOwner ? '1985-01-01' : '2015-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      await db.insert(membership).values({
        personId: p!.id,
        organizationId: orgId,
        roles: input.isOwner ? ['admin'] : ['learner'],
      });
      return { orgId, personId: p!.id };
    }

    // The real producer path for a supportership edge (linking-ceremony.ts),
    // matching the convention proven by
    // supporter-visibility-authorization.integration.test.ts: never fabricate
    // an accepted edge via raw insert. initiateLink itself performs no org
    // check — that is precisely the gap the owner-gate fix closes.
    async function seedManagedSupportership(input: {
      supporterPersonId: string;
      supporteePersonId: string;
    }): Promise<void> {
      const initiated = await initiateLink(db, {
        supporterPersonId: input.supporterPersonId,
        supporteePersonId: input.supporteePersonId,
        relation: 'other',
        managedTier: false,
        managedTierActive: false,
      });
      await acceptLink(db, initiated.id, {
        actorPersonId: input.supporterPersonId,
        audience: 'supporter',
      });
      await acceptLink(db, initiated.id, {
        actorPersonId: input.supporteePersonId,
        audience: 'supportee',
      });
    }

    it('[AC: same-org managed child] renders the managed card, and its CTA target passes the SAME org-membership check POST /profiles/switch enforces', async () => {
      const supporter = await seedPerson({
        displayName: 'Owner-Gate Supporter (same-org)',
        isOwner: true,
      });
      // A same-org managed child: hasOwnAccount defaults false (no writer
      // ever sets it true — see supporter-coldstart.ts), and the membership
      // is on the SUPPORTER's own org (mirrors createChildProfileV2's
      // same-org child, plus a supportership edge for the coldstart card to
      // read — createChildProfileV2 only writes guardianship).
      const child = await seedPerson({
        displayName: 'Owner-Gate Same-Org Child',
        isOwner: false,
        orgId: supporter.orgId,
      });
      await seedManagedSupportership({
        supporterPersonId: supporter.personId,
        supporteePersonId: child.personId,
      });

      const result = await resolveSupporterColdStart(db, supporter.personId);
      expect(result.variant).toBe('per-child');
      if (result.variant !== 'per-child') return;
      const card = result.cards.find((c) => c.personId === child.personId);
      expect(card).toMatchObject({ state: 'managed', anchor: 'handoff' });

      // The guaranteed property: the rendered card's target resolves under
      // the exact predicate POST /profiles/switch (getPersonScope) checks —
      // so the mobile CTA's switchProfile call will actually succeed.
      const scope = await getPersonScope(db, child.personId, supporter.orgId);
      expect(scope).not.toBeNull();
    });

    it('[AC: cross-org managed candidate suppressed] does not render a managed card for a hasOwnAccount=false supportee on a DIFFERENT org — its CTA would 403', async () => {
      const supporter = await seedPerson({
        displayName: 'Owner-Gate Supporter (cross-org)',
        isOwner: true,
      });
      // An independent account owner on their OWN org. hasOwnAccount still
      // defaults false (no writer ever sets it true), so
      // resolveSupporterColdStart sees this exactly as it sees a managed
      // child — the pre-fix code could not tell them apart.
      const outsider = await seedPerson({
        displayName: 'Owner-Gate Cross-Org Candidate',
        isOwner: true,
      });
      await seedManagedSupportership({
        supporterPersonId: supporter.personId,
        supporteePersonId: outsider.personId,
      });

      // Confirm the fixture truly is cross-org — the exact predicate
      // POST /profiles/switch (getPersonScope) would reject.
      const scope = await getPersonScope(
        db,
        outsider.personId,
        supporter.orgId,
      );
      expect(scope).toBeNull();

      const result = await resolveSupporterColdStart(db, supporter.personId);
      // A per-child response can legitimately carry zero cards (see
      // supporter-coldstart.ts / SupporterColdStart.tsx) — every candidate
      // in this fixture is suppressed, so an empty card list IS the correct,
      // fully-asserted outcome, not a weaker "doesn't contain" check.
      expect(result).toEqual({
        variant: 'per-child',
        cards: [],
        selfLearningDoorway: true,
      });
    });
  },
);

// [WI-2541] Credential predicate: cold-start identity is derived from Login
// presence (a `login` row exists), NOT person.hasOwnAccount. hasOwnAccount is a
// birthday-crossing-takeover correlate that defaults false and is set by no
// production writer (WI-2538), so pre-fix the resolver treated EVERY
// credentialed supportee as an uncredentialed managed candidate: same-org → a
// wrong `managed` card, cross-org → suppressed entirely (the reported bug:
// legitimate cross-organization granted-idle cards suppressed). These cases
// construct the (credentialed, learning-state, same-org) partitions that
// diverge from the hasOwnAccount predicate, against a real DB (no internal
// mocks — GC1/GC6). They FAIL against origin/main (the pre-fix predicate) and
// pass on the fix. The C=false partitions (same-org managed, cross-org
// suppressed) are covered by the WI-2226 suite above.
(RUN ? describe : describe.skip)(
  '[WI-2541] resolveSupporterColdStart credential predicate — Login presence, not hasOwnAccount (integration)',
  () => {
    let db: Database;
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createIntegrationDb();
    });

    afterAll(async () => {
      await deleteOrganizationGraph(db, orgIds);
    });

    // A person + membership, optionally with a real `login` row (credentialed).
    // hasOwnAccount is left at its schema default (false) throughout — the fix
    // must derive credential from the login row, never from that flag, so a
    // "credentialed" fixture is precisely a login row present with
    // hasOwnAccount still false (the production drift that is the bug).
    async function seedPerson(input: {
      displayName: string;
      isOwner: boolean;
      credentialed: boolean;
      orgId?: string;
    }): Promise<{ orgId: string; personId: string }> {
      let orgId = input.orgId;
      if (!orgId) {
        const [org] = await db
          .insert(organization)
          .values({
            name: `WI-2541 credential test org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          })
          .returning({ id: organization.id });
        orgId = org!.id;
        orgIds.push(orgId);
      }
      const [p] = await db
        .insert(person)
        .values({
          displayName: input.displayName,
          birthDate: input.isOwner ? '1985-01-01' : '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      await db.insert(membership).values({
        personId: p!.id,
        organizationId: orgId,
        roles: input.isOwner ? ['admin'] : ['learner'],
      });
      if (input.credentialed) {
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await db.insert(login).values({
          id: generateUUIDv7(),
          personId: p!.id,
          clerkUserId: `wi2541-clerk-${suffix}`,
          email: `wi2541-${suffix}@example.com`,
        });
      }
      return { orgId, personId: p!.id };
    }

    // Real producer path for the supportership edge (linking-ceremony.ts) — the
    // truthful-fixture convention this suite already uses; never a raw
    // supportership insert. initiateLink performs no org check (the WI-2226
    // gap), which is why these cross-org / same-org fixtures are reachable.
    async function seedAcceptedSupportership(input: {
      supporterPersonId: string;
      supporteePersonId: string;
    }): Promise<void> {
      const initiated = await initiateLink(db, {
        supporterPersonId: input.supporterPersonId,
        supporteePersonId: input.supporteePersonId,
        relation: 'other',
        managedTier: false,
        managedTierActive: false,
      });
      await acceptLink(db, initiated.id, {
        actorPersonId: input.supporterPersonId,
        audience: 'supporter',
      });
      await acceptLink(db, initiated.id, {
        actorPersonId: input.supporteePersonId,
        audience: 'supportee',
      });
    }

    it('[credentialed + no learning-state + cross-org → granted-idle] renders the granted-idle card the pre-fix hasOwnAccount predicate suppressed (the reported cross-organization bug)', async () => {
      const supporter = await seedPerson({
        displayName: 'Credential Supporter (cross-org idle)',
        isOwner: true,
        credentialed: false,
      });
      // Credentialed (own login) supportee in their OWN org — cross-org from
      // the supporter. hasOwnAccount defaults false, so pre-fix this was read
      // as an uncredentialed managed candidate and, being cross-org,
      // SUPPRESSED. The login row makes it credentialed → the fix renders
      // granted-idle.
      const supportee = await seedPerson({
        displayName: 'Cross-Org Credentialed Empty Supportee',
        isOwner: true,
        credentialed: true,
      });
      await seedAcceptedSupportership({
        supporterPersonId: supporter.personId,
        supporteePersonId: supportee.personId,
      });

      const result = await resolveSupporterColdStart(db, supporter.personId);
      expect(result.variant).toBe('per-child');
      if (result.variant !== 'per-child') return;
      const card = result.cards.find((c) => c.personId === supportee.personId);
      expect(card).toMatchObject({
        personId: supportee.personId,
        state: 'granted-idle',
        anchor: 'kickstart',
      });
    });

    it('[credentialed + no learning-state + same-org → granted-idle] renders granted-idle, not the managed card the pre-fix predicate produced for a same-org credentialed supportee', async () => {
      const supporter = await seedPerson({
        displayName: 'Credential Supporter (same-org idle)',
        isOwner: true,
        credentialed: false,
      });
      // Credentialed supportee inside the SUPPORTER's own org. Pre-fix
      // (hasOwnAccount=false) this rendered a `managed` card; the fix sees the
      // login row → granted-idle.
      const supportee = await seedPerson({
        displayName: 'Same-Org Credentialed Empty Supportee',
        isOwner: false,
        credentialed: true,
        orgId: supporter.orgId,
      });
      await seedAcceptedSupportership({
        supporterPersonId: supporter.personId,
        supporteePersonId: supportee.personId,
      });

      const result = await resolveSupporterColdStart(db, supporter.personId);
      expect(result.variant).toBe('per-child');
      if (result.variant !== 'per-child') return;
      const card = result.cards.find((c) => c.personId === supportee.personId);
      expect(card).toMatchObject({
        state: 'granted-idle',
        anchor: 'kickstart',
      });
    });

    it('[credentialed + learning-state + same-org → no card] omits the card entirely for a credentialed supportee with learning state, where the pre-fix predicate rendered managed', async () => {
      const supporter = await seedPerson({
        displayName: 'Credential Supporter (same-org active)',
        isOwner: true,
        credentialed: false,
      });
      const supportee = await seedPerson({
        displayName: 'Same-Org Credentialed Active Supportee',
        isOwner: false,
        credentialed: true,
        orgId: supporter.orgId,
      });
      // Learning state → the credentialed branch omits the cold-start card.
      await createSubjectWithCurriculum(
        db,
        supportee.personId,
        'Fractions',
        'active',
        1,
      );
      await seedAcceptedSupportership({
        supporterPersonId: supporter.personId,
        supporteePersonId: supportee.personId,
      });

      const result = await resolveSupporterColdStart(db, supporter.personId);
      expect(result.variant).toBe('per-child');
      if (result.variant !== 'per-child') return;
      const card = result.cards.find((c) => c.personId === supportee.personId);
      expect(card).toBeUndefined();
    });
  },
);
