import type { NowDeepLink } from '@eduagent/schemas';

export type BarIntentResult =
  | { kind: 'jump'; deepLink: NowDeepLink }
  | { kind: 'mentor'; text: string }
  | { kind: 'uncertain'; text: string };

// ---------------------------------------------------------------------------
// Name index — optional caller-supplied lookup tables for resolving NL
// references (e.g. 'resume my maths session') to confident route-catalog jumps
// when a target is uniquely identified by name.
// ---------------------------------------------------------------------------

export interface BarIntentNameEntry {
  id: string;
  name: string;
}

/**
 * Topic entries carry subjectId so that routes requiring both (retention.review,
 * challenge.start) can be constructed without an extra subject lookup.
 */
export interface BarIntentTopicEntry {
  id: string;
  name: string;
  subjectId: string;
}

export interface BarIntentNameIndex {
  subjects?: readonly BarIntentNameEntry[];
  topics?: readonly BarIntentTopicEntry[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalized(text: string): string {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function wordAfter(text: string, label: string): string | undefined {
  const match = new RegExp(`${label}\\s+([a-z0-9_-]+)`, 'i').exec(text);
  return match?.[1];
}

function hasQuestionShape(text: string): boolean {
  return /[?]$/.test(text) || /^(why|how|what|when|where|who)\b/.test(text);
}

function hasNavigationCommandShape(text: string): boolean {
  return /^(open|show|go to|take me to|bring me to|navigate to|resume|continue|view|see|review|practice|challenge|test)\b/.test(
    text,
  );
}

function hasBareNavigationTargetShape(text: string): boolean {
  return /^(?:my\s+)?(?:progress|journal|subjects|library|more)(?:\s+please)?$/.test(
    text,
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Searches for an item whose normalized name appears as a whole word in `text`.
 * - Returns the single matching item when exactly one matches.
 * - Returns `'ambiguous'` when two or more items match.
 * - Returns `'not-found'` when none match.
 *
 * Generic over T so it works for both BarIntentNameEntry and BarIntentTopicEntry.
 */
function resolveNameInText<T extends { id: string; name: string }>(
  items: readonly T[],
  text: string,
): T | 'ambiguous' | 'not-found' {
  const matches = items.filter((item) => {
    const name = normalized(item.name);
    if (!name) return false;
    // One RegExp compiled per item per call. `items` is the user's own subject
    // or topic list (bounded by tens), so this stays trivial; no need to hoist.
    return new RegExp(`\\b${escapeRegex(name)}\\b`).test(text);
  });
  if (matches.length === 0) return 'not-found';
  if (matches.length === 1) return matches[0]!;
  return 'ambiguous';
}

// ---------------------------------------------------------------------------
// NL name-index path
// ---------------------------------------------------------------------------

/**
 * Attempts to resolve a confident jump from `value` (already normalized) using
 * the caller-supplied name index.
 *
 * Returns a BarIntentResult when a confident jump can be made; returns `null`
 * to signal the caller should fall through to the existing uncertain/mentor logic.
 *
 * Invariants:
 * - Never throws.
 * - Every returned jump is valid for pushNowDeepLink (all required params present,
 *   route is in the closed catalog, ancestor chain params are present).
 */
function resolveByNameIndex(
  value: string,
  nameIndex: BarIntentNameIndex,
): BarIntentResult | 'ambiguous' | null {
  // Question-shaped input must not be intercepted as a navigation jump —
  // let it fall through to the mentor path so typed questions reach rawInput.
  if (hasQuestionShape(value)) return null;

  const subjectResult = resolveNameInText(nameIndex.subjects ?? [], value);
  const topicResult = resolveNameInText(nameIndex.topics ?? [], value);

  // Ambiguous = cannot commit to a single target → uncertain
  if (subjectResult === 'ambiguous' || topicResult === 'ambiguous') {
    return 'ambiguous';
  }

  const subject = subjectResult === 'not-found' ? null : subjectResult;
  const rawTopic = topicResult === 'not-found' ? null : topicResult;

  // A topic only counts as paired with the subject when it actually belongs to
  // it. "review maths vocabulary" where vocabulary is a French topic must not
  // emit an invalid (maths, frenchTopic) pair — drop the mismatched topic and
  // let the subject-only branch handle the subject jump (or fall through).
  const topic =
    rawTopic && subject && rawTopic.subjectId !== subject.id ? null : rawTopic;

  // NOTE: the topic-paired routes below (retention.review / challenge.start) are
  // currently unreachable from mentor.tsx, which only passes `subjects` (topics
  // are intentionally deferred at that call site). The path is provisional, kept
  // ready for when the call site supplies a topic index.
  // Both subject and topic resolved: attempt full two-param routes first
  if (subject && topic) {
    if (/\b(review|practice)\b/.test(value)) {
      return {
        kind: 'jump',
        deepLink: {
          route: 'retention.review',
          params: { subjectId: subject.id, topicId: topic.id },
          chain: ['subject.hub'],
        },
      };
    }
    if (/\b(challenge|test)\b/.test(value)) {
      return {
        kind: 'jump',
        deepLink: {
          route: 'challenge.start',
          params: { subjectId: subject.id, topicId: topic.id },
          chain: ['subject.hub'],
        },
      };
    }
    // Both resolved but no specific dual-param verb → fall back to subject hub
    return {
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: subject.id },
        chain: [],
      },
    };
  }

  // Subject resolved, no topic: navigate to subject hub for clear action verbs
  if (
    subject &&
    /\b(open|show|resume|continue|review|practice|challenge|test)\b/.test(value)
  ) {
    return {
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: subject.id },
        chain: [],
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Matches user bar input to a deterministic navigation intent.
 *
 * @param text       The raw bar input text.
 * @param nameIndex  Optional name index for resolving NL entity references
 *                   (e.g. 'resume my maths session'). When omitted, only the
 *                   literal-ID extraction path runs (backward-compatible).
 */
export function matchBarIntent(
  text: string,
  nameIndex?: BarIntentNameIndex,
): BarIntentResult {
  const trimmed = text.trim();
  const value = normalized(trimmed);

  if (!value || value.length < 8) {
    return { kind: 'uncertain', text: trimmed };
  }

  // --- Literal-ID extraction paths (unchanged) ---

  const sessionId = wordAfter(value, 'session');
  if (sessionId && /\b(continue|resume|open)\b/.test(value)) {
    return {
      kind: 'jump',
      deepLink: {
        route: 'session.resume',
        params: { sessionId },
        chain: [],
      },
    };
  }

  const subjectId = wordAfter(value, 'subject');
  const bookId = wordAfter(value, 'book');
  const topicId = wordAfter(value, 'topic');

  if (subjectId && topicId && /\b(review|practice)\b/.test(value)) {
    return {
      kind: 'jump',
      deepLink: {
        route: 'retention.review',
        params: { subjectId, topicId },
        chain: ['subject.hub'],
      },
    };
  }

  if (subjectId && topicId && /\b(challenge|test)\b/.test(value)) {
    return {
      kind: 'jump',
      deepLink: {
        route: 'challenge.start',
        params: { subjectId, topicId },
        chain: ['subject.hub'],
      },
    };
  }

  if (subjectId && bookId && topicId && /\b(open|show|go to)\b/.test(value)) {
    return {
      kind: 'jump',
      deepLink: {
        route: 'subject.topic',
        params: { subjectId, bookId, topicId },
        chain: ['subject.hub'],
      },
    };
  }

  if (subjectId && /\b(open|show|go to)\b/.test(value)) {
    return {
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId },
        chain: [],
      },
    };
  }

  // --- NL name-index path ---

  if (nameIndex) {
    const nlResult = resolveByNameIndex(value, nameIndex);
    if (nlResult === 'ambiguous') {
      return { kind: 'uncertain', text: trimmed };
    }
    if (nlResult !== null) return nlResult;
  }

  // --- Fallthrough ---

  if (hasQuestionShape(value)) {
    return { kind: 'mentor', text: trimmed };
  }

  if (hasNavigationCommandShape(value) || hasBareNavigationTargetShape(value)) {
    return { kind: 'uncertain', text: trimmed };
  }

  return { kind: 'mentor', text: trimmed };
}
