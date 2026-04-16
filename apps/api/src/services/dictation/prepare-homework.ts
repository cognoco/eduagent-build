import { prepareHomeworkOutputSchema } from '@eduagent/schemas';
import type { PrepareHomeworkOutput } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage } from '../llm';

// ---------------------------------------------------------------------------
// Prepare-Homework Dictation Service
//
// Takes raw homework text, calls the LLM to split it into individual sentences,
// annotates punctuation as spoken words, and detects the text language.
// Handles abbreviations (Mr., Dr., etc.) and dialogue quotes without splitting
// at the wrong boundary.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a dictation preparation assistant. Your job is to take a text and prepare it for dictation practice.

TASK:
1. Split the input text into individual sentences. Handle abbreviations (Mr., Dr., Prof., etc.), dialogue quotes, and numbers correctly — do not split mid-sentence. For example, "Mr. Smith said, 'Hello.' Then he left." is 2 sentences, not 4.
2. For each sentence, create a "withPunctuation" variant where punctuation marks are replaced with spoken words:
   - , → "comma"
   - . → "period"
   - ? → "question mark"
   - ! → "exclamation mark"
   - : → "colon"
   - ; → "semicolon"
   - " (opening) → "open quote"
   - " (closing) → "close quote"
   - — → "dash"
   Remove the punctuation character itself and insert the word in its place.
3. Count the words in each sentence (original text, not the punctuation variant).
4. Detect the language of the text.

RESPOND WITH ONLY valid JSON in this exact format:
{
  "sentences": [
    { "text": "original sentence.", "withPunctuation": "original sentence period", "wordCount": 2 }
  ],
  "language": "ISO 639-1 code (e.g. cs, en, de, sk, nb, fr)"
}`;

export async function prepareHomework(
  text: string
): Promise<PrepareHomeworkOutput> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text },
  ];

  const result = await routeAndCall(messages, 1);

  const jsonMatch = result.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM returned no JSON in prepare-homework response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return prepareHomeworkOutputSchema.parse(parsed);
}
