import { getLanguageByCode } from '../data/languages';
import { routeAndCall, type ChatMessage } from './llm';

export interface ExtractedVocabularyItem {
  term: string;
  translation: string;
  type: 'word' | 'chunk';
}

const VOCAB_EXTRACTION_PROMPT = `Extract useful target-language vocabulary from this tutoring transcript.
Return ONLY JSON:
{"items":[{"term":"...","translation":"...","type":"word"|"chunk"}]}

Rules:
- Extract only vocabulary in the target language
- Prefer practical words and collocations the learner likely practiced
- Keep 0-8 items
- Use "chunk" for multi-word phrases and collocations
- No duplicates`;

export async function extractVocabularyFromTranscript(
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>,
  languageCode: string
): Promise<ExtractedVocabularyItem[]> {
  const language = getLanguageByCode(languageCode);
  if (!language || transcript.length === 0) {
    return [];
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: VOCAB_EXTRACTION_PROMPT },
    {
      role: 'user',
      content: [
        `Target language: ${language.names[0]} (${language.code})`,
        transcript
          .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
          .join('\n'),
      ].join('\n\n'),
    },
  ];

  try {
    const result = await routeAndCall(messages, 1);
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      items?: Array<{
        term?: unknown;
        translation?: unknown;
        type?: unknown;
      }>;
    };

    return (parsed.items ?? [])
      .filter(
        (
          item
        ): item is {
          term: string;
          translation: string;
          type: 'word' | 'chunk';
        } =>
          typeof item.term === 'string' &&
          item.term.trim().length > 0 &&
          typeof item.translation === 'string' &&
          item.translation.trim().length > 0 &&
          (item.type === 'word' || item.type === 'chunk')
      )
      .slice(0, 8)
      .map((item) => ({
        term: item.term.trim(),
        translation: item.translation.trim(),
        type: item.type,
      }));
  } catch (err) {
    console.warn('[extractVocabularyFromTranscript] extraction failed:', err);
    return [];
  }
}
