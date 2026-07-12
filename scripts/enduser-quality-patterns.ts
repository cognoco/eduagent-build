// Quality-check regexes that WI-1823 changed or must pin against regression.
// Extracted from enduser-session-pass.ts so they can be unit-tested without
// importing the gate's CLI entrypoint (which runs main() and pulls the full
// DB/config graph). Only the WI-1823-relevant patterns live here; the remaining
// gate regexes stay inline in enduser-session-pass.ts.

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

// Splits a reply into sentences on sentence-ending punctuation.
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;
function replySentences(reply: string): string[] {
  return reply
    .split(SENTENCE_SPLIT_RE)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

// Splits a (non-interrogative) sentence into clauses on comma, semicolon,
// colon, or a spaced dash — the punctuation a reply uses to tack a fact onto
// a conversational opener ("Sure, 3·5+5 = 20.", "Go ahead — the answer is
// 20.").
const CLAUSE_SPLIT_RE = /\s*[,;:]\s*|\s+[—–]\s+/;
function sentenceClauses(sentence: string): string[] {
  return sentence
    .split(CLAUSE_SPLIT_RE)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

// A clause carries no factual assertion only when it is ENTIRELY one of
// these known setup/invitation/acknowledgement shapes (optionally with a
// trailing "." or "!") — matched in full, not as a prefix. Full-clause
// matching is what closes the prefix bypass: "Sure, 3·5+5 = 20." splits
// into "Sure" (matches) and "3·5+5 = 20." (does not match, since it has
// extra content after the recognized token), so the sentence is correctly
// flagged instead of the whole sentence being waved through because it
// merely STARTED with "Sure".
const NO_CLAIM_CLAUSE_RE =
  /^(?:sure|great|okay|ok|awesome|nice|no problem|of course|alright|perfect|your turn|take your time|let'?s (?:start|begin|go|try)|i'?m (?:listening|ready)|i am (?:listening|ready)|whenever you'?re ready|when you'?re ready|go ahead(?: and recite it(?: for me| to me)?)?)[.!]*$/i;

// True when the reply contains a declarative sentence carrying a factual
// assertion — a sentence with at least one clause that isn't a full match
// for NO_CLAIM_CLAUSE_RE (e.g. "The mitochondria is the powerhouse of the
// cell.", "3·5+5 = 20."). Question sentences never assert a claim. Any
// clause not recognized as purely invitational is treated as an assertion —
// this errs toward flagging (a false positive here is a safe, self-surfacing
// gate failure; a false negative would let a real claim through ungrounded).
function replyAssertsFactualClaim(reply: string): boolean {
  return replySentences(reply).some((sentence) => {
    if (sentence.endsWith('?')) return false;
    return sentenceClauses(sentence).some(
      (clause) => !NO_CLAIM_CLAUSE_RE.test(clause),
    );
  });
}

// A turn makes no factual claim when its source audit reports
// missing_reliable_source AND the model emitted no factual_confidence (which
// per the prompt contract is only ever emitted for general_knowledge
// reliance — its absence alone doesn't prove no claim was made) AND the
// reply itself is non-assertive (setup/invitation or question only).
// Setup/greeting/prompt turns hit this (recitation "go ahead and recite it
// for me — I'm listening", a language-immersion opener question); a
// declarative factual assertion with no relied_on and no factual_confidence
// (e.g. "3·5+5 = 20.") must NOT be skipped. WI-1823 ruling 2a — the skip
// keys on the no-claim signal, not on relied_on being empty; closing the
// carve-out hole where a forgotten relied_on masqueraded as "no claim".
export function sourceAuditNoFactualClaim(
  audit: {
    status: string;
    factualConfidence?: number;
  },
  reply: string,
): boolean {
  return (
    audit.status === 'missing_reliable_source' &&
    audit.factualConfidence == null &&
    !replyAssertsFactualClaim(reply)
  );
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
