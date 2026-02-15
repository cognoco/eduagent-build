import { routeAndCall, type ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Curriculum generation service — pure business logic, no Hono imports
// ---------------------------------------------------------------------------

const CURRICULUM_SYSTEM_PROMPT = `You are EduAgent's curriculum designer. Based on the assessment interview,
generate a personalized learning curriculum. Return a JSON array of topics with this structure:
[{"title": "Topic Name", "description": "What the learner will learn", "relevance": "core|recommended|contemporary|emerging", "estimatedMinutes": 30}]
Order topics pedagogically. Include 8-15 topics.`;

export interface CurriculumInput {
  subjectName: string;
  interviewSummary: string;
  goals: string[];
  experienceLevel: string;
}

export interface GeneratedTopic {
  title: string;
  description: string;
  relevance: 'core' | 'recommended' | 'contemporary' | 'emerging';
  estimatedMinutes: number;
}

export async function generateCurriculum(
  input: CurriculumInput
): Promise<GeneratedTopic[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: CURRICULUM_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Subject: ${input.subjectName}
Goals: ${input.goals.join(', ')}
Experience Level: ${input.experienceLevel}
Interview Summary: ${input.interviewSummary}`,
    },
  ];

  const result = await routeAndCall(messages, 2);

  // Parse the JSON response
  const jsonMatch = result.response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse curriculum from LLM response');
  }

  return JSON.parse(jsonMatch[0]) as GeneratedTopic[];
}
