import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

const PROXY_MODE_MESSAGE = 'Not available in proxy mode';

export function assertNotProxyMode(c: Context): void {
  if (c.req.header('X-Proxy-Mode') === 'true') {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json({ message: PROXY_MODE_MESSAGE }, 403),
    });
  }
}
