import {
  misconceptionRepairFlow,
  evaluateMisconceptionVerdict,
  type MisconceptionRepairInput,
} from './misconception-repair';
import { getProfile } from '../fixtures/profiles';

function inputFor(scenarioId: string): MisconceptionRepairInput {
  for (const profileId of [
    '12yo-dinosaurs',
    '15yo-football-gaming',
    '17yo-french-advanced',
  ]) {
    const profile = getProfile(profileId);
    if (!profile) continue;
    const scenario = misconceptionRepairFlow
      .enumerateScenarios?.(profile)
      ?.find((s) => s.scenarioId === scenarioId);
    if (scenario) return scenario.input;
  }
  throw new Error(`scenario missing: ${scenarioId}`);
}

function runResult(verdict: unknown): string {
  return JSON.stringify({ transcript: [], verdict });
}

describe('misconception-repair — evaluateMisconceptionVerdict', () => {
  it('passes clean on a fully repaired, well-taught dialogue', () => {
    const input = inputFor('MR01-seasons');
    const issues = evaluateMisconceptionVerdict(
      input,
      runResult({
        repaired: 'yes',
        reinforced_misconception: false,
        gave_direct_answer_without_teaching: false,
        evidence: 'student restated tilt in own words',
      }),
    );
    expect(issues).toEqual([]);
  });

  it('ERRORS when the misconception was not repaired', () => {
    const input = inputFor('MR01-seasons');
    const issues = evaluateMisconceptionVerdict(
      input,
      runResult({
        repaired: 'no',
        reinforced_misconception: false,
        gave_direct_answer_without_teaching: false,
        evidence: 'student still says distance causes seasons',
      }),
    );
    expect(issues.some((i) => i.code === 'MR01-seasons.not-repaired')).toBe(
      true,
    );
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('ERRORS when the mentor reinforced the misconception (worst case)', () => {
    const input = inputFor('MR02-multiplication');
    const issues = evaluateMisconceptionVerdict(
      input,
      runResult({
        repaired: 'partial',
        reinforced_misconception: true,
        gave_direct_answer_without_teaching: false,
        evidence: 'tutor agreed multiplying always grows numbers',
      }),
    );
    expect(
      issues.some((i) => i.code === 'MR02-multiplication.reinforced'),
    ).toBe(true);
  });

  it('warns (not errors) on partial repair', () => {
    const input = inputFor('MR03-falling');
    const issues = evaluateMisconceptionVerdict(
      input,
      runResult({
        repaired: 'partial',
        reinforced_misconception: false,
        gave_direct_answer_without_teaching: false,
      }),
    );
    expect(issues.some((i) => i.code === 'MR03-falling.partial-repair')).toBe(
      true,
    );
    expect(issues.some((i) => i.severity === 'error')).toBe(false);
  });

  it('warns when the mentor told the answer without teaching', () => {
    const input = inputFor('MR01-seasons');
    const issues = evaluateMisconceptionVerdict(
      input,
      runResult({
        repaired: 'yes',
        reinforced_misconception: false,
        gave_direct_answer_without_teaching: true,
      }),
    );
    expect(issues.some((i) => i.code === 'MR01-seasons.told-not-taught')).toBe(
      true,
    );
  });

  it('warns (never errors) when the judge was unavailable', () => {
    const input = inputFor('MR01-seasons');
    const issues = evaluateMisconceptionVerdict(
      input,
      runResult({ error: 'timeout' }),
    );
    expect(
      issues.some((i) => i.code === 'MR01-seasons.judge-unavailable'),
    ).toBe(true);
    expect(issues.some((i) => i.severity === 'error')).toBe(false);
  });
});
