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

/**
 * [WI-2952] Provenance and producer vendor, INSEPARABLE in the type.
 *
 * `ScanLearningTextInput` carries them as two independent fields, so
 * `{provenance:'user', producerVendor:'anthropic'}` and
 * `{provenance:'llm', producerVendor:null}` both compile. On a path whose only
 * job is to keep a producing vendor out of the judge pool that is the wrong
 * shape: the first is a category error (a learner is not a vendor) and the
 * second is the exact fail-closed hole that silently drops learner text.
 *
 * This union makes both unrepresentable. A caller cannot declare `'llm'`
 * without naming who produced it, and cannot attach a vendor to text a human
 * typed.
 *
 * `producerVendor` is the VENDOR (`anthropic`), never the model id
 * (`claude-sonnet-4-6`) — judge exclusion matches vendor names, so a model id
 * excludes nothing and lets the producing vendor grade its own output. The type
 * cannot catch that (both are `string`); only a test asserting the vendor is
 * absent from the RESOLVED judge pool can.
 */
export type LearningTextAuthor =
  | { readonly provenance: 'llm'; readonly producerVendor: string }
  | { readonly provenance: 'user' }
  | { readonly provenance: 'migration' };

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
 * A capture that is nothing but a STANDALONE clinical term ("Dyslexia is a
 * reading difference"). Scope-limited on purpose: adding the `attributed-only`
 * acronyms here globally rejected `Tea`/`Add` as person names in EVERY language
 * and downgraded `Tea has ADHD.` from `block` to `refer` — `Tea` is a real given
 * name (Italian, Croatian, Finnish, Albanian). The acronym case is handled
 * per-set and case-sensitively instead; see `acronymRejectRe`.
 */
const LEXEME_ONLY_RE = new RegExp(`^(?:${ANY_LEXEME_ALT})$`, 'iu');

/**
 * One corpus's attribution constructions, compiled against ONE lexeme slot.
 *
 * Two kinds of set exist, and the split is the whole design:
 *   - a STANDALONE set — the declared language + English, slot = every
 *     standalone lexeme. Identical to the pre-attributed-only behaviour.
 *   - an ATTRIBUTED-ONLY set — one per corpus that declares such terms, slot =
 *     ONLY that corpus's own attributed-only terms, and ALWAYS ACTIVE whatever
 *     the declared language. `El alumno tiene TEA` must block when a learner's
 *     declared language is English too (AC-2's "catches cross-language phrases",
 *     and the symmetry the `cross-language phrases` suite already asserts for
 *     the standalone scope). Independent per-language grammars, NOT a shared
 *     slot: "The learner has tea" still cannot match, because Spanish
 *     attribution phrases do not match English syntax.
 */
interface AttributionPatternSet {
  /** Patterns whose match is by itself person-attribution. */
  readonly patterns: readonly RegExp[];
  /** Patterns yielding a `person` group that must look like a name. */
  readonly namedPatterns: readonly RegExp[];
  /**
   * Patterns yielding BOTH a `person` group that must look like a name AND a
   * `lexeme` group that must be written in the all-caps ACRONYM FORM.
   *
   * Exists for exactly one shape: the English `'s` genitive over an
   * ATTRIBUTED-ONLY slot. `Emma's TEA is documented in the file.` is a person
   * attribution of an Article-9 label about a minor, and it reached NO grammar —
   * the plain genitive below is built for the `en` corpus only (whose
   * attributed-only slot is empty), and the es/de/nb attributed-only sets have no
   * genitive because bolting English possession syntax onto them blocked ordinary
   * prose in all ten declared languages (`Emma's tea went cold.`).
   *
   * The acronym-form requirement on the LEXEME is what threads that needle, and
   * it is PURELY ADDITIVE: `Emma's TEA` blocks, every lowercase genitive stays
   * exactly as it is. Note this is NOT the acronym-form-on-every-attributed-only-
   * match change the previous commit deliberately declined — that one would have
   * REMOVED blocks (`el alumno tiene tea` @es → clear). Scoped to this one new
   * shape, no existing classification changes.
   */
  readonly acronymFormNamedPatterns: readonly RegExp[];
  /**
   * This corpus's attributed-only terms, rejected as a person name ONLY when the
   * capture is written in the all-caps acronym form. `TEA es un trastorno …`
   * (all-caps) is the condition being defined, not a person; `Tea tiene ADHD.`
   * (title case) is a person. Casing is the one deterministic signal that
   * separates them, so both stay correct. Null when the corpus declares none.
   */
  readonly acronymRejectRe: RegExp | null;
  /** Hedge markers of THIS set's corpus — the reason code follows the match. */
  readonly inferenceRe: RegExp | null;
}

interface CompiledGrammar {
  /**
   * Standalone sets for the declared language (+ English) followed by the
   * always-on attributed-only sets. Order is irrelevant to correctness — the
   * first match wins and every match blocks.
   */
  readonly sets: readonly AttributionPatternSet[];
}

/**
 * Which kind of set is being built. The `'s`-genitive decisions below turn on
 * this, not on the corpus alone: the same corpus contributes a standalone set
 * (slot = every standalone lexeme) and, if it declares any, an attributed-only
 * set (slot = its own acronyms), and the two need different genitive handling.
 */
type SetScope = 'standalone' | 'attributed-only';

function buildPatternSet(
  corpus: LanguageCorpus,
  lexemeSlot: string,
  setScope: SetScope,
): AttributionPatternSet {
  const patterns: RegExp[] = [];
  const namedPatterns: RegExp[] = [];
  const acronymFormNamedPatterns: RegExp[] = [];

  {
    const lexeme = lexemeSlot;
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
    // THE `'s` GENITIVE IS ENGLISH SYNTAX, so it is built for the ENGLISH
    // corpus only — not for every cased script. Spanish, German and Norwegian do
    // not form possession this way, and bolting the English genitive onto their
    // attributed-only slot made ordinary English prose block in all ten declared
    // languages once those sets became always-on: `Emma's tea went cold.`,
    // `We discussed Google's ads policy.`, `Anna's add was a small one.`
    // Standalone behaviour is unaffected — English is co-compiled into every
    // non-English grammar, so the genitive still runs everywhere against the
    // broad slot, exactly as before. Gating any WIDER (dropping namedPatterns
    // from the attributed-only sets) would break `Petr tiene TEA.` @es and
    // `Elevens ADD er dokumentert.` @nb, which ride the name and possessive
    // machinery respectively.
    if (corpus.language === 'en' && setScope === 'standalone') {
      namedPatterns.push(
        new RegExp(
          `${LATIN_LEFT_BOUNDARY}(?<person>[\\p{Lu}][\\p{L}\\p{M}'’-]{1,39})['’]s\\s+${postVerb}${lexeme}${LATIN_RIGHT_BOUNDARY}`,
          'giu',
        ),
      );
    }
    // ...and the SAME English genitive over an attributed-only slot, admitted
    // only when the lexeme itself is written in acronym form. Without this the
    // shape reaches no grammar at all (see `acronymFormNamedPatterns`). Built
    // for every cased script, not just `en`, because the host prose is English
    // while the acronym belongs to the es/de/nb corpus — that mismatch is the
    // whole case. `ja` is excluded by `scriptHasCase`: a caseless script has no
    // acronym form to require, and its structural patterns cover attribution.
    if (setScope === 'attributed-only' && corpus.scriptHasCase) {
      acronymFormNamedPatterns.push(
        new RegExp(
          `${LATIN_LEFT_BOUNDARY}(?<person>[\\p{Lu}][\\p{L}\\p{M}'’-]{1,39})['’]s\\s+${postVerb}(?<lexeme>${lexeme})${LATIN_RIGHT_BOUNDARY}`,
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

  const attributedOnly = termsFor(corpus, 'within-attribution');
  return {
    patterns,
    namedPatterns,
    acronymFormNamedPatterns,
    acronymRejectRe: attributedOnly.length
      ? new RegExp(`^(?:${alternation(attributedOnly)})$`, 'iu')
      : null,
    inferenceRe: corpus.inferenceMarkers.length
      ? new RegExp(`(?:${alternation(corpus.inferenceMarkers)})`, 'iu')
      : null,
  };
}

/**
 * ALWAYS-ON, one per declaring corpus. Built once at module load: these do not
 * depend on the declared language, which is the point — an attributed-only term
 * is otherwise reachable by no grammar at all outside its own language, so the
 * ruling's three named strings would classify `clear` in nine of ten declared
 * languages while the standalone path fails closed in all ten.
 */
const ATTRIBUTED_ONLY_SETS: readonly AttributionPatternSet[] =
  CORPUS_LANGUAGES.flatMap((language) => {
    const corpus = LANGUAGE_CORPORA[language];
    const terms = termsFor(corpus, 'within-attribution');
    return terms.length
      ? [
          buildPatternSet(
            corpus,
            `(?:${alternation(terms)})`,
            'attributed-only',
          ),
        ]
      : [];
  });

/** Matchers for EVERY corpus's attributed-only terms — count attribution only. */
const ATTRIBUTED_ONLY_MATCHERS = buildLexemeMatchers(
  termsAcrossCorpora('within-attribution'),
);

function compileGrammar(declared: ConversationLanguage): CompiledGrammar {
  // Standalone grammar = the declared language PLUS English. English is the
  // near-universal embedding host ("Petr má ADHD", "the learner has dyslexie"),
  // and applying every language's grammar to every text invites cross-language
  // false positives on the hard-fail path. The attributed-only sets are exempt
  // from that concern precisely because their slot holds three acronyms rather
  // than every clinical term in ten languages.
  const corpora: LanguageCorpus[] =
    declared === 'en'
      ? [LANGUAGE_CORPORA.en]
      : [LANGUAGE_CORPORA[declared], LANGUAGE_CORPORA.en];

  return {
    sets: [
      ...corpora.map((corpus) =>
        buildPatternSet(corpus, `(?:${ANY_LEXEME_ALT})`, 'standalone'),
      ),
      ...ATTRIBUTED_ONLY_SETS,
    ],
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

/** A capture written entirely in caps — the acronym form, not a name form. */
function isAcronymForm(person: string): boolean {
  // The lowercase comparison keeps a caseless script (which equals its own
  // upper-case form) from trivially satisfying "all caps".
  return person === person.toUpperCase() && person !== person.toLowerCase();
}

/** A `person` capture that is a plausible name, not a bare clinical term. */
function looksLikePersonName(
  person: string | undefined,
  set: AttributionPatternSet,
): boolean {
  if (person === undefined) return false;
  if (!STARTS_WITH_UPPERCASE_LETTER.test(person)) return false;
  if (LEXEME_ONLY_RE.test(person)) return false;
  // Scope-limited AND case-sensitive: reject `TEA` (the Spanish acronym being
  // defined) while accepting `Tea` (a given name in several languages).
  if (
    set.acronymRejectRe !== null &&
    isAcronymForm(person) &&
    set.acronymRejectRe.test(person)
  ) {
    return false;
  }
  return true;
}

interface AttributionMatch {
  readonly span: string;
  /** Hedge markers of the SET that matched — never the declared language's. */
  readonly inferenceRe: RegExp | null;
}

function findAttribution(
  normalized: string,
  grammar: CompiledGrammar,
): AttributionMatch | null {
  for (const set of grammar.sets) {
    for (const pattern of set.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(normalized);
      if (match) return { span: match[0], inferenceRe: set.inferenceRe };
    }
    for (const pattern of set.namedPatterns) {
      pattern.lastIndex = 0;
      for (const match of normalized.matchAll(pattern)) {
        if (looksLikePersonName(match.groups?.['person'], set)) {
          return { span: match[0], inferenceRe: set.inferenceRe };
        }
      }
    }
    // Both halves must hold: a plausible person name AND a lexeme written in
    // acronym form. Requiring the acronym form here rather than compiling the
    // pattern case-sensitively keeps the hedge/determiner slots (which the
    // corpora enumerate in lowercase) case-insensitive, so `Emma's suspected
    // TEA …` still matches while `Emma's tea …` still does not.
    for (const pattern of set.acronymFormNamedPatterns) {
      pattern.lastIndex = 0;
      for (const match of normalized.matchAll(pattern)) {
        const lexeme = match.groups?.['lexeme'];
        if (
          lexeme !== undefined &&
          isAcronymForm(lexeme) &&
          looksLikePersonName(match.groups?.['person'], set)
        ) {
          return { span: match[0], inferenceRe: set.inferenceRe };
        }
      }
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
      : findLexemes(attribution.span, ATTRIBUTED_ONLY_MATCHERS)),
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
    // assertion — both block, with distinguishable reasons. The markers come
    // from the set that MATCHED, not from the declared language: an always-on
    // attributed-only set can match Spanish prose under a declared `en`, whose
    // marker list has no `probablemente`.
    const hedged = attribution.inferenceRe?.test(attribution.span) ?? false;
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
  // use. WHICH provenances may reach the judge is the fail-closed matrix, and
  // the operator amended it on 2026-07-26:
  //
  //   `user`      → REFER (the ruling). Blocking outright made the gate refuse
  //                 educational text the shipped English-only guard allowed
  //                 ("This chapter explains what dyslexia is."), which is a
  //                 learner-capability regression, and it left AC-4's
  //                 `allow/educational_reference` as dead code because no
  //                 production path could reach the seam. Note the ruling moves
  //                 this case to the JUDGE, not to allowed — an unavailable or
  //                 malformed judge still blocks it, in `judge.ts`.
  //   `llm`       → REFER only with a KNOWN producer vendor; a missing/blank one
  //                 still fails closed. Unchanged, and deliberately so: that
  //                 branch exists for a genuinely unknown producer, and the
  //                 vendor must be excluded from judge selection or the
  //                 producing model can bless its own output.
  //   `migration` → BLOCK. Unchanged. Backfill text has no live author to
  //                 attribute it to and no learner waiting on the write, so
  //                 there is nothing to trade for the risk.
  //
  // Person attribution never arrives here at all — it returned above, for every
  // provenance and all ten languages.
  const referral = resolveReferralPayload(input);
  if (referral === null) {
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
    // Binds this referral to the exact text scanned, and to the vendor when
    // there is one. Symbol-keyed, so it never appears in a serialized/logged
    // result — see referral.ts for the misuse shapes this makes unrepresentable.
    [referralPayloadKey]: referral,
  };
}

/**
 * The referral payload for an ambiguous scan, or null when this provenance must
 * fail closed instead. Split out so the provenance matrix is one expression with
 * an exhaustive switch: a future `LearningTextProvenance` member cannot fall
 * silently into either the refer or the block branch.
 */
function resolveReferralPayload(
  input: ScanLearningTextInput,
): LearningTextReferralPayload | null {
  switch (input.provenance) {
    case 'user':
      // No vendor field exists on this variant — a learner is not a vendor, and
      // the judge declares `not-applicable` independence for it.
      return { origin: 'user', text: input.text };
    case 'llm': {
      const producerVendor =
        typeof input.producerVendor === 'string'
          ? input.producerVendor.trim()
          : '';
      return producerVendor.length === 0
        ? null
        : { origin: 'llm', text: input.text, producerVendor };
    }
    case 'migration':
      return null;
    default: {
      const exhaustive: never = input.provenance;
      throw new Error(`unhandled provenance: ${String(exhaustive)}`);
    }
  }
}
