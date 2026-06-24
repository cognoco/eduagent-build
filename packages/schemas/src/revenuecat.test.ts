import { revenuecatWebhookSchema } from './revenuecat.js';

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
