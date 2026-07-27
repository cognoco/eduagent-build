import type { ConversationLanguage } from '@eduagent/schemas';

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
// Instead this is a HIGH-PRECISION, intent-shaped tripwire scoped to the
// genuinely catastrophic categories where we want a deterministic floor that
// does NOT depend on the model behaving (e.g. when jailbroken):
//
//   1. self_harm_method      — first/second-person method-seeking or active
//                              intent to die / self-harm (NOT third-person
//                              analytical, NOT hyperbole like "this homework is
//                              killing me").
//   2. sexual_content_minor  — requests for sexual content involving a child.
//   3. abuse_disclosure      — FIRST-PERSON disclosure of physical/sexual abuse
//                              by a family member / caregiver / trusted adult
//                              (e.g. "my dad hits me", "my uncle touched me down
//                              there", "i was molested"). Requires the learner
//                              to be the VICTIM (a first-person self-reference
//                              anchor) AND an explicit physical/sexual-harm act
//                              — so third-person analytical, historical,
//                              literary, curriculum, and definitional discussion
//                              of abuse topics (WI-1360's SL-AB battery) never
//                              trips. Neglect and grooming are deterministically
//                              undetectable (no reliable surface signature) and
//                              are DELIBERATELY left to the model layer.
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

export type CatastrophicCategory =
  | 'self_harm_method'
  | 'sexual_content_minor'
  | 'abuse_disclosure';

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

// First-person disclosure of physical/sexual abuse. The signature is
// deliberately CONJUNCTIVE — an explicit physical/sexual-harm act AND the
// learner as its first-person victim ("me" as the direct object, or "i
// was/am/got + <abuse verb>"). A family/caregiver/trusted-adult perpetrator is
// required for the ambiguous physical verbs (hit/beat/…) and optional for the
// unambiguous ones (molested/raped/abused). This keeps third-person analytical,
// historical, literary, and definitional abuse-topic questions — the WI-1360
// SL-AB battery — from ever tripping. Idiom collisions are excluded with
// lookaheads: "hits me up" (contacts me), "beats me at chess" (defeats me), and
// "[hit] me with a <benign/abstract object>" ("a tricky question", "a water
// balloon", "a pillow") — while genuine weapon objects ("with a belt", "with a
// bottle") still fire. The perpetrator set includes the app's high-frequency
// trusted adults (teacher/tutor/counsellor/coach), who are also relevant
// perpetrators in an educational setting [WI-1359 review].
const ABUSE_PERP =
  "(?:my |step-?)?(?:mum|mom|mummy|mommy|mother|dad|daddy|father|stepdad|step-?dad|stepmum|step-?mum|stepmom|step-?mom|stepfather|step-?father|stepmother|step-?mother|step-?parent|uncle|aunt|auntie|grandpa|grandad|grand-?dad|grandfather|grandma|granny|grandmother|guardian|foster (?:mum|mom|dad|father|mother|parent)|baby-?sitter|coach|teacher|tutor|counsellor|counselor|(?:mum|mom|mother|dad|father)'?s (?:boyfriend|girlfriend|partner))";
// Benign / abstract / play objects that follow "[harm-verb] me with …" in an
// idiom or horseplay, NOT an abuse disclosure. Weapon/injury objects (belt,
// bottle, stick, …) are deliberately absent so they still fire.
const ABUSE_BENIGN_OBJECT =
  'questions?|ideas?|news|facts?|jokes?|riddles?|problems?|answers?|knowledge|shots?|best shot|balloons?|pillows?|cushions?|foam (?:bat|sword|ball|noodle)|nerf|snowballs?|sponge|beach ?ball|water ?gun|water ?pistol|silly string|marshmallows?|feathers?|towel';
const ABUSE_DISCLOSURE_PATTERNS: RegExp[] = [
  // 1. Family/caregiver/trusted-adult perpetrator physically hurts the
  //    first-person learner; "me" is the direct object (adjacent to the verb so
  //    "slapped a detention on me" cannot match). `(?!\s+up)` excludes "hits me
  //    up" (contacts); the `(?!\s+with …benign)` guard excludes "hit me with a
  //    tricky question / a water balloon" while keeping "hit me with a belt".
  new RegExp(
    `\\b${ABUSE_PERP}\\b[^.?!]{0,30}\\b(?:hits?|punch(?:es|ed)?|slap(?:s|ped)?|kick(?:s|ed)?|whip(?:s|ped)?|burn(?:s|ed|t)?|chok(?:es|ed)?|strangl(?:es|ed)?|molest(?:s|ed)?|rap(?:es|ed)?|assault(?:s|ed)?|abus(?:es|ed)?)\\s+me\\b(?!\\s+up\\b)(?!\\s+with\\s+[^.?!]{0,20}?\\b(?:${ABUSE_BENIGN_OBJECT})\\b)`,
    'i',
  ),
  // 2. "beat(s|en) me" by a caregiver, excluding "beats me at <game>" (defeats)
  //    and "beat me with a <benign object>" (pillow fight), keeping weapons.
  new RegExp(
    `\\b${ABUSE_PERP}\\b[^.?!]{0,30}\\bbeat(?:s|en)? me\\b(?!\\s+at\\b)(?!\\s+with\\s+[^.?!]{0,20}?\\b(?:${ABUSE_BENIGN_OBJECT})\\b)`,
    'i',
  ),
  // 3. First-person victim of an UNAMBIGUOUS abuse act — verbs that do not
  //    collide with sports/games idioms the way "hit"/"beat" do. Perpetrator
  //    optional. "abused" (not "abusive") keeps third-person "an abusive parent"
  //    from matching.
  new RegExp(
    `\\bi(?:'?m| am| was| get| got| keep getting| have been|'?ve been| am being| was being)\\b[^.?!]{0,15}\\b(?:molested|raped|sexually (?:abused|assaulted)|abused|assaulted|strangled)\\b`,
    'i',
  ),
  // 4. Sexual abuse by a family/caregiver, or the child made to perform sexual
  //    acts. An explicit sexual/inappropriate qualifier is REQUIRED so benign
  //    "touch" (tickle, comfort, a hand on the shoulder) never trips.
  new RegExp(
    `\\b${ABUSE_PERP}\\b[^.?!]{0,30}\\btouch(?:es|ed|ing)?\\b[^.?!]{0,20}\\b(?:me (?:there|down there|inappropriately|sexually|where (?:he|she|they) shouldn'?t)|my (?:private|privates|private parts|genitals|penis|vagina|butt|bum|breasts?|boobs?))\\b`,
    'i',
  ),
  new RegExp(
    `\\b${ABUSE_PERP}\\b[^.?!]{0,30}\\b(?:makes?|made|forces?|forced)\\b[^.?!]{0,15}\\bme\\b[^.?!]{0,20}\\b(?:touch (?:him|her|them|his|their)|do sexual|have sex|perform sexual|give (?:him|her|them))\\b`,
    'i',
  ),
  // 5. First-person explicit sexual touching; the sexual qualifier makes it
  //    unambiguous, so a family perpetrator is not required.
  new RegExp(
    `\\btouch(?:es|ed|ing)?\\b[^.?!]{0,15}\\b(?:me (?:down there|inappropriately|sexually)|my (?:privates?|private parts|genitals|penis|vagina))\\b`,
    'i',
  ),
];

