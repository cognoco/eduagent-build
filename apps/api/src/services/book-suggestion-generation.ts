import { and, eq, isNull, sql, desc } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import {
  bookSuggestions,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  subjects,
} from '@eduagent/database';
import { routeAndCall, type ChatMessage } from './llm';
import { sanitizeXmlValue } from './llm/sanitize';
import { areEquivalentBookTitles } from './curriculum';
import { bookSuggestionGenerationResultSchema } from '@eduagent/schemas';
import { createLogger } from './logger';
import { AGE_STYLE_GUIDANCE } from './book-generation';

export const COOLDOWN_MS = 5 * 60 * 1000;
const logger = createLogger();
const RECENT_TOPIC_LIMIT = 20;

type FailureReason =
  | 'quota'
  | 'network'
  | 'parse'
  | 'timeout'
  | 'lock_loser'
  | 'cooldown'
  | 'language_subject'
  | 'no_subject'
  | 'unknown';

function emitFailureMetric(
  profileId: string,
  subjectId: string,
  reason: FailureReason,
): void {
  logger.warn('book_suggestion_generation_failed', {
    metric: 'book_suggestion_generation_failed',
    profileId,
    subjectId,
    reason,
  });
}

export async function generateCategorizedBookSuggestions(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<void> {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject) {
    emitFailureMetric(profileId, subjectId, 'no_subject');
    return;
  }
  if (subject.pedagogyMode === 'four_strands') {
    emitFailureMetric(profileId, subjectId, 'language_subject');
    return;
  }
  const last = subject.bookSuggestionsLastGenerationAttemptedAt;
  if (last && Date.now() - last.getTime() < COOLDOWN_MS) {
    emitFailureMetric(profileId, subjectId, 'cooldown');
    return;
  }

  await db.transaction(async (tx) => {
    const lockKey = `book_suggestions:${profileId}:${subjectId}`;
    const lockResult = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS got`,
    );
    const rows =
      (lockResult as unknown as { rows?: Array<{ got: boolean }> }).rows ??
      (lockResult as unknown as Array<{ got: boolean }>);
    const got = Array.isArray(rows) ? rows[0]?.got : false;
    if (!got) {
      emitFailureMetric(profileId, subjectId, 'lock_loser');
      return;
    }

    const unpickedNow = await tx
      .select({ id: bookSuggestions.id })
      .from(bookSuggestions)
      .where(
        and(
          eq(bookSuggestions.subjectId, subjectId),
          isNull(bookSuggestions.pickedAt),
        ),
      );
    if (unpickedNow.length >= 4) return;

    await tx
      .update(subjects)
      .set({ bookSuggestionsLastGenerationAttemptedAt: new Date() })
      .where(
        and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
      );

    const existingBookTitles = (
      await tx
        .select({ title: curriculumBooks.title })
        .from(curriculumBooks)
        .where(eq(curriculumBooks.subjectId, subjectId))
    ).map((r) => r.title);

    const existingSuggestionTitles = (
      await tx
        .select({ title: bookSuggestions.title })
        .from(bookSuggestions)
        .where(eq(bookSuggestions.subjectId, subjectId))
    ).map((r) => r.title);

    const studiedTopics = (
      await tx
        .select({
          title: curriculumTopics.title,
          ts: learningSessions.startedAt,
        })
        .from(learningSessions)
        .innerJoin(
          curriculumTopics,
          eq(learningSessions.topicId, curriculumTopics.id),
        )
        .innerJoin(
          curriculumBooks,
          eq(curriculumTopics.bookId, curriculumBooks.id),
        )
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(
          and(
            eq(curriculumBooks.subjectId, subjectId),
            eq(subjects.profileId, profileId),
          ),
        )
        .orderBy(desc(learningSessions.startedAt))
        .limit(RECENT_TOPIC_LIMIT)
    ).map((r) => r.title);

    let parsed;
    try {
      const messages = buildPrompt({
        subjectName: subject.name,
        existingBookTitles,
        existingSuggestionTitles,
        studiedTopics,
      });
      const result = await routeAndCall(messages, 2);
      const json = extractJson(result.response);
      const validated = bookSuggestionGenerationResultSchema.safeParse(json);
      if (!validated.success) {
        emitFailureMetric(profileId, subjectId, 'parse');
        return;
      }
      parsed = validated.data;
    } catch (error) {
      const reason = classifyError(error);
      emitFailureMetric(profileId, subjectId, reason);
      return;
    }

    const blockedTitles = [...existingBookTitles, ...existingSuggestionTitles];
    const seen = new Set<string>();
    const filtered = parsed.suggestions.filter((s) => {
      if (blockedTitles.some((b) => areEquivalentBookTitles(b, s.title)))
        return false;
      const lower = s.title.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    if (filtered.length === 0) return;

    try {
      await tx.insert(bookSuggestions).values(
        filtered.map((s) => ({
          subjectId,
          title: s.title,
          emoji: s.emoji,
          description: s.description,
          category: s.category,
        })),
      );
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
  });
}

export function buildPrompt(args: {
  subjectName: string;
  existingBookTitles: string[];
  existingSuggestionTitles: string[];
  studiedTopics: string[];
}): ChatMessage[] {
  const safeName = sanitizeXmlValue(args.subjectName, 200);
  const studied =
    args.studiedTopics.length === 0
      ? '(none — learner has not studied any topics on this subject yet)'
      : args.studiedTopics
          .map((t) => `- ${sanitizeXmlValue(t, 200)}`)
          .join('\n');
  const existing = [
    ...args.existingBookTitles,
    ...args.existingSuggestionTitles,
  ];
  const existingBlock =
    existing.length === 0
      ? '(none)'
      : existing.map((t) => `- ${sanitizeXmlValue(t, 200)}`).join('\n');

  const noStudiedTopics = args.studiedTopics.length === 0;
  const splitInstruction = noStudiedTopics
    ? 'Return exactly 4 suggestions, all with category "explore".'
    : 'Return exactly 4 suggestions: 2 with category "related" (built on the studied topics) and 2 with category "explore" (adjacent areas the learner has not seen yet).';

  const system = `You are MentoMate's curriculum architect proposing fresh book-level suggestions inside an existing subject.

${AGE_STYLE_GUIDANCE}

${splitInstruction}

Rules:
- Each suggestion has: title (1-200 chars), description (1+ chars), emoji (1+ chars), category ("related" or "explore").
- Titles MUST NOT be (case-insensitive) equivalent to any title in the EXISTING list.
- Titles MUST NOT duplicate each other.

Return ONLY valid JSON in this exact shape:
{"suggestions":[{"title":"...","description":"...","emoji":"...","category":"related"}]}`;

  const user = `<subject_name>${safeName}</subject_name>
Studied topics so far:
${studied}

EXISTING titles to avoid:
${existingBlock}

Generate the suggestions now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function extractJson(response: string): unknown {
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error('LLM response did not contain JSON');
  return JSON.parse(objectMatch[0]);
}

function classifyError(error: unknown): FailureReason {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('quota') || lower.includes('rate limit')) return 'quota';
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'timeout';
  if (lower.includes('json') || lower.includes('parse')) return 'parse';
  if (lower.includes('network') || lower.includes('fetch')) return 'network';
  return 'unknown';
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '23505';
}
