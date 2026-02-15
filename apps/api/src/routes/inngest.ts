import { Hono } from 'hono';
import { serve } from 'inngest/hono';

import { inngest, functions } from '../inngest';

export const inngestRoute = new Hono().on(
  ['GET', 'POST', 'PUT'],
  '/inngest',
  serve({ client: inngest, functions })
);
