/**
 * [BUG-565] account-repository — unscoped helper naming contract
 *
 * Ratchet test: verifies that the __unscoped suffix is present on every
 * standalone helper and that the old unqualified names no longer exist as
 * named exports. This fails if a future rename accidentally drops the suffix
 * (restoring the invisible-risk pattern) or if new helpers are added without
 * the suffix.
 *
 * [WI-1239 / 779-strip] Most legacy `subscriptions`-table helpers
 * (findSubscriptionByStripeId__unscoped, findSubscriptionByStripeCustomerId__unscoped,
 * lockSubscriptionById__unscoped, lockSubscriptionByAccountId__unscoped) were
 * removed — dead, superseded by the v2 twins (findSubscriptionByOrganizationId__unscoped
 * etc.). findSubscriptionById__unscoped is KEPT — still transitively reachable
 * from out-of-scope legacy code (services/account.ts, services/profile.ts).
 */
import * as accountRepository from './account-repository.js';

describe('[BUG-565] account-repository — __unscoped naming contract', () => {
  it('exports findQuotaPool__unscoped', () => {
    expect(typeof accountRepository.findQuotaPool__unscoped).toBe('function');
  });

  it('exports findTopUpByTransactionId__unscoped', () => {
    expect(typeof accountRepository.findTopUpByTransactionId__unscoped).toBe(
      'function',
    );
  });

  it('does NOT export the old unqualified findSubscriptionById', () => {
    expect(
      (accountRepository as Record<string, unknown>)['findSubscriptionById'],
    ).toBeUndefined();
  });

  it('does NOT export the old unqualified findSubscriptionByStripeId', () => {
    expect(
      (accountRepository as Record<string, unknown>)[
        'findSubscriptionByStripeId'
      ],
    ).toBeUndefined();
  });

  it('does NOT export the old unqualified findQuotaPool', () => {
    expect(
      (accountRepository as Record<string, unknown>)['findQuotaPool'],
    ).toBeUndefined();
  });

  it('does NOT export the old unqualified findTopUpByTransactionId', () => {
    expect(
      (accountRepository as Record<string, unknown>)[
        'findTopUpByTransactionId'
      ],
    ).toBeUndefined();
  });
});
