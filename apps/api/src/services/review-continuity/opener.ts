import { escapeXml, sanitizeXmlValue } from '../llm/sanitize';
import {
  MAX_VERBATIM_CHARS,
  type ReviewContinuityContext,
} from './opener-context';

// ---------------------------------------------------------------------------
// Review-continuity opener — pure prompt builder
//
// Produces the REVIEW opener section of the system prompt. Replaces ONLY the
// cold "calibration question" lines of today's generic review block with a
// continuity-framed opener that references the learner's actual prior work,
// while preserving that block's transition-phrase, anchor, REVIEW SOURCE
// DISCIPLINE, "don't remember", and "got-the-important-part" lines verbatim.
//
// Pure + deterministic + no I/O. Encodes EU-1/EU-2/EU-4 + the no-struggle
// product-tone rule. All learner-owned free text is sanitised before
// interpolation (matches the [PROMPT-INJECT-4] egress discipline in
// buildSystemPrompt). Spec: docs/specs/2026-06-08-memory-task-review-continuity.md.
// ---------------------------------------------------------------------------

// --- Shared review-block lines (verbatim copies of the current generic block
//     in exchange-prompts.ts) — exported so the gate's flag-off path and this
//     builder's degrade path emit a byte-identical generic block. ------------

const SESSION_TYPE_LINE = 'Session type: REVIEW (calibrated relearning)\n';
const TRANSITION_PHRASE_LINE =
  'TRANSITION PHRASE: Begin with a brief one-line handoff that tells the learner this is a review check, not a fresh lesson.\n';
function calibrationQuestionLine(safeTopicTitle: string): string {
  return `CALIBRATION QUESTION: The UI may already have presented an opening question about <topic_title>${safeTopicTitle}</topic_title>. If the learner's latest message answers that question, do NOT ask it again — respond to what they remembered and use any gaps to guide the next teaching step.\n`;
}
const ANCHOR_LINE =
  "Use the learner's partial answer as the anchor. Explicitly say what they got and what is still missing. Do not pivot into a different subtopic just because it is nearby; stay inside the learner's answer and the current topic description.\n";
const SOURCE_DISCIPLINE_LINE =
  'REVIEW SOURCE DISCIPLINE: In review mode, prefer source wording for hints. Use analogies, nearby examples, or extra biology/history facts only when they appear in provided source material or pass the 0.88 general-knowledge confidence gate.\n';
const DONT_REMEMBER_LINE =
  'If the learner says they do not remember, have no idea, or are not sure, do NOT keep asking them to recall. Start a compact review of the core idea and ask one smaller supported check.\n';
const ASK_OPEN_QUESTION_LINE =
  'If the learner has not answered a calibration question yet, ask exactly one open question inviting them to say what they remember in their own words. Do NOT introduce new content before that answer.\n';
const GOT_IMPORTANT_PART_LINE =
  'When the learner asks whether they got the important part, answer directly: "Yes, you got X; the missing piece is Y." Then give one small source-wording cloze check. For the cells/energy review case, ask "Cells use inputs to make ____" or "Cells are the smallest ____ unit"; never ask what a cell can do on its own.';

/**
 * The current generic review opener section, byte-for-byte. Used by the gate
 * when the flag is off / no context is present AND by this builder's
 * honest-degradation path, so all three are guaranteed identical.
 */
export function buildGenericReviewOpenerSection(
  safeTopicTitle: string,
): string {
  return (
    SESSION_TYPE_LINE +
    TRANSITION_PHRASE_LINE +
    calibrationQuestionLine(safeTopicTitle) +
    ANCHOR_LINE +
    SOURCE_DISCIPLINE_LINE +
    DONT_REMEMBER_LINE +
    ASK_OPEN_QUESTION_LINE +
    GOT_IMPORTANT_PART_LINE
  );
}

// --- Continuity-opener pieces ----------------------------------------------

/** Forward-looking tone clause, free of struggle/failure vocabulary (R-tone). */
const TONE_CLAUSE =
  ' Keep it forward-looking and encouraging — name what the learner has and the next step, not past difficulty.';

/** Long gap at/above which any "recent" timing claim is forbidden (R-EU4a). */
const STALE_DAYS = 90;
/** Gap strictly below which a light "last time" reference is acceptable
 *  (R-EU4a). Strict `<` so the boundary agrees with the faithfulness judge,
 *  which treats `daysSince >= 14` as too old for a "last week" claim. */
const RECENT_DAYS = 14;

