import { z } from 'zod';

export const SUBSCRIPTION_STORE_TEARDOWN_REQUESTED_EVENT =
  'app/billing.subscription_store_teardown_requested' as const;

export const subscriptionStoreTeardownTargetSchema = z.object({
  subscriptionId: z.string().min(1),
  planTier: z.string().min(1),
  status: z.string().min(1),
  stripe: z.object({
    customerId: z.string().min(1).nullable(),
    subscriptionId: z.string().min(1).nullable(),
  }),
  revenueCat: z.object({
    originalAppUserId: z.string().min(1).nullable(),
    storeProductId: z.string().min(1).nullable(),
    storePlatform: z.string().min(1).nullable(),
  }),
});

export const subscriptionStoreTeardownRequestedDataSchema = z.object({
  accountId: z.string().min(1),
  identityVersion: z.literal('v2'),
  reason: z.literal('whole_org_erasure'),
  requestedAt: z.string().min(1),
  subscriptions: z.array(subscriptionStoreTeardownTargetSchema).min(1),
});

export type SubscriptionStoreTeardownTarget = z.infer<
  typeof subscriptionStoreTeardownTargetSchema
>;

export type SubscriptionStoreTeardownRequestedData = z.infer<
  typeof subscriptionStoreTeardownRequestedDataSchema
>;
