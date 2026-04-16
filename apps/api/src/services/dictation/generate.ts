import { generateDictationOutputSchema } from '@eduagent/schemas';
import type { GenerateDictationOutput } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage } from '../llm';

// ---------------------------------------------------------------------------
// Generate Dictation Service
//
// Generates age-appropriate dictation content themed around the learner's
// recent study topics. The LLM produces structured JSON with sentences,
// punctuation spoken-word variants, title, and topic.
// ---------------------------------------------------------------------------

export interface GenerateContext {
  /** Recent topic names from the learner's study history (used for thematic context). */
  recentTopics: string[];
  /** ISO 639-1 language code — the language to write the dictation in. */
  nativeLanguage: string;
  /** Learner's age in years — used to calibrate sentence length and vocabulary. */
  ageYears: number;
}

function buildGeneratePrompt(ctx: GenerateContext): string {
  const topicList =
    ctx.recentTopics.slice(0, 3).join(', ') || 'general knowledge';

  const punctuationNames = getPunctuationNames(ctx.nativeLanguage);

  return `You are a dictation content generator for a ${ctx.ageYears}-year-old child.

LANGUAGE: Write the dictation in ${ctx.nativeLanguage} (ISO 639-1 code).

THEME: Base the dictation on one of these recent study topics: ${topicList}. Choose the most interesting one. The topic provides flavor — the linguistic quality of the sentences matters more than the factual content.

CONSTRAINTS:
- 6-12 sentences total (aim for ~3 minutes of writing time at a slow pace)
- Sentence length: ${ctx.ageYears <= 8 ? '6-10 words' : ctx.ageYears <= 12 ? '8-15 words' : '10-20 words'}
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally.${ctx.ageYears >= 12 ? ' Colons and semicolons sparingly.' : ''}
- Sentences must sound natural when read aloud — good rhythm, no awkward constructions
- Include 1-2 sentences that are slightly challenging (unusual spelling, tricky grammar)

For each sentence, also create a "withPunctuation" variant where punctuation marks are replaced with spoken words in the dictation language:
${punctuationNames}
- For other languages, use the standard spoken name for each punctuation mark in that language.

Count the words in each sentence (original text, not the punctuation variant).

RESPOND WITH ONLY valid JSON:
{
  "sentences": [
    { "text": "original sentence.", "withPunctuation": "original sentence tečka", "wordCount": 2 }
  ],
  "title": "Short title for this dictation",
  "topic": "The topic you chose",
  "language": "${ctx.nativeLanguage}"
}`;
}

function getPunctuationNames(lang: string): string {
  const punctuationMap: Record<string, string> = {
    // Czech
    cs: '- In Czech: , → "čárka", . → "tečka", ? → "otazník", ! → "vykřičník"',
    // English
    en: '- In English: , → "comma", . → "period", ? → "question mark", ! → "exclamation mark"',
    // German
    de: '- In German: , → "Komma", . → "Punkt", ? → "Fragezeichen", ! → "Ausrufezeichen"',
    // Slovak
    sk: '- In Slovak: , → "čiarka", . → "bodka", ? → "otáznik", ! → "výkričník"',
    // Norwegian Bokmål (RF-06)
    nb: '- In Norwegian: , → "komma", . → "punktum", ? → "spørsmålstegn", ! → "utropstegn"',
    // Norwegian Nynorsk (RF-06)
    nn: '- In Norwegian: , → "komma", . → "punktum", ? → "spørsmålstegn", ! → "utropstegn"',
    // French (RF-06)
    fr: '- In French: , → "virgule", . → "point", ? → "point d\'interrogation", ! → "point d\'exclamation"',
  };

  return (
    punctuationMap[lang] ??
    '- Use the standard spoken name for each punctuation mark in the target language.'
  );
}

export async function generateDictation(
  ctx: GenerateContext
): Promise<GenerateDictationOutput> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildGeneratePrompt(ctx) },
    { role: 'user', content: 'Generate a dictation for me.' },
  ];

  const result = await routeAndCall(messages, 1);

  const jsonMatch = result.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM returned no JSON in generate-dictation response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return generateDictationOutputSchema.parse(parsed);
}
