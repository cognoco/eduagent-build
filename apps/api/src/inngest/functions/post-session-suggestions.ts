import { eq, and, isNull, count } from 'drizzle-orm';
import { z } from 'zod';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  curriculumTopics,
  curriculumBooks,
  topicSuggestions,
  subjects,
} from '@eduagent/database';
import { routeAndCall } from '../../services/llm';
import { extractFirstJsonObject } from '../../services/llm/extract-json';
import { sanitizeXmlValue } from '../../services/llm/sanitize';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';

const logger = createLogger();

const filingCompletedDataSchema = z.object({
  bookId: z.string(),
  topicTitle: z.string(),
  profileId: z.string(),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
});

const suggestionsResponseSchema = z.object({
  suggestions: z.array(z.string().min(1).max(200)).max(2),
});

export const postSessionSuggestions = inngest.createFunction(
  {
    id: 'post-session-suggestions',
    name: 'Generate topic suggestions after filing',
  },
  { event: 'app/filing.completed' },
  async ({ event, step }) => {
    // [SWEEP-J8] safeParse so a malformed event payload doesn't throw before
    // the first step.run — bare .parse() would surface as a transient
    // function failure and Inngest would retry on a permanently-bad payload.
    // Same class as BUG-697/J-8 in ask-silent-classify.
    const validated = filingCompletedDataSchema.safeParse(event.data);
    if (!validated.success) {
      const issues = validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      logger.warn(
        '[post-session-suggestions] invalid payload — skipping retries',
        {
          issues,
        }
      );
      // Structured escalation per global "no silent recovery" rule —
      // captureException keeps the case in Sentry for queryable counts.
      captureException(
        new Error('post-session-suggestions: invalid event payload'),
        {
          extra: {
            surface: 'post-session-suggestions',
            reason: 'invalid_payload',
            issues,
          },
        }
      );
      return {
        status: 'skipped' as const,
        reason: 'invalid_payload',
        issues,
        timestamp: new Date().toISOString(),
      };
    }
    const { bookId, topicTitle, profileId } = validated.data;

    const result = await step.run('generate-suggestions', async () => {
      const db = getStepDatabase();

      const book = await db.query.curriculumBooks.findFirst({
        where: eq(curriculumBooks.id, bookId),
      });

      if (!book)
        return { status: 'skipped' as const, reason: 'book not found' };

      // Verify book belongs to the profile (defense-in-depth)
      const ownerSubject = await db.query.subjects.findFirst({
        where: and(
          eq(subjects.id, book.subjectId),
          eq(subjects.profileId, profileId)
        ),
      });
      if (!ownerSubject)
        return { status: 'skipped' as const, reason: 'ownership mismatch' };

      const existingTopics = await db.query.curriculumTopics.findMany({
        where: eq(curriculumTopics.bookId, bookId),
      });

      // Dedup: skip if >= 2 unused suggestions already exist for this book
      const existing = await db
        .select({ count: count() })
        .from(topicSuggestions)
        .where(
          and(
            eq(topicSuggestions.bookId, bookId),
            isNull(topicSuggestions.usedAt)
          )
        );
      if (existing[0] && existing[0].count >= 2) {
        return {
          status: 'skipped' as const,
          reason: 'suggestions already exist',
        };
      }

      // [PROMPT-INJECT-8] book.title, book.description, topic titles, and
      // completedTopicTitle are all learner- or LLM-generated stored text.
      // Wrap each in a named tag and sanitize before interpolation.
      const safeBookTitle = sanitizeXmlValue(book.title, 200);
      const safeBookDescription = book.description
        ? sanitizeXmlValue(book.description, 500)
        : '';
      const safeTopicList = existingTopics
        .map((t) => sanitizeXmlValue(t.title, 200))
        .filter((t) => t.length > 0)
        .join(', ');
      const safeCompletedTopicTitle = sanitizeXmlValue(topicTitle, 200);

      const messages = [
        {
          role: 'system' as const,
          content: `Given a book titled <book_title>${safeBookTitle}</book_title>${
            safeBookDescription
              ? ` (<book_description>${safeBookDescription}</book_description>)`
              : ''
          } containing these topics: ${safeTopicList}

The learner just completed a session on <completed_topic>${safeCompletedTopicTitle}</completed_topic>.

Suggest exactly 2 new topic titles that would be natural next steps within this book. Return ONLY valid JSON:
{ "suggestions": ["Topic A", "Topic B"] }`,
        },
      ];

      const llmResult = await routeAndCall(messages, 1);

      // [BUG-842 / F-SVC-009] Use canonical extractFirstJsonObject helper
      // (handles markdown fences AND brace-depth walking) instead of ad-hoc
      // fence stripping. Log parse failures with metrics so silent skips
      // surface in telemetry.
      const jsonStr = extractFirstJsonObject(llmResult.response);
      if (!jsonStr) {
        captureException(
          new Error('post-session-suggestions: no JSON in LLM response'),
          {
            extra: {
              surface: 'post-session-suggestions',
              reason: 'no_json_found',
              rawResponseLength: llmResult.response.length,
            },
          }
        );
        return {
          status: 'skipped' as const,
          reason: 'invalid_json',
        };
      }

      // [BUG-639 / J-3] JSON.parse throws SyntaxError on truncated/non-JSON
      // LLM output. Without this guard the SyntaxError propagates out of
      // step.run and Inngest retries 4 more times — each retry burns another
      // LLM call (cost waste) for a structurally permanent failure.
      let raw: unknown;
      try {
        raw = JSON.parse(jsonStr);
      } catch (err) {
        captureException(err, {
          extra: {
            surface: 'post-session-suggestions',
            reason: 'invalid_json',
            jsonStrSample: jsonStr.slice(0, 200),
          },
        });
        return {
          status: 'skipped' as const,
          reason: 'invalid_json',
        };
      }

      const parsed = suggestionsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 'skipped' as const,
          reason: 'invalid LLM response',
        };
      }
      const titles = parsed.data.suggestions;

      if (titles.length === 0) {
        return {
          status: 'skipped' as const,
          reason: 'no suggestions generated',
        };
      }

      const values = titles.map((title) => ({
        bookId,
        title,
      }));

      await db.insert(topicSuggestions).values(values);

      return { status: 'completed' as const, suggestions: titles };
    });

    return { ...result, timestamp: new Date().toISOString() };
  }
);
