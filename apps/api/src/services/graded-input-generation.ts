// ---------------------------------------------------------------------------
// Graded-input content generation (WI-1547).
//
// One-shot LLM call that generates a short reading/listening passage plus
// comprehension questions for the Four Strands "meaning-focused input"
// strand. Replaces the deterministic seed-passage template as the primary
// content source; the caller (language-session-engine.ts) falls back to the
// existing deterministic `buildSeedPassage` path on any failure here, so this
// function never throws — it returns null and lets the caller degrade.
// ---------------------------------------------------------------------------

import type { AgeBracket, CefrLevel } from '@eduagent/schemas';
import { z } from 'zod';
import { routeAndCall, parseStructuredLlmOutput } from './llm';
import { buildGradedInputGenerationPrompt } from './graded-input-prompts';
import { createLogger } from './logger';

const logger = createLogger();

const gradedInputGenerationResultSchema = z.object({
  text: z.string().min(1),
  // The prompt instructs the model to write exactly one comprehension
  // question (graded-input-prompts.ts), matching what the mobile
  // GradedInputCard displays today (comprehensionQuestions[0] only). The
  // max(2) ceiling is deliberate headroom, not a second generated-and-dropped
  // question: it tolerates a model that occasionally emits one extra item
  // without failing schema validation, for the day the card is extended to
  // show more than one question.
  comprehensionQuestions: z
    .array(
      z.object({
        prompt: z.string().min(1),
        answerHint: z.string().min(1),
      }),
    )
    .min(1)
    .max(2),
});

export type GradedInputGenerationResult = z.infer<
  typeof gradedInputGenerationResultSchema
>;

export interface GenerateGradedInputContentInput {
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords: string[];
  targetWords: string[];
  modality: 'reading' | 'listening';
  interests?: string[];
  /**
   * Fail-closed age bracket for MMT-ADR-0016 minor-safety routing — an
   * under-18 learner's generation call must never route to Gemini
   * (`router.ts` `isUnder18AgeBracket` gate). Callers should compute this the
   * same way the other minor-safety gates in session-exchange.ts do:
   * unknown/non-finite birthYear fails closed to 'child'.
   */
  ageBracket: AgeBracket;
}

/**
 * Extract label strings from a raw `learningProfile.interests` jsonb value.
 * The column's runtime shape is `InterestEntry[]` (`{ label, context }[]`),
 * not `string[]` — callers must not cast it directly (a TypeScript-only cast
 * doesn't change the runtime objects, and those objects reaching
 * `sanitizeXmlValue`'s `.trim()` throw a TypeError). Tolerates a legacy
 * `string[]` shape too. Non-string, non-`{label: string}` entries are dropped
 * rather than thrown on, matching this function's own never-throws contract.
 */
export function extractInterestLabels(
  rawInterests: unknown,
): string[] | undefined {
  if (!Array.isArray(rawInterests)) return undefined;
  return rawInterests.flatMap((entry): string[] => {
    if (typeof entry === 'string') return [entry];
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { label?: unknown }).label === 'string'
    ) {
      return [(entry as { label: string }).label];
    }
    return [];
  });
}

/**
 * Generate graded-input passage content via the LLM. Returns null (never
 * throws) on any failure — malformed input, missing/invalid JSON, schema
 * violation, or a network/provider error — so the caller can fall back to the
 * deterministic seed-passage template.
 *
 * Deliberately does NOT pass `conversationLanguage` to routeAndCall: the
 * router's personalization preamble instructs the model to write the JSON
 * "reply" field in that language, which is envelope-shaped guidance for the
 * conversational tutor turn. This call's schema has no "reply" field, and its
 * "text" field must be written in `languageCode` (the target/study language),
 * not the learner's conversation/UI language — passing conversationLanguage
 * would inject a conflicting instruction. For the same reason this flow is
 * not registered in the router's LEARNER_FACING_FLOWS set.
 */
export async function generateGradedInputContent(
  input: GenerateGradedInputContentInput,
): Promise<GradedInputGenerationResult | null> {
  try {
    // Building the prompt lives inside the try/catch alongside the LLM call:
    // this function's "never throws" contract must hold structurally — any
    // malformed input degrades to the deterministic fallback — not merely
    // because callers happen to pass well-shaped data.
    const messages = buildGradedInputGenerationPrompt({
      languageCode: input.languageCode,
      cefrLevel: input.cefrLevel,
      knownWords: input.knownWords,
      targetWords: input.targetWords,
      modality: input.modality,
      interests: input.interests,
    });
    const result = await routeAndCall(messages, 2, {
      flow: 'language.graded_input',
      ageBracket: input.ageBracket,
      responseFormat: 'json',
    });
    return parseStructuredLlmOutput(
      gradedInputGenerationResultSchema,
      result.response,
      'graded-input-generation',
    );
  } catch (error) {
    logger.warn(
      '[graded-input-generation] LLM call failed, falling back to deterministic passage',
      {
        metric: 'graded_input_generation_fallback',
        languageCode: input.languageCode,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return null;
  }
}
