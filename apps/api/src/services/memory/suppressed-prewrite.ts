import { and, eq } from 'drizzle-orm';

import { memoryFacts, type ScopedRepository } from '@eduagent/database';

import { normalizeMemoryValue } from '../learner-profile';

export async function isSuppressedFact(
  scoped: ScopedRepository,
  candidateText: string
): Promise<boolean> {
  const normalized = normalizeMemoryValue(candidateText);
  if (!normalized) return false;

  const hit = await scoped.memoryFacts.findFirstActive(
    and(
      eq(memoryFacts.category, 'suppressed'),
      eq(memoryFacts.textNormalized, normalized)
    )
  );
  return hit !== undefined && hit !== null;
}
