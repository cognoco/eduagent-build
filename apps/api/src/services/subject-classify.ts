// ---------------------------------------------------------------------------
// Subject Classification Service — Story 10.20
// Classifies problem text against a learner's enrolled subjects.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import type { SubjectClassifyResult } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';
import { listSubjects } from './subject';

const CLASSIFY_SYSTEM_PROMPT = `You are a subject classifier for a tutoring platform.

Given a piece of text (homework problem, question, or conversation) and a list of the student's enrolled subjects, determine which subject(s) the text belongs to.

Return ONLY a JSON object with this structure:
{
  "matches": [
    { "subjectName": "Exact Subject Name from list", "confidence": 0.0-1.0 }
  ],
  "suggestedSubjectName": "Name if no match found, or null"
}

Rules:
- confidence should be 0.0-1.0 where 1.0 = certain match
- If the text clearly matches one subject, return that with high confidence (>= 0.8)
- If the text could match multiple subjects, return all with their respective confidences
- If the text doesn't match any enrolled subject, return empty matches AND ALWAYS suggest a subject name in "suggestedSubjectName" — never leave it null when matches is empty
- Match against the EXACT subject names provided — don't invent new ones for matches
- Be VERY generous with matching — think broadly about what relates to each subject:
  - Cultural topics (Easter, Christmas, Ramadan, Diwali, Thanksgiving) relate to History, Religious Studies, Social Studies, Cultural Studies
  - Current events relate to Social Studies, Geography, Politics, Civics
  - Animals, plants, weather relate to Biology, Science, Nature Studies, Geography
  - Music, art, film relate to Art, Music, Cultural Studies, Media Studies
  - Sports relate to Physical Education, Biology (biomechanics), Physics (motion)
  - Cooking, nutrition relate to Chemistry, Biology, Home Economics
  - "solve 2x + 5 = 15" matches "Algebra", "Math", "Mathematics" etc.
- When the topic is cross-disciplinary, prefer matching to an enrolled subject with even moderate relevance (confidence >= 0.4) over returning no matches
`;

export async function classifySubject(
  db: Database,
  profileId: string,
  text: string
): Promise<SubjectClassifyResult> {
  // Fetch learner's active subjects
  const subjects = await listSubjects(db, profileId);

  if (subjects.length === 0) {
    // Still ask the LLM to suggest a subject name from the problem text
    const sanitized = text
      .split('')
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        if (code <= 0x08) return false;
        if (code === 0x0b || code === 0x0c) return false;
        if (code >= 0x0e && code <= 0x1f) return false;
        if (code === 0x7f) return false;
        return true;
      })
      .join('')
      .slice(0, 500);

    try {
      const suggestResult = await routeAndCall(
        [
          {
            role: 'system',
            content: `You are a subject classifier for a tutoring platform. The student has no enrolled subjects yet. Given a piece of homework or study text, determine the most fitting school subject. Return ONLY a JSON object: { "suggestedSubjectName": "Subject Name" }. Use common, concise school subject names like "Mathematics", "Physics", "Computer Science", "Biology", "History", "English", etc.`,
          },
          { role: 'user', content: `Text to classify:\n${sanitized}` },
        ],
        1 // Rung 1 = Gemini Flash (fast/cheap)
      );
      const jsonMatch = suggestResult.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        if (
          typeof parsed.suggestedSubjectName === 'string' &&
          parsed.suggestedSubjectName.trim()
        ) {
          return {
            candidates: [],
            needsConfirmation: true,
            suggestedSubjectName: parsed.suggestedSubjectName.trim(),
          };
        }
      }
    } catch (err) {
      // S-6: Log so LLM failures are visible in production — previously silent.
      console.error('[classify] LLM failed for zero-subject path:', err);
    }

    return {
      candidates: [],
      needsConfirmation: true,
      suggestedSubjectName: null,
    };
  }

  // If only one subject, auto-match with high confidence
  if (subjects.length === 1) {
    return {
      candidates: [
        {
          subjectId: subjects[0]!.id,
          subjectName: subjects[0]!.name,
          confidence: 0.9,
        },
      ],
      needsConfirmation: false,
      suggestedSubjectName: null,
    };
  }

  const subjectList = subjects.map((s) => `- ${s.name}`).join('\n');

  // BS-10: sanitize user input before LLM interpolation — strip control
  // characters and limit length to reduce prompt-injection surface area
  const sanitizedText = text
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // Allow tab (9), LF (10), CR (13); strip other C0 controls + DEL
      if (code <= 0x08) return false;
      if (code === 0x0b || code === 0x0c) return false;
      if (code >= 0x0e && code <= 0x1f) return false;
      if (code === 0x7f) return false;
      return true;
    })
    .join('')
    .slice(0, 500);

  const messages: ChatMessage[] = [
    { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Student's enrolled subjects:\n${subjectList}\n\nText to classify:\n${sanitizedText}`,
    },
  ];

  try {
    const result = await routeAndCall(messages, 1); // Rung 1 = Gemini Flash (fast/cheap)

    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        candidates: [],
        needsConfirmation: true,
        suggestedSubjectName: null,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
    const matches: Array<{ subjectName: string; confidence: number }> =
      rawMatches.filter(
        (m: unknown): m is { subjectName: string; confidence: number } =>
          typeof m === 'object' &&
          m !== null &&
          'subjectName' in m &&
          typeof (m as Record<string, unknown>).subjectName === 'string'
      );

    // Map LLM matches to candidates with subjectIds
    const candidates = matches
      .map((m) => {
        const subject = subjects.find(
          (s) => s.name.toLowerCase() === m.subjectName.toLowerCase()
        );
        if (!subject) return null;
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0)),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.confidence - a.confidence);

    const topCandidate = candidates[0];
    const needsConfirmation =
      !topCandidate || topCandidate.confidence < 0.8 || candidates.length > 1;

    return {
      candidates,
      needsConfirmation,
      suggestedSubjectName:
        typeof parsed.suggestedSubjectName === 'string'
          ? parsed.suggestedSubjectName
          : null,
    };
  } catch (err) {
    // S-6: Log so LLM failures are visible in production — previously silent.
    console.error('[classify] LLM failed for multi-subject path:', err);
    return {
      candidates: [],
      needsConfirmation: true,
      suggestedSubjectName: null,
    };
  }
}
