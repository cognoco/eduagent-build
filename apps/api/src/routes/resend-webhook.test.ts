// ---------------------------------------------------------------------------
// Resend Webhook Route — Tests [BUG-29]
// ---------------------------------------------------------------------------

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const mockLoggerWarn = jest.fn();
jest.mock('../services/logger', () => {
  const actual = jest.requireActual(
    '../services/logger',
  ) as typeof import('../services/logger');
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: mockLoggerWarn,
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };
});

jest.mock(
  '../services/sentry' /* gc1-allow: Sentry is an external observability boundary — SDK calls, not internal service logic. Same pattern as routes/account.test.ts */,
  () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
  }),
);

import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { resendWebhookRoute, verifyResendSignature } from './resend-webhook';
import { claimWebhookId } from '../services/webhook-idempotency';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import {
  resendSignatureFailureEscalator,
  SIGNATURE_FAILURE_THRESHOLD,
} from '../services/webhooks/signature-failure-escalator';

// ---------------------------------------------------------------------------
// Test Svix signing helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

/**
 * Generates a valid Svix signature for test payloads.
 * Mirrors the verifyResendSignature algorithm exactly.
 */
async function signPayload(
  rawBody: string,
  webhookId: string,
  timestamp: string,
  secret: string = TEST_SECRET,
): Promise<string> {
  const stripped = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const b64 = stripped.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedContent),
  );

  const sigBytes = new Uint8Array(signatureBuffer);
  let binaryStr = '';
  for (let i = 0; i < sigBytes.length; i++) {
    binaryStr += String.fromCharCode(sigBytes[i] ?? 0);
  }
  const base64Sig = btoa(binaryStr);
  return `v1,${base64Sig}`;
}

function nowTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const app = new Hono().route('/', resendWebhookRoute);

const TEST_ENV = {
  RESEND_WEBHOOK_SECRET: TEST_SECRET,
};

async function makeRequest(
  body: unknown,
  overrideHeaders: Partial<{
    'svix-id': string;
    'svix-timestamp': string;
    'svix-signature': string;
  }> = {},
  env: Record<string, unknown> = TEST_ENV,
  customBody?: string,
) {
  const rawBody = customBody ?? JSON.stringify(body);
  const webhookId = 'msg_test_' + Math.random().toString(36).slice(2);
  const timestamp = nowTimestamp();
  const signature = await signPayload(rawBody, webhookId, timestamp);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'svix-id': overrideHeaders['svix-id'] ?? webhookId,
    'svix-timestamp': overrideHeaders['svix-timestamp'] ?? timestamp,
    'svix-signature': overrideHeaders['svix-signature'] ?? signature,
  };

  return app.request(
    '/webhooks/resend',
    {
      method: 'POST',
      headers,
      body: rawBody,
    },
    env,
  );
}

// ---------------------------------------------------------------------------
// Signature verification unit tests
// ---------------------------------------------------------------------------

describe('verifyResendSignature', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'test@example.com' },
    });
    const id = 'msg_test_001';
    const ts = nowTimestamp();
    const sig = await signPayload(body, id, ts);

    const result = await verifyResendSignature(body, id, ts, sig, TEST_SECRET);
    expect(result).toBe(true);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_test_002';
    const ts = nowTimestamp();

    const result = await verifyResendSignature(
      body,
      id,
      ts,
      'v1,invalidsignaturevalue==',
      TEST_SECRET,
    );
    expect(result).toBe(false);
  });

  it('rejects a stale timestamp (> 5 minutes old)', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_test_003';
    const staleTs = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
    const sig = await signPayload(body, id, staleTs);

    const result = await verifyResendSignature(
      body,
      id,
      staleTs,
      sig,
      TEST_SECRET,
    );
    expect(result).toBe(false);
  });

  it('rejects an invalid timestamp', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    const result = await verifyResendSignature(
      body,
      'msg_test_004',
      'not-a-number',
      'v1,anysig==',
      TEST_SECRET,
    );
    expect(result).toBe(false);
  });

  it('rejects signature for wrong secret', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_test_005';
    const ts = nowTimestamp();
    // Different but valid base64-encoded secret
    const differentSecret =
      'whsec_ZGlmZmVyZW50U2VjcmV0S2V5Rm9yVGVzdGluZzEyMzQ=';
    const sig = await signPayload(body, id, ts, differentSecret);

    const result = await verifyResendSignature(body, id, ts, sig, TEST_SECRET);
    expect(result).toBe(false);
  });

  // [BUG-768 / A-25] BREAK TEST. The pre-fix code had:
  //
  //     if (a.length !== b.length) return false;
  //
  // …above the constant-time loop, which leaks the length of the expected
  // signature via timing (early return for length-mismatch is faster than
  // the byte-by-byte XOR walk). The fix folds length difference into `diff`
  // and walks Math.max(len) on both sides — different-length inputs return
  // false through the same code path as same-length-wrong inputs.
  //
  // We can't measure timing in a unit test, but we CAN assert the function
  // does not throw / short-circuit on length mismatch, and that pathological
  // wrong inputs of any length still resolve to false.
  describe('[BUG-768 / A-25] timingSafeEqual length-leak guard', () => {
    it('returns false for short attacker-supplied signatures (length-mismatch path)', async () => {
      const body = JSON.stringify({ type: 'email.delivered', data: {} });
      const id = 'msg_short_sig';
      const ts = nowTimestamp();

      // Real HMAC-SHA256 base64 = 44 chars. We supply 8.
      const result = await verifyResendSignature(
        body,
        id,
        ts,
        'v1,abcdefgh',
        TEST_SECRET,
      );
      expect(result).toBe(false);
    });

    it('returns false for over-long attacker-supplied signatures (length-mismatch path)', async () => {
      const body = JSON.stringify({ type: 'email.delivered', data: {} });
      const id = 'msg_long_sig';
      const ts = nowTimestamp();

      const overLong = 'A'.repeat(200);
      const result = await verifyResendSignature(
        body,
        id,
        ts,
        `v1,${overLong}`,
        TEST_SECRET,
      );
      expect(result).toBe(false);
    });

    it('returns false for empty signature payload', async () => {
      const body = JSON.stringify({ type: 'email.delivered', data: {} });
      const id = 'msg_empty';
      const ts = nowTimestamp();

      const result = await verifyResendSignature(
        body,
        id,
        ts,
        'v1,',
        TEST_SECRET,
      );
      expect(result).toBe(false);
    });

    it('returns false for invalid base64 signature without throwing', async () => {
      // base64ToBytes catches atob's InvalidCharacterError and returns an
      // empty Uint8Array. The length-fold then makes the comparison fail.
      const body = JSON.stringify({ type: 'email.delivered', data: {} });
      const id = 'msg_garbage';
      const ts = nowTimestamp();

      const result = await verifyResendSignature(
        body,
        id,
        ts,
        'v1,!!not~~base64!!',
        TEST_SECRET,
      );
      expect(result).toBe(false);
    });

    it('returns false for valid-shape but wrong same-length signature', async () => {
      const body = JSON.stringify({ type: 'email.delivered', data: {} });
      const id = 'msg_same_len';
      const ts = nowTimestamp();

      // 44-char base64 string of zeros — same length as a real HMAC, wrong bytes.
      const sameLength = 'A'.repeat(43) + '=';
      const result = await verifyResendSignature(
        body,
        id,
        ts,
        `v1,${sameLength}`,
        TEST_SECRET,
      );
      expect(result).toBe(false);
    });
  });

  it('accepts signature without whsec_ prefix', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'x@example.com' },
    });
    const id = 'msg_test_006';
    const ts = nowTimestamp();

    // Sign using plain base64 secret (no whsec_ prefix)
    const stripped = TEST_SECRET.slice(6); // remove whsec_
    const sig = await signPayload(body, id, ts, stripped);

    const result = await verifyResendSignature(body, id, ts, sig, stripped);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP route tests
