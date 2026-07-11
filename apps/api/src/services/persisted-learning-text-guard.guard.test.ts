import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BadRequestError } from '../errors';
import {
  assertNoClinicalInferenceInLearningRecord,
  scrubClinicalInferenceFromLearningRecord,
} from './persisted-learning-text-guard';

const SERVICE_ROOT = resolve(__dirname);

function readService(relativePath: string): string {
  return readFileSync(resolve(SERVICE_ROOT, relativePath), 'utf8');
}

describe('[WI-1195] persisted learning-text guard wiring', () => {
  it('keeps all three Art 9 persistence boundaries guarded', () => {
    const memoryMapping = readService('memory/backfill-mapping.ts');
    const memoryDedup = readService('memory/dedup-actions.ts');
    const notes = readService('notes.ts');
    const challengeRound = readService('session/session-exchange.ts');
    const learnerProfile = readService('learner-profile.ts');

    expect(
      memoryMapping.match(
        /learningTextGuard\.scrubClinicalInferenceFromLearningRecord/g,
      ),
    ).toHaveLength(1);
    expect(
      memoryDedup.match(
        /learningTextGuard\.scrubClinicalInferenceFromLearningRecord/g,
      ),
    ).toHaveLength(1);
    expect(
      notes.match(
        /learningTextGuard\.assertNoClinicalInferenceInLearningRecord/g,
      ),
    ).toHaveLength(2);
    expect(
      challengeRound.match(
        /learningTextGuard\.scrubClinicalInferenceFromLearningRecord/g,
      ),
    ).toHaveLength(2);
    expect(
      learnerProfile.match(
        /learningTextGuard\.scrubClinicalInferenceFromLearningRecord/g,
      ),
    ).toHaveLength(1);
  });
});

describe('[WI-1195] persisted learning-text clinical attribution guard', () => {
  it.each([
    'Alex has ADHD.',
    'Alex probably has ADHD.',
    'Alex possibly has ADHD.',
    'Sam is autistic.',
    'Jordan shows signs of dyslexia.',
  ])(
    'rejects a clinical characterisation attributed to a named person: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
    },
  );

  it.each([
    'The learner has ADHD.',
    'The learner probably has ADHD.',
    'The learner possibly has ADHD.',
    'Their autism affects the learning plan.',
  ])(
    'rejects a qualified clinical characterisation attributed to a generic person: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
    },
  );

  it('rejects a named possessive clinical characterisation', () => {
    expect(
      scrubClinicalInferenceFromLearningRecord("Alex's dyslexia"),
    ).toBeNull();
  });

  it.each([
    "I'm autistic.",
    'I’m autistic.',
    "She's dyslexic.",
    'She’s dyslexic.',
    "They're autistic.",
    'They’re autistic.',
  ])('rejects a contracted clinical characterisation: %s', (text) => {
    expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
  });

  it('keeps null input null', () => {
    expect(scrubClinicalInferenceFromLearningRecord(null)).toBeNull();
  });

  it('throws BadRequestError at an asserting persistence boundary', () => {
    expect(() =>
      assertNoClinicalInferenceInLearningRecord('The learner has ADHD.'),
    ).toThrow(BadRequestError);
  });

  it.each([
    'ADHD can affect executive function.',
    'Alex is learning about ADHD.',
    "I'm learning about autism.",
    'She’s studying dyslexia.',
    "They're discussing ADHD.",
  ])(
    'allows educational discussion without a clinical characterisation: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBe(text);
    },
  );
});
