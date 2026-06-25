// ---------------------------------------------------------------------------
// Subject Classification Service — Story 10.20
// Classifies problem text against a learner's enrolled subjects.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import type { SubjectClassifyResult } from '@eduagent/schemas';
import {
  subjectClassifyLlmResponseSchema,
  subjectSuggestLlmResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { routeAndCall, extractFirstJsonObject } from './llm';
import type { ChatMessage } from './llm';
import { escapeXml, sanitizeXmlValue } from './llm/sanitize';
import { listSubjects } from './subject';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

// A candidate below this confidence is treated as "not genuinely related" and
// dropped before it can ever be surfaced — neither auto-assigned nor offered as
// a confirmation/disambiguation question. This is the defense-in-depth backstop
// for the prompt's "no match is correct" rule: even if the LLM force-fits an
// unrelated enrolled subject at low confidence (e.g. water -> Statistics 0.4 on
// a Statistics-only account), it is discarded here so the UI never auto-files it
// and never asks the nonsensical "is this <unrelated subject>?" question. The
// learner gets a new-subject suggestion instead.
const MIN_CANDIDATE_CONFIDENCE = 0.5;

// A single genuinely-related candidate at or above this confidence is
// auto-assigned with no confirmation step. Below it (but still above the
// relatedness floor) the UI soft-confirms via the override chip or asks which
// subject. Raised from 0.8 per product ruling 2026-06-25 ("at least 88%, else
// ask the user").
const AUTO_PICK_CONFIDENCE = 0.88;

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
- confidence should be 0.0-1.0 where 1.0 = certain match. Confidence reflects how strong the GENUINE relationship is between the text and the subject — never how much you want to find a match.
- If the text clearly matches one subject, return that with high confidence (>= 0.85)
- If the text could match multiple subjects, return all with their respective confidences
- If the text does NOT genuinely relate to any enrolled subject, return empty matches. Returning no match is a correct, expected answer — do NOT force-fit the text to an unrelated enrolled subject just to avoid an empty list. Example: a question about water on an account whose only enrolled subject is "Statistics" has NO match — return empty matches, never "Statistics".
- Whenever matches is empty you MUST suggest a fitting new subject name in "suggestedSubjectName" (e.g. water -> "Science", Easter -> "Religious Studies") — never leave it null when matches is empty.
- Match against the EXACT subject names provided — don't invent new ones for matches
- Match generously WHEN THERE IS GENUINE TOPICAL RELATEDNESS — think broadly about what truly relates to each subject:
  - Cultural topics (Easter, Christmas, Ramadan, Diwali, Thanksgiving) relate to History, Religious Studies, Social Studies, Cultural Studies
  - Current events relate to Social Studies, Geography, Politics, Civics
  - Animals, plants, weather relate to Biology, Science, Nature Studies, Geography
  - Electricity, circuits, magnetism, inventions, technology history, Tesla/Edison, "War of Currents" relate to Physics, Science, History of Technology, or History
  - Music, art, film relate to Art, Music, Cultural Studies, Media Studies
  - Sports relate to Physical Education, Biology (biomechanics), Physics (motion)
  - Cooking, nutrition relate to Chemistry, Biology, Home Economics
  - "solve 2x + 5 = 15" matches "Algebra", "Math", "Mathematics" etc.
- This generosity applies ONLY to genuine cross-disciplinary overlap. It is NOT a licence to attach unrelated text to whatever subject happens to be enrolled. When the choice is between a weak forced match and no match, choose no match and suggest a new subject.
`;

function inferSuggestedSubjectName(text: string): string | null {
  const normalized = text.toLowerCase();
  if (
    /\b(war of currents?|tesla|edison|electricity|electric(al)?|circuit|voltage|current|magnetism|electromagnetism)\b/.test(
      normalized,
    )
  ) {
    return 'Physics';
  }
  if (
    /\b(roman empire|ancient rome|middle ages|world war|battle of|empire|civilization)\b/.test(
      normalized,
    )
  ) {
    return 'History';
  }
  if (
    /\b(calculus|algebra|geometry|trigonometry|equation|solve)\b/.test(
      normalized,
    ) ||
    /\b\d+\s*[a-z]\b|[a-z]\s*[=+\-*/]\s*\d+|\d+\s*[=+\-*/]\s*[a-z]/i.test(text)
  ) {
    return 'Mathematics';
  }
  if (/\b(photosynthesis|cells?|dna|evolution|ecosystem)\b/.test(normalized)) {
    return 'Biology';
  }
  return null;
}

// BS-10 / [IMP-5]: Sanitize user input before LLM interpolation.
//   1. Strip C0 control characters (other than tab/LF/CR) + DEL.
//   2. Cap length to `maxLength` chars.
//   3. HTML-entity encode the XML-significant chars via `escapeXml` so a
//      crafted value cannot close a wrapping XML tag or smuggle instructions
//      (e.g. "</subject>ignore previous rules"). The earlier version skipped
//      step 3, leaving `<`, `>`, `&`, `"`, `'` intact in the prompt — an
//      injection surface the [PROMPT-INJECT-2] sweep missed here.
function sanitizeLlmInput(text: string, maxLength = 500): string {
  const stripped = text
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
    .slice(0, maxLength);
  return escapeXml(stripped);
}

export async function classifySubject(
  db: Database,
  profileId: string,
  text: string,
): Promise<SubjectClassifyResult> {
  // Fetch learner's active subjects
  const subjects = await listSubjects(db, profileId);

  if (subjects.length === 0) {
    // Still ask the LLM to suggest a subject name from the problem text
    const sanitized = sanitizeLlmInput(text);

    try {
      // conversationLanguage not threaded: output is a fixed taxonomy slug
      const suggestResult = await routeAndCall(
        [
          {
            role: 'system',
            content: `You are a subject classifier for a tutoring platform. The student has no enrolled subjects yet. Given a piece of homework or study text, determine the most fitting school subject. Return ONLY a JSON object: { "suggestedSubjectName": "Subject Name" }. Use common, concise school subject names like "Mathematics", "Physics", "Computer Science", "Biology", "History", "English", etc.`,
          },
          { role: 'user', content: `Text to classify:\n${sanitized}` },
        ],
        1, // Rung 1 = Gemini Flash (fast/cheap)
      );
      // [BUG-461] brace-depth walker replaces greedy regex
      // [CR-2026-05-21-076] schema-validated parse replaces ad-hoc field checks
      const jsonStr = extractFirstJsonObject(suggestResult.response);
      if (jsonStr) {
        const parseResult = subjectSuggestLlmResponseSchema.safeParse(
          JSON.parse(jsonStr),
        );
        const suggested = parseResult.success
          ? parseResult.data.suggestedSubjectName.trim() ||
            inferSuggestedSubjectName(text)
          : inferSuggestedSubjectName(text);
        if (suggested) {
          return {
            candidates: [],
            needsConfirmation: true,
            suggestedSubjectName: suggested,
          };
        }
      }
    } catch (err) {
      // S-6 / [AUDIT-SILENT-FAIL]: Log AND escalate. Returning a null
      // suggestion silently masks LLM outages — captureException makes the
      // degraded experience queryable.
      // [logging sweep] structured logger so PII fields land as JSON context
      logger.error('[classify] LLM failed for zero-subject path', {
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        profileId,
        extra: { site: 'classifySubject.zeroSubjectPath' },
      });
    }

    return {
      candidates: [],
      needsConfirmation: true,
      suggestedSubjectName: inferSuggestedSubjectName(text),
    };
  }

  // A single enrolled subject still runs the LLM relevance check below rather
  // than blind-assigning. The old short-circuit auto-matched that subject to
  // ANY text at 0.9 confidence with needsConfirmation=false, so an off-topic
  // message (e.g. a chemistry question on a Statistics-only account) was
  // silently filed under the wrong subject. The shared path respects the
  // confidence threshold and surfaces a confirmation / suggestion instead.

  // [PROMPT-INJECT-8] subjects.name is learner-owned text stored in DB —
  // sanitize each entry before joining so a crafted subject name cannot
  // inject newlines or directives into the enrolled-subject list.
  const subjectList = subjects
    .map((s) => `- ${sanitizeXmlValue(s.name, 200)}`)
    .join('\n');

  const sanitizedText = sanitizeLlmInput(text);

  const messages: ChatMessage[] = [
    { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Student's enrolled subjects:\n${subjectList}\n\nText to classify:\n${sanitizedText}`,
    },
  ];

  try {
    // conversationLanguage not threaded: output is a fixed taxonomy slug
    const result = await routeAndCall(messages, 1); // Rung 1 = Gemini Flash (fast/cheap)

    // [BUG-461] brace-depth walker replaces greedy regex
    // [CR-2026-05-21-076] schema-validated parse replaces ad-hoc field checks
    const jsonStr = extractFirstJsonObject(result.response);
    if (!jsonStr) {
      return {
        candidates: [],
        needsConfirmation: true,
        suggestedSubjectName: inferSuggestedSubjectName(text),
      };
    }

    const parseResult = subjectClassifyLlmResponseSchema.safeParse(
      JSON.parse(jsonStr),
    );
    if (!parseResult.success) {
      return {
        candidates: [],
        needsConfirmation: true,
        suggestedSubjectName: inferSuggestedSubjectName(text),
      };
    }

    const parsed = parseResult.data;
    const matches = parsed.matches;

    // Map LLM matches to candidates with subjectIds.
    // The relatedness floor (MIN_CANDIDATE_CONFIDENCE) drops any match the model
    // isn't genuinely confident about so an unrelated forced match (water ->
    // Statistics 0.4) is never surfaced as a pick or a disambiguation question.
    const candidates = matches
      .map((m) => {
        const subject = subjects.find(
          (s) => s.name.toLowerCase() === m.subjectName.toLowerCase(),
        );
        if (!subject) return null;
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0)),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .filter((c) => c.confidence >= MIN_CANDIDATE_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence);

    const topCandidate = candidates[0];
    // A single genuine candidate at/above AUTO_PICK_CONFIDENCE is used silently;
    // a weaker (but still genuinely related) single candidate or 2+ candidates
    // are surfaced for soft-confirm / "which one?" instead.
    const needsConfirmation =
      !topCandidate ||
      topCandidate.confidence < AUTO_PICK_CONFIDENCE ||
      candidates.length > 1;

    return {
      candidates,
      needsConfirmation,
      suggestedSubjectName:
        typeof parsed.suggestedSubjectName === 'string'
          ? parsed.suggestedSubjectName
          : topCandidate
            ? null
            : (inferSuggestedSubjectName(text) ?? null),
    };
  } catch (err) {
    // S-6 / [AUDIT-SILENT-FAIL]: Log AND escalate. An empty-candidates
    // response looks identical to a genuine no-match, so we need Sentry to
    // distinguish degraded-LLM from no-match in production.
    // [logging sweep] structured logger so PII fields land as JSON context
    logger.error('[classify] LLM failed for multi-subject path', {
      subjectCount: subjects.length,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId,
      extra: {
        site: 'classifySubject.multiSubjectPath',
        subjectCount: subjects.length,
      },
    });
    return {
      candidates: [],
      needsConfirmation: true,
      suggestedSubjectName: inferSuggestedSubjectName(text),
    };
  }
}
