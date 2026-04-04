import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { profiles, type Database } from '@eduagent/database';
import { eq } from 'drizzle-orm';
import { bookTopicGenerateInputSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { notFound } from '../errors';
import {
  getBooks,
  getBookWithTopics,
  persistBookTopics,
} from '../services/curriculum';
import { generateBookTopics } from '../services/book-generation';

type BooksRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const bookRoutes = new Hono<BooksRouteEnv>()
  .get('/subjects/:subjectId/books', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');

    try {
      const books = await getBooks(db, profileId, subjectId);
      return c.json({ books });
    } catch (error) {
      if (error instanceof Error && error.message === 'Subject not found') {
        return notFound(c, 'Subject not found');
      }
      throw error;
    }
  })
  .get('/subjects/:subjectId/books/:bookId', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const bookId = c.req.param('bookId');

    try {
      const book = await getBookWithTopics(db, profileId, subjectId, bookId);
      if (!book) {
        return notFound(c, 'Book not found');
      }
      return c.json(book);
    } catch (error) {
      if (error instanceof Error && error.message === 'Subject not found') {
        return notFound(c, 'Subject not found');
      }
      throw error;
    }
  })
  .post(
    '/subjects/:subjectId/books/:bookId/generate-topics',
    zValidator('json', bookTopicGenerateInputSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const bookId = c.req.param('bookId');
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

        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.id, profileId),
        });
        const currentYear = new Date().getUTCFullYear();
        const learnerAge = profile?.birthYear
          ? Math.max(5, currentYear - profile.birthYear)
          : 12;

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

        return c.json(persisted);
      } catch (error) {
        if (error instanceof Error && error.message === 'Subject not found') {
          return notFound(c, 'Subject not found');
        }
        if (error instanceof Error && error.message === 'Book not found') {
          return notFound(c, 'Book not found');
        }
        throw error;
      }
    }
  );
