import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { z } from 'zod';

// Extend Zod with OpenAPI capabilities
extendZodWithOpenApi(z);

/**
 * Global OpenAPI Registry
 *
 * This registry collects all route definitions from feature modules
 * and generates the complete OpenAPI specification.
 */
export const registry = new OpenAPIRegistry();

/**
 * Build OpenAPI Document
 *
 * Generates the complete OpenAPI 3.1.0 specification from all
 * registered routes and schemas.
 *
 * @returns Complete OpenAPI document
 */
export function buildOpenApiDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'NX Monorepo Template API',
      version: '1.0.0',
      description:
        'Production-ready REST API built with Express, Zod, and OpenAPI',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        identifier: 'MIT',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API base path',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Testing',
        description: 'Infrastructure testing endpoints',
      },
    ],
  });
}
