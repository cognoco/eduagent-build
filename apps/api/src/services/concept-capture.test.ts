import {
  CONCEPT_CAPTURE_ENABLED,
  captureConceptMastery,
} from './concept-capture';

// Parked guard: CONCEPT_CAPTURE_ENABLED must stay false until MMT-ADR-0012 baseline-reset tables land; a silent flip throws `relation "concepts" does not exist` on staging/prod.
describe('concept-capture parked-state guard', () => {
  it('keeps CONCEPT_CAPTURE_ENABLED disabled until the baseline reset', () => {
    expect(CONCEPT_CAPTURE_ENABLED).toBe(false);
  });

  it('keeps the gated write path exported so the kill-switch still guards something live', () => {
    expect(typeof captureConceptMastery).toBe('function');
  });
});
