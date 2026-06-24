import i18next from 'i18next';
import type { PendingCelebration } from '@eduagent/schemas';
import type { ChatMessage } from './ChatShell';
import { sanitizeSecureStoreKey } from '../../lib/secure-storage';

export function computePaceMultiplier(
  history: Array<{ actualSeconds: number; expectedMinutes: number }>,
): number {
  if (history.length < 3) return 1;
  const ratios = history
    .map(
      (entry) => entry.actualSeconds / Math.max(60, entry.expectedMinutes * 60),
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(ratios.length / 2);
  const median =
    ratios.length % 2 === 0
      ? ((ratios[middle - 1] ?? 0) + (ratios[middle] ?? 0)) / 2
      : (ratios[middle] ?? 0);
  return Math.min(3, Math.max(0.5, Number(median.toFixed(2))));
}

/** SecureStore key for persisting voice/text input mode preference per profile.
 *  [I-4] profileId is sanitized so iOS doesn't crash on unsafe characters. */
export const getInputModeKey = (profileId: string) =>
  sanitizeSecureStoreKey(`voice-input-mode-${profileId}`);

export function serializeMilestones(milestones: string[]): string {
  return encodeURIComponent(JSON.stringify(milestones));
}

export function serializeCelebrations(
  celebrations: PendingCelebration[],
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

// [WI-982] Re-export from shared schema contract so mobile and API share a
// single source of truth. Before this change both defined the union locally;
// the API's strict z.discriminatedUnion now validates .value against
// messageFeedbackStateSchema, so any drift would produce silent 400s.
export type { MessageFeedbackState } from '@eduagent/schemas';

export interface PendingSubjectResolution {
  originalText: string;
  prompt: string;
  candidates: Array<{
    subjectId: string;
    subjectName: string;
  }>;
  /** Preserve a homework image while the learner picks/creates the subject. */
  attachImage?: boolean;
  imageAttachment?: {
    base64: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  };
  /** When the classifier cannot match an enrolled subject, it suggests a new one */
  suggestedSubjectName?: string | null;
  /** Rich suggestions from subjects.resolve — shown as tappable cards */
  resolveSuggestions?: Array<{
    name: string;
    description: string;
    focus?: string;
  }>;
}

export function chipConfirmationMessage(id: ContextualQuickChipId): string {
  switch (id) {
    case 'hint':
      return i18next.t('session.quickChips.hintConfirm');
    case 'example':
      return i18next.t('session.quickChips.exampleConfirm');
    case 'know_this':
      return i18next.t('session.quickChips.knowThisConfirm');
    case 'explain_differently':
      return i18next.t('session.quickChips.explainDifferentlyConfirm');
    case 'too_easy':
      return i18next.t('session.quickChips.tooEasyConfirm');
    case 'too_hard':
      return i18next.t('session.quickChips.tooHardConfirm');
  }
}

export function quickChipLabel(id: ContextualQuickChipId): string {
  switch (id) {
    case 'hint':
      return i18next.t('session.quickChips.hintLabel');
    case 'example':
      return i18next.t('session.quickChips.exampleLabel');
    case 'know_this':
      return i18next.t('session.quickChips.knowThisLabel');
    case 'explain_differently':
      return i18next.t('session.quickChips.explainDifferentlyLabel');
    case 'too_easy':
      return i18next.t('session.quickChips.tooEasyLabel');
    case 'too_hard':
      return i18next.t('session.quickChips.tooHardLabel');
  }
}

// WI-373: the per-chip `systemPrompt` steering strings moved server-side
// (apps/api/src/services/session/system-prompt-intents.ts). The client now
// sends a `quick_chip` intent token and never authors system-role text.
// The prompt is the user-visible chat message sent on the learner's behalf,
// so it renders in the learner's conversation language.
export function quickChipPrompt(id: ContextualQuickChipId): string {
  switch (id) {
    case 'hint':
      return i18next.t('session.quickChips.hintPrompt');
    case 'example':
      return i18next.t('session.quickChips.examplePrompt');
    case 'know_this':
      return i18next.t('session.quickChips.knowThisPrompt');
    case 'explain_differently':
      return i18next.t('session.quickChips.explainDifferentlyPrompt');
    case 'too_easy':
      return i18next.t('session.quickChips.tooEasyPrompt');
    case 'too_hard':
      return i18next.t('session.quickChips.tooHardPrompt');
  }
}

// BUG-151: Copy must not promise a "Reconnect button below" verbatim — the
// affordance is a Reconnect chip rendered next to the failing message only
// when the error is reconnectable. Phrase the prompt so it works regardless
// of which path surfaces it and so it doesn't reference UI that may not be
// visible.
export function reconnectPrompt(): string {
  return i18next.t('session.streamErrors.reconnect');
}

export function timeoutPrompt(): string {
  return i18next.t('session.streamErrors.timeout');
}

export function serverErrorPrompt(): string {
  return i18next.t('session.streamErrors.serverError');
}

export function configErrorPrompt(): string {
  return i18next.t('session.streamErrors.configError');
}

export function reconnectPromptForError(error: unknown): string {
  if (isTimeoutError(error)) return timeoutPrompt();

  if (error instanceof Error) {
    if (error.name === 'UpstreamError') return serverErrorPrompt();
    // CORS or server misconfiguration — surface config-error prompt so the
    // user knows a retry is unlikely to help (matches use-session-streaming
    // comment: "CORS/config → config error").
    if (error.name === 'ConfigError') return configErrorPrompt();
    if (error.name === 'NetworkError' || error.name === 'TypeError')
      return reconnectPrompt();
  }

  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
      ? ((error as { status: number }).status as number)
      : undefined;

  if (status !== undefined && status >= 500) return serverErrorPrompt();

  return reconnectPrompt();
}

export function isTimeoutError(error: unknown): boolean {
  // [BUG-389] Classify by the stable `isTimeout` property set by sse.ts —
  // never string-match on the formatted message. The property is always set by
  // the idle-timer path in sse.ts (see IDLE_TIMEOUT_MS handler). Message-text
  // matching is the classify-after-format anti-pattern: the text can change
  // with i18n or copy updates, breaking classification silently.
  if (
    typeof error === 'object' &&
    error !== null &&
    'isTimeout' in error &&
    (error as { isTimeout?: unknown }).isTimeout === true
  ) {
    return true;
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
    // (e.g. 'SUBJECT_INACTIVE'). The HTTP-level FORBIDDEN marker lives on .errorCode.
    if (
      'apiCode' in error &&
      (error as { apiCode?: unknown }).apiCode === code
    ) {
      return true;
    }
  }

  // [BUG-389] No string-matching on error.message. The api-client boundary
  // (customFetch, classifyXhrError, assertOk) always sets a typed .code or
  // .apiCode property. Matching `"code":"${code}"` inside message text is the
  // classify-after-format antipattern — the message may have already been
  // transformed by formatApiError, or may contain unrelated JSON fragments.
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
  message: ChatMessage | undefined,
  opts: { challengeRoundInFlight?: boolean } = {},
): ContextualQuickChipId[] {
  if (!message) return [];

  const questionLike = /\?(\s|$)/.test(message.content);
  const chips: ContextualQuickChipId[] = questionLike
    ? ['too_hard', 'explain_differently', 'hint']
    : ['know_this', 'explain_differently', 'too_easy', 'example'];

  return opts.challengeRoundInFlight
    ? chips.filter((chip) => chip !== 'too_easy')
    : chips;
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
  effectiveMode: string,
): ConversationStage {
  // Review, relearn, and homework already present assessable content
  // on the first AI response. Skip warmup stages.
  // 'practice' is the legacy alias for 'review' (renamed 2026-05-06) — kept here
  // so persisted/deep-linked sessions with the old literal stay on the teaching
  // path, matching `normalizeModeForConfig` in sessionModeConfig.ts.
  if (
    ['review', 'practice', 'relearn', 'homework', 'recitation'].includes(
      effectiveMode,
    )
  ) {
    return 'teaching';
  }

  // User has sent at least 2 messages — first was greeting/subject selection,
  // second is real engagement. This check runs BEFORE hasSubject intentionally:
  // in freeform flows the progression is greeting → teaching, skipping orienting.
  if (userMessageCount >= 2) return 'teaching';

  // Routed learning sessions already know the subject/topic. Once the learner
  // sends a real message, the assistant response should expose learning-loop
  // actions instead of staying in the warmup-only stage.
  if (effectiveMode === 'learning' && hasSubject && userMessageCount >= 1) {
    return 'teaching';
  }

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
