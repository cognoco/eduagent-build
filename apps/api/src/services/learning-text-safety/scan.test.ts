// [WI-2628] Stage 1 tests for the shared multilingual persisted-learning-text
// gate. Table-driven: ten supported Conversation Languages x three
// classification outcomes, cross-language phrases, NFKC/script variation, the
// deterministic fail-closed provenance matrix, and the named false-positive
// control from the live probe battery.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConversationLanguage } from '@eduagent/schemas';
import { scrubClinicalInferenceFromLearningRecord } from '../persisted-learning-text-guard';
import { LANGUAGE_CORPORA } from './corpus';
import { scanLearningText } from './scan';

/** LLM provenance with a known vendor — the only combination that can `refer`. */
function scanAsLlm(text: string, conversationLanguage: ConversationLanguage) {
  return scanLearningText({
    text,
    conversationLanguage,
    provenance: 'llm',
    fieldKind: 'memory_fact',
    producerVendor: 'anthropic',
  });
}

interface LanguageRow {
  readonly language: ConversationLanguage;
  /** Generic person reference + clinical attribution. */
  readonly blockGeneric: string;
  /** Capitalized/honorific-marked personal name + clinical attribution. */
  readonly blockNamed: string;
  /** Protected lexeme in educational/reference prose, no person attribution. */
  readonly ambiguous: string;
  /** No protected lexeme in any of the ten corpora. */
  readonly clear: string;
}

const LANGUAGE_ROWS: readonly LanguageRow[] = [
  {
    language: 'en',
    blockGeneric: 'The learner has ADHD.',
    blockNamed: 'Petr has dyslexia.',
    ambiguous: 'This chapter explains what dyslexia is.',
    clear: 'Photosynthesis converts light into chemical energy.',
  },
  {
    language: 'cs',
    blockGeneric: 'Žák má ADHD.',
    blockNamed: 'Petr má dyslexii a potřebuje pomoc.',
    ambiguous: 'Tato kapitola vysvětluje, co je dyslexie.',
    clear: 'Fotosyntéza mění světlo na chemickou energii.',
  },
  {
    language: 'es',
    blockGeneric: 'El alumno tiene TDAH.',
    blockNamed: 'Petr tiene dislexia.',
    ambiguous: 'Este capítulo explica qué es la dislexia.',
    clear: 'La fotosíntesis convierte la luz en energía química.',
  },
  {
    language: 'fr',
    blockGeneric: "L'élève a un TDAH.",
    blockNamed: 'Petr a une dyslexie.',
    ambiguous: "Ce chapitre explique ce qu'est la dyslexie.",
    clear: 'La photosynthèse transforme la lumière en énergie chimique.',
  },
  {
    language: 'de',
    blockGeneric: 'Der Schüler hat ADHS.',
    blockNamed: 'Petr hat Legasthenie.',
    ambiguous: 'Dieses Kapitel erklärt, was Legasthenie bedeutet.',
    clear: 'Photosynthese wandelt Licht in chemische Energie um.',
  },
  {
    language: 'it',
    blockGeneric: 'Lo studente ha ADHD.',
    blockNamed: 'Petr ha dislessia.',
    ambiguous: 'Questo capitolo spiega che cosa significa dislessia.',
    clear: 'La fotosintesi converte la luce in energia chimica.',
  },
  {
    language: 'pt',
    blockGeneric: 'O aluno tem TDAH.',
    blockNamed: 'Petr tem dislexia.',
    ambiguous: 'Este capítulo explica o que significa dislexia.',
    clear: 'A fotossíntese converte luz em energia química.',
  },
  {
    language: 'pl',
    blockGeneric: 'Uczeń ma ADHD.',
    blockNamed: 'Petr ma dysleksję.',
    ambiguous: 'Ten rozdział wyjaśnia, czym jest dysleksja.',
    clear: 'Fotosynteza zamienia światło w energię chemiczną.',
  },
  {
    language: 'ja',
    blockGeneric: '生徒はADHDと診断されました。',
    blockNamed: '田中さんは自閉症です。',
    ambiguous: 'この章では失読症について説明します。',
    clear: '光合成は光を化学エネルギーに変えます。',
  },
  {
    language: 'nb',
    blockGeneric: 'Eleven har ADHD.',
    blockNamed: 'Petr har dysleksi.',
    ambiguous: 'Dette kapittelet forklarer hva dysleksi betyr.',
    clear: 'Fotosyntese omdanner lys til kjemisk energi.',
  },
];

describe('[WI-2628] scanLearningText — ten-language corpus', () => {
  it('covers every supported Conversation Language', () => {
    expect(LANGUAGE_ROWS.map((row) => row.language).sort()).toEqual(
      Object.keys(LANGUAGE_CORPORA).sort(),
    );
  });

  describe.each(LANGUAGE_ROWS)(
    '$language',
    ({ language, blockGeneric, blockNamed, ambiguous, clear }) => {
      it('blocks a generic person reference attributed a clinical label', () => {
        const result = scanAsLlm(blockGeneric, language);
        expect(result.classification).toBe('block');
        // Guaranteed property: a block is never referable to the judge, whatever
        // the provenance — the deterministic path decided it.
        expect(result.disposition).toBe('block');
        expect(result.reason).not.toBeNull();
      });

      it('blocks a named person attributed a clinical label', () => {
        const result = scanAsLlm(blockNamed, language);
        expect(result.classification).toBe('block');
        expect(result.disposition).toBe('block');
      });

      it('classifies unattributed educational reference as ambiguous, not block', () => {
        const result = scanAsLlm(ambiguous, language);
        expect(result.classification).toBe('ambiguous');
        expect(result.protectedLexemeCount).toBeGreaterThan(0);
        // Ambiguous LLM text with a known producer is the ONLY path to the judge.
        expect(result.disposition).toBe('refer');
        expect(result.reason).toBeNull();
      });

      it('classifies text with no protected lexeme as clear', () => {
        const result = scanAsLlm(clear, language);
        expect(result.classification).toBe('clear');
        expect(result.disposition).toBe('clear');
        expect(result.protectedLexemeCount).toBe(0);
        expect(result.reason).toBeNull();
      });
    },
  );
});

