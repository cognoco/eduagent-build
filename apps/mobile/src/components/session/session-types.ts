import type { PendingCelebration } from '@eduagent/schemas';
import type { ChatMessage } from '../session';

export function computePaceMultiplier(
  history: Array<{ actualSeconds: number; expectedMinutes: number }>
): number {
  if (history.length < 3) return 1;
  const ratios = history
    .map(
      (entry) => entry.actualSeconds / Math.max(60, entry.expectedMinutes * 60)
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(ratios.length / 2);
  const median =
    ratios.length % 2 === 0
      ? ((ratios[middle - 1] ?? 0) + (ratios[middle] ?? 0)) / 2
      : ratios[middle] ?? 0;
  return Math.min(3, Math.max(0.5, Number(median.toFixed(2))));
}

/** SecureStore key for persisting voice/text input mode preference per profile. */
export const getInputModeKey = (profileId: string) =>
  `voice-input-mode-${profileId}`;

export function serializeMilestones(milestones: string[]): string {
  return encodeURIComponent(JSON.stringify(milestones));
}

export function serializeCelebrations(
  celebrations: PendingCelebration[]
): string {
  return encodeURIComponent(JSON.stringify(celebrations));
}

export type QuickChipId =
  | 'hint'
  | 'example'
  | 'know_this'
  | 'explain_differently'
  | 'too_easy'
  | 'too_hard'
  | 'wrong_subject'
  | 'switch_topic'
  | 'park';

export type ContextualQuickChipId = Exclude<
  QuickChipId,
  'switch_topic' | 'park' | 'wrong_subject'
>;

export type MessageFeedbackState = 'helpful' | 'not_helpful' | 'incorrect';

export interface PendingSubjectResolution {
  originalText: string;
  prompt: string;
  candidates: Array<{
    subjectId: string;
    subjectName: string;
  }>;
  /** When the classifier cannot match an enrolled subject, it suggests a new one */
  suggestedSubjectName?: string | null;
  /** Rich suggestions from subjects.resolve — shown as tappable cards */
  resolveSuggestions?: Array<{
    name: string;
    description: string;
    focus?: string;
  }>;
}

export const CONFIRMATION_BY_CHIP: Partial<
  Record<ContextualQuickChipId, string>
> = {
  hint: 'Adding a hint.',
  example: 'Pulling a fresh example.',
  know_this: 'Moving ahead.',
  explain_differently: 'Trying a different angle.',
  too_easy: 'Raising the challenge.',
  too_hard: 'Breaking it down more.',
};

export const QUICK_CHIP_CONFIG: Record<
  ContextualQuickChipId,
  {
    label: string;
    prompt: string;
    systemPrompt: string;
  }
> = {
  hint: {
    label: 'Hint',
    prompt: 'Give me a hint.',
    systemPrompt:
      'The learner tapped the hint chip. Give one short hint, not a full solution.',
  },
  example: {
    label: 'Example',
    prompt: 'Can you show a similar example?',
    systemPrompt:
      'The learner wants a fresh worked example. Use one similar example and keep it concise.',
  },
  know_this: {
    label: 'I know this',
    prompt: 'I know this part already. Can we move ahead?',
    systemPrompt:
      'The learner says they already know this. Briefly verify, then move forward or increase the challenge slightly.',
  },
  explain_differently: {
    label: 'Explain differently',
    prompt: 'Can you explain that differently?',
    systemPrompt:
      'The learner wants a different explanation. Re-explain with a new angle and one concrete example.',
  },
  too_easy: {
    label: 'Too easy',
    prompt: 'That feels too easy. Can you make it more challenging?',
    systemPrompt:
      'The learner says this is too easy. Raise the challenge a little and ask for more independent thinking.',
  },
  too_hard: {
    label: 'Too hard',
    prompt: 'That feels too hard. Can you break it down more?',
    systemPrompt:
      'The learner says this is too hard. Lower the difficulty, add more structure, and keep the next step small.',
  },
};

export const RECONNECT_PROMPT =
  'Lost connection to your session. Use the Reconnect button below to try again.';

export const TIMEOUT_PROMPT = 'Your session timed out. Please try again.';

export function isTimeoutError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'isTimeout' in error &&
    (error as { isTimeout?: unknown }).isTimeout === true
  ) {
    return true;
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('timed out while waiting');
  }
  return false;
}

