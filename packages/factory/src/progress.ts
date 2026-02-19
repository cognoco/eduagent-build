import type { Streak } from '@eduagent/schemas';
import { randomUUID } from 'crypto';

export function buildStreak(overrides?: Partial<Streak>): Streak {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    gracePeriodStartDate: null,
    isOnGracePeriod: false,
    graceDaysRemaining: 0,
    ...overrides,
  };
}

/** Builds an XP ledger entry matching the DB row shape used in tests. */
export function buildXpLedgerEntry(
  overrides?: Partial<{
    id: string;
    profileId: string;
    topicId: string;
    subjectId: string;
    amount: number;
    status: 'pending' | 'verified' | 'decayed';
    earnedAt: string;
    verifiedAt: string | null;
    createdAt: string;
  }>
) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    profileId: randomUUID(),
    topicId: randomUUID(),
    subjectId: randomUUID(),
    amount: 10,
    status: 'pending' as const,
    earnedAt: now,
    verifiedAt: null,
    createdAt: now,
    ...overrides,
  };
}

/** Reset factory state — useful in test `beforeEach` blocks. */
export function resetProgressCounter(): void {
  // no-op: preserved for API compatibility
}
