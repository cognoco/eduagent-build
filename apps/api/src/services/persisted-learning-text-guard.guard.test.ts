import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
