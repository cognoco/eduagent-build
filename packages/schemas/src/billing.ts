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

export const byokWaitlistSchema = z.object({
  email: z.string().email(),
});
export type ByokWaitlistInput = z.infer<typeof byokWaitlistSchema>;

export const usageSchema = z.object({
  monthlyLimit: z.number().int(),
  usedThisMonth: z.number().int(),
  remainingQuestions: z.number().int(),
  topUpCreditsRemaining: z.number().int(),
  warningLevel: z.enum(['none', 'soft', 'hard', 'exceeded']),
  cycleResetAt: z.string().datetime(),
});
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

export const quotaExceededSchema = z.object({
  code: z.literal('QUOTA_EXCEEDED'),
  message: z.string(),
  details: z.object({
    tier: subscriptionTierSchema,
    monthlyLimit: z.number().int(),
    usedThisMonth: z.number().int(),
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
