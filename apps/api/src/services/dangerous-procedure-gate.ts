// ---------------------------------------------------------------------------
// Deterministic dangerous-procedure reply gate [WI-1154]
//
// The dual-use "no operational how-to" rule (exchange-prompts.ts SAFETY block)
// was PROMPT-ONLY: nothing on the server enforced it on the tutor's reply. A
// minor (13yo) routes to a weak model (gpt-4o-mini) that, under educational
// framing, leaked step-by-step opium->heroin extraction (eval probe SL-DU02).
// A prompt cannot be defended by a deterministic test, so WI-558's prompt-only
// fix silently regressed once live envelope-flow evals began invoking the model.
//
// This module is the server-side backstop: a deterministic, synchronous,
// allocation-light detector run on the PARSED tutor reply (post-parseEnvelope),
// mirroring the applySourceAuditSafetyFallback seam. On a hit it fails CLOSED —
// the leaked reply is replaced with a safe harm-education refusal that KEEPS the
// educational frame (declines the operational steps, invites the "what it is /
// why it is harmful" question). Because it does not depend on the model
// behaving, the floor holds even when the model is weak or jailbroken.
//
// PRECISION, deliberately: this is NOT a banned-words list. Naming a drug,
// weapon, or poison and explaining what it IS / what it does / why it is harmful
// must NEVER trip (that is the product's core must_answer commitment — the
// legitimate half of the safety battery: SL-DU01, SL-DR01, SL-DR02). A hit
// requires BOTH a controlled/dangerous-item term AND an ACTIONABLE how-to
// structure (explicit sequential steps, or an imperative production-verb chain).
// Passive single-mention description ("morphine is extracted from opium in
// pharmaceutical labs") carries no actionable procedure and does not fire.
//
// SCOPE (MMT-ADR-0030): minors get the FULL gate (all controlled/dangerous
// items); adults get a NARROW catastrophic subset ONLY — CBRN weapons +
// explosive-device construction — so adult latitude for general chemistry,
// pharmacology, energetics education, and weapons history is preserved. The
// detectors are age-agnostic and pure (for testability); `isMinor` selects the
// width in applyDangerousProcedureGate. Every branch below is exercised by a
// co-located test in dangerous-procedure-gate.test.ts, including NEGATIVE
// assertions proving it does not fire on legitimate harm-education replies nor
// over-block legitimate adult queries.
// ---------------------------------------------------------------------------

/** Marker recorded in the persisted model field when the gate fires. */
export const DANGEROUS_PROCEDURE_GATE_MODEL =
  'deterministic:dangerous_procedure';

// Controlled / dangerous items whose PRODUCTION, EXTRACTION, SYNTHESIS,
// REFINEMENT, ACQUISITION, or DOSING is the operational how-to we must never
// provide. Deliberately the DRUGS / weapons / poisons / explosives themselves —
// NOT the benign plant/seed ("poppy", "poppy seeds"), so a baking or botany
// answer never trips.
const DANGEROUS_ITEM_TERMS =
  '(opium|heroin|morphine|codeine|opioids?|cocaine|crack|methamphetamine|\\bmeth\\b|amphetamines?|fentanyl|mdma|ecstasy|\\blsd\\b|ketamine|psilocybin|\\bpcp\\b|' +
  'cyanide|ricin|sarin|arsenic|strychnine|nerve agent|mustard gas|chlorine gas|nitroglycerin|' +
  '\\btnt\\b|gunpowder|dynamite|thermite|ammonium nitrate|explosive|\\bbomb\\b|\\bied\\b|\\bc-?4\\b|' +
  'firearm|\\bgun\\b|\\bpistol\\b|\\brifle\\b|silencer|suppressor)';

const DANGEROUS_ITEM_RE = new RegExp(DANGEROUS_ITEM_TERMS, 'i');

