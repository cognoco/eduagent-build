import type { Subject, Curriculum, CurriculumTopic } from '@eduagent/schemas';
import { uuidv7 } from 'uuidv7';

let counter = 0;

export function buildSubject(overrides?: Partial<Subject>): Subject {
  counter++;
  const now = new Date().toISOString();
  return {
    id: uuidv7(),
    profileId: uuidv7(),
    name: `Test Subject ${counter}`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildCurriculum(overrides?: Partial<Curriculum>): Curriculum {
  return {
    id: uuidv7(),
    subjectId: uuidv7(),
    version: 1,
    topics: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function buildCurriculumTopic(
  overrides?: Partial<CurriculumTopic>
): CurriculumTopic {
  counter++;
  return {
    id: uuidv7(),
    title: `Topic ${counter}`,
    description: `Description for topic ${counter}`,
    sortOrder: counter,
    relevance: 'core',
    estimatedMinutes: 30,
    skipped: false,
    ...overrides,
  };
}

/** Reset the internal counter — useful in test `beforeEach` blocks. */
export function resetSubjectCounter(): void {
  counter = 0;
}
