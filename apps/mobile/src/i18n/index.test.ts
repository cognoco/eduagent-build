import { resolveLanguage, SUPPORTED_LANGUAGES } from './index';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';
import nb from './locales/nb.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';

// ---------------------------------------------------------------------------
// Helpers shared across test suites
// ---------------------------------------------------------------------------

type NestedStrings = { [k: string]: string | NestedStrings };

function flattenLocale(
  obj: NestedStrings,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[fullKey] = v;
    } else {
      Object.assign(result, flattenLocale(v, fullKey));
    }
  }
  return result;
}

type TargetLocale = Exclude<(typeof SUPPORTED_LANGUAGES)[number], 'en'>;
const TARGET_LOCALES = SUPPORTED_LANGUAGES.filter(
  (locale): locale is TargetLocale => locale !== 'en',
);

const ALL_TARGET_LOCALES = new Set<TargetLocale>(TARGET_LOCALES);

interface IdenticalValueAllowance {
  locales: ReadonlySet<TargetLocale>;
  category: 'intentional-name' | 'technical-token' | 'shared-term';
  reason: string;
}

const locales = (...values: TargetLocale[]): ReadonlySet<TargetLocale> =>
  new Set(values);

// Identical target-language values are allowed only where the English spelling
// is itself intentional: a product/person name, technical notation, or a term
// genuinely shared by the named target languages. Ordinary UI prose and labels
// never belong here.
const IDENTICAL_TO_ENGLISH_ALLOWLIST: Record<string, IdenticalValueAllowance> =
  {
    'time.duration.minutes': {
      locales: locales('es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: '`min` is the standard compact minute abbreviation.',
    },
    'time.duration.minutesOne': {
      locales: locales('es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: '`min` is the standard compact minute abbreviation.',
    },
    'time.duration.hoursMinutes': {
      locales: locales('es', 'pl', 'pt'),
      category: 'technical-token',
      reason: '`h`/`m` are compact duration-unit notation.',
    },
    'time.duration.none': {
      locales: ALL_TARGET_LOCALES,
      category: 'technical-token',
      reason: 'The em dash is a language-neutral empty-duration glyph.',
    },
    'common.ok': {
      locales: locales('de', 'ja', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`OK` is the established target-language UI term.',
    },
    'home.learner.subjectHintQuiz': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Quiz` is the established target-language product term.',
    },
    'home.parent.card.headlineFromWeekly': {
      locales: ALL_TARGET_LOCALES,
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'home.coachBand.estimatedMinutes': {
      locales: locales('es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: '`min` is the standard compact minute abbreviation.',
    },
    'session.voiceInput.send': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same imperative `Send`.',
    },
    'session.inputModeToggle.text': {
      locales: locales('de'),
      category: 'shared-term',
      reason: 'German uses the same UI term `Text`.',
    },
    'quiz.index.title': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Quiz` is the established target-language product term.',
    },
    'quiz.launch.challengeStart': {
      locales: locales('nb', 'pl'),
      category: 'shared-term',
      reason: '`Start` is an established compact action label.',
    },
    'quiz.round.questionLabel': {
      locales: locales('ja', 'pt'),
      category: 'technical-token',
      reason: '`Q` plus an ordinal is intentionally compact question notation.',
    },
    'quiz.history.score': {
      locales: ALL_TARGET_LOCALES,
      category: 'technical-token',
      reason:
        'Score separators and the `XP` unit are language-neutral notation.',
    },
    'quiz.results.xpEarned': {
      locales: ALL_TARGET_LOCALES,
      category: 'technical-token',
      reason: '`XP` is the product-wide gaming unit.',
    },
    'practiceHub.xpLabel': {
      locales: ALL_TARGET_LOCALES,
      category: 'technical-token',
      reason: '`XP` is the product-wide gaming unit.',
    },
    'practiceHub.sections.quiz': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Quiz` is the established target-language product term.',
    },
    'practiceHub.recitation.betaLabel': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Beta` is the established software-release term.',
    },
    'library.nextAction.startTitle': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same imperative `Start`.',
    },
    'library.manage.pause': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same action label `Pause`.',
    },
    'library.sessionRow.a11y': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'library.topicStatusRow.a11y': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'library.topicStatusRow.a11yWithSubtitle': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'library.topicPicker.a11yTopicWithChapter': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'library.topicSessionRow.a11y': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'library.bookCard.a11y': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'library.searchResult.a11y': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: 'The value contains runtime tokens and punctuation only.',
    },
    'subject.startSubjectLabel': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same imperative `Start`.',
    },
    'subject.start': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same imperative `Start`.',
    },
    'homework.flashLabel': {
      locales: locales('es', 'pt'),
      category: 'shared-term',
      reason: '`Flash` is the established camera-hardware term.',
    },
    'parentView.session.type': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same label `Type`.',
    },
    'parentView.weeklyReport.activeMinutes': {
      locales: locales('es', 'nb', 'pl', 'pt'),
      category: 'technical-token',
      reason: '`min` is the standard compact minute abbreviation.',
    },
    'onboarding.ready.introWithLearner': {
      locales: locales('nb'),
      category: 'shared-term',
      reason: 'Norwegian uses the same preposition `For`.',
    },
    'parentView.practiceSummary.activityTypes.quiz': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Quiz` is the established target-language product term.',
    },
    'mentorHome.cards.dismissIcon': {
      locales: ALL_TARGET_LOCALES,
      category: 'technical-token',
      reason: '`x` is the intentional dismiss-icon glyph.',
    },
    'subjectHub.sheet.masteryLine': {
      locales: locales('de', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Status` is the established target-language UI term.',
    },
    'journal.practice.type.quiz': {
      locales: locales('de', 'es', 'nb', 'pl', 'pt'),
      category: 'shared-term',
      reason: '`Quiz` is the established target-language product term.',
    },
    'dictation.review.error': {
      locales: locales('es'),
      category: 'shared-term',
      reason: 'Spanish uses the same label `Error`.',
    },
    'subscription.byokWaitlist.alerts.errorTitle': {
      locales: locales('es'),
      category: 'shared-term',
      reason: 'Spanish uses the same label `Error`.',
    },
    'subscriptionScreen.tierLabels.plus': {
      locales: ALL_TARGET_LOCALES,
      category: 'intentional-name',
      reason: '`Plus` is the subscription tier name.',
    },
    'subscriptionScreen.tierLabels.pro': {
      locales: ALL_TARGET_LOCALES,
      category: 'intentional-name',
      reason: '`Pro` is the subscription tier name.',
    },
    'securitySessions.ipAddress': {
      locales: locales('de', 'es', 'pl', 'pt'),
      category: 'technical-token',
      reason: '`IP` is the networking abbreviation.',
    },
    'profiles.namePlaceholder': {
      locales: locales('de'),
      category: 'shared-term',
      reason: 'German uses the same field label `Name`.',
    },
    'feedbackSheet.category.bug': {
      locales: locales('de', 'pt'),
      category: 'technical-token',
      reason: '`Bug` is the established software-defect term.',
    },
    'supportHub.mentor.personTitle': {
      locales: ALL_TARGET_LOCALES,
      category: 'intentional-name',
      reason: 'The value intentionally renders only the person name token.',
    },
  };

