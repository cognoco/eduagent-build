import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import {
  createNoteInputSchema,
  updateNoteInputSchema,
  bookNotesResponseSchema,
  noteGetResponseSchema,
  topicIdsResponseSchema,
  topicNotesResponseSchema,
  noteMutationResponseSchema,
  topicSessionsResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { notFound, NotFoundError } from '../errors';
import {
  getNote,
  getNotesForBook,
  getNotesForTopic,
  createNote,
  updateNote,
  deleteNoteById,
  getTopicIdsWithNotes,
} from '../services/notes';
import { getTopicSessions } from '../services/session';

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

const noteIdParamSchema = z.object({
  noteId: z.string().uuid(),
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
        return c.json(bookNotesResponseSchema.parse({ notes }));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  // GET /subjects/:subjectId/topics/:topicId/note
  .get(
    '/subjects/:subjectId/topics/:topicId/note',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, topicId } = c.req.valid('param');

      try {
        const note = await getNote(db, profileId, subjectId, topicId);
        return c.json(noteGetResponseSchema.parse({ note }));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  // GET /notes/topic-ids — all topic IDs with notes for this profile
  .get('/notes/topic-ids', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const topicIds = await getTopicIdsWithNotes(db, profileId);
    return c.json(topicIdsResponseSchema.parse({ topicIds }));
  })
  // GET /subjects/:subjectId/topics/:topicId/notes (list all notes for topic)
  .get(
    '/subjects/:subjectId/topics/:topicId/notes',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, topicId } = c.req.valid('param');

      try {
        const notes = await getNotesForTopic(db, profileId, subjectId, topicId);
        return c.json(topicNotesResponseSchema.parse({ notes }));
      } catch (error) {
        if (error instanceof NotFoundError) return notFound(c, error.message);
        throw error;
      }
    }
  )
  // POST /subjects/:subjectId/topics/:topicId/notes
  .post(
    '/subjects/:subjectId/topics/:topicId/notes',
    zValidator('param', topicParamSchema),
    zValidator('json', createNoteInputSchema),
    async (c) => {
      // [BUG-973 / CCR-PR145-C-1] Block writes from proxy sessions.
      // A parent operating in proxy mode must not create notes on their child's profile.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, topicId } = c.req.valid('param');
      const { content, sessionId } = c.req.valid('json');

      try {
        const note = await createNote(
          db,
          profileId,
          subjectId,
          topicId,
          content,
          sessionId
        );
        return c.json(noteMutationResponseSchema.parse({ note }), 201);
      } catch (error) {
        if (error instanceof NotFoundError) return notFound(c, error.message);
        throw error;
      }
    }
  )
  // PATCH /notes/:noteId
  .patch(
    '/notes/:noteId',
    zValidator('param', noteIdParamSchema),
    zValidator('json', updateNoteInputSchema),
    async (c) => {
      // [BUG-973 / CCR-PR145-C-1] Block writes from proxy sessions.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { noteId } = c.req.valid('param');
      const { content } = c.req.valid('json');

      try {
        const note = await updateNote(db, profileId, noteId, content);
        return c.json(noteMutationResponseSchema.parse({ note }));
      } catch (error) {
        if (error instanceof NotFoundError) return notFound(c, error.message);
        throw error;
      }
    }
  )
  // DELETE /subjects/:subjectId/topics/:topicId/note
  // Back-compat endpoint for older mobile builds that delete the latest note
  // through the legacy single-note URL.
  .delete(
    '/subjects/:subjectId/topics/:topicId/note',
    zValidator('param', topicParamSchema),
    async (c) => {
      // [BUG-973 / CCR-PR145-C-1] Block writes from proxy sessions.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, topicId } = c.req.valid('param');

      try {
        const note = await getNote(db, profileId, subjectId, topicId);
        if (!note) return notFound(c, 'Note not found');

        const deleted = await deleteNoteById(db, profileId, note.id);
        if (!deleted) return notFound(c, 'Note not found');
        return c.body(null, 204);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  // DELETE /notes/:noteId
  .delete(
    '/notes/:noteId',
    zValidator('param', noteIdParamSchema),
    async (c) => {
      // [BUG-973 / CCR-PR145-C-1] Block writes from proxy sessions.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { noteId } = c.req.valid('param');

      const deleted = await deleteNoteById(db, profileId, noteId);
      if (!deleted) return notFound(c, 'Note not found');
      return c.body(null, 204);
    }
  )
  // GET /subjects/:subjectId/topics/:topicId/sessions
  .get(
    '/subjects/:subjectId/topics/:topicId/sessions',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      // subjectId is validated for URL consistency; topic ownership is
      // enforced via the subjects join inside getTopicSessions.
      const { topicId } = c.req.valid('param');

      const sessions = await getTopicSessions(db, profileId, topicId);
      return c.json(topicSessionsResponseSchema.parse({ sessions }));
    }
  );