describe('[WI-2628] cross-language phrases', () => {
  const CROSS_LANGUAGE: ReadonlyArray<{
    readonly name: string;
    readonly text: string;
    readonly language: ConversationLanguage;
  }> = [
    {
      name: 'English clinical term inside Czech prose',
      text: 'Žák má autism a potřebuje podporu.',
      language: 'cs',
    },
    {
      name: 'Czech clinical term inside English prose',
      text: 'The learner has dyslexie.',
      language: 'en',
    },
    {
      name: 'Japanese clinical term inside English prose',
      text: 'The learner has 自閉症.',
      language: 'en',
    },
    {
      name: 'English clinical acronym inside Japanese prose',
      text: '生徒はADHDです。',
      language: 'ja',
    },
    {
      name: 'German clinical term inside Norwegian prose',
      text: 'Eleven har Legasthenie.',
      language: 'nb',
    },
  ];

  it.each(CROSS_LANGUAGE)('blocks: $name', ({ text, language }) => {
    const result = scanAsLlm(text, language);
    expect(result.classification).toBe('block');
    expect(result.disposition).toBe('block');
  });
});

describe('[WI-2628] NFKC normalization and Japanese script variation', () => {
  it('blocks a full-width Latin acronym (NFKC folds ＡＤＨＤ to ADHD)', () => {
    // Without NFKC the full-width codepoints never match the corpus entry.
    expect('ＡＤＨＤ'.normalize('NFKC')).toBe('ADHD');
    const result = scanAsLlm('The learner has ＡＤＨＤ.', 'en');
    expect(result.classification).toBe('block');
  });

  it('blocks a half-width katakana term (NFKC folds ｱｽﾍﾟﾙｶﾞｰ to アスペルガー)', () => {
    expect('ｱｽﾍﾟﾙｶﾞｰ'.normalize('NFKC')).toBe('アスペルガー');
    const result = scanAsLlm('田中さんはｱｽﾍﾟﾙｶﾞｰ症候群です。', 'ja');
    expect(result.classification).toBe('block');
  });

  it('detects the same Japanese condition across kanji, katakana and romaji forms', () => {
    for (const text of [
      '生徒は失読症です。',
      '生徒はディスレクシアです。',
      '生徒はdyslexiaです。',
    ]) {
      expect(scanAsLlm(text, 'ja').classification).toBe('block');
    }
  });

  it('never returns or leaks the normalized string', () => {
    const result = scanAsLlm('生徒はＡＤＨＤです。', 'ja');
    expect(Object.values(result)).not.toContain('ADHD');
  });
});

describe('[WI-2628] invisible-codepoint evasion', () => {
  // NFKC does not remove default-ignorable format characters, so before the
  // strip a single zero-width space made any Latin-script lexeme invisible to
  // the gate. These fail without the strip in normalizeForMatching.
  const ZWSP = '​';
  const ZWNJ = '‌';
  const ZWJ = '‍';
  const BOM = '﻿';
  const SOFT_HYPHEN = '­';

  it('confirms NFKC alone does NOT strip these codepoints', () => {
    // The premise of the fix. If this ever becomes true, the strip is redundant
    // — but it is false today, which is exactly why the bypass existed.
    expect(`AD${ZWSP}HD`.normalize('NFKC')).not.toBe('ADHD');
  });

  it('pins Default_Ignorable_Code_Point coverage for every codepoint relied on', () => {
    // The implementation uses the Unicode property rather than an explicit
    // list. A runtime whose property data omits any of these would silently
    // reopen the bypass, so assert the coverage instead of trusting it.
    for (const cp of [ZWSP, ZWNJ, ZWJ, BOM, SOFT_HYPHEN]) {
      expect(/\p{Default_Ignorable_Code_Point}/u.test(cp)).toBe(true);
    }
  });

  it.each([
    ['zero-width space', ZWSP],
    ['zero-width non-joiner', ZWNJ],
    ['zero-width joiner', ZWJ],
    ['byte-order mark', BOM],
    ['soft hyphen', SOFT_HYPHEN],
  ])(
    'blocks person attribution with a %s inside the clinical lexeme',
    (_name, invisible) => {
      const result = scanAsLlm(`The learner has AD${invisible}HD.`, 'en');
      expect(result.classification).toBe('block');
      expect(result.disposition).toBe('block');
      expect(result.reason).toBe('person_attribution');
    },
  );

  it('blocks the cross-language case with an invisible codepoint inside the lexeme', () => {
    // English acronym in Japanese prose, split by a zero-width space.
    const result = scanAsLlm(`生徒はAD${ZWSP}HDと診断されました。`, 'ja');
    expect(result.classification).toBe('block');
    expect(result.disposition).toBe('block');
  });

  it('still reports clear for genuinely clean text containing an invisible codepoint', () => {
    const result = scanAsLlm(`Photosynthesis${ZWSP} converts light.`, 'en');
    expect(result.classification).toBe('clear');
    expect(result.protectedLexemeCount).toBe(0);
  });
});

