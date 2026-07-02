// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — webhook handler dispatchers (the seam)
//
// [WI-868] The two payment-webhook routes call these selectors once per
// request; they always return the v2 handler bundle (reads/writes the
// `subscription` store). This is the single place the handler bundle is
// selected for the webhook surface — the route bodies and the handler
// bodies never branch.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type Stripe from 'stripe';
import type { StripePriceEnv } from '../../billing-pricing';
import type { RevenueCatEvent } from '../revenuecat-shared';

// v2 handlers
import {
  handleSubscriptionEventV2,
  handleSubscriptionDeletedV2,
  handleCheckoutCompletedV2,
  handlePaymentFailedV2,
  handlePaymentSucceededV2,
  resolveAccountIdV2,
  handleInitialPurchaseV2,
  handleRenewalV2,
  handleCancellationV2,
  handleExpirationV2,
  handleBillingIssueV2,
  handleSubscriberAliasV2,
  handleProductChangeV2,
  handleNonRenewingPurchaseV2,
  handleUncancellationV2,
  isRevenuecatEventProcessedV2,
  ensureFreeSubscriptionV2,
} from './index';

// ---------------------------------------------------------------------------
// Stripe webhook handler bundle
// ---------------------------------------------------------------------------

export interface StripeWebhookHandlers {
  handleSubscriptionEvent: (
    db: Database,
    kv: KVNamespace | undefined,
    sub: Stripe.Subscription,
    eventTimestamp: string,
    stripeEventId: string,
    env: StripePriceEnv,
  ) => Promise<void>;
  handleSubscriptionDeleted: (
    db: Database,
    kv: KVNamespace | undefined,
    sub: Stripe.Subscription,
    eventTimestamp: string,
    stripeEventId: string,
  ) => Promise<void>;
  handleCheckoutCompleted: (
    db: Database,
    kv: KVNamespace | undefined,
    session: Stripe.Checkout.Session,
    eventTimestamp: string,
  ) => Promise<void>;
  handlePaymentFailed: (
    db: Database,
    kv: KVNamespace | undefined,
    invoice: Stripe.Invoice,
    eventTimestamp: string,
    stripeEventId: string,
  ) => Promise<void>;
  handlePaymentSucceeded: (
    db: Database,
    kv: KVNamespace | undefined,
    invoice: Stripe.Invoice,
    eventTimestamp: string,
    stripeEventId: string,
  ) => Promise<void>;
}

const V2_STRIPE_HANDLERS: StripeWebhookHandlers = {
  handleSubscriptionEvent: handleSubscriptionEventV2,
  handleSubscriptionDeleted: handleSubscriptionDeletedV2,
  handleCheckoutCompleted: handleCheckoutCompletedV2,
  handlePaymentFailed: handlePaymentFailedV2,
  handlePaymentSucceeded: handlePaymentSucceededV2,
};

export function getStripeWebhookHandlers(): StripeWebhookHandlers {
  return V2_STRIPE_HANDLERS;
}

// ---------------------------------------------------------------------------
// RevenueCat webhook handler bundle
// ---------------------------------------------------------------------------

export interface RevenuecatWebhookHandlers {
  resolveAccountId: (db: Database, appUserId: string) => Promise<string | null>;
  isRevenuecatEventProcessed: (
    db: Database,
    accountId: string,
    eventId: string,
    eventTimestampMs?: number,
  ) => Promise<boolean>;
  ensureFreeSubscription: (db: Database, accountId: string) => Promise<unknown>;
  handleInitialPurchase: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleRenewal: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleCancellation: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleExpiration: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleBillingIssue: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleSubscriberAlias: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleProductChange: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
  handleNonRenewingPurchase: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<{ status: number; body: Record<string, unknown> } | null>;
  handleUncancellation: (
    db: Database,
    kv: KVNamespace | undefined,
    event: RevenueCatEvent,
  ) => Promise<void>;
}

const V2_REVENUECAT_HANDLERS: RevenuecatWebhookHandlers = {
  resolveAccountId: resolveAccountIdV2,
  isRevenuecatEventProcessed: isRevenuecatEventProcessedV2,
  ensureFreeSubscription: ensureFreeSubscriptionV2,
  handleInitialPurchase: handleInitialPurchaseV2,
  handleRenewal: handleRenewalV2,
  handleCancellation: handleCancellationV2,
  handleExpiration: handleExpirationV2,
  handleBillingIssue: handleBillingIssueV2,
  handleSubscriberAlias: handleSubscriberAliasV2,
  handleProductChange: handleProductChangeV2,
  handleNonRenewingPurchase: handleNonRenewingPurchaseV2,
  handleUncancellation: handleUncancellationV2,
};

export function getRevenuecatWebhookHandlers(): RevenuecatWebhookHandlers {
  return V2_REVENUECAT_HANDLERS;
}
