import { routeAndCall, type ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Interview service — pure business logic, no Hono imports
// ---------------------------------------------------------------------------

const INTERVIEW_SYSTEM_PROMPT = `You are EduAgent, an AI tutor conducting a brief assessment interview.
Ask about the learner's goals, prior experience, and current knowledge level for the given subject.
Keep questions conversational and brief. After 3-5 exchanges when you have enough signal,
respond with the special marker [INTERVIEW_COMPLETE] at the end of your response.`;

export interface InterviewContext {
  subjectName: string;
  exchangeHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface InterviewResult {
  response: string;
  isComplete: boolean;
  extractedSignals?: {
    goals: string[];
    experienceLevel: string;
    currentKnowledge: string;
  };
}

export async function processInterviewExchange(
  context: InterviewContext,
  userMessage: string
): Promise<InterviewResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: ${context.subjectName}`,
    },
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content: e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const result = await routeAndCall(messages, 1);
  const isComplete = result.response.includes('[INTERVIEW_COMPLETE]');
  const cleanResponse = result.response
    .replace('[INTERVIEW_COMPLETE]', '')
    .trim();

  return {
    response: cleanResponse,
    isComplete,
    // TODO: Extract signals from conversation when complete
  };
}