function normalizePlaceholders(value: string): string {
  return value.replace(/\{\{[^{}]+\}\}/g, '{{placeholder}}');
}

function extractPlaceholders(value: string): string[] {
  return (value.match(/\{\{[^{}]+\}\}/g) ?? []).sort();
}

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

function resolveEnglishComparisonValues(
  key: string,
  enFlat: Record<string, string>,
): string[] {
  const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
  if (!match) {
    const exactValue = enFlat[key];
    return exactValue === undefined ? [] : [exactValue];
  }

  const baseKey = match[1];
  return PLURAL_SUFFIXES.flatMap((suffix) => {
    const value = enFlat[`${baseKey}_${suffix}`];
    return value === undefined ? [] : [value];
  });
}

describe('resolveLanguage', () => {
  it('returns stored language when it is a supported language', () => {
    expect(resolveLanguage('en', 'en')).toBe('en');
  });

  it('ignores stored language that is not supported (falls back to device)', () => {
    // 'ar' isn't supported; device 'de' is, so resolution lands on 'de'.
    expect(resolveLanguage('ar', 'de')).toBe('de');
  });

  it('falls back to en when stored is unsupported and device is unsupported', () => {
    expect(resolveLanguage('ar', 'ko')).toBe('en');
  });

  it('returns device language when no stored language and device is supported', () => {
    expect(resolveLanguage(null, 'en')).toBe('en');
  });

  it('falls back to en when neither stored nor device language is supported', () => {
    expect(resolveLanguage(null, 'ar')).toBe('en');
    expect(resolveLanguage('zh', 'ko')).toBe('en');
  });

  it('handles empty string stored language as no override', () => {
    expect(resolveLanguage('', 'en')).toBe('en');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('exposes the seven launch locales', () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      'en',
      'de',
      'es',
      'ja',
      'nb',
      'pl',
      'pt',
    ]);
  });
});

