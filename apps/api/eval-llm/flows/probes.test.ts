// Targeted regression tests for the homework-probe quality heuristics
// [WI-556]. Two false positives surfaced during the baseline-seed triage run
// (2026-06-09): HW03 flagged the *desired* acknowledge-then-contradict move,
// and HW01 missed a problem-specific Socratic opener. Each fix keeps a
// negative case proving the heuristic still bites on the behavior it exists
// to catch.

import { probesFlow } from './probes';
import { getProfile } from '../fixtures/profiles';
import type { QualityIssue } from '../runner/types';

function probeInput(profileId: string, probeId: string) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`fixture profile missing: ${profileId}`);
  const scenario = probesFlow
    .enumerateScenarios?.(profile)
    ?.find((s) => s.scenarioId === probeId);
  if (!scenario) throw new Error(`probe missing: ${probeId} for ${profileId}`);
  return { profile, input: scenario.input };
}

async function evaluate(
  profileId: string,
  probeId: string,
  envelope: Record<string, unknown>,
): Promise<QualityIssue[]> {
  const { profile, input } = probeInput(profileId, probeId);
  return await probesFlow.evaluateQuality!({
    input,
    messages: { system: '' },
    liveResponse: JSON.stringify(envelope),
    profile,
    scenarioId: probeId,
  });
}

describe('probes quality heuristics — HW03 (conflicting learner answer)', () => {
  it('accepts acknowledge-then-contradict ("You\'re right that … However …")', async () => {
    // Verbatim shape of the live reply that false-positived on 2026-06-09:
    // a valid sub-fact acknowledgement followed by the contradiction is the
    // DESIRED tutoring move, not validation of the conflicting answer.
    const issues = await evaluate('13yo-spanish-beginner', 'HW03', {
      reply:
        'You\'re right that "cansado" means tired! However, the worksheet note says temporary states use "estar". Which verb should you use?',
      private_sources: { relied_on: ['homework_problem'], insufficient: false },
    });
    expect(issues.filter((i) => i.code === 'HW03.conflict')).toEqual([]);
  });

  it('still flags validation of the conflicting answer with no contrast', async () => {
    const issues = await evaluate('13yo-spanish-beginner', 'HW03', {
      reply: 'Yes, that is correct! "Soy cansado" is the right way to say it.',
      private_sources: { relied_on: ['homework_problem'], insufficient: false },
    });
    expect(issues.some((i) => i.code === 'HW03.conflict')).toBe(true);
  });

  it('still flags direct validation even when a contrast word follows', async () => {
    // Codex review on PR #820: a contrast-anywhere exemption would let
    // "That's correct! But …" pass. Only the sub-fact acknowledgment form
    // ("right that/about …") is exempt; direct validation stays flagged.
    const issues = await evaluate('13yo-spanish-beginner', 'HW03', {
      reply:
        'That is correct! But let\'s also practice a few more examples with "ser".',
      private_sources: { relied_on: ['homework_problem'], insufficient: false },
    });
    expect(issues.some((i) => i.code === 'HW03.conflict')).toBe(true);
  });
});

describe('probes quality heuristics — P17 (Feynman teach-back)', () => {
  const rubric = {
    completeness: 4,
    accuracy: 4,
    clarity: 3,
    overall_quality: 4,
    weakest_area: 'clarity',
    gap_identified: null,
  };

  it('accepts a naive follow-up question with the private rubric emitted', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'P17', {
      reply:
        'Oh interesting — so when you say minerals replace the bone, does the shape stay the same the whole time?',
      signals: { teach_back_assessment: rubric },
    });
    expect(issues).toEqual([]);
  });

  it('flags a missing teach-back rubric', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'P17', {
      reply: 'So what happens to the shape while the minerals move in?',
      signals: {},
    });
    expect(issues.some((i) => i.code === 'P17.rubric-missing')).toBe(true);
  });

  it('flags the rubric leaking into the visible reply', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'P17', {
      reply:
        'Nice. completeness: 4, accuracy: 4. What happens to the shape as minerals move in?',
      signals: { teach_back_assessment: rubric },
    });
    expect(issues.some((i) => i.code === 'P17.rubric-leak')).toBe(true);
  });
});

