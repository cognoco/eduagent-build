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
// SCOPE: enforcement is applied to under-18-routed traffic at the call sites
// (the detector itself is age-agnostic and pure, for testability). Every branch
// below is exercised by a co-located test in dangerous-procedure-gate.test.ts,
// including NEGATIVE assertions proving it does not fire on legitimate
// harm-education replies.
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

// Actionable production / extraction / synthesis / refine / cultivate / acquire
// / dose verbs (AC#1 vocabulary + the concrete bench verbs a real extraction
// recipe uses). Matched as whole words so "products" / "reduced risk" prose does
// not count.
const PRODUCTION_VERBS: RegExp[] = [
  /\bproduc(?:e|es|ed|ing)\b/i,
  /\bextract(?:s|ed|ing|ion)?\b/i,
  /\bsynthesi[sz](?:e|es|ed|ing)\b/i,
  /\brefin(?:e|es|ed|ing)\b/i,
  /\bpurif(?:y|ies|ied|ying)\b/i,
  /\bdistil(?:l|ls|led|ling)?\b/i,
  /\bcultivat(?:e|es|ed|ing)\b/i,
  /\bharvest(?:s|ed|ing)?\b/i,
  /\bferment(?:s|ed|ing)?\b/i,
  /\bscor(?:e|es|ed|ing)\b/i, // scoring the seed pod
  /\btap(?:s|ped|ping)?\b/i, // tapping the latex
  /\bboil(?:s|ed|ing)?\b/i,
  /\bheat(?:s|ed|ing)?\b/i,
  /\bdissolv(?:e|es|ed|ing)\b/i,
  /\bfilter(?:s|ed|ing)?\b/i,
  /\bcrystalli[sz](?:e|es|ed|ing)\b/i,
  /\bacetylat(?:e|es|ed|ing)\b/i,
  /\bmix(?:es|ed|ing)?\b/i,
  /\bcombin(?:e|es|ed|ing)\b/i,
  /\breduc(?:e|es|ed|ing)\b/i,
  /\bevaporat(?:e|es|ed|ing)\b/i,
  /\bprecipitat(?:e|es|ed|ing)\b/i,
  /\bacquir(?:e|es|ed|ing)\b/i,
  /\bobtain(?:s|ed|ing)?\b/i,
  /\bmanufactur(?:e|es|ed|ing)\b/i,
  /\bassembl(?:e|es|ed|ing)\b/i,
  /\bdos(?:e|es|ed|ing)\b/i,
  /\badminister(?:s|ed|ing)?\b/i,
  /\binject(?:s|ed|ing)?\b/i,
];

// Sequential connectives that signal a multi-step procedure (as opposed to a
// single descriptive sentence). Anchored as whole words.
const SEQUENCE_CONNECTIVE_RE =
  /\b(?:then|next|after that|afterwards|finally|firstly|first,|second(?:ly)?|third(?:ly)?|once you|once it)\b/i;

// Explicit enumerated-step structure: "step 1 / step one", or a numbered list
// with two or more items ("1. ... 2. ...").
const STEP_MARKER_RE = /\bstep\s*(?:[1-9]|one|two|three|four|five)\b/i;

function countNumberedListItems(text: string): number {
  // Match "1.", "2)", "3:" at a clause/line boundary — a genuine enumerated
  // list, not a decimal like "3.5 grams".
  const matches = text.match(/(?:^|\n|\s)[1-9][.)]\s+\S/g);
  return matches ? matches.length : 0;
}

function countDistinctProductionVerbs(text: string): number {
  let n = 0;
  for (const re of PRODUCTION_VERBS) {
    if (re.test(text)) n += 1;
  }
  return n;
}

/**
 * Deterministic: does this tutor reply contain ACTIONABLE how-to detail for
 * producing / extracting / synthesising / refining / acquiring / dosing a
 * controlled or dangerous item?
 *
 * A hit requires a dangerous-item term AND one of:
 *  (A) an explicit enumerated-step structure ("step 1…", or a >=2-item numbered
 *      list) plus at least one production verb; or
 *  (B) an imperative production chain — >=2 distinct production verbs together
 *      with a sequential connective ("first … then … next").
 *
 * Passive single-mention description ("morphine is extracted from opium") lacks
 * both a step structure and a sequenced verb chain, so it does not fire.
 */
export function detectDangerousProcedureLeak(reply: string): boolean {
  if (!reply) return false;
  const text = reply.replace(/\s+/g, ' ').trim();
  if (!DANGEROUS_ITEM_RE.test(text)) return false;

  const productionVerbs = countDistinctProductionVerbs(text);
  if (productionVerbs === 0) return false;

  const hasStepStructure =
    STEP_MARKER_RE.test(text) || countNumberedListItems(text) >= 2;
  if (hasStepStructure) return true; // (A)

  // (B) imperative production chain
  return productionVerbs >= 2 && SEQUENCE_CONNECTIVE_RE.test(text);
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
 * Apply the gate to a learner-visible tutor reply. Age-scoped by the caller:
 * enforcement runs only for minors (`isMinor: true`). Returns the original
 * reply unchanged when the learner is an adult or no leak is detected; returns
 * the safe refusal with `blocked: true` on a hit.
 */
export function applyDangerousProcedureGate(
  reply: string,
  opts: { isMinor: boolean },
): { response: string; blocked: boolean } {
  if (!opts.isMinor) return { response: reply, blocked: false };
  if (!detectDangerousProcedureLeak(reply)) {
    return { response: reply, blocked: false };
  }
  return { response: dangerousProcedureRefusalResponse(), blocked: true };
}