const TRIPWIRE_PATTERNS: Array<{
  category: CatastrophicCategory;
  patterns: RegExp[];
}> = [
  { category: 'self_harm_method', patterns: SELF_HARM_METHOD_PATTERNS },
  { category: 'sexual_content_minor', patterns: SEXUAL_CONTENT_MINOR_PATTERNS },
  { category: 'abuse_disclosure', patterns: ABUSE_DISCLOSURE_PATTERNS },
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
 * the sexual-minor case gets a flat, non-graphic non-engagement that redirects;
 * the abuse-disclosure case validates the learner, makes clear it is not their
 * fault, and points to a trusted adult / helpline. NOTE: the abuse reply
 * deliberately does NOT default to "a parent or guardian" — in a first-person
 * abuse disclosure the caregiver is frequently the perpetrator, so it names
 * teacher / counsellor / a relative the learner feels safe with / a helpline
 * instead. It does NOT repeat the disclosure, interrogate, or moralise.
 *
 * The safety prose remains the reviewed English fallback. The maintained help
 * directory is locale-keyed so the learner can reach verified local resources
 * without this service embedding phone numbers that can go stale.
 */
const HELPLINE_RESOURCE_URLS: Record<ConversationLanguage, string> = {
  en: 'https://findahelpline.com/',
  cs: 'https://findahelpline.com/cs-CZ',
  es: 'https://findahelpline.com/es-ES',
  fr: 'https://findahelpline.com/fr-FR',
  de: 'https://findahelpline.com/de-DE',
  it: 'https://findahelpline.com/it-IT',
  pt: 'https://findahelpline.com/pt-PT',
  pl: 'https://findahelpline.com/pl-PL',
  ja: 'https://findahelpline.com/ja-JP',
  nb: 'https://findahelpline.com/countries/no',
};

export function tripwireResponse(
  category: CatastrophicCategory,
  conversationLanguage: ConversationLanguage = 'en',
): string {
  const helplineResourceUrl = HELPLINE_RESOURCE_URLS[conversationLanguage];
  switch (category) {
    case 'self_harm_method':
      return (
        "I'm really sorry you're feeling like this, and I'm glad you said something. " +
        'This is something to talk about with a parent, guardian, or trusted adult. ' +
        'If you need help right now, please use ' +
        `[Find A Helpline](${helplineResourceUrl}) to find verified support in your country — ` +
        'you deserve support from someone who can be there with you.'
      );
    case 'sexual_content_minor':
      return (
        "I can't help with that. If someone has asked you for something like this, " +
        'please tell a parent, guardian, or trusted adult — it is not your fault. ' +
        "Let's get back to what you're learning."
      );
    case 'abuse_disclosure':
      return (
        "I'm really glad you told me, and I'm sorry this is happening to you. " +
        'This is not your fault, and you deserve to be safe. Please talk to an ' +
        'adult you trust — a teacher, a school counsellor, a relative you feel ' +
        'safe with, or use ' +
        `[Find A Helpline](${helplineResourceUrl}) to find verified support in your country — ` +
        'so someone can help you. ' +
        "You don't have to handle this on your own."
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
// non-accusatory uncertainty message, local support resources, and a text retry.
// This is a generic "couldn't screen it" response rather than a claimed
// catastrophic-category hit, so it intentionally lives outside
// CatastrophicCategory while still activating the conservative resource path.
// ---------------------------------------------------------------------------

/** Marker recorded in the ExchangeResult.model field for the fail-safe path. */
export const IMAGE_UNSCREENED_MODEL = 'deterministic:image_unscreened';

/** Safe reply with local resources when an attached image cannot be screened. */
export function imageUnscreenedResponse(
  conversationLanguage: ConversationLanguage = 'en',
): string {
  const helplineResourceUrl = HELPLINE_RESOURCE_URLS[conversationLanguage];
  return (
    "I couldn't check that image just now, so I can't open it. " +
    'If it is about you or someone else being unsafe, use ' +
    `[Find A Helpline](${helplineResourceUrl}) to find verified support in your country. ` +
    'Please type your question instead, or try the photo again in a moment.'
  );
}
