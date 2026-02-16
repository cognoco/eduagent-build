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
