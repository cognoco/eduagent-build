import { subjectClassifyLlmResponseSchema } from '@eduagent/schemas';

import {
  buildSubjectClassifyMessages,
  deriveSubjectClassifyResult,
  AUTO_PICK_CONFIDENCE,
  MIN_CANDIDATE_CONFIDENCE,
} from '../../src/services/subject-classify';
import { routeAndCall, extractFirstJsonObject } from '../../src/services/llm';
import type { EvalProfile } from '../fixtures/profiles';
import { bootstrapLlmProviders } from '../runner/llm-bootstrap';
import type { FlowDefinition, PromptMessages, Scenario } from '../runner/types';

// ---------------------------------------------------------------------------
// Subject-classification live-eval flow.
//
// Closes the structural gap behind the 2026-06-25 "water filed under
// Statistics" defect: the classifier had NO real-LLM coverage (every unit test
// mocks the LLM), so the prompt could order the model to force-fit an unrelated
// subject and nothing caught it. The deterministic prompt-guard unit test
// (subject-classify.test.ts) catches prompt-TEXT regressions; this flow catches
// the real model DRIFTING back into force-matching.
//
// It exercises the EXACT production path: buildSubjectClassifyMessages →
// routeAndCall(rung 1) → deriveSubjectClassifyResult (same floor + auto-pick
// logic prod uses). The decisive assertion is the abstain case — an off-topic
// question on a sparse account must yield ZERO candidates after the relatedness
// floor and surface a new-subject suggestion, never a forced match.
// ---------------------------------------------------------------------------

interface SubjectFixture {
  id: string;
  name: string;
}

type Expectation =
  // Off-topic / unrelated → must abstain: empty candidates + a new-subject
  // suggestion. This is the regression guard for the original defect.
  | { kind: 'no-match' }
  // Genuinely related → at least one candidate whose name is in `anyOf`.
  // `autoPick` additionally requires the top candidate to clear the 0.88 bar
  // with no confirmation step.
  | { kind: 'match'; anyOf: string[]; autoPick?: boolean };

interface SubjectClassifyInput {
  subjects: SubjectFixture[];
  text: string;
  expectation: Expectation;
}

const STATISTICS_ONLY: SubjectFixture[] = [
  { id: '00000000-0000-7000-8000-0000000000a1', name: 'Statistics' },
];

const STATISTICS_AND_FRENCH: SubjectFixture[] = [
  { id: '00000000-0000-7000-8000-0000000000a1', name: 'Statistics' },
  { id: '00000000-0000-7000-8000-0000000000a2', name: 'French' },
];

const MATH_AND_HISTORY: SubjectFixture[] = [
  { id: '00000000-0000-7000-8000-0000000000b1', name: 'Mathematics' },
  { id: '00000000-0000-7000-8000-0000000000b2', name: 'History' },
];

const HISTORY_AND_PHYSICS: SubjectFixture[] = [
  { id: '00000000-0000-7000-8000-0000000000c1', name: 'History' },
  { id: '00000000-0000-7000-8000-0000000000c2', name: 'Physics' },
];

const FIXTURES: Array<{ scenarioId: string; input: SubjectClassifyInput }> = [
  // --- Abstain cases (the bug class) -------------------------------------
  {
    // THE reported defect: water on a Statistics-only account.
    scenarioId: 'water-on-statistics-only',
    input: {
      subjects: STATISTICS_ONLY,
      text: 'Why does ice float on water?',
      expectation: { kind: 'no-match' },
    },
  },
  {
    scenarioId: 'chemistry-on-statistics-only',
    input: {
      subjects: STATISTICS_ONLY,
      text: 'Balance this chemical equation: H2 + O2 -> H2O',
      expectation: { kind: 'no-match' },
    },
  },
  {
    scenarioId: 'sky-blue-on-statistics-and-french',
    input: {
      subjects: STATISTICS_AND_FRENCH,
      text: 'Why is the sky blue during the day?',
      expectation: { kind: 'no-match' },
    },
  },
  // --- Genuine matches (must NOT over-abstain) ---------------------------
  {
    scenarioId: 'algebra-on-math-and-history',
    input: {
      subjects: MATH_AND_HISTORY,
      text: 'Solve for x: 2x + 5 = 15',
      expectation: { kind: 'match', anyOf: ['Mathematics'], autoPick: true },
    },
  },
  {
    // Genuine cross-disciplinary overlap — either enrolled subject is a
    // defensible home, so we accept a candidate in {History, Physics}.
    scenarioId: 'war-of-currents-on-history-and-physics',
    input: {
      subjects: HISTORY_AND_PHYSICS,
      text: 'What was the War of Currents between Tesla and Edison about?',
      expectation: { kind: 'match', anyOf: ['History', 'Physics'] },
    },
  },
];

