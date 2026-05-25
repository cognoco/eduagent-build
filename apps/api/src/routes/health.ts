import { Hono } from 'hono';
import { type HealthResponse } from '@eduagent/schemas';
import { getRegisteredProviders } from '../services/llm';

export const health = new Hono().get('/health', (c) => {
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    deploySha: env['DEPLOY_SHA'] ?? null,
    llm: { providers: getRegisteredProviders() },
  };
  return c.json(body);
});
