import { bookSuggestionRoutes } from './book-suggestions';

describe('book-suggestions routes', () => {
  it('exports a Hono instance', () => {
    expect(bookSuggestionRoutes).toBeDefined();
    expect(typeof bookSuggestionRoutes.fetch).toBe('function');
  });
});
