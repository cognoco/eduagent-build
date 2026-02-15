import { routeAndCall, routeAndStream } from './llm';
import type {
  ChatMessage,
  EscalationRung,
  RouteResult,
  StreamResult,
} from './llm';
import { getEscalationPromptGuidance } from './escalation';

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
  sessionType: 'learning' | 'homework';
  escalationRung: EscalationRung;
  exchangeHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  personaType: 'TEEN' | 'LEARNER' | 'PARENT';
  priorLearningContext?: string;
  workedExampleLevel?: 'full' | 'fading' | 'problem_first';
}

/** Result of processing a single exchange */
export interface ExchangeResult {
  response: string;
  newEscalationRung: EscalationRung;
  isUnderstandingCheck: boolean;
  provider: string;
  model: string;
  latencyMs: number;
}

/** Streaming variant result */
export interface ExchangeStreamResult {
  stream: AsyncIterable<string>;
  newEscalationRung: EscalationRung;
  provider: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Understanding check markers
// ---------------------------------------------------------------------------

/** Markers the LLM uses to signal an understanding check */
const UNDERSTANDING_CHECK_PATTERNS = [
  '[UNDERSTANDING_CHECK]',
  'does that make sense',
  'can you explain that back',
  'what do you think',
  'how would you',
  'try to describe',
  'in your own words',
];

// ---------------------------------------------------------------------------
// System prompt assembly
// ---------------------------------------------------------------------------

/** Builds the full system prompt from exchange context */
export function buildSystemPrompt(context: ExchangeContext): string {
  const sections: string[] = [];

  // Role and identity
  sections.push(
    'You are EduAgent, a personalised AI tutor. Your goal is to help the learner understand concepts deeply, not just give answers.'
  );

  // Persona voice
  sections.push(getPersonaVoice(context.personaType));

  // Topic scope
  if (context.topicTitle) {
    let topicSection = `Current topic: ${context.topicTitle}`;
    if (context.topicDescription) {
      topicSection += `\nTopic description: ${context.topicDescription}`;
    }
    sections.push(topicSection);
  }

  // Subject
  sections.push(`Subject: ${context.subjectName}`);

  // Session type
  sections.push(getSessionTypeGuidance(context.sessionType));

  // Escalation state and guidance
  sections.push(
    getEscalationPromptGuidance(context.escalationRung, context.sessionType)
  );

  // Prior learning context
  if (context.priorLearningContext) {
    sections.push(context.priorLearningContext);
  }

  // Worked example level
  if (context.workedExampleLevel) {
    sections.push(getWorkedExampleGuidance(context.workedExampleLevel));
  }

  // Cognitive load management
  sections.push(
    'Cognitive load management:\n' +
      '- Introduce at most 1-2 new concepts per message.\n' +
      '- Build on what the learner already knows.\n' +
      '- Use concrete examples before abstract rules.'
  );

  // "Not Yet" framing
  sections.push(
    'Feedback framing:\n' +
      '- NEVER use words like "wrong", "incorrect", or "mistake".\n' +
      '- Use "Not yet" framing — the learner hasn\'t got it *yet*, and that is perfectly fine.\n' +
      '- Acknowledge effort and partial correctness before guiding further.'
  );

  return sections.join('\n\n');
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
export async function processExchange(
  context: ExchangeContext,
  userMessage: string
): Promise<ExchangeResult> {
  const systemPrompt = buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content: e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const result: RouteResult = await routeAndCall(
    messages,
    context.escalationRung
  );

  const isUnderstandingCheck = detectUnderstandingCheck(result.response);

  return {
    response: result.response,
    newEscalationRung: context.escalationRung,
    isUnderstandingCheck,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}

/**
 * Streaming variant — returns an async iterable of response chunks.
 *
 * Same prompt assembly as processExchange, but uses routeAndStream.
 */
export async function streamExchange(
  context: ExchangeContext,
  userMessage: string
): Promise<ExchangeStreamResult> {
  const systemPrompt = buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content: e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const result: StreamResult = await routeAndStream(
    messages,
    context.escalationRung
  );

  return {
    stream: result.stream,
    newEscalationRung: context.escalationRung,
    provider: result.provider,
    model: result.model,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPersonaVoice(personaType: 'TEEN' | 'LEARNER' | 'PARENT'): string {
  switch (personaType) {
    case 'TEEN':
      return (
        'Communication style: Casual and encouraging.\n' +
        'Use friendly, relatable language. Celebrate small wins.\n' +
        'Keep explanations concise and use analogies from everyday life.'
      );
    case 'LEARNER':
      return (
        'Communication style: Professional and focused.\n' +
        "Be direct and efficient. Respect the learner's time.\n" +
        'Use precise terminology with clear definitions when introducing new terms.'
      );
    case 'PARENT':
      return (
        'Communication style: Supportive and patient.\n' +
        'Provide thorough explanations. Offer encouragement.\n' +
        'Break complex concepts into manageable steps with clear progression.'
      );
    default:
      return 'Communication style: Professional and supportive.';
  }
}

function getSessionTypeGuidance(sessionType: 'learning' | 'homework'): string {
  if (sessionType === 'homework') {
    return (
      'Session type: HOMEWORK HELP\n' +
      'CRITICAL: This is a homework session. You must use ONLY Socratic questioning.\n' +
      'NEVER provide direct answers. Guide the learner to discover the answer themselves.\n' +
      'Ask questions that break the problem into smaller, manageable pieces.'
    );
  }
  return (
    'Session type: LEARNING\n' +
    'Help the learner understand concepts deeply.\n' +
    'You may explain concepts directly, use examples, and teach new material.\n' +
    'Balance explanation with questions to verify understanding.'
  );
}

function getWorkedExampleGuidance(
  level: 'full' | 'fading' | 'problem_first'
): string {
  switch (level) {
    case 'full':
      return (
        'Worked example level: FULL\n' +
        'Provide complete worked examples showing every step.\n' +
        'Explain the reasoning behind each step.'
      );
    case 'fading':
      return (
        'Worked example level: FADING\n' +
        'Provide partially worked examples with some steps omitted.\n' +
        'Ask the learner to fill in the missing steps.'
      );
    case 'problem_first':
      return (
        'Worked example level: PROBLEM FIRST\n' +
        'Present the problem first and let the learner attempt it.\n' +
        'Only provide worked examples if they struggle.'
      );
    default:
      return '';
  }
}

/** Detect whether the LLM response contains an understanding check */
function detectUnderstandingCheck(response: string): boolean {
  const lower = response.toLowerCase();
  return UNDERSTANDING_CHECK_PATTERNS.some((pattern) =>
    lower.includes(pattern.toLowerCase())
  );
}