// ---------------------------------------------------------------------------

describe('POST /webhooks/resend — authentication', () => {
  it('returns 400 when svix headers are missing', async () => {
    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email.delivered', data: {} }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
  });

  it('returns 500 when RESEND_WEBHOOK_SECRET is not configured', async () => {
    const res = await makeRequest(
      { type: 'email.delivered', data: { to: 'test@example.com' } },
      {},
      {}, // no RESEND_WEBHOOK_SECRET
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 401 when svix-signature is wrong', async () => {
    const rawBody = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_bad_sig';
    const ts = nowTimestamp();

    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': 'v1,invalidsignature123==',
        },
        body: rawBody,
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 for a valid signature', async () => {
    const res = await makeRequest({
      type: 'email.delivered',
      data: { to: 'test@example.com' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it('returns 401 when svix-timestamp is stale (> 5 minutes)', async () => {
    const rawBody = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_stale';
    const staleTs = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
    // Compute correct signature for stale timestamp — still rejected due to staleness
    const sig = await signPayload(rawBody, id, staleTs);

    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': staleTs,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });

  it('logs structured context with webhookId + webhookTimestamp on signature failure (errors-api F-049)', async () => {
    // Verify that signature verification failures now emit structured context —
    // previously the logger.warn had no arguments, making misconfiguration
    // (e.g. wrong webhook secret) invisible from logs alone.
    const rawBody = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_f049_regression';
    const ts = nowTimestamp();

    mockLoggerWarn.mockClear();

    await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': 'v1,invalidsignature==',
        },
        body: rawBody,
      },
      TEST_ENV,
    );

    // Logger must have been called with structured context (not just a bare message)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid webhook signature'),
      expect.objectContaining({
        event: 'resend.webhook.signature_verification_failed',
        webhookId: id,
        webhookTimestamp: ts,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Sustained signature-failure escalation [WI-646]
//
// Route-wiring regression: removing the resendSignatureFailureEscalator
// .record() call from the !isValid branch must fail these tests. The
// escalator's threshold/window logic itself is unit-tested in
// services/webhooks/signature-failure-escalator.test.ts.
// ---------------------------------------------------------------------------

describe('sustained signature-failure escalation [WI-646]', () => {
  beforeEach(() => {
    // The escalator singleton accumulates state across other tests in this
    // file (several earlier tests trigger signature failures). Reset for
    // deterministic threshold counting.
    resendSignatureFailureEscalator.__resetForTesting();
    (captureException as jest.Mock).mockClear();
  });

  afterEach(() => {
    // Leave clean state for any test that runs after this describe.
    resendSignatureFailureEscalator.__resetForTesting();
  });

  async function sendBadSignatureRequest(suffix: number): Promise<Response> {
    const rawBody = JSON.stringify({ type: 'email.delivered', data: {} });
    return app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': `msg_sustained_${suffix}`,
          'svix-timestamp': nowTimestamp(),
          'svix-signature': 'v1,invalidsignature123==',
        },
        body: rawBody,
      },
      TEST_ENV,
    );
  }

  it('does not escalate to Sentry for a single signature failure (log-only)', async () => {
    const res = await sendBadSignatureRequest(0);

    expect(res.status).toBe(401);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('escalates to Sentry exactly once when threshold signature failures occur [WI-646 regression]', async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      const res = await sendBadSignatureRequest(i);
      expect(res.status).toBe(401);
    }

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'resend.webhook.sustained_signature_failure',
        }),
      }),
    );
  });

  it('still escalates only once when failures continue beyond the threshold', async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD * 2; i++) {
      await sendBadSignatureRequest(i);
    }

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// email.bounced
// ---------------------------------------------------------------------------

describe('email.bounced', () => {
  it('emits app/email.bounced Inngest event for bounce', async () => {
    (inngest.send as jest.Mock).mockClear();

    const res = await makeRequest({
      type: 'email.bounced',
      data: {
        email_id: 'email_abc123',
        to: 'parent@example.com',
        from: 'noreply@mentomate.com',
        subject: 'Parental consent required',
      },
    });

    expect(res.status).toBe(200);
    // [SEC-6 / BUG-722] Inngest event payloads are persisted in the Inngest
    // dashboard (third-party). Recipient email must be masked at this trust
    // boundary even though the surrounding code paths log a masked form.
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/email.bounced',
      data: expect.objectContaining({
        type: 'email.bounced',
        to: 'p***@example.com',
        emailId: 'email_abc123',
        timestamp: expect.any(String),
      }),
    });
  });

  it('emits app/email.bounced Inngest event for complaint', async () => {
    (inngest.send as jest.Mock).mockClear();

    const res = await makeRequest({
      type: 'email.complained',
      data: {
        email_id: 'email_def456',
        to: 'user@example.com',
      },
    });

    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/email.bounced',
      data: expect.objectContaining({
        type: 'email.complained',
        to: 'u***@example.com',
        emailId: 'email_def456',
      }),
    });
  });

  it('[BUG-25] logs correct event type for complaints (not hardcoded email.bounced)', async () => {
    mockLoggerWarn.mockClear();

    await makeRequest({
      type: 'email.complained',
      data: {
        email_id: 'email_complaint_001',
        to: 'complainant@example.com',
      },
    });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[resend] Email delivery failure',
      expect.objectContaining({
        event: 'email.complained',
        type: 'email.complained',
      }),
    );
  });

  // [SEC-6 / BUG-722] Break test — explicit guarantee that no Inngest event
  // payload ever contains the raw recipient address. If this fails, recipient
  // PII is being persisted to the Inngest dashboard.
  it('[SEC-6 / BUG-722] never sends raw recipient email to Inngest', async () => {
    (inngest.send as jest.Mock).mockClear();

    const RAW = 'sensitive.target@victim.example.com';
    const res = await makeRequest({
      type: 'email.bounced',
      data: { email_id: 'email_xyz', to: RAW },
    });

    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledTimes(1);
    const sent = (inngest.send as jest.Mock).mock.calls[0][0];
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain(RAW);
    // And the sanitized form must still preserve the domain for triage.
    expect(sent.data.to).toBe('s***@victim.example.com');
  });

  it('handles missing email_id gracefully', async () => {
    (inngest.send as jest.Mock).mockClear();

    const res = await makeRequest({
      type: 'email.bounced',
      data: { to: 'parent@example.com' },
    });

    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/email.bounced',
      data: expect.objectContaining({
        emailId: null,
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// email.delivered
// ---------------------------------------------------------------------------

describe('email.delivered', () => {
  it('returns 200 without emitting Inngest event', async () => {
    (inngest.send as jest.Mock).mockClear();

    const res = await makeRequest({
      type: 'email.delivered',
      data: {
        email_id: 'email_ghi789',
        to: 'parent@example.com',
      },
    });

    expect(res.status).toBe(200);
    // email.delivered only logs — no Inngest event
    expect(inngest.send).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.received).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unknown event types
// ---------------------------------------------------------------------------

describe('unknown event types', () => {
  it('returns 200 without error for unknown event type', async () => {
    (inngest.send as jest.Mock).mockClear();

    const res = await makeRequest({
      type: 'email.opened',
      data: { to: 'parent@example.com' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    // Unknown events are acknowledged and ignored — no Inngest events
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('returns 200 for any future Resend event type', async () => {
    const res = await makeRequest({
      type: 'email.link_clicked',
      data: { to: 'user@example.com' },
    });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Malformed payload
// ---------------------------------------------------------------------------

describe('malformed payload', () => {
  it('returns 400 for invalid JSON', async () => {
    const rawInvalidBody = '{not valid json}}}';
    const id = 'msg_malformed';
    const ts = nowTimestamp();
    const sig = await signPayload(rawInvalidBody, id, ts);

    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawInvalidBody,
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // [LOW — resend payload not validated BREAK TEST] A signature-verified
  // payload whose `data` is missing (or non-object) previously reached
  // handleEmailBounced, which read `data.email_id` on `undefined` and threw →
  // 500 → Svix retries the permanently-bad payload. After the fix the route
  // safeParses the shape and, since the signature is already verified, acks
  // with 200 (no retry) and captures to Sentry for ops review.
  it('[LOW] acks 200 (no retry) and captures to Sentry when data is missing on a signed payload', async () => {
    const sentryMock = require('../services/sentry') as {
      captureException: jest.Mock;
    };
    sentryMock.captureException.mockClear();

    // Valid JSON, valid signature, but `data` is absent — handlers depend on it.
    const rawBody = JSON.stringify({ type: 'email.bounced' });
    const id = 'msg_missing_data';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      TEST_ENV,
    );

    // Must NOT 500 / 4xx — ack so Svix does not retry the malformed payload.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe('malformed_payload');
    // Observability: the parse failure is escalated, not silently swallowed.
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    // The bounce handler must never have run (would have thrown on data.email_id).
    expect(inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/email.bounced' }),
    );
  });
});

// ---------------------------------------------------------------------------
// [CCR-PR120-M7] Svix-id replay deduplication
// ---------------------------------------------------------------------------

type KVNamespaceLike = {
  get: jest.Mock<Promise<string | null>, [key: string]>;
  put: jest.Mock<
    Promise<void>,
    [key: string, value: string, opts?: { expirationTtl?: number }]
  >;
};

function makeFakeKV(): KVNamespaceLike {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    put: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('[CCR-PR120-M7] svix-id replay dedup', () => {
  beforeEach(() => {
    (inngest.send as jest.Mock).mockClear();
    mockLoggerWarn.mockClear();
  });

  it('first request with valid signature is accepted and records the svix-id', async () => {
    const kv = makeFakeKV();
    const env = { ...TEST_ENV, IDEMPOTENCY_KV: kv };

    const rawBody = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'user@example.com' },
    });
    const id = 'msg_first_request';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(kv.get).toHaveBeenCalledWith(`svix-dedup:resend:${id}`);
    // KV write is fire-and-forget — flush microtasks so the promise resolves.
    await new Promise((r) => setImmediate(r));
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      `svix-dedup:resend:${id}`,
      '1',
      expect.objectContaining({ expirationTtl: 300 }),
    );
  });

  it('REPLAY: second request with same svix-id is rejected 409 and side-effects suppressed', async () => {
    const kv = makeFakeKV();
    const env = { ...TEST_ENV, IDEMPOTENCY_KV: kv };

    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_replay', to: 'a@b.com' },
    });
    const id = 'msg_replay';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    // First request: succeeds, writes dedup record
    const first = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      env,
    );
    expect(first.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(inngest.send).toHaveBeenCalledTimes(1);

    // Second identical request (replay): rejected with 409
    (inngest.send as jest.Mock).mockClear();
    const second = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      env,
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.code).toBe('CONFLICT');
    // CRITICAL: no Inngest event must be emitted on replay — the whole point
    // is to prevent duplicate side-effects.
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('REPLAY break-test: removing dedup makes the replay re-process (proves test is real)', async () => {
    // Same scenario as above but using TEST_ENV (no KV). Without the dedup
    // guard the second request slips through and emits another Inngest event.
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_no_kv', to: 'a@b.com' },
    });
    const id = 'msg_no_kv_replay';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const headers = {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    };

    const first = await app.request(
      '/webhooks/resend',
      { method: 'POST', headers, body: rawBody },
      TEST_ENV,
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      '/webhooks/resend',
      { method: 'POST', headers, body: rawBody },
      TEST_ENV,
    );
    // Without KV dedup, replay succeeds — this confirms the previous test's
    // 409 came from dedup, not from some other rejection path.
    expect(second.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledTimes(2);
  });

  it('KV missing in production surfaces an Inngest observability event', async () => {
    // Use a HEALTHY DB so the DB gate still protects — this isolates the
    // KV-missing observability path. (With NO DB middleware too, production +
    // both-unbound is the compound-outage case, which now correctly 503s and
    // is owned by the dedicated compound-dedup tests below.)
    const appWithDb = buildAppWithDb(makeFakeDb());
    const env = { ...TEST_ENV, ENVIRONMENT: 'production' };

    const rawBody = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'a@b.com' },
    });
    const id = 'msg_kv_missing_prod';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);
    const res = await appWithDb.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      env,
    );

    expect(res.status).toBe(200);
    // Should have logged a warning + emitted the missing-KV signal
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[resend] IDEMPOTENCY_KV not bound — svix-id replay protection disabled',
      expect.objectContaining({ environment: 'production' }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/resend-webhook.dedup_kv_missing',
        data: expect.objectContaining({ environment: 'production' }),
      }),
    );
  });

  it('KV missing in dev is silent (no warning, no Inngest signal)', async () => {
    const res = await makeRequest({
      type: 'email.delivered',
      data: { to: 'a@b.com' },
    });

    expect(res.status).toBe(200);
    const warnsAboutMissingKv = mockLoggerWarn.mock.calls.some(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('IDEMPOTENCY_KV not bound'),
    );
    expect(warnsAboutMissingKv).toBe(false);
    const signalsMissingKv = (inngest.send as jest.Mock).mock.calls.some(
      (call) => call[0]?.name === 'app/resend-webhook.dedup_kv_missing',
    );
    expect(signalsMissingKv).toBe(false);
  });

  it('KV read failure does NOT silently weaken protection (logs + Inngest signal)', async () => {
    const kv: KVNamespaceLike = {
      get: jest.fn().mockRejectedValue(new Error('kv read boom')),
      put: jest.fn().mockResolvedValue(undefined),
    };
    const env = { ...TEST_ENV, IDEMPOTENCY_KV: kv };

    const res = await makeRequest(
      { type: 'email.delivered', data: { to: 'a@b.com' } },
      {},
      env,
    );

    // Falls through to processing rather than 500-ing — webhook stays functional.
    expect(res.status).toBe(200);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[resend] svix-id dedup read failed; allowing request',
      expect.objectContaining({ error: 'kv read boom' }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/resend-webhook.dedup_lookup_failed',
      }),
    );
  });

  it('records dedup with TTL matching the 5-minute signature window', async () => {
    const { __internal } = require('./resend-webhook') as {
      __internal: { SVIX_DEDUP_TTL_SECONDS: number };
    };
    expect(__internal.SVIX_DEDUP_TTL_SECONDS).toBe(300);
  });

  // [BUG-118] The dedup key must be written BEFORE the Inngest dispatch.
  // The prior implementation wrote it fire-and-forget AFTER processing,
  // leaving a race window in which a parallel duplicate that arrived
  // between the .get() and the post-processing .put() would also see no key
  // and re-process. We assert the call ordering against the same KV mock
  // to pin the new contract.
  it('[BUG-118] writes dedup record BEFORE invoking event handlers', async () => {
    const order: string[] = [];
    const kv: KVNamespaceLike = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockImplementation(async () => {
        order.push('kv.put');
      }),
    };
    (inngest.send as jest.Mock).mockImplementation(async () => {
      order.push('inngest.send');
    });
    const env = { ...TEST_ENV, IDEMPOTENCY_KV: kv };

    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_order', to: 'a@b.com' },
    });
    const id = 'msg_order_check';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      env,
    );

    expect(res.status).toBe(200);
    // The KV write must happen FIRST (before processing dispatches Inngest).
    expect(order[0]).toBe('kv.put');
    expect(order).toContain('inngest.send');
    expect(order.indexOf('kv.put')).toBeLessThan(order.indexOf('inngest.send'));
  });

  it('[BUG-118] pre-write failure surfaces as observability signal (no silent recovery)', async () => {
    const kv: KVNamespaceLike = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockRejectedValue(new Error('kv put boom')),
    };
    const env = { ...TEST_ENV, IDEMPOTENCY_KV: kv };

    const res = await makeRequest(
      { type: 'email.delivered', data: { to: 'a@b.com' } },
      {},
      env,
    );

    expect(res.status).toBe(200);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('svix-id dedup pre-write failed'),
      expect.objectContaining({ error: 'kv put boom' }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/resend-webhook.dedup_prewrite_failed',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [BUG-319 / CCR PR #254] Atomic dedup via DB unique constraint
//
// Break tests for the atomic INSERT ... ON CONFLICT DO NOTHING RETURNING
// strategy that replaces the previous non-atomic KV check-then-write.
// ---------------------------------------------------------------------------

type ResendWebhookDb = {
  insert: jest.Mock;
  __claimedKeys: Set<string>;
  __insertCallCount: number;
};

function makeFakeDb(opts?: { failWith?: Error }): ResendWebhookDb {
  const claimedKeys = new Set<string>();
  const insertMock = jest.fn();

  const fake: ResendWebhookDb = {
    insert: insertMock,
    __claimedKeys: claimedKeys,
    __insertCallCount: 0,
  };

  insertMock.mockImplementation((_table: unknown) => {
    fake.__insertCallCount += 1;
    let pendingKey: string | null = null;

    const chain = {
      values: (vals: { source: string; webhookId: string }) => {
        pendingKey = `${vals.source}:${vals.webhookId}`;
        return chain;
      },
      onConflictDoNothing: (_o: unknown) => chain,
      returning: async (_cols: unknown) => {
        if (opts?.failWith) throw opts.failWith;
        if (pendingKey === null) return [];
        if (claimedKeys.has(pendingKey)) return [];
        claimedKeys.add(pendingKey);
        return [{ webhookId: pendingKey.split(':')[1] }];
      },
    };
    return chain;
  });

  return fake;
}

const asDb = (fake: ResendWebhookDb): Database => fake as unknown as Database;

function buildAppWithDb(db: ResendWebhookDb | null) {
  const a = new Hono();
  a.use('*', async (c, next) => {
    if (db) c.set('db' as never, asDb(db) as never);
    await next();
  });
  a.route('/', resendWebhookRoute);
  return a;
}

describe('[BUG-319] atomic DB-based webhook idempotency', () => {
  beforeEach(() => {
    (inngest.send as jest.Mock).mockClear();
    mockLoggerWarn.mockClear();
  });

  it('claimWebhookId: sequential — first claimed, second replay', async () => {
    const db = makeFakeDb();
    expect(await claimWebhookId(asDb(db), 'resend', 'msg_seq_1')).toBe(
      'claimed',
    );
    expect(await claimWebhookId(asDb(db), 'resend', 'msg_seq_1')).toBe(
      'replay',
    );
    expect(db.__claimedKeys.has('resend:msg_seq_1')).toBe(true);
  });

  it('claimWebhookId: returns "unavailable" when DB throws', async () => {
    const db = makeFakeDb({ failWith: new Error('db connection refused') });
    expect(await claimWebhookId(asDb(db), 'resend', 'msg_unavail')).toBe(
      'unavailable',
    );
  });

  // [OBS-WI-01] DB failure must escalate to logger.warn + Sentry so on-call
  // can distinguish transient connection errors from schema/auth regressions.
  // Previously the catch was bare (no binding, no logging) — only the return
  // value was observable. This test locks in the escalation contract.
  it('[OBS-WI-01] claimWebhookId: escalates logger.warn + captureException when DB throws', async () => {
    const sentryMock = require('../services/sentry') as {
      captureException: jest.Mock;
    };
    sentryMock.captureException.mockClear();
    mockLoggerWarn.mockClear();

    const dbError = new Error('db connection refused');
    const db = makeFakeDb({ failWith: dbError });
    await claimWebhookId(asDb(db), 'resend', 'msg_obs_wi_01');

    // Structured log must fire with the queryable event key
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('DB claim failed'),
      expect.objectContaining({
        event: 'webhook_idempotency.db_claim_failed',
        source: 'resend',
        webhookId: 'msg_obs_wi_01',
      }),
    );

    // Sentry escalation must fire with the raw error + context
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'webhook_idempotency.claim_failed',
          source: 'resend',
          webhookId: 'msg_obs_wi_01',
        }),
      }),
    );
  });

  it('CONCURRENT: 3 parallel claims for same id — exactly ONE claimed', async () => {
    const db = makeFakeDb();
    const results = await Promise.all([
      claimWebhookId(asDb(db), 'resend', 'msg_concurrent'),
      claimWebhookId(asDb(db), 'resend', 'msg_concurrent'),
      claimWebhookId(asDb(db), 'resend', 'msg_concurrent'),
    ]);
    expect(results.filter((r) => r === 'claimed').length).toBe(1);
    expect(results.filter((r) => r === 'replay').length).toBe(2);
    expect(db.__insertCallCount).toBe(3);
    expect(db.__claimedKeys.size).toBe(1);
  });

  it('CONCURRENT: different ids are all claimed independently', async () => {
    const db = makeFakeDb();
    const results = await Promise.all([
      claimWebhookId(asDb(db), 'resend', 'msg_a'),
      claimWebhookId(asDb(db), 'resend', 'msg_b'),
      claimWebhookId(asDb(db), 'resend', 'msg_c'),
    ]);
    expect(results).toEqual(['claimed', 'claimed', 'claimed']);
    expect(db.__claimedKeys.size).toBe(3);
  });

  it('HTTP CONCURRENT: 3 identical parallel webhooks — exactly ONE Inngest dispatch', async () => {
    const db = makeFakeDb();
    const appWithDb = buildAppWithDb(db);
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_race', to: 'r@example.com' },
    });
    const id = 'msg_http_race';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);
    const headers = {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    };
    const responses = await Promise.all([
      appWithDb.request(
        '/webhooks/resend',
        { method: 'POST', headers, body: rawBody },
        TEST_ENV,
      ),
      appWithDb.request(
        '/webhooks/resend',
        { method: 'POST', headers, body: rawBody },
        TEST_ENV,
      ),
      appWithDb.request(
        '/webhooks/resend',
        { method: 'POST', headers, body: rawBody },
        TEST_ENV,
      ),
    ]);
    expect(responses.filter((r) => r.status === 200).length).toBe(1);
    expect(responses.filter((r) => r.status === 409).length).toBe(2);
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/email.bounced' }),
    );
  });

  it('HTTP SEQUENTIAL: second identical webhook returns 409 — no double-process', async () => {
    const db = makeFakeDb();
    const appWithDb = buildAppWithDb(db);
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_seq', to: 's@example.com' },
    });
    const id = 'msg_http_seq';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);
    const headers = {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    };
    const first = await appWithDb.request(
      '/webhooks/resend',
      { method: 'POST', headers, body: rawBody },
      TEST_ENV,
    );
    expect(first.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledTimes(1);
    (inngest.send as jest.Mock).mockClear();
    const second = await appWithDb.request(
      '/webhooks/resend',
      { method: 'POST', headers, body: rawBody },
      TEST_ENV,
    );
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe('CONFLICT');
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('HTTP DIFFERENT IDs: both processed normally', async () => {
    const db = makeFakeDb();
    const appWithDb = buildAppWithDb(db);
    const makeReq = async (id: string, emailId: string) => {
      const rawBody = JSON.stringify({
        type: 'email.bounced',
        data: { email_id: emailId, to: 'd@example.com' },
      });
      const ts = nowTimestamp();
      const sig = await signPayload(rawBody, id, ts);
      return appWithDb.request(
        '/webhooks/resend',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'svix-id': id,
            'svix-timestamp': ts,
            'svix-signature': sig,
          },
          body: rawBody,
        },
        TEST_ENV,
      );
    };
    const [r1, r2] = await Promise.all([
      makeReq('msg_diff_a', 'e_a'),
      makeReq('msg_diff_b', 'e_b'),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledTimes(2);
    expect(db.__claimedKeys.size).toBe(2);
  });

  it('HTTP DB UNAVAILABLE: 200 with observability signal — no silent recovery', async () => {
    const db = makeFakeDb({ failWith: new Error('db pool exhausted') });
    const appWithDb = buildAppWithDb(db);
    const rawBody = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'u@example.com' },
    });
    const id = 'msg_db_down';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);
    const res = await appWithDb.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('DB dedup unavailable'),
      expect.objectContaining({ webhookId: id }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/resend-webhook.dedup_db_unavailable',
      }),
    );
  });

  it('HTTP BREAK-TEST proof: bypassing claimWebhookId lets all 3 race winners through (regression-pair)', async () => {
    // "Revert and watch it fail" half of the break-test pair: simulate the
    // pre-fix world where the DB does NOT atomically block the second writer.
    // All 3 parallel identical webhooks should dispatch an Inngest event.
    const brokenDb: ResendWebhookDb = {
      insert: jest.fn(() => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ webhookId: 'whatever' }],
          }),
        }),
      })),
      __claimedKeys: new Set(),
      __insertCallCount: 0,
    };
    const appWithBrokenDb = buildAppWithDb(brokenDb);
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_proof', to: 'p@example.com' },
    });
    const id = 'msg_proof';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);
    const headers = {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    };
    const responses = await Promise.all([
      appWithBrokenDb.request(
        '/webhooks/resend',
        { method: 'POST', headers, body: rawBody },
        TEST_ENV,
      ),
      appWithBrokenDb.request(
        '/webhooks/resend',
        { method: 'POST', headers, body: rawBody },
        TEST_ENV,
      ),
      appWithBrokenDb.request(
        '/webhooks/resend',
        { method: 'POST', headers, body: rawBody },
        TEST_ENV,
      ),
    ]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(inngest.send).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Compound dedup failure — both replay gates unavailable must FAIL CLOSED.
//
// The DB dedup and the IDEMPOTENCY_KV dedup each degrade independently: when
// one is unavailable the other still protects against replay. But when BOTH
// are unavailable at once — DB claim throws AND KV is unbound (or its read
// throws) — the handler had NO replay protection and still 200'd + dispatched
// the bounce event, so every Svix replay inside the 5-minute tolerance window
// re-fired `app/email.bounced` (and siblings).
//
// Fix: on the true compound-unavailable case, return 503 so Resend/Svix retries
// later, do NOT dispatch the event, and escalate (captureException + structured
// Inngest signal) so the outage is visible. A gate cleanly reporting "already
// processed" must still 409/skip; a clean "not a duplicate" must process.
// ---------------------------------------------------------------------------

describe('compound dedup failure — fail closed when BOTH gates unavailable', () => {
  beforeEach(() => {
    (inngest.send as jest.Mock).mockClear();
    mockLoggerWarn.mockClear();
    const sentryMock = require('../services/sentry') as {
      captureException: jest.Mock;
    };
    sentryMock.captureException.mockClear();
  });

  it('DB unavailable + KV unbound (deployed env): 503, no bounce dispatch, escalates', async () => {
    const db = makeFakeDb({ failWith: new Error('db pool exhausted') });
    const appWithDb = buildAppWithDb(db);
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_compound', to: 'c@example.com' },
    });
    const id = 'msg_compound_unbound';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await appWithDb.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      // No IDEMPOTENCY_KV in env → KV gate unbound. ENVIRONMENT=production
      // makes an unbound KV an OUTAGE (abnormal), not the dev-default config.
      { ...TEST_ENV, ENVIRONMENT: 'production' },
    );

    // Fail CLOSED: 503 so Svix retries later instead of processing unprotected.
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SERVICE_UNAVAILABLE');

    // The bounce event must NOT fire — that is the duplicate-side-effect we are
    // preventing across replays.
    const bounceDispatched = (inngest.send as jest.Mock).mock.calls.some(
      (call) => call[0]?.name === 'app/email.bounced',
    );
    expect(bounceDispatched).toBe(false);

    // Compound outage must be escalated (structured signal + Sentry).
    const sentryMock = require('../services/sentry') as {
      captureException: jest.Mock;
    };
    expect(sentryMock.captureException).toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/resend-webhook.dedup_compound_unavailable',
      }),
    );
  });

  it('DB unavailable + KV read throws: 503, no bounce dispatch, escalates', async () => {
    const db = makeFakeDb({ failWith: new Error('db pool exhausted') });
    const appWithDb = buildAppWithDb(db);
    const kv: KVNamespaceLike = {
      get: jest.fn().mockRejectedValue(new Error('kv read boom')),
      put: jest.fn().mockResolvedValue(undefined),
    };
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_compound2', to: 'c2@example.com' },
    });
    const id = 'msg_compound_kvthrow';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await appWithDb.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      { ...TEST_ENV, IDEMPOTENCY_KV: kv },
    );

    expect(res.status).toBe(503);
    const bounceDispatched = (inngest.send as jest.Mock).mock.calls.some(
      (call) => call[0]?.name === 'app/email.bounced',
    );
    expect(bounceDispatched).toBe(false);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/resend-webhook.dedup_compound_unavailable',
      }),
    );
  });

  it('only DB unavailable (KV healthy): NOT fail-closed — processes via KV gate', async () => {
    const db = makeFakeDb({ failWith: new Error('db pool exhausted') });
    const appWithDb = buildAppWithDb(db);
    const kv = makeFakeKV();
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_db_only', to: 'd1@example.com' },
    });
    const id = 'msg_db_only_down';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await appWithDb.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      { ...TEST_ENV, IDEMPOTENCY_KV: kv },
    );

    // KV still protects → normal processing, not 503.
    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/email.bounced' }),
    );
    const compoundSignalled = (inngest.send as jest.Mock).mock.calls.some(
      (call) =>
        call[0]?.name === 'app/resend-webhook.dedup_compound_unavailable',
    );
    expect(compoundSignalled).toBe(false);
  });

  it('only KV unbound (DB healthy): NOT fail-closed — processes via DB gate', async () => {
    const db = makeFakeDb();
    const appWithDb = buildAppWithDb(db);
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_kv_only', to: 'k1@example.com' },
    });
    const id = 'msg_kv_only_unbound';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    const res = await appWithDb.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      // No IDEMPOTENCY_KV → KV unbound, but DB claim succeeds.
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/email.bounced' }),
    );
    const compoundSignalled = (inngest.send as jest.Mock).mock.calls.some(
      (call) =>
        call[0]?.name === 'app/resend-webhook.dedup_compound_unavailable',
    );
    expect(compoundSignalled).toBe(false);
  });

  it('dev default (both unbound, no ENVIRONMENT): NOT fail-closed — processes 200', async () => {
    // In local/dev neither binding exists by design — that is the normal
    // config, not an outage. Fail-closed must not break local webhook delivery.
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_dev_default', to: 'dev@example.com' },
    });
    const id = 'msg_dev_default';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);

    // Plain `app` has no DB middleware; TEST_ENV has no IDEMPOTENCY_KV and no
    // ENVIRONMENT → dev default.
    const res = await app.request(
      '/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        },
        body: rawBody,
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/email.bounced' }),
    );
    const compoundSignalled = (inngest.send as jest.Mock).mock.calls.some(
      (call) =>
        call[0]?.name === 'app/resend-webhook.dedup_compound_unavailable',
    );
    expect(compoundSignalled).toBe(false);
  });

  it('compound break-test proof: a known REPLAY still 409s when DB is the survivor', async () => {
    // Anchors that fail-closed does not swallow the clean "already processed"
    // signal: with a healthy DB, the second identical webhook is a replay and
    // must 409 (not 503, not 200) even though KV is unbound.
    const db = makeFakeDb();
    const appWithDb = buildAppWithDb(db);
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'e_replay_survivor', to: 'rs@example.com' },
    });
    const id = 'msg_replay_survivor';
    const ts = nowTimestamp();
    const sig = await signPayload(rawBody, id, ts);
    const headers = {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    };

    const first = await appWithDb.request(
      '/webhooks/resend',
      { method: 'POST', headers, body: rawBody },
      TEST_ENV,
    );
    expect(first.status).toBe(200);

    (inngest.send as jest.Mock).mockClear();
    const second = await appWithDb.request(
      '/webhooks/resend',
      { method: 'POST', headers, body: rawBody },
      TEST_ENV,
    );
    expect(second.status).toBe(409);
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hard-bounce suppression persistence
//
// The bug: the webhook handler emitted an observability-only Inngest event for
// `email.bounced` but never PERSISTED the dead address, so the send path kept
// re-sending to it — burning quota and hurting sender reputation.
//
// These tests exercise the REAL route with the REAL suppressEmail / claimWebhookId
// services against a hand-built fake `Database` at the true DB boundary (no
// internal jest.mock). They assert:
//   - a HARD bounce (`bounce.type: "Permanent"`) writes an email_suppressions row
//   - a SOFT/transient bounce (`Transient` / no bounce object) does NOT
//   - a complaint also suppresses (recipient marked us as spam)
//   - the persisted address is the raw lower-cased recipient (NOT the masked
//     form sent to Inngest), so the send path can match it
//   - a subsequent send-path lookup (isEmailSuppressed) finds the address
// ---------------------------------------------------------------------------

