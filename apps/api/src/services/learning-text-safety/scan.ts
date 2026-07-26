// ---------------------------------------------------------------------------
// [WI-2628] Stage 1 — the deterministic core of the ONE shared multilingual
// persisted-learning-text safety gate (MMT-ADR-0036 §4 item 6; Alternative 10
// explicitly rejects the shipped "English clinical-term regexes at individual
// callers" design that `persisted-learning-text-guard.ts` implements).
//
// This module lands UNWIRED. It changes no call site and no existing behavior.
//   Stage 1 (landed, 546359665): deterministic scan + disposition + corpus.
//   Stage 2 (landed): the independent judge behind `disposition === 'refer'`.
//   Stage 2.5 (this PR): the attributed-only lexeme scope — the corpus
//     reachability correction the Stage-3 ruling requires before wiring.
//   Stage 3: rewire the 8 write-time call sites + observability.
//
// TWO OUTPUTS, DELIBERATELY:
//   `classification` — the lexeme/grammar finding: block | clear | ambiguous.
//   `disposition`    — what the CALLER must do: block | clear | refer.
//
// The fail-closed matrix is DETERMINISTIC and lives here, not in the judge.
// Per §4.6, `refer` (the judge seam) is reachable ONLY for LLM-authored text
// with a known producer vendor. User-authored ambiguity, migration/backfill
// ambiguity, and missing producer identity all fail closed to `block` with
// reason `unclear` — the judge never gets the chance to allow them, and the
// protected text is never handed to another external service.
// ---------------------------------------------------------------------------

import type { ConversationLanguage } from '@eduagent/schemas';
import {
  CORPUS_LANGUAGES,
  LANGUAGE_CORPORA,
  type LanguageCorpus,
  type LexemeScope,
} from './corpus';
import {
  referralPayloadKey,
  type LearningTextReferralPayload,
} from './referral';

/** Who authored the text reaching the persistence boundary. */
export type LearningTextProvenance = 'user' | 'llm' | 'migration';

/** The deterministic lexeme/grammar finding. */
export type LearningTextClassification = 'block' | 'clear' | 'ambiguous';

/** What the caller must do. `refer` is the typed Stage-2 judge seam. */
export type LearningTextDisposition = 'block' | 'clear' | 'refer';

/**
 * Block reason codes — fixed by the ADR-0036 autonomous sequence plan
 * (docs/plans/2026-07-22-…-autonomous-sequence.md §7). Not extended here.
 * The corresponding strict judge allowance is `allow/educational_reference`,
 * which Stage 2 owns.
 */
export type LearningTextBlockReason =
  | 'person_attribution'
  | 'diagnostic_inference'
  | 'unclear';

/**
 * Named field being persisted. Observability records ONLY field kind, reason
 * and count — never the text. Taking it now avoids retrofitting the seam in
 * Stage 3; the list tracks the 8 existing write-time call sites.
 */
export type LearningTextFieldKind =
  | 'mentor_notice_concept'
  | 'mentor_notice_correction_hint'
  | 'evidence_link_context'
  | 'learner_profile_field'
  | 'memory_backfill_mapping'
  | 'memory_dedup_action'
  | 'memory_fact'
  | 'note_text'
  | 'session_analysis_field'
  | 'needs_deepening';

export interface ScanLearningTextInput {
  readonly text: string;
  readonly conversationLanguage: ConversationLanguage;
  readonly provenance: LearningTextProvenance;
  readonly fieldKind: LearningTextFieldKind;
  /**
   * The real vendor that produced LLM-authored text. Required for `refer`:
   * missing producer identity fails closed (§4.6). Ignored for user/migration
   * provenance. Stage 2 passes it to the judge as `judgeIndependence`.
   */
  readonly producerVendor?: string | null;
}

