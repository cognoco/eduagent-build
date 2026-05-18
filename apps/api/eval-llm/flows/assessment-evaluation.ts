import { z } from 'zod';
import {
  buildAssessmentEvaluationMessages,
  type AssessmentRecord,
} from '../../src/services/assessments';
import { getTextContent } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import { callLlm } from '../runner/llm-bootstrap';
import type { FlowDefinition, PromptMessages } from '../runner/types';

interface AssessmentEvaluationInput {
  topicTitle: string;
  topicDescription: string;
  currentDepth: AssessmentRecord['verificationDepth'];
  subjectName: string;
  pedagogyMode: 'socratic' | 'four_strands';
  languageCode: string | null;
  answer: string;
}

const assessmentEvalResponseSchema = z.object({
  feedback: z.string(),
  passed: z.boolean(),
  shouldEscalateDepth: z.boolean(),
  rawScore: z.number().min(0).max(1),
  qualityRating: z.number().min(0).max(5),
  weakAreas: z.array(z.string()).optional(),
});

function languageName(code: string | undefined): string {
  if (!code) return 'Languages';
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ??
      'Languages'
    );
  } catch {
    return 'Languages';
  }
}

export const assessmentEvaluationFlow: FlowDefinition<AssessmentEvaluationInput> =
  {
    id: 'assessment-evaluation',
    name: 'Assessment Evaluation',
    sourceFile:
      'apps/api/src/services/assessments.ts:buildAssessmentEvaluationMessages',
    expectedResponseSchema: assessmentEvalResponseSchema,

    buildPromptInput(profile: EvalProfile): AssessmentEvaluationInput {
      const isLanguage = Boolean(profile.targetLanguage && profile.cefrLevel);
      if (isLanguage) {
        const subjectName = languageName(profile.targetLanguage);
        const remembered =
          profile.recentQuizAnswers.vocabulary.slice(0, 2).join(', ') ||
          'hola, buenos dias, gracias';
        return {
          topicTitle: `${subjectName} greetings and introductions`,
          topicDescription:
            'Meet people, say hello, and share simple personal details.',
          currentDepth: 'recall',
          subjectName,
          pedagogyMode: 'four_strands',
          languageCode: profile.targetLanguage ?? null,
          answer: `${remembered}, va bene`,
        };
      }

      const topic = profile.libraryTopics[0] ?? 'Current topic';
      return {
        topicTitle: topic,
        topicDescription: `Core ideas and examples from ${topic}.`,
        currentDepth: 'recall',
        subjectName: 'General learning',
        pedagogyMode: 'socratic',
        languageCode: null,
        answer:
          profile.struggles[0]?.topic ??
          'I remember one idea but not the full explanation.',
      };
    },

    buildPrompt(input: AssessmentEvaluationInput): PromptMessages {
      const messages = buildAssessmentEvaluationMessages(
        {
          topicTitle: input.topicTitle,
          topicDescription: input.topicDescription,
          currentDepth: input.currentDepth,
          exchangeHistory: [],
          subjectName: input.subjectName,
          pedagogyMode: input.pedagogyMode,
          languageCode: input.languageCode,
        },
        input.answer,
      );

      return {
        system: messages[0] ? getTextContent(messages[0].content) : '',
        user: messages[1] ? getTextContent(messages[1].content) : '',
        notes: [
          `Assessment depth: ${input.currentDepth}`,
          `Pedagogy mode: ${input.pedagogyMode}`,
          `Expected: feedback must give one concrete next task when more checking is needed.`,
        ],
      };
    },

    async runLive(
      _input: AssessmentEvaluationInput,
      messages: PromptMessages,
    ): Promise<string> {
      return callLlm(
        [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user ?? '' },
        ],
        { flow: 'assessment-evaluation', rung: 2 },
      );
    },
  };
