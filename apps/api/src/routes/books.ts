import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import {
  bookTopicGenerateInputSchema,
  bookWithTopicsSchema,
  bookDeleteSchema,
  deleteBookResponseSchema,
  getAllProfileBooksResponseSchema,
  getBooksResponseSchema,
  getBookSessionsResponseSchema,
  moveTopicResponseSchema,
  ERROR_CODES,
  MIN_GENERATED_BOOK_TOPICS,
  type BookWithTopics,
  type BookTopicGenerationResult,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { notFound, NotFoundError, apiError } from '../errors';
import {
  getBooks,
  getAllProfileBooks,
  getBookWithTopics,
  persistBookTopics,
  claimBookForGeneration,
  releaseBookGenerationClaimIfEmpty,
  repairIncompleteBookGenerationClaim,
  moveTopicToBook,
  expandExistingBookTopics,
  generateBookTopicsWithFallback,
  deleteBook,
} from '../services/curriculum';
import { getBookSessions } from '../services/session';
import { generateBookTopics } from '../services/book-generation';
import { buildFallbackBookTopics } from '../services/book-generation-fallbacks';
import { getPersonAge } from '../services/identity-v2/helpers';
import { isIdentityV2Enabled } from '../config';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { safeSend } from '../services/safe-non-core';

type BooksRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    IDENTITY_V2_ENABLED?: string;
  };
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
    return c.json(getAllProfileBooksResponseSchema.parse(result));
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
        return c.json(getBooksResponseSchema.parse({ books }));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
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
        return c.json(bookWithTopicsSchema.parse(book));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  .delete(
    '/subjects/:subjectId/books/:bookId',
    zValidator('param', bookParamSchema),
    zValidator('json', bookDeleteSchema),
    async (c) => {
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, bookId } = c.req.valid('param');
      const { confirmStartedTopics } = c.req.valid('json');

      try {
        const result = await deleteBook(db, profileId, subjectId, bookId, {
          confirmStartedTopics,
        });
        if (!result.deleted) {
          return apiError(
            c,
            409,
            ERROR_CODES.CONFLICT,
            'This book has started topics. Confirm deletion to delete the book, its topics, and the learning history for those topics.',
            result,
          );
        }
        return c.json(deleteBookResponseSchema.parse(result));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  .post(
    '/subjects/:subjectId/books/:bookId/generate-topics',
    zValidator('param', bookParamSchema),
    zValidator('json', bookTopicGenerateInputSchema),
    async (c) => {
      // [WI-139 / DS-050] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId, bookId } = c.req.valid('param');
      const { priorKnowledge, expandExisting } = c.req.valid('json');
      const enqueueTopicsGenerated = (): void => {
        // Background, best-effort: pre-generate next books after this response.
        // Pre-generation is an optimization, so dispatch failure must not
        // block the response — but it MUST be observable so we can see if
        // the optimization silently stops working. safeSend captures failures
        // and stalls to Sentry and never throws.
        //
        // On Cloudflare Workers, background work that is neither awaited nor
        // registered via executionCtx.waitUntil can be torn down once the
        // response is sent — the dispatch (and safeSend's failure capture)
        // would then be lost. Register the promise with waitUntil so the
        // runtime keeps the worker alive until it settles, without delaying
        // the user response. Mirrors the waitUntil + fallback pattern in
        // middleware/database.ts:closeDatabaseWithFallback.
        const dispatch = safeSend(
          () =>
            inngest.send({
              name: 'app/book.topics-generated',
              data: {
                subjectId,
                bookId,
                profileId,
                timestamp: new Date().toISOString(),
              },
            }),
          'books.generate-topics.topics-generated',
          {
            profileId,
            subjectId,
            bookId,
            event: 'app/book.topics-generated',
          },
        );
        try {
          c.executionCtx.waitUntil(dispatch);
        } catch {
          // No executionCtx (e.g. test environment / non-Worker runtime).
          // safeSend never rejects, so discarding the handle is safe — there
          // is no worker to keep alive in this case.
          void dispatch;
        }
      };

      try {
        // Atomic CAS: only one concurrent request wins the right to generate.
        // claimBookForGeneration sets topicsGenerated = true WHERE it's still false.
        const claimed = await claimBookForGeneration(
          db,
          profileId,
          subjectId,
          bookId,
        );

        if (!claimed) {
          // Another request already claimed this book — return existing topics
          const existing = await getBookWithTopics(
            db,
            profileId,
            subjectId,
            bookId,
          );
          if (!existing) {
            return notFound(c, 'Book not found');
          }
          const incompleteClaimRepair =
            await repairIncompleteBookGenerationClaim(
              db,
              profileId,
              subjectId,
              bookId,
              existing,
              priorKnowledge,
              {
                generateBookTopics,
                captureException,
                // [WI-586 flip-safety] thread the cutover flag so the service
                // reads learner age from `person` (v2) vs `profiles` (legacy).
                identityV2Enabled: isIdentityV2Enabled(
                  c.env?.IDENTITY_V2_ENABLED,
                ),
              },
            );
          if (incompleteClaimRepair.status === 'repaired') {
            enqueueTopicsGenerated();
            return c.json(
              bookWithTopicsSchema.parse(incompleteClaimRepair.book),
            );
          }
          if (incompleteClaimRepair.status === 'in_progress') {
            return apiError(
              c,
              409,
              ERROR_CODES.CONFLICT,
              'Book topic generation is still in progress. Please retry shortly.',
            );
          }
          const activeTopicCount = existing.topics.filter(
            (topic) => !topic.skipped,
          ).length;
          if (expandExisting && activeTopicCount < MIN_GENERATED_BOOK_TOPICS) {
            const learnerAge = await getPersonAge(db, profileId);
            const expanded = await expandExistingBookTopics(
              db,
              profileId,
              subjectId,
              bookId,
              existing,
              priorKnowledge,
              { learnerAge, generateBookTopics, captureException },
            );
            return c.json(bookWithTopicsSchema.parse(expanded));
          }
          return c.json(bookWithTopicsSchema.parse(existing));
        }

        let persisted: BookWithTopics;
        try {
          const learnerAge = await getPersonAge(db, profileId);

          const generated: BookTopicGenerationResult =
            await generateBookTopicsWithFallback(
              claimed.title,
              claimed.description ?? '',
              learnerAge,
              priorKnowledge,
              {
                generateBookTopics,
                captureException,
                buildFallbackBookTopics,
                sentryContext: {
                  profileId,
                  extra: {
                    phase: 'book_topic_generation_fallback',
                    subjectId,
                    bookId,
                    bookTitle: claimed.title,
                  },
                },
              },
            );

          persisted = await persistBookTopics(
            db,
            profileId,
            subjectId,
            bookId,
            generated.topics,
            generated.connections,
          );
        } catch (error) {
          await releaseBookGenerationClaimIfEmpty(
            db,
            subjectId,
            bookId,
            profileId,
          );
          throw error;
        }

        enqueueTopicsGenerated();

        return c.json(bookWithTopicsSchema.parse(persisted));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  .get(
    '/subjects/:subjectId/books/:bookId/sessions',
    zValidator('param', bookParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { bookId } = c.req.valid('param');

      const sessions = await getBookSessions(db, profileId, bookId);
      return c.json(getBookSessionsResponseSchema.parse({ sessions }));
    },
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
      }),
    ),
    zValidator('json', z.object({ targetBookId: z.string().uuid() })),
    async (c) => {
      // [WI-139 / DS-050] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
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
          'Topic is already in this book.',
        );
      }

      try {
        await moveTopicToBook(
          db,
          profileId,
          subjectId,
          bookId,
          topicId,
          targetBookId,
        );
        return c.json(
          moveTopicResponseSchema.parse({ moved: true, topicId, targetBookId }),
        );
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  );
