/**
 * Integration: Resend webhook is reachable for signature verification
 *
 * Regression for DeepSec WI-107 / WI-129 / WI-164 (WP WI-85): the Resend
 * webhook was mounted behind the global Clerk authMiddleware, so Resend/Svix
 * requests (which carry no Clerk bearer token) were rejected with 401 before
 * the route's own Svix signature verification could run.
 *
 * This must be exercised through the REAL app (with the full middleware chain).
 * The route-only fixture in apps/api/src/routes/resend-webhook.test.ts mounts no
 * auth middleware and therefore cannot catch the mounting bug.
 *
 * The fix adds '/v1/webhooks/resend' to PUBLIC_PATHS in middleware/auth.ts.
 * These tests assert that an unauthenticated request reaches the route handler
 * (its own validation/signature errors), rather than being 401'd by Clerk auth.
 */

import { app } from '../../apps/api/src/index';
import { buildIntegrationEnv } from './helpers';

const TEST_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

const TEST_ENV = {
  ...buildIntegrationEnv(),
  RESEND_WEBHOOK_SECRET: TEST_SECRET,
};

describe('Integration: Resend webhook auth bypass [WI-85]', () => {
  it('reaches the route (400 MISSING_SIGNATURE) without a Clerk token when svix headers are absent', async () => {
    // No Authorization header at all. Before the fix, authMiddleware rejects
    // with 401 UNAUTHORIZED "Missing or invalid authorization header" and the
    // route is never reached. After the fix, the route runs and returns its own
    // 400 MISSING_SIGNATURE for the missing svix headers.
    const res = await app.request(
      '/v1/webhooks/resend',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email.delivered', data: {} }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('MISSING_SIGNATURE');
  });

  it('reaches the route signature check (401 "Invalid webhook signature") without a Clerk token', async () => {
    // svix headers present but signature is bogus. Before the fix this is the
    // auth 401 ("Missing or invalid authorization header"); after the fix it is
    // the route's signature 401 ("Invalid webhook signature") — proving the
    // request reached signature verification rather than being blocked by auth.
    const res = await app.request(
      '/v1/webhooks/resend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': 'msg_test_123',
          'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
          'svix-signature': 'v1,not-a-valid-signature',
        },
        body: JSON.stringify({ type: 'email.delivered', data: {} }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toBe('Invalid webhook signature');
  });
});