export interface ScanLearningTextResult {
  readonly classification: LearningTextClassification;
  readonly disposition: LearningTextDisposition;
  /** Set iff `disposition === 'block'`. Null otherwise. */
  readonly reason: LearningTextBlockReason | null;
  readonly fieldKind: LearningTextFieldKind;
  /**
   * Number of distinct protected lexemes found. Observability-safe (a count).
   *
   * SCOPE-DEPENDENT, so a Stage-3 log line is not over-read: a `broad` lexeme
   * counts wherever it appears, but an `attributed-only` lexeme counts ONLY when
   * it was found inside a matched attribution span — a bare homograph mention
   * contributes nothing. So this is "protected lexemes that were protected HERE",
   * not "corpus terms present in the text".
   */
  readonly protectedLexemeCount: number;
  /**
   * Confidence of the corpora actually consulted for THIS result — the declared
   * language's corpus AND every corpus that contributed a matched lexeme.
   * 'model-generated' means at least one of them has NOT been native-speaker
   * reviewed, so callers and auditors can see the strength of the control they
   * are relying on. Never reports 'reviewed' on the strength of the declared
   * language alone.
   */
  readonly corpusConfidence: LanguageCorpus['confidence'];
  /**
   * Present ONLY when `disposition === 'refer'`, and set only by
   * `scanLearningText`. Binds the referral to the exact text and validated
   * producer vendor this scan saw, so Stage 2 DERIVES both instead of accepting
   * them as separate parameters that could disagree. Symbol-keyed, so it is
   * absent from `JSON.stringify` / `Object.keys` and cannot leak the text into
   * a log line — Stage 1's "a scan result never carries the scanned text"
   * invariant still holds for every serialization path. Optional in the type,
   * so a hand-built `refer` object still compiles — the judge treats a missing
   * payload as fail-closed rather than trusting the shape.
   */
  readonly [referralPayloadKey]?: LearningTextReferralPayload;
}

// --- regex construction ----------------------------------------------------

// Boundaries are LATIN-SCRIPT-scoped, not `\p{L}`-scoped. A general `\p{L}`
// lookaround treats an adjacent Japanese character as a word character, so
// "生徒はADHDと診断" (a Latin acronym embedded in Japanese prose — exactly the
// cross-language case §4.6 names) would silently NOT match.
const LATIN_LEFT_BOUNDARY = String.raw`(?<![\p{Script=Latin}\p{M}\p{N}])`;
const LATIN_RIGHT_BOUNDARY = String.raw`(?![\p{Script=Latin}\p{M}])`;
const CJK = String.raw`\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}`;
const CJK_RE = new RegExp(`[${CJK}]`, 'u');

