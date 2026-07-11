// ---------------------------------------------------------------------------
// Language Prompts — Tests [4A.5]
// ---------------------------------------------------------------------------

import { buildFourStrandsPrompt } from './language-prompts';
import type { ExchangeContext } from './exchanges';

function makeContext(
  overrides: Partial<ExchangeContext> = {},
): ExchangeContext {
  return {
    sessionId: 'session-1',
    profileId: 'profile-1',
    subjectName: 'Spanish',
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    ...overrides,
    birthYear: overrides.birthYear ?? new Date().getFullYear() - 14,
  };
}

describe('buildFourStrandsPrompt', () => {
  it('returns an array of prompt paragraphs', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(4);
    for (const paragraph of result) {
      expect(typeof paragraph).toBe('string');
      expect(paragraph.length).toBeGreaterThan(0);
    }
  });

  it('includes the target language name when languageCode is provided', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));
    const joined = result.join('\n').toLowerCase();

    expect(joined).toContain('spanish');
  });

  it('falls back to subjectName when languageCode is null', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: undefined, subjectName: 'My Language' }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('My Language');
  });

  it('falls back to subjectName for unsupported language code', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'xx', subjectName: 'Klingon' }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('Klingon');
  });

  it('includes native language when provided', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'fr', nativeLanguage: 'English' }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('<native_language>English</native_language>');
  });

  it('mentions four strands pedagogy', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));
    const joined = result.join('\n');

    expect(joined).toContain('Four Strands');
  });

  it('includes known vocabulary when provided', () => {
    const result = buildFourStrandsPrompt(
      makeContext({
        languageCode: 'es',
        knownVocabulary: ['hola', 'buenos días', 'gracias'],
      }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('hola');
    expect(joined).toContain('buenos días');
    expect(joined).toContain('gracias');
  });

  it('handles empty known vocabulary as a hard zero-knowledge signal [BUG-937]', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: [] }),
    );
    const joined = result.join('\n');

    // BUG-937: empty vocab must read as "treat as complete beginner" so the
    // model cannot assume the learner already knows greetings.
    expect(joined).toContain('NONE');
    expect(joined).toContain('complete beginner');
    expect(joined).toMatch(/Do NOT assume they already know/i);
  });

  it('handles undefined known vocabulary as a hard zero-knowledge signal [BUG-937]', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: undefined }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('NONE');
    expect(joined).toContain('complete beginner');
  });

  it('does not soften "NONE" for non-empty vocabulary [BUG-937]', () => {
    // Break test: with vocabulary present, the zero-knowledge wording must NOT
    // appear — otherwise the model gets a contradictory signal.
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: ['hola', 'gracias'] }),
    );
    const joined = result.join('\n');

    expect(joined).not.toContain('NONE');
    expect(joined).not.toContain('complete beginner');
    expect(joined).toContain('hola');
    expect(joined).toContain('gracias');
  });

  it('includes STT/TTS locale info for supported languages', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));
    const joined = result.join('\n');

    expect(joined).toContain('es-ES');
  });

  it('mentions direct correction approach', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'de' }));
    const joined = result.join('\n');

    expect(joined).toContain('Correct errors');
    expect(joined).toContain('Socratic');
  });

  it('mentions fluency drills', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'fr' }));
    const joined = result.join('\n');

    expect(joined).toContain('fluency');
  });

  it('includes the server-generated graded input artifact when present', () => {
    const result = buildFourStrandsPrompt(
      makeContext({
        languageCode: 'es',
        languageSessionState: {
          activeStrand: 'meaning_input',
          sessionStrandCounts: {
            meaning_input: 0,
            meaning_output: 0,
            language_focus: 0,
            fluency: 0,
          },
          nextActivity: {
            strand: 'meaning_input',
            activityType: 'graded_input',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: [],
            gradedInput: {
              type: 'graded_input',
              modality: 'reading',
              cefrLevel: 'A1',
              knownWordRatioTarget: 0.96,
              knownWordEstimate: 0.67,
              targetWords: ['agua'],
              text: 'hola gracias agua',
              comprehensionQuestions: [
                {
                  id: 'gist-1',
                  prompt: 'What is the main thing happening in this passage?',
                  answerHint: 'hola gracias agua',
                },
              ],
              audioEnabled: false,
            },
          },
        },
      }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('Graded input artifact:');
    expect(joined).toContain('Passage: hola gracias agua');
    expect(joined).toContain('Known-word estimate: 67%');
    expect(joined).toContain(
      'Comprehension question: What is the main thing happening in this passage?',
    );
  });

  it('includes the server-selected meaning-output task and correction+retry guidance when present [WI-1756]', () => {
    const result = buildFourStrandsPrompt(
      makeContext({
        languageCode: 'es',
        languageSessionState: {
          activeStrand: 'meaning_output',
          sessionStrandCounts: {
            meaning_input: 1,
            meaning_output: 0,
            language_focus: 0,
            fluency: 0,
          },
          nextActivity: {
            strand: 'meaning_output',
            activityType: 'free_response',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: ['ser vs estar'],
            meaningOutput: {
              type: 'meaning_output',
              taskType: 'personal_answer',
              communicativeGoal:
                'Share a true or imagined personal answer someone could respond to.',
              prompt:
                'Answer personally in one or two short sentences using word(s): agua; grammar: ser vs estar.',
              responseMode: 'short_answer',
              targetWords: ['agua'],
              targetGrammar: ['ser vs estar'],
              retryExpectation: 'retry_after_feedback',
              correctionExpectation: 'meaning_first_then_form',
            },
          },
        },
      }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('Meaning-output task:');
    expect(joined).toContain('Task type: personal_answer');
    expect(joined).toContain(
      'Answer personally in one or two short sentences using word(s): agua; grammar: ser vs estar.',
    );
    expect(joined).toContain('Expected response mode: short_answer');
    // Correction + retry happy path: task-specific context and the tutor's
    // generic correction/retry instructions must co-occur in the same prompt
    // so the model has something concrete to judge the learner's reply
    // against.
    expect(joined).toContain('Correct errors');
    expect(joined).toContain('Ask for a quick retry after correcting.');
  });

  it('gates the correction+retry brief to the answer turn via previousMeaningOutputTask [WI-1756]', () => {
    // AC5 answer-turn coverage: on the turn where the learner replies to a
    // meaning-output task, the strand has already rotated away and
    // nextActivity.meaningOutput is empty (see the presentation-turn test
    // above). This asserts the re-surfaced previousMeaningOutputTask brief —
    // not the always-on static "Direct correction rules" text — is what
    // anchors the correction+retry instruction to this specific task.
    const result = buildFourStrandsPrompt(
      makeContext({
        languageCode: 'es',
        languageSessionState: {
          activeStrand: 'language_focus',
          sessionStrandCounts: {
            meaning_input: 1,
            meaning_output: 1,
            language_focus: 0,
            fluency: 0,
          },
          previousMeaningOutputTask: {
            type: 'meaning_output',
            taskType: 'personal_answer',
            communicativeGoal:
              'Share a true or imagined personal answer someone could respond to.',
            prompt:
              'Answer personally in one or two short sentences using word(s): agua; grammar: ser vs estar.',
            responseMode: 'short_answer',
            targetWords: ['agua'],
            targetGrammar: ['ser vs estar'],
            retryExpectation: 'retry_after_feedback',
            correctionExpectation: 'meaning_first_then_form',
          },
          nextActivity: {
            strand: 'language_focus',
            activityType: 'correction_retry',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: ['ser vs estar'],
          },
        },
      }),
    );
    const joined = result.join('\n');

    expect(joined).not.toContain('Meaning-output task:');
    expect(joined).toContain(
      'Previous meaning-output task (the learner is answering it now):',
    );
    expect(joined).toContain('Task type: personal_answer');
    expect(joined).toContain(
      'Answer personally in one or two short sentences using word(s): agua; grammar: ser vs estar.',
    );
    expect(joined).toContain(
      "The learner's last message is their attempt at this task. Judge it against this specific task. If it is incomplete, off-task, or malformed, give the corrected/model form, briefly explain why, and ask for a retry on the same task before moving on.",
    );
  });

  it('includes the server-graded comprehension result when present', () => {
    const result = buildFourStrandsPrompt(
      makeContext({
        languageCode: 'es',
        languageSessionState: {
          activeStrand: 'language_focus',
          sessionStrandCounts: {
            meaning_input: 1,
            meaning_output: 0,
            language_focus: 0,
            fluency: 0,
          },
          previousComprehension: {
            questionId: 'gist-1',
            prompt: 'What does Ana want?',
            answerHint: 'Ana wants water',
            learnerAnswer: 'She is going home.',
            verdict: 'missed',
            matchedTerms: [],
            missingTerms: ['wants', 'water'],
          },
          nextActivity: {
            strand: 'language_focus',
            activityType: 'correction_retry',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: [],
          },
        },
      }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('Previous graded-input answer:');
    expect(joined).toContain('Verdict: missed');
    expect(joined).toContain('What does Ana want?');
    expect(joined).toContain('She is going home.');
    expect(joined).toContain('wants, water');
  });
});