// [WI-1351] Catastrophic subset — the ONLY dangerous-item categories the gate
// enforces for ADULTS (MMT-ADR-0030). Deliberately NARROW: CBRN weapon agents
// (chemical / biological / radiological / nuclear) and explosive-device
// construction ONLY. Everything else in DANGEROUS_ITEM_TERMS — drugs,
// firearms, general poisons (arsenic, strychnine, cyanide as toxicology) — is
// intentionally EXCLUDED here: adult latitude for general chemistry,
// pharmacology, energetics education, and weapons history stays OPEN, and the
// how-to structure requirement (below) means passive/educational prose never
// trips even on the included terms. Widening this subset is an operator ruling,
// never an engineering call.
const CATASTROPHIC_ITEM_TERMS =
  '(' +
  // Explosive devices + high explosives used to build them
  '\\bbomb\\b|\\bied\\b|\\bc-?4\\b|\\brdx\\b|\\bpetn\\b|\\bhmx\\b|\\btatp\\b|\\banfo\\b|' +
  'detonators?|blasting caps?|explosive devices?|\\bexplosives?\\b|' +
  '\\btnt\\b|dynamite|nitroglycerin|thermite|' +
  // Chemical weapons
  'sarin|\\bvx\\b|tabun|soman|nerve agents?|mustard (?:gas|agent)|phosgene|chemical weapons?|' +
  // Biological weapons
  'ricin|anthrax|botulinum|bioweapons?|biological weapons?|' +
  // Radiological / nuclear weapons
  'nuclear (?:weapons?|devices?|bombs?)|radiological (?:weapons?|dispersal)|weapons?-grade' +
  ')';

const CATASTROPHIC_ITEM_RE = new RegExp(CATASTROPHIC_ITEM_TERMS, 'i');

// Actionable production / extraction / synthesis / refine / cultivate /
// acquire / dose / consume verbs — AC#1 vocabulary plus the concrete bench,
// recipe, acquisition and consumption verbs a real how-to uses. Inflected
// stems, matched as whole words so "products" / "reduced risk" prose does not
// count. Broadened per adversarial review (WI-1154) so synonym/slang wording
// (crush, wash, pack, wire, buy, snort …) cannot slip a leak past the floor.
const PRODUCTION_VERB_STEMS = [
  'produc(?:e|es|ed|ing)',
  'extract(?:s|ed|ing|ion)?',
  'synthesi[sz](?:e|es|ed|ing)',
  'refin(?:e|es|ed|ing)',
  'purif(?:y|ies|ied|ying)',
  'distil(?:l|ls|led|ling)?',
  'cultivat(?:e|es|ed|ing)',
  'harvest(?:s|ed|ing)?',
  'ferment(?:s|ed|ing)?',
  'scor(?:e|es|ed|ing)', // scoring the seed pod
  'tap(?:s|ped|ping)?', // tapping the latex
  'boil(?:s|ed|ing)?',
  'heat(?:s|ed|ing)?',
  'dissolv(?:e|es|ed|ing)',
  'filter(?:s|ed|ing)?',
  'crystalli[sz](?:e|es|ed|ing)',
  'acetylat(?:e|es|ed|ing)',
  'mix(?:es|ed|ing)?',
  'combin(?:e|es|ed|ing)',
  'reduc(?:e|es|ed|ing)',
  'evaporat(?:e|es|ed|ing)',
  'precipitat(?:e|es|ed|ing)',
  'acquir(?:e|es|ed|ing)',
  'obtain(?:s|ed|ing)?',
  'manufactur(?:e|es|ed|ing)',
  'assembl(?:e|es|ed|ing)',
  'dos(?:e|es|ed|ing)',
  'administer(?:s|ed|ing)?',
  'inject(?:s|ed|ing)?',
  // Broadened recipe / acquisition / consumption verbs (review SHOULD-FIX 1).
  'crush(?:es|ed|ing)?',
  'grind(?:s|ing)?',
  'ground',
  'soak(?:s|ed|ing)?',
  'wash(?:es|ed|ing)?',
  'rins(?:e|es|ed|ing)',
  'strain(?:s|ed|ing)?',
  'cook(?:s|ed|ing)?',
  'stir(?:s|red|ring)?',
  'pour(?:s|ed|ing)?',
  'pack(?:s|ed|ing)?',
  'wir(?:e|es|ed|ing)',
  'attach(?:es|ed|ing)?',
  'load(?:s|ed|ing)?',
  'buy(?:s|ing)?',
  'bought',
  'purchas(?:e|es|ed|ing)',
  'smok(?:e|es|ed|ing)',
  'snort(?:s|ed|ing)?',
  'swallow(?:s|ed|ing)?',
  'scrap(?:e|es|ed|ing)',
  'warm(?:s|ed|ing)?',
  'cool(?:s|ed|ing)?',
  'dr(?:y|ies|ied|ying)',
  'cut(?:s|ting)?',
  'add(?:s|ed|ing)?',
];
const PRODUCTION_VERB_RE = new RegExp(
  `\\b(?:${PRODUCTION_VERB_STEMS.join('|')})\\b`,
  'i',
);