describe('[WI-2628] hedge word order', () => {
  // A post-verb hedge previously downgraded person-attributed clinical text
  // from `block` to `refer`, because the corpora disagreed on which order they
  // enumerated: en/cs listed only pre-verb hedges, es/pt/pl only hedge-first,
  // while fr/it/de/nb hand-enumerated verb+hedge phrases and so escaped it.
  //
  // In English this was a REGRESSION against the shipped guard, whose
  // ATTRIBUTION_MODIFIER already blocks post-verb hedges deterministically —
  // asserted directly below, so the two controls can never silently diverge.
  const POST_VERB_HEDGE: ReadonlyArray<
    [name: string, text: string, language: ConversationLanguage]
  > = [
    ['en post-verb "suspected"', 'The learner has suspected ADHD', 'en'],
    ['en post-verb "possibly"', 'the student is possibly autistic', 'en'],
    ['en post-verb "probably"', 'user has probably ADHD', 'en'],
    ['cs post-verb hedge', 'Žák má pravděpodobně dyslexii', 'cs'],
    ['es post-verb hedge', 'El alumno tiene probablemente dislexia', 'es'],
    ['pt post-verb hedge', 'O aluno tem provavelmente dislexia', 'pt'],
    ['pl post-verb hedge', 'Uczeń ma prawdopodobnie dysleksję', 'pl'],
  ];

  it.each(POST_VERB_HEDGE)('blocks %s', (_name, text, language) => {
    const result = scanAsLlm(text, language);
    expect(result.classification).toBe('block');
    expect(result.disposition).toBe('block');
    // The hedge falls inside the matched span, so this is an inference, not a
    // bare assertion. Expected reason is diagnostic_inference.
    expect(result.reason).toBe('diagnostic_inference');
  });

  it.each([
    ['The learner has suspected ADHD'],
    ['the student is possibly autistic'],
    ['user has probably ADHD'],
  ])(
    'never refers what the shipped English guard already blocks: %s',
    (text) => {
      // Guards against re-introducing the regression: the shipped guard drops
      // these deterministically, so the replacement must block them too — a
      // judge referral here would weaken a working Article-9 control.
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
      expect(scanAsLlm(text, 'en').disposition).toBe('block');
    },
  );

  it('blocks a hedge on either side of the determiner', () => {
    // Chose to permit the hedge in both post-verb positions rather than only
    // immediately after the verb. Both slots are optional, so this only adds
    // matches. The shipped guard misses the determiner-first order, so this is
    // strictly better coverage, not a regression fix.
    for (const text of [
      'The learner has probably a dyslexia',
      'The learner has a suspected dyslexia',
    ]) {
      expect(scanAsLlm(text, 'en').classification).toBe('block');
    }
  });

  it('blocks a hedged possessive attribution', () => {
    const result = scanAsLlm("The learner's suspected ADHD", 'en');
    expect(result.classification).toBe('block');
    expect(result.reason).toBe('diagnostic_inference');
  });

  it.each([
    ['fr', 'Petr a probablement une dyslexie'],
    ['de', 'Petr hat wahrscheinlich Legasthenie'],
    ['it', 'Petr ha probabilmente dislessia'],
    ['nb', 'Petr har sannsynligvis dysleksi'],
  ])(
    'keeps blocking %s, which already worked via hand-enumerated verb+hedge phrases',
    (language, text) => {
      expect(
        scanAsLlm(text, language as ConversationLanguage).classification,
      ).toBe('block');
    },
  );
});

describe('[WI-2628] hyphenated compound lexemes', () => {
  it('blocks the hyphenated "learning-disability" form', () => {
    const result = scanAsLlm(
      'The learner has a learning-disability diagnosis.',
      'en',
    );
    expect(result.classification).toBe('block');
    expect(result.reason).toBe('person_attribution');
  });

  it('treats the hyphenated and space-separated forms identically', () => {
    for (const text of [
      'The learner has a learning disability diagnosis.',
      'The learner has a learning-disability diagnosis.',
    ]) {
      expect(scanAsLlm(text, 'en').classification).toBe('block');
    }
  });
});

describe('[WI-2628] deterministic fail-closed provenance matrix (ADR-0036 §4.6)', () => {
  const AMBIGUOUS_TEXT = 'This chapter explains what dyslexia is.';

  it('refers LLM-authored ambiguity with a known producer vendor', () => {
    const result = scanLearningText({
      text: AMBIGUOUS_TEXT,
      conversationLanguage: 'en',
      provenance: 'llm',
      fieldKind: 'note_text',
      producerVendor: 'anthropic',
    });
    expect(result.disposition).toBe('refer');
    expect(result.reason).toBeNull();
  });

  it.each([
    ['user-authored ambiguity', 'user' as const, 'anthropic'],
    ['migration/backfill ambiguity', 'migration' as const, 'anthropic'],
    ['LLM ambiguity with a missing producer', 'llm' as const, undefined],
    ['LLM ambiguity with a null producer', 'llm' as const, null],
    ['LLM ambiguity with a blank producer', 'llm' as const, '   '],
  ])('fails closed on %s', (_name, provenance, producerVendor) => {
    const result = scanLearningText({
      text: AMBIGUOUS_TEXT,
      conversationLanguage: 'en',
      provenance,
      fieldKind: 'note_text',
      producerVendor,
    });
    expect(result.classification).toBe('ambiguous');
    expect(result.disposition).toBe('block');
    expect(result.reason).toBe('unclear');
  });

  it('clear text is never blocked by provenance', () => {
    for (const provenance of ['user', 'llm', 'migration'] as const) {
      const result = scanLearningText({
        text: 'Photosynthesis converts light into chemical energy.',
        conversationLanguage: 'en',
        provenance,
        fieldKind: 'note_text',
      });
      expect(result.disposition).toBe('clear');
    }
  });
});

