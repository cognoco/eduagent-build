// ---------------------------------------------------------------------------
// [WI-2628] Stage 1 — the deterministic core of the ONE shared multilingual
// persisted-learning-text safety gate (MMT-ADR-0036 §4 item 6; Alternative 10
// explicitly rejects the shipped "English clinical-term regexes at individual
// callers" design that `persisted-learning-text-guard.ts` implements).
//
// This module lands UNWIRED. It changes no call site and no existing behavior.
//   Stage 1 (this PR): deterministic scan + disposition + corpus + tests.
//   Stage 2: attach the independent judge to `disposition === 'refer'`.
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
} from './corpus';

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
  /** Number of distinct protected lexemes found. Observability-safe (a count). */
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

const ALL_LEXEMES = CORPUS_LANGUAGES.flatMap(
  (language) => LANGUAGE_CORPORA[language].lexemes,
);
/**
 * Lexeme detection spans ALL ten corpora regardless of the declared language:
 * that is what makes cross-language phrases (an English clinical term embedded
 * in Czech prose) detectable at all.
 */
const LATIN_LEXEME_ALT = alternation(
  ALL_LEXEMES.filter((l) => !CJK_RE.test(l)),
);
const CJK_LEXEME_ALT = alternation(ALL_LEXEMES.filter((l) => CJK_RE.test(l)));
const ANY_LEXEME_ALT = `${LATIN_LEXEME_ALT}|${CJK_LEXEME_ALT}`;

// Latin terms need word boundaries; CJK has none, so it is matched bare.
const LATIN_LEXEME_RE = new RegExp(
  `${LATIN_LEFT_BOUNDARY}(?:${LATIN_LEXEME_ALT})${LATIN_RIGHT_BOUNDARY}`,
  'giu',
);
const CJK_LEXEME_RE = new RegExp(`(?:${CJK_LEXEME_ALT})`, 'gu');

const CONTRACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bi['’]m\b/giu, 'I am'],
  [/\byou['’]re\b/giu, 'you are'],
  [/\bhe['’]s\b/giu, 'he is'],
  [/\bshe['’]s\b/giu, 'she is'],
  [/\bthey['’]re\b/giu, 'they are'],
];

const STARTS_WITH_UPPERCASE_LETTER = /^\p{Lu}/u;
const LEXEME_ONLY_RE = new RegExp(`^(?:${ANY_LEXEME_ALT})$`, 'iu');

interface CompiledGrammar {
  /** Patterns whose match is by itself person-attribution. */
  readonly patterns: readonly RegExp[];
  /** Patterns yielding a `person` group that must look like a name. */
  readonly namedPatterns: readonly RegExp[];
  readonly inferenceRe: RegExp | null;
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
  const lexeme = `(?:${ANY_LEXEME_ALT})`;

  for (const corpus of corpora) {
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

function findProtectedLexemes(normalized: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (const re of [LATIN_LEXEME_RE, CJK_LEXEME_RE]) {
    re.lastIndex = 0;
    for (const match of normalized.matchAll(re))
      found.add(match[0].toLowerCase());
  }
  return found;
}

/** Lexemes contributed by a corpus whose `confidence` is 'reviewed'. */
const REVIEWED_LEXEMES = new Set(
  CORPUS_LANGUAGES.filter(
    (language) => LANGUAGE_CORPORA[language].confidence === 'reviewed',
  ).flatMap((language) =>
    LANGUAGE_CORPORA[language].lexemes.map((lexeme) => lexeme.toLowerCase()),
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
  const matchedLexemes = findProtectedLexemes(normalized);
  const protectedLexemeCount = matchedLexemes.size;

  const base = {
    fieldKind: input.fieldKind,
    protectedLexemeCount,
    corpusConfidence: resolveCorpusConfidence(
      input.conversationLanguage,
      matchedLexemes,
    ),
  } as const;

  // No protected lexeme anywhere in any of the ten corpora → clear.
  if (protectedLexemeCount === 0) {
    return {
      ...base,
      classification: 'clear',
      disposition: 'clear',
      reason: null,
    };
  }

  const attribution = findAttribution(normalized, grammar);
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

  // Protected lexeme, no person attribution → uncertain educational/reference
  // use. Only LLM-authored text with a KNOWN producer may reach the judge.
  const referable =
    input.provenance === 'llm' &&
    typeof input.producerVendor === 'string' &&
    input.producerVendor.trim().length > 0;

  return {
    ...base,
    classification: 'ambiguous',
    disposition: referable ? 'refer' : 'block',
    reason: referable ? null : 'unclear',
  };
}
