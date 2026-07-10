import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scrubClinicalInferenceFromLearningRecord } from './persisted-learning-text-guard';

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

  it.each(['The learner probably has ADHD.', 'The learner possibly has ADHD.'])(
    'rejects a qualified clinical characterisation attributed to a generic person: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
    },
  );

  it.each([
    'ADHD can affect executive function.',
    'Alex is learning about ADHD.',
  ])(
    'allows educational discussion without a clinical characterisation: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBe(text);
    },
  );
});