describe('[WI-2628] block reason codes', () => {
  it('reports person_attribution for an asserted attribution', () => {
    expect(scanAsLlm('The learner has ADHD.', 'en').reason).toBe(
      'person_attribution',
    );
  });

  it('reports diagnostic_inference for a hedged attribution', () => {
    for (const text of [
      'The learner may have ADHD.',
      'The learner probably has dyslexia.',
      'The learner shows signs of dyscalculia.',
    ]) {
      expect(scanAsLlm(text, 'en').reason).toBe('diagnostic_inference');
    }
  });

  it('reports unclear only for fail-closed ambiguity', () => {
    const result = scanLearningText({
      text: 'This chapter explains what dyslexia is.',
      conversationLanguage: 'en',
      provenance: 'user',
      fieldKind: 'note_text',
    });
    expect(result.reason).toBe('unclear');
  });
});

describe('[WI-2628] false-positive controls', () => {
  // Named case: apps/api/eval-llm/fixtures/probes/battery.ts carries this
  // legitimate personalization language. The guaranteed property is that the
  // deterministic core never classifies it as `block` — an over-broad corpus
  // would hard-fail real personalization copy with no judge appeal.
  const BATTERY_FIXTURE_TEXT =
    'Personalization matrix: age 11, ADHD-style short-burst support, serious study, returning learner.';

  it('does not block the battery.ts "ADHD-style support" personalization probe', () => {
    const result = scanAsLlm(BATTERY_FIXTURE_TEXT, 'en');
    expect(result.classification).not.toBe('block');
    expect(result.classification).toBe('ambiguous');
  });

  // THE PERSON-NAME RULE, IN THREE PARTS. A blanket "any clinical term is never
  // a person name" is WRONG and was a measured regression: it rejected `Tea` and
  // `Add` as person names in every language and downgraded `Tea has ADHD.` from
  // `block` to `refer`. The rule is scope-limited and, for the attributed-only
  // acronyms, case-sensitive. All three parts below must hold together.
  it('does not treat a bare STANDALONE clinical term as a person name', () => {
    // "Dyslexia is a reading difference" — capitalized lexeme, not a person.
    const result = scanAsLlm('Dyslexia is a reading difference.', 'en');
    expect(result.classification).not.toBe('block');
  });

  it('does not treat an all-caps attributed-only ACRONYM as a person name', () => {
    // `TEA` is the condition being defined here, not someone called Tea. Without
    // the acronym rejection this matches a named pattern with person="TEA" and
    // hard-blocks a definitional sentence with no judge appeal.
    const result = scanAsLlm('TEA es un trastorno del espectro autista.', 'es');
    expect(result.classification).not.toBe('block');
    expect(result.classification).toBe('ambiguous');
  });

  it('DOES treat a title-case homograph of an acronym as a person name', () => {
    // `Tea` is a real given name (Italian, Croatian, Finnish, Albanian), so a
    // clinical attribution to it is known-person attribution under AC-3 and must
    // block deterministically — in Spanish too, where TEA is also the acronym.
    for (const [text, language] of [
      ['Tea has ADHD.', 'en'],
      ['Add has dyslexia.', 'en'],
      ['Tea ha ADHD.', 'it'],
      ['Tea tiene ADHD.', 'es'],
    ] as ReadonlyArray<[string, ConversationLanguage]>) {
      const result = scanAsLlm(text, language);
      expect(result.classification).toBe('block');
      expect(result.disposition).toBe('block');
      expect(result.reason).toBe('person_attribution');
    }
  });

  it('keeps the person-name block on user provenance, with the right reason', () => {
    // Not just "still blocks": the reason code must stay `person_attribution`.
    // The widening downgraded this to the fail-closed `unclear`, which reports a
    // different finding for the same text.
    const result = scanLearningText({
      text: 'Tea has ADHD.',
      conversationLanguage: 'en',
      provenance: 'user',
      fieldKind: 'note_text',
    });
    expect(result.disposition).toBe('block');
    expect(result.reason).toBe('person_attribution');
  });

  it('keeps ordinary subject matter clear across all ten languages', () => {
    for (const row of LANGUAGE_ROWS) {
      expect(scanAsLlm(row.clear, row.language).classification).toBe('clear');
    }
  });
});