// Strip only newline / control characters (NOT angle brackets or quotes) so the
// learner's exact words survive for lossless entity-encoding below. Mirrors the
// control class in llm/sanitize.ts without the destructive "<>" / quote strip,
// and ADDS the Unicode line/paragraph separators (U+2028/U+2029) — escapeXml
// does not encode those, and some models render them as line breaks, so a
// verbatim mid-prompt could otherwise gain an instruction-boundary newline.
const _VT = String.fromCharCode(0x0b); // U+000B vertical tab
const _FF = String.fromCharCode(0x0c); // U+000C form feed
const _NEL = String.fromCharCode(0x85); // U+0085 next line
const _LS = String.fromCharCode(0x2028); // U+2028 line separator
const _PS = String.fromCharCode(0x2029); // U+2029 paragraph separator
const VERBATIM_CONTROL_RE = new RegExp(
  '[\\n\\r\\t' + _VT + _FF + _NEL + _LS + _PS + ']',
  'g',
);

/** Upper length bound for treating a verbatim as a non-answer: longer strings
 *  are substantive even if they contain a hedge like "I forgot the rest". */
const SELF_DEPRECATING_ANSWER_MAX_CHARS = 40;

/** A self-deprecating non-answer must never be recited back (R-blank). */
function isSelfDeprecatingNonAnswer(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return true;
  const markers = [
    "i don't know",
    'i dont know',
    'i forgot',
    'i forget',
    'not sure',
    'no idea',
    "can't remember",
    'cant remember',
    'idk',
    'dunno',
  ];
  return (
    t.length < SELF_DEPRECATING_ANSWER_MAX_CHARS &&
    markers.some((m) => t.includes(m))
  );
}

function temporalClause(daysSince: number): string {
  if (daysSince < RECENT_DAYS) {
    return " This was recent, so a light 'last time' reference is fine.";
  }
  if (daysSince >= STALE_DAYS) {
    return ' It has been a while since then — do not imply it was recent; treat the learner as relatively fresh on it.';
  }
  return ` Do not claim a specific recency; if you mention timing at all, say it was roughly ${daysSince} days ago or omit timing.`;
}

/**
 * Prepare the learner's exact words for inline quoting: strip newline/control
 * characters (injection-via-newline defense), surrogate-safe truncate to the
 * display cap, THEN entity-encode losslessly. Order matters — escaping last
 * means the cap counts real characters (not entity-expanded ones) and the
 * ellipsis is not itself escaped. Unlike sanitizeXmlValue this NEVER drops the
 * learner's `<`, `>`, `"` — those become `&lt;`/`&gt;`/`&quot;`, preserving the
 * exact words the model is told to quote back (EU-1) while still being unable
 * to escape the wrapping <learner_prior_words> tag.
 */
