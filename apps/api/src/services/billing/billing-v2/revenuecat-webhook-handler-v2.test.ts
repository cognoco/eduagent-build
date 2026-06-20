// ---------------------------------------------------------------------------
// revenuecat-webhook-handler-v2 — [Issue 836] family-share guard (unit)
// ---------------------------------------------------------------------------
// Always-run forward-only guard for the v2 twin handlers. The DB-state proof
// (a shared copy creates no paid subscription row) lives in
// revenuecat-v2.integration.test.ts, which is gated on DATABASE_URL and skips
// in unit-only runs. This suite runs everywhere and pins the behavior the guard
// must keep: a shared copy (is_family_share === true) short-circuits BEFORE any
// DB / grant work and escalates via the Sentry boundary.
//
// Sentry is a true external boundary (the @sentry SDK wrapper) — the only mock.
// The handler receives a Proxy `db` that throws on ANY access: if the guard
// regressed and the handler proceeded to resolveAccountIdV2 / the grant path,
// the call would throw. Asserting it resolves without throwing proves the guard
// short-circuited before touching the DB.
// ---------------------------------------------------------------------------

const mockCaptureMessage = jest.fn();
jest.mock('../../sentry' /* gc1-allow: external boundary */, () => {
  const actual = jest.requireActual(
    '../../sentry',
  ) as typeof import('../../sentry');
  return {
    ...actual,
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
    captureException: jest.fn(),
  };
});

import {
  handleInitialPurchaseV2,
  handleRenewalV2,
  handleProductChangeV2,
} from './revenuecat-webhook-handler-v2';
import type { RevenueCatEvent } from '../revenuecat-webhook-handler';

// A db that throws on ANY property access — any attempt to reach the DB or grant
// path after the guard would fail loudly.
const throwingDb = new Proxy(
  {},
  {
    get() {
      throw new Error(
        'DB accessed — family-share guard did not short-circuit before the grant path',
      );
    },
  },
) as never;

const mockKv = undefined;

function baseEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt_rc_v2_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'clerk_user_v2_1',
    product_id: 'com.eduagent.plus.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: 1700000000000,
    expiration_at_ms: 1702592000000,
    event_timestamp_ms: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('[Issue 836] v2 family-share entitlement block', () => {
  it('handleInitialPurchaseV2 short-circuits and escalates on is_family_share true', async () => {
    await expect(
      handleInitialPurchaseV2(
        throwingDb,
        mockKv,
        baseEvent({ is_family_share: true }),
      ),
    ).resolves.toBeUndefined();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
          eventId: 'evt_rc_v2_1',
        }),
      }),
    );
  });

  it('handleRenewalV2 short-circuits and escalates on is_family_share true', async () => {
    await expect(
      handleRenewalV2(
        throwingDb,
        mockKv,
        baseEvent({ type: 'RENEWAL', is_family_share: true }),
      ),
    ).resolves.toBeUndefined();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
        }),
      }),
    );
  });

  it('handleProductChangeV2 short-circuits and escalates on is_family_share true', async () => {
    await expect(
      handleProductChangeV2(
        throwingDb,
        mockKv,
        baseEvent({
          type: 'PRODUCT_CHANGE',
          new_product_id: 'com.eduagent.pro.monthly',
          is_family_share: true,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('family_share'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.family_share_blocked',
        }),
      }),
    );
  });

  it('handleInitialPurchaseV2 does NOT escalate when is_family_share is false (control)', async () => {
    // false → guard returns false → handler proceeds → throwingDb makes the
    // grant path throw. We assert it threw (proving the guard did NOT block) and
    // that the family-share escalation was NOT emitted.
    await expect(
      handleInitialPurchaseV2(
        throwingDb,
        mockKv,
        baseEvent({ is_family_share: false }),
      ),
    ).rejects.toThrow('DB accessed');

    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