function escapeLiteral(literal: string): string {
  return (
    literal
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Internal whitespace is flexible (NFKC leaves ideographic spaces distinct).
      .replace(/ /g, String.raw`\s+`)
      // Straight and curly apostrophes are interchangeable in real prose.
      .replace(/['’]/g, String.raw`['’]`)
  );
}

/**
 * Longest-first so "learning disabilities" wins over a shorter overlap. An
 * empty input yields a never-matching pattern, NOT an empty alternative — the
 * latter would match the empty string at every offset and make every scan
 * report a protected lexeme.
 */
function alternation(literals: readonly string[]): string {
  const unique = [...new Set(literals)].sort((a, b) => b.length - a.length);
  return unique.length === 0 ? '(?!)' : unique.map(escapeLiteral).join('|');
}

// --- lexeme scopes ---------------------------------------------------------

/**
 * How a scope's terms may be detected.
 *
 * `standalone` — matched anywhere in the text, in any language. A match is by
 * itself the "protected lexeme present" signal.
 *
 * `within-attribution` — matched ONLY inside an attribution construction, and
 * only through the grammar of the corpus that declares the term. A bare mention
 * is invisible to the detector, which is what keeps a cross-language homograph
 * ("tea" the drink, "ads", "add") out of the broad path.
 */
type DetectionPolicy = 'standalone' | 'within-attribution';

/**
 * Every lexeme scope, as a value list that CANNOT drift from the union: the
 * `satisfies Record<LexemeScope, true>` makes a missing key a compile error.
 */
const ALL_LEXEME_SCOPES = Object.keys({
  broad: true,
  'attributed-only': true,
} satisfies Record<LexemeScope, true>) as readonly LexemeScope[];

/**
 * The scope → policy assignment. Exhaustive by construction — a newly added
 * `LexemeScope` with no case here fails to compile at the `never` binding, so it
 * can never fall silently outside BOTH detectors (which is exactly how `TEA`,
 * `ADS` and `ADD` became unreachable in the first place: omitted from the corpus
 * outright, and therefore matched by nothing).
 */
function detectionPolicyFor(scope: LexemeScope): DetectionPolicy {
  switch (scope) {
    case 'broad':
      return 'standalone';
    case 'attributed-only':
      return 'within-attribution';
    default: {
      const exhaustive: never = scope;
      throw new Error(`unhandled lexeme scope: ${String(exhaustive)}`);
    }
  }
}

function termsFor(
  corpus: LanguageCorpus,
  policy: DetectionPolicy,
): readonly string[] {
  return ALL_LEXEME_SCOPES.filter(
    (scope) => detectionPolicyFor(scope) === policy,
  ).flatMap((scope) => corpus.lexemes[scope]);
}

function termsAcrossCorpora(policy: DetectionPolicy): readonly string[] {
  return CORPUS_LANGUAGES.flatMap((language) =>
    termsFor(LANGUAGE_CORPORA[language], policy),
  );
}

/**
 * Latin terms need word boundaries; CJK has none, so it is matched bare. Empty
 * partitions contribute no regex at all, so an empty term list yields an empty
 * matcher array rather than a never-matching pattern that still has to be run.
 */
function buildLexemeMatchers(terms: readonly string[]): readonly RegExp[] {
  const latin = terms.filter((term) => !CJK_RE.test(term));
  const cjk = terms.filter((term) => CJK_RE.test(term));
  const matchers: RegExp[] = [];
  if (latin.length) {
    matchers.push(
      new RegExp(
        `${LATIN_LEFT_BOUNDARY}(?:${alternation(latin)})${LATIN_RIGHT_BOUNDARY}`,
        'giu',
      ),
    );
  }
  if (cjk.length) {
    matchers.push(new RegExp(`(?:${alternation(cjk)})`, 'gu'));
  }
  return matchers;
}

const STANDALONE_LEXEMES = termsAcrossCorpora('standalone');
/**
 * Standalone lexeme detection spans ALL ten corpora regardless of the declared
 * language: that is what makes cross-language phrases (an English clinical term
 * embedded in Czech prose) detectable at all. Terms scoped
 * `within-attribution` are deliberately ABSENT here.
 */
const LATIN_LEXEME_ALT = alternation(
  STANDALONE_LEXEMES.filter((l) => !CJK_RE.test(l)),
);
const CJK_LEXEME_ALT = alternation(
  STANDALONE_LEXEMES.filter((l) => CJK_RE.test(l)),
);
const ANY_LEXEME_ALT = `${LATIN_LEXEME_ALT}|${CJK_LEXEME_ALT}`;

const STANDALONE_LEXEME_MATCHERS = buildLexemeMatchers(STANDALONE_LEXEMES);

const CONTRACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bi['’]m\b/giu, 'I am'],
  [/\byou['’]re\b/giu, 'you are'],
  [/\bhe['’]s\b/giu, 'he is'],
  [/\bshe['’]s\b/giu, 'she is'],
  [/\bthey['’]re\b/giu, 'they are'],
];

const STARTS_WITH_UPPERCASE_LETTER = /^\p{Lu}/u;
/**
 * A capture that is nothing but a clinical term. Spans BOTH scopes — an
 * attributed-only acronym ("TEA es …") must not be mistaken for a person name
 * any more than a broad one ("Dyslexia is …") is.
 */
const LEXEME_ONLY_RE = new RegExp(
  `^(?:${ANY_LEXEME_ALT}|${alternation(termsAcrossCorpora('within-attribution'))})$`,
  'iu',
);

interface CompiledGrammar {
  /** Patterns whose match is by itself person-attribution. */
  readonly patterns: readonly RegExp[];
  /** Patterns yielding a `person` group that must look like a name. */
  readonly namedPatterns: readonly RegExp[];
  readonly inferenceRe: RegExp | null;
  /**
   * Matchers for the `within-attribution` terms of the corpora in play. Used
   * ONLY to attribute a lexeme count to a found attribution span — never to
   * detect a lexeme on its own.
   */
  readonly attributedOnlyMatchers: readonly RegExp[];
}

function compileGrammar(declared: ConversationLanguage): CompiledGrammar {
  // Grammar = the declared language PLUS English. English is the near-universal
  // embedding host ("Petr má ADHD", "the learner has dyslexie"), and applying
  // every language's grammar to every text invites cross-language false
  // positives on the hard-fail path.
  const corpora: LanguageCorpus[] =
    declared === 'en'
      ? [LANGUAGE_CORPORA.en]
      : [LANGUAGE_CORPORA[declared], LANGUAGE_CORPORA.en];

  const patterns: RegExp[] = [];
  const namedPatterns: RegExp[] = [];

  for (const corpus of corpora) {
    // THE LEXEME SLOT IS PER-CORPUS, NOT SHARED. Standalone terms from all ten
    // corpora, plus the `within-attribution` terms of THIS corpus only. That
    // language scoping is what keeps the homographs safe: `El alumno tiene TEA`
    // matches through the Spanish grammar, while the English grammar — compiled
    // alongside it for every non-English language — has no `tea` in its slot, so
    // "The learner has tea" cannot match through either. Hoisting this into a
    // single shared alternation would silently reintroduce exactly the
    // cross-language false positives the omission was avoiding.
    const attributedOnly = termsFor(corpus, 'within-attribution');
    const lexeme = attributedOnly.length
      ? `(?:${ANY_LEXEME_ALT}|${alternation(attributedOnly)})`
      : `(?:${ANY_LEXEME_ALT})`;

    const determiner = corpus.determiners.length
      ? `(?:(?:${alternation(corpus.determiners)})\\s+)?`
      : '';
    const hedge = corpus.inferenceMarkers.length
      ? `(?:(?:${alternation(corpus.inferenceMarkers)})\\s+)?`
      : '';
    // A hedge can sit EITHER side of the verb, and either side of the
    // determiner: "may have ADHD" (pre-verb) and "has suspected ADHD" /
    // "has a suspected dyslexia" (post-verb) are all natural. The corpora
    // disagreed on which order they enumerated — `en`/`cs` listed only
    // pre-verb, `es`/`pt`/`pl` only hedge-first, `fr`/`it`/`de`/`nb`
    // hand-enumerated verb+hedge phrases — so post-verb hedges fell through to
    // `refer` in the first four. Every slot is optional, so allowing the hedge
    // in each position only ever ADDS matches; it can never suppress one.
    const postVerb = `${hedge}${determiner}${hedge}`;

    if (corpus.attributionPhrases.length) {
      const phrase = `(?:${alternation(corpus.attributionPhrases)})`;

      if (corpus.personReferences.length) {
        patterns.push(
          new RegExp(
            `${LATIN_LEFT_BOUNDARY}(?:${alternation(corpus.personReferences)})${LATIN_RIGHT_BOUNDARY}\\s+${hedge}${phrase}\\s+${postVerb}${lexeme}${LATIN_RIGHT_BOUNDARY}`,
            'giu',
          ),
        );
      }
      if (corpus.scriptHasCase) {
        namedPatterns.push(
          new RegExp(
            `${LATIN_LEFT_BOUNDARY}(?<person>[\\p{Lu}][\\p{L}\\p{M}'’-]{1,39})${LATIN_RIGHT_BOUNDARY}\\s+${hedge}${phrase}\\s+${postVerb}${lexeme}${LATIN_RIGHT_BOUNDARY}`,
            'giu',
          ),
        );
      }
    }

    if (corpus.possessiveDeterminers.length) {
      patterns.push(
        new RegExp(
          `${LATIN_LEFT_BOUNDARY}(?:${alternation(corpus.possessiveDeterminers)})(?:['’]s)?\\s+${postVerb}${lexeme}${LATIN_RIGHT_BOUNDARY}`,
          'giu',
        ),
      );
    }
    if (corpus.scriptHasCase) {
      namedPatterns.push(
        new RegExp(
          `${LATIN_LEFT_BOUNDARY}(?<person>[\\p{Lu}][\\p{L}\\p{M}'’-]{1,39})['’]s\\s+${postVerb}${lexeme}${LATIN_RIGHT_BOUNDARY}`,
          'giu',
        ),
      );
    }

    // Case-less scripts (ja): structural particle/honorific patterns instead of
    // the meaningless "capitalized token = name" heuristic.
    for (const raw of corpus.rawAttributionPatterns ?? []) {
      const expanded = raw
        .replaceAll('PERSON', `(?:${alternation(corpus.personReferences)})`)
        .replaceAll('LEX', lexeme);
      patterns.push(new RegExp(expanded, 'giu'));
    }
  }

  const markers = corpora.flatMap((corpus) => corpus.inferenceMarkers);
  return {
    patterns,
    namedPatterns,
    inferenceRe: markers.length
      ? new RegExp(`(?:${alternation(markers)})`, 'iu')
      : null,
    attributedOnlyMatchers: buildLexemeMatchers(
      corpora.flatMap((corpus) => termsFor(corpus, 'within-attribution')),
    ),
  };
}