import { emailSuppressions, webhookIdempotencyKeys } from '@eduagent/database';
// suppressEmail's direct unit contract lives in the co-located
// services/email-suppression.test.ts; here we only need the send-path lookup.
import { isEmailSuppressed } from '../services/email-suppression';

type SuppressionRow = {
  email: string;
  reason: string;
  emailId: string | null;
};

/**
 * Fake Database supporting BOTH services the route touches:
 *   - claimWebhookId: insert(webhookIdempotencyKeys)....returning()
 *   - suppressEmail:  insert(emailSuppressions)....onConflictDoNothing() [awaited]
 *   - isEmailSuppressed: select(...).from(emailSuppressions).where(...).limit(1)
 *
 * Tables are distinguished by object identity against the real Drizzle table
 * objects, so the fake mirrors the real call site exactly.
 */
function makeSuppressionDb() {
  const suppressions = new Map<string, SuppressionRow>();
  const claimed = new Set<string>();

  const db = {
    insert(table: unknown) {
      if (table === emailSuppressions) {
        let pending: SuppressionRow | null = null;
        // The builder is awaited directly (no .returning()); make it thenable
        // after .onConflictDoNothing() resolves the write.
        const builder = {
          values(vals: SuppressionRow) {
            pending = {
              email: vals.email,
              reason: vals.reason,
              emailId: vals.emailId ?? null,
            };
            return builder;
          },
          onConflictDoNothing(_o: unknown) {
            // Returns a thenable so `await db.insert(...).values(...).onConflictDoNothing(...)`
            // resolves. ON CONFLICT DO NOTHING → first write wins, repeat is no-op.
            return {
              then(resolve: (v: undefined) => void) {
                if (pending && !suppressions.has(pending.email)) {
                  suppressions.set(pending.email, pending);
                }
                resolve(undefined);
              },
            };
          },
        };
        return builder;
      }
      if (table === webhookIdempotencyKeys) {
        let key: string | null = null;
        const chain = {
          values(vals: { source: string; webhookId: string }) {
            key = `${vals.source}:${vals.webhookId}`;
            return chain;
          },
          onConflictDoNothing(_o: unknown) {
            return chain;
          },
          async returning(_cols: unknown) {
            if (key === null) return [];
            if (claimed.has(key)) return [];
            claimed.add(key);
            return [{ webhookId: key.split(':')[1] }];
          },
        };
        return chain;
      }
      throw new Error('unexpected insert target in fake DB');
    },
    select(_cols: unknown) {
      return {
        from(table: unknown) {
          if (table !== emailSuppressions) {
            throw new Error('unexpected select target in fake DB');
          }
          const q = {
            where(_predicate: unknown) {
              // We can't introspect the drizzle eq() expression here, so the
              // fake matches on the single suppressions map. The caller only
              // ever looks one address up at a time.
              return q;
            },
            async limit(_n: number) {
              // Return all rows; isEmailSuppressed only checks length > 0 and
              // the test seeds exactly the address under test.
              return [...suppressions.values()].map((r) => ({
                email: r.email,
              }));
            },
          };
          return q;
        },
      };
    },
    __suppressions: suppressions,
  };

  return db;
}

