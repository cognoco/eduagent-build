import { INTERVIEW_SYSTEM_PROMPT } from '../../src/services/interview-prompts';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

interface OrphanInterviewInput {
  subjectName: string;
  orphanUserMessage: string;
  followUpMessage: string;
}

function inferSubjectFromTopic(topic: string): string {
  const lower = topic.toLowerCase();
  if (/spanish|french|italian|german|english|czech/.test(lower))
    return 'Languages';
  if (
    /algebra|fraction|multiplication|division|polynomial|arithmetic/.test(lower)
  )
    return 'Mathematics';
  if (/physic|newton|force|motion/.test(lower)) return 'Physics';
  if (/history|civil war|reconstruction|enlightenment/.test(lower))
    return 'History';
  if (
    /biolog|body|cycle|animal|dinosaur|fossil|paleontolog|mesozoic|plate/.test(
      lower
    )
  )
    return 'Science';
  return 'Freeform';
}

export const interviewOrphanFlow: FlowDefinition<OrphanInterviewInput> = {
  id: 'interview-orphan',
  name: 'Interview — orphan turn acknowledgement',
  sourceFile:
    'apps/api/src/services/interview-prompts.ts:INTERVIEW_SYSTEM_PROMPT + orphan addendum',

  buildPromptInput(profile: EvalProfile): OrphanInterviewInput | null {
    const topic = profile.libraryTopics[0];
    if (!topic) return null;
    const primaryInterest = profile.interests[0]?.label ?? 'learning';
    return {
      subjectName: inferSubjectFromTopic(topic),
      orphanUserMessage: `Hi! I want to get better at ${topic}. I'm really into ${primaryInterest}.`,
      followUpMessage: 'Hello? Did you get my last message?',
    };
  },

  buildPrompt(input: OrphanInterviewInput): PromptMessages {
    const orphanAddendum =
      '\n\n<server_note kind="orphan_user_turn" reason="llm_stream_error"/>';
    return {
      system:
        `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: <subject_name>${input.subjectName}</subject_name>` +
        orphanAddendum,
      user: input.followUpMessage,
      notes: [
        `Subject: ${input.subjectName}`,
        `Orphan turn: "${input.orphanUserMessage}" — LLM stream errored, user never got a reply.`,
        'Expected: the response should briefly acknowledge that an earlier reply did not go through.',
        'This fixture is EXCLUDED from the regression gate — its delta is the success signal.',
      ],
    };
  },

  emitsEnvelope: false,

  async runLive(
    _input: OrphanInterviewInput,
    messages: PromptMessages
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'interview-orphan', rung: 2 }
    );
  },
};
