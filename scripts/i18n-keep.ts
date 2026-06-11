// scripts/i18n-keep.ts
//
// Keys (or prefix patterns) that are reached at runtime through mappings the
// static AST walker in scripts/check-i18n-orphan-keys.ts cannot follow.
// Without these, the unused-key pass would flag them as dead and the next
// sweep would delete them, breaking the dynamic call site.
//
// Format: each entry is { pattern, reason }.
//   - `pattern` uses glob-style `*` for any subkey segment. `errors.*` matches
//     `errors.quotaExhausted`, `errors.generic`, etc. `*` spans any non-empty
//     run of characters including dots (so it is multi-segment).
//   - `reason` MUST cite the file:line where the dynamic reference lives, so
//     a future reader can grep their way to the call site and judge whether
//     the entry is still earning its keep. The Zod schema below enforces that
//     at least one `path:line` token is present, and runs at import time so a
//     malformed entry fails the build before check-i18n-keep-rot.ts runs.

import { z } from 'zod';

// `path:line` token. The path class includes `()[]` so Expo Router route
// files (e.g. `(app)/child/[profileId]/topic/[topicId].tsx:203`) can be cited.
const keepPatternSchema = z.object({
  pattern: z.string().min(1),
  reason: z.string().regex(/[\w./()[\]-]+:\d+/, 'reason must cite path:line'),
});

export interface KeepPattern {
  readonly pattern: string;
  readonly reason: string;
}

