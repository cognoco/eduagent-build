// ---------------------------------------------------------------------------
// Deterministic safety tripwire [2026-06-06]
//
// This is NOT a banned-words list. A bare word gate is worse than nothing for
// a tutor: every word worth banning ("heroin", "suicide", "rape", "Holocaust")
// is also a word a curious learner asks legitimately, so a word gate breaks the
// product's core `must_answer` commitment, dead-ends the learner, and is bypassed
// by one misspelling. See docs discussion + the `legitimate_sensitive` half of
// the safety battery (apps/api/eval-llm/fixtures/safety/battery.ts).
//
// Instead this is a HIGH-PRECISION, intent-shaped tripwire scoped to the 2
// genuinely catastrophic categories where we want a deterministic floor that
// does NOT depend on the model behaving (e.g. when jailbroken):
//
//   1. self_harm_method      — first/second-person method-seeking or active
//                              intent to die / self-harm (NOT third-person
//                              analytical, NOT hyperbole like "this homework is
//                              killing me").
//   2. sexual_content_minor  — requests for sexual content involving a child.
//
// On a hit we do NOT refuse-and-wall. We ESCALATE to the same crisis-redirect
// path the model already uses (empathy + trusted adult + helpline for
// self-harm; safe non-engagement for the sexual-minor case), and the caller
// logs the structured safety event. Because detection runs on the INPUT before
// the LLM is called, the floor holds even if the model is fully jailbroken.
//
// Precision over recall, deliberately: the model + the adversarial battery are
// the primary net. This tripwire is the deterministic backstop for the most
// blatant cases, tuned to (near) zero false positives on real curriculum
// questions. Every pattern below is exercised by a NEGATIVE assertion in
// safety-tripwire.test.ts proving it does not fire on legitimate learning.
// ---------------------------------------------------------------------------

export type CatastrophicCategory = 'self_harm_method' | 'sexual_content_minor';

export interface SafetyTripwireHit {
  category: CatastrophicCategory;
}

// First/second-person self-reference required for the self-harm patterns so
// third-person analytical questions ("why did Romeo kill himself", "how did
// people die in the camps") never trip. `\b(my|me|myself|i)\b` style anchors.
const SELF_HARM_METHOD_PATTERNS: RegExp[] = [
  // Direct method-seeking aimed at the self: "how do/can I kill myself",
  // "best/easiest/painless way to kill myself / end my life / end it all".
  /\b(how (do|can|could|should) i|what'?s the (best|easiest|fastest|quickest|painless) way to|ways? to|easiest way to)\b[^.?!]{0,40}\b(kill (myself|me)|end (my life|it all|myself)|take my (own )?life|off myself|unalive (myself|me))\b/i,
  // Active intent / plan in the first person: "I want/am going to kill myself"
  // (handles the "i'm"/"i am"/"i'll" contractions, which have no trailing space).
  /\bi(?:'?m|'?ll| am| will)?\s+(?:going to|gonna|want to|wanna|plan(?:ning)? to|need to|have to|about to)\s+[^.?!]{0,30}?\b(?:kill myself|end my life|end it all|take my (?:own )?life|off myself|unalive myself)\b/i,
  // Self-directed method specifics: hanging / wrists / overdose framed at self.
  /\b(how (do|can|could) i|how to)\b[^.?!]{0,40}\b(hang myself|slit (my )?wrists?|cut myself (deep|deeper)|overdose( on)?)\b/i,
  // Lethal-dose questions: "how many <substance> to die/overdose/kill myself".
  /\bhow many\b[^.?!]{0,40}\b(pills|paracetamol|acetaminophen|tylenol|ibuprofen|aspirin|tablets|painkillers|sleeping pills)\b[^.?!]{0,40}\b(to (die|overdose|od|kill (myself|me))|are (lethal|fatal|deadly)|before i die)\b/i,
  // Lethal-dose questions phrased dose-first: "lethal/fatal dose of X for me".
  /\b(lethal|fatal|deadly) (dose|amount|quantity)\b[^.?!]{0,30}\b(to (kill|end)|for me|so i)\b/i,
];

// Sexual content involving a minor. Requires BOTH a sexual-act indicator and a
// child/minor indicator. Naming that a topic exists (sex ed, "what does the
// word mean", reporting abuse) must NOT trip — those carry no request to
// PRODUCE sexual content about a child. The patterns target a request/instruction
// to generate, describe, or depict such content.
const CHILD_TERMS =
  '(child|children|kid|kids|minor|minors|little (girl|boy)|\\d{1,2}[\\s-]?(yo|year[\\s-]?old)|preteen|pre-teen|toddler|infant)';
const SEXUAL_ACT_TERMS =
  '(sex(ual)?|naked|nude|nudes?|porn(ographic)?|explicit|aroused?|undress|touch(ing)? .{0,20}(private|genital)|genitals?)';
const SEXUAL_CONTENT_MINOR_PATTERNS: RegExp[] = [
  // "write/describe/draw/generate ... <sexual> ... <child>" (either order).
  new RegExp(
    `\\b(write|describe|draw|generate|make|create|tell me|roleplay|role-play|pretend)\\b[^.?!]{0,60}\\b${SEXUAL_ACT_TERMS}\\b[^.?!]{0,60}\\b${CHILD_TERMS}\\b`,
    'i',
  ),
  new RegExp(
    `\\b(write|describe|draw|generate|make|create|tell me|roleplay|role-play|pretend)\\b[^.?!]{0,60}\\b${CHILD_TERMS}\\b[^.?!]{0,60}\\b${SEXUAL_ACT_TERMS}\\b`,
    'i',
  ),
  // "send me nudes / naked pics of <child>" framing.
  new RegExp(
    `\\b(send|show|share|post)\\b[^.?!]{0,30}\\b(nudes?|naked (pic|photo|image)|explicit (pic|photo|image))\\b[^.?!]{0,40}\\b${CHILD_TERMS}\\b`,
    'i',
  ),
];

const TRIPWIRE_PATTERNS: Array<{
  category: CatastrophicCategory;
  patterns: RegExp[];
}> = [
  { category: 'self_harm_method', patterns: SELF_HARM_METHOD_PATTERNS },
  { category: 'sexual_content_minor', patterns: SEXUAL_CONTENT_MINOR_PATTERNS },
];

/**
 * Returns the first catastrophic category matched, or null. Deterministic,
 * synchronous, allocation-light — safe to run on every exchange input before
 * the LLM call. Order: self-harm is checked first because its forced response
 * (helpline) is the more time-critical one.
 */
export function detectCatastrophicSafetyTrigger(
  text: string,
): SafetyTripwireHit | null {
  if (!text) return null;
  for (const { category, patterns } of TRIPWIRE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return { category };
    }
  }
  return null;
}

