import {
  ensureFreeSubscriptionV2,
  handleBillingIssueV2,
  handleCancellationV2,
  handleCheckoutCompletedV2,
  handleExpirationV2,
  handleInitialPurchaseV2,
  handleNonRenewingPurchaseV2,
  handlePaymentFailedV2,
  handlePaymentSucceededV2,
  handleProductChangeV2,
  handleRenewalV2,
  handleSubscriberAliasV2,
  handleSubscriptionDeletedV2,
  handleSubscriptionEventV2,
  handleUncancellationV2,
  isRevenuecatEventProcessedV2,
  resolveAccountIdV2,
} from './index';
import {
  getRevenuecatWebhookHandlers,
  getStripeWebhookHandlers,
  type RevenuecatWebhookHandlers,
  type StripeWebhookHandlers,
} from './dispatch';

const stripeV2Bindings = {
  handleSubscriptionEvent: handleSubscriptionEventV2,
  handleSubscriptionDeleted: handleSubscriptionDeletedV2,
  handleCheckoutCompleted: handleCheckoutCompletedV2,
  handlePaymentFailed: handlePaymentFailedV2,
  handlePaymentSucceeded: handlePaymentSucceededV2,
} satisfies StripeWebhookHandlers;

const revenuecatV2Bindings = {
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
} satisfies RevenuecatWebhookHandlers;

function expectExactBindings<T extends object>(actual: T, expected: T): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());

  for (const key of Object.keys(expected) as Array<keyof T>) {
    expect(actual[key]).toBe(expected[key]);
  }
}

describe('billing-v2 webhook handler selectors [WI-2619]', () => {
  it('binds every StripeWebhookHandlers property to its billing-v2 production handler', () => {
    expectExactBindings(getStripeWebhookHandlers(), stripeV2Bindings);
  });

  it('binds every RevenuecatWebhookHandlers property to its billing-v2 production handler', () => {
    expectExactBindings(getRevenuecatWebhookHandlers(), revenuecatV2Bindings);
  });
});
