import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, type Href } from 'expo-router';
import type { NowCard } from '@eduagent/schemas';

import { useNowFeed } from '../../hooks/use-now-feed';
import { pushNowDeepLink } from '../../lib/now-deep-link';

type JournalSection = {
  id: 'recaps' | 'reports' | 'notes' | 'memory';
  href: Href;
};

const SECTIONS: JournalSection[] = [
  {
    id: 'recaps',
    href: '/(app)/recaps' as Href,
  },
  {
    id: 'reports',
    href: '/(app)/progress/reports' as Href,
  },
  {
    id: 'notes',
    href: '/(app)/my-notes' as Href,
  },
  {
    id: 'memory',
    href: '/(app)/mentor-memory' as Href,
  },
];

function ledgerKind(card: NowCard): string {
  const explicit = card.params.ledgerKind;
  if (typeof explicit === 'string' && explicit) return explicit;
  return card.templateKey.replace('now.ledger_moment.', '');
}

function ledgerCopyKey(card: NowCard): string {
  const kind = ledgerKind(card);
  if (!kind || kind === card.templateKey) return 'journal.moments.generic';
  return `journal.moments.${kind}`;
}

function renderLedgerMomentText(card: NowCard, t: TFunction): string {
  switch (ledgerCopyKey(card)) {
    case 'journal.moments.session_filed':
      return t('journal.moments.session_filed', card.params);
    case 'journal.moments.topic_mastered':
      return t('journal.moments.topic_mastered', card.params);
    case 'journal.moments.recap_ready':
      return t('journal.moments.recap_ready', card.params);
    case 'journal.moments.snapshot_ready':
      return t('journal.moments.snapshot_ready', card.params);
    case 'journal.moments.reflection_bonus':
      return t('journal.moments.reflection_bonus', card.params);
    case 'journal.moments.quiz_personal_best':
      return t('journal.moments.quiz_personal_best', card.params);
    default:
      return t('journal.moments.generic', card.params);
  }
}

function sectionTitle(section: JournalSection['id'], t: TFunction): string {
  switch (section) {
    case 'recaps':
      return t('journal.sections.recaps');
    case 'reports':
      return t('journal.sections.reports');
    case 'notes':
      return t('journal.sections.notes');
    case 'memory':
      return t('journal.sections.memory');
  }
}

function sectionSubtitle(section: JournalSection['id'], t: TFunction): string {
  switch (section) {
    case 'recaps':
      return t('journal.sections.recapsSubtitle');
    case 'reports':
      return t('journal.sections.reportsSubtitle');
    case 'notes':
      return t('journal.sections.notesSubtitle');
    case 'memory':
      return t('journal.sections.memorySubtitle');
  }
}

function JournalMomentsStrip(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const nowFeed = useNowFeed();
  const moments =
    nowFeed.data?.cards.filter((card) => card.kind === 'ledger_moment') ?? [];

  if (nowFeed.isLoading && !nowFeed.data) {
    return (
      <View
        testID="journal-moments-loading"
        className="rounded-card border border-border bg-surface p-4"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (nowFeed.isError && moments.length === 0) {
    return (
      <View
        testID="journal-moments-error"
        className="rounded-card border border-border bg-surface p-4"
      >
        <Text className="text-body font-semibold text-text-primary">
          {t('journal.moments.errorTitle')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void nowFeed.refetch()}
          testID="journal-moments-retry"
          className="mt-3 self-start rounded-button bg-primary px-4 py-2"
        >
          <Text className="text-body-sm font-semibold text-text-inverse">
            {t('common.tryAgain')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View testID="journal-moments-strip" className="gap-2">
      <Text className="text-body font-semibold text-text-primary">
        {t('journal.moments.title')}
      </Text>
      {moments.length === 0 ? (
        <View className="rounded-card border border-border bg-surface p-4">
          <Text className="text-body-sm text-text-secondary">
            {t('journal.moments.empty')}
          </Text>
        </View>
      ) : (
        moments.map((moment) => (
          <Pressable
            key={`${moment.templateKey}:${JSON.stringify(moment.params)}`}
            accessibilityRole="button"
            testID={`journal-moment-${ledgerKind(moment)}`}
            className="rounded-card border border-border bg-surface p-4"
            onPress={() =>
              pushNowDeepLink(router, moment.deepLink, {
                subjectHubTarget: 'v2-subject-hub',
              })
            }
          >
            <Text className="text-body-sm text-text-primary">
              {renderLedgerMomentText(moment, t)}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

export function JournalTabView(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <ScrollView
      testID="journal-screen"
      className="flex-1 bg-background px-5 py-4"
      contentContainerStyle={{ paddingBottom: 28, gap: 16 }}
    >
      <View>
        <Text className="text-h2 font-bold text-text-primary">
          {t('journal.title')}
        </Text>
        <Text className="mt-1 text-body text-text-secondary">
          {t('journal.trust.privacyPromise')}
        </Text>
      </View>

      <JournalMomentsStrip />

      <View className="gap-3">
        {SECTIONS.map((section) => (
          <Pressable
            key={section.id}
            accessibilityRole="button"
            onPress={() => router.push(section.href)}
            testID={`journal-section-${section.id}`}
            className="rounded-card border border-border bg-surface p-4"
          >
            <Text className="text-body font-semibold text-text-primary">
              {sectionTitle(section.id, t)}
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {sectionSubtitle(section.id, t)}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
