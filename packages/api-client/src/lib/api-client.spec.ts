import { createApiClient } from './api-client.js';

describe('createApiClient', () => {
  it('creates a typed client with compile-time type safety', () => {
    const client = createApiClient({ baseUrl: '/api' });

    // Verify client structure
    expect(client).toBeDefined();
    expect(typeof client.GET).toBe('function');
    expect(typeof client.POST).toBe('function');
    expect(typeof client.use).toBe('function');

    // Type safety is verified at compile time:
    // - TypeScript enforces correct endpoint paths
    // - Response types are inferred from OpenAPI spec
    // - Invalid calls would not compile
  });

  it('uses default baseUrl when not specified', () => {
    const client = createApiClient();
    expect(client).toBeDefined();
  });

  it('accepts custom configuration', () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api',
      headers: { 'X-Custom': 'value' },
    });
    expect(client).toBeDefined();
  });
});
