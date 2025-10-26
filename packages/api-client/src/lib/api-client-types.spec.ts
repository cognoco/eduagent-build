import { createApiClient } from './api-client.js';
import type { paths, components } from '../gen/openapi.js';

describe('API Client Type Safety (4.1.10)', () => {
  it('provides compile-time type safety for endpoints', () => {
    const client = createApiClient();

    // ✅ DEMO: TypeScript validates endpoint paths at compile time
    // These method calls compile successfully:
    expect(typeof client.GET).toBe('function');
    expect(typeof client.POST).toBe('function');

    // ❌ Would fail to compile (uncomment to test):
    // const invalidPath = client.GET('/invalid');
    // Error: Argument of type '"/invalid"' is not assignable to parameter

    // ❌ Would fail to compile (uncomment to test):
    // const wrongMethod = client.POST('/hello');
    // Error: POST method not available on '/hello' endpoint
  });

  it('enforces response shape at compile time', () => {
    // ✅ DEMO: Response types are inferred from OpenAPI spec
    // TypeScript enforces correct types at compile time:
    type HelloOperation = paths['/hello']['get'];
    type HelloResponseType =
      HelloOperation['responses']['200']['content']['application/json'];

    // This type correctly matches the schema
    const mockResponse: HelloResponseType = {
      message: 'test message',
      timestamp: 1234567890,
    };

    expect(mockResponse.message).toBe('test message');
    expect(mockResponse.timestamp).toBe(1234567890);

    // ❌ Would fail to compile (uncomment to test):
    // const invalid = mockResponse.nonExistent;
    // Error: Property 'nonExistent' does not exist on type
  });

  it('validates type extraction from generated types', () => {
    // ✅ DEMO: Can extract types from OpenAPI spec
    type HelloResponse = components['schemas']['HelloResponse'];

    const response: HelloResponse = {
      message: 'test',
      timestamp: 123456789,
    };

    expect(response.message).toBe('test');

    // ❌ Would fail to compile (uncomment to test):
    // const invalid: HelloResponse = { message: 'test' };
    // Error: Property 'timestamp' is missing
  });
});
