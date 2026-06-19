import { readFileSync } from 'fs';
import { resolve } from 'path';

import { CONCEPT_CAPTURE_ENABLED } from './concept-capture';

/**
 * Forward-only parked-state guard for concept-capture (the Challenge-Round
 * "mastery star" feature).
 *
 * Concept-capture is PARKED until the identity baseline reset (MMT-ADR-0012)
 * applies the `concepts` / `concept_mastery` tables; migration 0107 is
 * REFERENCE-ONLY and applied in no deployed environment. While parked, the
 * single live call site in session-exchange.ts must stay behind
 * `CONCEPT_CAPTURE_ENABLED`, which must remain `false` so a flip cannot land
 * silently and start throwing `relation "concepts" does not exist` on
 * staging/prod.
 *
 * The real write path (`captureConceptMastery`) is still exercised against a
 * DB that has the tables in `concept-capture.integration.test.ts`; this guard
 * only pins the kill-switch and its gating. Flipping the constant to `true`
 * after the baseline reset must update this guard in the same change.
 */
describe('concept-capture parked-state guard', () => {
  it('keeps CONCEPT_CAPTURE_ENABLED disabled until the baseline reset', () => {
    expect(CONCEPT_CAPTURE_ENABLED).toBe(false);
  });

  it('gates the single live call site behind CONCEPT_CAPTURE_ENABLED', () => {
    // Read inside the test so a path break fails this named case rather than
    // the whole suite load.
    const source = readFileSync(
      resolve(__dirname, 'session/session-exchange.ts'),
      'utf8',
    );
    // The lone production call to captureConceptMastery must be reachable only
    // when the kill-switch is on. If the flag flips or the gate is removed,
    // this assertion (and the one above) must be updated deliberately.
    expect(source).toContain(
      'if (CONCEPT_CAPTURE_ENABLED && session.subjectId)',
    );
    expect(source).toContain('captureConceptMastery(');
  });
});