describe('launch locale key parity', () => {
  const locales = { en, de, es, ja, nb, pl, pt } as const;

  it('keeps practice summary activity labels translated in every locale', () => {
    const sections = ['activityTypes', 'activitySubtypes'] as const;

    for (const messages of [de, es, ja, nb, pl, pt]) {
      for (const section of sections) {
        expect(
          Object.keys(messages.parentView.practiceSummary[section]).sort(),
        ).toEqual(Object.keys(en.parentView.practiceSummary[section]).sort());
      }
    }
  });

  it('keeps obsolete More family paywall keys deleted in every locale', () => {
    const obsoleteKeys = [
      'upgradeRequiredTitle',
      'upgradeRequiredMessage',
      'viewPlans',
      'profileLimitTitle',
      'profileLimitMessage',
    ] as const;

    for (const messages of Object.values(locales)) {
      for (const key of obsoleteKeys) {
        expect(messages.more.family).not.toHaveProperty(key);
      }
    }
  });

  it('keeps every identical-to-English allowance scoped to a current match', () => {
    const enFlat = flattenLocale(en as unknown as NestedStrings);
    const targetFlat = {
      de: flattenLocale(de as unknown as NestedStrings),
      es: flattenLocale(es as unknown as NestedStrings),
      ja: flattenLocale(ja as unknown as NestedStrings),
      nb: flattenLocale(nb as unknown as NestedStrings),
      pl: flattenLocale(pl as unknown as NestedStrings),
      pt: flattenLocale(pt as unknown as NestedStrings),
    } satisfies Record<TargetLocale, Record<string, string>>;

    for (const [key, allowance] of Object.entries(
      IDENTICAL_TO_ENGLISH_ALLOWLIST,
    )) {
      expect(Object.hasOwn(enFlat, key)).toBe(true);
      for (const locale of allowance.locales) {
        const targetValue = targetFlat[locale][key];
        const englishValue = enFlat[key];
        expect(targetValue).toBeDefined();
        expect(englishValue).toBeDefined();
        if (targetValue === undefined || englishValue === undefined) {
          continue;
        }
        expect(normalizePlaceholders(targetValue)).toBe(
          normalizePlaceholders(englishValue),
        );
      }
    }
  });

  it('preserves interpolation placeholders in every locale and plural form', () => {
    const enFlat = flattenLocale(en as unknown as NestedStrings);
    const targetFlat = {
      de: flattenLocale(de as unknown as NestedStrings),
      es: flattenLocale(es as unknown as NestedStrings),
      ja: flattenLocale(ja as unknown as NestedStrings),
      nb: flattenLocale(nb as unknown as NestedStrings),
      pl: flattenLocale(pl as unknown as NestedStrings),
      pt: flattenLocale(pt as unknown as NestedStrings),
    } satisfies Record<TargetLocale, Record<string, string>>;

    const mismatches: string[] = [];
    for (const locale of TARGET_LOCALES) {
      for (const [key, targetValue] of Object.entries(targetFlat[locale])) {
        const exactEnglishValue = enFlat[key];
        const enValues =
          exactEnglishValue === undefined
            ? resolveEnglishComparisonValues(key, enFlat)
            : [exactEnglishValue];
        if (enValues.length === 0) continue;
        const targetPlaceholders = JSON.stringify(
          extractPlaceholders(targetValue),
        );
        if (
          enValues.every(
            (enValue) =>
              JSON.stringify(extractPlaceholders(enValue)) !==
              targetPlaceholders,
          )
        ) {
          mismatches.push(`${locale}:${key}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('compares locale-only plural variants with every English plural sibling', () => {
    expect(
      resolveEnglishComparisonValues('report.practiceLessons_few', {
        'report.practiceLessons_one': '{{count}} practice lesson',
        'report.practiceLessons_other': '{{count}} practice lessons',
      }),
    ).toEqual(['{{count}} practice lesson', '{{count}} practice lessons']);
  });

  it('rejects a locale that drops one occurrence of a repeated placeholder', () => {
    const englishPlaceholders = extractPlaceholders(
      '{{count}} completed out of {{count}} assigned',
    );
    const localePlaceholders = extractPlaceholders(
      '{{count}} completed out of assigned',
    );

    expect(localePlaceholders).not.toEqual(englishPlaceholders);
  });

  it('has no unallowlisted values identical to English after placeholder normalization', () => {
    const nonEnglish = { de, es, ja, nb, pl, pt } as const;
    const enFlat = flattenLocale(en as unknown as NestedStrings);
    const targetFlat = Object.fromEntries(
      Object.entries(nonEnglish).map(([locale, messages]) => [
        locale,
        flattenLocale(messages as unknown as NestedStrings),
      ]),
    ) as Record<TargetLocale, Record<string, string>>;

    const untranslated: string[] = [];

    for (const locale of TARGET_LOCALES) {
      for (const [key, targetValue] of Object.entries(targetFlat[locale])) {
        const enValues = resolveEnglishComparisonValues(key, enFlat);
        if (enValues.length === 0) continue;

        const allowance = IDENTICAL_TO_ENGLISH_ALLOWLIST[key];
        if (allowance?.locales.has(locale)) continue;

        const matchingEnglishValue = enValues.find(
          (enValue) =>
            normalizePlaceholders(targetValue) ===
            normalizePlaceholders(enValue),
        );
        if (matchingEnglishValue !== undefined) {
          untranslated.push(
            `${locale}:${key}: ${JSON.stringify(matchingEnglishValue)}`,
          );
        }
      }
    }

    expect(untranslated).toEqual([]);
  });
});