describe('[WI-2628] corpus confidence is surfaced, not asserted away', () => {
  it('marks English reviewed and every other language model-generated', () => {
    expect(scanAsLlm('hello', 'en').corpusConfidence).toBe('reviewed');
    for (const row of LANGUAGE_ROWS.filter((r) => r.language !== 'en')) {
      expect(scanAsLlm('hello', row.language).corpusConfidence).toBe(
        'model-generated',
      );
    }
  });

  it('reports reviewed when the match came from the reviewed English corpus', () => {
    const result = scanAsLlm('The learner has ADHD.', 'en');
    expect(result.classification).toBe('block');
    expect(result.corpusConfidence).toBe('reviewed');
  });

  it('does NOT report reviewed when a model-generated lexeme drove the match', () => {
    // Declared language is English (reviewed corpus), but the blocking lexeme
    // "dyslexii" comes only from the model-generated Czech corpus. Reporting
    // 'reviewed' here would over-claim the strength of the control.
    const result = scanAsLlm('Žák má dyslexii a potřebuje pomoc.', 'en');
    expect(result.protectedLexemeCount).toBeGreaterThan(0);
    expect(result.corpusConfidence).toBe('model-generated');
  });
});

describe('[WI-2628] regression: the shipped English-only guard is the bug', () => {
  // Red/green evidence for the Type=Bug root cause. The SHIPPED guard
  // (persisted-learning-text-guard.ts) returns the text UNCHANGED — i.e. it
  // would be persisted — for non-English person-attributed clinical text, while
  // blocking the English equivalent. The new gate blocks all of them.
  const NON_ENGLISH_ATTRIBUTIONS: ReadonlyArray<
    [name: string, text: string, language: ConversationLanguage]
  > = [
    ['Czech named attribution', 'Petr má dyslexii a potřebuje pomoc.', 'cs'],
    ['Czech generic attribution', 'Žák má ADHD.', 'cs'],
    ['Japanese named attribution', '田中さんは自閉症です。', 'ja'],
    ['Japanese full-width acronym', '生徒はＡＤＨＤと診断されました。', 'ja'],
  ];

  it('English control: the shipped guard already blocks English attribution', () => {
    expect(
      scrubClinicalInferenceFromLearningRecord('Petr has dyslexia.'),
    ).toBeNull();
  });

  it.each(NON_ENGLISH_ATTRIBUTIONS)(
    'RED — shipped guard would persist %s',
    (_name, text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBe(text);
    },
  );

  it.each(NON_ENGLISH_ATTRIBUTIONS)(
    'GREEN — new gate blocks %s',
    (_name, text, language) => {
      const result = scanAsLlm(text, language);
      expect(result.classification).toBe('block');
      expect(result.disposition).toBe('block');
    },
  );
});

