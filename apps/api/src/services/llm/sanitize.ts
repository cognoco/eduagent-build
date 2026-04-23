// ---------------------------------------------------------------------------
// LLM prompt sanitization helpers
//
// Centralised defense against prompt-injection via interpolated free-text
// values. User-controlled or LLM-generated strings (names, titles, pronouns,
// raw user input, transcripts, stored curriculum content) must pass through
// one of these helpers before being embedded in an LLM prompt.
//
// There are two sanitization patterns in use across the codebase — pick the
// one that matches the call site:
//
// 1. sanitizeXmlValue(value, maxLen) — DESTRUCTIVE strip + length cap.
//    Use for short attribute-like fields (names, titles, pronouns, single-
//    word themes) where information loss is acceptable. Strips
//    newlines/tabs/quotes/angle-brackets and collapses whitespace. Caller
//    wraps the result in a named tag such as <subject_name>{value}</subject_name>.
//
// 2. escapeXml(value) — LOSSLESS HTML-entity encoding.
//    Use for long free-text content (transcripts, homework text, learner
//    intent, interview summaries) where content meaning must be preserved.
//    A value of `</transcript>evil` becomes `&lt;/transcript&gt;evil` — the
//    model still reads it as text, but the tag-close cannot be misinterpreted
//    as a real end tag.
//
// In BOTH cases the caller SHOULD additionally wrap the value in a named
// XML tag and include a system-prompt notice telling the model that content
// inside the tag is data, not instructions. See services/session-recap.ts
// and services/filing.ts for reference implementations.
//
// Introduced by [PROMPT-INJECT-2] as a follow-up sweep to aa67c249. Replaces
// the duplicated local helpers that previously lived in interview.ts
// (sanitizeXmlValue) and session-recap.ts (sanitizePromptValue).
// ---------------------------------------------------------------------------

/**
 * Strip characters that could escape a wrapping XML tag or be read as a
 * directive on a new line, and cap the result at `maxLen` characters.
 *
 * Strips: newlines, carriage returns, tabs, double-quotes, angle brackets.
 * Collapses runs of whitespace to a single space. Trims leading/trailing
 * whitespace.
 *
 * Returns an empty string when the input is only whitespace — callers
 * should guard against the empty case before interpolation.
 */
export function sanitizeXmlValue(text: string, maxLen: number): string {
  return text
    .trim()
    .replace(/[\n\r\t"<>]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLen);
}

/**
 * HTML-entity encode the five XML significant characters so a value can be
 * safely interpolated inside a wrapping XML tag without any possibility of
 * escaping the tag or smuggling attributes. Preserves all other content
 * (including newlines) so long-form text remains meaningful to the model.
 *
 * Use for long free-text values. For short attribute-like values prefer
 * `sanitizeXmlValue` so the output is compact and unambiguous.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
