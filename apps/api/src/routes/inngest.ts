import { Hono } from 'hono';
import { serve } from 'inngest/hono';

import { inngest, functions } from '../inngest';

// [BUG-237] Path is /v1/inngest, not /inngest. The Inngest Cloud dashboard's
// "serve URL" for this app is api-{env}.mentomate.com/v1/inngest — keep these
// two values in lock-step or syncs/dispatches silently fall on the floor.
//
// [BUG-242] INNGEST_SIGNING_KEY enforcement: the `serve()` helper from
// `inngest/hono` reads the signing key from `c.env.INNGEST_SIGNING_KEY` (set
// per-environment via Doppler -> Cloudflare secrets) at request time. The
// middleware in `middleware/env-validation.ts` asserts the key is present
// before any request reaches this route, so cross-env webhook replay is
// blocked by env separation alone. See env-validation tests for coverage.
export const inngestRoute = new Hono().on(
  ['GET', 'POST', 'PUT'],
  '/v1/inngest',
  serve({ client: inngest, functions }),
);
