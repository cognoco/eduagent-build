// Quality-check regexes that WI-1823 changed or must pin against regression.
// Extracted from enduser-session-pass.ts so they can be unit-tested without
// importing the gate's CLI entrypoint (which runs main() and pulls the full
// DB/config graph). Only the WI-1823-relevant patterns live here; the remaining
// gate regexes stay inline in enduser-session-pass.ts.

import { recitationSetupLeaksSourceContent } from '../apps/api/src/services/session/session-recitation-setup';

// Fires when a recitation polish/feedback carries an unsupported speed claim.
// The recitation fixture source states "made trade easier" (not "faster"), so a
// polished version that says trade moved "faster" has added an unsupported fact.
export const RECITATION_UNSUPPORTED_POLISH_RE =
  /\b(?:armies|army)\s+(?:could\s+)?travel(?:ed|ing)?\s+quickly\b|\btrade\b[^.?!]*\bfaster\b|\bfaster\b[^.?!]*\btrade\b/i;

// Marks the start of the model's PROPOSED polished/tidy recitation version. The
// polish check must scan only the text AFTER this marker (WI-1823 ruling 1): a
// correct correction necessarily quotes the learner's unsupported phrase in
// order to fix it (e.g. "the source says 'made trade easier', not 'move
// faster'") — scanning the whole reply flags that correct behavior. Only an
// unsupported claim inside the polished version itself is an added fact.
const RECITATION_POLISH_INTRO_RE =
  /\b(?:tidy|polished|clean(?:ed|er)?|refined|corrected|final|improved|better|model)\s+(?:version|answer|wording|sentence)\b\s*:?|\byou could say\b\s*:?|\bto actually recite\b\s*:?|\bhere(?:'s| is)\b[^.?!:]{0,40}\bversion\b\s*:?/i;

// Returns the polished-version segment (text after the intro marker), or null
// when the reply proposes no polished version — in which case there is no
// polish to audit and the check must not fire.
export function recitationPolishSegment(response: string): string | null {
  const match = RECITATION_POLISH_INTRO_RE.exec(response);
  if (!match) return null;
  return response.slice(match.index + match[0].length);
}

// True when the model's proposed polished recitation version carries an
// unsupported speed claim. Scans ONLY the polished segment; a reply with no
// identifiable polished version returns false (nothing to audit).
// ponytail: no polished-version marker => no fire. A polished version given
// without any recognized marker would escape; the fixture + prompt reliably
// mark it ("tidy version:"), and whole-reply scanning is what mis-fires on
// correct corrections, so we accept that narrow false-negative.
export function recitationPolishAddedFact(response: string): boolean {
  const segment = recitationPolishSegment(response);
  if (segment === null) return false;
  return RECITATION_UNSUPPORTED_POLISH_RE.test(segment);
}

const RECITATION_READY_TO_BEGIN_RE =
  /\bi(?:'m| am) ready\b.*\b(?:begin|start|go ahead)\b|\bgo ahead\b(?:.*\b(?:begin|start|recite)\b)?|\b(?:you can )?(?:begin|start|recite)(?: your)?(?: recitation)? (?:now|when|whenever)\b/i;
const RECITATION_SETUP_REASK_RE =
  /\b(?:what would you like to recite|what (?:are|will) you reciting|which (?:poem|recitation|selection)|tell(?:ing)? me (?:which |the )?(?:poem|recitation|selection|title|author)|giv(?:e|ing) me (?:the )?(?:title|author)|title,? author,? or (?:a )?(?:short )?description)\b/i;
const RECITATION_PREMATURE_MODEL_RE =
  /\b(?:you could say|to actually recite|polished version|final version|model answer)\b|\b(?:begin|start) with\s*:/i;

export function recitationSetupReplyAdvances(
  response: string,
  sourceText?: string,
): boolean {
  return (
    RECITATION_READY_TO_BEGIN_RE.test(response) &&
    !RECITATION_SETUP_REASK_RE.test(response) &&
    !RECITATION_PREMATURE_MODEL_RE.test(response) &&
    !recitationSetupLeaksSourceContent(response, sourceText)
  );
}

// Fail-statuses on the private source audit that indicate the reply was not
// backed by a valid reliable-source trail.
export const SOURCE_AUDIT_FAIL_STATUSES = new Set([
  'parse_failed',
  'missing_private_sources',
  'unsupported_sources',
  'missing_reliable_source',
]);

// WI-1823 pivot (operator-ruled Option A): source_audit fail-status is now
// gated on TURN IDENTITY, never on reply content. The prior content
// heuristic (sourceAuditNoFactualClaim — a sentence/clause classifier trying
// to prove a reply "makes no factual claim") kept admitting new bypass
// phrasings under adversarial review (bare fact, conversational-prefix fact,
// em-dash-appended fact, fact framed as a question) because a regex can't be
// both conservative and reliable against arbitrary reply phrasing. Source
// discipline now applies unconditionally to every TEACHING turn regardless
// of how the reply is worded; only turns whose AUTHORED PURPOSE is not to
// teach a sourced fact (setup/greeting/opener/meta — marked
// `exemptSourceAudit: true` on the RunDefinition turn in
// enduser-session-pass.ts) are exempt from the gate. The exemption decision
// takes no reply text at all, so reply phrasing structurally cannot affect
// it.
export function sourceAuditGateFires(
  status: string,
  exemptSourceAudit: boolean | undefined,
): boolean {
  return SOURCE_AUDIT_FAIL_STATUSES.has(status) && exemptSourceAudit !== true;
}

// The four-strands correction turn must land on "en mi opinión".
export const FOUR_STRANDS_CORRECTION_RE = /\ben mi opini[oó]n\b/i;

// Names the missing/incorrect "en" connector. Language-agnostic per AC-C
// ("names the missing 'en'" — no English requirement): the four-strands lesson
// is Spanish-immersion, so the correction turn may name the error in Spanish
// ("falta la preposición 'en'") or English ("missing the word 'en'"). Both are
// valid; the prior English-only keyword set wrongly flagged the Spanish form.
export const FOUR_STRANDS_EXPLAINS_EN_RE =
  /\b(?:missing|need|needs|use|uses|add|adds|omit|omitted|forgot|left out|falta|falt[oó]|faltan|a[nñ]ad\w*|agreg\w*|olvid\w*|preposici[oó]n)\b[^.?!]*\ben\b|\ben\b[^.?!]*(?:before|in front of|with|antes|delante)\s*(?:de\s+)?['"]?(?:la\s+|el\s+)?(?:mi\s+)?(?:palabra\s+)?opini[oó]n/i;

// Each pattern accepts the source point stated in the source's own wording OR a
// faithful synonym the model commonly paraphrases with (move→travel,
// connect→link, easier→smoother/simpler). Recalibrated per AC-B positive
// evidence: the model taught all three genuine source points but with synonyms,
// which the exact-wording patterns over-fit and wrongly flagged as too thin.
export const LEARNING_SOURCE_POINT_RE = [
  /\barm(?:y|ies)\b[^.?!]*\b(?:move|travel)\w*\b|\b(?:move|travel)\w*\b[^.?!]*\barm(?:y|ies)\b/i,
  /\b(?:connect(?:ed|s|ing)?|link(?:ed|s|ing)?)\b[^.?!]*\btowns?\b|\btowns?\b[^.?!]*\b(?:connect(?:ed|s|ing)?|link(?:ed|s|ing)?)\b/i,
  /\btrade\b[^.?!]*\b(?:easier|smoother|simpler)\b|\b(?:easier|smoother|simpler)\b[^.?!]*\btrade\b/i,
] as const;