describe('probes quality heuristics — P15/P22 (escalation)', () => {
  it('accepts a harder application question on a strong streak (P15)', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'P15', {
      reply:
        'Good — then predict what would happen to the edge case if the input doubled. Why?',
      signals: {},
    });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('errors when the reply only affirms with no forward motion (P22)', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'P22', {
      reply: "Yes, you've really got this down. Nicely done.",
      signals: {},
    });
    expect(issues.some((i) => i.code === 'P22.no-forward-motion')).toBe(true);
  });

  it('warns when re-teaching a learner with strong retention (P22)', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'P22', {
      reply:
        'Let me explain the basic idea again. What do you think comes next?',
      signals: {},
    });
    expect(issues.some((i) => i.code === 'P22.reteach')).toBe(true);
  });
});

describe('probes quality heuristics — P08 (worked-example fading)', () => {
  it('accepts a reply that hands the next step back to the learner', async () => {
    const issues = await evaluate('15yo-football-gaming', 'P08', {
      reply:
        "We've set up the first factor together — can you take the next step from here?",
      signals: {},
    });
    expect(issues).toEqual([]);
  });

  it('warns when the reply works the whole problem with no hand-back', async () => {
    const issues = await evaluate('15yo-football-gaming', 'P08', {
      reply:
        'So the full solution is x equals 3 and x equals 2. That is the complete factoring.',
      signals: {},
    });
    expect(issues.some((i) => i.code === 'P08.no-handback')).toBe(true);
  });
});

describe('probes quality heuristics — HW02 (too-little-text, solved-from-memory) [WI-1316]', () => {
  // False positive surfaced 2026-07-02: the old surface-phrase regex
  // (`/\bquestion 4 (is|means|answer)\b/i`) flagged CORRECT clarifying
  // replies ("question 4 is asking for the missing numbers") as if the
  // model had solved the cut-off cell-biology question from memory. The
  // fix content-anchors the check on the specific answer text a real
  // from-memory leak would contain, mirroring HW04.photo-invention.

  it('accepts a clarifying reply that does not solve from memory', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'HW02', {
      reply:
        'It looks like question 4 is asking for the missing worksheet text — can you send a photo of the rest, or tell me what it says?',
      private_sources: { relied_on: [], insufficient: true },
    });
    expect(issues.filter((i) => i.code === 'HW02.solved-from-memory')).toEqual(
      [],
    );
  });

  it('still flags a reply that answers the cut-off question from memory', async () => {
    const issues = await evaluate('12yo-dinosaurs', 'HW02', {
      reply:
        'No problem — cells are the basic unit of life. The nucleus controls the cell, and the cell membrane holds everything in.',
      private_sources: { relied_on: [], insufficient: true },
    });
    expect(issues.some((i) => i.code === 'HW02.solved-from-memory')).toBe(true);
  });
});

describe('probes quality heuristics — HW01 (solvable problem, first step)', () => {
  const fullSources = {
    relied_on: ['homework_problem', 'deterministic_reasoning'],
    insufficient: false,
  };

  it('accepts a problem-specific Socratic first-move reply', async () => {
    // Verbatim shape of the live reply that false-positived on 2026-06-09:
    // anchors on THIS equation and prompts the first move toward isolating x.
    const issues = await evaluate('15yo-football-gaming', 'HW01', {
      reply:
        "To solve for 'x' in an equation like `2x + 5 = 17`, our goal is to get 'x' by itself. What would be your first move?",
      private_sources: fullSources,
    });
    expect(issues.filter((i) => i.code === 'HW01.answer')).toEqual([]);
  });

  it('still flags a generic algebra lecture that never engages the problem', async () => {
    const issues = await evaluate('15yo-football-gaming', 'HW01', {
      reply:
        'Algebra is about balancing equations. Variables stand for unknown numbers, and equations stay equal when you do the same thing to each side.',
      private_sources: fullSources,
    });
    expect(issues.some((i) => i.code === 'HW01.answer')).toBe(true);
  });
});
