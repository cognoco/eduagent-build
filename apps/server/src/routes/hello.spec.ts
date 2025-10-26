import request from 'supertest';
import { createApp } from '../app.js';

describe('Hello API Integration (4.1.11)', () => {
  const app = createApp();

  describe('GET /api/hello', () => {
    it('should return hello message with correct structure', async () => {
      const response = await request(app)
        .get('/api/hello')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Hello, World!',
        timestamp: expect.any(Number),
      });

      // Verify timestamp is recent (within last 5 seconds)
      const now = Date.now();
      expect(response.body.timestamp).toBeGreaterThan(now - 5000);
      expect(response.body.timestamp).toBeLessThanOrEqual(now);
    });

    it('should return 404 for invalid endpoint', async () => {
      await request(app).get('/api/invalid-endpoint').expect(404);
    });
  });
});
