import type { Column, SQL } from 'drizzle-orm';

/**
 * The profile-scoping predicate builder shared by every namespace in the
 * decomposed scoped repository. Defined inside `createScopedRepository` (it
 * closes over the run's `profileId`) and passed into each
 * `create<Domain>Repository` sub-factory so the moved namespaces keep their
 * original closure semantics. See `repository.ts`.
 */
export type ScopedWhere = (
  table: { profileId: Column },
  extraWhere?: SQL,
) => SQL | undefined;
