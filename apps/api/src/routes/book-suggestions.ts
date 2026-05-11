import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  getUnpickedBookSuggestionsWithTopup,
  getUnpickedBookSuggestionsEnvelope,
  getAllBookSuggestions,
} from '../services/suggestions';
import {
  bookSuggestionsResponseSchema,
  bookSuggestionsArrayResponseSchema,
} from '@eduagent/schemas';

type BookSuggestionsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const pickerQuerySchema = z.object({
  topup: z.enum(['1']).optional(),
});

export const bookSuggestionRoutes = new Hono<BookSuggestionsEnv>()
  .get(
    '/subjects/:subjectId/book-suggestions',
    zValidator('query', pickerQuerySchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const subjectId = c.req.param('subjectId');
      const { topup } = c.req.valid('query');

      const result =
        topup === '1'
          ? await getUnpickedBookSuggestionsWithTopup(db, profileId, subjectId)
          : await getUnpickedBookSuggestionsEnvelope(db, profileId, subjectId);

      return c.json(bookSuggestionsResponseSchema.parse(result), 200);
    },
  )
  .get('/subjects/:subjectId/book-suggestions/all', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const suggestions = await getAllBookSuggestions(
      c.get('db'),
      profileId,
      c.req.param('subjectId'),
    );
    return c.json(bookSuggestionsArrayResponseSchema.parse(suggestions), 200);
  });
