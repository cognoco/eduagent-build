// ---------------------------------------------------------------------------
// Resend Webhook Route — Tests [BUG-29]
// ---------------------------------------------------------------------------

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockLoggerWarn = jest.fn();
jest.mock('../services/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: mockLoggerWarn,
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock(
  '../services/sentry' /* gc1-allow: Sentry is an external observability boundary — SDK calls, not internal service logic. Same pattern as routes/account.test.ts */,
  () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
  }),
);

import { Hono } from 'hono';
import { resendWebhookRoute, verifyResendSignature } from './resend-webhook';
import { inngest } from '../inngest/client';

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
    const env = { ...TEST_ENV, ENVIRONMENT: 'production' };

    const res = await makeRequest(
      { type: 'email.delivered', data: { to: 'a@b.com' } },
      {},
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
});
