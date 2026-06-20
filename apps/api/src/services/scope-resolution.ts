import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  learningSessions,
  person,
  subjects,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  supporterScopeListSchema,
  type ScopeDescriptor,
  type SupporterScopeList,
} from '@eduagent/schemas';

async function hasFirstRealLearningState(
  db: Database,
  personId: string,
): Promise<boolean> {
  const [subjectRows, sessionRows] = await Promise.all([
    db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.profileId, personId))
      .limit(1),
    db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(eq(learningSessions.profileId, personId))
      .limit(1),
  ]);

  return subjectRows.length > 0 || sessionRows.length > 0;
}

export async function resolveScopesForPerson(
  db: Database,
  personId: string,
): Promise<SupporterScopeList> {
  const rows = await db
    .select({
      edgeId: supportership.id,
      personId: person.id,
      displayName: person.displayName,
      revokedAt: supportership.revokedAt,
    })
    .from(supportership)
    .innerJoin(person, eq(person.id, supportership.supporteePersonId))
    .where(
      and(
        eq(supportership.supporterPersonId, personId),
        isNull(supportership.revokedAt),
        isNull(person.archivedAt),
      ),
    )
    .orderBy(asc(person.displayName), asc(supportership.id))
    .limit(50);

  const personScopes = rows
    .filter((row) => row.revokedAt === null)
    .map(
      (row): ScopeDescriptor => ({
        kind: 'person',
        personId: row.personId,
        edgeId: row.edgeId,
        displayName: row.displayName,
      }),
    );

  if (personScopes.length === 0) {
    return supporterScopeListSchema.parse({ shape: 'learner' });
  }

  const scopes: ScopeDescriptor[] = [
    { kind: 'supporter-hub' },
    ...personScopes,
  ];

  if (await hasFirstRealLearningState(db, personId)) {
    scopes.push({ kind: 'me' });
  }

  return supporterScopeListSchema.parse({
    shape: 'supporter',
    scopes,
    defaultScopeIndex: 0,
  });
}