function buildAppWithSuppressionDb(db: ReturnType<typeof makeSuppressionDb>) {
  const a = new Hono();
  a.use('*', async (c, next) => {
    c.set('db' as never, db as unknown as Database);
    await next();
  });
  a.route('/', resendWebhookRoute);
  return a;
}

async function postSigned(app: Hono, body: unknown): Promise<Response> {
  const rawBody = JSON.stringify(body);
  const id = 'msg_supp_' + Math.random().toString(36).slice(2);
  const ts = nowTimestamp();
  const sig = await signPayload(rawBody, id, ts);
  return app.request(
    '/webhooks/resend',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      },
      body: rawBody,
    },
    TEST_ENV,
  );
}

describe('hard-bounce suppression persistence', () => {
  beforeEach(() => {
    (inngest.send as jest.Mock).mockClear();
  });

  it('persists a suppression row for a HARD (Permanent) bounce', async () => {
    const db = makeSuppressionDb();
    const app = buildAppWithSuppressionDb(db);

    const res = await postSigned(app, {
      type: 'email.bounced',
      data: {
        email_id: 'email_hard_001',
        to: 'Dead.Address@Example.com',
        bounce: { type: 'Permanent', subType: 'General' },
      },
    });

    expect(res.status).toBe(200);
    // RAW, lower-cased recipient must be persisted — NOT the masked form that
    // goes to Inngest. The send path matches on the real address.
    const row = db.__suppressions.get('dead.address@example.com');
    expect(row).toBeDefined();
    expect(row?.reason).toBe('hard_bounce');
    expect(row?.emailId).toBe('email_hard_001');
  });

  it('does NOT persist a suppression row for a SOFT (Transient) bounce', async () => {
    const db = makeSuppressionDb();
    const app = buildAppWithSuppressionDb(db);

    const res = await postSigned(app, {
      type: 'email.bounced',
      data: {
        email_id: 'email_soft_001',
        to: 'temporary@example.com',
        bounce: { type: 'Transient', subType: 'MailboxFull' },
      },
    });

    expect(res.status).toBe(200);
    expect(db.__suppressions.size).toBe(0);
  });

  it('does NOT persist when the bounce object is absent (defensive)', async () => {
    const db = makeSuppressionDb();
    const app = buildAppWithSuppressionDb(db);

    const res = await postSigned(app, {
      type: 'email.bounced',
      data: { email_id: 'email_nobounce', to: 'unknown@example.com' },
    });

    expect(res.status).toBe(200);
    expect(db.__suppressions.size).toBe(0);
  });

  it('persists a suppression row for a complaint (spam report)', async () => {
    const db = makeSuppressionDb();
    const app = buildAppWithSuppressionDb(db);

    const res = await postSigned(app, {
      type: 'email.complained',
      data: { email_id: 'email_complaint_001', to: 'angry@example.com' },
    });

    expect(res.status).toBe(200);
    const row = db.__suppressions.get('angry@example.com');
    expect(row).toBeDefined();
    expect(row?.reason).toBe('complaint');
  });

  it('the suppressed address is then visible to the send-path lookup', async () => {
    const db = makeSuppressionDb();
    const app = buildAppWithSuppressionDb(db);

    await postSigned(app, {
      type: 'email.bounced',
      data: {
        email_id: 'email_hard_002',
        to: 'gone@example.com',
        bounce: { type: 'Permanent' },
      },
    });

    // The real send-path guard must now report this address as suppressed.
    const suppressed = await isEmailSuppressed(
      db as unknown as Database,
      'gone@example.com',
    );
    expect(suppressed).toBe(true);
    // The un-suppressed (false) case is covered at the service level in
    // services/email-suppression.test.ts, where the fake store can isolate a
    // single address; this fake returns all rows, so a fresh-address assertion
    // here would be vacuous.
  });

  it('repeated hard bounce for the same address is idempotent (no duplicate)', async () => {
    const db = makeSuppressionDb();
    const app = buildAppWithSuppressionDb(db);

    const payload = {
      type: 'email.bounced',
      data: {
        email_id: 'email_hard_003',
        to: 'repeat@example.com',
        bounce: { type: 'Permanent' },
      },
    };
    await postSigned(app, payload);
    await postSigned(app, payload);

    expect(db.__suppressions.size).toBe(1);
    expect(db.__suppressions.has('repeat@example.com')).toBe(true);
  });
});
