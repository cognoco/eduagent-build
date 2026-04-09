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
    const { bookId, topicTitle, profileId } = filingCompletedDataSchema.parse(
      event.data
    );

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

      const topicList = existingTopics.map((t) => t.title).join(', ');

      const messages = [
        {
          role: 'system' as const,
          content: `Given a book titled "${book.title}" (${
            book.description ?? ''
          }) containing these topics: ${topicList}

The learner just completed a session on "${topicTitle}".

Suggest exactly 2 new topic titles that would be natural next steps within this book. Return ONLY valid JSON:
{ "suggestions": ["Topic A", "Topic B"] }`,
        },
      ];

      const llmResult = await routeAndCall(messages, 1);

      let jsonStr = llmResult.response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }

      const parsed = suggestionsResponseSchema.safeParse(JSON.parse(jsonStr));
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