function prepareVerbatimForQuote(verbatim: string): {
  shown: string;
  truncated: boolean;
} {
  const stripped = verbatim
    .replace(VERBATIM_CONTROL_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Spread to code points so a multi-byte char (emoji, rare CJK) is never split
  // across a surrogate pair by the length cap.
  const codePoints = [...stripped];
  const truncated = codePoints.length > MAX_VERBATIM_CHARS;
  const capped = truncated
    ? codePoints.slice(0, MAX_VERBATIM_CHARS).join('') + '…'
    : stripped;
  return { shown: escapeXml(capped), truncated };
}

function verbatimQuoteLine(
  safeTopicTitle: string,
  verbatim: string,
  daysSince: number,
): string {
  const { shown, truncated } = prepareVerbatimForQuote(verbatim);
  const lengthNote = truncated
    ? ' Their answer was long, so only the opening is shown — reference it, do not recite the rest.'
    : '';
  return (
    `CONTINUITY OPENER: Open by warmly connecting to what the learner did before, then invite them forward. Their exact prior words on <topic_title>${safeTopicTitle}</topic_title> were: <learner_prior_words>${shown}</learner_prior_words>. You may quote these exact words back as something the learner said; do NOT invent, paraphrase, or attribute any other quote to them.` +
    temporalClause(daysSince) +
    lengthNote +
    TONE_CLAUSE +
    '\n'
  );
}

function weakPriorFreshLine(safeTopicTitle: string): string {
  return (
    `CONTINUITY OPENER: Last time on <topic_title>${safeTopicTitle}</topic_title> the idea had not landed yet, so do NOT re-state or quote the learner's earlier attempt as if it were correct. Open with a fresh, low-stakes start on <topic_title>${safeTopicTitle}</topic_title> — a gentle re-introduction and one small, supported check.` +
    TONE_CLAUSE +
    '\n'
  );
}

function competentSlipLine(
  safeTopicTitle: string,
  priorSolidCount: number,
): string {
  return (
    `CONTINUITY OPENER: The learner has been solid on <topic_title>${safeTopicTitle}</topic_title> across ${priorSolidCount} earlier checks; last time there was a single slip to tidy, not a pattern. Do NOT frame the learner as muddled or restart from scratch — acknowledge their competence and offer one quick, specific check on the part that slipped.` +
    TONE_CLAUSE +
    '\n'
  );
}

/** Sanitised, non-empty recap bullets. Empty result ⇒ no usable recap (a
 *  whitespace-only or all-stripped array must not pass the material guard). */
function usableRecapBullets(recapBullets: string[]): string[] {
  // Trim AFTER sanitising: sanitizeXmlValue strips `<>`/quotes to spaces and
  // only trims leading whitespace, so a bullet like "<>" survives as " " (a
  // single space) — which would otherwise pass a bare `length > 0` filter and
  // emit an empty <prior_recap> while claiming a recap "is available".
  return recapBullets
    .map((b) => sanitizeXmlValue(b, 200).trim())
    .filter((b) => b.length > 0);
}

function recapGestureLine(
  safeTopicTitle: string,
  recapBullets: string[],
): string {
  const bullets = usableRecapBullets(recapBullets).join('; ');
  return (
    `CONTINUITY OPENER: A short recap of the learner's earlier work on <topic_title>${safeTopicTitle}</topic_title> is available: <prior_recap>${bullets}</prior_recap>. This recap is a generated summary, NOT the learner's own words — you may GESTURE at it ("last time we looked at …") but do NOT quote it or put any quoted words in the learner's mouth.` +
    TONE_CLAUSE +
    '\n'
  );
}

/** Build the continuity calibration section that replaces the CALIBRATION
 *  QUESTION lines emitted by buildGenericReviewOpenerSection. Caller guarantees
 *  consentGranted is true and at least one of priorRetrieval / recapBullets is
 *  present. */
function buildContinuityCalibration(
  context: ReviewContinuityContext,
  safeTopicTitle: string,
): string {
  const prior = context.priorRetrieval;
  if (prior) {
    const quotable =
      (prior.verdict === 'solid' || prior.verdict === 'partial') &&
      !isSelfDeprecatingNonAnswer(prior.learnerAnswerVerbatim);
    if (quotable) {
      return verbatimQuoteLine(
        safeTopicTitle,
        prior.learnerAnswerVerbatim,
        prior.daysSince,
      );
    }
    // Weak / missing prior — never quote it back.
    if (context.priorSolidCount > 0) {
      return competentSlipLine(safeTopicTitle, context.priorSolidCount);
    }
    return weakPriorFreshLine(safeTopicTitle);
  }
  // Recap-only path (no retrieval row).
  return recapGestureLine(safeTopicTitle, context.recapBullets ?? []);
}

/**
 * Whether the context carries any continuity material the builder will actually
 * surface: a retrieval row, OR at least one recap bullet that survives
 * sanitisation (a whitespace/strip-only bullet does NOT count — see
 * usableRecapBullets). Exported as the single source of truth so callers
 * (e.g. the eval harness's degrade check) never re-derive this with a raw
 * `recapBullets.length` test that diverges from the builder.
 */
export function hasContinuityMaterial(
  context: ReviewContinuityContext,
): boolean {
  return (
    context.priorRetrieval !== undefined ||
    usableRecapBullets(context.recapBullets ?? []).length > 0
  );
}

/**
 * Build the REVIEW opener section for a continuity-framed return. Honest
 * degradation (consent declined, or no continuity material) returns the
 * byte-identical generic block.
 */
export function buildReviewContinuityOpener(
  context: ReviewContinuityContext,
): string {
  const safeTopicTitle = sanitizeXmlValue(context.topicTitle, 200);

  // R-EU2 (consent) + R-degrade (no material): generic block, no memory refs.
  if (!context.consentGranted || !hasContinuityMaterial(context)) {
    return buildGenericReviewOpenerSection(safeTopicTitle);
  }

  return (
    SESSION_TYPE_LINE +
    TRANSITION_PHRASE_LINE +
    buildContinuityCalibration(context, safeTopicTitle) +
    ANCHOR_LINE +
    SOURCE_DISCIPLINE_LINE +
    DONT_REMEMBER_LINE +
    GOT_IMPORTANT_PART_LINE
  );
}
