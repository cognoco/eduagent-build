import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { profiles } from './schema/index.js';

export function createScopedRepository(db: Database, profileId: string) {
  return {
    profileId,
    db,
    async getProfile() {
      return db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    },
  };
}

export type ScopedRepository = ReturnType<typeof createScopedRepository>;
