import type { CapitalsLlmOutput } from '@eduagent/schemas';
import {
  validateCapitalsRound,
  validateDistractors,
} from './capitals-validation';

describe('validateCapitalsRound', () => {
  it('corrects a wrong capital from the LLM', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [
        {
          country: 'Australia',
          correctAnswer: 'Sydney',
          distractors: ['Melbourne', 'Brisbane', 'Perth'],
          funFact: 'Test fact.',
        },
      ],
    };

    const validated = validateCapitalsRound(llmOutput);

    expect(validated.questions[0]?.correctAnswer).toBe('Canberra');
    expect(validated.questions[0]?.acceptedAliases).toEqual(['Canberra']);
  });

  it('keeps the correct answer and enriches aliases', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [
        {
          country: 'Czech Republic',
          correctAnswer: 'Prague',
          distractors: ['Brno', 'Ostrava', 'Plzen'],
          funFact: 'Test fact.',
        },
      ],
    };

    const validated = validateCapitalsRound(llmOutput);

    expect(validated.questions[0]?.correctAnswer).toBe('Prague');
    expect(validated.questions[0]?.acceptedAliases).toContain('Praha');
  });

  it('drops questions for unknown countries', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [
        {
          country: 'France',
          correctAnswer: 'Paris',
          distractors: ['Lyon', 'Marseille', 'Nice'],
          funFact: 'Fact 1.',
        },
        {
          country: 'Narnia',
          correctAnswer: 'Cair Paravel',
          distractors: ['A', 'B', 'C'],
          funFact: 'Fact 2.',
        },
      ],
    };

    const validated = validateCapitalsRound(llmOutput);

    expect(validated.questions.length).toBe(1);
    expect(validated.questions[0]?.country).toBe('France');
  });

  it('keeps the LLM fun fact when one is provided', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [
        {
          country: 'France',
          correctAnswer: 'Paris',
          distractors: ['Lyon', 'Marseille', 'Nice'],
          funFact: 'LLM generated fact.',
        },
      ],
    };

    const validated = validateCapitalsRound(llmOutput);

    expect(validated.questions[0]?.funFact).toBe('LLM generated fact.');
  });
});

describe('validateDistractors', () => {
  it('allows real capitals as distractors when they are not the correct answer', () => {
    const result = validateDistractors('France', 'Paris', [
      'Berlin',
      'London',
      'Rome',
    ]);

    expect(result).toEqual(['Berlin', 'London', 'Rome']);
  });

  it('removes a distractor matching the correct answer', () => {
    const result = validateDistractors('France', 'Paris', [
      'Paris',
      'Berlin',
      'Rome',
    ]);

    expect(result).not.toContain('Paris');
    expect(result).toHaveLength(3);
  });
});
