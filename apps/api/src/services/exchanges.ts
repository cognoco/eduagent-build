import {
  routeAndCall,
  routeAndStream,
  parseEnvelope,
  extractFirstJsonObject,
  extractReplyCandidate,
  KNOWN_MARKER_KEYS,
  teeEnvelopeStream,
} from './llm';
import { applyAppHelpSignalGuard, isAppHelpQuery } from './app-help-map';
import { normalizeReplyText, stripEmbeddedEnvelopeTail } from './llm/envelope';
import type {
  ChatMessage,
  EscalationRung,
  MessagePart,
  ParseEnvelopeFailureReason,
  RouteResult,
  StreamResult,
} from './llm';
import { createLogger } from './logger';
import {
  type ExchangeFallback,
  type ExchangeFallbackReason,
  type LlmResponseEnvelope,
  type ChallengeRoundEvaluationItem,
  type ChallengeRoundNoteDraftHint,
} from '@eduagent/schemas';
import {
  buildSystemPrompt as _buildSystemPrompt,
  resolveAgeBracket,
  allowsGeneralKnowledgeSource,
} from './exchange-prompts';
import { stripPhoneticHints } from './llm/sanitize';
import { safeSend } from './safe-non-core';
import { inngest } from '../inngest/client';
import {
  detectCatastrophicSafetyTrigger,
  tripwireResponse,
  type CatastrophicCategory,
} from './safety-tripwire';
import {
  GENERAL_KNOWLEDGE_SOURCE_ID,
  GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR,
  type ExchangeContext,
  type ExchangeSourceEvidence,
} from './exchange-types';

export {
  GENERAL_KNOWLEDGE_SOURCE_ID,
  GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR,
  type ExchangeContext,
  type ExchangeSourceEvidence,
  type ExchangeSourceEvidenceKind,
  type ExchangeSourceReliability,
} from './exchange-types';

const logger = createLogger();

/**
 * [H2/H7 — 2026-06-05 safety audit] Structured safety event when the
 * crisis-redirect rule fires (learner expressed distress / self-harm
 * ideation / bullying / abuse and the model redirected to a trusted
 * adult/helpline).
 *
 * Before this, the redirect fired with zero logging — "how many learners
 * mentioned self-harm last month?" was unanswerable (a silent-recovery
 * violation on the highest-stakes path in the app, and a DPIA-visible gap).
 *
 * Deliberately logs METADATA ONLY — never the learner's message or the
 * model's reply. §6 ruling (2026-06-05): internal logging only, no guardian
 * notification; the structured event is the prerequisite for any future
 * notification design.
 */
export async function emitCrisisRedirectEvent(context: {
  sessionId?: string;
  profileId?: string;
  flow: string;
  provider?: string;
  model?: string;
}): Promise<void> {
  logger.warn('safety.crisis_redirect_fired', {
    flow: context.flow,
    session_id: context.sessionId,
    profile_id: context.profileId,
    provider: context.provider,
    model: context.model,
  });
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: observability-only marker (H2/H7, 2026-06-05 safety
        // audit). The user-facing response (empathize + helpline redirect)
        // already happened in the LLM reply; this event exists so ops can
        // query "crisis redirects per week" in the dashboard and so RR-12's
        // monitoring guardrail has a signal. No downstream handler is needed
        // or intended until the §6(b) guardian-notification design is ruled.
        name: 'app/safety.crisis_redirect_fired',
        data: {
          sessionId: context.sessionId,
          profileId: context.profileId,
          flow: context.flow,
          provider: context.provider,
          model: context.model,
          timestamp: new Date().toISOString(),
        },
      }),
    'safety.crisis_redirect_fired',
    { sessionId: context.sessionId, profileId: context.profileId },
  );
}

/**
 * F1.1 — Server-side hard cap on interview / onboarding exchanges. Per the
 * envelope contract in AGENTS.md ("Every envelope signal must have a
 * server-side hard cap so the flow terminates even if the LLM never emits the
 * signal"), interview-style flows MUST terminate at this exchange count even
 * when `signals.ready_to_finish` is never received. Callers that drive
 * interview/onboarding loops (see `processMessage` in
 * `services/session/session-exchange.ts`) force `readyToFinish = true` once
 * the session's `exchangeCount` reaches this number.
 *
 * Non-interview flows (regular learning, homework, language, recitation) are
 * still bounded by `MAX_EXCHANGES_PER_SESSION` (50) and ignore this constant.
 *
 * Value justification: 4 exchanges is the example cap cited in AGENTS.md and
 * the docs/architecture.md envelope contract — short enough that the
 * interview never runs unbounded, long enough to capture goals, current
 * knowledge, and interests in a fast-path onboarding chat.
 *
 * [BUG-92 / CR-2026-05-19-C4]
 */
export const MAX_INTERVIEW_EXCHANGES = 4;

const SERVER_NOTE_RE = /<\/?server_note[^>]*>/gi;

/**
 * Strip `<server_note>` tags from learner-supplied content before it is
 * persisted as conversation history. The LLM treats `<server_note>` as a
 * trusted system annotation, so any reconstruction of that tag from
 * attacker-controlled fragments would let the learner fabricate "system"
 * messages within their own session history.
 *
 * [WI-212 / DS-123] Single-pass `String.replace` is not convergent: a
 * payload like `<server_no<server_note>te ...>PAYLOAD</server_no</server_note>te>`
 * strips the inner tag, leaving outer fragments that concatenate into a
 * fresh `<server_note ...>PAYLOAD</server_note>`. We loop until the regex
 * no longer matches so no reconstruction survives. The bounded loop count
 * prevents pathological inputs from running unbounded.
 */
const SANITIZE_USER_CONTENT_MAX_PASSES = 8;

