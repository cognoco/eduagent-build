import { and, eq, isNull, sql, desc } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import {
  bookSuggestions,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  subjects,
} from '@eduagent/database';
import {
  bookSuggestionGenerationResultSchema,
  type ConversationLanguage,
} from '@eduagent/schemas';

import { getLanguageByCode } from '../data/languages';
import { isUniqueViolation } from './db-errors';
import { routeAndCall, extractFirstJsonObject, type ChatMessage } from './llm';
import { sanitizeXmlValue } from './llm/sanitize';
import { areEquivalentBookTitles } from './curriculum';
import { createLogger } from './logger';
import { AGE_STYLE_GUIDANCE } from './book-generation';

export const COOLDOWN_MS = 5 * 60 * 1000;
const logger = createLogger();
const RECENT_TOPIC_LIMIT = 20;
const BOOK_SUGGESTION_JSON_ATTEMPTS = 2;

type FailureReason =
  | 'quota'
  | 'network'
  | 'parse'
  | 'timeout'
  | 'lock_loser'
  | 'cooldown'
  | 'no_subject'
  | 'all_filtered'
  | 'unknown';

export type GenerationOutcome = 'success' | FailureReason;

interface BookSuggestionGenerationResult {
  suggestions: Array<{
    title: string;
    description: string;
    emoji: string;
    category: 'related' | 'explore';
  }>;
}

function sanitizeSourceNeutralDescription(description: string): string {
  return description
    .replace(
      /\b(?:early|late|mid(?:dle)?)[-\s]+(?:\d{1,2}(?:st|nd|rd|th)|twentieth|nineteenth|eighteenth|seventeenth)\s+century\b/gi,
      'the period being studied',
    )
    .replace(
      /\b(?:\d{1,2}(?:st|nd|rd|th)|twentieth|nineteenth|eighteenth|seventeenth)\s+century\b/gi,
      'the period being studied',
    )
    .replace(/\b(?:1[5-9]\d{2}|20\d{2})\b/g, 'the period being studied')
    .replace(/\b\d+(?:\.\d+)?\s*%/g, 'a measured share')
    .replace(/\b\d+(?:\.\d+)?\s*percent\b/gi, 'a measured share')
    .replace(/\bthe\s+the period being studied\b/gi, 'the period being studied')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function sanitizeBookSuggestionOutput(
  result: BookSuggestionGenerationResult,
): BookSuggestionGenerationResult {
  return {
    suggestions: result.suggestions.map((suggestion) => ({
      ...suggestion,
      description: sanitizeSourceNeutralDescription(suggestion.description),
    })),
  };
}

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

async function callBookSuggestionGenerationJson(
  messages: ChatMessage[],
  conversationLanguage?: ConversationLanguage,
): Promise<BookSuggestionGenerationResult | null> {
  let lastFailure = '';
  for (let attempt = 0; attempt < BOOK_SUGGESTION_JSON_ATTEMPTS; attempt++) {
    const attemptMessages =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: 'user' as const,
              content: [
                'The previous response failed validation.',
                'Return the requested suggestions again as valid JSON only.',
                'Do not use markdown, comments, trailing commas, or text outside the JSON object.',
                `Validation failure: ${lastFailure.slice(0, 500)}`,
              ].join('\n'),
            },
          ];

    const result = await routeAndCall(attemptMessages, 2, {
      flow: 'book.suggestion',
      responseFormat: 'json',
      conversationLanguage,
    });

    let json: unknown;
    try {
      json = extractBookSuggestionJson(result.response);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      continue;
    }

    const validated = bookSuggestionGenerationResultSchema.safeParse(json);
    if (validated.success) return sanitizeBookSuggestionOutput(validated.data);

    lastFailure =
      validated.error instanceof Error
        ? validated.error.message
        : JSON.stringify(validated.error);
  }

  return null;
}

/**
 * [WI-194] Restructured to keep the LLM call OUTSIDE any open transaction
 * and OUTSIDE the advisory lock. The previous shape held a single tx open
 * across the routeAndCall (multi-second remote call), pinning a DB
 * connection and an advisory lock for the duration of the LLM call.
 *
 * New shape:
 *   1. Short tx #1 — try advisory lock, re-check existing suggestions,
 *      reserve cooldown (write `bookSuggestionsLastGenerationAttemptedAt`),
 *      read prompt inputs (existing titles, studied topics). COMMIT.
 *      Advisory lock is released at COMMIT (xact-scoped).
 *   2. LLM call OUTSIDE any tx / lock.
 *   3. Short tx #2 — re-acquire advisory lock, re-check existing
 *      suggestions (idempotency under retry), insert results. COMMIT.
 *
 * If the LLM call throws, the cooldown reservation from step 1 has already
 * been committed, so subsequent attempts are gated by COOLDOWN_MS (existing
 * behavior — the cooldown is the rate-limit, not a retry signal).
 */
