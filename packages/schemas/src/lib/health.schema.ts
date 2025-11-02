import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Extend Zod with OpenAPI capabilities
extendZodWithOpenApi(z);

// WALKING SKELETON: Delete after infrastructure validation

/**
 * Health Check Record Schema
 *
 * Represents a single health check record from the database.
 * Matches Prisma HealthCheck model.
 */
export const HealthCheckSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: 'Unique identifier for the health check record',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    message: z.string().openapi({
      description: 'Health check message',
      example: 'Health check ping',
    }),
    timestamp: z.string().datetime().openapi({
      description: 'ISO 8601 timestamp when the health check was created',
      example: '2025-10-30T14:23:45.678Z',
    }),
  })
  .openapi('HealthCheck', {
    description: 'A single health check record from the database',
  });

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

/**
 * GET /health Response Schema
 *
 * Returns all health check records from the database.
 * Used for walking skeleton infrastructure validation.
 */
export const HealthCheckListResponseSchema = z
  .object({
    healthChecks: z.array(HealthCheckSchema),
  })
  .openapi('HealthCheckListResponse', {
    description:
      'Response containing all health check records ordered by timestamp descending',
  });

export type HealthCheckListResponse = z.infer<
  typeof HealthCheckListResponseSchema
>;

/**
 * POST /health/ping Request Schema
 *
 * Optional message for creating a new health check.
 */
export const HealthCheckPingRequestSchema = z
  .object({
    message: z.string().optional().openapi({
      description: 'Optional custom message for the health check',
      example: 'Custom ping message',
    }),
  })
  .openapi('HealthCheckPingRequest', {
    description: 'Request body for creating a health check',
  });

export type HealthCheckPingRequest = z.infer<
  typeof HealthCheckPingRequestSchema
>;

/**
 * POST /health/ping Response Schema
 *
 * Returns the created health check record.
 */
export const HealthCheckPingResponseSchema = z
  .object({
    healthCheck: HealthCheckSchema,
  })
  .openapi('HealthCheckPingResponse', {
    description: 'Response containing the created health check record',
  });

export type HealthCheckPingResponse = z.infer<
  typeof HealthCheckPingResponseSchema
>;