export function sanitizeUserContent(content: string): string {
  let current = content;
  for (let i = 0; i < SANITIZE_USER_CONTENT_MAX_PASSES; i += 1) {
    const next = current.replace(SERVER_NOTE_RE, '');
    if (next === current) return next;
    current = next;
  }
  // Fall back to entity-encoding surviving angle brackets — after MAX_PASSES
  // iterations the input is adversarial. Entity-encoding (rather than
  // stripping) preserves benign content like `5 < 7` while making any
  // reconstructed `<server_note>` impossible to interpret as a real tag.
  return current.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Multimodal image support — IMG-VISION
// ---------------------------------------------------------------------------

export interface ImageData {
  base64: string;
  mimeType: string;
}

export function buildUserContent(
  userMessage: string,
  imageData?: ImageData,
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

export interface ExchangePrivateSources {
  relied_on?: string[];
  insufficient?: boolean;
  reason?: string;
  factual_confidence?: number;
}

export type ExchangeSourceAuditStatus =
  | 'ok'
  | 'parse_failed'
  | 'missing_private_sources'
  | 'unsupported_sources'
  | 'missing_reliable_source'
  | 'insufficient_reliable_sources';

export interface ExchangeSourceAudit {
  status: ExchangeSourceAuditStatus;
  reliedOnSourceIds: string[];
  reliableReliedOnSourceIds: string[];
  unsupportedSourceIds: string[];
  availableReliableSourceIds: string[];
  insufficient: boolean;
  factualConfidence?: number;
  reason?: string;
  evidence: ExchangeSourceEvidence[];
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
  /** Challenge Round: LLM proposed an offer; server-side caller still gates it. */
  challengeRoundOffer?: boolean;
  /** Challenge Round: per-concept learner-answer evaluations. */
  challengeRoundEvaluation?: ChallengeRoundEvaluationItem[];
  /** Challenge Round: note draft UI hint, validated later before surfacing. */
  noteDraft?: ChallengeRoundNoteDraftHint | null;
  /** Fluency drill annotation (language sessions only) */
  fluencyDrill?: FluencyDrillAnnotation;
  /** F6: LLM self-reported confidence level. Absent means treat as 'medium'. */
  confidence?: 'low' | 'medium' | 'high';
  /** Continuation opener score from the envelope, 0-1. */
  retrievalScore?: number;
  /** True when the LLM did not return a valid response envelope. */
  envelopeParseFailed?: boolean;
  /** Parser failure reason when envelopeParseFailed is true. */
  envelopeParseFailureReason?: ParseEnvelopeFailureReason;
  /** Private provenance audit for this turn; never shown to the learner. */
  sourceAudit?: ExchangeSourceAudit;
  /**
   * F1.1 — LLM signalled `signals.ready_to_finish` in the envelope. Interview /
   * onboarding flows consume this to terminate the loop early; non-interview
   * flows can ignore it. Always present (false when the LLM did not emit the
   * signal, or for fallback paths). Pair with the server-side hard cap
   * {@link MAX_INTERVIEW_EXCHANGES} in the caller — never trust this flag
   * alone. `processMessage` (session-exchange.ts) forces this to `true` once
   * `exchangeCount >= MAX_INTERVIEW_EXCHANGES` on a session that carries
   * interview/onboarding metadata, so the loop terminates even if the LLM
   * never emits the signal.
   * [BUG-92 / CR-2026-05-19-C4]
   */
  readyToFinish: boolean;
  /**
   * Bug #348: EVALUATE assessment signal (snake_case wire shape) lifted from
   * `envelope.signals.evaluate_assessment`. The session-exchange persistence
   * layer writes this under `aiMetadata.signals.evaluate_assessment` where
   * `parseEvaluateAssessment` (services/evaluate.ts) reads it back. Undefined
   * on non-EVALUATE turns and on every fallback path.
   */
  evaluateAssessment?: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['evaluate_assessment']
  >;
  /**
   * Bug #348: TEACH_BACK assessment signal (snake_case wire shape) lifted from
   * `envelope.signals.teach_back_assessment`. The session-exchange persistence
   * layer writes this under `aiMetadata.signals.teach_back_assessment` where
   * `parseTeachBackAssessment` (services/teach-back.ts) reads it back.
   * Undefined on non-TEACH_BACK turns and on every fallback path.
   */
  teachBackAssessment?: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['teach_back_assessment']
  >;
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
  fallbackUsed?: boolean;
  /** Private source pack used to build the streaming prompt. */
  sourceEvidence: ExchangeSourceEvidence[];
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
  context: Pick<ExchangeContext, 'sessionType'>,
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
      lower,
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

const SOURCE_EXCERPT_MAX_CHARS = 360;

function compactSourceExcerpt(value: string | undefined): string | undefined {
  const compact = value?.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.length > SOURCE_EXCERPT_MAX_CHARS
    ? `${compact.slice(0, SOURCE_EXCERPT_MAX_CHARS - 1)}...`
    : compact;
}

function addSourceEvidence(
  evidence: ExchangeSourceEvidence[],
  item: ExchangeSourceEvidence,
): void {
  if (evidence.some((existing) => existing.id === item.id)) return;
  evidence.push({
    ...item,
    excerpt: compactSourceExcerpt(item.excerpt),
  });
}

// S2-H1: allowsGeneralKnowledgeSource is imported from exchange-prompts.ts (canonical).
// Re-exported here so callers that use exchanges.ts as their surface still find it.
export { allowsGeneralKnowledgeSource } from './exchange-prompts';

function looksLikeDeterministicProblem(text: string): boolean {
  return (
    /(?:^|\s)[-+]?\d+(?:\.\d+)?\s*(?:[+\-*/=]|x\s*[+\-=]|\bpercent\b)/i.test(
      text,
    ) ||
    /\b(solve|equation|calculate|factor|simplify|percent|ratio|fraction|derivative|integral)\b/i.test(
      text,
    )
  );
}

export function buildExchangeSourceEvidence(
  context: ExchangeContext,
  userMessage: string,
  options: { appHelpTurn?: boolean } = {},
): ExchangeSourceEvidence[] {
  const evidence: ExchangeSourceEvidence[] = [];

  addSourceEvidence(evidence, {
    id: 'learner_message',
    kind: 'learner_message',
    reliability: 'learner_provided',
    label: 'Current learner message',
    excerpt: sanitizeUserContent(userMessage),
    reliableForFacts: false,
  });

  if (context.rawInput) {
    addSourceEvidence(evidence, {
      id: 'learner_intent',
      kind: 'learner_intent',
      reliability: 'learner_provided',
      label: 'Original learner intent',
      excerpt: context.rawInput,
      reliableForFacts: false,
    });
  }

  if (context.topicTitle || context.topicDescription) {
    addSourceEvidence(evidence, {
      id: 'current_topic',
      kind: 'current_topic',
      reliability: 'trusted_app_content',
      label: 'Loaded curriculum topic',
      excerpt: [context.topicTitle, context.topicDescription]
        .filter(Boolean)
        .join(': '),
      reliableForFacts: true,
    });
  }

  if (context.interleavedTopics?.length) {
    addSourceEvidence(evidence, {
      id: 'interleaved_topics',
      kind: 'interleaved_topics',
      reliability: 'trusted_app_content',
      label: 'Loaded interleaved curriculum topics',
      excerpt: context.interleavedTopics
        .map((topic) =>
          [topic.title, topic.description].filter(Boolean).join(': '),
        )
        .join(' | '),
      reliableForFacts: true,
    });
  }

  if (options.appHelpTurn === true) {
    addSourceEvidence(evidence, {
      id: 'app_help_map',
      kind: 'app_help_map',
      reliability: 'trusted_app_content',
      label: 'Server-owned MentoMate app help map',
      excerpt: 'App navigation and feature map injected by the server.',
      reliableForFacts: true,
    });
  }

  if (context.sessionType === 'homework') {
    addSourceEvidence(evidence, {
      id: 'homework_problem',
      kind: 'homework_problem',
      reliability: 'learner_provided',
      label: 'Learner-provided homework problem',
      excerpt: [context.rawInput, userMessage].filter(Boolean).join(' | '),
      reliableForFacts: true,
    });
  }

  const recentHistory = context.exchangeHistory
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .slice(-6)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join('\n');

  if (context.effectiveMode === 'recitation') {
    const recentLearnerRecitations = context.exchangeHistory
      .filter((entry) => entry.role === 'user')
      .slice(-4)
      .map((entry) => entry.content);
    addSourceEvidence(evidence, {
      id: 'recitation_text',
      kind: 'recitation_text',
      reliability: 'learner_provided',
      label: 'Learner-provided recitation text',
      excerpt: [...recentLearnerRecitations, sanitizeUserContent(userMessage)]
        .filter(Boolean)
        .join('\n'),
      reliableForFacts: true,
    });
  }

  if (
    context.sessionType === 'homework' ||
    looksLikeDeterministicProblem(`${context.rawInput ?? ''}\n${userMessage}`)
  ) {
    addSourceEvidence(evidence, {
      id: 'deterministic_reasoning',
      kind: 'deterministic_reasoning',
      reliability: 'reasoning',
      label: 'Deterministic reasoning over provided problem data',
      excerpt:
        'Use only transparent transformations that can be checked from the provided problem.',
      reliableForFacts: true,
    });
  }

  if (allowsGeneralKnowledgeSource(context)) {
    addSourceEvidence(evidence, {
      id: GENERAL_KNOWLEDGE_SOURCE_ID,
      kind: 'general_knowledge',
      reliability: 'model_general_knowledge',
      label: 'Confidence-gated general knowledge',
      excerpt:
        'Allowed for ordinary low-stakes general knowledge in rung 1-4 only when private_sources.factual_confidence is at least 0.88. Not allowed for source-specific, homework, review, recitation, language-grammar, precise evidence, ranking, or high-stakes claims.',
      reliableForFacts: true,
    });
  }

  if (recentHistory) {
    addSourceEvidence(evidence, {
      id: 'conversation_history',
      kind: 'conversation_history',
      reliability: 'conversation_only',
      label: 'Recent conversation history',
      excerpt: recentHistory,
      reliableForFacts: false,
    });
  }

  if (context.priorLearningContext || context.learningHistoryContext) {
    addSourceEvidence(evidence, {
      id: 'prior_learning',
      kind: 'prior_learning',
      reliability: 'memory_only',
      label: 'Prior learning summary',
      excerpt: [context.priorLearningContext, context.learningHistoryContext]
        .filter(Boolean)
        .join('\n'),
      reliableForFacts: false,
    });
  }

  if (
    context.embeddingMemoryContext ||
    context.learnerMemoryContext ||
    context.crossSubjectContext ||
    context.resumeContext
  ) {
    addSourceEvidence(evidence, {
      id: 'mentor_memory',
      kind: 'mentor_memory',
      reliability: 'memory_only',
      label: 'Mentor memory and summaries',
      excerpt: [
        context.embeddingMemoryContext,
        context.learnerMemoryContext,
        context.crossSubjectContext,
        context.resumeContext,
      ]
        .filter(Boolean)
        .join('\n'),
      reliableForFacts: false,
    });
  }

  if (context.accommodationContext || context.teachingPreference) {
    addSourceEvidence(evidence, {
      id: 'accommodation',
      kind: 'accommodation',
      reliability: 'memory_only',
      label: 'Learner accommodation and teaching preference',
      excerpt: [context.accommodationContext, context.teachingPreference]
        .filter(Boolean)
        .join('\n'),
      reliableForFacts: false,
    });
  }

  return evidence;
}

function uniqueSourceIds(ids: string[] | undefined): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const rawId of ids ?? []) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function appendAuditReason(
  existingReason: string | undefined,
  addition: string,
): string {
  if (!existingReason) return addition.slice(0, 1000);
  return `${existingReason} ${addition}`.slice(0, 1000);
}

function getLearnerQuestionFromEvidence(
  evidence: ExchangeSourceEvidence[],
): string {
  return (
    evidence
      .find((item) => item.id === 'learner_message')
      ?.excerpt?.replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}

function isSourceBoundOrHighRiskGeneralKnowledgeQuestion(
  question: string,
): boolean {
  const lower = question.toLowerCase();
  return [
    /\b(source|textbook|worksheet|passage|photo|image|according to|based on|from this|from the text|quote|cite|citation|evidence)\b/,
    /\b(exact|precise|statistics?|percentage|percent|what year|when did|how many|rank|ranking|most important|best|worst|main reasons?|main idea|main point|key idea|important part|primary cause|prove)\b/,
    /\b(medical|medicine|diagnos|dose|symptom|legal|lawyer|lawsuit|tax|financial|investment|stock|crypto|self-harm|suicide|emergency)\b/,
  ].some((pattern) => pattern.test(lower));
}

function getGeneralKnowledgeRelianceIssue(input: {
  reliedOnSourceIds: string[];
  factualConfidence: number | undefined;
  evidence: ExchangeSourceEvidence[];
}): string | undefined {
  if (!input.reliedOnSourceIds.includes(GENERAL_KNOWLEDGE_SOURCE_ID)) {
    return undefined;
  }

  if (input.factualConfidence == null) {
    return `Server rejected general_knowledge because private_sources.factual_confidence was missing; it must be at least ${GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR}.`;
  }

  if (input.factualConfidence < GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR) {
    return `Server rejected general_knowledge because factual confidence ${input.factualConfidence.toFixed(2)} was below ${GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR}.`;
  }

  const question = getLearnerQuestionFromEvidence(input.evidence);
  if (isSourceBoundOrHighRiskGeneralKnowledgeQuestion(question)) {
    return 'Server rejected general_knowledge because the learner asked a source-bound, precise/ranking, or high-stakes question.';
  }

  return undefined;
}

export function auditExchangeSources(
  privateSources: ExchangePrivateSources | undefined,
  evidence: ExchangeSourceEvidence[],
  options: { envelopeParseFailed?: boolean } = {},
): ExchangeSourceAudit {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const availableReliableSourceIds = evidence
    .filter((item) => item.reliableForFacts)
    .map((item) => item.id);
  const reliedOnSourceIds = uniqueSourceIds(privateSources?.relied_on);
  const unsupportedSourceIds = reliedOnSourceIds.filter(
    (id) => !evidenceById.has(id),
  );
  const reliableReliedOnSourceIds = reliedOnSourceIds.filter(
    (id) => evidenceById.get(id)?.reliableForFacts === true,
  );
  const insufficient = privateSources?.insufficient === true;
  const factualConfidence = privateSources?.factual_confidence;
  const generalKnowledgeIssue = getGeneralKnowledgeRelianceIssue({
    reliedOnSourceIds,
    factualConfidence,
    evidence,
  });
  let reason = privateSources?.reason;

  let status: ExchangeSourceAuditStatus = 'ok';
  if (options.envelopeParseFailed === true) {
    status = 'parse_failed';
  } else if (!privateSources) {
    status = 'missing_private_sources';
  } else if (unsupportedSourceIds.length > 0) {
    status = 'unsupported_sources';
  } else if (insufficient) {
    status = 'insufficient_reliable_sources';
  } else if (generalKnowledgeIssue) {
    status = 'insufficient_reliable_sources';
    reason = appendAuditReason(reason, generalKnowledgeIssue);
  } else if (
    availableReliableSourceIds.length === 0 ||
    reliableReliedOnSourceIds.length === 0
  ) {
    status = 'missing_reliable_source';
  }

  return {
    status,
    reliedOnSourceIds,
    reliableReliedOnSourceIds,
    unsupportedSourceIds,
    availableReliableSourceIds,
    insufficient: insufficient || Boolean(generalKnowledgeIssue),
    factualConfidence,
    reason,
    evidence,
  };
}

function getSourceEvidenceExcerpt(
  sourceAudit: ExchangeSourceAudit,
  sourceId: string,
): string | undefined {
  return sourceAudit.evidence.find((item) => item.id === sourceId)?.excerpt;
}

function truncateForReply(value: string | undefined, maxChars = 160): string {
  const compact = value?.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > maxChars
    ? `${compact.slice(0, maxChars - 1)}...`
    : compact;
}

function normalizeAcknowledgementClause(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strong acknowledgements semantically require a prior contribution to
// acknowledge — safe to treat as ack regardless of conversation history.
const STRONG_ACK_CLAUSE =
  /^(thank you|thanks|thx|ty|got it|i got it|i see|i understand|makes sense|that makes sense|this makes sense)$/;
// Weak / ambiguous tokens (yes / yeah / good / ok / cool …) are equally
// natural as a learner's opening turn — without prior assistant context,
// matching these as acknowledgements produces a bizarre "You're welcome"
// reply. The caller passes hasPriorAssistantTurn to disambiguate.
const WEAK_ACK_CLAUSE =
  /^(ok|okay|yes|yep|yeah|sounds good|cool|perfect|great|nice|good|fine|alright|all right)$/;
const POSITIVE_FEEDBACK_CLAUSE =
  /^(that|this|it) (was|is) (useful|helpful|clear|good|great|perfect|nice)$/;
const THANKS_WITH_FEEDBACK_CLAUSE =
  /^(thank you|thanks|thx|ty) (that|this|it) (was|is) (useful|helpful|clear|good|great|perfect|nice)$/;

function isAcknowledgementOnlyTurn(
  value: string,
  hasPriorAssistantTurn: boolean,
): boolean {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return false;
  if (/[?]/.test(compact)) return false;

  const clauses = compact
    .split(/[.!;,]+|\s+-\s+/)
    .map(normalizeAcknowledgementClause)
    .filter(Boolean);
  if (clauses.length === 0 || clauses.length > 3) return false;

  return clauses.every(
    (clause) =>
      STRONG_ACK_CLAUSE.test(clause) ||
      POSITIVE_FEEDBACK_CLAUSE.test(clause) ||
      THANKS_WITH_FEEDBACK_CLAUSE.test(clause) ||
      (hasPriorAssistantTurn && WEAK_ACK_CLAUSE.test(clause)),
  );
}

function buildUnsupportedFactualReply(
  sourceAudit: ExchangeSourceAudit,
): string {
  const learnerQuestion = truncateForReply(
    getSourceEvidenceExcerpt(sourceAudit, 'learner_message'),
  );
  const lower = learnerQuestion.toLowerCase();

  // Weak acknowledgement tokens (yes / yeah / good / ok) are equally
  // natural as a learner's first turn. Without a prior assistant turn,
  // matching these and replying "You're welcome" is nonsensical. Strong
  // forms (thanks, "X was useful") presuppose a prior contribution and
  // are accepted unconditionally — see isAcknowledgementOnlyTurn().
  const hasPriorAssistantTurn = sourceAudit.evidence.some(
    (e) => e.kind === 'conversation_history',
  );
  if (isAcknowledgementOnlyTurn(learnerQuestion, hasPriorAssistantTurn)) {
    return "You're welcome. Want to keep going with this, or end here?";
  }

  if (/\b(remember|takeaway|summary|recap)\b/.test(lower)) {
    return (
      'The safe takeaway is that we still need reliable source material before making factual claims about this. ' +
      'Once you share the textbook passage, worksheet, photo, or trusted source, I can help pull out the main claim, one example, and the evidence that supports it.'
    );
  }

  if (/\b(example|for instance|rome|specific)\b/.test(lower)) {
    return (
      "A specific example needs reliable source material, so I won't invent one. " +
      'Share the textbook passage, worksheet, photo, or trusted source, and I can turn it into a clear example with what it proves.'
    );
  }

  if (/\b(explain|from scratch|beginning|start)\b/.test(lower)) {
    return (
      'I can help set up the explanation, but I need reliable source material before filling in the facts. ' +
      "Send the textbook passage, worksheet, photo, or trusted source, and we'll build it as: main idea, cause, example, evidence."
    );
  }

  if (
    /\b(source|sources|reference|references|textbook|worksheet|passage|photo|image|according to|based on|from this|from the text|quote|cite|citation|evidence)\b/.test(
      lower,
    )
  ) {
    return (
      "That's a source-check question, so I should not answer it from memory. " +
      "Share the textbook passage, worksheet, photo, or trusted source, and we'll check what claim it supports and what evidence it gives."
    );
  }

  return (
    "I don't have reliable source material for that yet, so I won't invent the facts. " +
    (learnerQuestion
      ? `What I can safely do now is frame your question: "${learnerQuestion}" `
      : 'What I can safely do now is help frame the question. ') +
    "Share the textbook passage, worksheet, photo, or trusted source, and I'll help turn it into a clear answer with evidence."
  );
}

function sourceFallbackReason(existingReason: string | undefined): string {
  const reason =
    'Server used the no-source safety fallback because no reliable factual source was available.';
  if (!existingReason) return reason;
  return `${reason} Model reason: ${existingReason}`.slice(0, 1000);
}

const SOURCE_BOUND_SENTENCE_TERMS: Array<{
  label: string;
  response: RegExp;
  source: RegExp;
}> = [
  {
    label: 'pottery/clay',
    response: /\bclay\b|\bpots?\b|\bpottery\b/i,
    source: /\bclay\b|\bpots?\b|\bpottery\b/i,
  },
  {
    label: 'metal/tools',
    response: /\bmetal\b|\btools?\b/i,
    source: /\bmetal\b|\btools?\b/i,
  },
  {
    label: 'wheat/grain',
    response: /\bwheat\b|\bgrain\b/i,
    source: /\bwheat\b|\bgrain\b/i,
  },
  { label: 'salt', response: /\bsalt\b/i, source: /\bsalt\b/i },
  { label: 'spices', response: /\bspices?\b/i, source: /\bspices?\b/i },
  { label: 'silk', response: /\bsilk\b/i, source: /\bsilk\b/i },
  {
    label: 'oil',
    response: /\bolive oil\b|\boil\b/i,
    source: /\bolive oil\b|\boil\b/i,
  },
  { label: 'wine', response: /\bwine\b/i, source: /\bwine\b/i },
  {
    label: 'cell autonomy phrase',
    response:
      /\b(?:cells?|cell)\b[^.?!]{0,120}\b(?:can do on its own|what a cell can do|all by itself)\b|\b(?:can do on its own|what a cell can do|all by itself)\b[^.?!]{0,120}\b(?:cells?|cell)\b/i,
    source:
      /\b(?:cells?|cell)\b[^.?!]{0,120}\b(?:can do on its own|what a cell can do|all by itself)\b|\b(?:can do on its own|what a cell can do|all by itself)\b[^.?!]{0,120}\b(?:cells?|cell)\b/i,
  },
  {
    label: 'building-block analogy',
    response: /\bbuilding blocks?\b|\bfundamental piece\b/i,
    source: /\bbuilding blocks?\b|\bfundamental piece\b/i,
  },
  {
    label: 'army speed/ease/effectiveness',
    response:
      /\b(?:arm(?:y|ies)|soldiers?|military)\b[^,.;?!]*(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)|(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)[^,.;?!]*\b(?:arm(?:y|ies)|soldiers?|military)\b/i,
    source:
      /\b(?:arm(?:y|ies)|soldiers?|military)\b[^,.;?!]*(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)|(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)[^,.;?!]*\b(?:arm(?:y|ies)|soldiers?|military)\b/i,
  },
  {
    label: 'trade speed',
    response:
      /\btrade\b[^.?!]{0,120}\b(?:fast|faster|quickly|speed)\b|\b(?:fast|faster|quickly|speed)\b[^.?!]{0,120}\btrade\b/i,
    source:
      /\btrade\b[^.?!]{0,120}\b(?:fast|faster|quickly|speed)\b|\b(?:fast|faster|quickly|speed)\b[^.?!]{0,120}\btrade\b/i,
  },
  {
    label: 'conquest/empire growth',
    response:
      /\bconquer(?:ing|ed)?\b|\bconquest\b|\bempires?\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b|\bempire\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b/i,
    source:
      /\bconquer(?:ing|ed)?\b|\bconquest\b|\bempires?\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b|\bempire\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b/i,
  },
  {
    label: 'brick/house analogy',
    response: /\bbricks?\b|\bhouse\b/i,
    source: /\bbricks?\b|\bhouse\b/i,
  },
  {
    label: 'unsupported trade container',
    response: /\bbaskets?\b/i,
    source: /\bbaskets?\b/i,
  },
  {
    label: 'unsupported historical framing',
    response:
      /\bspecial pathways?\b|\bbuilt long ago\b|\b(?:was|were) built\b|\bbuilt to\b|\bancient times\b|\bvillages?\b/i,
    source:
      /\bspecial pathways?\b|\bbuilt long ago\b|\b(?:was|were) built\b|\bbuilt to\b|\bancient times\b|\bvillages?\b/i,
  },
  {
    label: 'unsupported land/soil detail',
    response: /\brich soil\b|\bsoil\b/i,
    source: /\brich soil\b|\bsoil\b/i,
  },
  {
    label: 'unsupported sediment definition',
    response:
      /\bsand\b|\bmud\b|\blayers? of rock\b|\bmillions of years\b|\breally long time\b|\btiny bits?\b|\bstone copy\b|\bcopy of the original\b|\bcopy of an? original\b/i,
    source:
      /\bsand\b|\bmud\b|\blayers? of rock\b|\bmillions of years\b|\breally long time\b|\btiny bits?\b|\bstone copy\b|\bcopy of the original\b|\bcopy of an? original\b/i,
  },
  {
    label: 'unsupported soft validation',
    response:
      /\binteresting (?:thought|idea)\b|\bgood (?:point|observation)\b|\bfair point\b/i,
    source:
      /\binteresting (?:thought|idea)\b|\bgood (?:point|observation)\b|\bfair point\b/i,
  },
  {
    label: 'generic praise',
    response:
      /\bexcellent idea\b|\bgreat idea\b|\bgreat question\b|\bawesome\b/i,
    source: /\bexcellent idea\b|\bgreat idea\b|\bgreat question\b|\bawesome\b/i,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function responseMentionsSourceTitle(
  response: string,
  source: ExchangeSourceEvidence,
): boolean {
  const excerpt = source.excerpt?.trim();
  if (!excerpt) return false;
  const title = excerpt.split(':')[0]?.trim();
  if (!title || title.length < 8) return false;

  return new RegExp(`\\b${escapeRegExp(title)}\\b`, 'i').test(response);
}

function normalizeForSourcePhraseMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function responseMentionsQuotedSourcePhrase(
  response: string,
  source: ExchangeSourceEvidence,
): boolean {
  const excerpt = source.excerpt?.trim();
  if (!excerpt) return false;

  const normalizedResponse = normalizeForSourcePhraseMatch(response);
  const phrases = Array.from(excerpt.matchAll(/["“”]([^"“”]{5,80})["“”]/g))
    .map((match) => match[1]?.trim())
    .filter((phrase): phrase is string => Boolean(phrase));

  return phrases.some((phrase) =>
    normalizedResponse.includes(normalizeForSourcePhraseMatch(phrase)),
  );
}

export function inferObviousReliableSourceForAudit(
  privateSources: ExchangePrivateSources | undefined,
  sourceEvidence: ExchangeSourceEvidence[],
  response: string,
): ExchangePrivateSources | undefined {
  if (!privateSources || privateSources.insufficient === true) {
    return privateSources;
  }

  const evidenceById = new Map(sourceEvidence.map((item) => [item.id, item]));
  const reliedOn = uniqueSourceIds(privateSources.relied_on);
  if (reliedOn.some((id) => evidenceById.get(id)?.reliableForFacts === true)) {
    return privateSources;
  }

  const currentTopic = sourceEvidence.find(
    (item) => item.id === 'current_topic' && item.reliableForFacts,
  );
  if (!currentTopic) {
    return privateSources;
  }

  const inferredByTitle = responseMentionsSourceTitle(response, currentTopic);
  const inferredByQuotedPhrase = responseMentionsQuotedSourcePhrase(
    response,
    currentTopic,
  );

  if (!inferredByTitle && !inferredByQuotedPhrase) {
    return privateSources;
  }

  return {
    ...privateSources,
    relied_on: [...reliedOn, currentTopic.id],
    reason: appendAuditReason(
      privateSources.reason,
      inferredByTitle
        ? 'Server inferred current_topic because the reply explicitly used the loaded topic title.'
        : 'Server inferred current_topic because the reply explicitly used a quoted phrase from the loaded topic.',
    ),
  };
}

function stripUnsupportedSourceBoundSentences(
  response: string,
  sourceAudit: ExchangeSourceAudit,
): { response: string; removedTerms: string[] } {
  const reliableSourceText = sourceAudit.evidence
    .filter((item) => item.reliableForFacts)
    .map((item) => item.excerpt)
    .filter(Boolean)
    .join(' ');
  if (!reliableSourceText) return { response, removedTerms: [] };

  const unsupportedTerms = SOURCE_BOUND_SENTENCE_TERMS.filter(
    (term) =>
      term.response.test(response) && !term.source.test(reliableSourceText),
  );
  if (unsupportedTerms.length === 0) return { response, removedTerms: [] };

  const unsupportedPatterns = unsupportedTerms.map((term) => term.response);
  const sentences = response.match(/[^.?!]+[.?!]?/g) ?? [response];
  const kept = sentences
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length > 0 &&
        !unsupportedPatterns.some((pattern) => pattern.test(sentence)),
    );
  const scrubbed = kept
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const fallback = reliableSourceText
    .split(/(?<=[.?!])\s+/)[0]
    ?.trim()
    .replace(/^[^:]{1,140}:\s+/, '');
  const scrubbedWordCount = scrubbed.split(/\s+/).filter(Boolean).length;

  return {
    response:
      scrubbed.length > 0 && scrubbedWordCount >= 6
        ? scrubbed
        : fallback
          ? fallback
          : response,
    removedTerms: unsupportedTerms.map((term) => term.label),
  };
}

// A reply is "procedural / non-factual" when it asserts no source-bound
// factual content of its own: a pure understanding-check / prompt question, a
// short acknowledgement or transition, or instructional scaffolding that asks
// the learner to act rather than stating facts. Such replies are safe to show
// even without auditable provenance because there is no unsupported factual
// claim to leak. This reuses the existing understanding-check detector
// (`detectUnderstandingCheckFromProse`) rather than inventing a fresh
// factual-claim NLP heuristic: anything that is NOT classified procedural is
// treated as a (potentially unsupported) factual reply and degraded safely.
const PROCEDURAL_REPLY_PATTERNS: RegExp[] = [
  /\bwhat (?:do you|would you|can you)\b/i,
  /\bcan you (?:tell me|explain|describe|try|show me|share)\b/i,
  /\bcould you (?:tell me|explain|describe|try|show me|share)\b/i,
  /\b(?:go ahead and|try to|let'?s|why don'?t you|how about you|see if you can)\b/i,
  /\bwhat'?s (?:your|the) (?:next step|first step|guess|thinking)\b/i,
  /\bwhere (?:would|do) you (?:start|begin)\b/i,
  /\b(?:share|send|upload|paste) (?:the|your|that)\b/i,
  /\bwhich part\b/i,
];

function replySentences(response: string): string[] {
  return (response.match(/[^.?!]+[.?!]?/g) ?? [response])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * True when the learner-visible reply contains no source-bound factual
 * assertion of its own. Used by the `missing_private_sources` recovery branch
 * to decide whether an un-provenanced reply may be shown as-is (procedural /
 * non-factual) or must be hard-fallbacked (it carries unsupported facts).
 *
 * Conservative by construction: a reply is procedural ONLY when EVERY
 * declarative sentence is also a recognised understanding-check / prompt /
 * acknowledgement. Any sentence that is neither a question nor a known
 * procedural prompt is assumed to be a factual claim — so the default for an
 * ambiguous reply is "unsafe", which is the safe direction for this contract.
 */
export function isProceduralOrNonFactualReply(response: string): boolean {
  const trimmed = response.replace(/\s+/g, ' ').trim();
  if (!trimmed) return true; // empty reply has no factual claim to leak

  const sentences = replySentences(trimmed);
  return sentences.every((sentence) => {
    if (sentence.endsWith('?')) return true; // a question asserts no fact
    if (detectUnderstandingCheckFromProse(sentence)) return true;
    if (PROCEDURAL_REPLY_PATTERNS.some((pattern) => pattern.test(sentence))) {
      return true;
    }
    // A bare acknowledgement / transition with no clause longer than a few
    // words carries no factual assertion (e.g. "Okay.", "Good — let's keep
    // going"). Reuse the learner-side acknowledgement clause check, which is
    // already tuned for ack/transition phrasing.
    return isAcknowledgementOnlyTurn(sentence, true);
  });
}

export function applySourceAuditSafetyFallback(
  response: string,
  sourceAudit: ExchangeSourceAudit,
): { response: string; sourceAudit: ExchangeSourceAudit } {
  // [BUG-798] `missing_private_sources` (plain prose with no private_sources)
  // and `parse_failed` (malformed JSON whose `reply` text was recovered) both
  // mean the model produced usable learner-visible text but emitted NO
  // auditable provenance. The private-provenance contract requires source-bound
  // factual claims to carry provenance or degrade safely. The phrase-scrub path
  // below only removes claims that match the fixed SOURCE_BOUND_SENTENCE_TERMS
  // list, so an unsupported factual claim OUTSIDE that list would otherwise be
  // shown and persisted with zero provenance. Treat both un-provenanced
  // statuses as UNSAFE for factual replies and hard-fallback — UNLESS the reply
  // is procedural / non-factual (a question, prompt, or acknowledgement that
  // asserts no facts of its own), which carries nothing to leak.
  if (
    sourceAudit.status === 'missing_private_sources' ||
    sourceAudit.status === 'parse_failed'
  ) {
    // App-help turns inject the server-owned `app_help_map` as reliable
    // evidence. App navigation guidance ("you can find your notes in Library")
    // is grounded in that server content by construction, not a learner-
    // supplied source, and `applyAppHelpSignalGuard` already neutralizes its
    // learning signals upstream. Exempt it from the source-bound hard-fallback
    // so the existing app-help behavior does not regress.
    const isAppHelpGrounded =
      sourceAudit.availableReliableSourceIds.includes('app_help_map');
    if (isAppHelpGrounded || isProceduralOrNonFactualReply(response)) {
      return { response, sourceAudit };
    }
    return {
      response: buildUnsupportedFactualReply(sourceAudit),
      sourceAudit: {
        ...sourceAudit,
        insufficient: true,
        reason: appendAuditReason(
          sourceAudit.reason,
          `Server hard-fell-back because the reply made source-bound factual claims with no auditable private_sources (${sourceAudit.status}).`,
        ),
      },
    };
  }

  const reliedOnGeneralKnowledge =
    sourceAudit.reliableReliedOnSourceIds.includes(GENERAL_KNOWLEDGE_SOURCE_ID);
  const onlyGeneralKnowledgeAvailable =
    sourceAudit.availableReliableSourceIds.length > 0 &&
    sourceAudit.availableReliableSourceIds.every(
      (id) => id === GENERAL_KNOWLEDGE_SOURCE_ID,
    );
  const needsGeneralKnowledgeFallback =
    reliedOnGeneralKnowledge &&
    sourceAudit.status === 'insufficient_reliable_sources';
  const onlyReliedOnGeneralKnowledge =
    sourceAudit.reliableReliedOnSourceIds.length > 0 &&
    sourceAudit.reliableReliedOnSourceIds.every(
      (id) => id === GENERAL_KNOWLEDGE_SOURCE_ID,
    );
  const needsNoSourceFallback =
    (sourceAudit.availableReliableSourceIds.length === 0 ||
      onlyGeneralKnowledgeAvailable ||
      needsGeneralKnowledgeFallback) &&
    (sourceAudit.status === 'missing_reliable_source' ||
      sourceAudit.status === 'insufficient_reliable_sources' ||
      sourceAudit.status === 'unsupported_sources');

  if (!needsNoSourceFallback) {
    if (onlyReliedOnGeneralKnowledge) {
      return { response, sourceAudit };
    }

    const scrubbed = stripUnsupportedSourceBoundSentences(
      response,
      sourceAudit,
    );
    if (scrubbed.removedTerms.length === 0) {
      return { response, sourceAudit };
    }

    return {
      response: scrubbed.response,
      sourceAudit: {
        ...sourceAudit,
        reason: appendAuditReason(
          sourceAudit.reason,
          `Server removed unsupported source-bound phrase(s): ${scrubbed.removedTerms.join(', ')}.`,
        ),
      },
    };
  }

  return {
    response: buildUnsupportedFactualReply(sourceAudit),
    sourceAudit: {
      ...sourceAudit,
      status: 'insufficient_reliable_sources',
      insufficient: true,
      reason: sourceFallbackReason(sourceAudit.reason),
    },
  };
}

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
/**
 * Build a synthetic crisis envelope JSON for a deterministic tripwire hit, so
 * the streaming path's `classifyExchangeOutcome` parses a real envelope (and
 * persists the safe canned reply) instead of treating the short-circuit as an
 * orphan fallback. `crisis_redirect` is set true so any envelope-aware consumer
 * sees the same signal the model would have emitted.
 */
function buildTripwireEnvelope(category: CatastrophicCategory): string {
  return JSON.stringify({
    reply: tripwireResponse(category),
    signals: { crisis_redirect: true },
    confidence: 'high',
  });
}

/**
 * Non-streaming ExchangeResult for a deterministic tripwire hit. The LLM is
 * never called — `provider`/`model` record that the response was produced by
 * the safety floor, not a model.
 */
function buildTripwireResult(
  category: CatastrophicCategory,
  context: ExchangeContext,
): ExchangeResult {
  const response = tripwireResponse(category);
  return {
    response,
    newEscalationRung: context.escalationRung,
    isUnderstandingCheck: false,
    expectedResponseMinutes: estimateExpectedResponseMinutes(response, context),
    needsDeepening: false,
    partialProgress: false,
    provider: 'safety-tripwire',
    model: `deterministic:${category}`,
    latencyMs: 0,
    readyToFinish: false,
  };
}

export async function processExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData,
): Promise<ExchangeResult> {
  // [Safety tripwire, 2026-06-06] Deterministic floor for the catastrophic
  // categories (self-harm method-seeking, sexual content involving a minor).
  // Detection runs on the INPUT before the LLM is called, so the floor holds
  // even if the model is jailbroken — we never hand the worst inputs to the
  // model and never depend on it behaving. On a hit we escalate to the same
  // crisis path the model uses (structured event + safe canned reply), never
  // a refusal wall. See safety-tripwire.ts for why this is not a word list.
  const inputTrip = detectCatastrophicSafetyTrigger(userMessage);
  if (inputTrip) {
    await emitCrisisRedirectEvent({
      sessionId: context.sessionId,
      profileId: context.profileId,
      flow: `exchange.process.tripwire.${inputTrip.category}`,
    });
    return buildTripwireResult(inputTrip.category, context);
  }

  const appHelpTurn = isAppHelpQuery(userMessage);
  const sourceEvidence = buildExchangeSourceEvidence(context, userMessage, {
    appHelpTurn,
  });
  const promptContext: ExchangeContext = { ...context, sourceEvidence };
  const systemPrompt = _buildSystemPrompt(promptContext, {
    includeAppHelpMap: appHelpTurn,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role,
      content: e.role === 'user' ? sanitizeUserContent(e.content) : e.content,
    })),
    {
      role: 'user' as const,
      content: buildUserContent(sanitizeUserContent(userMessage), imageData),
    },
  ];

  const ageBracket = resolveAgeBracket(context.birthYear);
  const routingRung = context.llmRoutingRung ?? context.escalationRung;
  const result: RouteResult = await routeAndCall(messages, routingRung, {
    llmTier: context.llmTier,
    preferredProvider: context.preferredLlmProvider,
    providerPolicy: context.llmProviderPolicy,
    ageBracket,
    // BKT-C.1 — forward profile-level personalization to the router so the
    // safety preamble carries it on every provider uniformly.
    conversationLanguage: context.conversationLanguage,
    pronouns: context.pronouns,
    flow: 'exchange.process',
    sessionId: context.sessionId,
    responseFormat: 'json',
  });

  const parsed = parseExchangeEnvelope(result.response, {
    sessionId: context.sessionId,
    profileId: context.profileId,
    flow: 'processExchange',
  });
  const finalParsed = appHelpTurn ? applyAppHelpSignalGuard(parsed) : parsed;

  // [H2/H7] Crisis redirect fired — emit the structured safety event before
  // anything else can short-circuit. safeSend guarantees a dispatch failure
  // never breaks the learner-facing exchange.
  if (finalParsed.crisisRedirect) {
    await emitCrisisRedirectEvent({
      sessionId: context.sessionId,
      profileId: context.profileId,
      flow: 'exchange.process',
      provider: result.provider,
      model: result.model,
    });
  }

  const privateSourcesForAudit = inferObviousReliableSourceForAudit(
    finalParsed.privateSources,
    sourceEvidence,
    finalParsed.cleanResponse,
  );
  const sourceAudit = auditExchangeSources(
    privateSourcesForAudit,
    sourceEvidence,
    {
      envelopeParseFailed: finalParsed.envelopeParseFailed,
    },
  );
  const sourceSafe = applySourceAuditSafetyFallback(
    finalParsed.cleanResponse,
    sourceAudit,
  );

  return {
    response: sourceSafe.response,
    newEscalationRung: context.escalationRung,
    isUnderstandingCheck: finalParsed.understandingCheck,
    expectedResponseMinutes: estimateExpectedResponseMinutes(
      sourceSafe.response,
      context,
    ),
    needsDeepening: finalParsed.needsDeepening,
    partialProgress: finalParsed.partialProgress,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    notePrompt: finalParsed.notePrompt || undefined,
    notePromptPostSession: finalParsed.notePromptPostSession || undefined,
    challengeRoundOffer: finalParsed.challengeRoundOffer || undefined,
    challengeRoundEvaluation: finalParsed.challengeRoundEvaluation,
    noteDraft: finalParsed.noteDraft,
    fluencyDrill: finalParsed.fluencyDrill ?? undefined,
    confidence: finalParsed.confidence,
    retrievalScore: finalParsed.retrievalScore,
    envelopeParseFailed: finalParsed.envelopeParseFailed,
    envelopeParseFailureReason: finalParsed.envelopeParseFailureReason,
    sourceAudit: sourceSafe.sourceAudit,
    // [F1.1 / BUG-92] Expose the interview-close signal to upstream callers so
    // session-exchange / interview routes can terminate the loop without
    // re-parsing the envelope. App-help guard already forces it to false via
    // applyAppHelpSignalGuard for app-help turns. Hard cap stays the caller's
    // responsibility — never trust this flag alone.
    readyToFinish: finalParsed.readyToFinish,
    // Bug #348: pass the EVALUATE / TEACH_BACK assessment signals through to
    // session-exchange.persistExchangeResult so they land at
    // aiMetadata.signals.{evaluate_assessment,teach_back_assessment} on the
    // ai_response row, where parseEvaluate/TeachBackAssessment read them back.
    evaluateAssessment: finalParsed.evaluateAssessment,
    teachBackAssessment: finalParsed.teachBackAssessment,
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
  imageData?: ImageData,
): Promise<ExchangeStreamResult> {
  // [Safety tripwire, 2026-06-06] Same deterministic input-side floor as
  // processExchange. On a hit we stream the safe canned reply (no LLM call) and
  // resolve rawResponsePromise to a synthetic crisis envelope so the caller's
  // classifyExchangeOutcome persists the safe reply rather than an orphan
  // fallback. The structured safety event is emitted here, deterministically.
  const inputTrip = detectCatastrophicSafetyTrigger(userMessage);
  if (inputTrip) {
    await emitCrisisRedirectEvent({
      sessionId: context.sessionId,
      profileId: context.profileId,
      flow: `exchange.stream.tripwire.${inputTrip.category}`,
    });
    const safeReply = tripwireResponse(inputTrip.category);
    const rawEnvelope = buildTripwireEnvelope(inputTrip.category);
    async function* singleChunk(): AsyncIterable<string> {
      yield safeReply;
    }
    return {
      stream: singleChunk(),
      rawResponsePromise: Promise.resolve(rawEnvelope),
      newEscalationRung: context.escalationRung,
      provider: 'safety-tripwire',
      model: `deterministic:${inputTrip.category}`,
      sourceEvidence: buildExchangeSourceEvidence(context, userMessage, {
        appHelpTurn: false,
      }),
    };
  }

  const appHelpTurn = isAppHelpQuery(userMessage);
  const sourceEvidence = buildExchangeSourceEvidence(context, userMessage, {
    appHelpTurn,
  });
  const promptContext: ExchangeContext = { ...context, sourceEvidence };
  const systemPrompt = _buildSystemPrompt(promptContext, {
    includeAppHelpMap: appHelpTurn,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role,
      content: e.role === 'user' ? sanitizeUserContent(e.content) : e.content,
    })),
    {
      role: 'user' as const,
      content: buildUserContent(sanitizeUserContent(userMessage), imageData),
    },
  ];

  const ageBracket = resolveAgeBracket(context.birthYear);
  const routingRung = context.llmRoutingRung ?? context.escalationRung;
  const result: StreamResult = await routeAndStream(messages, routingRung, {
    llmTier: context.llmTier,
    preferredProvider: context.preferredLlmProvider,
    providerPolicy: context.llmProviderPolicy,
    ageBracket,
    conversationLanguage: context.conversationLanguage,
    pronouns: context.pronouns,
    flow: 'exchange.stream',
    sessionId: context.sessionId,
    responseFormat: 'json',
  });

  const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
    result.stream,
  );

  return {
    stream: cleanReplyStream,
    rawResponsePromise,
    newEscalationRung: context.escalationRung,
    provider: result.provider,
    model: result.model,
    sourceEvidence,
    get fallbackUsed() {
      return result.fallbackUsed;
    },
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
  /** Safety: crisis-redirect rule fired this turn (H2, 2026-06-05 safety audit). Observational — drives structured safety logging, never flow control. */
  crisisRedirect: boolean;
  notePrompt: boolean;
  notePromptPostSession: boolean;
  /** Challenge Round: model proposed an offer; caller gates eligibility. */
  challengeRoundOffer: boolean;
  /** Challenge Round: per-concept answer evaluations. */
  challengeRoundEvaluation: ChallengeRoundEvaluationItem[];
  /** Challenge Round: learner-reviewed note draft hint from the envelope. */
  noteDraft: ChallengeRoundNoteDraftHint | null;
  fluencyDrill: FluencyDrillAnnotation | null;
  /** F6: LLM self-reported confidence level. Absent means treat as 'medium'. */
  confidence?: 'low' | 'medium' | 'high';
  /** Continuation opener score from the envelope, 0-1. */
  retrievalScore?: number;
  /** True when the LLM did not return a valid response envelope. */
  envelopeParseFailed?: boolean;
  /** Parser failure reason when envelopeParseFailed is true. */
  envelopeParseFailureReason?: ParseEnvelopeFailureReason;
  /** Private source IDs emitted by the model for provenance auditing. */
  privateSources?: ExchangePrivateSources;
  /**
   * Interview-specific: LLM signalled readiness to close the interview.
   * False for non-interview flows and for every fallback-shaped parse result.
   * Surfaced here so callers that already hold a `ClassifiedExchangeOutcome`
   * don't have to re-parse the envelope a second time.
   */
  readyToFinish: boolean;
  /**
   * Bug #348: EVALUATE assessment signal (snake_case wire shape) lifted from
   * `envelope.signals.evaluate_assessment`. Forwarded verbatim so the
   * persistence layer can write it under `aiMetadata.signals.evaluate_assessment`
   * where `parseEvaluateAssessment` (services/evaluate.ts) reads it back.
   * Undefined when the LLM did not emit the signal (i.e. non-EVALUATE turns).
   */
  evaluateAssessment?: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['evaluate_assessment']
  >;
  /**
   * Bug #348: TEACH_BACK assessment signal (snake_case wire shape) lifted from
   * `envelope.signals.teach_back_assessment`. Forwarded verbatim so the
   * persistence layer can write it under
   * `aiMetadata.signals.teach_back_assessment` where `parseTeachBackAssessment`
   * (services/teach-back.ts) reads it back. Undefined when the LLM did not
   * emit the signal (i.e. non-TEACH_BACK turns).
   */
  teachBackAssessment?: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['teach_back_assessment']
  >;
}

const EMPTY_PARSED_ENVELOPE: ParsedExchangeEnvelope = {
  cleanResponse: '',
  understandingCheck: false,
  partialProgress: false,
  needsDeepening: false,
  crisisRedirect: false,
  notePrompt: false,
  notePromptPostSession: false,
  challengeRoundOffer: false,
  challengeRoundEvaluation: [],
  noteDraft: null,
  fluencyDrill: null,
  confidence: undefined,
  retrievalScore: undefined,
  privateSources: undefined,
  readyToFinish: false,
  evaluateAssessment: undefined,
  teachBackAssessment: undefined,
};

// ExchangeFallback + ExchangeFallbackReason are imported from
// @eduagent/schemas so the wire contract for the SSE `fallback` frame is
// shared with the mobile client. Do not redefine them here.
export type { ExchangeFallback, ExchangeFallbackReason };

export interface ClassifiedExchangeOutcome {
  parsed: ParsedExchangeEnvelope;
  fallback?: ExchangeFallback;
}

// Markers that have a live UI consumer in mobile. A "handled marker" is NOT
// an orphan_marker fallback — parseExchangeEnvelope already extracts it into
// parsed.notePrompt / parsed.fluencyDrill, the route forwards these on the
// `done` frame, and mobile dispatches the corresponding widget. Audit
// (2026-04-24): use-session-streaming.ts reads notePrompt + fluencyDrill +
// notePromptPostSession via the done frame; no consumer for escalationHold
// today, so it remains an orphan_marker (loud so missing wiring surfaces).
//
// Update this set when a new marker handler is wired. Adding a key here
// without wiring the handler will silently suppress the orphan_marker
// fallback — guard with an integration test that exercises the dispatch.
export type HandledMarkerKey = 'notePrompt' | 'fluencyDrill';
export const HANDLED_MARKER_KEYS: ReadonlySet<string> =
  new Set<HandledMarkerKey>(['notePrompt', 'fluencyDrill']);

const DEFAULT_FALLBACK_TEXT = "I didn't have a reply — tap to try again.";
const GENERIC_PRAISE_SENTENCE_RE =
  /(?:^|[\s\n]+)(?:[¡!]*\s*)?(?:(?:nice|perfecto|perfect|bien hecho)(?:,\s+\w+)?\s*[.?!]|(?:(?:you did a )?great job|great work|nice work|nice job|nice one|that(?:'s| is| was) (?:great|nice|excellent|perfect)|that(?:'s| is| was) a (?:good|great) (?:start|idea|observation|summary|point)|great (?:idea|observation|summary|point)|good question|great question|you've got a good grasp|excellent|amazing|awesome|fantastic)(?:[^.?!]*)(?:[.?!]|$))/gi;
const UNSUPPORTED_SOFT_VALIDATION_SENTENCE_RE =
  /(?:^|[\s\n]+)(?:(?:that(?:'s| is) an? idea about)|(?:that(?:'s| is) an? )?(?:interesting idea|interesting thought|good observation|fair point))(?:[^.?!]*)(?:[.?!]|$)/gi;
const OVERHEATED_PHRASE_RE =
  /\b(super important|very important|really important|crucial|super useful)\b/gi;
const OVERHEATED_ADVERB_RE = /\b(definitely|absolutely|incredibly)\b[,\s]*/gi;
const CHILDISH_TONE_RE = /\byummy\s+/gi;

function normalizeInflatedStyle(text: string): string {
  return text
    .replace(OVERHEATED_PHRASE_RE, (match) =>
      /useful/i.test(match) ? 'useful' : 'important',
    )
    .replace(OVERHEATED_ADVERB_RE, '')
    .replace(CHILDISH_TONE_RE, '')
    .replace(/\bThat(?:'s| is) a\s+The\b/g, 'The')
    .replace(/\ba important\b/gi, 'an important')
    .replace(/[^\S\r\n]{2,}/g, ' ');
}

// Shared bounds for fluency-drill duration, used by both the full-envelope
// and bare-marker code paths so the clamp definition can't drift.
function clampDrillDuration(seconds: number): number {
  return Math.min(90, Math.max(15, seconds));
}

function cleanLearnerVisibleReply(text: string): string {
  return normalizeInflatedStyle(stripPhoneticHints(text))
    .replace(GENERIC_PRAISE_SENTENCE_RE, '')
    .replace(UNSUPPORTED_SOFT_VALIDATION_SENTENCE_RE, '')
    .replace(/\bThat(?:'s| is) a\s+The\b/g, 'The')
    .replace(/^[A-Z][A-Za-z'-]{1,40}!\s+(?=(?:Let|We|I|Start|Ready)\b)/, '')
    .replace(/(?:^|\n)\s*That(?:'s| is)\s*(?=\n|$)/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsedFromVisibleFallbackText(text: string): ParsedExchangeEnvelope {
  const cleanResponse = cleanLearnerVisibleReply(
    stripEmbeddedEnvelopeTail(normalizeReplyText(text)).trim(),
  );
  return {
    ...EMPTY_PARSED_ENVELOPE,
    cleanResponse,
    understandingCheck: detectUnderstandingCheckFromProse(cleanResponse),
  };
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
  context?: { sessionId?: string; profileId?: string; flow?: string },
): ParsedExchangeEnvelope {
  // [BUG-847] Tag the surface so parser-side telemetry can distinguish
  // session-flow parse failures from silent_classify ones below.
  const parsed = parseEnvelope(response, 'exchange.session');
  if (!parsed.ok) {
    logger.warn('exchange.envelope_parse_failed', {
      flow: context?.flow,
      session_id: context?.sessionId,
      profile_id: context?.profileId,
      reason: parsed.reason,
    });
    // [BUG-934] When the envelope is structurally JSON with a `reply` field
    // but fails Zod (e.g. fluency_drill duration_s violates min(15)), extract
    // the reply directly instead of persisting the raw envelope JSON. Raw
    // JSON ends up in ai_response.content and leaks into resumed-session
    // transcripts, parent dashboards, embeddings, and the next turn's LLM
    // exchangeHistory. The transcript projection helper is defense-in-depth
    // for legacy rows; this is the canonical fix at the persistence boundary.
    // [BUG-935] Apply normalizeReplyText so any literal `\n` from a
    // double-escaping LLM becomes a real newline before persistence —
    // matches the streaming path's createLiteralEscapeNormalizer behavior.
    const replyCandidate = extractReplyCandidate(response);
    const fallbackText =
      replyCandidate && replyCandidate.length > 0
        ? stripEmbeddedEnvelopeTail(normalizeReplyText(replyCandidate))
        : stripEmbeddedEnvelopeTail(normalizeReplyText(response.trim()));
    return {
      // [BUG-865] Strip TTS pronunciation hints from chat-visible text.
      cleanResponse: cleanLearnerVisibleReply(fallbackText),
      understandingCheck: detectUnderstandingCheckFromProse(fallbackText),
      partialProgress: false,
      needsDeepening: false,
      crisisRedirect: false,
      notePrompt: false,
      notePromptPostSession: false,
      challengeRoundOffer: false,
      challengeRoundEvaluation: [],
      noteDraft: null,
      fluencyDrill: null,
      readyToFinish: false,
      envelopeParseFailed: true,
      envelopeParseFailureReason: parsed.reason,
    };
  }

  return envelopeToParsedExchange(parsed.envelope);
}

// Map an already-parsed (Zod-validated) envelope into the flat exchange shape.
// Split out so callers that already hold a `LlmResponseEnvelope` (e.g.
// classifyExchangeOutcome) don't re-run `parseEnvelope` on the raw response.
function envelopeToParsedExchange(
  envelope: LlmResponseEnvelope,
): ParsedExchangeEnvelope {
  const signals = envelope.signals ?? {};
  const uiHints = envelope.ui_hints ?? {};
  // [BUG-865] Phonetic hints like "de-nom-i-nay-tor" coach the TTS path
  // but render verbatim in chat bubbles. Strip them here so every consumer
  // (text + audio) sees the same clean reply. There is no SSML re-emission
  // pipeline today — the LLM hint is dropped on the floor for TTS too. If
  // pronunciation regresses on long words, restore via SSML at the audio
  // boundary, not by passing the dashed form through.
  const cleanReply = cleanLearnerVisibleReply(envelope.reply);

  const notePrompt = uiHints.note_prompt;
  const drill = uiHints.fluency_drill;
  const fluencyDrill: FluencyDrillAnnotation | null = drill
    ? {
        active: Boolean(drill.active),
        durationSeconds:
          typeof drill.duration_s === 'number'
            ? clampDrillDuration(drill.duration_s)
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
    crisisRedirect: signals.crisis_redirect === true,
    notePrompt: notePrompt?.show === true,
    notePromptPostSession: notePrompt?.post_session === true,
    challengeRoundOffer: signals.challenge_round_offer === true,
    challengeRoundEvaluation: signals.challenge_round_evaluation ?? [],
    noteDraft: uiHints.note_draft ?? null,
    fluencyDrill,
    confidence: envelope.confidence,
    privateSources: envelope.private_sources,
    retrievalScore:
      typeof signals.retrieval_score === 'number'
        ? signals.retrieval_score
        : undefined,
    readyToFinish: signals.ready_to_finish === true,
    // Bug #348: forward EVALUATE / TEACH_BACK assessment signals verbatim
    // (snake_case wire shape). The persistence layer writes them under
    // aiMetadata.signals.{evaluate_assessment,teach_back_assessment} where the
    // downstream parsers in services/evaluate.ts and services/teach-back.ts
    // expect to find them. Without this hop, every EVALUATE/TEACH_BACK
    // assessment is silently dropped between LLM and ai_response row.
    evaluateAssessment: signals.evaluate_assessment,
    teachBackAssessment: signals.teach_back_assessment,
  };
}

// Pulls handled-marker values out of a bare-marker payload (no `reply`).
// Only reads HANDLED_MARKER_KEYS so an unexpected key never sneaks through.
function parseHandledMarker(response: string): ParsedExchangeEnvelope {
  const base: ParsedExchangeEnvelope = { ...EMPTY_PARSED_ENVELOPE };
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return base;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return base;
  }
  const obj = parsed as Record<string, unknown>;

  if (obj['notePrompt'] === true) {
    base.notePrompt = true;
  }

  const drill = obj['fluencyDrill'];
  if (drill && typeof drill === 'object' && !Array.isArray(drill)) {
    const drillObj = drill as Record<string, unknown>;
    base.fluencyDrill = {
      active: drillObj['active'] === true,
      durationSeconds:
        typeof drillObj['duration_s'] === 'number'
          ? clampDrillDuration(drillObj['duration_s'] as number)
          : undefined,
      score:
        drillObj['score'] &&
        typeof drillObj['score'] === 'object' &&
        typeof (drillObj['score'] as { correct?: unknown }).correct ===
          'number' &&
        typeof (drillObj['score'] as { total?: unknown }).total === 'number'
          ? {
              correct: (drillObj['score'] as { correct: number }).correct,
              total: (drillObj['score'] as { total: number }).total,
            }
          : undefined,
    };
  }

  return base;
}

// Returns the first matching known-marker key, or null if not marker-shaped.
// Shares KNOWN_MARKER_KEYS with isRecognizedMarker so the two views of
// "what counts as a marker" never drift.
function extractKnownMarkerKey(response: string): string | null {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if ('reply' in obj) return null; // a full envelope, not a marker
  for (const key of Object.keys(obj)) {
    if (KNOWN_MARKER_KEYS.has(key)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// classifyExchangeOutcome — wraps parseExchangeEnvelope and classifies the
// outcome into a fallback bucket per spec §4.1a. Used by streamMessage and
// streamInterviewExchange onComplete to decide whether to persist the
// ai_response row, refund quota, and emit a dedicated SSE `fallback` event
// in the route layer.
//
// The three reason buckets are distinct on purpose (spec §7): they let
// triage separate "LLM format drift" (malformed_envelope) from
// "widget-trigger without handler" (orphan_marker) from "LLM refused to
// answer" (empty_reply) without parsing Inngest event names.
//
// Handled markers (notePrompt, fluencyDrill) do NOT trigger a fallback —
// they route through the normal envelope-parse pipeline so the mobile
// dispatch path still runs. Guarded by the regression test
// "NO fallback for known dispatched markers" in exchanges.test.ts.
// ---------------------------------------------------------------------------
export function classifyExchangeOutcome(
  rawResponse: string,
  _context?: { sessionId?: string; profileId?: string; flow?: string },
): ClassifiedExchangeOutcome {
  // [BUG-847] Distinct surface tag — silent_classify is the marker-only
  // fallback path, expected to fail full envelope validation more often.
  const envelopeResult = parseEnvelope(rawResponse, 'exchange.silent_classify');

  // Normal envelope path — parsed cleanly; classify empty reply here.
  // Pass the already-validated envelope to envelopeToParsedExchange so we
  // don't redo the Zod validation a second time.
  if (envelopeResult.ok) {
    const parsed = envelopeToParsedExchange(envelopeResult.envelope);
    if (parsed.cleanResponse.trim() === '') {
      return {
        parsed,
        fallback: {
          reason: 'empty_reply',
          fallbackText: DEFAULT_FALLBACK_TEXT,
        },
      };
    }
    return { parsed };
  }

  // Envelope parse failed. Several sub-cases need separate treatment before
  // declaring the response unrecoverable:
  //   1. Payload has a reply field but it's empty/whitespace → empty_reply
  //      (schema violation: reply: z.string().min(1)). Semantically the LLM
  //      refused to answer, not a format drift.
  //   2. Payload has a non-empty reply but invalid side-channel fields →
  //      recover the visible reply and default signals/UI hints. The learner
  //      should not lose a good answer because `duration_s` or another
  //      non-visible field drifted.
  //   3. Plain prose with no JSON → recover as visible text. This is still
  //      logged by parseEnvelope above, but it is not a user-facing dead end.
  //   4. Marker-shaped payloads with no `reply` field → HANDLED markers
  //      pass through, unhandled markers become orphan_marker.
  // Anything else has no safe learner-facing text and becomes
  // malformed_envelope.
  const replyCandidate = extractReplyCandidate(rawResponse);
  if (replyCandidate !== undefined && replyCandidate.trim().length === 0) {
    return {
      parsed: { ...EMPTY_PARSED_ENVELOPE },
      fallback: {
        reason: 'empty_reply',
        fallbackText: DEFAULT_FALLBACK_TEXT,
      },
    };
  }
  if (replyCandidate !== undefined) {
    return { parsed: parsedFromVisibleFallbackText(replyCandidate) };
  }

  const markerKey = extractKnownMarkerKey(rawResponse);

  if (markerKey !== null && HANDLED_MARKER_KEYS.has(markerKey)) {
    // Marker has a downstream handler. Do NOT fallback — surface the
    // marker's value into the `parsed` shape directly so the route
    // forwards it on the `done` frame. parseExchangeEnvelope only reads
    // full envelopes; bare markers need targeted extraction here.
    return { parsed: parseHandledMarker(rawResponse) };
  }

  if (markerKey === null) {
    const trimmed = rawResponse.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('{')) {
      return { parsed: parsedFromVisibleFallbackText(trimmed) };
    }

    return {
      parsed: { ...EMPTY_PARSED_ENVELOPE },
      fallback: {
        reason: 'malformed_envelope',
        fallbackText: DEFAULT_FALLBACK_TEXT,
      },
    };
  }

  // Marker-shaped but no live handler — orphan. Surfaces missing wiring
  // loudly so a new marker key without a UI consumer can't ship silently.
  return {
    parsed: { ...EMPTY_PARSED_ENVELOPE },
    fallback: {
      reason: 'orphan_marker',
      fallbackText: DEFAULT_FALLBACK_TEXT,
    },
  };
}

/** Observational prose heuristic — never drives control flow on its own. */
function detectUnderstandingCheckFromProse(response: string): boolean {
  const lower = response.toLowerCase();
  return UNDERSTANDING_CHECK_PATTERNS.some((pattern) =>
    lower.includes(pattern.toLowerCase()),
  );
}
