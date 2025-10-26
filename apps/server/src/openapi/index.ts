import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { initOpenApi } from './register';
import { buildOpenApiDocument } from './registry';

/**
 * Get OpenAPI Specification
 *
 * Initializes the OpenAPI registry (if not already initialized)
 * and generates the complete OpenAPI 3.1.0 specification.
 *
 * This function is called:
 * 1. At runtime to serve the spec via HTTP endpoints (Swagger UI, JSON)
 * 2. By the `spec-write` Nx target to write the spec to disk as a build artifact (for type generation)
 *
 * @returns Complete OpenAPI 3.1.0 document
 */
export function getOpenApiSpec(): OpenAPIObject {
  initOpenApi();
  return buildOpenApiDocument();
}
