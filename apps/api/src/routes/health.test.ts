import app from '../index';

describe('GET /v1/health', () => {
  it('returns status ok with timestamp', async () => {
    const res = await app.request('/v1/health');

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});
