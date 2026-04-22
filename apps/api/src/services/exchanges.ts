import {
  routeAndCall,
  routeAndStream,
  parseEnvelope,
  teeEnvelopeStream,
} from './llm';
import type {
  ChatMessage,
  EscalationRung,
  MessagePart,
  RouteResult,
  StreamResult,
} from './llm';
import { createLogger } from './logger';
import {
  type LearningMode,
  type HomeworkMode,
  type InputMode,
  type SessionType,
  type ConversationLanguage,
  type VerificationType,
} from '@eduagent/schemas';
import type { LLMTier } from './subscription';
import {
  buildSystemPrompt as _buildSystemPrompt,
  resolveAgeBracket,
} from './exchange-prompts';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Multimodal image support — IMG-VISION
// ---------------------------------------------------------------------------

export interface ImageData {
  base64: string;
  mimeType: string;
}

export function buildUserContent(
  userMessage: string,
  imageData?: ImageData
): string | MessagePart[] {
  if (!imageData) return userMessage;
  return [
    {
      type: 'inline_data' as const,
      mimeType: imageData.mimeType,
      data: imageData.base64,
    },
    { type: 'text' as const, text: userMessage },
  ];
}

// ---------------------------------------------------------------------------
// Core Exchange Processing Pipeline — Story 2.1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Everything needed to process a learner message */
export interface ExchangeContext {
  sessionId: string;
  profileId: string;
  subjectName: string;
  topicTitle?: string;
  topicDescription?: string;
  sessionType: SessionType;
  escalationRung: EscalationRung;
  exchangeHistory: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  birthYear?: number | null;
  priorLearningContext?: string;
  /** Cross-subject learning highlights — recent topics from other subjects (Story 16.0) */
  crossSubjectContext?: string;
  learningHistoryContext?: string;
  embeddingMemoryContext?: string;
  /** Accommodation mode preamble — injected before learner memory (FR254) */
  accommodationContext?: string;
  learnerMemoryContext?: string;
  workedExampleLevel?: 'full' | 'fading' | 'problem_first';
  /** Teaching method preference for adaptive teaching (FR58) */
  teachingPreference?: string;
  /** Multiple topics for interleaved retrieval sessions (FR92) */
  interleavedTopics?: Array<{
    topicId: string;
    title: string;
    description?: string;
  }>;
  /** Verification type: standard (default), evaluate (Devil's Advocate), teach_back (Feynman) */
  verificationType?: VerificationType;
  /** Preferred analogy domain for explanations (FR134-137) */
  analogyDomain?: string;
  /** Pedagogy mode for the subject */
  pedagogyMode?: 'socratic' | 'four_strands';
  /** Learner's native language for direct grammar explanation */
  nativeLanguage?: string;
  /** Target language code for language-learning sessions */
  languageCode?: string;
  /** Known vocabulary to bias comprehensible input */
  knownVocabulary?: string[];
  /** EVALUATE difficulty rung 1-4 (FR128-133) */
  evaluateDifficultyRung?: 1 | 2 | 3 | 4;
  /** Learning mode: 'serious' (default) or 'casual' — affects tutoring tone */
  learningMode?: LearningMode;
  /** SM-2 retention status for the current topic */
  retentionStatus?: {
    status: 'new' | 'strong' | 'fading' | 'weak' | 'forgotten';
    easeFactor?: number;
    daysSinceLastReview?: number;
  };
  /** FR228: Homework mode — "Help me solve it" or "Check my answer" */
  homeworkMode?: HomeworkMode;
  /** Subscription-derived LLM tier — controls model routing (flash/standard/premium) */
  llmTier?: LLMTier;
  // BKT-C.1 — profile-level personalization surfaced to the router. Separate
  // from the per-subject `nativeLanguage` (used for L1-aware grammar in
  // language-learning flows). `conversationLanguage` applies universally; in
  // a maths session only this matters. `pronouns` is learner-owned free text
  // (max 32 chars, validated at Zod boundary). Never surfaced to other
  // learners — the router includes it only in the active learner's preamble.
  conversationLanguage?: ConversationLanguage;
  pronouns?: string | null;
  /** Original free-text input the learner typed when starting this session (CFLF) */
  rawInput?: string | null;
  /** Input mode for this session — controls voice-optimized brevity in the system prompt */
  inputMode?: InputMode;
  /** Number of completed exchanges in this session — 0 means the LLM's first turn */
  exchangeCount?: number;
  /** Client-side effective mode — drives mode-specific prompt sections (e.g. recitation) */
  effectiveMode?: string;
  /** Learner's display name — used to personalise the mentor's voice */
  learnerName?: string;
}

