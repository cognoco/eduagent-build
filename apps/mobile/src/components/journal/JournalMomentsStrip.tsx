import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import type { NowCard } from '@eduagent/schemas';

import { ErrorFallback, TimeoutLoader } from '../common';
import { BookPageFlipAnimation } from '../common/BookPageFlipAnimation';
import { useNowFeed } from '../../hooks/use-now-feed';
import { pushNowDeepLink } from '../../lib/now-deep-link';
import { useSectionErrorActions } from './journal-shared';

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

function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function renderMilestoneMomentText(card: NowCard, t: TFunction): string {
  const milestoneType = stringParam(card.params, 'milestoneType');
  const threshold = numberParam(card.params, 'threshold');
  if (!milestoneType || threshold == null) {
    return t('journal.moments.generic', card.params);
  }

  switch (milestoneType) {
    case 'vocabulary_count':
      return t('milestoneCard.wordCount', { count: threshold });
    case 'topic_mastered_count':
      return t('milestoneCard.topicCount', { count: threshold });
    case 'session_count':
      return t('milestoneCard.sessionCount', { count: threshold });
    case 'learning_time':
      return t('milestoneCard.hourCount', { count: threshold });
    default:
      return t('journal.moments.generic', card.params);
  }
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
    case 'journal.moments.milestone_reached':
      return renderMilestoneMomentText(card, t);
    case 'journal.moments.reflection_bonus':
      return t('journal.moments.reflection_bonus', card.params);
    case 'journal.moments.quiz_personal_best':
      return t('journal.moments.quiz_personal_best', card.params);
    default:
      return t('journal.moments.generic', card.params);
  }
}

export function JournalMomentsStrip(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const nowFeed = useNowFeed();
  const moments =
    nowFeed.data?.cards.filter((card) => card.kind === 'ledger_moment') ?? [];
  const errorActions = useSectionErrorActions(
    nowFeed.error,
    () => void nowFeed.refetch(),
  );

  if (nowFeed.isLoading && !nowFeed.data) {
    return (
      <TimeoutLoader
        isLoading
        testID="journal-moments-loading"
        loadingLabel={t('common.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => void nowFeed.refetch(),
          testID: 'journal-moments-timeout-retry',
        }}
      />
    );
  }

  // Feed unavailable + no cached/last data: keep the paper trail retryable
  // (spec §14 "Feed unavailable") rather than blanking the strip.
  if (nowFeed.isError && moments.length === 0) {
    return (
      <ErrorFallback
        variant="card"
        testID="journal-moments-error"
        title={t('journal.moments.errorTitle')}
        primaryAction={
          errorActions.primary
            ? { ...errorActions.primary, testID: 'journal-moments-retry' }
            : {
                label: t('common.tryAgain'),
                onPress: () => void nowFeed.refetch(),
                testID: 'journal-moments-retry',
              }
        }
        secondaryAction={errorActions.secondary}
      />
    );
  }

  return (
    <View testID="journal-moments-strip" className="gap-2">
      <Text className="text-body font-semibold text-text-primary">
        {t('journal.moments.title')}
      </Text>
      {moments.length === 0 ? (
        <View
          testID="journal-moments-empty"
          className="items-center rounded-card border border-border bg-surface p-4"
        >
          <View className="mb-3" pointerEvents="none">
            <BookPageFlipAnimation
              size={78}
              testID="journal-moments-empty-book"
            />
          </View>
          <Text className="text-center text-body-sm text-text-secondary">
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
