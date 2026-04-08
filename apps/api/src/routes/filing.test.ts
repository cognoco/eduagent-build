import { filingRoutes } from './filing';

describe('filing routes', () => {
  it('exports a Hono instance', () => {
    expect(filingRoutes).toBeDefined();
    expect(typeof filingRoutes.fetch).toBe('function');
  });
});
