import {
  dictationReviewResultSchema,
  type DictationSentence,
  type DictationReviewResult,
} from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage, MessagePart } from '../llm';
import { sanitizeXmlValue } from '../llm/sanitize';
import { UpstreamLlmError } from '../../errors';
import { captureException } from '../sentry';
import { extractFirstJsonObject } from '../llm/extract-json';

// ---------------------------------------------------------------------------
// Dictation Review Service
//
// Accepts a photo of a child's handwritten dictation and the original sentences,
// sends them to the LLM as a multimodal message, and returns a structured
// breakdown of mistakes.
// ---------------------------------------------------------------------------

export interface BuildReviewSystemPromptParams {
  /** Learner's age in years — calibrates explanation complexity. Optional. */
  ageYears?: number;
  /**
   * Learner's preferred explanation styles — shapes the tone of mistake
   * explanations. Optional. Recognized values: 'humor', 'step-by-step',
   * 'stories', 'examples', 'analogies', 'diagrams'.
   */
  preferredExplanations?: string[];
  /**
   * Topics the learner has recently struggled with — used to direct targeted
   * feedback in the review. Optional. Medium/high confidence struggles only.
   */
  recentStruggles?: string[];
}

function buildExplanationStyleGuidance(
  params: BuildReviewSystemPromptParams,
): string {
  const { ageYears, preferredExplanations = [], recentStruggles } = params;

  const parts: string[] = [];

  // Age-based register
  if (ageYears !== undefined) {
    if (ageYears <= 11) {
      parts.push(
        'Use very simple, encouraging language — short sentences, everyday words, no grammar jargon. ' +
          'Say "you wrote X but it should be Y because…" not "this is a spelling error of type…".',
      );
    } else if (ageYears <= 14) {
      parts.push(
        'Use clear, direct explanations suitable for a middle-schooler. ' +
          'You can name grammar concepts (e.g. "silent letter", "comma splice") but keep it brief.',
      );
    } else {
      parts.push(
        'You may use precise grammar and punctuation terminology. ' +
          'Keep explanations concise — the learner can handle technical language.',
      );
    }
  }

  // Style preferences
  if (preferredExplanations.includes('humor')) {
    parts.push(
      'Add a touch of gentle, age-appropriate humour to explanations where it fits naturally — a playful tone helps the mistake stick in memory without feeling like a scolding.',
    );
  }
  if (preferredExplanations.includes('step-by-step')) {
    parts.push(
      'Structure each explanation as a numbered 1–2–3 breakdown: (1) what the mistake was, (2) the rule, (3) the correct version.',
    );
  }
  if (preferredExplanations.includes('stories')) {
    parts.push(
      'Where it fits, frame the correction as a tiny memorable story or mnemonic rather than a dry rule.',
    );
  }

  // [PROMPT-INJECT-8] struggle topics are stored LLM output — sanitize
  // each entry before joining so a crafted topic cannot inject directives.
  const safeStruggles =
    recentStruggles && recentStruggles.length > 0
      ? recentStruggles
          .map((s) => sanitizeXmlValue(s, 200))
          .filter((s) => s.length > 0)
      : [];
  const struggleHint =
    safeStruggles.length > 0
      ? `\nThe learner has recently struggled with: ${safeStruggles.join(
          ', ',
        )}. When reviewing their dictation, pay extra attention to errors related to these areas and provide targeted feedback.`
      : '';

  return (
    (parts.length > 0 ? '\n\nEXPLANATION STYLE:\n' + parts.join(' ') : '') +
    struggleHint
  );
}

export function buildReviewSystemPrompt(
  params: BuildReviewSystemPromptParams = {},
): string {
  const styleGuidance = buildExplanationStyleGuidance(params);

  return `You are a dictation review assistant. Your job is to compare a child's handwritten text (visible in the image) against the original dictation sentences.

TASK:
Carefully examine the handwritten text in the image. Compare each sentence to the original provided below.
Identify all errors including: spelling mistakes, missing words, extra words, wrong punctuation, capitalisation errors.

RESPOND WITH ONLY valid JSON in this exact format — no prose before or after:
{
  "totalSentences": <number of original sentences>,
  "correctCount": <number of sentences with zero errors>,
  "mistakes": [
    {
      "sentenceIndex": <0-based index of the original sentence>,
      "original": "<the original sentence text>",
      "written": "<what the child actually wrote, as best as you can read>",
      "error": "<short label: spelling | missing_word | extra_word | wrong_punctuation | capitalisation | other>",
      "correction": "<the corrected version of what the child wrote>",
      "explanation": "<brief, child-friendly explanation of the mistake in the child's language>"
    }
  ]
}

If there are no mistakes, return an empty array for "mistakes".
Generate explanations in the child's language as instructed.${styleGuidance}`;
}

/**
 * Default system prompt — identical to the pre-refactor static constant.
 * Kept as a named export so eval-harness adapters and any external callers
 * that reference SYSTEM_PROMPT directly continue to compile without changes.
 */
export const SYSTEM_PROMPT = buildReviewSystemPrompt();

export type { DictationReviewResult };

export interface ReviewDictationInput {
  sentences: DictationSentence[];
  imageBase64: string;
  imageMimeType: string;
  language: string;
  /** Learner's age in years — used to calibrate explanation complexity. Optional. */
  ageYears?: number;
  /** Learner's preferred explanation styles — used to tune mistake explanations. Optional. */
  preferredExplanations?: string[];
  /**
   * Topics the learner has recently struggled with — used to direct targeted
   * feedback in the review. Optional. Medium/high confidence struggles only.
   */
  recentStruggles?: string[];
}

export async function reviewDictation(
  input: ReviewDictationInput,
): Promise<DictationReviewResult> {
  const {
    sentences,
    imageBase64,
    imageMimeType,
    language,
    ageYears,
    preferredExplanations,
    recentStruggles,
  } = input;

  // [PROMPT-INJECT-8] sentence text comes from the prepare-homework pipeline
  // (LLM output) and `language` is an ISO code. Sanitize both to guard
  // against stored prompt injection.
  const originalText = sentences
    .map((s, i) => `${i + 1}. ${sanitizeXmlValue(s.text, 500)}`)
    .join('\n');
  const safeLanguage = sanitizeXmlValue(language, 40);

  const userContent: MessagePart[] = [
    { type: 'inline_data', mimeType: imageMimeType, data: imageBase64 },
    {
      type: 'text',
      text: `Original sentences:\n${originalText}\n\nPlease generate all explanations in ${safeLanguage}.`,
    },
  ];

  const systemPrompt = buildReviewSystemPrompt({
    ageYears,
    preferredExplanations,
    recentStruggles,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  // Rung 2 — vision-capable model required
  const result = await routeAndCall(messages, 2);

  if (!result.response || result.response.trim() === '') {
    const err = new UpstreamLlmError(
      'LLM returned empty response in review-dictation',
    );
    captureException(err, { requestPath: 'services/dictation/review' });
    throw err;
  }

  const jsonStr = extractFirstJsonObject(result.response);
  if (!jsonStr) {
    const err = new UpstreamLlmError(
      'LLM returned no JSON in review-dictation response',
    );
    captureException(err, { requestPath: 'services/dictation/review' });
    throw err;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return dictationReviewResultSchema.parse(parsed);
  } catch (parseErr) {
    captureException(
      parseErr instanceof Error
        ? parseErr
        : new Error('Dictation review parse failed'),
      { requestPath: 'services/dictation/review' },
    );
    throw new UpstreamLlmError(
      'Dictation review LLM returned invalid structured output',
    );
  }
}