const raw: readonly KeepPattern[] = [
  {
    pattern: 'errors.*',
    reason:
      'reached via ERROR_KEY_MAP at apps/mobile/src/i18n/error-keys.ts:1; ' +
      'every entry is selected by API error code at runtime',
  },
  {
    pattern: 'session.mentorMemory.interestContext.*',
    reason:
      'selected via INTEREST_CONTEXT_LABEL_KEYS[context] at ' +
      'apps/mobile/src/components/mentor-memory-sections.tsx:293',
  },
  {
    pattern: 'parentView.metricTooltips.*.title',
    reason:
      'selected via METRIC_TOOLTIP_I18N_KEYS[metricKey].title at ' +
      'apps/mobile/src/lib/parent-vocab.ts:98',
  },
  {
    pattern: 'parentView.metricTooltips.*.body',
    reason:
      'selected via METRIC_TOOLTIP_I18N_KEYS[metricKey].body at ' +
      'apps/mobile/src/lib/parent-vocab.ts:99',
  },
  {
    pattern: 'parentView.topic.understandingLevels.*',
    reason:
      'returned by getUnderstandingLabel(masteryPercent) at ' +
      'apps/mobile/src/lib/parent-vocab.ts:117 (consumed by t() at ' +
      'apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:203)',
  },
  {
    pattern: 'parentView.topic.completionStatus.*',
    reason:
      'selected via COMPLETION_STATUS_KEYS[completionStatus] at ' +
      'apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:182',
  },
  // Keys referenced via react-i18next <Trans i18nKey="..."> (JSX attribute,
  // not a t() call) — the AST walker only follows t()-style call sites, so
  // Trans-only keys would otherwise be flagged as unused.
  {
    pattern: 'auth.signIn.sentCodeTo',
    reason: '<Trans i18nKey> at apps/mobile/src/app/(auth)/sign-in.tsx:1122',
  },
  {
    pattern: 'auth.signIn.offerBody',
    reason: '<Trans i18nKey> at apps/mobile/src/app/(auth)/sign-in.tsx:1490',
  },
  {
    pattern: 'auth.signUp.sentCodeTo',
    reason: '<Trans i18nKey> at apps/mobile/src/app/(auth)/sign-up.tsx:365',
  },
  {
    pattern: 'auth.signUp.agreeToTerms',
    reason: '<Trans i18nKey> at apps/mobile/src/app/(auth)/sign-up.tsx:670',
  },
  {
    pattern: 'auth.forgotPassword.enterCodeAndPassword',
    reason:
      '<Trans i18nKey> at apps/mobile/src/app/(auth)/forgot-password.tsx:302',
  },
  // Home tab title + accessibility-label keys are chosen at runtime from the
  // navigation contract (V0 legacy + V1) via homeTabPresentation. Glob `*` is
  // non-empty, so bare `tabs.home` and `tabs.homeLabel` need separate entries.
  {
    pattern: 'tabs.home',
    reason:
      'homeTabPresentation.titleKey at apps/mobile/src/app/(app)/_layout.tsx:662',
  },
  {
    pattern: 'tabs.homeLabel',
    reason:
      'homeTabPresentation.accessibilityLabelKey at ' +
      'apps/mobile/src/app/(app)/_layout.tsx:665',
  },
  {
    pattern: 'tabs.familyHub',
    reason:
      'homeTabPresentation.titleKey at apps/mobile/src/app/(app)/_layout.tsx:662',
  },
  {
    pattern: 'tabs.familyHubLabel',
    reason:
      'homeTabPresentation.accessibilityLabelKey at ' +
      'apps/mobile/src/app/(app)/_layout.tsx:665',
  },
  {
    pattern: 'tabs.myLearning',
    reason:
      'homeTabPresentation.titleKey at apps/mobile/src/app/(app)/_layout.tsx:662',
  },
  {
    pattern: 'tabs.myLearningLabel',
    reason:
      'homeTabPresentation.accessibilityLabelKey at ' +
      'apps/mobile/src/app/(app)/_layout.tsx:665',
  },
  {
    pattern: 'tabs.children',
    reason:
      'homeTabPresentation.titleKey at apps/mobile/src/app/(app)/_layout.tsx:662',
  },
  {
    pattern: 'tabs.childrenLabel',
    reason:
      'homeTabPresentation.accessibilityLabelKey at ' +
      'apps/mobile/src/app/(app)/_layout.tsx:665',
  },
  {
    pattern: 'home.learner.momentum.*',
    reason:
      'singular/plural key chosen by count then passed to t(key) at ' +
      'apps/mobile/src/components/home/ChildQuotaLine.tsx:28',
  },
  {
    pattern: 'home.learner.intentActions.*',
    reason:
      'action.titleKey / action.subtitleKey (INTENT_ACTIONS) consumed at ' +
      'apps/mobile/src/components/home/LearnerScreen.tsx:575',
  },
  {
    pattern: 'home.learner.askAnythingLabel',
    reason:
      'INTENT_ACTIONS askAnything titleKey consumed at ' +
      'apps/mobile/src/components/home/LearnerScreen.tsx:575',
  },
  {
    pattern: 'home.learner.askAnythingSubtitle',
    reason:
      'INTENT_ACTIONS askAnything subtitleKey consumed at ' +
      'apps/mobile/src/components/home/LearnerScreen.tsx:576',
  },
  {
    pattern: 'library.nextAction.*Title',
    reason:
      'next-action titleKey selected by subject intent at ' +
      'apps/mobile/src/app/(app)/library.tsx:505',
  },
  {
    pattern: 'library.nextAction.title',
    reason:
      'next-action titleKey selected by subject intent at ' +
      'apps/mobile/src/app/(app)/library.tsx:505',
  },
  {
    pattern: 'quota.parent.childCapHit.dailyMessage',
    reason:
      'messageKey ternary (daily_exceeded) consumed at ' +
      'apps/mobile/src/components/home/ParentHomeScreen.tsx:131',
  },
  {
    pattern: 'quota.parent.childCapHit.monthlyMessage',
    reason:
      'messageKey ternary (monthly) consumed at ' +
      'apps/mobile/src/components/home/ParentHomeScreen.tsx:131',
  },
  {
    pattern: 'progress.retention.*',
    reason:
      'selected via STATUS_KEY[status] / ELAPSED_KEY[status] at ' +
      'apps/mobile/src/components/library/RetentionPill.tsx:60 and via ' +
      'RETENTION config labelKey in ' +
      'apps/mobile/src/components/progress/RetentionSignal.tsx:68',
  },
  {
    pattern: 'parentView.practiceSummary.activityTypes.*',
    reason:
      'template key parentView.practiceSummary.activityTypes.${type} consumed ' +
      'at apps/mobile/src/components/progress/PracticeActivitySummaryCard.tsx:47',
  },
  {
    pattern: 'parentView.practiceSummary.activitySubtypes.*',
    reason:
      'template key parentView.practiceSummary.activitySubtypes.${subtype} ' +
      'consumed at ' +
      'apps/mobile/src/components/progress/PracticeActivitySummaryCard.tsx:40',
  },
  {
    pattern: 'subscriptionScreen.tierLabels.*',
    reason:
      'selected via TIER_LABEL_KEYS[tier] at ' +
      'apps/mobile/src/app/(app)/_subscription/tier-helpers.ts:24',
  },
  {
    pattern: 'subscriptionScreen.tierLimits.*',
    reason:
      'selected via TIER_LIMIT_KEYS[tier] at ' +
      'apps/mobile/src/app/(app)/_subscription/tier-helpers.ts:28',
  },
  {
    pattern: 'subscriptionScreen.packagePeriod.*',
    reason:
      'selected via PACKAGE_PERIOD_KEY[pkg.packageType] at ' +
      'apps/mobile/src/app/(app)/_subscription/purchase-errors.ts:16',
  },
  {
    pattern: 'quiz.launch.loading*',
    reason:
      'cycled via LOADING_MESSAGE_KEYS[index] at ' +
      'apps/mobile/src/app/(app)/quiz/launch.tsx:400',
  },
  {
    pattern: 'friendlyErrors.*',
    reason:
      'selected via FRIENDLY_ERROR[].key map then i18next.t(entry.key) at ' +
      'apps/mobile/src/lib/format-api-error.ts:215',
  },
  {
    pattern: 'parentView.index.progressNudge*',
    reason:
      'titleKey/subtitleKey recency ternary consumed at ' +
      'apps/mobile/src/app/(app)/child/[profileId]/index.tsx:266',
  },
  {
    pattern: 'notifications.tap.*',
    reason:
      'titleKey/messageKey selected from NotificationTapDecision (prompt kind) ' +
      'and passed to t() at ' +
      'apps/mobile/src/hooks/use-notification-response-handler.ts:93',
  },
  {
    pattern: 'sessionSummary.takeaways.*',
    reason:
      'i18next plural suffixes (_one/_other) appended at runtime by ' +
      "buildSessionTakeaways() via t('sessionSummary.takeaways.duration', { count }) " +
      'at apps/mobile/src/app/session-summary/_view-models/session-summary-derived.ts:123',
  },
  {
    pattern: 'session.messageBubble.escalation.*',
    reason:
      'selected via escalation.labelKey from ESCALATION_STYLES[escalationRung] at ' +
      'apps/mobile/src/components/session/MessageBubble.tsx:244',
  },
  {
    pattern: 'session.messageBubble.verificationBadge.*',
    reason:
      'selected via VERIFICATION_BADGE_KEY[verificationBadge] at ' +
      'apps/mobile/src/components/session/MessageBubble.tsx:274',
  },
];

export const KEEP_PATTERNS: readonly KeepPattern[] = raw.map((p) =>
  keepPatternSchema.parse(p),
);
