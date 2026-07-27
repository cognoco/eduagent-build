import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import type { SessionType } from '@eduagent/schemas';

import { validateEvidenceOverlap } from '../../src/services/evidence-overlap';
import type { EvalProfile } from '../fixtures/profiles';
import { parseFirstJsonObject } from '../runner/quality';
import type {
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import { exchangesFlow, type ExchangeScenarioInput } from './exchanges';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440020';
const HOMEWORK_PROBLEM = 'Solve x - 3 = 5.';

interface HomeworkNoticeScenarioInput extends ExchangeScenarioInput {
  expectedNotice: boolean;
  learnerMessage: string;
}

interface EnvelopeLike {
  reply?: unknown;
  signals?: {
    noticed_gap?: {
      observed?: unknown;
      answerEventId?: unknown;
      learnerQuote?: unknown;
    };
  };
}

function issue(code: string, message: string): QualityIssue {
  return { severity: 'error', code, message };
}

function buildScenario(
  profile: EvalProfile,
  scenarioId: string,
  learnerMessage: string,
  expectedNotice: boolean,
  sessionType: SessionType,
): Scenario<HomeworkNoticeScenarioInput> | null {
  const homework = exchangesFlow
    .enumerateScenarios?.(profile)
    ?.find((scenario) => scenario.scenarioId === 'S6-homework-help');
  if (!homework) return null;

  return {
    scenarioId,
    input: {
      ...homework.input,
      scenarioId,
      scenarioPurpose: expectedNotice
        ? 'A genuine learner slip should produce one grounded noticed_gap without promising a future check-in'
        : 'Clean learner reasoning should not produce noticed_gap',
      expectedNotice,
      learnerMessage,
      context: {
        ...homework.input.context,
        subjectName: 'Mathematics',
        topicTitle: 'Solving linear equations',
        topicDescription: undefined,
        sessionType,
        rawInput: sessionType === 'homework' ? HOMEWORK_PROBLEM : undefined,
        homeworkMode:
          sessionType === 'homework'
            ? homework.input.context.homeworkMode
            : undefined,
        exchangeCount: 2,
        mentorNoticeEnabled: true,
        currentUserMessageEventId: EVENT_ID,
        exchangeHistory: [
          {
            role: 'assistant',
            content:
              'Try isolating x. What happens to minus three when you move it across the equals sign?',
          },
          { role: 'user', content: learnerMessage },
        ],
      },
    },
  };
}

function evaluateResponse(
  input: HomeworkNoticeScenarioInput,
  liveResponse: string,
): QualityIssue[] {
  const envelope = parseFirstJsonObject<EnvelopeLike>(liveResponse);
  if (!envelope) {
    return [
      issue('homework-notice.parse', 'Response was not a JSON envelope.'),
    ];
  }

  const noticedGap =
    envelope.signals?.noticed_gap?.observed === false
      ? undefined
      : envelope.signals?.noticed_gap;
  const issues: QualityIssue[] = [];

  if (input.expectedNotice && !noticedGap) {
    issues.push(
      issue(
        'homework-notice.missing-gap',
        'The genuine slip did not produce signals.noticed_gap.',
      ),
    );
  }
  if (!input.expectedNotice && noticedGap) {
    issues.push(
      issue(
        'homework-notice.false-positive',
        'The clean learner answer produced signals.noticed_gap.',
      ),
    );
  }
  if (noticedGap) {
    if (noticedGap.answerEventId !== EVENT_ID) {
      issues.push(
        issue(
          'homework-notice.event-id',
          'noticed_gap did not preserve the supplied learner event ID.',
        ),
      );
    }
    if (
      typeof noticedGap.learnerQuote !== 'string' ||
      !validateEvidenceOverlap(
        noticedGap.learnerQuote,
        input.learnerMessage,
        0.4,
      ).ok
    ) {
      issues.push(
        issue(
          'homework-notice.provenance',
          'noticed_gap learnerQuote was not grounded in the current learner message.',
        ),
      );
    }
  }

  if (
    typeof envelope.reply === 'string' &&
    /(?:check(?:ing)? (?:back|in)|ask you (?:again|later)|come back to this|next time)/i.test(
      envelope.reply,
    )
  ) {
    issues.push(
      issue(
        'homework-notice.future-promise',
        'Visible assistant prose promised a later check-in.',
      ),
    );
  }

  return issues;
}

export const homeworkNoticeFlow: FlowDefinition<HomeworkNoticeScenarioInput> = {
  id: 'homework-notice',
  name: 'Mentor notice across sessions',
  sourceFile: 'apps/api/src/services/exchange-prompts.ts',
  emitsEnvelope: true,
  expectedResponseSchema: llmResponseEnvelopeSchema,

  buildPromptInput(): HomeworkNoticeScenarioInput | null {
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<HomeworkNoticeScenarioInput>> {
    return [
      buildScenario(
        profile,
        'genuine-homework-slip',
        'I moved minus three to the other side and kept it negative, so x equals two.',
        true,
        'homework',
      ),
      buildScenario(
        profile,
        'genuine-learning-slip',
        'I moved minus three to the other side and kept it negative, so x equals two.',
        true,
        'learning',
      ),
      buildScenario(
        profile,
        'clean-learning',
        'I added three to both sides, so x equals eight.',
        false,
        'learning',
      ),
    ].filter(
      (scenario): scenario is Scenario<HomeworkNoticeScenarioInput> =>
        scenario !== null,
    );
  },

  buildPrompt(input: HomeworkNoticeScenarioInput): PromptMessages {
    return exchangesFlow.buildPrompt(input);
  },

  runLive(input, messages): Promise<string> {
    if (!exchangesFlow.runLive) {
      throw new Error('Exchanges live runner is unavailable.');
    }
    return exchangesFlow.runLive(input, messages);
  },

  evaluateDeterministic({ messages }): QualityIssue[] {
    const issues: QualityIssue[] = [];
    if (!messages.system.includes('Do not promise a future check-in')) {
      issues.push(
        issue(
          'homework-notice.prompt-promise-guard',
          'Prompt omitted the visible future-promise prohibition.',
        ),
      );
    }
    if (!messages.system.includes(EVENT_ID)) {
      issues.push(
        issue(
          'homework-notice.prompt-event-id',
          'Prompt omitted the authoritative current learner event ID.',
        ),
      );
    }
    return issues;
  },

  evaluateQuality({ input, liveResponse }): QualityIssue[] {
    return evaluateResponse(input, liveResponse);
  },
};
