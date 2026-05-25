import { z } from 'zod';

/**
 * Shared response shape for the GET /v1/health endpoint.
 * Both the API route and the mobile client must use this schema —
 * never redefine it locally (BUG-753).
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  deploySha: z.string().nullable(),
  llm: z.object({
    providers: z.array(z.string()),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
