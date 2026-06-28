import {
  reviewContinuityOpenerFlow,
  type ReviewContinuityOpenerInput,
} from './review-continuity-opener';
import { assertTwoModelGuard } from '../runner/simulated-conversation';
import { reviewContinuityContexts } from '../fixtures/review-continuity';
import { PROFILES } from '../fixtures/profiles';
import type { EvalProfile } from '../fixtures/profiles';
import type { DeterministicCheckContext, QualityIssue } from '../runner/types';

function profileFor(fixtureId: string): EvalProfile {
  const fixture = reviewContinuityContexts.find((f) => f.id === fixtureId)!;
  return PROFILES.find((p) => p.id === fixture.profileRef)!;
}

const enumerate = reviewContinuityOpenerFlow.enumerateScenarios!;

describe('reviewContinuityOpenerFlow', () => {
  it('enumerates a scenario per fixture matching the profile, with context attached', () => {
    const profile = profileFor('verbatim-solid'); // 12yo-dinosaurs
    const scenarios = enumerate(profile) ?? [];
    const ids = scenarios.map((s) => s.scenarioId);
    expect(ids).toContain('verbatim-solid');
    const solid = scenarios.find((s) => s.scenarioId === 'verbatim-solid')!;
    expect(solid.input.context.priorRetrieval?.verdict).toBe('solid');
    expect(solid.input.exchangeContext.effectiveMode).toBe('review');
    expect(solid.input.exchangeContext.exchangeCount).toBe(0);
  });

  it('buildPrompt embeds the continuity opener for a material fixture', () => {
    const profile = profileFor('verbatim-solid');
    const scenario = enumerate(profile)!.find(
      (s) => s.scenarioId === 'verbatim-solid',
    )!;
    const messages = reviewContinuityOpenerFlow.buildPrompt(scenario.input);
    expect(messages.system).toContain('CONTINUITY OPENER:');
    // The deterministic builder block is surfaced in the snapshot notes.
    expect(messages.notes?.some((n) => n.includes('CONTINUITY OPENER:'))).toBe(
      true,
    );
  });

  it('buildPrompt degrades to the generic block for declined consent', () => {
    const profile = profileFor('consent-declined'); // 15yo-football-gaming
    const scenario = enumerate(profile)!.find(
      (s) => s.scenarioId === 'consent-declined',
    )!;
    const messages = reviewContinuityOpenerFlow.buildPrompt(scenario.input);
    expect(messages.system).toContain('CALIBRATION QUESTION:');
    expect(messages.system).not.toContain('CONTINUITY OPENER:');
  });

  it('evaluateDeterministic passes a faithful material scenario', () => {
    const profile = profileFor('verbatim-solid');
    const scenario = enumerate(profile)!.find(
      (s) => s.scenarioId === 'verbatim-solid',
    )!;
    const messages = reviewContinuityOpenerFlow.buildPrompt(scenario.input);
    const ctx: DeterministicCheckContext<ReviewContinuityOpenerInput> = {
      input: scenario.input,
      messages,
      profile,
      scenarioId: scenario.scenarioId,
    };
    const issues = reviewContinuityOpenerFlow.evaluateDeterministic!(
      ctx,
    ) as QualityIssue[];
    expect(issues).toEqual([]);
  });

  it('evaluateDeterministic flags a continuity block leaking under declined consent', () => {
    const profile = profileFor('consent-declined');
    const scenario = enumerate(profile)!.find(
      (s) => s.scenarioId === 'consent-declined',
    )!;
    // Tamper: pretend the assembled prompt leaked a continuity opener.
    const tampered: DeterministicCheckContext<ReviewContinuityOpenerInput> = {
      input: scenario.input,
      messages: {
        system: 'CONTINUITY OPENER: leaked memory under declined consent',
      },
      profile,
      scenarioId: scenario.scenarioId,
    };
    const issues = reviewContinuityOpenerFlow.evaluateDeterministic!(
      tampered,
    ) as QualityIssue[];
    expect(issues.some((i) => i.code.endsWith('.degrade'))).toBe(true);
    expect(issues[0]?.severity).toBe('error');
  });

  it('two-model guard rejects a same-base-family mentor/judge pair', () => {
    // Same underlying model under two slugs must be refused.
    expect(() =>
      assertTwoModelGuard('openai/gpt-oss-120b', 'gpt-oss-120b', false),
    ).toThrow(/two-model guard/);
    // Genuinely independent models are accepted.
    expect(() =>
      assertTwoModelGuard(
        'openai/gpt-oss-120b',
        'anthropic/claude-3.5-sonnet',
        false,
      ),
    ).not.toThrow();
  });
});
