import {
  CONCEPT_CAPTURE_ENABLED,
  captureConceptMastery,
} from './concept-capture';

// WI-781: concept-capture is now ACTIVE. The MMT-ADR-0012 baseline-reset tables
// landed and the identity-cutover `profiles`→`person` FK repoint applied to
// `concepts` / `concept_mastery` on staging and production, so the parked
// kill-switch is flipped on. (Live traffic through the gated call site still
// additionally requires CHALLENGE_ROUND_RUNTIME_ENABLED, a separate flag.)
describe('concept-capture enabled-state guard', () => {
  it('keeps CONCEPT_CAPTURE_ENABLED enabled now the person-FK repoint has landed', () => {
    expect(CONCEPT_CAPTURE_ENABLED).toBe(true);
  });

  it('keeps the gated write path exported so the kill-switch still guards a live path', () => {
    expect(typeof captureConceptMastery).toBe('function');
  });
});