// Base (imperative) forms only — used to detect a sentence-initial COMMAND
// ("Extract the morphine", "Pack the pipe"). Base forms with \b prevent the
// noun form ("Extraction is dangerous") from matching.
const IMPERATIVE_VERB_STEMS = [
  'produce',
  'extract',
  'synthesi[sz]e',
  'refine',
  'purify',
  'distil',
  'distill',
  'cultivate',
  'harvest',
  'ferment',
  'score',
  'tap',
  'boil',
  'heat',
  'dissolve',
  'filter',
  'crystalli[sz]e',
  'acetylate',
  'mix',
  'combine',
  'reduce',
  'evaporate',
  'precipitate',
  'acquire',
  'obtain',
  'manufacture',
  'assemble',
  'dose',
  'administer',
  'inject',
  'buy',
  'purchase',
  'snort',
  'swallow',
  'smoke',
  'crush',
  'grind',
  'soak',
  'wash',
  'rinse',
  'strain',
  'cook',
  'stir',
  'pour',
  'pack',
  'wire',
  'attach',
  'load',
  'scrape',
  'warm',
  'cool',
  'dry',
  'cut',
  'add',
];

// Second-person action: "you [modal/adverb]* <verb>" — an instruction aimed at
// the learner. This is the strong how-to signal that distinguishes a leak
// ("you dissolve it, then you add …") from passive/third-person description
// ("morphine is extracted", "factories manufactured TNT").
const SECOND_PERSON_ACTION_RE = new RegExp(
  `\\byou(?:'?(?:ll|d|re|ve))?(?:\\s+(?:can|could|should|would|will|must|then|next|now|just|simply|also|carefully|first|only|need\\s+to|have\\s+to|want\\s+to|gotta))*\\s+(?:${PRODUCTION_VERB_STEMS.join(
    '|',
  )})\\b`,
  'i',
);

// Sentence-initial imperative command: a base-form production verb at a clause
// boundary (start / after . ! ? / after an ordinal connective at a boundary)
// directly governing an object. Deliberately NOT triggered after a comma, so an
// elided third-person clause ("workers would refine …, then assemble the
// bombs") does not read as a command.
const IMPERATIVE_START_RE = new RegExp(
  `(?:^|[.!?]\\s+)(?:(?:first|firstly|next|then|now|finally|second|secondly|third|thirdly)[,]?\\s+)?(?:${IMPERATIVE_VERB_STEMS.join(
    '|',
  )})\\s+(?:the|a|an|it|them|those|these|your|some|one|two|three|\\d|about|roughly|approximately|enough)\\b`,
  'i',
);

// Explicit enumerated-step structure: "step 1 / step one", or a numbered list
// with two or more items ("1. ... 2. ...").
const STEP_MARKER_RE = /\bstep\s*(?:[1-9]|one|two|three|four|five)\b/i;

function countNumberedListItems(text: string): number {
  // Match "1.", "2)", "3:" at a clause/line boundary — a genuine enumerated
  // list, not a decimal like "3.5 grams".
  const matches = text.match(/(?:^|\n|\s)[1-9][.)]\s+\S/g);
  return matches ? matches.length : 0;
}