const grammarCache = new Map<ConversationLanguage, CompiledGrammar>();
function grammarFor(language: ConversationLanguage): CompiledGrammar {
  const cached = grammarCache.get(language);
  if (cached) return cached;
  const compiled = compileGrammar(language);
  grammarCache.set(language, compiled);
  return compiled;
}

// --- scanning --------------------------------------------------------------

/**
 * Invisible formatting codepoints, stripped BEFORE NFKC.
 *
 * NFKC does NOT remove these — verified, not assumed: an 'ADHD' with a
 * U+200B between the D and the H does not normalize to 'ADHD'. So a single zero-width space defeated the entire gate for any
 * Latin-script lexeme, which for an Article-9 control over minor learners is a
 * deterministic bypass, not a probabilistic gap.
 *
 * Chosen the `Default_Ignorable_Code_Point` property over an explicit codepoint
 * list: it is the Unicode-maintained definition (so new format characters are
 * covered as the standard evolves) and it already includes every codepoint of
 * concern — U+200B/C/D, U+FEFF, U+00AD, and the variation selectors. The test
 * suite pins that coverage for the five named codepoints, so a runtime whose
 * property data disagrees fails loudly instead of silently reopening the bypass.
 */
const DEFAULT_IGNORABLE_RE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * Normalize for MATCHING ONLY. The normalized string is never returned and
 * never persisted — NFKC folds characters and shifts offsets, so it must not
 * escape this module (mirrors the shipped guard's `valueForMatching` split).
 */
function normalizeForMatching(text: string): string {
  return CONTRACTIONS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text.replace(DEFAULT_IGNORABLE_RE, '').normalize('NFKC'),
    // Collapse whitespace runs to a single space. Unicode-mode `\s` covers the
    // ideographic space (U+3000) too, so full-width-spaced prose matches.
  ).replace(/\s+/gu, ' ');
}

