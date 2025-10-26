import { registry } from '../openapi/registry';
import { HealthResponseSchema } from '@nx-monorepo/schemas';

/**
 * Register Health Check OpenAPI Routes
 *
 * This file defines the OpenAPI documentation for health check endpoints.
 * It follows the per-feature pattern for scalable API documentation.
 *
 * NOTE: This is walking skeleton code and will be removed after Phase 1.
 */
export function registerHealthOpenApi() {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Get server health status',
    description: 'Returns the current health status of the API server',
    operationId: 'getHealthStatus',
    responses: {
      200: {
        description: 'Server is healthy',
        content: {
          'application/json': {
            schema: HealthResponseSchema,
          },
        },
      },
    },
  });
}
