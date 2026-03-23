import type { SubjectResolveResult } from '@eduagent/schemas';
import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Subject Name Resolution — classify user input before subject creation
// ---------------------------------------------------------------------------

const RESOLVE_SYSTEM_PROMPT = `You are a subject name classifier for an educational tutoring app used by children and teens.
Given user input that should represent a school or learning subject, classify it and return a JSON response.

Categories:
1. "direct_match" — The input is already a clear, well-formed subject name (e.g., "Physics", "World History", "Python Programming"). Return the input with proper capitalisation.
2. "corrected" — The input contains a typo or misspelling of a known subject (e.g., "Phsics" → "Physics", "Mathmatics" → "Mathematics"). Return the corrected name.
3. "resolved" — The input is natural language describing what the user wants to learn, not a subject name (e.g., "I want to learn about ants" → "Biology — Entomology", "how computers work" → "Computer Science"). Return a clear, concise subject name.
4. "no_match" — The input is nonsense, gibberish, offensive, or cannot be mapped to any educational subject (e.g., "jjjjj", "asdfgh").

Return ONLY a JSON object:
{
  "status": "direct_match" | "corrected" | "resolved" | "no_match",
  "resolvedName": "The Subject Name" | null,
  "displayMessage": "A friendly message for the student"
}

displayMessage rules:
- direct_match: ""
- corrected: "Did you mean **{resolvedName}**?"
- resolved: "This sounds like **{resolvedName}** — shall we go with that?"
- no_match: "I couldn't find a matching subject. Try entering a subject name like 'Physics' or 'History', or describe what you'd like to learn."

resolvedName rules:
- direct_match: the input with proper capitalisation
- corrected/resolved: the suggested subject name
- no_match: null`;

export async function resolveSubjectName(
  rawInput: string
): Promise<SubjectResolveResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: RESOLVE_SYSTEM_PROMPT },
    { role: 'user', content: rawInput },
  ];

  const result = await routeAndCall(messages, 1);

  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const status = parseStatus(parsed.status);
      return {
        status,
        resolvedName:
          status === 'no_match'
            ? null
            : String(parsed.resolvedName ?? rawInput),
        displayMessage: String(parsed.displayMessage ?? ''),
      };
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: if LLM response is unparseable, treat as direct match
  return {
    status: 'direct_match',
    resolvedName: rawInput,
    displayMessage: '',
  };
}

function parseStatus(value: unknown): SubjectResolveResult['status'] {
  const valid = ['direct_match', 'corrected', 'resolved', 'no_match'] as const;
  if (
    typeof value === 'string' &&
    (valid as readonly string[]).includes(value)
  ) {
    return value as SubjectResolveResult['status'];
  }
  return 'direct_match';
}
