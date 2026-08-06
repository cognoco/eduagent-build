import {
  revenuecatWebhookSchema,
  type RevenuecatWebhookEvent,
} from './revenuecat.js';

// ---------------------------------------------------------------------------
// [WI-3055] Compile-time guard on the parsed OUTPUT type.
//
// Accepting `null` on the wire must not widen the parsed type: the webhook
// route branches on `event.event_timestamp_ms === undefined` and the v2
// handlers pass these fields into `T | undefined` parameters. If a future edit
// swaps the null-normalising transform for a plain `.nullable()`, `null` would
// start reaching those call sites and quietly change their behaviour. This
// fails the build instead.
// ---------------------------------------------------------------------------
type Expect<T extends true> = T;
type AdmitsNoNull<T> = [null] extends [T] ? false : true;

export type _RevenuecatOutputAdmitsNoNull = [
  Expect<AdmitsNoNull<RevenuecatWebhookEvent['event_timestamp_ms']>>,
  Expect<AdmitsNoNull<RevenuecatWebhookEvent['expiration_at_ms']>>,
  Expect<AdmitsNoNull<RevenuecatWebhookEvent['entitlement_ids']>>,
  Expect<AdmitsNoNull<RevenuecatWebhookEvent['transferred_from']>>,
  Expect<AdmitsNoNull<RevenuecatWebhookEvent['product_id']>>,
];

// Minimal valid RevenueCat webhook payload — only the required fields.
const minimalValid = {
  event: {
    id: 'evt_abc123',
    type: 'INITIAL_PURCHASE',
    app_user_id: '$RCAnonymousID:abc123',
  },
};

