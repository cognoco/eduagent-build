import { Hono } from 'hono';
import { getRegisteredProviders } from '../services/llm';

export const health = new Hono().get('/health', (c) => {
  return c.json({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    llm: { providers: getRegisteredProviders() },
  });
});