export async function generateCategorizedBookSuggestions(
  db: Database,
  profileId: string,
  subjectId: string,
  options?: { conversationLanguage?: ConversationLanguage },
): Promise<GenerationOutcome> {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (!subject) {
    emitFailureMetric(profileId, subjectId, 'no_subject');
    return 'no_subject';
  }
  const last = subject.bookSuggestionsLastGenerationAttemptedAt;
  if (last && Date.now() - last.getTime() < COOLDOWN_MS) {
    emitFailureMetric(profileId, subjectId, 'cooldown');
    return 'cooldown';
  }

  const lockKey = `book_suggestions:${profileId}:${subjectId}`;

  // ---------------------------------------------------------------------
  // Phase 1 — short tx: claim lock + reserve cooldown + read prompt inputs.
  // ---------------------------------------------------------------------
  type Phase1Reserved = {
    kind: 'reserved';
    existingBookTitles: string[];
    existingSuggestionTitles: string[];
    studiedTopics: string[];
  };
  type Phase1Outcome =
    | Phase1Reserved
    | { kind: 'short_circuit'; outcome: GenerationOutcome };

  const phase1: Phase1Outcome = await db.transaction(
    async (tx): Promise<Phase1Outcome> => {
      const lockResult = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS got`,
      );
      // Drizzle's tx.execute() return shape is driver-dependent and not part
      // of its stable surface: neon-serverless returns { rows: [...] }, while
      // some other adapters return the rows array directly. Verified against
      // drizzle-orm@neon-serverless as of 2026-05-11.
      const rows =
        (lockResult as unknown as { rows?: Array<{ got: boolean }> }).rows ??
        (lockResult as unknown as Array<{ got: boolean }>);
      if (!Array.isArray(rows) || typeof rows[0]?.got !== 'boolean') {
        throw new Error(
          'pg_try_advisory_xact_lock returned an unexpected Drizzle result shape — ' +
            'driver may have been upgraded. Inspect the shape and update the cast in ' +
            'book-suggestion-generation.ts.',
        );
      }
      if (!rows[0].got) {
        return { kind: 'short_circuit', outcome: 'lock_loser' };
      }

      const [freshSubject] = await tx
        .select({
          lastAttemptedAt: subjects.bookSuggestionsLastGenerationAttemptedAt,
        })
        .from(subjects)
        .where(
          and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
        )
        .limit(1);
      if (!freshSubject) {
        return { kind: 'short_circuit', outcome: 'no_subject' };
      }
      const freshLast = freshSubject.lastAttemptedAt;
      if (freshLast && Date.now() - freshLast.getTime() < COOLDOWN_MS) {
        return { kind: 'short_circuit', outcome: 'cooldown' };
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
      if (unpickedNow.length >= 4) {
        return { kind: 'short_circuit', outcome: 'success' };
      }

      // Reserve cooldown atomically inside the lock. Any losing caller that
      // arrives after this commit sees the updated timestamp and falls into
      // the COOLDOWN_MS branch above.
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

      return {
        kind: 'reserved',
        existingBookTitles,
        existingSuggestionTitles,
        studiedTopics,
      };
    },
  );

  if (phase1.kind === 'short_circuit') {
    if (phase1.outcome !== 'success') {
      emitFailureMetric(profileId, subjectId, phase1.outcome);
    }
    return phase1.outcome;
  }

  const { existingBookTitles, existingSuggestionTitles, studiedTopics } =
    phase1;

  // ---------------------------------------------------------------------
  // Phase 2 — LLM call OUTSIDE any open transaction or advisory lock.
  // ---------------------------------------------------------------------
  let parsed: BookSuggestionGenerationResult;
  try {
    const messages = buildPrompt({
      subjectName: subject.name,
      languageName:
        subject.pedagogyMode === 'four_strands' && subject.languageCode
          ? (getLanguageDisplayName(subject.languageCode) ?? subject.name)
          : null,
      existingBookTitles,
      existingSuggestionTitles,
      studiedTopics,
    });
    const validated = await callBookSuggestionGenerationJson(
      messages,
      options?.conversationLanguage,
    );
    if (!validated) {
      emitFailureMetric(profileId, subjectId, 'parse');
      return 'parse';
    }
    parsed = validated;
  } catch (error) {
    const reason = classifyError(error);
    emitFailureMetric(profileId, subjectId, reason);
    // [BUG-861] Only genuine transient infra blips (network/timeout) reset the
    // cooldown stamp so the learner can retry immediately. quota and unknown
    // keep the stamp — see isTransientFailure() for the full rationale. Reset
    // errors are swallowed: the primary failure reason is still returned, and
    // the stamp falling through on a reset failure is acceptable (cooldown
    // expires naturally).
    if (isTransientFailure(reason)) {
      try {
        await db
          .update(subjects)
          .set({ bookSuggestionsLastGenerationAttemptedAt: null })
          .where(
            and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
          );
      } catch {
        // Swallow reset errors — the original failure reason is the signal.
      }
    }
    return reason;
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
  if (filtered.length === 0) {
    emitFailureMetric(profileId, subjectId, 'all_filtered');
    return 'all_filtered';
  }

  // ---------------------------------------------------------------------
  // Phase 3 — short tx: re-acquire lock + re-check + insert.
  // The re-check defends against a late-arriving concurrent writer that
  // committed between Phase 1 and Phase 3 (e.g. a parallel call that
  // claimed the cooldown after we released the lock).
  // ---------------------------------------------------------------------
  return db.transaction(async (tx): Promise<GenerationOutcome> => {
    // Phase 3 has no external work, so it can wait for the short lock. A
    // try-lock loser here may only be racing a cooldown-only caller, not an
    // inserter, and returning success would drop all generated suggestions.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const unpickedNow = await tx
      .select({ id: bookSuggestions.id })
      .from(bookSuggestions)
      .where(
        and(
          eq(bookSuggestions.subjectId, subjectId),
          isNull(bookSuggestions.pickedAt),
        ),
      );
    if (unpickedNow.length >= 4) return 'success';

    // [WI-77 M3] Per-row insert with onConflictDoNothing.
    //
    // The previous shape was a single bulk `insert.values([...])` wrapped in
    // a try/catch that caught the unique-violation and returned 'success'.
    // Problem: PostgreSQL aborts the ENTIRE multi-row INSERT on first
    // constraint violation, so a single colliding title would drop all
    // non-colliding suggestions on the floor. The LLM call still ran (and
    // was billed) but the learner saw zero new suggestions.
    //
    // Using per-row INSERT ... ON CONFLICT DO NOTHING lets non-colliding
    // rows commit while colliding rows are silently skipped — the same
    // success-on-collision semantics, applied row-by-row instead of all-or-
    // nothing. .returning({ id }) lets us count what actually landed.
    //
    // The legacy catch-block fallback is kept around the loop as
    // belt-and-braces: a non-unique-violation error (e.g. FK or other) still
    // propagates; a race that surfaces a unique violation despite the ON
    // CONFLICT clause (e.g. the expression-based partial index path) is
    // still treated as success.
    const inserted: Array<{ id: string }> = [];
    try {
      for (const s of filtered) {
        const rows = await tx
          .insert(bookSuggestions)
          .values({
            subjectId,
            title: s.title,
            emoji: s.emoji,
            description: s.description,
            category: s.category,
          })
          .onConflictDoNothing()
          .returning({ id: bookSuggestions.id });
        const first = rows[0];
        if (first) inserted.push(first);
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Race surfaced a unique violation; treat as success — the row the
      // racer wrote satisfies the dedup contract.
    }
    // Zero inserts is still 'success' because the dedup contract was met
    // (every candidate already exists or was just written by a concurrent
    // racer). The LLM call legitimately produced output; we should NOT
    // refund quota.
    return 'success';
  });
}

export function buildPrompt(args: {
  subjectName: string;
  languageName?: string | null;
  existingBookTitles: string[];
  existingSuggestionTitles: string[];
  studiedTopics: string[];
}): ChatMessage[] {
  const safeName = sanitizeXmlValue(args.subjectName, 200);
  const safeLanguageName = args.languageName
    ? sanitizeXmlValue(args.languageName, 100)
    : null;
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
  const languageLine = safeLanguageName
    ? `Target language: <target_language>${safeLanguageName}</target_language>\n`
    : '';

  const noStudiedTopics = args.studiedTopics.length === 0;
  const splitInstruction = noStudiedTopics
    ? 'Return exactly 4 suggestions, all with category "explore".'
    : 'Return exactly 4 suggestions: 2 with category "related" (built on the studied topics) and 2 with category "explore" (adjacent areas the learner has not seen yet).';

  const domainInstruction = safeLanguageName
    ? `The subject is a language-learning subject. The learner is studying ${safeLanguageName}.

Language-specific rules:
- Suggestions should be practice lanes inside ${safeLanguageName}, not generic school subjects or the language name by itself.
- Prefer useful communication themes, vocabulary domains, grammar-in-context, pronunciation/listening practice, culture, media, and real-life situations.
- If the subject is Four Strands practice, make the set visibly cover all four strands across the four suggestions: meaning-focused input, meaning-focused output, language-focused learning/form, and fluency development.
- For Four Strands practice, make the strand visible in the descriptions; the fluency suggestion should use words like "fluency", "fluent", "smooth", or "natural speech".
- Titles should be concrete and pickable, like "Travel Conversations", "Music and Lyrics", or "Everyday Speaking".`
    : '';

  const rules = `Rules:
- Each suggestion has: title (1-200 chars), description (1+ chars), emoji (1+ chars), category ("related" or "explore").
- Titles MUST NOT be (case-insensitive) equivalent to any title in the EXISTING list.
- Titles MUST NOT duplicate each other.
- If the subject name or existing context says adult or 18+, use adult-learning register: direct, specific, calm, and never childish.
- Avoid tiny/novelty/remedial shelves. Do not use "Tiny", "Quick Tricks", "Basics" duplicates, "Amazing", "Wonders", sticker-like, or mascot-like framing when the existing shelf already covers basics.
- Descriptions must be source-neutral learning objectives, not factual mini-lessons. Do not include precise dates, years, century/decade labels, percentages, statistics, or unsupported factual specifics anywhere. Forbidden examples: "1914", "summer of 1914", "early 20th century", "1940s", "80%". For history/science, prefer "investigate evidence" or "compare explanations" over asserting facts that require a source.

Return ONLY valid JSON in this exact shape:
{"suggestions":[{"title":"...","description":"...","emoji":"...","category":"related"}]}`;
  const system = [
    "You are MentoMate's curriculum architect proposing fresh book-level suggestions inside an existing subject.",
    AGE_STYLE_GUIDANCE,
    splitInstruction,
    ...(domainInstruction ? [domainInstruction] : []),
    rules,
  ].join('\n\n');

  const user = `<subject_name>${safeName}</subject_name>
${languageLine}Studied topics so far:
${studied}

EXISTING titles to avoid:
${existingBlock}

Generate the suggestions now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function extractBookSuggestionJson(response: string): unknown {
  // [BUG-461] Replace greedy /\{[\s\S]*\}/ with brace-depth walker so prose
  // between two JSON blocks or markdown fences no longer produces an ill-formed
  // concatenated string.
  const jsonText = extractFirstJsonObject(response);
  if (!jsonText) throw new Error('LLM response did not contain JSON');
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const repaired = repairBookSuggestionJson(jsonText);
    if (repaired !== jsonText) {
      try {
        return JSON.parse(repaired);
      } catch {
        // Preserve the original parse error for clearer diagnostics.
      }
    }
    throw error;
  }
}

function repairBookSuggestionJson(jsonText: string): string {
  return jsonText.replace(
    /("category"\s*:\s*"(?:related|explore)")\s+[^{}[\]",]*(?=\s*})/gi,
    '$1',
  );
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

/**
 * [BUG-861] Only genuine transient infra blips (network/timeout) reset the
 * cooldown stamp. 'quota' is excluded: retrying immediately hammers an
 * already-exhausted provider and the integration test encodes this invariant
 * (cooldown must still block the second call after a quota failure). 'unknown'
 * is a catch-all that must conservatively KEEP the cooldown rather than open
 * the door to unbounded retries on unclassified errors. Deterministic failures
 * (parse, all_filtered) also keep the stamp.
 */
function isTransientFailure(reason: FailureReason): boolean {
  return reason === 'network' || reason === 'timeout';
}

function getLanguageDisplayName(languageCode: string): string | null {
  const language = getLanguageByCode(languageCode);
  const firstName = language?.names[0];
  if (!firstName) return null;
  return firstName.replace(/^./, (char) => char.toUpperCase());
}
