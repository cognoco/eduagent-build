// ---------------------------------------------------------------------------
// Deterministic minor-PII echo-back reply gate [WI-1348]
//
// The minor-PII rule (exchange-prompts.ts SAFETY block: "NEVER ask for, store,
// or reference … full name, school name, home address, age, birthday, phone,
// email, social media handles … If the learner volunteers PII, do not repeat it
// back") was PROMPT-ONLY — nothing on the server enforced it on the tutor's
// reply. A drifted / weak / jailbroken model can echo a minor's volunteered PII
// straight back into `ai_response.content`, which is persisted — a data-
// protection incident (GDPR-K).
//
// This module is the server-side backstop, mirroring the WI-1154 dangerous-
// procedure gate: a deterministic, synchronous, allocation-light detector run on
// the PARSED tutor reply (post-parseEnvelope), at the same two tutor seams
// (exchanges.ts non-streaming, session-exchange.ts streaming). Because it does
// not depend on the model behaving, the floor holds even when the model is weak
// or jailbroken.
//
// SCOPE, deliberately NARROW: this is an ECHO-BACK gate, NOT a general PII
// scanner. It only redacts a PII token that (a) the learner VOLUNTEERED in their
// own recent input AND (b) the reply repeats back. This narrow scope protects
// the product's must_answer commitment: a school named in a history lesson, a
// street named in a geography answer, or a date in a maths problem is never
// touched unless the LEARNER first typed that exact token. We extract concrete
// PII VALUES from the learner's text, then strip those specific values from the
// reply — we never blanket-redact by pattern alone.
//
// FAIL-SAFE direction: the caller scopes enforcement to minors and fails CLOSED
// on unknown age (treats unprovable-adult as minor). Within the detector,
// redaction is privacy-positive: on the rare collision where a volunteered name
// coincides with a common word ("May", "Art"), stripping that word from a reply
// is a strictly safer error than leaking a minor's name. Every branch is
// exercised by a co-located test in minor-pii-echo-gate.test.ts, including the
// negative-path break test that reproduces a real minor-PII echo-back.
// ---------------------------------------------------------------------------

/** Marker recorded in the persisted model field when the gate fires. */
export const MINOR_PII_ECHO_GATE_MODEL = 'deterministic:minor_pii_echo';

/** Neutral placeholder that replaces an echoed PII token in the reply. */
const REDACTION_PLACEHOLDER = '[removed]';

// --- Self-identifying PII patterns (extractable from raw text by shape) ------

// Email addresses. Conservative local/domain classes; requires a dotted TLD.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Social handles: a leading @ followed by a handle body. Excludes emails (an
// email's @ is preceded by a word char, so a handle match never starts one).
const HANDLE_RE = /(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_]{2,30}/g;

// Phone numbers: an optional +, then 7+ digits allowing spaces / dots / dashes /
// parens between them. The 7-digit floor keeps short numerals (ages, small
// quantities, years) from matching.
const PHONE_RE = /\+?\d(?:[\s().-]?\d){6,}/g;

// --- Introduction-scoped PII (name / school / address) -----------------------
//
// These require a self-identification cue in the LEARNER's own text; we capture
// the concrete value from that cue, then strip that value from the reply.

