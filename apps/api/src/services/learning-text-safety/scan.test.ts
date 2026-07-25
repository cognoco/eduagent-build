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

  it('does not treat a bare clinical term as a person name', () => {
    // "Dyslexia is a reading difference" — capitalized lexeme, not a person.
    const result = scanAsLlm('Dyslexia is a reading difference.', 'en');
    expect(result.classification).not.toBe('block');
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

describe('[WI-2628] the module is unwired in Stage 1', () => {
  // Stage 1 lands the deterministic core only; Stage 3 rewires the callers.
  // Asserting the unwired state is what makes this PR reversible: the eight
  // existing write-time guard call sites, and the shipped guard itself, must
  // still be untouched by this change-set.
  const EXISTING_GUARD_CALL_SITES = [
    'persisted-learning-text-guard.ts',
    'mentor-notices/state.ts',
    'evidence-links.ts',
    'learner-profile.ts',
    'memory/backfill-mapping.ts',
    'memory/dedup-actions.ts',
    'notes.ts',
    'session/session-exchange.ts',
  ] as const;

  it.each(EXISTING_GUARD_CALL_SITES)(
    '%s does not reference the new gate yet',
    (relativePath) => {
      const source = readFileSync(
        resolve(__dirname, '..', relativePath),
        'utf8',
      );
      expect(source).not.toContain('learning-text-safety');
      expect(source).not.toContain('scanLearningText');
    },
  );
});
