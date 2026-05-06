import { z } from 'zod';

export const subscriptionTierSchema = z.enum(['free', 'plus', 'family', 'pro']);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

export const subscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'cancelled',
  'expired',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSchema = z.object({
  tier: subscriptionTierSchema,
  status: subscriptionStatusSchema,
  trialEndsAt: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  monthlyLimit: z.number().int(),
  usedThisMonth: z.number().int(),
  remainingQuestions: z.number().int(),
  dailyLimit: z.number().int().nullable(),
  usedToday: z.number().int(),
  dailyRemainingQuestions: z.number().int().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const checkoutRequestSchema = z.object({
  tier: z.enum(['plus', 'family', 'pro']),
  interval: z.enum(['monthly', 'yearly']),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const topUpRequestSchema = z.object({
  amount: z.literal(500),
});
export type TopUpRequest = z.infer<typeof topUpRequestSchema>;

export const byokWaitlistSchema = z.object({});
export type ByokWaitlistInput = z.infer<typeof byokWaitlistSchema>;

export const usageProfileBreakdownRowSchema = z.object({
  profile_id: z.string().uuid(),
  name: z.string(),
  used: z.number().int(),
  usedToday: z.number().int(),
  is_self: z.boolean(),
});
export type UsageProfileBreakdownRow = z.infer<
  typeof usageProfileBreakdownRowSchema
>;

export const usageFamilyAggregateSchema = z.object({
  used: z.number().int(),
  limit: z.number().int(),
});
export type UsageFamilyAggregate = z.infer<typeof usageFamilyAggregateSchema>;

export const usageSchema = z
  .object({
    monthlyLimit: z.number().int(),
    usedThisMonth: z.number().int(),
    remainingQuestions: z.number().int(),
    topUpCreditsRemaining: z.number().int(),
    warningLevel: z.enum(['none', 'soft', 'hard', 'exceeded']),
    cycleResetAt: z.string().datetime(),
    dailyLimit: z.number().int().nullable(),
    usedToday: z.number().int(),
    dailyRemainingQuestions: z.number().int().nullable(),
    byProfile: z.array(usageProfileBreakdownRowSchema).optional(),
    familyAggregate: usageFamilyAggregateSchema.nullable().optional(),
    resetsAt: z.string().datetime().optional(),
    renewsAt: z.string().datetime().nullable().optional(),
    resetsAtLabel: z.string().optional(),
    renewsAtLabel: z.string().nullable().optional(),
    perProfileAvailableSince: z.string().datetime().optional(),
  })
  .passthrough();
export type Usage = z.infer<typeof usageSchema>;

export const checkoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
  sessionId: z.string().min(1),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const portalResponseSchema = z.object({
  portalUrl: z.string().url(),
});
export type PortalResponse = z.infer<typeof portalResponseSchema>;

export const cancelResponseSchema = z.object({
  message: z.string(),
  currentPeriodEnd: z.string().datetime(),
});
export type CancelResponse = z.infer<typeof cancelResponseSchema>;

export const familyAddProfileSchema = z.object({
  profileId: z.string().uuid(),
});
export type FamilyAddProfileInput = z.infer<typeof familyAddProfileSchema>;

export const familyRemoveProfileSchema = z.object({
  profileId: z.string().uuid(),
  newAccountId: z.string().uuid(),
});
export type FamilyRemoveProfileInput = z.infer<
  typeof familyRemoveProfileSchema
>;

export const familyMemberSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string(),
  isOwner: z.boolean(),
});
export type FamilyMember = z.infer<typeof familyMemberSchema>;

export const familySubscriptionSchema = z.object({
  tier: z.enum(['family', 'pro']),
  monthlyLimit: z.number().int(),
  usedThisMonth: z.number().int(),
  remainingQuestions: z.number().int(),
  profileCount: z.number().int(),
  maxProfiles: z.number().int(),
  members: z.array(familyMemberSchema),
});
export type FamilySubscription = z.infer<typeof familySubscriptionSchema>;

// ---------------------------------------------------------------------------
// Endpoint response schemas (wrapped shapes returned by c.json())
// ---------------------------------------------------------------------------

export const subscriptionResponseSchema = z.object({
  subscription: subscriptionSchema,
});
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

export const usageResponseSchema = z.object({
  usage: usageSchema,
});
export type UsageResponse = z.infer<typeof usageResponseSchema>;

export const subscriptionStatusResponseSchema = z.object({
  status: z.object({
    tier: subscriptionTierSchema,
    status: subscriptionStatusSchema,
    monthlyLimit: z.number().int(),
    usedThisMonth: z.number().int(),
    dailyLimit: z.number().int().nullable(),
    usedToday: z.number().int(),
  }),
});
export type SubscriptionStatusResponse = z.infer<
  typeof subscriptionStatusResponseSchema
>;

export const topUpResponseSchema = z.object({
  topUp: z.object({
    amount: z.number().int(),
    priceCents: z.number().int(),
    clientSecret: z.string().nullable(),
    paymentIntentId: z.string().min(1),
  }),
});
export type TopUpResponse = z.infer<typeof topUpResponseSchema>;

export const familyResponseSchema = z.object({
  family: familySubscriptionSchema,
});
export type FamilyResponse = z.infer<typeof familyResponseSchema>;

export const familyAddResponseSchema = z.object({
  message: z.string(),
  profileCount: z.number().int(),
});
export type FamilyAddResponse = z.infer<typeof familyAddResponseSchema>;

export const byokWaitlistResponseSchema = z.object({
  message: z.string(),
  email: z.string().email(),
});
export type ByokWaitlistResponse = z.infer<typeof byokWaitlistResponseSchema>;

export const quotaExceededSchema = z.object({
  code: z.literal('QUOTA_EXCEEDED'),
  message: z.string(),
  details: z.object({
    tier: subscriptionTierSchema,
    reason: z.enum(['monthly', 'daily']),
    monthlyLimit: z.number().int(),
    usedThisMonth: z.number().int(),
    dailyLimit: z.number().int().nullable(),
    usedToday: z.number().int(),
    topUpCreditsRemaining: z.number().int(),
    upgradeOptions: z.array(
      z.object({
        tier: z.enum(['plus', 'family', 'pro']),
        monthlyQuota: z.number().int(),
        priceMonthly: z.number(),
      })
    ),
  }),
});
export type QuotaExceeded = z.infer<typeof quotaExceededSchema>;
