// WALKING SKELETON: Delete after infrastructure validation
// Test file for health check Zod schemas
// Purpose: Validate schema definitions and TypeScript type inference

import {
  HealthCheckPingRequestSchema,
  type HealthCheckPingRequest,
  HealthCheckPingResponseSchema,
  type HealthCheckPingResponse,
  HealthCheckSchema,
  type HealthCheck,
  HealthCheckListResponseSchema,
  type HealthCheckListResponse,
} from './health.schema.js';

describe('HealthCheckPingRequestSchema', () => {
  it('should validate empty object (message is optional)', () => {
    const validData = {};

    const result = HealthCheckPingRequestSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should validate with message', () => {
    const validData = {
      message: 'Custom ping message',
    };

    const result = HealthCheckPingRequestSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject non-string message', () => {
    const invalidData = {
      message: 123,
    };

    const result = HealthCheckPingRequestSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should infer correct TypeScript type', () => {
    // Type test - this will fail at compile time if types are wrong
    const request1: HealthCheckPingRequest = {};
    const request2: HealthCheckPingRequest = {
      message: 'Test message',
    };

    expect(request1).toBeDefined();
    expect(request2).toBeDefined();
  });
});

describe('HealthCheckSchema', () => {
  it('should validate correct health check record', () => {
    const validData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Health check ping',
      timestamp: '2025-10-30T14:23:45.678Z',
    };

    const result = HealthCheckSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const invalidData = {
      id: 'not-a-uuid',
      message: 'Health check ping',
      timestamp: '2025-10-30T14:23:45.678Z',
    };

    const result = HealthCheckSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime', () => {
    const invalidData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Health check ping',
      timestamp: 'not-a-datetime',
    };

    const result = HealthCheckSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should infer correct TypeScript type', () => {
    // Type test - this will fail at compile time if types are wrong
    const healthCheck: HealthCheck = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Health check ping',
      timestamp: '2025-10-30T14:23:45.678Z',
    };

    expect(healthCheck).toBeDefined();
  });
});

describe('HealthCheckPingResponseSchema', () => {
  it('should validate response with health check record', () => {
    const validData = {
      healthCheck: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Health check ping',
        timestamp: '2025-10-30T14:23:45.678Z',
      },
    };

    const result = HealthCheckPingResponseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject response without healthCheck', () => {
    const invalidData = {};

    const result = HealthCheckPingResponseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should infer correct TypeScript type', () => {
    // Type test - this will fail at compile time if types are wrong
    const response: HealthCheckPingResponse = {
      healthCheck: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Health check ping',
        timestamp: '2025-10-30T14:23:45.678Z',
      },
    };

    expect(response).toBeDefined();
  });
});

describe('HealthCheckListResponseSchema', () => {
  it('should validate response with empty array', () => {
    const validData = {
      healthChecks: [],
    };

    const result = HealthCheckListResponseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should validate response with health check records', () => {
    const validData = {
      healthChecks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          message: 'Health check ping',
          timestamp: '2025-10-30T14:23:45.678Z',
        },
      ],
    };

    const result = HealthCheckListResponseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject response without healthChecks', () => {
    const invalidData = {};

    const result = HealthCheckListResponseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should infer correct TypeScript type', () => {
    // Type test - this will fail at compile time if types are wrong
    const response: HealthCheckListResponse = {
      healthChecks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          message: 'Health check ping',
          timestamp: '2025-10-30T14:23:45.678Z',
        },
      ],
    };

    expect(response).toBeDefined();
  });
});
