import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import { upsertNoteInputSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { notFound, NotFoundError } from '../errors';
import {
  getNotesForBook,
  upsertNote,
  deleteNote,
  getTopicIdsWithNotes,
} from '../services/notes';

type NotesRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const bookParamSchema = z.object({
  subjectId: z.string().uuid(),
  bookId: z.string().uuid(),
});

const topicParamSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
});

export const noteRoutes = new Hono<NotesRouteEnv>()
  // GET /subjects/:subjectId/books/:bookId/notes
  .get(
    '/subjects/:subjectId/books/:bookId/notes',
    zValidator('param', bookParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, bookId } = c.req.valid('param');

      try {
        const notes = await getNotesForBook(db, profileId, subjectId, bookId);
        return c.json({ notes });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  // PUT /subjects/:subjectId/topics/:topicId/note
  .put(
    '/subjects/:subjectId/topics/:topicId/note',
    zValidator('param', topicParamSchema),
    zValidator('json', upsertNoteInputSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');
      const { content, append } = c.req.valid('json');

      const note = await upsertNote(db, profileId, topicId, content, append);
      return c.json({ note });
    }
  )
  // GET /notes/topic-ids — all topic IDs with notes for this profile
  .get('/notes/topic-ids', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const topicIds = await getTopicIdsWithNotes(db, profileId);
    return c.json({ topicIds });
  })
  // DELETE /subjects/:subjectId/topics/:topicId/note
  .delete(
    '/subjects/:subjectId/topics/:topicId/note',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');

      const deleted = await deleteNote(db, profileId, topicId);
      if (!deleted) {
        return notFound(c, 'Note not found');
      }
      return c.body(null, 204);
    }
  );
