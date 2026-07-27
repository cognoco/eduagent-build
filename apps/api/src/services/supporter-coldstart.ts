import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  learningSessions,
  login,
  person,
  subjects,
  supporterFeedSurfaceState,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  supporterColdStartSchema,
  type SupporterColdStart,
  type SupporterColdStartCard,
} from '@eduagent/schemas';
import { getPersonOrganizationId, isPersonInOrg } from './identity-v2/helpers';

type EdgeRow = {
  edgeId: string;
  personId: string;
  displayName: string;
  credentialed: boolean;
};

async function hasLearningState(
  db: Database,
  personId: string,
): Promise<boolean> {
  const subjectRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.profileId, personId))
    .limit(1);
  if (subjectRows.length > 0) return true;

  const sessionRows = await db
    .select({ id: learningSessions.id })
    .from(learningSessions)
    .where(eq(learningSessions.profileId, personId))
    .limit(1);
  return sessionRows.length > 0;
}

function staleIdleStepFromVisitCount(
  visitCount: number,
): 1 | 2 | 3 | 4 | undefined {
  if (visitCount <= 1) return undefined;
  return Math.min(visitCount - 1, 4) as 1 | 2 | 3 | 4;
}

async function readGrantedIdleVisitCount(
  db: Database,
  supporterPersonId: string,
  edgeId: string,
): Promise<number> {
  const sourceKey = `supportership:${edgeId}:coldstart:granted-idle`;
  const rows = await db
    .select({ surfaceCount: supporterFeedSurfaceState.surfaceCount })
    .from(supporterFeedSurfaceState)
    .where(
      and(
        eq(supporterFeedSurfaceState.viewerPersonId, supporterPersonId),
        eq(supporterFeedSurfaceState.scopeKind, 'person'),
        eq(supporterFeedSurfaceState.sourceKey, sourceKey),
      ),
    )
    .limit(1);

  return Math.max(1, rows[0]?.surfaceCount ?? 1);
}

export async function resolveSupporterColdStart(
  db: Database,
  supporterPersonId: string,
): Promise<SupporterColdStart> {
  const edges = (await db
    .select({
      edgeId: supportership.id,
      personId: person.id,
      displayName: person.displayName,
      // [WI-2541] C(person) = a Login row exists — the canonical "is
      // credentialed" predicate (family-access.ts's assertChargeNotCredentialed
      // / filterUncredentialedCharges), replacing person.hasOwnAccount. The
      // latter is a birthday-crossing-takeover correlate that defaults false
      // and is set by no production writer (WI-2538), so it suppressed the
      // granted-idle card for every credentialed cross-organization supportee.
      // EXISTS, not a join: login.person_id is indexed but not unique, so a
      // join could multiply edge rows.
      credentialed: sql<boolean>`exists (select 1 from ${login} where ${login.personId} = ${supportership.supporteePersonId})`,
    })
    .from(supportership)
    .leftJoin(person, eq(person.id, supportership.supporteePersonId))
    .where(
      // [WI-2237 deferred-sweep] resolveSupporterColdStart is INTENTIONALLY
      // exempt from the accepted-visibility default-deny predicate applied to
      // resolveScopesForPerson / the structural mask — it renders
      // pre-acceptance cold-start cards by design (cold-start-doorway UX;
      // WI-2226). Whether its pre-acceptance learning-activity signal
      // (hasLearningState / staleIdleStep) should be gated is tracked as
      // WI-2395 (owner: supporter-linking lane; target: 2026-Q3, before
      // supporter-linking GA).
      and(
        eq(supportership.supporterPersonId, supporterPersonId),
        isNull(supportership.revokedAt),
        isNull(person.archivedAt),
      ),
    )
    .orderBy(asc(person.displayName), asc(supportership.id))
    .limit(50)) as EdgeRow[];

  if (edges.length === 0) {
    return supporterColdStartSchema.parse({
      variant: 'variant-zero',
      cards: [{ state: 'none', anchor: 'add-child' }],
      selfLearningDoorway: true,
    });
  }

  // [WI-2226 owner-gate] A managed card's CTA (ManagedCard -> switchProfile)
  // only works when the supportee is a profile on the SUPPORTER's own
  // account — POST /profiles/switch (getPersonScope) rejects a cross-org
  // person with 403. initiateLink performs no org check, so an uncredentialed
  // candidate is not guaranteed to be same-org (PM ruling, bounce-recovery
  // WI-2226: a CTA that no-ops/403s is a correctness defect). Resolve the
  // supporter's own org once, only when a managed candidate exists, and
  // suppress the card for any candidate outside it.
  const hasManagedCandidate = edges.some((edge) => !edge.credentialed);
  const supporterOrganizationId = hasManagedCandidate
    ? await getPersonOrganizationId(db, supporterPersonId)
    : null;

  const cards: SupporterColdStartCard[] = [];
  for (const edge of edges) {
    if (!edge.credentialed) {
      if (
        !supporterOrganizationId ||
        !(await isPersonInOrg(db, edge.personId, supporterOrganizationId))
      ) {
        continue;
      }
      cards.push({
        personId: edge.personId,
        edgeId: edge.edgeId,
        displayName: edge.displayName,
        state: 'managed',
        anchor: 'handoff',
      });
      continue;
    }

    if (await hasLearningState(db, edge.personId)) {
      continue;
    }

    const visitCount = await readGrantedIdleVisitCount(
      db,
      supporterPersonId,
      edge.edgeId,
    );
    const staleIdleStep = staleIdleStepFromVisitCount(visitCount);
    cards.push({
      personId: edge.personId,
      edgeId: edge.edgeId,
      displayName: edge.displayName,
      state: 'granted-idle',
      anchor: 'kickstart',
      ...(staleIdleStep ? { staleIdleStep } : {}),
    });
  }

  // S4 has no pending-link/consent-request source for supporter approval cards.
  // Do not synthesize consent-pending cards from active supportership rows.
  return supporterColdStartSchema.parse({
    variant: 'per-child',
    cards,
    selfLearningDoorway: true,
  });
}