describe('[WI-2628] attributed-only lexeme scope', () => {
  // THE DEFECT THIS CLOSES (Stage-3 reachability ruling, 2026-07-26). Spanish
  // TEA, German ADS and Norwegian ADD were omitted from the corpus outright to
  // avoid colliding with the English words "tea", "ads" and "add". Because the
  // gate reaches attribution analysis only AFTER a protected-lexeme match, the
  // attributed forms classified `clear` and were unreachable by any judge-side
  // change. They now live in an `attributed-only` scope: matched only inside an
  // attribution construction, and only through the grammar of the language that
  // declares them.
  //
  // BOTH DIRECTIONS ARE THE FIX. Making direction 1 (attributed → block) pass
  // while breaking direction 2 (bare mention / homograph → clear) is a
  // regression, not a fix — it is the exact false-positive class the original
  // omission was avoiding. The paired rows below share a language and a lexeme
  // and differ ONLY in attribution, which is what makes them a non-triviality
  // control: an always-block implementation fails every mention row.

  /**
   * FIXTURE GUARD — the exact partition, not a subset. Asserting the whole map
   * fails loudly on an addition, a removal, OR a term migrating between scopes,
   * so a drifting corpus can never leave these tests quietly exercising the
   * broad path instead of the attributed-only one.
   */
  const EXPECTED_ATTRIBUTED_ONLY: Readonly<
    Record<ConversationLanguage, readonly string[]>
  > = {
    en: [],
    cs: [],
    es: ['tea'],
    fr: [],
    de: ['ads'],
    it: [],
    pt: [],
    pl: [],
    ja: [],
    nb: ['add'],
  };

  it('pins the attributed-only partition of every corpus exactly', () => {
    const actual = Object.fromEntries(
      Object.entries(LANGUAGE_CORPORA).map(([language, corpus]) => [
        language,
        corpus.lexemes['attributed-only'],
      ]),
    );
    expect(actual).toEqual(EXPECTED_ATTRIBUTED_ONLY);
  });

  it('keeps every attributed-only term out of EVERY language broad set', () => {
    // The cheap wrong fix is adding these to the broad cross-language detector.
    // If anyone does, "a cup of tea" starts blocking — so assert the absence
    // structurally rather than trusting a code comment.
    const broad = new Set(
      Object.values(LANGUAGE_CORPORA).flatMap((corpus) =>
        corpus.lexemes.broad.map((lexeme) => lexeme.toLowerCase()),
      ),
    );
    const attributedOnly = Object.values(LANGUAGE_CORPORA).flatMap((corpus) =>
      corpus.lexemes['attributed-only'].map((lexeme) => lexeme.toLowerCase()),
    );
    expect(attributedOnly.length).toBeGreaterThan(0);
    expect(attributedOnly.filter((lexeme) => broad.has(lexeme))).toEqual([]);
  });

  it('declares no attributed-only term for English, the homograph host', () => {
    // English grammar is co-compiled for every non-English language, so an
    // English-scoped entry here would reintroduce the leak this design prevents.
    expect(LANGUAGE_CORPORA.en.lexemes['attributed-only']).toEqual([]);
  });

  interface ScopePair {
    readonly language: ConversationLanguage;
    readonly term: string;
    /** Direction 1 — person-attributed use via personReference + verb. Must block. */
    readonly attributed: string;
    /**
     * Direction 1 via the OTHER attribution shape — a possessive determiner with
     * no verb at all ("attribution without a verb", per the corpus). The
     * per-corpus lexeme slot feeds every attribution pattern, so each shape that
     * AC-3's "known-person attribution" covers is asserted at its own layer
     * rather than inferred from the verb form passing.
     */
    readonly possessive: string;
    /**
     * Direction 1 via the ENGLISH `'s` genitive — a real person's name plus the
     * acronym. Reached NO grammar before this row existed: the plain genitive is
     * built for the `en` corpus (whose attributed-only slot is empty) and the
     * es/de/nb attributed-only sets had no genitive at all, because bolting
     * English possession syntax onto them blocked ordinary prose in all ten
     * declared languages. It is admitted now only when the LEXEME is written in
     * acronym form, which is purely additive — every lowercase genitive in
     * `MUST_STAY_CLEAR` stays clear. Distinct from the acronym-form-on-every-
     * attributed-only-match change the corpus commit deliberately declined:
     * that one would have REMOVED blocks.
     */
    readonly genitive: string;
    /** Direction 2 — the same term merely mentioned. Must stay clear. */
    readonly mention: string;
  }

  const SCOPE_PAIRS: readonly ScopePair[] = [
    {
      language: 'es',
      term: 'TEA',
      attributed: 'El alumno tiene TEA.',
      genitive: "Emma's TEA is documented in the file.",
      possessive: 'Su TEA requiere apoyo adicional.',
      mention: 'TEA es un término diagnóstico usado en informes.',
    },
    {
      language: 'de',
      term: 'ADS',
      attributed: 'Der Schüler hat ADS.',
      genitive: "Emma's ADS ist dokumentiert.",
      possessive: 'Seine ADS ist dokumentiert.',
      mention: 'ADS ist ein veralteter Begriff aus der Fachliteratur.',
    },
    {
      language: 'nb',
      term: 'ADD',
      attributed: 'Eleven har ADD.',
      genitive: "Emma's ADD er dokumentert.",
      possessive: 'Elevens ADD er dokumentert.',
      mention: 'ADD ble tidligere brukt som begrep i faglitteraturen.',
    },
  ];

  it('covers every language that declares an attributed-only term', () => {
    const declaring = Object.entries(EXPECTED_ATTRIBUTED_ONLY)
      .filter(([, terms]) => terms.length > 0)
      .map(([language]) => language)
      .sort();
    expect(SCOPE_PAIRS.map((pair) => pair.language).sort()).toEqual(declaring);
  });

  describe.each(SCOPE_PAIRS)(
    '$language $term',
    ({ language, attributed, possessive, mention }) => {
      it('blocks the possessive attribution, which carries no verb', () => {
        const result = scanAsLlm(possessive, language);
        expect(result.classification).toBe('block');
        expect(result.disposition).toBe('block');
        expect(result.reason).toBe('person_attribution');
        expect(result.protectedLexemeCount).toBeGreaterThan(0);
      });

      it('blocks the person-attributed use', () => {
        const result = scanAsLlm(attributed, language);
        expect(result.classification).toBe('block');
        // Guaranteed property: attribution is decided deterministically, so the
        // text is never handed to the judge and never persisted.
        expect(result.disposition).toBe('block');
        expect(result.reason).toBe('person_attribution');
        // The attributed term IS a protected lexeme in this context.
        expect(result.protectedLexemeCount).toBeGreaterThan(0);
      });

      it('keeps the bare mention clear', () => {
        const result = scanAsLlm(mention, language);
        expect(result.classification).toBe('clear');
        expect(result.disposition).toBe('clear');
        // Asserting the count pins that this took the no-lexeme path, rather
        // than passing by accident through some other broad term in the
        // sentence.
        expect(result.protectedLexemeCount).toBe(0);
      });
    },
  );

  it.each([
    ['tea the drink', 'I have tea with breakfast every morning.'],
    ['tea attributed to a learner', 'The learner has tea.'],
    ['ads as ordinary English', 'The user has ads blocked in the browser.'],
    ['add as an ordinary verb', 'You can add two numbers to get a sum.'],
    ['add attributed to a learner', 'The student has add.'],
  ])('keeps the English homograph clear: %s', (_name, text) => {
    const result = scanAsLlm(text, 'en');
    expect(result.classification).toBe('clear');
    expect(result.protectedLexemeCount).toBe(0);
  });

  it.each([
    ['es', 'tea', 'The learner has tea.'],
    ['de', 'ads', 'The learner has ads.'],
    // `student` IS an nb personReference, so this stays clear only because
    // `has` is not an nb attribution phrase — the adversarial case that catches
    // a future corpus edit widening either list.
    ['nb', 'add', 'The student has add.'],
  ])(
    'does not leak the %s attributed-only term "%s" into the co-compiled English grammar',
    (language, _term, text) => {
      // THE DISCRIMINATING TEST. A shared lexeme slot — attributed-only terms of
      // every corpus in play folded into one alternation — passes every other
      // assertion in this file while blocking this English sentence. The slot is
      // per-corpus precisely so this stays clear.
      const result = scanAsLlm(text, language as ConversationLanguage);
      expect(result.classification).toBe('clear');
      expect(result.protectedLexemeCount).toBe(0);
    },
  );

  // THE MATRIX, not a diagonal. The declaring-language diagonal (each string
  // under its own language) is the direction we already believed in, and testing
  // only along it hid a hole: the attributed-only grammars were per-declared-
  // language, so `El alumno tiene TEA.` classified `clear` under all nine other
  // declared languages while the standalone path fails closed under all ten.
  // AC-2 requires cross-language phrases to be caught, and this module's
  // `cross-language phrases` suite already asserts that symmetry for the
  // standalone scope. Every row below crosses the axis instead of following it.
  const ALL_LANGUAGES = Object.keys(
    LANGUAGE_CORPORA,
  ) as readonly ConversationLanguage[];

  const ATTRIBUTED_STRINGS: readonly string[] = SCOPE_PAIRS.flatMap((pair) => [
    pair.attributed,
    pair.possessive,
    pair.genitive,
  ]);

  /** Mentions + English homographs + the cross-grammar leak controls. */
  const MUST_STAY_CLEAR: readonly string[] = [
    ...SCOPE_PAIRS.map((pair) => pair.mention),
    'The learner has tea.',
    'The learner has ads.',
    'The student has add.',
    'I have tea with breakfast every morning.',
    'The user has ads blocked in the browser.',
    'You can add two numbers to get a sum.',
    // THE ENGLISH `'s` GENITIVE — ordinary prose, no clinical content. Absent
    // from the first matrix, which enumerated only language-native possessive
    // DETERMINERS (`Su TEA`, `Seine ADS`, `Elevens ADD` — those are intended
    // blocks). The genitive namedPattern was being built for every cased corpus,
    // so once the attributed-only sets went always-on these blocked in all ten
    // declared languages. A matrix is only as good as the FORMS enumerated in
    // it, not the number of cells.
    "Emma's tea went cold during the lesson.",
    "We discussed Google's ads policy.",
    "Tom's ads are effective.",
    "Anna's add was a small one.",
    "Sarah's tea preference is green tea.",
    // The acronym in the PERSON slot rather than the lexeme slot. The new
    // acronym-form genitive requires a plausible person NAME on the left, and
    // `acronymRejectRe` rejects an all-caps attributed-only term there, so this
    // matches nothing. Without that half, the pattern would fire on any
    // sentence pairing the acronym with its own homograph.
    "TEA's tea is cold.",
  ];

  it('covers all ten declared languages in the matrix', () => {
    expect(ALL_LANGUAGES).toHaveLength(10);
    expect(ATTRIBUTED_STRINGS).toHaveLength(9);
    expect(MUST_STAY_CLEAR).toHaveLength(15);
  });

  describe.each(ALL_LANGUAGES)('declared %s', (language) => {
    it.each(ATTRIBUTED_STRINGS)(
      'blocks the attributed use regardless of declared language: %s',
      (text) => {
        const result = scanAsLlm(text, language);
        expect(result.classification).toBe('block');
        expect(result.disposition).toBe('block');
        expect(result.protectedLexemeCount).toBeGreaterThan(0);
      },
    );

    it.each(MUST_STAY_CLEAR)(
      'keeps the mention/homograph clear regardless of declared language: %s',
      (text) => {
        const result = scanAsLlm(text, language);
        expect(result.classification).toBe('clear');
        expect(result.disposition).toBe('clear');
        expect(result.protectedLexemeCount).toBe(0);
      },
    );
  });

  it('takes the hedge reason from the set that matched, not the declared language', () => {
    // A Spanish hedge under a declared `en`: the always-on Spanish set matches,
    // and `probablemente` is in NO English marker list. Reading the declared
    // language's markers here reports `person_attribution` for what is plainly a
    // diagnostic inference.
    const result = scanAsLlm('El alumno probablemente tiene TEA.', 'en');
    expect(result.classification).toBe('block');
    expect(result.reason).toBe('diagnostic_inference');
  });

  it('blocks a named-person attributed-only attribution', () => {
    const result = scanAsLlm('Petr tiene TEA.', 'es');
    expect(result.classification).toBe('block');
    expect(result.disposition).toBe('block');
  });

  it('blocks a hedged attributed-only attribution as an inference', () => {
    const result = scanAsLlm('El alumno probablemente tiene TEA.', 'es');
    expect(result.classification).toBe('block');
    expect(result.reason).toBe('diagnostic_inference');
  });

  it('is not defeated by an invisible codepoint inside the attributed term', () => {
    // NFKC does not strip U+200B; the Default_Ignorable strip does. The
    // attributed-only path runs on the same normalized text, so it inherits it.
    const result = scanAsLlm('El alumno tiene T​EA.', 'es');
    expect(result.classification).toBe('block');
    expect(result.disposition).toBe('block');
  });

  it('reports the model-generated confidence of the corpus that matched', () => {
    // es/de/nb are all model-generated, so an attributed-only block must never
    // claim `reviewed` — the same under-claim discipline as the broad scope.
    for (const pair of SCOPE_PAIRS) {
      expect(scanAsLlm(pair.attributed, pair.language).corpusConfidence).toBe(
        'model-generated',
      );
    }
  });

  it('never reports a block with a zero protected-lexeme count', () => {
    // INVARIANT. Attribution is decided before the clear short-circuit, so a
    // drift in how attributed-only terms are counted surfaces here as a loud
    // block-with-count-0 rather than as a silent block-turned-clear bypass.
    const blocking: ReadonlyArray<[string, ConversationLanguage]> = [
      ...SCOPE_PAIRS.map(
        (pair) =>
          [pair.attributed, pair.language] as [string, ConversationLanguage],
      ),
      ...SCOPE_PAIRS.map(
        (pair) =>
          [pair.possessive, pair.language] as [string, ConversationLanguage],
      ),
      ['Petr tiene TEA.', 'es'],
      ['El alumno probablemente tiene TEA.', 'es'],
      ...LANGUAGE_ROWS.map(
        (row) =>
          [row.blockGeneric, row.language] as [string, ConversationLanguage],
      ),
      ...LANGUAGE_ROWS.map(
        (row) =>
          [row.blockNamed, row.language] as [string, ConversationLanguage],
      ),
    ];
    for (const [text, language] of blocking) {
      const result = scanAsLlm(text, language);
      expect(result.classification).toBe('block');
      expect(result.protectedLexemeCount).toBeGreaterThan(0);
    }
  });
});

