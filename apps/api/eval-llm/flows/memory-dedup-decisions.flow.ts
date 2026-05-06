/**
 * Eval flow — memory dedup decisions (dedup-prompt.ts:buildDedupPrompt)
 *
 * Exercises the 4 action branches of the LLM dedup classifier.
 * 5 high-quality fixture pairs are implemented; 15 more are stubbed with
 * TODO comments for follow-up expansion.
 *
 * Source: apps/api/src/services/memory/dedup-prompt.ts
 */

import { bootstrapLlmProviders } from '../runner/llm-bootstrap';
import {
  buildDedupPrompt,
  dedupResponseSchema,
  type DedupPair,
} from '../../src/services/memory/dedup-prompt';
import { routeAndCall } from '../../src/services/llm/router';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages, Scenario } from '../runner/types';

// ---------------------------------------------------------------------------
// Input / scenario types
// ---------------------------------------------------------------------------

export interface DedupDecisionInput {
  pair: DedupPair;
  expectedAction: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Fixtures: 5 implemented + 15 TODO stubs
//
// Each fixture describes a pair (candidate, neighbour) and the expected action.
// These serve as snapshot anchors — the LLM response is validated against
// dedupResponseSchema during Tier 2 runs.
// ---------------------------------------------------------------------------

const FIXTURES: Array<Omit<DedupDecisionInput, never>> = [
  // ── F1: Identical facts → merge ─────────────────────────────────────────
  {
    description: 'F1-identical-merge',
    expectedAction: 'merge',
    pair: {
      candidate: {
        text: 'The learner struggles with long division.',
        category: 'struggle',
      },
      neighbour: {
        text: 'Student has difficulty with long division.',
        category: 'struggle',
      },
    },
  },

  // ── F2: One fact subsumes another → supersede ────────────────────────────
  {
    description: 'F2-subsumes-supersede',
    expectedAction: 'supersede',
    pair: {
      candidate: {
        text: 'Learner now understands fractions, including improper fractions and mixed numbers.',
        category: 'strength',
      },
      neighbour: {
        text: 'Learner understands basic fractions.',
        category: 'strength',
      },
    },
  },

  // ── F3: Tangentially related → keep_both ─────────────────────────────────
  {
    description: 'F3-tangential-keep-both',
    expectedAction: 'keep_both',
    pair: {
      candidate: {
        text: 'Learner enjoys creative writing and storytelling.',
        category: 'interest',
      },
      neighbour: {
        text: 'Learner prefers concise explanations and bullet-point summaries.',
        category: 'communication_note',
      },
    },
  },

  // ── F4: Contradictory facts → keep_both (conflict note) ──────────────────
  {
    description: 'F4-contradictory-keep-both',
    expectedAction: 'keep_both',
    pair: {
      candidate: {
        text: 'Learner prefers working through problems independently before asking for help.',
        category: 'communication_note',
      },
      neighbour: {
        text: 'Learner benefits from frequent check-ins and guided prompts throughout a problem.',
        category: 'communication_note',
      },
    },
  },

  // ── F5: Low-quality re-utterance → discard_new ───────────────────────────
  {
    description: 'F5-low-quality-reutter-discard',
    expectedAction: 'discard_new',
    pair: {
      candidate: {
        text: 'Likes space.',
        category: 'interest',
      },
      neighbour: {
        text: 'The learner is very interested in space exploration and astronomy.',
        category: 'interest',
      },
    },
  },

  // ── TODO stubs ─────────────────────────────────────────────────────────────
  // TODO F6: Two facts from different sessions but same semantic → merge
  // {
  //   description: 'F6-cross-session-merge',
  //   expectedAction: 'merge',
  //   pair: {
  //     candidate: { text: '...', category: 'struggle' },
  //     neighbour: { text: '...', category: 'struggle' },
  //   },
  // },

  // TODO F7: Strength fact with updated confidence level → supersede
  // TODO F8: Interest facts about same topic but different contexts (free_time vs school) → keep_both
  // TODO F9: Communication notes that are complementary → keep_both
  // TODO F10: Near-duplicate with minor stopword difference → merge
  // TODO F11: Struggle fact from 3 months ago vs new observation → supersede
  // TODO F12: Struggle fact partially resolved → supersede (candidate is weaker)
  // TODO F13: Identical suppressed-inference text → discard_new
  // TODO F14: Two interest facts with different labels but same concept → merge
  // TODO F15: Factual contradiction about subject mastery → keep_both
  // TODO F16: Strength rephrase with added subject detail → supersede
  // TODO F17: Communication note + strength fact (cross-category) → keep_both
  // TODO F18: Interest mention with 1-word candidate vs full sentence → discard_new
  // TODO F19: Struggle facts with same topic but different attempts count → supersede
  // TODO F20: Both facts are vague / low-signal → keep_both
];

// ---------------------------------------------------------------------------
// Flow definition
// ---------------------------------------------------------------------------

export const memoryDedupDecisionsFlow: FlowDefinition<DedupDecisionInput> = {
  id: 'memory-dedup-decisions',
  name: 'Memory Dedup Decisions (dedup-prompt.ts)',
  sourceFile: 'apps/api/src/services/memory/dedup-prompt.ts:buildDedupPrompt',

  buildPromptInput(_profile: EvalProfile): DedupDecisionInput | null {
    // This flow is fixture-driven, not profile-driven.
    // enumerateScenarios is used instead.
    return null;
  },

  enumerateScenarios(_profile: EvalProfile): Array<Scenario<DedupDecisionInput>> | null {
    // Only emit once — not once per profile. The first profile triggers emission;
    // all others are skipped. Fixtures are profile-independent.
    return FIXTURES.map((fixture) => ({
      scenarioId: fixture.description,
      input: fixture,
    }));
  },

  buildPrompt(input: DedupDecisionInput): PromptMessages {
    return {
      system: buildDedupPrompt(input.pair),
      notes: [
        `Expected action: ${input.expectedAction}`,
        `Fixture: ${input.description}`,
        `Candidate category: ${input.pair.candidate.category}`,
        `Neighbour category: ${input.pair.neighbour.category}`,
      ],
    };
  },

  expectedResponseSchema: {
    safeParse(value: unknown) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return dedupResponseSchema.safeParse(parsed);
      } catch (error) {
        return { success: false, error };
      }
    },
  },

  async runLive(input: DedupDecisionInput, messages: PromptMessages): Promise<string> {
    bootstrapLlmProviders();
    const result = await routeAndCall(
      [{ role: 'user', content: messages.system }],
      1, // rung 1 = cheapest tier (flash)
      { flow: 'memory-dedup', llmTier: 'flash' }
    );
    return result.response;
  },
};