export function errorHasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === status
  );
}

export function errorHasCode(error: unknown, code: string): boolean {
  if (typeof error === 'object' && error !== null) {
    // Direct .code match (e.g. QuotaExceededError.code)
    if ('code' in error && (error as { code?: unknown }).code === code) {
      return true;
    }
    // [BUG-100] ForbiddenError preserves the server's error code in .apiCode
    // (e.g. 'SUBJECT_INACTIVE') while .code stays 'FORBIDDEN' for HTTP-level typing.
    if (
      'apiCode' in error &&
      (error as { apiCode?: unknown }).apiCode === code
    ) {
      return true;
    }
  }

  if (error instanceof Error) {
    return error.message.includes(`"code":"${code}"`);
  }

  return false;
}

export function isReconnectableSessionError(error: unknown): boolean {
  // Known fatal API errors — never reconnectable
  if (
    errorHasCode(error, 'EXCHANGE_LIMIT_EXCEEDED') ||
    errorHasCode(error, 'SUBJECT_INACTIVE')
  ) {
    return false;
  }

  // BUG-355: Classify by HTTP status code FIRST — structured data is always
  // more reliable than string matching. 4xx = client error (never
  // reconnectable), 5xx = server error (reconnectable).
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
      ? ((error as { status: number }).status as number)
      : undefined;
  if (status !== undefined) {
    if (status >= 400 && status < 500) return false;
    if (status >= 500) return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  // Structured type checks — fetch throws TypeError for network failures
  // (DNS, offline, refused) and DOMException with name 'AbortError' for
  // aborted requests. These are stable across JS engines (Hermes, JSC, V8).
  if (error.name === 'TypeError' || error.name === 'AbortError') {
    return true;
  }

  // BUG-355: Last-resort message matching for RN polyfills and SSE wrappers
  // that don't use standard error types. Must run BEFORE formatApiError
  // transforms the message. Use specific phrases — bare 'network' or 'abort'
  // can false-match on unrelated API error messages.
  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('offline') ||
    message.includes('timed out') ||
    message.includes('server unreachable') ||
    message.includes('connection failed') ||
    message.includes('connection timed out') ||
    message.includes('sse connection failed')
  );
}

export function getContextualQuickChips(
  message: ChatMessage | undefined
): ContextualQuickChipId[] {
  if (!message) return [];

  const questionLike = /\?(\s|$)/.test(message.content);
  if (questionLike) {
    return ['too_hard', 'explain_differently', 'hint'];
  }

  return ['know_this', 'explain_differently', 'too_easy', 'example'];
}

// ─── Conversation Stage ─────────────────────────────────────────────────────

export type ConversationStage = 'greeting' | 'orienting' | 'teaching';

/**
 * Derives the current conversation stage from existing state.
 * Pure function — no mutable state, survives recovery resume.
 */
export function getConversationStage(
  userMessageCount: number,
  hasSubject: boolean,
  effectiveMode: string
): ConversationStage {
  // Practice, review, relearn, and homework already present assessable content
  // on the first AI response. Skip warmup stages.
  if (
    ['practice', 'review', 'relearn', 'homework', 'recitation'].includes(
      effectiveMode
    )
  ) {
    return 'teaching';
  }

  // User has sent at least 2 messages — first was greeting/subject selection,
  // second is real engagement. This check runs BEFORE hasSubject intentionally:
  // in freeform flows the progression is greeting → teaching, skipping orienting.
  if (userMessageCount >= 2) return 'teaching';

  // Subject is known but conversation hasn't warmed up yet.
  // Reachable in two cases:
  // 1. Learning mode with subject pre-set via route params (most common).
  // 2. Freeform when the first message is substantive (not a greeting) —
  //    classification sets the subject immediately, but userMessageCount is still 1.
  if (hasSubject) return 'orienting';

  // No subject, no engagement.
  return 'greeting';
}

// Anchored with ^...$ so "hi can you help me with fractions" does NOT match.
// Only pure social greetings are caught. Do not remove the anchors.
const GREETING_PATTERN =
  /^(h(i+|e+y+|ello|ola|ei|ej)|yo|sup|what'?s up|hva skjer|hei hei|ciao|salut|bonjour|hallo)\b[!?.\s]*$/i;

export function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim());
}
