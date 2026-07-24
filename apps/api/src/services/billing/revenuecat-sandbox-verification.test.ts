import type { RevenueCatEvent } from './revenuecat-shared';
import {
  MAX_REVENUECAT_SANDBOX_VERIFICATION_WINDOW_MS,
  authorizeRevenuecatSandboxVerification,
} from './revenuecat-sandbox-verification';

const NOW_MS = 1_753_375_200_000;

function baseEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt_sandbox_purchase_1',
    type: 'INITIAL_PURCHASE',
    app_id: 'app_google_mentomate',
    app_user_id: 'user_revenuecat_verification',
    product_id: 'com.eduagent.plus.monthly.android:monthly',
    period_type: 'NORMAL',
    store: 'PLAY_STORE',
    environment: 'SANDBOX',
    transaction_id: 'GPA.1234-5678-9012-34567',
    event_timestamp_ms: NOW_MS - 1_000,
    ...overrides,
  };
}

function baseAuthorization(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    authorizationId: 'wi-2705-proof-1',
    issuedAtMs: NOW_MS - 60_000,
    expiresAtMs: NOW_MS + 60_000,
    eventId: 'evt_sandbox_purchase_1',
    eventType: 'INITIAL_PURCHASE',
    appId: 'app_google_mentomate',
    appUserId: 'user_revenuecat_verification',
    productId: 'com.eduagent.plus.monthly.android:monthly',
    periodType: 'NORMAL',
    store: 'PLAY_STORE',
    transactionId: 'GPA.1234-5678-9012-34567',
    ...overrides,
  });
}

