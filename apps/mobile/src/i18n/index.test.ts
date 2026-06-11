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

// ---------------------------------------------------------------------------
// Forward-only guard: untranslated-key ratchet
//
// When new i18n keys are added to en.json, `pnpm translate` MUST be run to
// generate real translations for the 6 non-English locales. In the past,
// keys were sometimes copy-pasted into locale files verbatim in English,
// producing English text for all non-English users.
//
// This test holds a frozen baseline of the 114 keys that were already
// copy-pasted when this guard was added (L12-a11y-i18n audit, 2026-05-31).
// The baseline is a DEFERRED SWEEP — run `pnpm translate` to clear it.
//
// The test fails immediately if any NEW key (outside the baseline) appears
// identical in English across all 6 non-English locales, blocking future
// regressions while the backlog is cleared.
// ---------------------------------------------------------------------------

// Keys that were copy-pasted verbatim into all non-English locales before
// this guard was added. Deferred sweep: run `pnpm translate` to clear.
// Do NOT add new keys here — fix the translation instead.
const KNOWN_UNTRANSLATED_BASELINE = new Set([
  'dictation.index.loadingMessage',
  'dictation.index.loadingTitle',
  'home.goToProgress',
  'home.goToProgressLabel',
  'home.learner.familySetup.cta',
  'home.learner.familySetup.subtitle',
  'home.learner.familySetup.title',
  'home.parent.card.headlineFromWeekly',
  'home.parent.childCard.statusPending',
  'home.parent.empty.body',
  'home.parent.empty.cta',
  'home.parent.empty.title',
  'homework.ocrError.AUTH_EXPIRED',
  'homework.ocrError.IMAGE_TOO_LARGE',
  'homework.ocrError.NETWORK_ERROR',
  'homework.ocrError.RATE_LIMITED',
  'homework.ocrError.SERVER_ERROR',
  'library.shelf.loadingMessage',
  'library.shelf.loadingTitle',
  'more.appVersion',
  'onboarding.ready.cta',
  'onboarding.ready.intro',
  'onboarding.ready.introWithLearner',
  'onboarding.ready.reassurance',
  'onboarding.ready.rowPace',
  'onboarding.ready.rowSubject',
  'onboarding.ready.rowTone',
  'onboarding.ready.title',
  'parentView.index.subjectsDescription',
  'parentView.index.withdrawConsentBody',
  'parentView.subjects.description',
  'parentView.subjects.noTopicsYetBody',
  'parentView.subjects.noTopicsYetTitle',
  'parentView.subjects.recentSubjectSessions',
  'parentView.subjects.topicsNewLearnerBody',
  'parentView.subjects.topicsNewLearnerTitle',
  'parentView.subjects.viewSessionFrom',
  'practiceHub.xpLabel',
  'progress.guardian.goToChildCurriculum',
  'progress.latestReport.empty',
  'progress.latestReport.error',
  'progress.latestReport.open',
  'progress.latestReport.openWithDate',
  'progress.latestReport.practiceLessons_one',
  'progress.latestReport.practiceLessons_other',
  'progress.latestReport.practicePoints_one',
  'progress.latestReport.practicePoints_other',
  'progress.latestReport.title',
  'progress.previousReports.subtitle',
  'progress.previousReports.title',
  'progress.previousReports.viewAll',
  'progress.recentFocus.empty',
  'progress.recentFocus.error',
  'progress.recentFocus.sessionFallback',
  'progress.recentFocus.showAll',
  'progress.subject.loadingMessage',
  'progress.subject.loadingTitle',
  'quiz.history.score',
  'recaps.emptyCtaStartSession',
  'session.challenge.banner.question',
  'session.mentorMemory.examples.body',
  'session.mentorMemory.examples.title',
  'session.mentorMemory.status.useMemoryDisabledHint',
  'subscription.alerts.purchaseConfirmedBody',
  'subscription.alerts.purchaseConfirmedTitle',
  'subscription.alerts.restoredBody',
  'subscription.alerts.successBody',
  'subscription.alerts.topUpBody',
  'subscription.byokWaitlist.alerts.errorBody',
  'subscription.byokWaitlist.alerts.successBody',
  'subscription.byokWaitlist.alreadyJoinedAccessibilityLabel',
  'subscription.byokWaitlist.alreadyJoinedButton',
  'subscription.byokWaitlist.body',
  'subscription.byokWaitlist.heading',
  'subscription.byokWaitlist.joinAccessibilityLabel',
  'subscription.byokWaitlist.joinButton',
  'subscription.childPaywall.alerts.askParentBody',
  'subscription.childPaywall.alerts.askParentTitle',
  'subscription.childPaywall.alerts.notifyErrorBody',
  'subscription.childPaywall.alerts.notifyErrorTitle',
  'subscription.childPaywall.alerts.sentBody',
  'subscription.childPaywall.backAccessibilityLabel',
  'subscription.childPaywall.browseLibrary',
  'subscription.childPaywall.browseLibraryAccessibilityLabel',
  'subscription.childPaywall.cooldownReminder',
  'subscription.childPaywall.goHome',
  'subscription.childPaywall.goHomeAccessibilityLabel',
  'subscription.childPaywall.greatStart',
  'subscription.childPaywall.headline',
  'subscription.childPaywall.notifiedExploreText',
  'subscription.childPaywall.notifyButton',
  'subscription.childPaywall.notifyButtonAccessibilityNotified',
  'subscription.childPaywall.notifyButtonAccessibilityNotify',
  'subscription.childPaywall.notifyButtonNotified',
  'subscription.childPaywall.seeProgress',
  'subscription.childPaywall.seeProgressAccessibilityLabel',
  'subscription.childPaywall.usedAllQuestions',
  'subscription.childPaywall.waitText',
  // '+{{xp}} XP' is locale-invariant gaming notation (house style keeps
  // 'XP' untranslated everywhere — same class as the xpStats entries below).
  'quiz.results.xpEarned',
  'subscription.childPaywall.xpStats_one',
  'subscription.childPaywall.xpStats_other',
  'subscription.restore.accessibilityLabel',
  'subscription.restore.button',
  'subscription.restore.cancelAccessibilityLabel',
  'subscription.restore.cancelledBody',
  'subscription.restore.cancelledTitle',
  'subscription.restore.failedBody',
  'subscription.restore.failedTitle',
  'subscription.restore.notFoundBody',
  'subscription.restore.notFoundTitle',
  'subscription.restore.verifying',
  'tabs.familyHub',
  'tabs.familyHubLabel',
  'tabs.myLearning',
  'tabs.myLearningLabel',
]);

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

  // Forward-only ratchet: no NEW multi-word keys may be added to en.json and
  // then copy-pasted verbatim into all non-English locales. Run `pnpm translate`
  // to generate real translations. Do NOT add new keys to
  // KNOWN_UNTRANSLATED_BASELINE to pass this test — fix the translation instead.
  it('does not introduce new copy-pasted English keys into non-English locales', () => {
    const nonEnglish = [de, es, ja, nb, pl, pt] as const;
    const enFlat = flattenLocale(en as unknown as NestedStrings);

    const newUntranslated: string[] = [];

    for (const [key, enValue] of Object.entries(enFlat)) {
      // Only flag multi-word strings (single words may legitimately be the same)
      if (!enValue.includes(' ') || enValue.length <= 5) continue;
      // Skip keys that are in the known deferred-sweep baseline
      if (KNOWN_UNTRANSLATED_BASELINE.has(key)) continue;

      const sameInAll = nonEnglish.every((loc) => {
        const locFlat = flattenLocale(loc as unknown as NestedStrings);
        return locFlat[key] === enValue;
      });

      if (sameInAll) {
        newUntranslated.push(`${key}: ${JSON.stringify(enValue)}`);
      }
    }

    expect(newUntranslated).toEqual([]);
  });
});
