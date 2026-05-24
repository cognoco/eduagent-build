import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
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

// [BUG-392] Guard path params against non-UUID input reaching the DB layer.
const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

export const bookSuggestionRoutes = new Hono<BookSuggestionsEnv>()
  .get(
    '/subjects/:subjectId/book-suggestions',
    zValidator('param', subjectParamSchema),
    zValidator('query', pickerQuerySchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const { subjectId } = c.req.valid('param');
      const { topup } = c.req.valid('query');

      // [WI-138 / DS-049] topup=1 triggers suggestion-generation writes (LLM
      // calls + DB insert). Reads of existing suggestions remain allowed in
      // proxy mode; only the write-triggering path is gated.
      if (topup === '1') {
        assertNotProxyMode(c);
      }
      const result =
        topup === '1'
          ? await getUnpickedBookSuggestionsWithTopup(db, profileId, subjectId)
          : await getUnpickedBookSuggestionsEnvelope(db, profileId, subjectId);

      return c.json(bookSuggestionsResponseSchema.parse(result), 200);
    },
  )
  .get(
    '/subjects/:subjectId/book-suggestions/all',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const suggestions = await getAllBookSuggestions(
        c.get('db'),
        profileId,
        subjectId,
      );
      return c.json(bookSuggestionsArrayResponseSchema.parse(suggestions), 200);
    },
  );
