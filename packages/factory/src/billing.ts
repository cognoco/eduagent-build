import type { Subscription } from '@eduagent/schemas';
import { randomUUID } from 'crypto';

/** Builds a Subscription response object (API-facing shape from @eduagent/schemas). */
export function buildSubscription(
  overrides?: Partial<Subscription>
): Subscription {
  return {
    tier: 'free',
    status: 'trial',
    trialEndsAt: null,
    currentPeriodEnd: null,
    monthlyLimit: 50,
    usedThisMonth: 0,
    remainingQuestions: 50,
    ...overrides,
  };
}

/** Builds a QuotaPool-like object matching the DB row shape used in tests. */
export function buildQuotaPool(
  overrides?: Partial<{
    id: string;
    subscriptionId: string;
    monthlyLimit: number;
    usedThisMonth: number;
    cycleResetAt: string;
    createdAt: string;
    updatedAt: string;
  }>
) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    subscriptionId: randomUUID(),
    monthlyLimit: 50,
    usedThisMonth: 0,
    cycleResetAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Builds a TopUpCredits-like object matching the DB row shape used in tests. */
export function buildTopUpCredits(
  overrides?: Partial<{
    id: string;
    subscriptionId: string;
    amount: number;
    remaining: number;
    purchasedAt: string;
    expiresAt: string;
    createdAt: string;
  }>
) {
  const now = new Date().toISOString();
  const thirtyDaysLater = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  return {
    id: randomUUID(),
    subscriptionId: randomUUID(),
    amount: 500,
    remaining: 500,
    purchasedAt: now,
    expiresAt: thirtyDaysLater,
    createdAt: now,
    ...overrides,
  };
}

/** Reset factory state — useful in test `beforeEach` blocks. */
export function resetBillingCounter(): void {
  // no-op: preserved for API compatibility
}
