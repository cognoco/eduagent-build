import { buildPrompt } from '../../src/services/book-suggestion-generation';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';
import { bookSuggestionGenerationResultSchema } from '@eduagent/schemas';

interface BookSuggestionRegenerationInput {
  subjectName: string;
  existingBookTitles: string[];
  existingSuggestionTitles: string[];
  studiedTopics: string[];
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
      };
    },

    buildPrompt(input: BookSuggestionRegenerationInput): PromptMessages {
      const messages = buildPrompt({
        subjectName: input.subjectName,
        existingBookTitles: input.existingBookTitles,
        existingSuggestionTitles: input.existingSuggestionTitles,
        studiedTopics: input.studiedTopics,
      });

      const systemMsg = messages.find((m) => m.role === 'system');
      const userMsg = messages.find((m) => m.role === 'user');

      return {
        system: systemMsg?.content ?? '',
        user: userMsg?.content,
        notes: [
          `subjectName: ${input.subjectName}`,
          `studiedTopics: ${input.studiedTopics.length} (${input.studiedTopics.length === 0 ? 'all-explore path' : '2+2 split path'})`,
          `existingTitles: ${input.existingBookTitles.length} books + ${input.existingSuggestionTitles.length} suggestions to avoid`,
        ],
      };
    },

    expectedResponseSchema: bookSuggestionGenerationResultSchema,

    async runLive(
      _input: BookSuggestionRegenerationInput,
      messages: PromptMessages,
    ): Promise<string> {
      return callLlm(
        [
          { role: 'system', content: messages.system },
          {
            role: 'user',
            content: messages.user ?? 'Generate the suggestions now.',
          },
        ],
        { flow: 'book-suggestion-regeneration', rung: 2 },
      );
    },
  };