function findLexemes(
  haystack: string,
  matchers: readonly RegExp[],
): ReadonlySet<string> {
  const found = new Set<string>();
  for (const re of matchers) {
    re.lastIndex = 0;
    for (const match of haystack.matchAll(re))
      found.add(match[0].toLowerCase());
  }
  return found;
}

/** Lexemes contributed by a corpus whose `confidence` is 'reviewed', both scopes. */
const REVIEWED_LEXEMES = new Set(
  CORPUS_LANGUAGES.filter(
    (language) => LANGUAGE_CORPORA[language].confidence === 'reviewed',
  ).flatMap((language) =>
    ALL_LEXEME_SCOPES.flatMap((scope) =>
      LANGUAGE_CORPORA[language].lexemes[scope].map((lexeme) =>
        lexeme.toLowerCase(),
      ),
    ),
  ),
);

/**
 * Confidence of the corpora ACTUALLY CONSULTED for this result, not of the
 * declared language alone. Lexeme detection spans all ten corpora, so
 * "Žák má dyslexii" scanned with `conversationLanguage: 'en'` blocks on a
 * `model-generated` Czech lexeme — reporting the declared language's
 * 'reviewed' there would over-claim the strength of the control, which is the
 * exact failure this field exists to prevent.
 */
function resolveCorpusConfidence(
  declared: ConversationLanguage,
  matchedLexemes: ReadonlySet<string>,
): LanguageCorpus['confidence'] {
  if (LANGUAGE_CORPORA[declared].confidence !== 'reviewed') {
    return 'model-generated';
  }
  return [...matchedLexemes].every((lexeme) => REVIEWED_LEXEMES.has(lexeme))
    ? 'reviewed'
    : 'model-generated';
}

