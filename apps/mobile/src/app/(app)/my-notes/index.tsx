import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  OWN_LEARNING_RETURN_TO,
  homeHrefForReturnTo,
  V2_TAB_TITLE_KEYS,
} from '../../../lib/navigation';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { useProfileSessions } from '../../../hooks/use-progress';
import { useProfile } from '../../../lib/profile';
import { useThemeColors } from '../../../lib/theme';

type MyNotesKind = 'sessions' | 'notes' | 'bookmarks';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function myNotesReturnTo(value: string | string[] | undefined): string {
  return firstParam(value) ?? OWN_LEARNING_RETURN_TO;
}

const HUB_ITEMS: Array<{
  kind: MyNotesKind;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { kind: 'sessions', icon: 'time-outline' },
  { kind: 'notes', icon: 'document-text-outline' },
  { kind: 'bookmarks', icon: 'bookmark-outline' },
];

function hubTitle(kind: MyNotesKind, t: TFunction): string {
  switch (kind) {
    case 'notes':
      return t('myNotes.kinds.notes');
    case 'bookmarks':
      return t('myNotes.kinds.bookmarks');
    case 'sessions':
      return t('myNotes.kinds.sessions');
  }
}

function hubSubtitle(kind: MyNotesKind, t: TFunction): string {
  switch (kind) {
    case 'notes':
      return t('myNotes.hub.notesSubtitle');
    case 'bookmarks':
      return t('myNotes.hub.bookmarksSubtitle');
    case 'sessions':
      return t('myNotes.hub.sessionsSubtitle');
  }
}

function CountPill({
  value,
  fallbackLabel,
  testID,
}: {
  value: number | undefined;
  fallbackLabel?: string;
  testID: string;
}) {
  if (value == null && !fallbackLabel) return null;
  return (
    <View
      className="rounded-full bg-surface-elevated px-3 py-1"
      testID={testID}
      accessibilityLiveRegion="polite"
    >
      <Text className="text-caption font-semibold text-text-secondary">
        {fallbackLabel ?? value}
      </Text>
    </View>
  );
}

export default function MyNotesHubScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = myNotesReturnTo(params.returnTo);
  const v2Enabled = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
  const homeHref = homeHrefForReturnTo(returnTo, undefined, v2Enabled);
  // WI-2331 AC-2 (core): my-notes has no parent screen more specific than
  // its owning V2 tab (Mentor — my-notes is not a Subjects/Journal route),
  // so the Back control names that tab instead of the generic `common.back`
  // it showed before — same contract as AC-1's tab highlight, so the label
  // and the highlighted tab always agree.
  const backLabel = v2Enabled
    ? t('common.backTo', { destination: t(V2_TAB_TITLE_KEYS.mentor) })
    : t('common.back');
  const { activeProfile } = useProfile();
  const sessionsQuery = useProfileSessions(activeProfile?.id);

  const counts: Partial<Record<MyNotesKind, number>> = {
    sessions: sessionsQuery.data?.length,
  };
  const sessionCountFallback = sessionsQuery.isLoading
    ? t('myNotes.hub.countLoading')
    : sessionsQuery.isError
      ? t('myNotes.hub.countUnavailable')
      : undefined;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="my-notes-hub"
    >
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4 mb-6">
          <Pressable
            onPress={() => router.replace(homeHref)}
            className="me-3 min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            testID="my-notes-back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {t('myNotes.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('myNotes.subtitle')}
            </Text>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          {HUB_ITEMS.map((item) => (
            <Pressable
              key={item.kind}
              onPress={() =>
                router.push({
                  pathname: '/(app)/my-notes/[kind]',
                  params: { kind: item.kind, returnTo },
                } as Href)
              }
              className="rounded-card border border-border bg-surface p-4 flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel={hubTitle(item.kind, t)}
              testID={`my-notes-${item.kind}`}
            >
              <View className="h-12 w-12 rounded-2xl bg-surface-elevated items-center justify-center me-3">
                <Ionicons name={item.icon} size={24} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-body font-bold text-text-primary">
                  {hubTitle(item.kind, t)}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-0.5">
                  {hubSubtitle(item.kind, t)}
                </Text>
              </View>
              <CountPill
                value={counts[item.kind]}
                fallbackLabel={
                  item.kind === 'sessions' ? sessionCountFallback : undefined
                }
                testID={`my-notes-${item.kind}-count`}
              />
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
                style={{ marginLeft: 10 }}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
