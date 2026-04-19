import { generateDictationOutputSchema } from '@eduagent/schemas';
import type { GenerateDictationOutput } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage } from '../llm';
import { UpstreamLlmError } from '../../errors';
import { captureException } from '../sentry';
import { extractJsonObject } from '../quiz';

// ---------------------------------------------------------------------------
// Generate Dictation Service
//
// Generates age-appropriate dictation content themed around the learner's
// recent study topics. The LLM produces structured JSON with sentences,
// punctuation spoken-word variants, title, and topic.
// ---------------------------------------------------------------------------

export interface GenerateContext {
  /** ISO 639-1 language code — the language to write the dictation in. */
  nativeLanguage: string;
  /** Learner's age in years — used to calibrate sentence length, vocabulary, and literary themes. */
  ageYears: number;
  /**
   * Learner's interests with context tags. Optional — backward-compatible.
   * 'free_time' and 'both' interests are used to theme the literary passage.
   * 'school' interests are ignored here (they are handled by library topics).
   */
  interests?: Array<{
    label: string;
    context: 'free_time' | 'school' | 'both';
  }>;
  /**
   * Titles of library topics the learner is actively studying. Optional.
   * When present, the passage will prefer themes that intersect with these topics.
   */
  libraryTopics?: string[];
}

function getLiteraryTheme(ageYears: number): string {
  if (ageYears <= 13) {
    return `Draw from children's novels and chapter books — school adventures, fantasy quests, historical stories, nature and discovery. Think Harry Potter, Percy Jackson, or Jules Verne.`;
  }
  return `Draw from classic and contemporary literature — novels, short stories, literary fiction. Think Hemingway, Kafka, Čapek, or contemporary bestsellers. Use adult-level vocabulary and sentence structure.`;
}

function buildInterestThemeBlock(ctx: GenerateContext): string {
  // Only 'free_time' and 'both' interests theme the passage.
  const relevantInterests = (ctx.interests ?? [])
    .filter((i) => i.context === 'free_time' || i.context === 'both')
    .map((i) => i.label);

  const libraryTopics = ctx.libraryTopics ?? [];

  if (relevantInterests.length === 0 && libraryTopics.length === 0) {
    return '';
  }

  const parts: string[] = [];
  if (relevantInterests.length > 0) {
    parts.push(
      `PERSONALIZATION: This learner loves: ${relevantInterests.join(', ')}. ` +
        `Where it fits naturally within the age-appropriate literary register, theme the passage around these interests ` +
        `(e.g. a dinosaur-loving child should get a narrative set in prehistoric times, not a generic fantasy forest). ` +
        `Do NOT sacrifice sentence quality, complexity, or literary style to chase the interest theme.`
    );
  }
  if (libraryTopics.length > 0) {
    parts.push(
      `LIBRARY TOPICS: The learner is currently studying: ${libraryTopics.join(
        ', '
      )}. ` +
        `Prefer narrative themes that intersect with these topics where the literary register allows ` +
        `(e.g. a learner studying the Mesozoic era could get a passage set in prehistoric times).`
    );
  }

  return '\n' + parts.join('\n') + '\n';
}

export function buildGeneratePrompt(ctx: GenerateContext): string {
  const punctuationNames = getPunctuationNames(ctx.nativeLanguage);
  const literaryTheme = getLiteraryTheme(ctx.ageYears);
  const interestThemeBlock = buildInterestThemeBlock(ctx);

  return `You are a dictation content generator for a ${ctx.ageYears}-year-old${
    ctx.ageYears >= 14 ? ' person' : ' child'
  }.

LANGUAGE: Write the dictation in ${ctx.nativeLanguage} (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
${literaryTheme}
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.${interestThemeBlock}

CONSTRAINTS:
- 6-10 sentences total
- Sentence length: ${
    ctx.ageYears <= 8
      ? '4-7 words (short phrases a child can hold in memory)'
      : ctx.ageYears <= 12
      ? '5-10 words'
      : '7-14 words'
  }
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally.${
    ctx.ageYears >= 12 ? ' Colons and semicolons sparingly.' : ''
  }
- Sentences must sound natural when read aloud — good rhythm, no awkward constructions
- Include 1-2 sentences that are slightly challenging (unusual spelling, tricky grammar)

For each sentence, also create a "withPunctuation" variant where punctuation marks are replaced with spoken words in the dictation language:
${punctuationNames}
- For other languages, use the standard spoken name for each punctuation mark in that language.

Count the words in each sentence (original text, not the punctuation variant).

CHUNKING FOR DICTATION PLAYBACK:
Split each sentence into natural spoken chunks for dictation. The child hears one chunk, writes it, then hears the next.
- Short sentences (up to 4 words including any trailing punctuation): return as a SINGLE chunk. Do not split.
- Longer sentences: break at natural phrase boundaries — clause edges, prepositional phrases, relative clauses. Think about where a teacher would naturally pause when dictating.
  Example: "A black cat that I usually see out of window is not there today." →
    chunks: ["A black cat", "that I usually see out of window", "is not there today."]
- Never break inside a noun phrase, verb phrase, or prepositional phrase.
- Each chunk should carry a complete thought fragment that a child can hold in working memory.
- Produce matching "chunksWithPunctuation" where punctuation in each chunk is replaced with spoken words (same rules as withPunctuation).

RESPOND WITH ONLY valid JSON:
{
  "sentences": [
    {
      "text": "original sentence.",
      "withPunctuation": "original sentence tečka",
      "wordCount": 2,
      "chunks": ["original sentence."],
      "chunksWithPunctuation": ["original sentence tečka"]
    }
  ],
  "title": "Short title for this dictation",
  "topic": "The literary theme you chose",
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

  let jsonStr: string;
  try {
    jsonStr = extractJsonObject(result.response);
  } catch {
    const err = new UpstreamLlmError(
      'LLM returned no JSON in generate-dictation response'
    );
    captureException(err, { requestPath: 'services/dictation/generate' });
    throw err;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return generateDictationOutputSchema.parse(parsed);
  } catch (parseErr) {
    captureException(
      parseErr instanceof Error
        ? parseErr
        : new Error('Dictation generate parse failed'),
      { requestPath: 'services/dictation/generate' }
    );
    throw new UpstreamLlmError(
      'Dictation LLM returned invalid structured output'
    );
  }
}
