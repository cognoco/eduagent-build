// WALKING SKELETON: Delete after infrastructure validation

import { registry } from '../openapi/registry';
import {
  HealthCheckListResponseSchema,
  HealthCheckPingRequestSchema,
  HealthCheckPingResponseSchema,
} from '@nx-monorepo/schemas';

/**
 * Register Health Check OpenAPI Routes
 *
 * This file defines the OpenAPI documentation for health check endpoints.
 * It follows the per-feature pattern for scalable API documentation.
 *
 * Walking skeleton validates database → server → API → web type safety.
 */
export function registerHealthOpenApi() {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'List all health check records',
    description:
      'Returns all health check records from the database, ordered by timestamp descending',
    operationId: 'getHealthChecks',
    responses: {
      200: {
        description: 'Array of health check records',
        content: {
          'application/json': {
            schema: HealthCheckListResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/health/ping',
    tags: ['Health'],
    summary: 'Create a new health check (ping)',
    description:
      'Creates a new health check record in the database with an optional custom message',
    operationId: 'pingHealthCheck',
    request: {
      body: {
        content: {
          'application/json': {
            schema: HealthCheckPingRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Health check created successfully',
        content: {
          'application/json': {
            schema: HealthCheckPingResponseSchema,
          },
        },
      },
      400: {
        description: 'Validation error - invalid request body',
      },
      500: {
        description: 'Internal server error - database operation failed',
      },
    },
  });
}
