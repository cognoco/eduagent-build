import { topicSuggestionRoutes } from './topic-suggestions';

describe('topic-suggestions routes', () => {
  it('exports a Hono instance', () => {
    expect(topicSuggestionRoutes).toBeDefined();
  });
});