/**
 * Deterministic: does this tutor reply contain ACTIONABLE how-to detail for
 * producing / extracting / synthesising / refining / acquiring / dosing a
 * controlled or dangerous item?
 *
 * A hit requires a dangerous-item term AND one of:
 *  (A) an explicit enumerated-step structure ("step 1…", or a >=2-item numbered
 *      list) plus at least one production/recipe verb; or
 *  (B) an imperative or second-person production ACTION ("you dissolve it",
 *      "Pack the pipe") — an instruction aimed at the learner.
 *
 * Passive / third-person description ("morphine is extracted from opium",
 * "factories manufactured TNT, then assembled the bombs") has neither an
 * enumerated step structure nor an imperative/second-person action, so it does
 * not fire — protecting the legitimate harm-education must_answer commitment.
 */
function detectProcedureLeak(reply: string, itemRe: RegExp): boolean {
  if (!reply) return false;
  const text = reply.replace(/\s+/g, ' ').trim();
  if (!itemRe.test(text)) return false;

  // (A) enumerated how-to steps naming a production/recipe verb.
  const hasStepStructure =
    STEP_MARKER_RE.test(text) || countNumberedListItems(text) >= 2;
  if (hasStepStructure && PRODUCTION_VERB_RE.test(text)) return true;

  // (B) imperative / second-person production action (prose how-to).
  return SECOND_PERSON_ACTION_RE.test(text) || IMPERATIVE_START_RE.test(text);
}

export function detectDangerousProcedureLeak(reply: string): boolean {
  return detectProcedureLeak(reply, DANGEROUS_ITEM_RE);
}

/**
 * [WI-1351] Catastrophic-subset variant of {@link detectDangerousProcedureLeak}:
 * identical how-to structure logic, but the item vocabulary is narrowed to the
 * CBRN-weapon + explosive-device-construction categories only (MMT-ADR-0030).
 * This is the detector applied to ADULT traffic — drugs, firearms, and general
 * poisons are deliberately outside its vocabulary, preserving adult latitude.
 */
export function detectCatastrophicProcedureLeak(reply: string): boolean {
  return detectProcedureLeak(reply, CATASTROPHIC_ITEM_RE);
}

/**
 * The safe reply shown when the gate fires. Declines the operational
 * step-by-step while KEEPING the educational frame — it does not wall the
 * learner off, it redirects to the legitimate "what it is / why it is harmful"
 * question. Kept in sync with the SAFETY "harmful or dangerous procedures" rule
 * in exchange-prompts.ts. English-only in this first pass, matching the
 * safety-tripwire fallback rationale (a safe English message beats a
 * mistranslated safety message; the structured event fires regardless).
 */
export function dangerousProcedureRefusalResponse(): string {
  return (
    "I can explain what that is, what it does to the body, and why it's " +
    'dangerous and tightly controlled — that part is important to understand ' +
    "and I'm happy to. But I can't walk through how it's made, extracted, or " +
    "taken step by step. If you're curious about the science or the harm side " +
    "of this, ask me that and I'll explain it properly."
  );
}

/**
 * Apply the gate to a learner-visible tutor reply. Age-scoped by the caller via
 * `isMinor`, with two enforcement widths (MMT-ADR-0030):
 *
 *  - **Minors** (`isMinor: true`): the FULL dangerous-procedure gate — every
 *    controlled/dangerous item (drugs, weapons, poisons, CBRN, explosives). The
 *    catastrophic subset is unioned in so minor protection is always a superset
 *    of adult protection (a minor can never slip a CBRN how-to an adult would be
 *    blocked from).
 *  - **Adults** (`isMinor: false`): the NARROW catastrophic subset ONLY — CBRN
 *    weapons + explosive-device construction. All other adult latitude (general
 *    chemistry, pharmacology, energetics education, weapons history, and the
 *    non-catastrophic drug/weapon how-to the minor gate blocks) stays OPEN.
 *
 * Returns the original reply unchanged when no in-scope leak is detected;
 * returns the safe refusal with `blocked: true` on a hit.
 */
export function applyDangerousProcedureGate(
  reply: string,
  opts: { isMinor: boolean },
): { response: string; blocked: boolean } {
  const leaked = opts.isMinor
    ? detectDangerousProcedureLeak(reply) ||
      detectCatastrophicProcedureLeak(reply)
    : detectCatastrophicProcedureLeak(reply);
  if (!leaked) return { response: reply, blocked: false };
  return { response: dangerousProcedureRefusalResponse(), blocked: true };
}
