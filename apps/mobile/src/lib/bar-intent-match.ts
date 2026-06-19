import type { NowDeepLink } from '@eduagent/schemas';

export type BarIntentResult =
  | { kind: 'jump'; deepLink: NowDeepLink }
  | { kind: 'mentor'; text: string }
  | { kind: 'uncertain'; text: string };

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function wordAfter(text: string, label: string): string | undefined {
  const match = new RegExp(`${label}\\s+([a-z0-9_-]+)`, 'i').exec(text);
  return match?.[1];
}

function hasQuestionShape(text: string): boolean {
  return /[?]$/.test(text) || /^(why|how|what|when|where|who)\b/.test(text);
}

export function matchBarIntent(text: string): BarIntentResult {
  const trimmed = text.trim();
  const value = normalized(trimmed);

  if (!value || value.length < 8) {
    return { kind: 'uncertain', text: trimmed };
  }

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

  if (/\b(progress|journal|subjects|library|more)\b/.test(value)) {
    return { kind: 'uncertain', text: trimmed };
  }

  if (hasQuestionShape(value)) {
    return { kind: 'mentor', text: trimmed };
  }

  return { kind: 'uncertain', text: trimmed };
}