describe('[WI-2628 AC-5] persistence-boundary wiring guard (forward-only)', () => {
  // Replaces Stage 1's "the module is unwired" assertions. That block's list of
  // eight files IS the call-site inventory, so inverting it is the acceptance
  // signal for AC-5 — and it is forward-only: a NEW write path added to a wired
  // file cannot quietly skip the gate while the old guard's symbols are gone.
  //
  // TWO LISTS, not one, because the wiring is PARTIAL and that must be visible in
  // the test rather than inferable from an absence. The split is not arbitrary and
  // it is not "whatever was easy": it is the TRANSACTION BOUNDARY.
  //
  //   WIRED — the gate is evaluated before any transaction opens, because the text
  //   is known from the call's own parameters. The gate can make an LLM round-trip
  //   (the independent judge), and an LLM call inside an open transaction pins a
  //   pooled connection for its whole duration.
  //
  //   PENDING — the text is derived from a read taken INSIDE a transaction, so the
  //   gate cannot be evaluated before it without restructuring:
  //     learner-profile.ts       12 sites on `mergedState`, which merges the
  //                              in-transaction profile row with analysis output.
  //     memory/backfill-mapping  `dedupeMemoryFactRows`, reached from BOTH
  //                              consumers inside a transaction — learner-profile.ts
  //                              (via writeMemoryFactsForAnalysis) and
  //                              inngest/functions/memory-facts-backfill.ts.
  //     memory/dedup-actions.ts  `applyDedupAction` operates on the caller's `tx`.
  //   Closing those needs a pre-transaction read plus an evaluated-set lookup that
  //   fails closed on any string not in the set (`isSafe` already has that
  //   property). That is a separate change-set; AC-5 is NOT fully met until it
  //   lands, and this test says so out loud rather than reading as an oversight.
  const GATE_MODULE = 'learning-text-safety';
  /** The English-only guard's exported symbols. Absence is what makes it wired. */
  const RETIRED_SYMBOLS = [
    'scrubClinicalInferenceFromLearningRecord',
    'assertNoClinicalInferenceInLearningRecord',
  ] as const;

  const WIRED_CALL_SITES = [
    'mentor-notices/state.ts',
    'evidence-links.ts',
    'notes.ts',
    'session/session-exchange.ts',
  ] as const;

  const PENDING_CALL_SITES = [
    'learner-profile.ts',
    'memory/backfill-mapping.ts',
    'memory/dedup-actions.ts',
  ] as const;

  const read = (relativePath: string): string =>
    readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

  it('covers every call site from the Stage-1 inventory exactly once', () => {
    // The Stage-1 list held eight entries: seven call sites plus the guard module
    // itself. Partitioning must lose none of them and duplicate none.
    const all = [...WIRED_CALL_SITES, ...PENDING_CALL_SITES];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(7);
  });

  describe.each(WIRED_CALL_SITES)('wired: %s', (relativePath) => {
    it('routes through the shared multilingual gate', () => {
      expect(read(relativePath)).toContain(GATE_MODULE);
    });

    it.each(RETIRED_SYMBOLS)('no longer references %s', (symbol) => {
      // The half that makes this forward-only. Asserting only the presence of the
      // gate import passes on a file that imports it and still calls the old
      // English-only guard on the write path.
      expect(read(relativePath)).not.toContain(symbol);
    });
  });

  it.each(PENDING_CALL_SITES)(
    'pending: %s still uses the English-only guard (tracked, not forgotten)',
    (relativePath) => {
      const source = read(relativePath);
      expect(source).not.toContain(GATE_MODULE);
      expect(RETIRED_SYMBOLS.some((symbol) => source.includes(symbol))).toBe(
        true,
      );
    },
  );

  it('keeps the English-only guard alive while any call site still needs it', () => {
    // Not deleted and not wrapped in a delegate. It is still the live control for
    // the three pending files, so removing it now would leave them ungated; and
    // making it delegate to the async gate is impossible — it is synchronous, and
    // a sync deterministic-only delegate would look wired while never reaching the
    // judge, which is the shape Gate-2 rejected.
    const guard = readFileSync(
      resolve(__dirname, '..', 'persisted-learning-text-guard.ts'),
      'utf8',
    );
    for (const symbol of RETIRED_SYMBOLS) {
      expect(guard).toContain(symbol);
    }
    expect(guard).not.toContain(GATE_MODULE);
  });
});