export const subjectClassifyFlow: FlowDefinition<SubjectClassifyInput> = {
  id: 'subject-classify',
  name: 'Subject classification (enrolled-subject relevance)',
  sourceFile: 'apps/api/src/services/subject-classify.ts:classifySubject',

  buildPromptInput(_profile: EvalProfile): SubjectClassifyInput | null {
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<SubjectClassifyInput>> | null {
    // Run once, under a single profile, like topic-intent-matcher.
    if (profile.id !== '11yo-czech-animals') return null;
    return FIXTURES;
  },

  buildPrompt(input: SubjectClassifyInput): PromptMessages {
    const [system, user] = buildSubjectClassifyMessages(
      input.subjects,
      input.text,
    );
    const expectationNote =
      input.expectation.kind === 'no-match'
        ? 'Expected: NO match (empty candidates after floor) + new-subject suggestion'
        : `Expected: match in {${input.expectation.anyOf.join(', ')}}${
            input.expectation.autoPick ? ' (auto-pick, no confirmation)' : ''
          }`;
    return {
      system: typeof system?.content === 'string' ? system.content : '',
      user: typeof user?.content === 'string' ? user.content : '',
      notes: [
        `Enrolled: ${input.subjects.map((s) => s.name).join(', ')}`,
        expectationNote,
        `Floor=${MIN_CANDIDATE_CONFIDENCE} AutoPick=${AUTO_PICK_CONFIDENCE}`,
      ],
    };
  },

  expectedResponseSchema: subjectClassifyLlmResponseSchema,

  async runLive(
    input: SubjectClassifyInput,
    messages: PromptMessages,
  ): Promise<string> {
    bootstrapLlmProviders();
    const result = await routeAndCall(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      1, // Rung 1 = Gemini Flash (fast/cheap) — matches classifySubject
      { flow: 'subject-classify', llmTier: 'flash' },
    );

    const jsonStr = extractFirstJsonObject(result.response);
    const parsed = subjectClassifyLlmResponseSchema.safeParse(
      JSON.parse(jsonStr ?? '{}'),
    );
    if (!parsed.success) {
      throw new Error('subject-classify response failed schema validation');
    }

    // Derive the FINAL decision through the same production code the prompt is
    // meant to guard — the eval can never pass on raw matches the floor would
    // have dropped, nor fail on matches the floor protects against.
    const decision = deriveSubjectClassifyResult(
      parsed.data,
      input.subjects,
      input.text,
    );

    const got =
      decision.candidates.length === 0
        ? 'no-match'
        : `[${decision.candidates
            .map((c) => `${c.subjectName}@${c.confidence.toFixed(2)}`)
            .join(', ')}]`;

    if (input.expectation.kind === 'no-match') {
      if (decision.candidates.length > 0) {
        throw new Error(
          `Expected NO match (abstain) but got ${got} — force-match regression on "${input.text}"`,
        );
      }
      if (!decision.suggestedSubjectName) {
        throw new Error(
          `Abstained correctly but produced no new-subject suggestion for "${input.text}"`,
        );
      }
      return result.response;
    }

    // expectation.kind === 'match'
    const top = decision.candidates[0];
    const hit = decision.candidates.some((c) =>
      input.expectation.kind === 'match'
        ? input.expectation.anyOf.includes(c.subjectName)
        : false,
    );
    if (!hit) {
      throw new Error(
        `Expected a candidate in {${input.expectation.anyOf.join(
          ', ',
        )}} but got ${got} for "${input.text}"`,
      );
    }
    if (input.expectation.autoPick) {
      if (!top || !input.expectation.anyOf.includes(top.subjectName)) {
        throw new Error(
          `Expected top candidate in {${input.expectation.anyOf.join(
            ', ',
          )}} but top was ${top?.subjectName ?? 'none'} for "${input.text}"`,
        );
      }
      if (decision.needsConfirmation) {
        throw new Error(
          `Expected auto-pick (no confirmation) but top ${top.subjectName}@${top.confidence.toFixed(
            2,
          )} was below the ${AUTO_PICK_CONFIDENCE} bar for "${input.text}"`,
        );
      }
    }
    return result.response;
  },
};
