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

/**
 * [BUG-865] Strip TTS pronunciation hints that occasionally leak from the
 * LLM into chat-visible text. The model sometimes splits long terms into
 * hyphenated syllables — "de-nom-i-nay-tor", "num-er-ay-tor", "Least Common
 * De-nom-i-nay-tor" — to coach pronunciation for the audio path. In text
 * mode these render verbatim and look unprofessional.
 *
 * Heuristic: a "phonetic" token has FOUR or more short (1-3 char) segments
 * separated by hyphens, with all but the first segment lowercase. This
 * matches phonetic spellings while leaving normal compound words alone:
 *   - "de-nom-i-nay-tor" → "denominaytor" (5 segments × 1-3 chars) ✓
 *   - "self-help-two-step" → unchanged (first segment is 4 chars) ✗
 *   - "well-rounded-three-piece" → unchanged (segments too long) ✗
 *
 * The fix is in services/llm/sanitize so it can be reused anywhere LLM
 * free text reaches the chat surface.
 */
export function stripPhoneticHints(text: string): string {
  return text.replace(/\b[A-Za-z][a-z]{0,2}(?:-[a-z]{1,3}){3,}\b/g, (match) =>
    match.replace(/-/g, '')
  );
}

/**
 * [BUG-773 / S-17] Single-pass `{token}` substitution against a fixed
 * vocabulary of allowed keys. Eliminates the curly-brace injection that
 * chained `.replace('{a}', valA).replace('{b}', valB)` is vulnerable to:
 * if `valA` contains the literal string `{b}`, the second .replace would
 * re-substitute it. Because `String.replace` does not recursively re-scan
 * replacement output, a single regex pass with a closed-set lookup table
 * is safe even when values contain other tokens.
 *
 * The replacer function only resolves keys present in `values`; an unknown
 * `{xyz}` left in the template is preserved verbatim — never replaced
 * with `undefined`. This makes accidental template typos visible to the
 * model rather than silently blanking the field.
 */
export function renderPromptTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (match, key: string) => {
      // Narrow via local lookup — `Record<string, string>` indexer still
      // returns `string | undefined` under noUncheckedIndexedAccess, and
      // `hasOwnProperty` does not narrow the indexer type.
      const value = values[key];
      return typeof value === 'string' ? value : match;
    }
  );
}
