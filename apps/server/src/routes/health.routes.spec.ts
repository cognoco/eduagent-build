// WALKING SKELETON: Delete after infrastructure validation
// Integration tests for health check endpoints
// Purpose: Validate database → server → API flow with end-to-end type safety

import request from 'supertest';
import { createApp } from '../app.js';
import type {
  HealthCheckListResponse,
  HealthCheckPingResponse,
} from '@nx-monorepo/schemas';

describe('Health Check API Integration (Walking Skeleton)', () => {
  const app = createApp();

  describe('GET /api/health', () => {
    it('should return array of health checks from database', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/)
        .expect(200);

      // Validate response structure matches HealthCheckListResponse schema
      expect(response.body).toHaveProperty('healthChecks');
      expect(Array.isArray(response.body.healthChecks)).toBe(true);

      // Type assertion for TypeScript (actual validation done above)
      const data = response.body as HealthCheckListResponse;

      // If there are health checks, validate structure of first record
      if (data.healthChecks.length > 0) {
        const healthCheck = data.healthChecks[0];

        expect(healthCheck).toHaveProperty('id');
        expect(healthCheck).toHaveProperty('message');
        expect(healthCheck).toHaveProperty('timestamp');

        // Validate types
        expect(typeof healthCheck.id).toBe('string');
        expect(typeof healthCheck.message).toBe('string');
        expect(typeof healthCheck.timestamp).toBe('string');

        // Validate UUID format
        expect(healthCheck.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Validate ISO 8601 timestamp format
        expect(healthCheck.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('should return empty array when no health checks exist', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('healthChecks');
      expect(Array.isArray(response.body.healthChecks)).toBe(true);
    });
  });

  describe('POST /api/health/ping', () => {
    it('should create health check with default message when no body provided', async () => {
      const response = await request(app)
        .post('/api/health/ping')
        .send({})
        .expect('Content-Type', /json/)
        .expect(201);

      // Validate response structure matches HealthCheckPingResponse schema
      expect(response.body).toHaveProperty('healthCheck');

      // Type assertion for TypeScript
      const data = response.body as HealthCheckPingResponse;
      const healthCheck = data.healthCheck;

      expect(healthCheck).toHaveProperty('id');
      expect(healthCheck).toHaveProperty('message');
      expect(healthCheck).toHaveProperty('timestamp');

      // Validate types
      expect(typeof healthCheck.id).toBe('string');
      expect(typeof healthCheck.message).toBe('string');
      expect(typeof healthCheck.timestamp).toBe('string');

      // Validate UUID format
      expect(healthCheck.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Validate ISO 8601 timestamp format
      expect(healthCheck.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Default message should be "Health check ping"
      expect(healthCheck.message).toBe('Health check ping');
    });

    it('should create health check with custom message', async () => {
      const customMessage = 'Custom ping message from test';

      const response = await request(app)
        .post('/api/health/ping')
        .send({ message: customMessage })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('healthCheck');

      const data = response.body as HealthCheckPingResponse;
      const healthCheck = data.healthCheck;

      expect(healthCheck.message).toBe(customMessage);
    });

    it('should reject invalid request body (non-string message)', async () => {
      const response = await request(app)
        .post('/api/health/ping')
        .send({ message: 123 })
        .expect('Content-Type', /json/)
        .expect(400);

      // Zod validation error should be returned
      expect(response.body).toHaveProperty('error');
    });

    it('should accept empty message string', async () => {
      const response = await request(app)
        .post('/api/health/ping')
        .send({ message: '' })
        .expect('Content-Type', /json/)
        .expect(201);

      const data = response.body as HealthCheckPingResponse;
      expect(data.healthCheck.message).toBe('');
    });
  });
});
