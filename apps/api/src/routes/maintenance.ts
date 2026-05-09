import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { inngest } from '../inngest/client';

type MaintenanceEnv = {
  Bindings: {
    ENVIRONMENT?: string;
    MAINTENANCE_SECRET?: string;
  };
};

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  const digestA = await crypto.subtle.digest('SHA-256', left);
  const digestB = await crypto.subtle.digest('SHA-256', right);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);

  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= (bytesA[i] as number) ^ (bytesB[i] as number);
  }
  return diff === 0;
}

async function verifyMaintenanceSecret(c: {
  env: MaintenanceEnv['Bindings'];
  req: { header: (name: string) => string | undefined };
}): Promise<boolean> {
  const expected = c.env.MAINTENANCE_SECRET;
  const provided = c.req.header('X-Maintenance-Secret');
  if (!expected || !provided) return false;
  return constantTimeEqual(provided, expected);
}

export const maintenanceRoutes = new Hono<MaintenanceEnv>().post(
  '/maintenance/memory-facts-backfill',
  async (c) => {
    if (!(await verifyMaintenanceSecret(c))) {
      return c.json(
        {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Maintenance secret required',
        },
        403,
      );
    }

    await inngest.send({
      name: 'admin/memory-facts-backfill.requested',
      data: {
        requestedAt: new Date().toISOString(),
        environment: c.env.ENVIRONMENT ?? 'unknown',
      },
    });

    return c.json({ queued: true });
  },
);
