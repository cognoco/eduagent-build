import {
  subscriptionTierSchema,
  subscriptionStatusSchema,
  subscriptionSchema,
  checkoutRequestSchema,
  topUpRequestSchema,
  usageProfileBreakdownRowSchema,
  usageFamilyAggregateSchema,
  usageSchema,
  checkoutResponseSchema,
  portalResponseSchema,
  cancelResponseSchema,
  familyMemberSchema,
  familySubscriptionSchema,
  subscriptionResponseSchema,
  usageResponseSchema,
  subscriptionStatusResponseSchema,
  topUpResponseSchema,
  familyResponseSchema,
  familyAddResponseSchema,
  familyRemoveResponseSchema,
  byokWaitlistResponseSchema,
  quotaExceededSchema,
} from './billing.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const ISO = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

describe('subscriptionTierSchema', () => {
  it.each(['free', 'plus', 'family', 'pro'])('accepts tier "%s"', (tier) => {
    expect(subscriptionTierSchema.parse(tier)).toBe(tier);
  });

  it('rejects invalid tier', () => {
    const result = subscriptionTierSchema.safeParse('enterprise');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Path is at root for simple enum — check that it failed
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('subscriptionStatusSchema', () => {
  it.each(['trial', 'active', 'past_due', 'cancelled', 'expired'])(
    'accepts status "%s"',
    (status) => {
      expect(subscriptionStatusSchema.parse(status)).toBe(status);
    },
  );

  it('rejects invalid status', () => {
    const result = subscriptionStatusSchema.safeParse('inactive');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subscriptionSchema
// ---------------------------------------------------------------------------

const validSubscription = {
  tier: 'free',
  effectiveAccessTier: 'free',
  billingAccess: 'current',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: ISO,
  cancelAtPeriodEnd: false,
  monthlyLimit: 100,
  usedThisMonth: 10,
  remainingQuestions: 90,
  dailyLimit: 10,
  usedToday: 2,
  dailyRemainingQuestions: 8,
};

describe('subscriptionSchema', () => {
  it('accepts a valid free subscription', () => {
    const parsed = subscriptionSchema.parse(validSubscription);
    expect(parsed.tier).toBe('free');
    expect(parsed.effectiveAccessTier).toBe('free');
    expect(parsed.billingAccess).toBe('current');
    expect(parsed.trialEndsAt).toBeNull();
  });

  it('accepts null trialEndsAt and null currentPeriodEnd', () => {
    const parsed = subscriptionSchema.parse({
      ...validSubscription,
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
    expect(parsed.trialEndsAt).toBeNull();
    expect(parsed.currentPeriodEnd).toBeNull();
  });

  it('accepts null dailyLimit and null dailyRemainingQuestions', () => {
    const parsed = subscriptionSchema.parse({
      ...validSubscription,
      dailyLimit: null,
      dailyRemainingQuestions: null,
    });
    expect(parsed.dailyLimit).toBeNull();
    expect(parsed.dailyRemainingQuestions).toBeNull();
  });

  it('defaults legacy subscription access fields to the current tier', () => {
    const {
      effectiveAccessTier: _effectiveAccessTier,
      billingAccess: _billingAccess,
      ...legacySubscription
    } = {
      ...validSubscription,
      tier: 'plus',
      status: 'trial',
    };

    const parsed = subscriptionSchema.parse(legacySubscription);

    expect(parsed.effectiveAccessTier).toBe('plus');
    expect(parsed.billingAccess).toBe('current');
  });

  it('rejects invalid tier enum', () => {
    const result = subscriptionSchema.safeParse({
      ...validSubscription,
      tier: 'invalid_tier',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('tier');
    }
  });

  it('rejects invalid status enum', () => {
    const result = subscriptionSchema.safeParse({
      ...validSubscription,
      status: 'bad_status',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('status');
    }
  });

  it('rejects missing monthlyLimit', () => {
    const { monthlyLimit: _, ...rest } = validSubscription;
    const result = subscriptionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkoutRequestSchema
// ---------------------------------------------------------------------------

describe('checkoutRequestSchema', () => {
  it('accepts valid checkout request', () => {
    const parsed = checkoutRequestSchema.parse({
      tier: 'plus',
      interval: 'monthly',
    });
    expect(parsed.tier).toBe('plus');
    expect(parsed.interval).toBe('monthly');
  });

  it('accepts family/pro tiers', () => {
    for (const tier of ['family', 'pro'] as const) {
      const parsed = checkoutRequestSchema.parse({ tier, interval: 'yearly' });
      expect(parsed.tier).toBe(tier);
    }
  });

  it('rejects free tier in checkout (not allowed)', () => {
    const result = checkoutRequestSchema.safeParse({
      tier: 'free',
      interval: 'monthly',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid interval', () => {
    const result = checkoutRequestSchema.safeParse({
      tier: 'plus',
      interval: 'weekly',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// topUpRequestSchema
// ---------------------------------------------------------------------------

describe('topUpRequestSchema', () => {
  it('accepts amount=500', () => {
    const parsed = topUpRequestSchema.parse({ amount: 500 });
    expect(parsed.amount).toBe(500);
  });

  it('rejects amount != 500', () => {
    const result = topUpRequestSchema.safeParse({ amount: 1000 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usageSchema
// ---------------------------------------------------------------------------

const validUsage = {
  monthlyLimit: 100,
  usedThisMonth: 10,
  remainingQuestions: 90,
  topUpCreditsRemaining: 0,
  warningLevel: 'none',
  cycleResetAt: ISO,
  dailyLimit: 10,
  usedToday: 1,
  dailyRemainingQuestions: 9,
};

describe('usageSchema', () => {
  it('accepts a valid usage response', () => {
    const parsed = usageSchema.parse(validUsage);
    expect(parsed.warningLevel).toBe('none');
    expect(parsed.remainingQuestions).toBe(90);
  });

  it('accepts null dailyLimit and dailyRemainingQuestions', () => {
    const parsed = usageSchema.parse({
      ...validUsage,
      dailyLimit: null,
      dailyRemainingQuestions: null,
    });
    expect(parsed.dailyLimit).toBeNull();
    expect(parsed.dailyRemainingQuestions).toBeNull();
  });

  // [BUG-640] 'top-up-available' added to warningLevel enum
  it.each(['none', 'soft', 'hard', 'exceeded', 'top-up-available'])(
    'accepts warningLevel "%s"',
    (warningLevel) => {
      const parsed = usageSchema.parse({ ...validUsage, warningLevel });
      expect(parsed.warningLevel).toBe(warningLevel);
    },
  );

  it('rejects invalid warningLevel enum', () => {
    const result = usageSchema.safeParse({
      ...validUsage,
      warningLevel: 'critical',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('warningLevel');
    }
  });

  it('accepts optional byProfile array', () => {
    const row = {
      profile_id: UUID,
      name: 'Alice',
      used: 5,
      usedToday: 1,
      is_self: true,
    };
    const parsed = usageSchema.parse({ ...validUsage, byProfile: [row] });
    expect(parsed.byProfile).toHaveLength(1);
  });

  it('preserves an explicit non-negative former-member usage bucket', () => {
    const parsed = usageSchema.parse({
      ...validUsage,
      familyAggregate: {
        used: 6,
        limit: 100,
        formerMemberUsed: 5,
      },
    });

    expect(parsed.familyAggregate).toEqual({
      used: 6,
      limit: 100,
      formerMemberUsed: 5,
    });
    expect(
      usageSchema.safeParse({
        ...validUsage,
        familyAggregate: {
          used: 6,
          limit: 100,
          formerMemberUsed: -1,
        },
      }).success,
    ).toBe(false);
  });

  it('strips unknown fields — does NOT leak undeclared server fields to client [BUG-578]', () => {
    // usageSchema uses .strip() (zod default), not .passthrough().
    // Unknown fields must be dropped so server internals never leak to mobile.
    const parsed = usageSchema.parse({
      ...validUsage,
      unknownServerInternalField: 'should-be-dropped',
      anotherLeakedField: 42,
    });
    expect(
      (parsed as Record<string, unknown>)['unknownServerInternalField'],
    ).toBeUndefined();
    expect(
      (parsed as Record<string, unknown>)['anotherLeakedField'],
    ).toBeUndefined();
  });

  it('accepts optional renewsAt and resetsAtLabel fields', () => {
    const parsed = usageSchema.parse({
      ...validUsage,
      renewsAt: ISO,
      resetsAtLabel: 'Resets in 3 days',
    });
    expect(parsed.renewsAt).toBe(ISO);
    expect(parsed.resetsAtLabel).toBe('Resets in 3 days');
  });
});

// ---------------------------------------------------------------------------
// checkoutResponseSchema
// ---------------------------------------------------------------------------

describe('checkoutResponseSchema', () => {
  it('accepts valid checkout response', () => {
    const parsed = checkoutResponseSchema.parse({
      checkoutUrl: 'https://checkout.stripe.com/session/abc',
      sessionId: 'cs_test_abc123',
    });
    expect(parsed.checkoutUrl).toContain('stripe.com');
  });

  it('rejects non-URL checkoutUrl', () => {
    const result = checkoutResponseSchema.safeParse({
      checkoutUrl: 'not-a-url',
      sessionId: 'cs_test_abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sessionId', () => {
    const result = checkoutResponseSchema.safeParse({
      checkoutUrl: 'https://checkout.stripe.com/session/abc',
      sessionId: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// portalResponseSchema
// ---------------------------------------------------------------------------

describe('portalResponseSchema', () => {
  it('accepts valid portal URL', () => {
    const parsed = portalResponseSchema.parse({
      portalUrl: 'https://billing.stripe.com/portal/abc',
    });
    expect(parsed.portalUrl).toContain('stripe.com');
  });

  it('rejects non-URL portalUrl', () => {
    expect(
      portalResponseSchema.safeParse({ portalUrl: 'not-a-url' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cancelResponseSchema
// ---------------------------------------------------------------------------

describe('cancelResponseSchema', () => {
  it('accepts valid cancel response', () => {
    const parsed = cancelResponseSchema.parse({
      message: 'Subscription cancelled',
      currentPeriodEnd: ISO,
    });
    expect(parsed.message).toBe('Subscription cancelled');
  });

  it('rejects invalid datetime for currentPeriodEnd', () => {
    const result = cancelResponseSchema.safeParse({
      message: 'Cancelled',
      currentPeriodEnd: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// familySubscriptionSchema
// ---------------------------------------------------------------------------

const validFamilyMember = {
  profileId: UUID,
  displayName: 'Alice',
  isOwner: true,
};

const validFamilySubscription = {
  tier: 'family',
  monthlyLimit: 700,
  usedThisMonth: 50,
  remainingQuestions: 650,
  profileCount: 2,
  maxProfiles: 5,
  members: [validFamilyMember],
};

describe('familyMemberSchema', () => {
  it('accepts valid family member', () => {
    const parsed = familyMemberSchema.parse(validFamilyMember);
    expect(parsed.isOwner).toBe(true);
  });

  it('rejects non-UUID profileId', () => {
    const result = familyMemberSchema.safeParse({
      ...validFamilyMember,
      profileId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('familySubscriptionSchema', () => {
  it('accepts valid family subscription', () => {
    const parsed = familySubscriptionSchema.parse(validFamilySubscription);
    expect(parsed.tier).toBe('family');
    expect(parsed.members).toHaveLength(1);
  });

  it('accepts pro tier', () => {
    const parsed = familySubscriptionSchema.parse({
      ...validFamilySubscription,
      tier: 'pro',
    });
    expect(parsed.tier).toBe('pro');
  });

  it('rejects free tier in family subscription', () => {
    const result = familySubscriptionSchema.safeParse({
      ...validFamilySubscription,
      tier: 'free',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty members array', () => {
    const parsed = familySubscriptionSchema.parse({
      ...validFamilySubscription,
      members: [],
    });
    expect(parsed.members).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Endpoint response wrappers
// ---------------------------------------------------------------------------

describe('subscriptionResponseSchema', () => {
  it('wraps subscription correctly', () => {
    const parsed = subscriptionResponseSchema.parse({
      subscription: validSubscription,
    });
    expect(parsed.subscription.tier).toBe('free');
  });
});

describe('usageResponseSchema', () => {
  it('wraps usage correctly', () => {
    const parsed = usageResponseSchema.parse({ usage: validUsage });
    expect(parsed.usage.warningLevel).toBe('none');
  });
});

describe('subscriptionStatusResponseSchema', () => {
  const validStatusResponse = {
    status: {
      tier: 'plus',
      effectiveAccessTier: 'plus',
      billingAccess: 'current',
      status: 'active',
      monthlyLimit: 700,
      usedThisMonth: 50,
      dailyLimit: null,
      usedToday: 5,
    },
  };

  it('accepts valid status response', () => {
    const parsed = subscriptionStatusResponseSchema.parse(validStatusResponse);
    expect(parsed.status.tier).toBe('plus');
    expect(parsed.status.effectiveAccessTier).toBe('plus');
    expect(parsed.status.billingAccess).toBe('current');
    expect(parsed.status.dailyLimit).toBeNull();
  });

  it('defaults legacy status response access fields to the current tier', () => {
    const parsed = subscriptionStatusResponseSchema.parse({
      status: {
        tier: 'family',
        status: 'active',
        monthlyLimit: 2000,
        usedThisMonth: 12,
        dailyLimit: null,
        usedToday: 0,
      },
    });

    expect(parsed.status.effectiveAccessTier).toBe('family');
    expect(parsed.status.billingAccess).toBe('current');
  });

  it.each([
    ['effectiveAccessTier', { effectiveAccessTier: 'enterprise' }],
    ['billingAccess', { billingAccess: 'trial' }],
  ])('rejects invalid %s in status response', (_label, patch) => {
    const status = { ...validStatusResponse.status, ...patch };

    const result = subscriptionStatusResponseSchema.safeParse({ status });

    expect(result.success).toBe(false);
  });

  it('rejects invalid tier in status', () => {
    const result = subscriptionStatusResponseSchema.safeParse({
      status: {
        tier: 'bad',
        status: 'active',
        monthlyLimit: 100,
        usedThisMonth: 0,
        dailyLimit: null,
        usedToday: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('topUpResponseSchema', () => {
  it('accepts valid top-up response with null clientSecret', () => {
    const parsed = topUpResponseSchema.parse({
      topUp: {
        amount: 500,
        priceCents: 499,
        clientSecret: null,
        paymentIntentId: 'pi_abc123',
      },
    });
    expect(parsed.topUp.clientSecret).toBeNull();
  });

  it('accepts non-null clientSecret', () => {
    const parsed = topUpResponseSchema.parse({
      topUp: {
        amount: 500,
        priceCents: 499,
        clientSecret: 'secret_abc',
        paymentIntentId: 'pi_abc123',
      },
    });
    expect(parsed.topUp.clientSecret).toBe('secret_abc');
  });
});

describe('familyResponseSchema', () => {
  it('wraps family subscription', () => {
    const parsed = familyResponseSchema.parse({
      family: validFamilySubscription,
    });
    expect(parsed.family.tier).toBe('family');
  });
});

describe('familyAddResponseSchema', () => {
  it('accepts valid add response', () => {
    const parsed = familyAddResponseSchema.parse({
      message: 'Profile added',
      profileCount: 2,
    });
    expect(parsed.profileCount).toBe(2);
  });
});

describe('familyRemoveResponseSchema', () => {
  it('accepts valid remove response', () => {
    const parsed = familyRemoveResponseSchema.parse({
      message: 'Removed',
      removedProfileId: UUID,
    });
    expect(parsed.removedProfileId).toBe(UUID);
  });

  it('rejects non-UUID removedProfileId', () => {
    const result = familyRemoveResponseSchema.safeParse({
      message: 'Removed',
      removedProfileId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('byokWaitlistResponseSchema', () => {
  it('accepts valid waitlist response', () => {
    const parsed = byokWaitlistResponseSchema.parse({
      message: 'Added to waitlist',
      email: 'user@example.com',
    });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    const result = byokWaitlistResponseSchema.safeParse({
      message: 'Added',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// quotaExceededSchema
// ---------------------------------------------------------------------------

describe('quotaExceededSchema', () => {
  const validQuotaExceeded = {
    code: 'QUOTA_EXCEEDED',
    message: 'You have exceeded your monthly quota',
    details: {
      tier: 'free',
      effectiveAccessTier: 'free',
      quotaModel: 'per-profile',
      profileRole: 'child',
      reason: 'monthly',
      resetsAt: ISO,
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: null,
      usedToday: 10,
      topUpCreditsRemaining: 0,
      upgradeOptions: [{ tier: 'plus', monthlyQuota: 700, priceMonthly: 9.99 }],
    },
  };

  it('accepts valid quota exceeded response', () => {
    const parsed = quotaExceededSchema.parse(validQuotaExceeded);
    expect(parsed.code).toBe('QUOTA_EXCEEDED');
    expect(parsed.details.reason).toBe('monthly');
    expect(parsed.details.effectiveAccessTier).toBe('free');
    expect(parsed.details.quotaModel).toBe('per-profile');
    expect(parsed.details.profileRole).toBe('child');
    expect(parsed.details.resetsAt).toBe(ISO);
  });

  it('accepts daily reason', () => {
    const parsed = quotaExceededSchema.parse({
      ...validQuotaExceeded,
      details: { ...validQuotaExceeded.details, reason: 'daily' },
    });
    expect(parsed.details.reason).toBe('daily');
  });

  it.each([
    ['effectiveAccessTier', { effectiveAccessTier: 'enterprise' }],
    ['quotaModel', { quotaModel: 'global' }],
    ['profileRole', { profileRole: 'guardian' }],
    ['resetsAt', { resetsAt: 'not-a-date' }],
    ['missing effectiveAccessTier', {}, ['effectiveAccessTier']],
    ['missing quotaModel', {}, ['quotaModel']],
    ['missing resetsAt', {}, ['resetsAt']],
  ])('rejects invalid %s in quota details', (_label, patch, omit = []) => {
    const details = { ...validQuotaExceeded.details, ...patch };
    for (const key of omit as string[]) {
      delete (details as Record<string, unknown>)[key];
    }

    const result = quotaExceededSchema.safeParse({
      ...validQuotaExceeded,
      details,
    });

    expect(result.success).toBe(false);
  });

  it('rejects wrong code literal', () => {
    const result = quotaExceededSchema.safeParse({
      ...validQuotaExceeded,
      code: 'WRONG_CODE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('code');
    }
  });

  it('rejects invalid reason enum', () => {
    const result = quotaExceededSchema.safeParse({
      ...validQuotaExceeded,
      details: { ...validQuotaExceeded.details, reason: 'weekly' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid tier in upgradeOptions', () => {
    const result = quotaExceededSchema.safeParse({
      ...validQuotaExceeded,
      details: {
        ...validQuotaExceeded.details,
        upgradeOptions: [
          { tier: 'basic', monthlyQuota: 200, priceMonthly: 4.99 },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts null dailyLimit in details', () => {
    const parsed = quotaExceededSchema.parse(validQuotaExceeded);
    expect(parsed.details.dailyLimit).toBeNull();
  });
});

describe('schema export presence (billing)', () => {
  it('usageProfileBreakdownRowSchema and usageFamilyAggregateSchema are exported', () => {
    expect(usageProfileBreakdownRowSchema).toBeDefined();
    expect(usageFamilyAggregateSchema).toBeDefined();
  });
});
