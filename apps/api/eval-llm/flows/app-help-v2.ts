import {
  buildAppHelpDirectReply,
  buildAppHelpPromptBlock,
} from '../../src/services/app-help-map';
import { routeAndCall } from '../../src/services/llm/router';
import type { EvalProfile } from '../fixtures/profiles';
import { bootstrapLlmProviders } from '../runner/llm-bootstrap';
import type {
  DeterministicCheckContext,
  FlowDefinition,
  PromptMessages,
  QualityCheckContext,
  QualityIssue,
  Scenario,
} from '../runner/types';

// app-help-v2 — does the mentor route internal app-navigation questions to the
// V2 three-tab shell (Mentor / Subjects / Journal + the Account sheet) instead
// of the deleted V0/V1 destinations (Home > My Notes, More >, Library >, Open
// Progress)? The system prompt is the REAL production `buildAppHelpPromptBlock`
// V2 block — this exercises the same server-owned map the exchange path injects
// (`exchanges.ts` → `_buildSystemPrompt({ includeAppHelpMap })`), isolated to
// the app-help surface so the assertion is about routing, not teaching.
//
// Tier 1 (`pnpm eval:llm`): deterministic — asserts the V2 block routes each
//   question to the right tab and never names a V0 destination. No LLM call.
// Tier 2 (`pnpm eval:llm --live`): asserts the LLM, given the V2 block, answers
//   with the V2 destination and avoids the V0 paths.
//
// RULED 2026-06-14: the deterministic Tier-1 map is the exhaustive guarantee
// (fuzzed over ~890 adversarial inputs in app-help-map.adversarial.test.ts).
// These 8 live scenarios are a DELIBERATE spot-check that the model obeys the
// block — NOT an exhaustive live sweep. Scaling live coverage costs real API
// spend per run, so the fleet stays small on purpose; add scenarios only when a
// specific live regression needs pinning, not to chase corpus size.

interface AppHelpV2Input {
  question: string;
  /** Tokens the V2 answer MUST contain (case-insensitive substring). */
  mustInclude: string[];
  /** V0/V1 destination paths the V2 answer must NEVER contain. */
  mustExclude: string[];
}

// Distinctive V0/V1 path strings that must never survive into a V2 answer.
const V0_PATHS = ['My Notes', 'More >', 'Library >', 'Open Progress', 'Home >'];

const FIXTURES: Array<Scenario<AppHelpV2Input>> = [
  {
    scenarioId: 'notes-to-journal',
    input: {
      question: 'Where do I find my notes?',
      mustInclude: ['Journal'],
      mustExclude: ['My Notes', 'More >', 'Library >'],
    },
  },
  {
    scenarioId: 'past-sessions-to-journal',
    input: {
      question: 'Where are my past conversations?',
      mustInclude: ['Journal'],
      mustExclude: ['My Notes'],
    },
  },
  {
    scenarioId: 'bookmarks-to-journal',
    input: {
      question: 'Where do I find my saved explanations?',
      mustInclude: ['Journal'],
      mustExclude: ['My Notes'],
    },
  },
  {
    scenarioId: 'subjects-structure',
    input: {
      question: 'How is the library organised?',
      mustInclude: ['Subjects'],
      mustExclude: ['Library >'],
    },
  },
  {
    scenarioId: 'subscription-to-account',
    input: {
      question: 'How do I upgrade my subscription?',
      mustInclude: ['Subscription'],
      mustExclude: ['More >'],
    },
  },
  {
    scenarioId: 'add-child-to-account',
    input: {
      question: 'How do I add a child?',
      mustInclude: ['Account'],
      mustExclude: ['More >', 'Open Progress'],
    },
  },
  {
    scenarioId: 'memory-to-journal',
    input: {
      question: 'Where can I see what you remember about me?',
      mustInclude: ['Mentor memory'],
      mustExclude: [],
    },
  },
  {
    scenarioId: 'getting-started-to-mentor',
    input: {
      question: 'How do I use this app?',
      mustInclude: ['Mentor'],
      mustExclude: ['Home >'],
    },
  },
];

function routingIssues(input: AppHelpV2Input, reply: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const haystack = reply.toLowerCase();
  for (const token of input.mustInclude) {
    if (!haystack.includes(token.toLowerCase())) {
      issues.push({
        severity: 'error',
        code: 'v2_destination_missing',
        message: `Expected the answer to route to "${token}" — got: ${reply}`,
      });
    }
  }
  for (const token of [...input.mustExclude, ...V0_PATHS]) {
    if (reply.includes(token)) {
      issues.push({
        severity: 'error',
        code: 'v0_destination_leaked',
        message: `Answer named the retired V0 destination "${token}": ${reply}`,
      });
    }
  }
  return issues;
}

export const appHelpV2Flow: FlowDefinition<AppHelpV2Input> = {
  id: 'app-help-v2',
  name: 'App help — V2 shell routing',
  sourceFile: 'apps/api/src/services/app-help-map.ts:buildAppHelpPromptBlock',

  buildPromptInput(_profile: EvalProfile): AppHelpV2Input | null {
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<AppHelpV2Input>> | null {
    // One profile drives the fixtures — app-help routing is persona-independent,
    // so fanning across every profile would only multiply identical snapshots.
    if (profile.id !== '11yo-czech-animals') return null;
    return FIXTURES;
  },

  buildPrompt(input: AppHelpV2Input): PromptMessages {
    return {
      system: buildAppHelpPromptBlock('v2'),
      user: input.question,
      notes: [
        `Must route to: ${input.mustInclude.join(', ') || '(none)'}`,
        `Must NOT name: ${[...input.mustExclude, ...V0_PATHS].join(', ')}`,
        `Deterministic V2 reply: ${buildAppHelpDirectReply(input.question, 'v2')}`,
      ],
    };
  },

  // Tier 1 — no LLM. Proves the V2 map itself routes correctly: the same
  // assertion the live gate makes, run against the deterministic reply so a map
  // regression fails `pnpm eval:llm` without needing keys.
  evaluateDeterministic(
    context: DeterministicCheckContext<AppHelpV2Input>,
  ): QualityIssue[] {
    return routingIssues(
      context.input,
      buildAppHelpDirectReply(context.input.question, 'v2'),
    );
  },

  async runLive(
    input: AppHelpV2Input,
    messages: PromptMessages,
  ): Promise<string> {
    bootstrapLlmProviders();
    const result = await routeAndCall(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      1,
      { flow: 'app-help-v2', llmTier: 'flash' },
    );
    return result.response;
  },

  // Tier 2 — the LLM, given the V2 block, must answer with the V2 destination
  // and never name a retired V0 path.
  evaluateQuality(
    context: QualityCheckContext<AppHelpV2Input>,
  ): QualityIssue[] {
    return routingIssues(context.input, context.liveResponse);
  },
};
