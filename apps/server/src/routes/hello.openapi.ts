// DEV: Temporary OpenAPI registration for infrastructure validation (tasks 4.1.10 & 4.1.11)
// May be removed or evolved into permanent health-check endpoint after Phase 1

import { registry } from '../openapi/registry.js';
import { HelloResponseSchema } from '@nx-monorepo/schemas';

export function registerHelloOpenApi() {
  registry.registerPath({
    method: 'get',
    path: '/hello',
    tags: ['Testing'],
    summary: 'Get hello message',
    description:
      'Infrastructure test endpoint for validating REST+OpenAPI pipeline',
    operationId: 'getHelloMessage',
    responses: {
      200: {
        description: 'Hello response',
        content: {
          'application/json': {
            schema: HelloResponseSchema,
          },
        },
      },
    },
  });
}