/** A `person` capture that is a plausible name, not a bare clinical term. */
function looksLikePersonName(person: string | undefined): boolean {
  return (
    person !== undefined &&
    STARTS_WITH_UPPERCASE_LETTER.test(person) &&
    !LEXEME_ONLY_RE.test(person)
  );
}

function findAttribution(
  normalized: string,
  grammar: CompiledGrammar,
): string | null {
  for (const pattern of grammar.patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalized);
    if (match) return match[0];
  }
  for (const pattern of grammar.namedPatterns) {
    pattern.lastIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
      if (looksLikePersonName(match.groups?.['person'])) return match[0];
    }
  }
  return null;
}

/**
 * The deterministic scan. Pure, synchronous, no I/O, no LLM — every branch is
 * reproducible from the corpus. Never returns or logs the scanned text.
 */
export function scanLearningText(
  input: ScanLearningTextInput,
): ScanLearningTextResult {
  const grammar = grammarFor(input.conversationLanguage);
  const normalized = normalizeForMatching(input.text);
  const standaloneLexemes = findLexemes(normalized, STANDALONE_LEXEME_MATCHERS);
  const attribution = findAttribution(normalized, grammar);
  // An `attributed-only` term counts as a protected lexeme exactly when it sits
  // inside a found attribution span — never on its own. Scanning the span rather
  // than the whole text is what keeps the count honest about WHY the term was
  // protected here.
  const matchedLexemes = new Set([
    ...standaloneLexemes,
    ...(attribution === null
      ? []
      : findLexemes(attribution, grammar.attributedOnlyMatchers)),
  ]);
  const protectedLexemeCount = matchedLexemes.size;

  const base = {
    fieldKind: input.fieldKind,
    protectedLexemeCount,
    corpusConfidence: resolveCorpusConfidence(
      input.conversationLanguage,
      matchedLexemes,
    ),
  } as const;

  // ATTRIBUTION IS DECIDED FIRST, BEFORE the clear short-circuit. Deliberate:
  // an attributed-only lexeme contributes to the count only via the span scan
  // above, so gating the block behind `count > 0` would turn any drift in that
  // derivation into a SILENT bypass — a block quietly becoming `clear` on a
  // child-safety boundary. This order makes such drift surface as a
  // block-with-count-0 instead, which `scan.test.ts` asserts against.
  if (attribution !== null) {
    // A hedge inside the matched span makes this an inference rather than an
    // assertion — both block, with distinguishable reasons.
    const hedged = grammar.inferenceRe?.test(attribution) ?? false;
    return {
      ...base,
      classification: 'block',
      disposition: 'block',
      reason: hedged ? 'diagnostic_inference' : 'person_attribution',
    };
  }

  // No standalone protected lexeme, and no attribution to make an
  // attributed-only term protected → clear. A bare homograph mention ("a cup of
  // tea", "ADS ist ein veralteter Begriff") lands here.
  if (protectedLexemeCount === 0) {
    return {
      ...base,
      classification: 'clear',
      disposition: 'clear',
      reason: null,
    };
  }

  // Protected lexeme, no person attribution → uncertain educational/reference
  // use. Only LLM-authored text with a KNOWN producer may reach the judge.
  // Identical predicate to before, restructured so the validated vendor is a
  // value this function can hand onward rather than a boolean it discards.
  const producerVendor =
    input.provenance === 'llm' && typeof input.producerVendor === 'string'
      ? input.producerVendor.trim()
      : '';

  if (producerVendor.length === 0) {
    return {
      ...base,
      classification: 'ambiguous',
      disposition: 'block',
      reason: 'unclear',
    };
  }

  return {
    ...base,
    classification: 'ambiguous',
    disposition: 'refer',
    reason: null,
    // Binds this referral to the exact text and vendor scanned. Symbol-keyed,
    // so it never appears in a serialized/logged result — see referral.ts for
    // the two P1 misuse shapes this makes unrepresentable.
    [referralPayloadKey]: { text: input.text, producerVendor },
  };
}
