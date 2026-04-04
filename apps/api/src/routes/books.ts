import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import { bookTopicGenerateInputSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { notFound, NotFoundError } from '../errors';
import {
  getBooks,
  getBookWithTopics,
  persistBookTopics,
} from '../services/curriculum';
import { generateBookTopics } from '../services/book-generation';
import { getProfileAge } from '../services/profile';
import { inngest } from '../inngest/client';

type BooksRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

const bookParamSchema = z.object({
  subjectId: z.string().uuid(),
  bookId: z.string().uuid(),
});

export const bookRoutes = new Hono<BooksRouteEnv>()
  .get(
    '/subjects/:subjectId/books',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');

      try {
        const books = await getBooks(db, profileId, subjectId);
        return c.json({ books });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  .get(
    '/subjects/:subjectId/books/:bookId',
    zValidator('param', bookParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, bookId } = c.req.valid('param');

      try {
        const book = await getBookWithTopics(db, profileId, subjectId, bookId);
        if (!book) {
          return notFound(c, 'Book not found');
        }
        return c.json(book);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  .post(
    '/subjects/:subjectId/books/:bookId/generate-topics',
    zValidator('param', bookParamSchema),
    zValidator('json', bookTopicGenerateInputSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, bookId } = c.req.valid('param');
      const { priorKnowledge } = c.req.valid('json');

      try {
        const books = await getBooks(db, profileId, subjectId);
        const book = books.find((entry) => entry.id === bookId);
        if (!book) {
          return notFound(c, 'Book not found');
        }

        if (book.topicsGenerated) {
          const existing = await getBookWithTopics(
            db,
            profileId,
            subjectId,
            bookId
          );
          if (!existing) {
            return notFound(c, 'Book not found');
          }
          return c.json(existing);
        }

        const learnerAge = await getProfileAge(db, profileId);

        const generated = await generateBookTopics(
          book.title,
          book.description ?? '',
          learnerAge,
          priorKnowledge
        );

        const persisted = await persistBookTopics(
          db,
          profileId,
          subjectId,
          bookId,
          generated.topics,
          generated.connections
        );

        // Fire-and-forget: pre-generate next books in background
        inngest
          .send({
            name: 'app/book.topics-generated',
            data: { subjectId, bookId, profileId },
          })
          .catch(() => {
            // Non-critical — pre-generation is an optimization
          });

        return c.json(persisted);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  );
