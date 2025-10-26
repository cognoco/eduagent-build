import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Extend Zod with OpenAPI capabilities
extendZodWithOpenApi(z);

/**
 * Health Check Response Schema
 *
 * Used for the walking skeleton health check endpoint.
 * This is temporary feature code and will be removed after Phase 1.
 */
export const HealthResponseSchema = z
  .object({
    status: z.literal('ok').openapi({
      description: 'Server operational status',
      example: 'ok',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp of the response',
      example: 1729800000000,
    }),
    message: z.string().openapi({
      description: 'Human-readable status message',
      example: 'Server is running',
    }),
  })
  .openapi('HealthCheckResponse', {
    description: 'Health check response indicating server operational status',
  });

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
