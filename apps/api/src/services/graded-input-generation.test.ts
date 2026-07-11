import {
  extractInterestLabels,
  generateGradedInputContent,
} from './graded-input-generation';
import {
  registerLlmProviderFixture,
  llmStructuredJson,
} from '../test-utils/llm-provider-fixtures';

describe('extractInterestLabels', () => {
  it('passes through a legacy string[] shape unchanged', () => {
    expect(extractInterestLabels(['football', 'dinosaurs'])).toEqual([
      'football',
      'dinosaurs',
    ]);
  });

  it('extracts labels from InterestEntry[]-shaped objects (the real jsonb runtime shape)', () => {
    expect(
      extractInterestLabels([
        { label: 'football', context: 'both' },
        { label: 'dinosaurs', context: 'academic' },
      ]),
    ).toEqual(['football', 'dinosaurs']);
  });

  it('drops entries that are neither a string nor a {label: string} object', () => {
    expect(
      extractInterestLabels([
        'football',
        { label: 'dinosaurs' },
        { notLabel: 'oops' },
        42,
        null,
      ]),
    ).toEqual(['football', 'dinosaurs']);
  });

  it('returns undefined for a non-array value', () => {
    expect(extractInterestLabels(null)).toBeUndefined();
    expect(extractInterestLabels(undefined)).toBeUndefined();
    expect(extractInterestLabels('not an array')).toBeUndefined();
  });
});

describe('generateGradedInputContent', () => {
  it('reaches the prompt with the interest label when the caller maps InterestEntry[] via extractInterestLabels first (the fixed session-exchange.ts data flow)', async () => {
    // Regression test for the bug this PR's review caught: session-exchange.ts
    // used to pass the raw learningProfile.interests jsonb value
    // (InterestEntry[] — `{label, context}[]`) straight through as `interests`
    // via an `as string[]` cast, which crashed inside
    // buildGradedInputGenerationPrompt's sanitizeXmlValue (`.trim()` on an
    // object) — outside the try/catch at the time, so it took down the whole
    // Four Strands exchange. session-exchange.ts now maps through
    // extractInterestLabels first; this test proves that fixed data flow
    // both avoids the crash AND actually delivers the label into the prompt
    // (not just silently degrading to the fallback).
    const rawProfileInterests = [{ label: 'football', context: 'both' }];

    const fixture = registerLlmProviderFixture({
      chatResponse: llmStructuredJson({
        text: 'Ana juega al futbol.',
        comprehensionQuestions: [
          { prompt: 'Que hace Ana?', answerHint: 'Ana juega al futbol.' },
        ],
      }),
    });
    try {
      await expect(
        generateGradedInputContent({
          languageCode: 'es',
          cefrLevel: 'A1',
          knownWords: [],
          targetWords: ['futbol'],
          modality: 'reading',
          interests: extractInterestLabels(rawProfileInterests),
          ageBracket: 'adult',
        }),
      ).resolves.not.toBeNull();

      const userMessage = fixture.chatCalls[0]?.messages.find(
        (m) => m.role === 'user',
      );
      const userText =
        typeof userMessage?.content === 'string' ? userMessage.content : '';
      // The mapped label reaches the prompt as plain text, not "[object Object]".
      expect(userText).toContain('football');
      expect(userText).not.toContain('[object Object]');
    } finally {
      fixture.dispose();
    }
  });

  it('falls back to null (never throws) when prompt-building input is malformed in a way unrelated to interests', async () => {
    // Belt-and-suspenders: the try/catch now wraps buildGradedInputGenerationPrompt
    // itself, so ANY prompt-building failure — not just the interests shape
    // bug above — degrades to the deterministic-fallback contract (null)
    // instead of throwing. `targetWords: null` crashes formatVocabLine's
    // `words.length` access if the try/catch weren't there.
    const fixture = registerLlmProviderFixture({
      chatResponse: llmStructuredJson({
        text: 'ignored',
        comprehensionQuestions: [{ prompt: 'ignored', answerHint: 'ignored' }],
      }),
    });
    try {
      await expect(
        generateGradedInputContent({
          languageCode: 'es',
          cefrLevel: 'A1',
          knownWords: [],
          targetWords: null as unknown as string[],
          modality: 'reading',
          ageBracket: 'adult',
        }),
      ).resolves.toBeNull();
    } finally {
      fixture.dispose();
    }
  });
});
