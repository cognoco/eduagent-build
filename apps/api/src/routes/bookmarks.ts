import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import {
  createBookmarkSchema,
  bookmarkListResponseSchema,
  sessionBookmarkListResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  listSessionBookmarks,
} from '../services/bookmarks';

type BookmarkRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const bookmarkIdParamSchema = z.object({
  id: z.string().uuid(),
});

const bookmarkListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  subjectId: z.string().uuid().optional(),
});

const sessionBookmarksQuerySchema = z.object({
  sessionId: z.string().uuid(),
});

export const bookmarkRoutes = new Hono<BookmarkRouteEnv>()
  .post('/bookmarks', zValidator('json', createBookmarkSchema), async (c) => {
    const bookmark = await createBookmark(
      c.get('db'),
      requireProfileId(c.get('profileId')),
      c.req.valid('json').eventId
    );

    return c.json({ bookmark }, 201);
  })
  .get(
    '/bookmarks/session',
    zValidator('query', sessionBookmarksQuerySchema),
    async (c) => {
      const bookmarks = await listSessionBookmarks(
        c.get('db'),
        requireProfileId(c.get('profileId')),
        c.req.valid('query').sessionId
      );

      return c.json(sessionBookmarkListResponseSchema.parse({ bookmarks }));
    }
  )
  .get(
    '/bookmarks',
    zValidator('query', bookmarkListQuerySchema),
    async (c) => {
      const { cursor, limit, subjectId } = c.req.valid('query');
      const result = await listBookmarks(
        c.get('db'),
        requireProfileId(c.get('profileId')),
        { cursor, limit, subjectId }
      );

      return c.json(bookmarkListResponseSchema.parse(result));
    }
  )
  .delete(
    '/bookmarks/:id',
    zValidator('param', bookmarkIdParamSchema),
    async (c) => {
      await deleteBookmark(
        c.get('db'),
        requireProfileId(c.get('profileId')),
        c.req.valid('param').id
      );

      return c.body(null, 204);
    }
  );
