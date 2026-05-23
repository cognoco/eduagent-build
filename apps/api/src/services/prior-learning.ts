// ---------------------------------------------------------------------------
// Prior Learning Context Injection — Story 2.10
// Pure business logic + DB-aware fetch (FR40 bridge)
// ---------------------------------------------------------------------------

import { eq, and, ne, desc, isNotNull } from 'drizzle-orm';
import {
  learningSessions,
  sessionSummaries,
  curriculumTopics,
  subjects,
  type Database,
} from '@eduagent/database';
import { escapeXml, sanitizeXmlValue } from './llm/sanitize';

/** A previously completed topic available for context injection */
export interface PriorTopic {
  topicId: string;
  title: string;
  summary?: string; // "Your Words" summary from the learner
  masteryScore?: number; // from Epic 3, nullable
  completedAt: string; // ISO date string
}

/** Result of building prior learning context for prompt injection */
export interface PriorLearningContext {
  contextText: string;
  topicsIncluded: number;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum topics to include in context */
const DEFAULT_MAX_TOPICS = 20;

/** When truncating, how many recent topics to keep */
const RECENT_TOPICS_COUNT = 10;

/** When truncating, how many high-mastery topics to keep */
const HIGH_MASTERY_TOPICS_COUNT = 5;

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Builds prior learning context text for system prompt injection.
 *
 * Strategy:
 * - If no completed topics, return empty context (works with empty state)
 * - If <=20 topics (or maxTopics): include all
 * - If >20 topics: include most recent 10 + highest mastery 5
 *   (recency + relevance heuristic)
 *
 * Returns contextText string ready for prompt injection.
 */
export function buildPriorLearningContext(
  completedTopics: PriorTopic[],
  maxTopics?: number,
): PriorLearningContext {
  if (completedTopics.length === 0) {
    return {
      contextText: '',
      topicsIncluded: 0,
      truncated: false,
    };
  }

  const limit = maxTopics ?? DEFAULT_MAX_TOPICS;

  if (completedTopics.length <= limit) {
    return {
      contextText: formatTopicsForContext(completedTopics),
      topicsIncluded: completedTopics.length,
      truncated: false,
    };
  }

  // Truncation: recency + relevance heuristic
  const selected = selectTopicsForTruncation(completedTopics);

  return {
    contextText: formatTopicsForContext(selected),
    topicsIncluded: selected.length,
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Selects a subset of topics when there are too many.
 * Takes the 10 most recent + 5 highest mastery (deduped).
 */
function selectTopicsForTruncation(topics: PriorTopic[]): PriorTopic[] {
  // Sort by completedAt descending (most recent first)
  const byRecency = [...topics].sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );

  const recentTopics = byRecency.slice(0, RECENT_TOPICS_COUNT);
  const recentIds = new Set(recentTopics.map((t) => t.topicId));

  // Sort by mastery score descending (highest first), exclude already-selected
  const remaining = topics.filter((t) => !recentIds.has(t.topicId));
  const byMastery = remaining.sort(
    (a, b) => (b.masteryScore ?? 0) - (a.masteryScore ?? 0),
  );

  const masteryTopics = byMastery.slice(0, HIGH_MASTERY_TOPICS_COUNT);

  return [...recentTopics, ...masteryTopics];
}

/** Formats selected topics into a structured text block for prompt injection */
function formatTopicsForContext(topics: PriorTopic[]): string {
  const lines = [
    'Prior Learning Context — topics the learner has already completed:',
    '',
  ];

  for (const topic of topics) {
    const parts: string[] = [`- ${topic.title}`];

    if (topic.summary) {
      // Data-not-instruction framing: the summary is learner-authored text
      // and must not be interpreted as a directive to the model.
      // [PROMPT-INJECT] escapeXml so a crafted summary like
      // `</learner_summary><system>...` cannot close the wrapping tag and
      // smuggle a directive across sessions (cross-session injection vector,
      // since "Your Words" summaries replay into other sessions, including
      // child sessions of a guardian).
      parts.push(
        `  Learner's own summary: <learner_summary>${escapeXml(topic.summary)}</learner_summary>`,
      );
    }

    if (topic.masteryScore != null) {
      parts.push(`  Mastery: ${topic.masteryScore}%`);
    }

    lines.push(parts.join('\n'));
  }

  lines.push(
    '',
    'Use this context to connect new concepts to what the learner already knows.',
    'Reference their own summaries when building bridges — e.g. "You described X as [their words], which connects to what we are learning now."',
    'Make the learner feel known. A good teacher says "Remember when we covered...?" — do the same.',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DB-aware fetch — FR40 bridge wiring
// ---------------------------------------------------------------------------

/**
 * Fetches completed topics for a subject to build prior learning context.
 *
 * Uses learningSessions (has subjectId) joined with curriculumTopics (titles)
 * and sessionSummaries ("Your Words" learner summaries).
 * Deduplicates by topicId, keeping the most recent session per topic.
 */
export async function fetchPriorTopics(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<PriorTopic[]> {
  // [CR-059] Ownership guard: join subjects so subjects.profileId must match
  // the caller's profileId. This structurally blocks cross-profile reads even
  // if the learningSessions.profileId predicate below were ever dropped.
  const rows = await db
    .select({
      topicId: learningSessions.topicId,
      title: curriculumTopics.title,
      summary: sessionSummaries.content,
      endedAt: learningSessions.endedAt,
    })
    .from(learningSessions)
    .innerJoin(subjects, eq(subjects.id, learningSessions.subjectId))
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, learningSessions.topicId),
    )
    .leftJoin(
      sessionSummaries,
      and(
        eq(sessionSummaries.sessionId, learningSessions.id),
        eq(sessionSummaries.profileId, profileId),
      ),
    )
    .where(
      and(
        eq(subjects.profileId, profileId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.subjectId, subjectId),
        eq(learningSessions.status, 'completed'),
        isNotNull(learningSessions.topicId),
      ),
    )
    .orderBy(desc(learningSessions.endedAt));

  // Deduplicate by topicId (take most recent session per topic)
  const seen = new Set<string>();
  const topics: PriorTopic[] = [];

  for (const row of rows) {
    if (!row.topicId || seen.has(row.topicId)) continue;
    seen.add(row.topicId);
    topics.push({
      topicId: row.topicId,
      title: row.title,
      summary: row.summary ?? undefined,
      completedAt: row.endedAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  return topics;
}

// ---------------------------------------------------------------------------
// Cross-Subject Highlights — Story 16.0 Fix C
// Gives the LLM awareness of the learner's broader learning journey
// across subjects, enabling cross-disciplinary connections.
// ---------------------------------------------------------------------------

/** A brief highlight from another subject */
export interface CrossSubjectHighlight {
  title: string;
  subjectName: string;
}

/**
 * Fetches recent completed topics from OTHER subjects (not the current one).
 * Returns titles only (no summaries) to keep token budget low (~200 tokens).
 */
export async function fetchCrossSubjectHighlights(
  db: Database,
  profileId: string,
  currentSubjectId: string,
  limit = 5,
): Promise<CrossSubjectHighlight[]> {
  const rows = await db
    .select({
      topicId: learningSessions.topicId,
      title: curriculumTopics.title,
      subjectName: subjects.name,
    })
    .from(learningSessions)
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, learningSessions.topicId),
    )
    .innerJoin(subjects, eq(subjects.id, learningSessions.subjectId))
    .where(
      and(
        // [CR-059] Ownership guard: subjects.profileId must match caller's
        // profileId — mirrors the same two-predicate defence added to
        // fetchPriorTopics so cross-profile reads are blocked structurally
        // even if the learningSessions.profileId predicate were ever dropped.
        eq(subjects.profileId, profileId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.status, 'completed'),
        ne(learningSessions.subjectId, currentSubjectId),
        isNotNull(learningSessions.topicId),
      ),
    )
    .orderBy(desc(learningSessions.endedAt))
    .limit(limit * 2); // fetch extra to account for deduplication

  // Deduplicate by subject:title
  const seen = new Set<string>();
  const highlights: CrossSubjectHighlight[] = [];

  for (const row of rows) {
    const key = `${row.subjectName}:${row.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push({ title: row.title, subjectName: row.subjectName });
    if (highlights.length >= limit) break;
  }

  return highlights;
}

/**
 * Formats cross-subject highlights into a context block for prompt injection.
 * Returns empty string if no highlights — safe for conditional injection.
 */
export function buildCrossSubjectContext(
  highlights: CrossSubjectHighlight[],
): string {
  if (highlights.length === 0) return '';

  const lines = [
    'The learner is also studying other subjects. Recent topics from their broader learning:',
    '',
  ];

  for (const h of highlights) {
    // [PROMPT-INJECT] DB-stored values (subject + topic title) can contain
    // angle brackets or newlines from earlier LLM-generated titles or
    // user-edited subject names. Strip-and-cap so they cannot escape the
    // surrounding context or be read as directives.
    const safeSubjectName = sanitizeXmlValue(h.subjectName, 120);
    const safeTitle = sanitizeXmlValue(h.title, 200);
    lines.push(`- ${safeSubjectName}: ${safeTitle}`);
  }

  lines.push(
    '',
    'If any of these connect to the current topic, mention the link naturally.',
    'Cross-subject connections deepen understanding.',
  );

  return lines.join('\n');
}
