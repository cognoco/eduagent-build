import { cefrLevelSchema } from '@eduagent/schemas';
import { getLanguageByCode } from '../data/languages';
import { routeAndCall, type ChatMessage } from './llm';

export interface ExtractedVocabularyItem {
  term: string;
  translation: string;
  type: 'word' | 'chunk';
  cefrLevel?: string | null;
}

const VOCAB_EXTRACTION_PROMPT = `Extract useful target-language vocabulary from this tutoring transcript.
Return ONLY JSON:
{"items":[{"term":"...","translation":"...","type":"word"|"chunk","cefrLevel":"A1"|"A2"|"B1"|"B2"|"C1"|"C2"|null}]}

Rules:
- Extract only vocabulary in the target language
- Prefer practical words and collocations the learner likely practiced
- Keep 0-8 items
- Use "chunk" for multi-word phrases and collocations
- No duplicates
- If a cefrTarget is provided, assign that level to most items; only deviate if vocabulary clearly belongs to a different level`;

export async function extractVocabularyFromTranscript(
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>,
  languageCode: string,
  cefrLevel?: string | null
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
        cefrLevel ? `CEFR target level: ${cefrLevel}` : '',
        transcript
          .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n'),
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
        cefrLevel?: unknown;
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
          cefrLevel?: unknown;
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
        cefrLevel: cefrLevelSchema.safeParse(item.cefrLevel).success
          ? (item.cefrLevel as string)
          : null,
      }));
  } catch (err) {
    // SC-6: Log at error level for prod observability. Returning [] is intentional —
    // the caller (session-completed Inngest fn) treats empty-on-error same as
    // genuine-empty (skips vocabulary update), which is acceptable for this
    // best-effort extraction step.
    console.error('[extractVocabularyFromTranscript] extraction failed:', err);
    return [];
  }
}