describe('authorizeRevenuecatSandboxVerification', () => {
  it('authorizes the exact Google Play sandbox purchase inside the bounded window', () => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization(),
        baseEvent(),
        NOW_MS,
      ),
    ).toEqual({
      authorized: true,
      authorizationId: 'wi-2705-proof-1',
    });
  });

  it('authorizes an exact replay so downstream idempotency can skip it', () => {
    const authorization = baseAuthorization();
    const event = baseEvent();

    expect(
      authorizeRevenuecatSandboxVerification(authorization, event, NOW_MS),
    ).toEqual({
      authorized: true,
      authorizationId: 'wi-2705-proof-1',
    });
    expect(
      authorizeRevenuecatSandboxVerification(authorization, event, NOW_MS),
    ).toEqual({
      authorized: true,
      authorizationId: 'wi-2705-proof-1',
    });
  });

  it('authorizes one exact expiration event for production-equivalent entitlement cleanup', () => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization({
          eventId: 'evt_sandbox_expiration_1',
          eventType: 'EXPIRATION',
        }),
        baseEvent({
          id: 'evt_sandbox_expiration_1',
          type: 'EXPIRATION',
          period_type: 'NORMAL',
        }),
        NOW_MS,
      ),
    ).toEqual({
      authorized: true,
      authorizationId: 'wi-2705-proof-1',
    });
  });

  it.each([
    ['missing', undefined],
    ['trial', 'TRIAL'],
  ])(
    'denies an exact expiration event with %s period type',
    (_label, periodType) => {
      expect(
        authorizeRevenuecatSandboxVerification(
          baseAuthorization({
            eventId: 'evt_sandbox_expiration_1',
            eventType: 'EXPIRATION',
          }),
          baseEvent({
            id: 'evt_sandbox_expiration_1',
            type: 'EXPIRATION',
            period_type: periodType,
          }),
          NOW_MS,
        ),
      ).toEqual({
        authorized: false,
        reason: 'authorization_mismatch',
      });
    },
  );

  it('denies when authorization is absent', () => {
    expect(
      authorizeRevenuecatSandboxVerification(undefined, baseEvent(), NOW_MS),
    ).toEqual({
      authorized: false,
      reason: 'missing_authorization',
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['non-object JSON', '[]'],
    ['missing field', JSON.stringify({ version: 1 })],
    [
      'extra field',
      baseAuthorization({ unexpectedAuthorizationScope: 'all-sandbox' }),
    ],
    ['empty authorization ID', baseAuthorization({ authorizationId: '' })],
  ])('denies malformed authorization: %s', (_label, authorization) => {
    expect(
      authorizeRevenuecatSandboxVerification(
        authorization,
        baseEvent(),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'malformed_authorization',
    });
  });

  it('denies authorization fields with leading or trailing whitespace instead of normalizing them', () => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization({
          productId: ' com.eduagent.plus.monthly.android:monthly ',
        }),
        baseEvent(),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'malformed_authorization',
    });
  });

  it.each([
    [
      'zero-length',
      {
        issuedAtMs: NOW_MS,
        expiresAtMs: NOW_MS,
      },
    ],
    [
      'negative-length',
      {
        issuedAtMs: NOW_MS + 1,
        expiresAtMs: NOW_MS,
      },
    ],
    [
      'over maximum',
      {
        issuedAtMs: NOW_MS - 1,
        expiresAtMs:
          NOW_MS - 1 + MAX_REVENUECAT_SANDBOX_VERIFICATION_WINDOW_MS + 1,
      },
    ],
  ])('denies an invalid %s authorization window', (_label, overrides) => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization(overrides),
        baseEvent(),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'invalid_authorization_window',
    });
  });

  it('denies an authorization before its issued time', () => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization({
          issuedAtMs: NOW_MS + 1,
          expiresAtMs: NOW_MS + 60_001,
        }),
        baseEvent(),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'authorization_not_yet_valid',
    });
  });

  it.each([NOW_MS, NOW_MS - 1])(
    'denies an authorization at or after expiry (%s)',
    (expiresAtMs) => {
      expect(
        authorizeRevenuecatSandboxVerification(
          baseAuthorization({
            issuedAtMs: NOW_MS - 60_000,
            expiresAtMs,
          }),
          baseEvent(),
          NOW_MS,
        ),
      ).toEqual({
        authorized: false,
        reason: 'authorization_expired',
      });
    },
  );

  it.each([
    ['wrong event ID', { id: 'evt_other' }],
    ['wrong user', { app_user_id: 'user_other' }],
    ['wrong app', { app_id: 'app_other' }],
    ['missing app', { app_id: undefined }],
    ['wrong store', { store: 'APP_STORE' }],
    [
      'wrong product',
      { product_id: 'com.eduagent.family.monthly.android:monthly' },
    ],
    [
      'wrong base plan',
      { product_id: 'com.eduagent.plus.monthly.android:monthly-promo' },
    ],
    ['wrong transaction', { transaction_id: 'GPA.other' }],
    ['missing transaction', { transaction_id: undefined }],
  ])('denies a matching event with %s', (_label, overrides) => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization(),
        baseEvent(overrides),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'authorization_mismatch',
    });
  });

  it('denies reuse for a different RevenueCat event', () => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization(),
        baseEvent({ id: 'evt_sandbox_purchase_2' }),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'authorization_mismatch',
    });
  });

  it.each([
    ['wrong event type', { type: 'RENEWAL' }],
    ['wrong environment', { environment: 'PRODUCTION' }],
  ])('denies an unsupported event shape: %s', (_label, overrides) => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization(),
        baseEvent(overrides),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'unsupported_event',
    });
  });

  it.each([
    ['unqualified Android product', 'com.eduagent.plus.monthly.android'],
    [
      'unknown Android base plan',
      'com.eduagent.plus.monthly.android:monthly-promo',
    ],
    ['iOS product', 'com.eduagent.plus.monthly'],
    ['top-up product', 'com.eduagent.topup.500.android'],
  ])('denies an authorization for %s', (_label, productId) => {
    expect(
      authorizeRevenuecatSandboxVerification(
        baseAuthorization({ productId }),
        baseEvent({ product_id: productId }),
        NOW_MS,
      ),
    ).toEqual({
      authorized: false,
      reason: 'malformed_authorization',
    });
  });
});
