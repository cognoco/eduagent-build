import { Hono } from 'hono';
import { getRegisteredProviders } from '../services/llm';

export const health = new Hono().get('/health', (c) => {
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  return c.json({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    deploySha: env['DEPLOY_SHA'] ?? null,
    llm: { providers: getRegisteredProviders() },
  });
});
