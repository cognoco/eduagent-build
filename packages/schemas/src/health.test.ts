import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health response', () => {
    const data = {
      status: 'ok',
      timestamp: '2026-05-25T10:00:00.000Z',
      deploySha: 'abc12345',
      llm: {
        providers: ['openai'],
      },
    };

    expect(healthResponseSchema.parse(data)).toEqual(data);
  });

  it('rejects non-datetime timestamp strings', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      timestamp: 'soon',
      deploySha: null,
      llm: {
        providers: [],
      },
    });

    expect(result.success).toBe(false);
  });
});
