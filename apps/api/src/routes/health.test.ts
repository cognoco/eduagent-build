import { app } from '../index';

describe('GET /v1/health', () => {
  it('returns status ok with timestamp', async () => {
    const res = await app.request('/v1/health');

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      timestamp: string;
      deploySha: string | null;
      llm: { providers: string[] };
    };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(body).toHaveProperty('deploySha');
    expect(body.llm.providers).toEqual(expect.any(Array));
  });
});