describe('revenuecatWebhookSchema', () => {
  it('accepts a minimal valid RevenueCat event (required fields only)', () => {
    const result = revenuecatWebhookSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event.id).toBe('evt_abc123');
      expect(result.data.event.type).toBe('INITIAL_PURCHASE');
      expect(result.data.event.app_user_id).toBe('$RCAnonymousID:abc123');
    }
  });

  it('accepts a full event with optional fields populated', () => {
    const full = {
      api_version: '1.0',
      event: {
        id: 'evt_full',
        type: 'RENEWAL',
        app_id: 'app_google_public_id',
        app_user_id: '$RCAnonymousID:xyz',
        product_id: 'com.app.plus_monthly',
        entitlement_ids: ['pro'],
        period_type: 'NORMAL',
        purchased_at_ms: 1700000000000,
        expiration_at_ms: 1702678400000,
        store: 'APP_STORE',
        environment: 'PRODUCTION',
        is_family_share: false,
        event_timestamp_ms: 1700000000000,
      },
    };
    const result = revenuecatWebhookSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event.app_id).toBe('app_google_public_id');
    }
  });

  // [WI-988] Red-green: missing required event.id must fail validation.
  it('rejects an event missing the required event.id field', () => {
    const missingId = {
      event: {
        // id is intentionally omitted
        type: 'INITIAL_PURCHASE',
        app_user_id: '$RCAnonymousID:abc123',
      },
    };
    const result = revenuecatWebhookSchema.safeParse(missingId);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('event.id');
    }
  });

  it('rejects an event missing event.type', () => {
    const missingType = {
      event: {
        id: 'evt_no_type',
        // type is intentionally omitted
        app_user_id: '$RCAnonymousID:abc123',
      },
    };
    const result = revenuecatWebhookSchema.safeParse(missingType);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('event.type');
    }
  });

  it('rejects an event missing event.app_user_id', () => {
    const missingUserId = {
      event: {
        id: 'evt_no_user',
        type: 'CANCELLATION',
        // app_user_id is intentionally omitted
      },
    };
    const result = revenuecatWebhookSchema.safeParse(missingUserId);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('event.app_user_id');
    }
  });

  it('rejects a payload with no event object', () => {
    const result = revenuecatWebhookSchema.safeParse({ api_version: '1.0' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [WI-3055] RevenueCat sends explicit `null` for fields that do not apply to an
// event. Zod's `.optional()` accepts `undefined` but rejects `null`, so every
// NON_RENEWING_PURCHASE (consumable top-up) failed validation and the webhook
// route returned 400 before granting the purchased credits.
// ---------------------------------------------------------------------------

/**
 * Verbatim shape of the production RevenueCat delivery that exposed this bug
 * (event FA8ACBEC-…, product com.eduagent.topup.500.android, 2026-08-02), with
 * the Clerk app_user_id replaced by a placeholder — a real pseudonymous user
 * identifier must not be committed (SEC-11 data minimisation).
 *
 * Fields RevenueCat nulls on a consumable are preserved exactly, including the
 * ones absent from our schema (`entitlement_id`, `renewal_number`, `metadata`),
 * because the object is non-strict and must keep tolerating them.
 */
const productionNonRenewingPurchase = {
  api_version: '1.0',
  event: {
    id: 'FA8ACBEC-0CF2-4391-AA90-29EA798787D4',
    type: 'NON_RENEWING_PURCHASE',
    app_user_id: 'user_placeholderClerkUserId000',
    product_id: 'com.eduagent.topup.500.android',
    entitlement_id: null,
    entitlement_ids: null,
    expiration_at_ms: null,
    renewal_number: null,
    metadata: null,
    period_type: 'NORMAL',
    purchased_at_ms: 1_754_164_982_000,
    environment: 'SANDBOX',
    store: 'PLAY_STORE',
    presented_offering_id: 'top_up',
    event_timestamp_ms: 1_754_164_983_000,
  },
};

describe('revenuecatWebhookSchema — explicit nulls (WI-3055)', () => {
  it('accepts the production NON_RENEWING_PURCHASE payload with null entitlement_ids and expiration_at_ms', () => {
    const result = revenuecatWebhookSchema.safeParse(
      productionNonRenewingPurchase,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event.product_id).toBe(
        'com.eduagent.topup.500.android',
      );
      expect(result.data.event.type).toBe('NON_RENEWING_PURCHASE');
    }
  });

  it('normalises explicit null to undefined so consumers keep a single absent representation', () => {
    // The webhook route branches on `event.event_timestamp_ms === undefined`
    // and the v2 handlers pass these fields into `T | undefined` parameters —
    // a null leaking through would change behaviour at those call sites.
    const result = revenuecatWebhookSchema.safeParse(
      productionNonRenewingPurchase,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event.entitlement_ids).toBeUndefined();
      expect(result.data.event.expiration_at_ms).toBeUndefined();
      // A field that was genuinely present must survive untouched.
      expect(result.data.event.event_timestamp_ms).toBe(1_754_164_983_000);
    }
  });

  it.each([
    ['entitlement_ids', { entitlement_ids: null }],
    ['expiration_at_ms', { expiration_at_ms: null }],
    ['grace_period_expiration_at_ms', { grace_period_expiration_at_ms: null }],
    ['transferred_from', { transferred_from: null }],
    ['transferred_to', { transferred_to: null }],
    ['new_product_id', { new_product_id: null }],
    ['cancel_reason', { cancel_reason: null }],
    ['period_type', { period_type: null }],
    ['is_family_share', { is_family_share: null }],
    ['store_transaction_id', { store_transaction_id: null }],
    ['event_timestamp_ms', { event_timestamp_ms: null }],
  ])('accepts explicit null for optional field %s', (_field, override) => {
    const result = revenuecatWebhookSchema.safeParse({
      event: { ...minimalValid.event, ...override },
    });
    expect(result.success).toBe(true);
  });

  it('preserves falsy-but-present values rather than coercing them to undefined', () => {
    const result = revenuecatWebhookSchema.safeParse({
      event: {
        ...minimalValid.event,
        is_family_share: false,
        purchased_at_ms: 0,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event.is_family_share).toBe(false);
      expect(result.data.event.purchased_at_ms).toBe(0);
    }
  });

  // Guard the boundary: tolerating null on optional fields must not weaken the
  // required ones. A null id/type/app_user_id is a malformed payload.
  it.each(['id', 'type', 'app_user_id'])(
    'still rejects explicit null for required field %s',
    (field) => {
      const result = revenuecatWebhookSchema.safeParse({
        event: { ...minimalValid.event, [field]: null },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain(`event.${field}`);
      }
    },
  );

  it('still rejects a wrong-typed optional field', () => {
    const result = revenuecatWebhookSchema.safeParse({
      event: { ...minimalValid.event, expiration_at_ms: 'not-a-number' },
    });
    expect(result.success).toBe(false);
  });
});
