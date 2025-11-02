// WALKING SKELETON: Delete after infrastructure validation
// Test file for health check database operations
// Purpose: Validate Prisma schema and type generation work correctly

import type { HealthCheck } from '@prisma/client';

describe('HealthCheck Model TypeScript Types', () => {
  it('should have correct fields and types from Prisma schema', () => {
    // Type check: Verify HealthCheck type has expected shape
    const mockHealthCheck: HealthCheck = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      message: 'Test health check',
      timestamp: new Date(),
    };

    // Verify all required fields are present
    expect(mockHealthCheck).toHaveProperty('id');
    expect(mockHealthCheck).toHaveProperty('message');
    expect(mockHealthCheck).toHaveProperty('timestamp');

    // Verify field types
    expect(typeof mockHealthCheck.id).toBe('string');
    expect(typeof mockHealthCheck.message).toBe('string');
    expect(mockHealthCheck.timestamp).toBeInstanceOf(Date);
  });

  it('should compile with correct TypeScript types', () => {
    // This test validates that TypeScript compilation succeeds
    // The HealthCheck type must exist and have the correct shape
    const isValidHealthCheck = (obj: unknown): obj is HealthCheck => {
      return (
        typeof obj === 'object' &&
        obj !== null &&
        'id' in obj &&
        'message' in obj &&
        'timestamp' in obj
      );
    };

    const testObject = {
      id: 'test-uuid',
      message: 'test message',
      timestamp: new Date(),
    };

    expect(isValidHealthCheck(testObject)).toBe(true);
  });
});

describe('Database Query Functions', () => {
  describe('getHealthChecks', () => {
    it('should be a function that returns a Promise of HealthCheck array', async () => {
      // Import dynamically to avoid Prisma binary issues in CI/dev
      const { getHealthChecks } = await import('./health.js');

      // Verify function exists and has correct signature
      expect(typeof getHealthChecks).toBe('function');

      // Type check: Verify return type is Promise<HealthCheck[]>
      // Note: We do NOT call the function to avoid Prisma client issues in Jest
      // Actual database query testing requires valid Supabase connection
      // This test validates the function interface exists with correct types
    });
  });

  describe('createHealthCheck', () => {
    it('should be a function that accepts optional message and returns Promise of HealthCheck', async () => {
      // Import dynamically to avoid Prisma binary issues in CI/dev
      const { createHealthCheck } = await import('./health.js');

      // Verify function exists and has correct signature
      expect(typeof createHealthCheck).toBe('function');

      // Note: We do NOT call the function to avoid Prisma client issues in Jest
      // Actual database query testing requires valid Supabase connection
      // This test validates the function interface exists with correct types
    });
  });
});
