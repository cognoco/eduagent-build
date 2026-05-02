import { INTERVIEW_SYSTEM_PROMPT } from '../../src/services/interview-prompts';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Interview (diagnostic assessment)
//
// The interview prompt runs when a learner starts a new subject/book. It
// conducts a 3-4 exchange diagnostic to assess level, goals, and gaps.
//
// Production builds the system prompt as:
//   INTERVIEW_SYSTEM_PROMPT + "\n\nSubject: <subject_name>..." + optional focusLine
// Then the user messages are exchange history + current user message.
//
// We exercise two branches per profile:
//   - Subject-only (no book title focus)
//   - Subject + book title focus line (when the learner enters via a book)
// ---------------------------------------------------------------------------

interface InterviewInput {
  subjectName: string;
  /** When set, produces the focus-line variant. */
  bookTitle: string | null;
  /** The learner's first message to the tutor. */
  userMessage: string;
}

/** Crude subject inference — mirrors session-analysis.ts. */
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
  if (/philosoph|existentialis|camus/.test(lower)) return 'Philosophy';
  if (
    /biolog|body|cycle|animal|dinosaur|fossil|paleontolog|mesozoic|plate/.test(
      lower
    )
  )
    return 'Science';
  if (/read|comprehension|essay|subjunctive|writing|story|reading/.test(lower))
    return 'Language Arts';
  return 'Freeform';
}

function buildSystemPrompt(input: InterviewInput): string {
  const focusLine = input.bookTitle
    ? `\nFocus area: <book_title>${input.bookTitle}</book_title>\nScope your questions to this specific focus area within the subject, not the entire subject.`
    : '';
  return `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: <subject_name>${input.subjectName}</subject_name>${focusLine}`;
}

export const interviewFlow: FlowDefinition<InterviewInput> = {
  id: 'interview',
  name: 'Interview (diagnostic assessment)',
  sourceFile:
    'apps/api/src/services/interview-prompts.ts:INTERVIEW_SYSTEM_PROMPT',

  // Two scenarios per profile: subject-only and subject+book focus.
  enumerateScenarios(profile: EvalProfile) {
    const topic = profile.libraryTopics[0];
    if (!topic) return null;

    const subjectName = inferSubjectFromTopic(topic);
    const primaryInterest = profile.interests[0]?.label ?? 'learning';
    const userMessage = `Hi! I want to get better at ${topic}. I'm really into ${primaryInterest}.`;

    return [
      {
        scenarioId: 'subject-only',
        input: {
          subjectName,
          bookTitle: null,
          userMessage,
        },
      },
      {
        scenarioId: 'subject-book-focus',
        input: {
          subjectName,
          bookTitle: topic,
          userMessage,
        },
      },
    ];
  },

  // Fallback for single-scenario mode (--flow interview --profile X).
  buildPromptInput(profile: EvalProfile): InterviewInput | null {
    const topic = profile.libraryTopics[0];
    if (!topic) return null;
    const primaryInterest = profile.interests[0]?.label ?? 'learning';
    return {
      subjectName: inferSubjectFromTopic(topic),
      bookTitle: null,
      userMessage: `Hi! I want to get better at ${topic}. I'm really into ${primaryInterest}.`,
    };
  },

  buildPrompt(input: InterviewInput): PromptMessages {
    return {
      system: buildSystemPrompt(input),
      user: input.userMessage,
      notes: [
        `Subject: ${input.subjectName}`,
        input.bookTitle
          ? `Book focus: "${input.bookTitle}" — exercises the focus-line variant`
          : 'No book focus — subject-level interview',
        "Simulates the learner's FIRST message (no exchange history).",
      ],
    };
  },

  emitsEnvelope: true,

  async runLive(
    _input: InterviewInput,
    messages: PromptMessages
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'interview', rung: 2 }
    );
  },
};
