export * from './lib/api-client';
export type { ApiClientConfig, ApiClient } from './lib/api-client';

// Export OpenAPI types for consumers
export type { paths, components } from './gen/openapi';
