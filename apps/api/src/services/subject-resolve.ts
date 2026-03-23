import type { SubjectResolveResult } from '@eduagent/schemas';
import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Subject Name Resolution — classify user input before subject creation
// ---------------------------------------------------------------------------

const RESOLVE_SYSTEM_PROMPT = `You are a subject name classifier for an educational tutoring app used by children and teens.
Given user input that should represent a school or learning subject, classify it and return a JSON response.

Categories:
1. "direct_match" — The input is already a clear, well-formed subject name (e.g., "Physics", "World History", "Python Programming"). Return the input with proper capitalisation. suggestions array has exactly 1 entry.
2. "corrected" — The input contains a typo or misspelling of a known subject (e.g., "Phsics" → "Physics"). Return the corrected name. suggestions array has exactly 1 entry.
3. "ambiguous" — The input is a broad topic or single word that could map to MULTIPLE different subjects depending on what the student is interested in (e.g., "ants", "space", "water", "music"). Return 2-4 suggestions with different learning angles. resolvedName is null — the student must pick.
4. "resolved" — The input is natural language clearly describing ONE subject (e.g., "I want to learn calculus", "how computers work" → "Computer Science"). suggestions array has exactly 1 entry.
5. "no_match" — The input is nonsense, gibberish, offensive, or unmappable (e.g., "jjjjj", "asdfgh"). suggestions is empty.

Return ONLY a JSON object:
{
  "status": "direct_match" | "corrected" | "ambiguous" | "resolved" | "no_match",
  "resolvedName": "Subject Name" | null,
  "suggestions": [
    { "name": "Subject Name", "description": "What you'll learn" }
  ],
  "displayMessage": "A friendly message for the student"
}

Examples:

Input: "Physics"
{ "status": "direct_match", "resolvedName": "Physics", "suggestions": [{"name": "Physics", "description": "Forces, motion, energy and the laws of the universe"}], "displayMessage": "" }

Input: "Phsics"
{ "status": "corrected", "resolvedName": "Physics", "suggestions": [{"name": "Physics", "description": "Forces, motion, energy and the laws of the universe"}], "displayMessage": "Did you mean **Physics**?" }

Input: "ants"
{ "status": "ambiguous", "resolvedName": null, "suggestions": [{"name": "Biology — Entomology", "description": "Ant bodies, life cycle, species and behaviour"}, {"name": "Ecology", "description": "How ants interact with their environment and ecosystems"}, {"name": "Zoology", "description": "Ant colonies, social structure and communication"}], "displayMessage": "**Ants** can be studied from different angles — which interests you?" }

Input: "I want to learn how computers work"
{ "status": "resolved", "resolvedName": "Computer Science", "suggestions": [{"name": "Computer Science", "description": "How computers process, store and transmit information"}], "displayMessage": "This sounds like **Computer Science** — shall we go with that?" }

Input: "jjjjj"
{ "status": "no_match", "resolvedName": null, "suggestions": [], "displayMessage": "I couldn't find a matching subject. Try a subject name like 'Physics' or describe what you'd like to learn." }

Rules:
- Keep descriptions short (under 15 words), child-friendly, exciting
- For ambiguous: always give 2-4 genuinely different angles, not synonyms
- resolvedName is null for ambiguous and no_match
- displayMessage uses **bold** for the key term`;

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
      const suggestions = parseSuggestions(parsed.suggestions);
      return {
        status,
        resolvedName:
          status === 'no_match' || status === 'ambiguous'
            ? null
            : String(parsed.resolvedName ?? rawInput),
        suggestions,
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
    suggestions: [{ name: rawInput, description: '' }],
    displayMessage: '',
  };
}

function parseStatus(value: unknown): SubjectResolveResult['status'] {
  const valid = [
    'direct_match',
    'corrected',
    'resolved',
    'ambiguous',
    'no_match',
  ] as const;
  if (
    typeof value === 'string' &&
    (valid as readonly string[]).includes(value)
  ) {
    return value as SubjectResolveResult['status'];
  }
  return 'direct_match';
}

function parseSuggestions(
  value: unknown
): Array<{ name: string; description: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { name: unknown; description: unknown } =>
        typeof item === 'object' && item !== null && 'name' in item
    )
    .map((item) => ({
      name: String(item.name),
      description: String(item.description ?? ''),
    }));
}
