import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';

export function assertNotProxyMode(c: Context): void {
  if (c.req.header('X-Proxy-Mode') === 'true') {
    throw new HTTPException(403, {
      res: new Response(
        JSON.stringify({ message: 'Not available in proxy mode' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    });
  }
}
