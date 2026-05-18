import {
  assessmentFeedbackNeedsPrompt,
  buildAssessmentFirstQuestion,
  buildAssessmentNextActionPrompt,
  buildAssessmentOpeningMessage,
  ensureAssessmentFeedbackHasPrompt,
} from './assessment-copy';
import en from '../../../../i18n/locales/en.json';
import type { Translate } from '../../../../i18n';

function t(key: string, params?: Record<string, unknown>): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[part]
          : undefined,
      en,
    );
  if (typeof value !== 'string') return key;
  return Object.entries(params ?? {}).reduce(
    (text, [name, replacement]) =>
      text.replace(new RegExp(`{{${name}}}`, 'g'), String(replacement)),
    value,
  );
}

const translate = t as Translate;

describe('assessment copy', () => {
  it('uses concrete language-practice instructions for language topics', () => {
    const opening = buildAssessmentOpeningMessage({
      t: translate,
      topicTitle: 'Greetings & Introductions',
      topicDescription:
        'Meet people, say hello, and share simple personal details.',
      pedagogyMode: 'four_strands',
      languageCode: 'it',
    });
    const firstQuestion = buildAssessmentFirstQuestion({
      t: translate,
      topicTitle: 'Greetings & Introductions',
      topicDescription:
        'Meet people, say hello, and share simple personal details.',
      pedagogyMode: 'four_strands',
      languageCode: 'it',
    });

    expect(opening).toContain('can you say hello in Italian');
    expect(opening).not.toContain('main ideas');
    expect(firstQuestion).toContain('can you say hello in Italian');
    expect(firstQuestion).toContain('one or two greetings');
  });

  it('infers language-practice instructions from greetings scope when mode is missing', () => {
    const opening = buildAssessmentOpeningMessage({
      t: translate,
      topicTitle: 'Greetings & Introductions',
      topicDescription:
        'Meet people, say hello, and share simple personal details. Focused italian practice for A1.',
      pedagogyMode: null,
    });

    expect(opening).toContain('can you say hello in Italian');
    expect(opening).not.toContain('main ideas');
    expect(opening).not.toContain('What it covers');
  });

  it('adds a concrete language follow-up when feedback forgets the next task', () => {
    expect(
      assessmentFeedbackNeedsPrompt({
        feedback:
          'That is excellent recall. Ciao and buongiorno are common ways to say hello.',
        status: 'in_progress',
      }),
    ).toBe(true);

    const feedback = ensureAssessmentFeedbackHasPrompt({
      t: translate,
      feedback:
        'That is excellent recall. Ciao and buongiorno are common ways to say hello.',
      status: 'in_progress',
      topicTitle: 'Greetings & Introductions',
      topicDescription:
        'Meet people, say hello, and share simple personal details.',
      pedagogyMode: null,
    });

    expect(feedback).toContain('add one more');
    expect(feedback).toContain('translate one greeting');
  });

  it('builds the same language next action as a separate prompt', () => {
    const prompt = buildAssessmentNextActionPrompt({
      t: translate,
      topicTitle: 'Greetings & Introductions',
      topicDescription:
        'Meet people, say hello, and share simple personal details.',
      pedagogyMode: null,
    });

    expect(prompt).toBe(
      'Now add one more greeting in the language you practiced, or translate one greeting you wrote into English.',
    );
  });

  it('keeps generic reviews concrete without asking for main ideas', () => {
    const opening = buildAssessmentOpeningMessage({
      t: translate,
      topicTitle: 'Photosynthesis',
      topicDescription: 'How plants turn sunlight into food.',
      pedagogyMode: 'socratic',
    });

    expect(opening).toContain('concrete examples');
    expect(opening).not.toContain('main ideas');
    expect(opening).not.toContain('What it covers');
  });

  it('uses phrase-level prompts for non-greeting language topics', () => {
    const opening = buildAssessmentOpeningMessage({
      t: translate,
      topicTitle: 'Food & Drink',
      topicDescription: 'Ordering coffee and asking for water.',
      pedagogyMode: 'four_strands',
      languageCode: 'it',
    });

    expect(opening).toContain('words or short phrases');
    expect(opening).toContain('Italian');
    expect(opening).not.toContain('say hello');
  });
});
