import type { CapitalsLlmOutput } from '@eduagent/schemas';
import { CAPITALS_BY_COUNTRY, CAPITALS_DATA } from './capitals-data';

export interface ValidatedCapitalsQuestion {
  country: string;
  correctAnswer: string;
  acceptedAliases: string[];
  distractors: string[];
  funFact: string;
}

export interface ValidatedCapitalsRound {
  theme: string;
  questions: ValidatedCapitalsQuestion[];
}

function buildFallbackDistractors(
  correctAnswer: string,
  existing: string[]
): string[] {
  const seen = new Set(
    [correctAnswer, ...existing].map((item) => item.trim().toLowerCase())
  );
  const padded = [...existing];

  for (const entry of CAPITALS_DATA) {
    const candidate = entry.capital;
    const key = candidate.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    padded.push(candidate);
    if (padded.length === 3) break;
  }

  return padded.slice(0, 3);
}

export function validateDistractors(
  _country: string,
  correctAnswer: string,
  distractors: string[]
): string[] {
  const correctLower = correctAnswer.trim().toLowerCase();
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const distractor of distractors) {
    const normalized = distractor.trim();
    const normalizedLower = normalized.toLowerCase();

    if (!normalized) continue;
    if (normalizedLower === correctLower) continue;
    if (seen.has(normalizedLower)) continue;

    seen.add(normalizedLower);
    valid.push(normalized);
  }

  return buildFallbackDistractors(correctAnswer, valid);
}

export function validateCapitalsRound(
  llmOutput: CapitalsLlmOutput
): ValidatedCapitalsRound {
  const questions: ValidatedCapitalsQuestion[] = [];

  for (const question of llmOutput.questions) {
    const reference = CAPITALS_BY_COUNTRY.get(question.country.toLowerCase());
    if (!reference) continue;

    questions.push({
      country: reference.country,
      correctAnswer: reference.capital,
      acceptedAliases: reference.acceptedAliases,
      distractors: validateDistractors(
        reference.country,
        reference.capital,
        question.distractors
      ),
      funFact: question.funFact || reference.funFact,
    });
  }

  return {
    theme: llmOutput.theme,
    questions,
  };
}
