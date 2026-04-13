import type { SubjectResolveResult } from '@eduagent/schemas';
import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';
import { detectLanguageHint } from '../data/languages';

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

Focus extraction:
When the input combines a broad subject with a specific area, extract both separately:
- "resolvedName" is the broad subject (the shelf)
- "focus" is the specific area within it (the book)
- "focusDescription" is an optional longer description of the focus area

NEVER combine subject and focus into a single name with dashes or colons. Always separate them into "resolvedName" and "focus" fields.

Return ONLY a JSON object:
{
  "status": "direct_match" | "corrected" | "ambiguous" | "resolved" | "no_match",
  "resolvedName": "Subject Name" | null,
  "focus": "Specific Area" | null,
  "focusDescription": "Longer description of the focus" | null,
  "suggestions": [
    { "name": "Subject Name", "description": "What you'll learn", "focus": "Specific Area or omit" }
  ],
  "displayMessage": "A friendly message for the student"
}

Examples:

Input: "Physics"
{ "status": "direct_match", "resolvedName": "Physics", "focus": null, "focusDescription": null, "suggestions": [{"name": "Physics", "description": "Forces, motion, energy and the laws of the universe"}], "displayMessage": "" }

Input: "Phsics"
{ "status": "corrected", "resolvedName": "Physics", "focus": null, "focusDescription": null, "suggestions": [{"name": "Physics", "description": "Forces, motion, energy and the laws of the universe"}], "displayMessage": "Did you mean **Physics**?" }

Input: "Geography of Egypt"
{ "status": "resolved", "resolvedName": "Geography", "focus": "Egypt", "focusDescription": null, "suggestions": [{"name": "Geography", "description": "Maps, climates and landscapes of Egypt", "focus": "Egypt"}], "displayMessage": "This sounds like **Geography** focused on **Egypt** — shall we go with that?" }

Input: "Egyptian rivers"
{ "status": "resolved", "resolvedName": "Geography", "focus": "Egypt", "focusDescription": "Rivers, deserts and landscapes of Egypt", "suggestions": [{"name": "Geography", "description": "Rivers, deserts and landscapes of Egypt", "focus": "Egypt"}], "displayMessage": "This sounds like **Geography** focused on **Egypt** — shall we go with that?" }

Input: "ants"
{ "status": "ambiguous", "resolvedName": null, "focus": null, "focusDescription": null, "suggestions": [{"name": "Biology", "focus": "Entomology", "description": "Ant bodies, life cycle, species and behaviour"}, {"name": "Ecology", "focus": "Ant Ecosystems", "description": "How ants interact with their environment and ecosystems"}, {"name": "Zoology", "focus": "Social Insects", "description": "Ant colonies, social structure and communication"}], "displayMessage": "**Ants** can be studied from different angles — which interests you?" }

Input: "I want to learn how computers work"
{ "status": "resolved", "resolvedName": "Computer Science", "focus": null, "focusDescription": null, "suggestions": [{"name": "Computer Science", "description": "How computers process, store and transmit information"}], "displayMessage": "This sounds like **Computer Science** — shall we go with that?" }

Input: "jjjjj"
{ "status": "no_match", "resolvedName": null, "focus": null, "focusDescription": null, "suggestions": [], "displayMessage": "I couldn't find a matching subject. Try a subject name like 'Physics' or describe what you'd like to learn." }

Rules:
- Keep descriptions short (under 15 words), child-friendly, exciting
- For ambiguous: always give 2-4 genuinely different angles, not synonyms
- EVERY ambiguous suggestion MUST include a "focus" field — this is the specific topic within the broad subject that matches the user's original input. Without it the app cannot create the right book.
- resolvedName is null for ambiguous and no_match
- displayMessage uses **bold** for the key term
- NEVER combine subject and focus into a single name with dashes or colons`;

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
      const detectedLanguage = detectLanguageHint(
        String(parsed.resolvedName ?? rawInput)
      );
      return {
        status,
        resolvedName:
          status === 'no_match' || status === 'ambiguous'
            ? null
            : String(parsed.resolvedName ?? rawInput),
        focus:
          typeof parsed.focus === 'string' && parsed.focus.length > 0
            ? parsed.focus
            : null,
        focusDescription:
          typeof parsed.focusDescription === 'string'
            ? parsed.focusDescription
            : null,
        suggestions,
        displayMessage: String(parsed.displayMessage ?? ''),
        isLanguageLearning: detectedLanguage != null,
        detectedLanguageCode: detectedLanguage?.code ?? null,
        detectedLanguageName: detectedLanguage?.names[0] ?? null,
      };
    }
  } catch {
    // Fall through to fallback
  }

  // BUG-31: Fallback to no_match instead of direct_match — the user should
  // see the "couldn't match" UI with explicit options rather than silently
  // creating a freeform subject from raw input.
  return {
    status: 'no_match',
    resolvedName: null,
    suggestions: [],
    displayMessage:
      "I couldn't understand that as a subject. Try a name like 'Physics' or describe what you'd like to learn.",
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
  // BUG-31: Unrecognized status → no_match, not direct_match. This prevents
  // silently creating a subject when the LLM returns an unexpected value.
  return 'no_match';
}

function parseSuggestions(
  value: unknown
): Array<{ name: string; description: string; focus?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (
        item
      ): item is { name: unknown; description: unknown; focus?: unknown } =>
        typeof item === 'object' && item !== null && 'name' in item
    )
    .map((item) => ({
      name: String(item.name),
      description: String(item.description ?? ''),
      ...(typeof item.focus === 'string' && item.focus.length > 0
        ? { focus: item.focus }
        : {}),
    }));
}
