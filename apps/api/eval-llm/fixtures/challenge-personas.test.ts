import {
  CHALLENGE_SIM_SCENARIOS,
  resolveScenarioProfile,
  type ChallengeSimExpectedOutcome,
} from './challenge-personas';
import { PROFILES } from './profiles';

const VALID_OUTCOMES: ChallengeSimExpectedOutcome[] = [
  'verified',
  'partial',
  'reteach',
];

describe('CHALLENGE_SIM_SCENARIOS', () => {
  it('has at least 6 scenarios', () => {
    expect(CHALLENGE_SIM_SCENARIOS.length).toBeGreaterThanOrEqual(6);
  });

  it('every scenario has a unique id', () => {
    const ids = CHALLENGE_SIM_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scenario references a resolvable profile id', () => {
    for (const scenario of CHALLENGE_SIM_SCENARIOS) {
      const profile = resolveScenarioProfile(scenario);
      expect(profile).toBeDefined();
      expect(profile?.id).toBe(scenario.profileId);
    }
  });

  it('every scenario has ≥1 concept, a non-empty competence brief, and topic copy', () => {
    for (const scenario of CHALLENGE_SIM_SCENARIOS) {
      expect(scenario.concepts.length).toBeGreaterThanOrEqual(1);
      expect(scenario.concepts.every((c) => c.trim().length > 0)).toBe(true);
      expect(scenario.competenceBrief.trim().length).toBeGreaterThan(0);
      expect(scenario.seedQuestion.trim().length).toBeGreaterThan(0);
      expect(scenario.subjectName.trim().length).toBeGreaterThan(0);
      expect(scenario.topicTitle.trim().length).toBeGreaterThan(0);
      expect(scenario.topicDescription.trim().length).toBeGreaterThan(0);
    }
  });

  it('every scenario has a valid expectedOutcome', () => {
    for (const scenario of CHALLENGE_SIM_SCENARIOS) {
      expect(VALID_OUTCOMES).toContain(scenario.expectedOutcome);
    }
  });

  it('spans all three expected outcomes', () => {
    const outcomes = new Set(
      CHALLENGE_SIM_SCENARIOS.map((s) => s.expectedOutcome),
    );
    expect(outcomes).toEqual(new Set(VALID_OUTCOMES));
  });

  it('spans at least 4 of the 5 eval profiles', () => {
    const usedProfiles = new Set(
      CHALLENGE_SIM_SCENARIOS.map((s) => s.profileId),
    );
    expect(usedProfiles.size).toBeGreaterThanOrEqual(4);
    expect(usedProfiles.size).toBeLessThanOrEqual(PROFILES.length);
  });
});
