// ---------------------------------------------------------------------------
// alias-merge — pure merge-decision unit tests [BUG-783]
//
// Exercises the real `decideAliasMerge` algorithm with ZERO mocks. This is the
// heart of the SUBSCRIBER_ALIAS reconciliation: tier ranking, period-end
// tiebreak, MAX-not-sum top-up credits, and the both-active-paid escalation
// flag. The end-to-end DB path (idempotency + atomic writes) is covered by
// alias-merge.integration.test.ts against a real Postgres.
// ---------------------------------------------------------------------------

import type { BillingAliasReceivedEvent } from '@eduagent/schemas';
import { decideAliasMerge } from './alias-merge';
import type { SubscriptionRow } from './types';

type Snapshot = BillingAliasReceivedEvent['fromSnapshot'];
type Survivor = Pick<
  SubscriptionRow,
  'tier' | 'status' | 'currentPeriodEnd' | 'trialEndsAt'
>;

const ISO_LATER = '2026-09-01T00:00:00.000Z';
const ISO_EARLIER = '2026-07-01T00:00:00.000Z';

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    tier: 'plus',
    status: 'active',
    currentPeriodEnd: ISO_LATER,
    trialEndsAt: null,
    topUpRemaining: 0,
    ...over,
  };
}

function survivor(over: Partial<Survivor> = {}): Survivor {
  return {
    tier: 'free',
    status: 'active',
    currentPeriodEnd: null,
    trialEndsAt: null,
    ...over,
  };
}

describe('decideAliasMerge — tier survivorship', () => {
  it('upgrades a free survivor to the from-side paid tier (the revenue-loss fix)', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', currentPeriodEnd: ISO_LATER }),
      survivor({ tier: 'free' }),
      0,
    );
    expect(d.upgradeSurvivor).toBe(true);
    expect(d.survivorTier).toBe('plus');
    expect(d.survivorPeriodEnd).toBe(ISO_LATER);
    expect(d.survivorStatus).toBe('active');
  });

  it('keeps the survivor on a strictly higher tier — never downgrades the survivor', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus' }),
      survivor({
        tier: 'pro',
        status: 'active',
        currentPeriodEnd: ISO_EARLIER,
      }),
      0,
    );
    expect(d.upgradeSurvivor).toBe(false);
    expect(d.survivorTier).toBe('pro');
  });

  it('picks the more valuable tier (family > plus) when from-side is higher', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'family' }),
      survivor({ tier: 'plus', status: 'active' }),
      0,
    );
    expect(d.upgradeSurvivor).toBe(true);
    expect(d.survivorTier).toBe('family');
  });

  it('on equal tiers, upgrades when from-side has the later currentPeriodEnd', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', currentPeriodEnd: ISO_LATER }),
      survivor({
        tier: 'plus',
        status: 'active',
        currentPeriodEnd: ISO_EARLIER,
      }),
      0,
    );
    expect(d.upgradeSurvivor).toBe(true);
    expect(d.survivorPeriodEnd).toBe(ISO_LATER);
  });

  it('on equal tiers, keeps survivor when its currentPeriodEnd is later or equal', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', currentPeriodEnd: ISO_EARLIER }),
      survivor({ tier: 'plus', status: 'active', currentPeriodEnd: ISO_LATER }),
      0,
    );
    expect(d.upgradeSurvivor).toBe(false);
    expect(d.survivorPeriodEnd).toBe(ISO_LATER);
  });

  it('carries a from-side trial through as trial status when upgrading', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', status: 'trial', trialEndsAt: ISO_LATER }),
      survivor({ tier: 'free' }),
      0,
    );
    expect(d.upgradeSurvivor).toBe(true);
    expect(d.survivorStatus).toBe('trial');
    expect(d.survivorTrialEndsAt).toBe(ISO_LATER);
  });
});

describe('decideAliasMerge — top-up credits (MAX, not sum)', () => {
  it('grants the positive delta so survivor ends with MAX(from, to)', () => {
    const d = decideAliasMerge(
      snapshot({ topUpRemaining: 500 }),
      survivor(),
      200,
    );
    // survivor should end at 500; it already has 200 → grant 300.
    expect(d.topUpDeltaToGrant).toBe(300);
  });

  it('grants nothing when the survivor already has at least as many credits', () => {
    const d = decideAliasMerge(
      snapshot({ topUpRemaining: 100 }),
      survivor(),
      500,
    );
    expect(d.topUpDeltaToGrant).toBe(0);
  });

  it('never sums the two balances (abuse via re-aliasing)', () => {
    const d = decideAliasMerge(
      snapshot({ topUpRemaining: 500 }),
      survivor(),
      500,
    );
    expect(d.topUpDeltaToGrant).toBe(0); // NOT 1000
  });
});

describe('decideAliasMerge — both-active-paid escalation', () => {
  it('flags when both sides are live paid store subs', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', status: 'active' }),
      survivor({ tier: 'family', status: 'active' }),
      0,
    );
    expect(d.bothActivePaid).toBe(true);
  });

  it('does not flag when the survivor is free', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', status: 'active' }),
      survivor({ tier: 'free', status: 'active' }),
      0,
    );
    expect(d.bothActivePaid).toBe(false);
  });

  it('does not flag when the from-side is expired (not a live charge)', () => {
    const d = decideAliasMerge(
      snapshot({ tier: 'plus', status: 'expired' }),
      survivor({ tier: 'plus', status: 'active' }),
      0,
    );
    expect(d.bothActivePaid).toBe(false);
  });
});
