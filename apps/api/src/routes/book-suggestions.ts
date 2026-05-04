import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  getUnpickedBookSuggestions,
  getAllBookSuggestions,
} from '../services/suggestions';
import { bookSuggestionsResponseSchema } from '@eduagent/schemas';

type BookSuggestionsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const bookSuggestionRoutes = new Hono<BookSuggestionsEnv>()
  .get('/subjects/:subjectId/book-suggestions', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const subjectId = c.req.param('subjectId');

    const suggestions = await getUnpickedBookSuggestions(
      db,
      profileId,
      subjectId
    );
    return c.json(bookSuggestionsResponseSchema.parse(suggestions), 200);
  })
  .get('/subjects/:subjectId/book-suggestions/all', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const subjectId = c.req.param('subjectId');

    const suggestions = await getAllBookSuggestions(db, profileId, subjectId);
    return c.json(bookSuggestionsResponseSchema.parse(suggestions), 200);
  });
