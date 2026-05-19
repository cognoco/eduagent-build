import {
  buildPrompt,
  extractBookSuggestionJson,
  sanitizeBookSuggestionOutput,
} from '../../src/services/book-suggestion-generation';
import { getTextContent } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import type {
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';
import { bookSuggestionGenerationResultSchema } from '@eduagent/schemas';
import {
  containsAny,
  parseFirstJsonObject,
  qualityError,
  uniqueLower,
} from '../runner/quality';

interface BookSuggestionRegenerationInput {
  subjectName: string;
  languageName?: string | null;
  existingBookTitles: string[];
  existingSuggestionTitles: string[];
  studiedTopics: string[];
  learnerAge?: number;
  notes?: string[];
}

function ageFromBirthYear(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

function languageNameForProfile(profile: EvalProfile): string | null {
  if (profile.targetLanguage === 'es') return 'Spanish';
  if (profile.targetLanguage === 'fr') return 'French';
  return null;
}

interface SuggestionLike {
  title?: unknown;
  description?: unknown;
  category?: unknown;
}

function parseSuggestions(
  liveResponse: string,
): { suggestions: SuggestionLike[] } | { issues: QualityIssue[] } {
  const parsed = parseFirstJsonObject<{ suggestions?: unknown }>(liveResponse);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    return {
      issues: [
        qualityError(
          'book-suggestions.parse',
          'Live response did not contain a parseable suggestions array.',
        ),
      ],
    };
  }
  return { suggestions: parsed.suggestions as SuggestionLike[] };
}

function suggestionText(suggestion: SuggestionLike): string {
  return `${String(suggestion.title ?? '')} ${String(
    suggestion.description ?? '',
  )}`;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|book|guide)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evaluateBookSuggestionQuality(
  input: BookSuggestionRegenerationInput,
  scenarioId: string | undefined,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseSuggestions(liveResponse);
  if ('issues' in parsed) return parsed.issues;

  const issues: QualityIssue[] = [];
  const suggestions = parsed.suggestions;
  const combinedText = suggestions.map(suggestionText).join('\n');
  const lowerCombined = combinedText.toLowerCase();
  const titles = suggestions
    .map((s) => (typeof s.title === 'string' ? s.title : ''))
    .filter(Boolean);
  const normalizedTitles = titles.map(normalizeTitle);
  const existingTitles = [
    ...input.existingBookTitles,
    ...input.existingSuggestionTitles,
  ].map(normalizeTitle);

  if (uniqueLower(normalizedTitles).length !== normalizedTitles.length) {
    issues.push(
      qualityError(
        'book-suggestions.duplicate-output',
        'Suggestions contain duplicate or near-duplicate titles.',
      ),
    );
  }

  const blockedTitle = normalizedTitles.find((title) =>
    existingTitles.includes(title),
  );
  if (blockedTitle) {
    issues.push(
      qualityError(
        'book-suggestions.existing-title',
        `Suggestion repeats an existing title after normalization: "${blockedTitle}".`,
      ),
    );
  }

  if (/french/i.test(input.subjectName) && /\bspanish\b/i.test(combinedText)) {
    issues.push(
      qualityError(
        'book-suggestions.language-mismatch',
        'French Four Strands scenario produced Spanish-labelled suggestions.',
      ),
    );
  }
  if (/spanish/i.test(input.subjectName) && /\bfrench\b/i.test(combinedText)) {
    issues.push(
      qualityError(
        'book-suggestions.language-mismatch',
        'Spanish Four Strands scenario produced French-labelled suggestions.',
      ),
    );
  }

  if (scenarioId === 'four-strands-language') {
    const strandChecks = [
      {
        name: 'meaning-focused input',
        ok: containsAny(lowerCombined, [
          /\binput\b/i,
          /\blistening\b/i,
          /\breading\b/i,
          /\bread\b/i,
          /\bunderstand\b/i,
          /\bauthentic\b/i,
          /\bcomprehension\b/i,
          /\btexts?\b/i,
          /\bstories\b/i,
        ]),
      },
      {
        name: 'meaning-focused output',
        ok: containsAny(lowerCombined, [
          /\boutput\b/i,
          /\bspeaking\b/i,
          /\bwriting\b/i,
          /\bspoken\b/i,
          /\bwritten\b/i,
          /\bexpressing\b/i,
          /\bconversation/i,
          /\bcommunicat/i,
        ]),
      },
      {
        name: 'language-focused learning/form',
        ok: containsAny(lowerCombined, [
          /\bform\b/i,
          /\blanguage-focused\b/i,
          /\bgrammar\b/i,
          /\bvocabulary\b/i,
          /\baccuracy\b/i,
          /\bpronunciation\b/i,
        ]),
      },
      {
        name: 'fluency development',
        ok: containsAny(lowerCombined, [
          /\bfluency\b/i,
          /\bfluent\b/i,
          /\bfluently\b/i,
          /\bsmooth\b/i,
          /\bnatural speech\b/i,
          /\brhythm\b/i,
          /\bconfidently handle\b/i,
          /\bspeed\b/i,
          /\bnatural communication\b/i,
        ]),
      },
    ];
    for (const strand of strandChecks) {
      if (!strand.ok) {
        issues.push(
          qualityError(
            'book-suggestions.four-strands',
            `Four Strands scenario is missing visible ${strand.name}.`,
          ),
        );
      }
    }
  }

  if (
    scenarioId === 'age-register-adult' &&
    containsAny(lowerCombined, [
      /\btiny\b/i,
      /\bkids?\b/i,
      /\bamazing\b/i,
      /\bwonders?\b/i,
      /\bstickers?\b/i,
    ])
  ) {
    issues.push(
      qualityError(
        'book-suggestions.adult-register',
        'Adult-register scenario used childish or tiny-book framing.',
      ),
    );
  }

  if (
    scenarioId === 'duplicate-tiny-avoidance' &&
    containsAny(lowerCombined, [
      /\btiny\b/i,
      /\bquick tricks?\b/i,
      /\bfractions? basics\b/i,
    ])
  ) {
    issues.push(
      qualityError(
        'book-suggestions.tiny-duplicate',
        'Duplicate/tiny avoidance scenario still suggested a tiny, trick, or basic duplicate shelf.',
      ),
    );
  }

  if (scenarioId === 'source-neutral') {
    const descriptions = suggestions
      .map((s) => String(s.description ?? ''))
      .join('\n');
    if (
      containsAny(descriptions, [
        /\b(1[5-9]\d{2}|20\d{2})\b/i,
        /\b\d+(?:\.\d+)?\s*%/i,
        /\b\d+(?:\.\d+)?\s*percent\b/i,
      ])
    ) {
      issues.push(
        qualityError(
          'book-suggestions.source-neutral',
          'Source-neutral descriptions should avoid precise dates, years, percentages, or statistics.',
        ),
      );
    }
  }

  return issues;
}

export const bookSuggestionRegenerationFlow: FlowDefinition<BookSuggestionRegenerationInput> =
  {
    id: 'book-suggestion-regeneration',
    name: 'Book Suggestion Regeneration',
    sourceFile:
      'apps/api/src/services/book-suggestion-generation.ts:buildPrompt',

    buildPromptInput(
      profile: EvalProfile,
    ): BookSuggestionRegenerationInput | null {
      if (profile.libraryTopics.length === 0) return null;
      const subjectName =
        profile.interests.find((i) => i.context === 'school')?.label ??
        profile.interests[0]?.label ??
        'General Knowledge';

      const hasStudied = profile.libraryTopics.length >= 3;
      return {
        subjectName,
        existingBookTitles: hasStudied ? profile.libraryTopics.slice(0, 2) : [],
        existingSuggestionTitles: [],
        studiedTopics: hasStudied ? profile.libraryTopics.slice(0, 4) : [],
        learnerAge: ageFromBirthYear(profile.birthYear),
        languageName: null,
      };
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<BookSuggestionRegenerationInput>> | null {
      const base = this.buildPromptInput(profile);
      if (!base) return null;
      const age = ageFromBirthYear(profile.birthYear);
      const fourStrandsLanguage = languageNameForProfile(profile) ?? 'French';

      return [
        {
          scenarioId: 'relevance-diversity',
          input: {
            ...base,
            existingBookTitles: profile.libraryTopics.slice(0, 3),
            existingSuggestionTitles: [
              'More of the Same Basics',
              'Generic Study Skills',
            ],
            studiedTopics: profile.libraryTopics.slice(0, 5),
            notes: [
              'Suggestions should be relevant but not duplicates of studied topics.',
              'Descriptions should be varied enough to avoid a one-note shelf.',
            ],
          },
        },
        {
          scenarioId: 'age-register-adult',
          input: {
            ...base,
            subjectName: 'Biology for an 18-year-old adult learner',
            existingBookTitles: ['Human Biology', 'Cell Structure'],
            existingSuggestionTitles: ['Tiny Cell Facts'],
            studiedTopics: [
              'Homeostasis',
              'Cell membranes',
              'Digestive system',
            ],
            learnerAge: Math.max(age, 18),
            notes: [
              'Adult learner register: no childish framing, stickers, or tiny novelty books.',
            ],
          },
        },
        {
          scenarioId: 'four-strands-language',
          input: {
            ...base,
            subjectName: `${fourStrandsLanguage} Four Strands practice`,
            languageName: fourStrandsLanguage,
            existingBookTitles: ['Basic Greetings', 'Connectors for Opinions'],
            existingSuggestionTitles: ['Vocabulary Flashcards'],
            studiedTopics: [
              'Useful input',
              'Meaning-focused output',
              'Language-focused learning',
              'Fluency practice',
            ],
            notes: [
              'Four Strands-adjacent language suggestions should include output, input, fluency, and form practice.',
            ],
          },
        },
        {
          scenarioId: 'source-neutral',
          input: {
            ...base,
            subjectName: 'History',
            existingBookTitles: ['Causes of World War I'],
            existingSuggestionTitles: [],
            studiedTopics: ['Alliances', 'Militarism', 'July Crisis'],
            notes: [
              'Descriptions must stay source-neutral: no precise unsourced dates, percentages, or overconfident claims.',
            ],
          },
        },
        {
          scenarioId: 'duplicate-tiny-avoidance',
          input: {
            ...base,
            subjectName: 'Mathematics',
            existingBookTitles: [
              'Fractions Basics',
              'Adding Fractions',
              'Multiplying Fractions',
              'Fraction Word Problems',
            ],
            existingSuggestionTitles: [
              'Fractions Basics',
              'Quick Fraction Tricks',
              'Tiny Fractions',
            ],
            studiedTopics: [
              'Equivalent fractions',
              'Adding unlike denominators',
              'Mixed numbers',
              'Fraction word problems',
            ],
            notes: [
              'Avoid duplicate/tiny books; suggest a substantial next direction with distinct titles.',
            ],
          },
        },
      ];
    },

    buildPrompt(input: BookSuggestionRegenerationInput): PromptMessages {
      const messages = buildPrompt({
        subjectName: input.subjectName,
        languageName: input.languageName,
        existingBookTitles: input.existingBookTitles,
        existingSuggestionTitles: input.existingSuggestionTitles,
        studiedTopics: input.studiedTopics,
      });

      const systemMsg = messages.find((m) => m.role === 'system');
      const userMsg = messages.find((m) => m.role === 'user');

      return {
        system: getTextContent(systemMsg?.content ?? ''),
        user: userMsg ? getTextContent(userMsg.content) : undefined,
        notes: [
          `subjectName: ${input.subjectName}`,
          ...(input.languageName
            ? [`languageName: ${input.languageName}`]
            : []),
          ...(input.learnerAge ? [`learnerAge: ${input.learnerAge}`] : []),
          `studiedTopics: ${input.studiedTopics.length} (${input.studiedTopics.length === 0 ? 'all-explore path' : '2+2 split path'})`,
          `existingTitles: ${input.existingBookTitles.length} books + ${input.existingSuggestionTitles.length} suggestions to avoid`,
          ...(input.notes ?? []),
        ],
      };
    },

    expectedResponseSchema: bookSuggestionGenerationResultSchema,

    async runLive(
      _input: BookSuggestionRegenerationInput,
      messages: PromptMessages,
    ): Promise<string> {
      const baseMessages = [
        { role: 'system' as const, content: messages.system },
        {
          role: 'user' as const,
          content: messages.user ?? 'Generate the suggestions now.',
        },
      ];
      let latestResponse = '';
      let latestFailure = '';

      for (let attempt = 0; attempt < 2; attempt++) {
        const attemptMessages =
          attempt === 0
            ? baseMessages
            : [
                ...baseMessages,
                {
                  role: 'user' as const,
                  content: [
                    'The previous response failed validation.',
                    'Return the requested suggestions again as valid JSON only.',
                    'Do not use markdown, comments, trailing commas, or text outside the JSON object.',
                    `Validation failure: ${latestFailure.slice(0, 500)}`,
                  ].join('\n'),
                },
              ];

        latestResponse = await callLlm(attemptMessages, {
          flow: 'book-suggestion-regeneration',
          rung: 2,
          responseFormat: 'json',
        });

        let parsed: unknown;
        try {
          parsed = extractBookSuggestionJson(latestResponse);
        } catch {
          parsed = parseFirstJsonObject(latestResponse);
        }
        const validated =
          bookSuggestionGenerationResultSchema.safeParse(parsed);
        if (validated.success) {
          return JSON.stringify(
            sanitizeBookSuggestionOutput(validated.data),
            null,
            2,
          );
        }

        latestFailure = validated.error.message;
      }

      return latestResponse;
    },

    evaluateQuality({ input, scenarioId, liveResponse }): QualityIssue[] {
      return evaluateBookSuggestionQuality(input, scenarioId, liveResponse);
    },
  };
