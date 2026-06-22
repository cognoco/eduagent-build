import { subscription } from '@eduagent/database';

import { mapSubscriptionV2Row } from './types-v2';

const baseSubscriptionRow: typeof subscription.$inferSelect = {
  id: 'sub_123',
  organizationId: 'org_123',
  planTier: 'plus',
  status: 'active',
  payerPersonId: 'person_123',
  storeProductId: null,
  storePlatform: null,
  periodStartAt: null,
  periodEndAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  lastStripeEventId: null,
  lastStripeEventTimestamp: null,
  revenuecatOriginalAppUserId: null,
  lastRevenuecatEventId: null,
  lastRevenuecatEventTimestampMs: null,
  trialEndsAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('mapSubscriptionV2Row', () => {
  it('rejects invalid DB plan tiers before exposing the legacy contract', () => {
    expect(() =>
      mapSubscriptionV2Row({
        ...baseSubscriptionRow,
        planTier: 'enterprise',
      }),
    ).toThrow('Invalid billing v2 subscription planTier from database');
  });

  it('rejects invalid DB statuses before exposing the legacy contract', () => {
    expect(() =>
      mapSubscriptionV2Row({
        ...baseSubscriptionRow,
        status: 'inactive',
      }),
    ).toThrow('Invalid billing v2 subscription status from database');
  });
});
