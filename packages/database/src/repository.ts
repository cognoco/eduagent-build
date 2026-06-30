import { and, eq } from 'drizzle-orm';
import type { Database } from './client';
import { profiles } from './schema/index';
import type { ScopedWhere } from './repository._shared';
import { createSessionRepository } from './repository.session';
import { createProfileRepository } from './repository.profile';
import { createCurriculumRepository } from './repository.curriculum';
import { createMemoryRepository } from './repository.memory';
import { createReportsRepository } from './repository.reports';
import { createQuizRepository } from './repository.quiz';

// [BUG-704 / P-8] Single source of truth for the runtime DB enum
// (quizActivityTypeEnum at quiz.ts:4-8 = ['capitals', 'vocabulary', 'guess_who']).
// [BUG-390] Imported from @eduagent/schemas — was previously a local redefinition.
// QuizActivityType is defined once in packages/schemas/src/quiz.ts and re-exported
// via the schemas barrel. The local redefinition has been removed.

/**
 * Profile-scoped repository factory. The namespaces are decomposed into
 * `repository.<domain>.ts` sub-factories (WI-1089); this shell owns the
 * profile-scoping predicate (`scopedWhere`, closing over `profileId`), the
 * top-level `getProfile` read, and assembles the sub-factories into the single
 * returned object. The returned shape — and therefore the `ScopedRepository`
 * type — is unchanged from the pre-decomposition monolith.
 */
export function createScopedRepository(db: Database, profileId: string) {
  if (!profileId || profileId.trim() === '') {
    throw new Error(
      'createScopedRepository: profileId must be a non-empty string',
    );
  }
  const scopedWhere: ScopedWhere = (table, extraWhere) => {
    const profileFilter = eq(table.profileId, profileId);
    return extraWhere ? and(profileFilter, extraWhere) : profileFilter;
  };

  return {
    profileId,
    db,

    async getProfile() {
      return db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    },

    ...createSessionRepository(db, profileId, scopedWhere),
    ...createProfileRepository(db, profileId, scopedWhere),
    ...createCurriculumRepository(db, profileId),
    ...createMemoryRepository(db, profileId, scopedWhere),
    ...createReportsRepository(db, profileId, scopedWhere),
    ...createQuizRepository(db, profileId, scopedWhere),
  };
}

export type ScopedRepository = ReturnType<typeof createScopedRepository>;

// CurriculumTopicRow moved to repository.curriculum.ts with the curriculumTopics
// namespace; re-exported here so `export * from './repository'` (the
// @eduagent/database barrel) still surfaces it for existing importers.
export type { CurriculumTopicRow } from './repository.curriculum';