/** Result of processing a single exchange */
export interface ExchangeResult {
  response: string;
  newEscalationRung: EscalationRung;
  isUnderstandingCheck: boolean;
  expectedResponseMinutes: number;
  /** Whether the LLM flagged this topic for deepening (rung 5 exit) */
  needsDeepening: boolean;
  /** Whether the LLM signalled partial progress (Gap 3) */
  partialProgress: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  /** Structured assessment from EVALUATE or TEACH_BACK LLM output */
  structuredAssessment?: Record<string, unknown>;
  /** Whether the LLM offered a note prompt to the learner */
  notePrompt?: boolean;
  /** Whether the note prompt is a post-session prompt */
  notePromptPostSession?: boolean;
  /** Fluency drill annotation (language sessions only) */
  fluencyDrill?: FluencyDrillAnnotation;
  /** F6: LLM self-reported confidence level. Absent means treat as 'medium'. */
  confidence?: 'low' | 'medium' | 'high';
}

/** Streaming variant result */
export interface ExchangeStreamResult {
  /** Client-facing stream: yields only envelope `reply` content, ready for SSE. */
  stream: AsyncIterable<string>;
  /**
   * Full raw envelope JSON accumulated from the provider stream, resolved
   * after the caller drains `stream`. Used by `onComplete` helpers to
   * parseEnvelope for signals + ui_hints.
   */
  rawResponsePromise: Promise<string>;
  newEscalationRung: EscalationRung;
  provider: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Understanding check markers
// ---------------------------------------------------------------------------

/** Patterns the LLM uses to signal an understanding check.
 * The authoritative signal is now the envelope's `needs_deepening` field;
 * these heuristic phrases are a fallback for pre-envelope responses only.
 * Do NOT add free-text markers like [UNDERSTANDING_CHECK] here — they can
 * false-positive when a learner literally types the bracket string. */
const UNDERSTANDING_CHECK_PATTERNS = [
  'does that make sense',
  'can you explain that back',
  'what do you think',
  'how would you',
  'try to describe',
  'in your own words',
];

export function estimateExpectedResponseMinutes(
  response: string,
  context: Pick<ExchangeContext, 'sessionType'>
): number {
  const trimmed = response.trim();
  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const questionCount = (trimmed.match(/\?/g) ?? []).length;

  if (
    context.sessionType === 'homework' &&
    /(show|solve|work through|try this|similar example|step)/i.test(trimmed)
  ) {
    return 6;
  }

  if (
    questionCount > 0 &&
    wordCount <= 30 &&
    /(what|why|how|which|can you|try|does that)/i.test(lower)
  ) {
    return 2;
  }

  if (
    /(take your time|work it out|pause here|on paper|try solving|come back when)/i.test(
      lower
    )
  ) {
    return 8;
  }

  if (wordCount >= 140) {
    return 10;
  }

  if (wordCount >= 90) {
    return 8;
  }

  if (wordCount >= 45) {
    return 5;
  }

  return 3;
}

// ---------------------------------------------------------------------------
// Re-export prompt builders for backward compatibility
// (eval harness and other callers import buildSystemPrompt from this module)
// ---------------------------------------------------------------------------

export { buildSystemPrompt } from './exchange-prompts';

// ---------------------------------------------------------------------------
// Exchange processing
// ---------------------------------------------------------------------------

/**
 * Processes a single learner exchange through the LLM.
 *
 * - Builds the system prompt from context
 * - Constructs the messages array (system + history + new user message)
 * - Routes to the appropriate model via routeAndCall
 * - Detects understanding check markers in the response
 */
export async function processExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData
): Promise<ExchangeResult> {
  const systemPrompt = _buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role,
      content: e.content,
    })),
    {
      role: 'user' as const,
      content: buildUserContent(userMessage, imageData),
    },
  ];

  const ageBracket = resolveAgeBracket(context.birthYear);
  const result: RouteResult = await routeAndCall(
    messages,
    context.escalationRung,
    {
      llmTier: context.llmTier,
      ageBracket,
      // BKT-C.1 — forward profile-level personalization to the router so the
      // safety preamble carries it on every provider uniformly.
      conversationLanguage: context.conversationLanguage,
      pronouns: context.pronouns,
    }
  );

  const parsed = parseExchangeEnvelope(result.response, {
    sessionId: context.sessionId,
    profileId: context.profileId,
    flow: 'processExchange',
  });

  return {
    response: parsed.cleanResponse,
    newEscalationRung: context.escalationRung,
    isUnderstandingCheck: parsed.understandingCheck,
    expectedResponseMinutes: estimateExpectedResponseMinutes(
      parsed.cleanResponse,
      context
    ),
    needsDeepening: parsed.needsDeepening,
    partialProgress: parsed.partialProgress,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    notePrompt: parsed.notePrompt || undefined,
    notePromptPostSession: parsed.notePromptPostSession || undefined,
    fluencyDrill: parsed.fluencyDrill ?? undefined,
    confidence: parsed.confidence,
  };
}

