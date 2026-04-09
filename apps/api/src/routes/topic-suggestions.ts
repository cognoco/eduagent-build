import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getUnusedTopicSuggestions } from '../services/suggestions';

type TopicSuggestionsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const topicSuggestionRoutes = new Hono<TopicSuggestionsEnv>().get(
  '/subjects/:subjectId/books/:bookId/topic-suggestions',
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const subjectId = c.req.param('subjectId');
    const bookId = c.req.param('bookId');

    const suggestions = await getUnusedTopicSuggestions(
      db,
      profileId,
      bookId,
      subjectId
    );
    return c.json(suggestions, 200);
  }
);
