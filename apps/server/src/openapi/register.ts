import { registerHealthOpenApi } from '../routes/health.openapi';
import { registerHelloOpenApi } from '../routes/hello.openapi.js';

/**
 * OpenAPI Initialization Guard
 *
 * Prevents double-registration of OpenAPI routes.
 */
let initialized = false;

/**
 * Initialize OpenAPI Registry
 *
 * Aggregates all feature OpenAPI registrations.
 * Uses an init guard to prevent double-registration.
 *
 * This function should be called once at application startup
 * before generating the OpenAPI document.
 */
export function initOpenApi() {
  if (initialized) return;
  initialized = true;

  // Register all feature OpenAPI paths
  registerHealthOpenApi();
  registerHelloOpenApi(); // Tasks 4.1.10 & 4.1.11 validation
}
