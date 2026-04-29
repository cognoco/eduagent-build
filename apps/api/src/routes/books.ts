import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import { bookTopicGenerateInputSchema, ERROR_CODES } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { notFound, NotFoundError, apiError } from '../errors';
import {
  getBooks,
  getAllProfileBooks,
  getBookWithTopics,
  persistBookTopics,
  claimBookForGeneration,
  moveTopicToBook,
} from '../services/curriculum';
import { getBookSessions } from '../services/session';
import { generateBookTopics } from '../services/book-generation';
import { getProfileAge } from '../services/profile';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';

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
  // [BUG-733 / PERF-3] Aggregate all-subjects books in a single round-trip.
  // Replaces useAllBooks N-fanout. Registered first so /library/books does
  // not collide with the param-matching /subjects/:subjectId/books handler.
  .get('/library/books', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const result = await getAllProfileBooks(db, profileId);
    return c.json(result);
  })
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
        // Atomic CAS: only one concurrent request wins the right to generate.
        // claimBookForGeneration sets topicsGenerated = true WHERE it's still false.
        const claimed = await claimBookForGeneration(
          db,
          profileId,
          subjectId,
          bookId
        );

        if (!claimed) {
          // Another request already claimed this book — return existing topics
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
          claimed.title,
          claimed.description ?? '',
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

        // Fire-and-forget: pre-generate next books in background.
        // Pre-generation is an optimization, so dispatch failure must not
        // block the response — but it MUST be observable so we can see if
        // the optimization silently stops working.
        inngest
          .send({
            name: 'app/book.topics-generated',
            data: { subjectId, bookId, profileId },
          })
          .catch((err) => {
            captureException(err, {
              profileId,
              extra: {
                event: 'app/book.topics-generated',
                subjectId,
                bookId,
              },
            });
          });

        return c.json(persisted);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )
  .get(
    '/subjects/:subjectId/books/:bookId/sessions',
    zValidator('param', bookParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { bookId } = c.req.valid('param');

      const sessions = await getBookSessions(db, profileId, bookId);
      return c.json({ sessions });
    }
  )
  // Move a topic from its current book to a different book within the same shelf.
  // Used by the long-press "Move to different book" action on the Book screen.
  .patch(
    '/subjects/:subjectId/books/:bookId/topics/:topicId/move',
    zValidator(
      'param',
      z.object({
        subjectId: z.string().uuid(),
        bookId: z.string().uuid(),
        topicId: z.string().uuid(),
      })
    ),
    zValidator('json', z.object({ targetBookId: z.string().uuid() })),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, bookId, topicId } = c.req.valid('param');
      const { targetBookId } = c.req.valid('json');

      if (bookId === targetBookId) {
        // [FIX-API-8] Use standard apiError envelope so mobile error classifier
        // can distinguish this from a network error (which also has no 'code' field).
        return apiError(
          c,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Topic is already in this book.'
        );
      }

      try {
        await moveTopicToBook(
          db,
          profileId,
          subjectId,
          bookId,
          topicId,
          targetBookId
        );
        return c.json({ moved: true, topicId, targetBookId });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  );
