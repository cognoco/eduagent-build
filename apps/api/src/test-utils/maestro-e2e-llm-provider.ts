import {
  llmEnvelopeReply,
  registerLlmProviderFixture,
  type LlmFixtureContent,
} from './llm-provider-fixtures';
import { getTextContent, type ChatMessage } from '../services/llm/types';

const DICTATION_SYSTEM_MARKER = 'You are a dictation review assistant.';
const DICTATION_PREPARATION_SYSTEM_MARKER =
  'You are a dictation preparation assistant.';
const SUBJECT_SYSTEM_MARKER =
  'You are a subject name classifier for an educational tutoring app';

function resolveDictationPreparation(
  messages: ChatMessage[],
): LlmFixtureContent | undefined {
  const systemPrompt = messages.find(({ role }) => role === 'system');
  if (
    !systemPrompt ||
    !getTextContent(systemPrompt.content).includes(
      DICTATION_PREPARATION_SYSTEM_MARKER,
    )
  ) {
    return undefined;
  }

  const homeworkText = messages
    .filter(({ role }) => role === 'user')
    .map(({ content }) => getTextContent(content))
    .join('\n')
    .match(/<homework_text>([^<]+)<\/homework_text>/)?.[1];

  const sentenceFixtures = {
    'The sun is warm.': {
      text: 'The sun is warm.',
      withPunctuation: 'The sun is warm period',
      wordCount: 4,
      chunks: ['The sun is warm.'],
      chunksWithPunctuation: ['The sun is warm period'],
    },
    'Birds can sing.': {
      text: 'Birds can sing.',
      withPunctuation: 'Birds can sing period',
      wordCount: 3,
      chunks: ['Birds can sing.'],
      chunksWithPunctuation: ['Birds can sing period'],
    },
  } as const;

  if (homeworkText === 'The sun is warm.') {
    return { sentences: [sentenceFixtures[homeworkText]], language: 'en' };
  }
  if (homeworkText === 'The sun is warm. Birds can sing.') {
    return {
      sentences: [
        sentenceFixtures['The sun is warm.'],
        sentenceFixtures['Birds can sing.'],
      ],
      language: 'en',
    };
  }

  throw new Error(
    'Hosted Maestro received unrecognized dictation preparation text',
  );
}

function resolveDictationReview(
  messages: ChatMessage[],
): LlmFixtureContent | undefined {
  const systemPrompt = messages.find(({ role }) => role === 'system');
  if (
    !systemPrompt ||
    !getTextContent(systemPrompt.content).includes(DICTATION_SYSTEM_MARKER)
  ) {
    return undefined;
  }

  const userPrompt = messages
    .filter(({ role }) => role === 'user')
    .map(({ content }) => getTextContent(content))
    .join('\n');

  if (
    userPrompt.includes('1. The sun is warm.') &&
    userPrompt.includes('2. Birds can sing.')
  ) {
    return { totalSentences: 2, correctCount: 2, mistakes: [] };
  }

  if (
    userPrompt.includes('1. The sun is warm.') &&
    !userPrompt.includes('\n2.')
  ) {
    return {
      totalSentences: 1,
      correctCount: 0,
      mistakes: [
        {
          sentenceIndex: 0,
          original: 'The sun is warm.',
          written: 'The sune is warm.',
          error: 'spelling',
          correction: 'The sun is warm.',
          explanation: 'Write sun without an extra e.',
        },
      ],
    };
  }

  throw new Error(
    'Hosted Maestro received an unrecognized dictation review fixture',
  );
}

function resolveSubjectRequest(
  messages: ChatMessage[],
): LlmFixtureContent | undefined {
  const systemPrompt = messages.find(({ role }) => role === 'system');
  if (
    !systemPrompt ||
    !getTextContent(systemPrompt.content).includes(SUBJECT_SYSTEM_MARKER)
  ) {
    return undefined;
  }

  const userPrompt = messages
    .filter(({ role }) => role === 'user')
    .map(({ content }) => getTextContent(content))
    .join('\n');
  const subject = userPrompt.match(
    /<subject_request>([^<]+)<\/subject_request>/,
  )?.[1];

  if (subject === 'Phsics') {
    return {
      status: 'corrected',
      resolvedName: 'Physics',
      focus: null,
      focusDescription: null,
      suggestions: [
        {
          name: 'Physics',
          description: 'Forces, motion, energy and the laws of the universe',
        },
      ],
      displayMessage: 'Did you mean **Physics**?',
    };
  }

  if (subject) {
    return {
      status: 'direct_match',
      resolvedName: subject,
      focus: null,
      focusDescription: null,
      suggestions: [
        {
          name: subject,
          description: `A deterministic learning path for ${subject}`,
        },
      ],
      displayMessage: '',
    };
  }

  throw new Error('Hosted Maestro received a subject fixture without input');
}

function resolveMaestroChat(
  messages: ChatMessage[],
): LlmFixtureContent | undefined {
  return (
    resolveDictationPreparation(messages) ??
    resolveDictationReview(messages) ??
    resolveSubjectRequest(messages)
  );
}

/** Register the deterministic external-boundary LLM used by hosted Maestro. */
export function registerMaestroE2eLlmProvider(): void {
  registerLlmProviderFixture({
    // With no live keys, the legacy rung-1 router selects OpenAI. Registering
    // the fixture under that existing provider id exercises the real router
    // and subject-response parser without making an external request.
    id: 'openai',
    chatResponseResolver: (messages) => resolveMaestroChat(messages),
    streamResponse: llmEnvelopeReply(
      "Let's work through this together. What have you noticed so far?",
    ),
    // The named E2E case creates this subject immediately after resolution.
    // Keep all subsequent generation attempts valid and deterministic so the
    // case never depends on the production parser's failure fallback.
    chatResponse: {
      type: 'narrow',
      topics: [
        {
          title: 'How Plants Capture Light',
          description: 'How leaves collect light energy for making food',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Chloroplasts and Chlorophyll',
          description: 'The cell structures and pigments that absorb light',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Water and Carbon Dioxide',
          description: 'Where the raw materials for photosynthesis come from',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Making Glucose',
          description: 'How plants store captured energy as sugar',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Releasing Oxygen',
          description: 'Why oxygen leaves the plant during photosynthesis',
          relevance: 'recommended',
          estimatedMinutes: 15,
        },
        {
          title: 'Leaf Structure',
          description: 'How leaf parts support gas exchange and light capture',
          relevance: 'recommended',
          estimatedMinutes: 20,
        },
        {
          title: 'Factors That Change the Rate',
          description: 'How light water and temperature affect the process',
          relevance: 'recommended',
          estimatedMinutes: 25,
        },
        {
          title: 'Photosynthesis in Ecosystems',
          description: 'How plant energy supports food webs and living things',
          relevance: 'contemporary',
          estimatedMinutes: 20,
        },
      ],
    },
  });
}