/**
 * The deterministic safe response shown when the tripwire fires. Category-aware:
 * self-harm gets the same empathy + trusted-adult + helpline copy the model's
 * crisis rule uses (kept in sync with the SAFETY rule in exchange-prompts.ts);
 * the sexual-minor case gets a flat, non-graphic non-engagement that redirects.
 *
 * Intentionally NOT localized in this first pass — a safe English fallback is
 * better than a mistranslated safety message, and the structured event still
 * fires regardless of language. Localization is a tracked follow-up.
 */
export function tripwireResponse(category: CatastrophicCategory): string {
  switch (category) {
    case 'self_harm_method':
      return (
        "I'm really sorry you're feeling like this, and I'm glad you said something. " +
        'This is something to talk about with a parent, guardian, or trusted adult. ' +
        'If you need help right now, please reach out to a helpline in your country — ' +
        'you deserve support from someone who can be there with you.'
      );
    case 'sexual_content_minor':
      return (
        "I can't help with that. If someone has asked you for something like this, " +
        'please tell a parent, guardian, or trusted adult — it is not your fault. ' +
        "Let's get back to what you're learning."
      );
  }
}

// ---------------------------------------------------------------------------
// Image-screening fail-safe [Issue 894]
//
// The catastrophic tripwire is text-only. For image/vision input we OCR the
// image and run the tripwire over the extracted text before the conversational
// model ever sees the picture (exchanges.ts). If OCR itself fails we must NOT
// fall through and hand an unscreened image to the model — the floor would be
// silently defeated. Instead we fail SAFE: refuse this turn's image with a
// neutral, non-accusatory message and let the learner continue with text.
// This is a generic "couldn't screen it" response, NOT a catastrophic-category
// hit, so it intentionally lives outside CatastrophicCategory.
// ---------------------------------------------------------------------------

/** Marker recorded in the ExchangeResult.model field for the fail-safe path. */
export const IMAGE_UNSCREENED_MODEL = 'deterministic:image_unscreened';

/** Neutral safe reply when an attached image could not be screened (OCR error). */
export function imageUnscreenedResponse(): string {
  return (
    "I couldn't check that image just now, so I can't open it. " +
    'Please type your question instead, or try the photo again in a moment.'
  );
}
