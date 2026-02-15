// ---------------------------------------------------------------------------
// Prior Learning Context Injection — Story 2.10
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

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
  maxTopics?: number
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
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  const recentTopics = byRecency.slice(0, RECENT_TOPICS_COUNT);
  const recentIds = new Set(recentTopics.map((t) => t.topicId));

  // Sort by mastery score descending (highest first), exclude already-selected
  const remaining = topics.filter((t) => !recentIds.has(t.topicId));
  const byMastery = remaining.sort(
    (a, b) => (b.masteryScore ?? 0) - (a.masteryScore ?? 0)
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
      parts.push(`  Learner summary: "${topic.summary}"`);
    }

    if (topic.masteryScore != null) {
      parts.push(`  Mastery: ${topic.masteryScore}%`);
    }

    lines.push(parts.join('\n'));
  }

  lines.push(
    '',
    'Use this context to connect new concepts to what the learner already knows.',
    'Reference their own summaries when building bridges to new material.'
  );

  return lines.join('\n');
}
