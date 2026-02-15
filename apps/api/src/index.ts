import { Hono } from 'hono';
import { health } from './routes/health';

const app = new Hono().basePath('/v1');

app.route('/', health);

export type AppType = typeof app;

// Default export required by Cloudflare Workers
export default app;