// "my name is Ada", "i'm Ada", "i am Ada", "call me Ada", "name's Ada".
// Captures 1–2 capitalised-or-lowercase name tokens after the cue.
const NAME_CUE_RE =
  /\b(?:my name(?:'s| is)?|i\s?am|i'?m|call me|name'?s|they call me)\s+([A-Za-z][A-Za-z'-]{1,20}(?:\s+[A-Z][A-Za-z'-]{1,20})?)/gi;

// A proper school / institution name: 1–4 leading capitalised tokens followed by
// an institution keyword ("Oakwood School", "St Mary's Academy", "Riverside
// High"). Requires the keyword so it never grabs arbitrary capitalised prose.
const SCHOOL_RE =
  /\b((?:[A-Z][A-Za-z'&.-]+\s+){0,3}[A-Z][A-Za-z'&.-]+\s+(?:School|Academy|High|College|Elementary|Primary|Grammar|Institute|Gymnasium|Kindergarten))\b/g;

// A street address: a house number then 1–4 capitalised tokens then a street
// keyword ("12 Oakwood Street", "3 St Mary's Road").
const ADDRESS_RE =
  /\b(\d{1,5}\s+(?:[A-Z][A-Za-z'&.-]+\s+){0,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Close|Crescent|Terrace|Place|Pl))\b/g;

// Common words that a name-cue can accidentally capture ("I am tired", "I'm
// done"). These are never treated as a volunteered name.
const NAME_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'not',
  'so',
  'too',
  'very',
  'really',
  'just',
  'ok',
  'okay',
  'fine',
  'good',
  'bad',
  'tired',
  'done',
  'ready',
  'sure',
  'here',
  'back',
  'confused',
  'stuck',
  'sorry',
  'trying',
  'learning',
  'studying',
  'working',
  'going',
  'doing',
  'in',
  'on',
  'at',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMatches(text: string, re: RegExp, group = 0): string[] {
  const out: string[] = [];
  // Each pattern is defined with the global flag; reset lastIndex defensively.
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = (group === 0 ? m[0] : m[group])?.trim();
    if (value) out.push(value);
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
  }
  return out;
}

/**
 * Extract the concrete PII VALUES the learner volunteered in their own text.
 * Returns a de-duplicated list of literal token strings (a name, a school, an
 * email, …) to look for in the tutor reply. NOT a general PII scan of arbitrary
 * text — the caller must pass the LEARNER's input, never the model's.
 */
export function extractVolunteeredPii(learnerText: string): string[] {
  if (!learnerText) return [];
  const values: string[] = [];

  for (const email of collectMatches(learnerText, EMAIL_RE)) values.push(email);
  for (const handle of collectMatches(learnerText, HANDLE_RE))
    values.push(handle);
  for (const phone of collectMatches(learnerText, PHONE_RE)) {
    // Require >= 7 actual digits so "1 2 3" style math prose does not match.
    if ((phone.match(/\d/g) ?? []).length >= 7) values.push(phone.trim());
  }
  for (const school of collectMatches(learnerText, SCHOOL_RE, 1))
    values.push(school);
  for (const address of collectMatches(learnerText, ADDRESS_RE, 1))
    values.push(address);
  for (const rawName of collectMatches(learnerText, NAME_CUE_RE, 1)) {
    // Split the (up to two) captured tokens. The cue is matched
    // case-insensitively, so the OPTIONAL second token must be validated in
    // code: keep it only when it is genuinely capitalised in the learner's
    // original text (a real surname), never a lowercase connector like "and"
    // or an adjective like "happy". The first token may be lowercase (kids type
    // their own name in lowercase), guarded only by the stopword + length list.
    const tokens = rawName.split(/\s+/);
    const [first, second] = tokens;
    if (
      first &&
      first.length >= 2 &&
      !NAME_STOPWORDS.has(first.toLowerCase())
    ) {
      values.push(first);
    }
    if (
      second &&
      /^[A-Z]/.test(second) &&
      second.length >= 2 &&
      !NAME_STOPWORDS.has(second.toLowerCase())
    ) {
      values.push(second);
    }
  }

  // De-duplicate case-insensitively, keep the first-seen literal form.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

/**
 * Deterministic: does the tutor reply echo back any PII the learner
 * volunteered? Returns the list of volunteered PII values the reply repeats
 * (empty when none). Whole-token, case-insensitive matching so "Ada" matches
 * "ada" but not "Adalene".
 */
export function detectVolunteeredPiiEcho(
  reply: string,
  learnerText: string,
): string[] {
  if (!reply) return [];
  const volunteered = extractVolunteeredPii(learnerText);
  if (volunteered.length === 0) return [];
  const echoed: string[] = [];
  for (const value of volunteered) {
    const re = new RegExp(
      `(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`,
      'i',
    );
    if (re.test(reply)) echoed.push(value);
  }
  return echoed;
}

/**
 * Strip every echoed PII token from the reply, replacing each with a neutral
 * placeholder, then tidy the residual whitespace / dangling punctuation the
 * removal leaves behind. Surgical by design: only the echoed PII values change;
 * the rest of the reply (the legitimate teaching content) is preserved.
 */
export function redactPiiEcho(reply: string, echoed: string[]): string {
  let out = reply;
  for (const value of echoed) {
    const re = new RegExp(
      `(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`,
      'gi',
    );
    out = out.replace(re, REDACTION_PLACEHOLDER);
  }
  return out;
}

/**
 * Apply the gate to a learner-visible tutor reply. Age-scoped by the caller:
 * enforcement runs only for minors (`isMinor: true`). Returns the reply
 * unchanged when the learner is an adult, when the learner volunteered no PII,
 * or when the reply echoes none of it; returns the redacted reply with
 * `redacted: true` and the echoed tokens on a hit.
 */
export function applyMinorPiiEchoGate(
  reply: string,
  learnerText: string,
  opts: { isMinor: boolean },
): { response: string; redacted: boolean; echoedTerms: string[] } {
  if (!opts.isMinor)
    return { response: reply, redacted: false, echoedTerms: [] };
  const echoed = detectVolunteeredPiiEcho(reply, learnerText);
  if (echoed.length === 0) {
    return { response: reply, redacted: false, echoedTerms: [] };
  }
  return {
    response: redactPiiEcho(reply, echoed),
    redacted: true,
    echoedTerms: echoed,
  };
}