/**
 * Streaming variant — returns an async iterable of response chunks.
 *
 * Same prompt assembly as processExchange, but uses routeAndStream.
 */
export async function streamExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData
): Promise<ExchangeStreamResult> {
  const systemPrompt = _buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role,
      content: e.content,
    })),
    {
      role: 'user' as const,
      content: buildUserContent(userMessage, imageData),
    },
  ];

  const ageBracket = resolveAgeBracket(context.birthYear);
  const result: StreamResult = await routeAndStream(
    messages,
    context.escalationRung,
    {
      llmTier: context.llmTier,
      ageBracket,
      conversationLanguage: context.conversationLanguage,
      pronouns: context.pronouns,
    }
  );

  const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
    result.stream
  );

  return {
    stream: cleanReplyStream,
    rawResponsePromise,
    newEscalationRung: context.escalationRung,
    provider: result.provider,
    model: result.model,
  };
}

/** Fluency drill annotation extracted from the envelope's ui_hints.fluency_drill */
export interface FluencyDrillAnnotation {
  active: boolean;
  durationSeconds?: number;
  score?: { correct: number; total: number };
}

export interface ParsedExchangeEnvelope {
  cleanResponse: string;
  understandingCheck: boolean;
  partialProgress: boolean;
  needsDeepening: boolean;
  notePrompt: boolean;
  notePromptPostSession: boolean;
  fluencyDrill: FluencyDrillAnnotation | null;
  /** F6: LLM self-reported confidence level. Absent means treat as 'medium'. */
  confidence?: 'low' | 'medium' | 'high';
}

/**
 * Parse the full envelope from a (non-streaming or accumulated-stream) LLM
 * response and normalise signals + ui_hints into the flat structure exchange
 * callers consume today. On envelope parse failure, the raw text is surfaced
 * as the reply and all signals default to false — no silent "everything is
 * fine" recovery, because we also warn via the logger so the migration can
 * be monitored.
 */
export function parseExchangeEnvelope(
  response: string,
  context?: { sessionId?: string; profileId?: string; flow?: string }
): ParsedExchangeEnvelope {
  const parsed = parseEnvelope(response);
  if (!parsed.ok) {
    logger.warn('exchange.envelope_parse_failed', {
      flow: context?.flow,
      session_id: context?.sessionId,
      profile_id: context?.profileId,
      reason: parsed.reason,
    });
    return {
      cleanResponse: response.trim(),
      understandingCheck: detectUnderstandingCheckFromProse(response),
      partialProgress: false,
      needsDeepening: false,
      notePrompt: false,
      notePromptPostSession: false,
      fluencyDrill: null,
    };
  }

  const { envelope } = parsed;
  const signals = envelope.signals ?? {};
  const uiHints = envelope.ui_hints ?? {};
  const cleanReply = envelope.reply.trim();

  const notePrompt = uiHints.note_prompt;
  const drill = uiHints.fluency_drill;
  const fluencyDrill: FluencyDrillAnnotation | null = drill
    ? {
        active: Boolean(drill.active),
        durationSeconds:
          typeof drill.duration_s === 'number'
            ? Math.min(90, Math.max(15, drill.duration_s))
            : undefined,
        score:
          drill.score &&
          typeof drill.score.correct === 'number' &&
          typeof drill.score.total === 'number'
            ? { correct: drill.score.correct, total: drill.score.total }
            : undefined,
      }
    : null;

  return {
    cleanResponse: cleanReply,
    understandingCheck:
      signals.understanding_check === true ||
      // Legacy prose heuristic — kept as an observational fallback when the
      // model doesn't emit the signal explicitly. Cheap to compute, no
      // control-flow impact beyond the telemetry flag.
      detectUnderstandingCheckFromProse(cleanReply),
    partialProgress: signals.partial_progress === true,
    needsDeepening: signals.needs_deepening === true,
    notePrompt: notePrompt?.show === true,
    notePromptPostSession: notePrompt?.post_session === true,
    fluencyDrill,
    confidence: envelope.confidence,
  };
}

/** Observational prose heuristic — never drives control flow on its own. */
function detectUnderstandingCheckFromProse(response: string): boolean {
  const lower = response.toLowerCase();
  return UNDERSTANDING_CHECK_PATTERNS.some((pattern) =>
    lower.includes(pattern.toLowerCase())
  );
}
