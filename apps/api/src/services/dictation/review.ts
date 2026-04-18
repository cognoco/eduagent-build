import {
  dictationReviewResultSchema,
  type DictationSentence,
  type DictationReviewResult,
} from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage, MessagePart } from '../llm';
import { UpstreamLlmError } from '../../errors';
import { captureException } from '../sentry';

// ---------------------------------------------------------------------------
// Dictation Review Service
//
// Accepts a photo of a child's handwritten dictation and the original sentences,
// sends them to the LLM as a multimodal message, and returns a structured
// breakdown of mistakes.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a dictation review assistant. Your job is to compare a child's handwritten text (visible in the image) against the original dictation sentences.

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
Generate explanations in the child's language as instructed.`;

export type { DictationReviewResult };

export interface ReviewDictationInput {
  sentences: DictationSentence[];
  imageBase64: string;
  imageMimeType: string;
  language: string;
}

export async function reviewDictation(
  input: ReviewDictationInput
): Promise<DictationReviewResult> {
  const { sentences, imageBase64, imageMimeType, language } = input;

  const originalText = sentences
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join('\n');

  const userContent: MessagePart[] = [
    { type: 'inline_data', mimeType: imageMimeType, data: imageBase64 },
    {
      type: 'text',
      text: `Original sentences:\n${originalText}\n\nPlease generate all explanations in ${language}.`,
    },
  ];

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  // Rung 2 — vision-capable model required
  const result = await routeAndCall(messages, 2);

  if (!result.response || result.response.trim() === '') {
    const err = new UpstreamLlmError(
      'LLM returned empty response in review-dictation'
    );
    captureException(err, { requestPath: 'services/dictation/review' });
    throw err;
  }

  const jsonMatch = result.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const err = new UpstreamLlmError(
      'LLM returned no JSON in review-dictation response'
    );
    captureException(err, { requestPath: 'services/dictation/review' });
    throw err;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return dictationReviewResultSchema.parse(parsed);
  } catch (parseErr) {
    captureException(
      parseErr instanceof Error
        ? parseErr
        : new Error('Dictation review parse failed'),
      { requestPath: 'services/dictation/review' }
    );
    throw new UpstreamLlmError(
      'Dictation review LLM returned invalid structured output'
    );
  }
}
