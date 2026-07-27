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

  it('echoes a valid phase-probe ID as Worker-boundary proof', async () => {
    const probeId = 'd7685283-3f99-4acd-b84b-f5b62bf41648';

    const res = await app.request('/v1/health', {
      headers: { 'x-mentomate-probe-id': probeId },
    });

    expect(res.headers.get('x-mentomate-worker-probe-id')).toBe(probeId);
  });
});
