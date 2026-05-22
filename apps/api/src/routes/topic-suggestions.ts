import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getUnusedTopicSuggestions } from '../services/suggestions';
import { topicSuggestionsResponseSchema } from '@eduagent/schemas';

type TopicSuggestionsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

// [BUG-392] Guard path params against non-UUID input reaching the DB layer.
const topicSuggestionsParamSchema = z.object({
  subjectId: z.string().uuid(),
  bookId: z.string().uuid(),
});

export const topicSuggestionRoutes = new Hono<TopicSuggestionsEnv>().get(
  '/subjects/:subjectId/books/:bookId/topic-suggestions',
  zValidator('param', topicSuggestionsParamSchema),
  async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const { subjectId, bookId } = c.req.valid('param');

    const suggestions = await getUnusedTopicSuggestions(
      db,
      profileId,
      bookId,
      subjectId,
    );
    return c.json(topicSuggestionsResponseSchema.parse(suggestions), 200);
  },
);
