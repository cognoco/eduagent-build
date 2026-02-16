import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  checkoutRequestSchema,
  topUpRequestSchema,
  byokWaitlistSchema,
} from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const billingRoutes = new Hono<AuthEnv>()
  // Get current subscription status
  .get('/subscription', async (c) => {
    // TODO: Fetch subscription + quota for current user via c.get('user').userId
    return c.json({
      subscription: {
        tier: 'free',
        status: 'trial',
        trialEndsAt: null,
        currentPeriodEnd: null,
        monthlyLimit: 50,
        usedThisMonth: 0,
        remainingQuestions: 50,
      },
    });
  })

  // Create Stripe checkout session
  .post(
    '/subscription/checkout',
    zValidator('json', checkoutRequestSchema),
    async (c) => {
      const { tier: _tier, interval: _interval } = c.req.valid('json');

      // TODO: Create Stripe checkout session for c.get('user').userId
      // TODO: Return actual checkout URL from Stripe
      return c.json({
        checkoutUrl: 'https://checkout.stripe.com/mock-session',
        sessionId: 'mock-session-id',
      });
    }
  )

  // Cancel subscription
  .post('/subscription/cancel', async (c) => {
    // TODO: Cancel via Stripe for c.get('user').userId, update local state
    return c.json({
      message:
        'Subscription cancelled. Access continues until end of billing period.',
      currentPeriodEnd: new Date().toISOString(),
    });
  })

  // Purchase top-up credits
  .post(
    '/subscription/top-up',
    zValidator('json', topUpRequestSchema),
    async (c) => {
      const { amount } = c.req.valid('json');

      // TODO: Process top-up purchase for c.get('user').userId
      return c.json({
        topUp: {
          amount,
          remainingCredits: amount,
          expiresAt: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
      });
    }
  )

  // Get current usage/quota status
  .get('/usage', async (c) => {
    // TODO: Fetch quota pool + top-up credits for c.get('user').userId
    return c.json({
      usage: {
        monthlyLimit: 50,
        usedThisMonth: 0,
        remainingQuestions: 50,
        topUpCreditsRemaining: 0,
        warningLevel: 'none',
        cycleResetAt: new Date().toISOString(),
      },
    });
  })

  // Join BYOK waitlist
  .post('/byok-waitlist', zValidator('json', byokWaitlistSchema), async (c) => {
    const { email } = c.req.valid('json');

    // TODO: Store email in byok_waitlist table
    return c.json({ message: 'Added to BYOK waitlist', email }, 201);
  });
