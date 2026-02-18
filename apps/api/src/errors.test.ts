import { Hono } from 'hono';
import type { Context } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import {
  apiError,
  notFound,
  unauthorized,
  forbidden,
  validationError,
} from './errors';

function createTestApp(handler: (c: Context) => Response | Promise<Response>) {
  const app = new Hono();
  app.get('/test', handler);
  return app;
}

describe('error helpers', () => {
  describe('apiError', () => {
    it('returns JSON with code and message', async () => {
      const app = createTestApp((c) =>
        apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, 'Something went wrong')
      );
      const res = await app.request('/test');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Something went wrong',
      });
    });

    it('includes details when provided', async () => {
      const app = createTestApp((c) =>
        apiError(c, 422, ERROR_CODES.NOT_FOUND, 'With details', {
          field: 'name',
        })
      );
      const res = await app.request('/test');

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.NOT_FOUND,
        message: 'With details',
        details: { field: 'name' },
      });
    });

    it('omits details when undefined', async () => {
      const app = createTestApp((c) =>
        apiError(c, 500, ERROR_CODES.INTERNAL_ERROR, 'No details here')
      );
      const res = await app.request('/test');

      const body = await res.json();
      expect(body).not.toHaveProperty('details');
    });
  });

  describe('notFound', () => {
    it('returns 404 with default message', async () => {
      const app = createTestApp((c) => notFound(c));
      const res = await app.request('/test');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Resource not found',
      });
    });

    it('returns 404 with custom message', async () => {
      const app = createTestApp((c) => notFound(c, 'User not found'));
      const res = await app.request('/test');

      const body = await res.json();
      expect(body.message).toBe('User not found');
    });
  });

  describe('unauthorized', () => {
    it('returns 401 with default message', async () => {
      const app = createTestApp((c) => unauthorized(c));
      const res = await app.request('/test');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required',
      });
    });
  });

  describe('forbidden', () => {
    it('returns 403 with default message', async () => {
      const app = createTestApp((c) => forbidden(c));
      const res = await app.request('/test');

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Insufficient permissions',
      });
    });
  });

  describe('validationError', () => {
    it('returns 400 with details', async () => {
      const details = { name: ['Required'] };
      const app = createTestApp((c) => validationError(c, details));
      const res = await app.request('/test');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: { name: ['Required'] },
      });
    });
  });
});
