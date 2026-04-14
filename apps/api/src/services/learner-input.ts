import {
  sessionAnalysisOutputSchema,
  type MemorySource,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { routeAndCall, type ChatMessage } from './llm';
import { applyAnalysis } from './learner-profile';

const TELL_MENTOR_PROMPT = `You are turning a direct learner or parent note into learner-memory signals.

Return valid JSON only using this shape:
{
  "explanationEffectiveness": null,
  "interests": ["string"] | null,
  "strengths": [{"topic": "string", "subject": "string | null", "source": "learner" | "parent"}] | null,
  "struggles": [{"topic": "string", "subject": "string | null", "source": "learner" | "parent"}] | null,
  "resolvedTopics": [{"topic": "string", "subject": "string | null"}] | null,
  "communicationNotes": ["string"] | null,
  "engagementLevel": null,
  "confidence": "high"
}

Rules:
- Directly stated preferences and struggles are high-confidence.
- Put interests in "interests" when the note expresses liking, curiosity, or enthusiasm.
- Put learning preferences in "communicationNotes".
- Put topic difficulties in "struggles".
- Put mastered topics in "resolvedTopics" or "strengths" when clearly stated.
- Keep items short and normalized.`;

export interface ParseLearnerInputResult {
  success: boolean;
  message: string;
  fieldsUpdated: string[];
}

function fallbackAnalysis(
  text: string,
  source: MemorySource
): Parameters<typeof applyAnalysis>[2] {
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();
  const interests: string[] = [];
  const struggles: Array<{
    topic: string;
    subject: null;
    source: MemorySource;
  }> = [];
  const notes: string[] = [];

  const interestMatch = trimmed.match(
    /\b(?:i like|i love|i enjoy|i'm into|i am into)\s+(.+)/i
  );
  if (interestMatch?.[1]) {
    interests.push(interestMatch[1].trim().replace(/[.!?]+$/, ''));
  }

  const struggleMatch = trimmed.match(
    /\b(?:i struggle with|i find|i get stuck on)\s+(.+)/i
  );
  if (struggleMatch?.[1]) {
    struggles.push({
      topic: struggleMatch[1].trim().replace(/[.!?]+$/, ''),
      subject: null,
      source,
    });
  }

  if (interests.length === 0 && struggles.length === 0) {
    if (
      lowered.includes('prefer') ||
      lowered.includes('helps me') ||
      lowered.includes('best when')
    ) {
      notes.push(trimmed);
    } else {
      notes.push(trimmed);
    }
  }

  return {
    explanationEffectiveness: null,
    interests: interests.length > 0 ? interests : null,
    strengths: null,
    struggles: struggles.length > 0 ? struggles : null,
    resolvedTopics: null,
    communicationNotes: notes.length > 0 ? notes : null,
    engagementLevel: null,
    confidence: 'high',
  };
}

async function parseLearnerInputToAnalysis(
  text: string,
  source: MemorySource
): Promise<Parameters<typeof applyAnalysis>[2]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: TELL_MENTOR_PROMPT },
    { role: 'user', content: `Source: ${source}\nInput: ${text.trim()}` },
  ];

  try {
    const result = await routeAndCall(messages, 1, {});
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackAnalysis(text, source);
    }
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    const validated = sessionAnalysisOutputSchema.safeParse(parsed);
    if (!validated.success) {
      return fallbackAnalysis(text, source);
    }
    return {
      ...validated.data,
      confidence: 'high',
      strengths:
        validated.data.strengths?.map((entry) => ({
          ...entry,
          source,
        })) ?? null,
      struggles:
        validated.data.struggles?.map((entry) => ({
          ...entry,
          source,
        })) ?? null,
    };
  } catch (err) {
    // Log before falling back so LLM/network failures are observable.
    // The outer parseLearnerInput does not see this path because the fallback
    // resolves successfully — without logging here, failures are invisible.
    console.warn('[learner-input] LLM parse failed, using fallback', {
      event: 'learner_input.llm.failed',
      source,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackAnalysis(text, source);
  }
}

export async function parseLearnerInput(
  db: Database,
  profileId: string,
  text: string,
  source: MemorySource
): Promise<ParseLearnerInputResult> {
  try {
    const analysis = await parseLearnerInputToAnalysis(text, source);
    const result = await applyAnalysis(db, profileId, analysis, null, source);
    return {
      success: true,
      message: 'Got it!',
      fieldsUpdated: result.fieldsUpdated,
    };
  } catch (err) {
    console.error('[learner-input] parseLearnerInput failed', {
      event: 'learner_input.parse.failed',
      profileId,
      source,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      message: 'Something went wrong. Please try again.',
      fieldsUpdated: [],
    };
  }
}
