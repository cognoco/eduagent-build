import { Hono } from 'hono';
import { serve } from 'inngest/hono';

import { inngest, functions } from '../inngest';
import {
  readInngestEnvBindings,
  runWithInngestRequestContext,
} from '../inngest/helpers';

const serveInngest = serve({ client: inngest, functions });

// [BUG-237] External path is /v1/inngest. This route is mounted under the
// worker's /v1 basePath in index.ts, so the local segment must stay /inngest.
// Keep the Inngest Cloud serve URL at api-{env}.mentomate.com/v1/inngest —
// adding /v1 here would expose the handler at /v1/v1/inngest instead.
//
// [BUG-242] INNGEST_SIGNING_KEY enforcement: the `serve()` helper from
// `inngest/hono` reads the signing key from `c.env.INNGEST_SIGNING_KEY` (set
// per-environment via Doppler -> Cloudflare secrets) at request time. The
// middleware in `middleware/env-validation.ts` asserts the key is present
// before any request reaches this route, so cross-env webhook replay is
// blocked by env separation alone. See env-validation tests for coverage.
export const inngestRoute = new Hono().on(
  ['GET', 'POST', 'PUT'],
  '/inngest',
  (context) =>
    runWithInngestRequestContext(readInngestEnvBindings(context.env), () =>
      serveInngest(context),
    ),
);
