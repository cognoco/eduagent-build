import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AllNote, Bookmark, ChildSession } from '@eduagent/schemas';
import { useBookmarks } from '../../../hooks/use-bookmarks';
import { useAllNotes } from '../../../hooks/use-notes';
import { useProfileSessionsArchive } from '../../../hooks/use-progress';
import { useProfile } from '../../../lib/profile';
import { OWN_LEARNING_RETURN_TO } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import { buildSessionDetailHref } from '../../../lib/session-detail-navigation';
import { formatShortDate } from '../../../lib/format-datetime';
import {
  useRelativeDate,
  useDurationLabel,
} from '../../../hooks/use-time-format';
import { getDurationParts } from '../../../lib/format-relative-date';

type MyNotesKind = 'sessions' | 'notes' | 'bookmarks';
type GroupMode = 'date' | 'subject';

type ArchiveItem = {
  id: string;
  kind: MyNotesKind;
  subjectId: string | null;
  subjectName: string;
  topicId: string | null;
  topicTitle: string | null;
  date: string;
  typeLabel: string;
  preview: string | null;
  durationSeconds: number | null;
  sessionId: string | null;
};

type ListRow =
  | { type: 'header'; id: string; title: string }
  | { type: 'item'; id: string; item: ArchiveItem };

const VALID_KINDS = new Set(['sessions', 'notes', 'bookmarks']);

function asKind(value: string | string[] | undefined): MyNotesKind {
  const raw = Array.isArray(value) ? value[0] : value;
  return VALID_KINDS.has(raw ?? '') ? (raw as MyNotesKind) : 'sessions';
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function myNotesReturnTo(value: string | string[] | undefined): string {
  return firstParam(value) ?? OWN_LEARNING_RETURN_TO;
}

function titleForKind(kind: MyNotesKind, t: TFunction): string {
  switch (kind) {
    case 'notes':
      return t('myNotes.kinds.notes');
    case 'bookmarks':
      return t('myNotes.kinds.bookmarks');
    case 'sessions':
      return t('myNotes.kinds.sessions');
  }
}

function searchPlaceholderForKind(kind: MyNotesKind, t: TFunction): string {
  switch (kind) {
    case 'notes':
      return t('myNotes.searchNotes');
    case 'bookmarks':
      return t('myNotes.searchBookmarks');
    case 'sessions':
      return t('myNotes.searchSessions');
  }
}

function subtitleForKind(
  kind: MyNotesKind,
  count: number,
  t: TFunction,
): string {
  if (kind === 'bookmarks') {
    return t('library.myNotes.subtitleBookmarks', { count });
  }
  if (kind === 'notes') {
    return t('library.myNotes.subtitleNotes', { count });
  }
  return t('library.myNotes.subtitleSessions', { count });
}

function formatInlineDate(iso: string, locale: string | undefined): string {
  return formatShortDate(iso, locale);
}

function normalizeSessionType(type: string, t: TFunction): string {
  switch (type) {
    case 'homework':
      return t('myNotes.types.homework');
    case 'interleaved':
      return t('myNotes.types.review');
    default:
      return t('myNotes.types.learning');
  }
}

function truncate(text: string, max = 120): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

function sessionToItem(session: ChildSession, t: TFunction): ArchiveItem {
  return {
    id: session.sessionId,
    kind: 'sessions',
    subjectId: session.subjectId,
    subjectName: session.subjectName ?? t('myNotes.unknownSubject'),
    topicId: session.topicId,
    topicTitle: session.topicTitle,
    date: session.startedAt,
    typeLabel: normalizeSessionType(session.sessionType, t),
    preview: session.highlight ?? session.displaySummary ?? null,
    durationSeconds: session.wallClockSeconds ?? session.durationSeconds,
    sessionId: session.sessionId,
  };
}

function noteToItem(note: AllNote, t: TFunction): ArchiveItem {
  return {
    id: note.id,
    kind: 'notes',
    subjectId: note.subjectId,
    subjectName: note.subjectName,
    topicId: note.topicId,
    topicTitle: note.topicTitle,
    date: note.updatedAt,
    typeLabel: t('myNotes.types.note'),
    preview: truncate(note.content),
    durationSeconds: null,
    sessionId: note.sessionId,
  };
}

function bookmarkToItem(bookmark: Bookmark, t: TFunction): ArchiveItem {
  return {
    id: bookmark.id,
    kind: 'bookmarks',
    subjectId: bookmark.subjectId,
    subjectName: bookmark.subjectName,
    topicId: bookmark.topicId,
    topicTitle: bookmark.topicTitle,
    date: bookmark.createdAt,
    typeLabel: t('myNotes.types.bookmark'),
    preview: truncate(bookmark.content),
    durationSeconds: null,
    sessionId: bookmark.sessionId,
  };
}

function groupItems(
  items: ArchiveItem[],
  mode: GroupMode,
  relativeDate: (iso: string) => string,
): ListRow[] {
  const rows: ListRow[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const group = mode === 'date' ? relativeDate(item.date) : item.subjectName;
    if (!seen.has(group)) {
      seen.add(group);
      rows.push({ type: 'header', id: `header-${group}`, title: group });
    }
    rows.push({ type: 'item', id: `${item.kind}-${item.id}`, item });
  }

  return rows;
}

function matchesQuery(
  item: ArchiveItem,
  query: string,
  locale: string | undefined,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    item.subjectName,
    item.topicTitle,
    item.typeLabel,
    item.preview,
    formatInlineDate(item.date, locale),
  ]
    .filter((value): value is string => !!value)
    .some((value) => value.toLowerCase().includes(q));
}

function GroupToggle({
  mode,
  onChange,
}: {
  mode: GroupMode;
  onChange: (mode: GroupMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row rounded-card bg-surface-elevated p-1 mt-4">
      {(['date', 'subject'] as const).map((value) => {
        const selected = mode === value;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            className={`flex-1 rounded-card py-2 items-center ${
              selected ? 'bg-surface' : ''
            }`}
            accessibilityRole="button"
            accessibilityLabel={
              value === 'date'
                ? t('myNotes.a11yGroupByDate')
                : t('myNotes.a11yGroupBySubject')
            }
            testID={`my-notes-group-${value}`}
          >
            <Text
              className={`text-body-sm font-semibold ${
                selected ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {value === 'date'
                ? t('myNotes.sortDate')
                : t('myNotes.sortSubject')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ArchiveCard({
  item,
  onPress,
}: {
  item: ArchiveItem;
  onPress: (item: ArchiveItem) => void;
}) {
  const colors = useThemeColors();
  const { i18n } = useTranslation();
  const durationLabel = useDurationLabel();
  const duration =
    getDurationParts(item.durationSeconds).unit === 'none'
      ? null
      : durationLabel(item.durationSeconds);
  const meta = [
    item.topicTitle,
    item.typeLabel,
    formatInlineDate(item.date, i18n?.language),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => onPress(item)}
      className="rounded-card border border-border bg-surface p-4 mb-3 flex-row items-center"
      accessibilityRole="button"
      accessibilityLabel={`${item.subjectName}. ${meta}`}
      testID={`my-notes-row-${item.kind}-${item.id}`}
    >
      <View className="h-12 w-12 rounded-2xl bg-surface-elevated items-center justify-center me-3">
        <Ionicons
          name={
            item.kind === 'sessions'
              ? 'time-outline'
              : item.kind === 'bookmarks'
                ? 'bookmark-outline'
                : 'document-text-outline'
          }
          size={24}
          color={colors.primary}
        />
      </View>
      <View className="flex-1 pe-2">
        <Text
          className="text-body font-bold text-text-primary"
          numberOfLines={1}
        >
          {item.subjectName}
        </Text>
        <Text
          className="text-body-sm text-text-secondary mt-0.5"
          numberOfLines={1}
        >
          {meta}
        </Text>
        {item.preview ? (
          <Text
            className="text-caption text-text-tertiary mt-1"
            numberOfLines={1}
          >
            {item.preview}
          </Text>
        ) : null}
      </View>
      {duration ? (
        <View className="rounded-full bg-surface-elevated px-3 py-1 me-2">
          <Text className="text-body-sm font-semibold text-text-primary">
            {duration}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export default function MyNotesListScreen(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const activeProfileRole = useActiveProfileRole();
  const proxyChildProfileId =
    activeProfileRole === 'impersonated-child' ? activeProfile?.id : undefined;
  const params = useLocalSearchParams<{
    kind?: string;
    returnTo?: string | string[];
  }>();
  const kind = asKind(params.kind);
  const returnTo = myNotesReturnTo(params.returnTo);
  const [groupMode, setGroupMode] = useState<GroupMode>('date');
  const [query, setQuery] = useState('');
  const relativeDate = useRelativeDate();

  const sessionsQuery = useProfileSessionsArchive(activeProfile?.id, {
    limit: 20,
  });
  const notesQuery = useAllNotes({ limit: 20 });
  const bookmarksQuery = useBookmarks({ limit: 20 });

  const rawItems = useMemo((): ArchiveItem[] => {
    if (kind === 'sessions') {
      return (
        sessionsQuery.data?.pages.flatMap((page) =>
          page.sessions.map((session) => sessionToItem(session, t)),
        ) ?? []
      );
    }
    if (kind === 'notes') {
      return (
        notesQuery.data?.pages.flatMap((page) =>
          page.notes.map((note) => noteToItem(note, t)),
        ) ?? []
      );
    }
    return (
      bookmarksQuery.data?.pages.flatMap((page) =>
        page.bookmarks.map((bookmark) => bookmarkToItem(bookmark, t)),
      ) ?? []
    );
  }, [bookmarksQuery.data, kind, notesQuery.data, sessionsQuery.data, t]);

  const items = useMemo(
    () => rawItems.filter((item) => matchesQuery(item, query, i18n?.language)),
    [query, rawItems, i18n?.language],
  );
  const rows = useMemo(
    () => groupItems(items, groupMode, relativeDate),
    [groupMode, items, relativeDate],
  );

  const activeQuery =
    kind === 'sessions'
      ? sessionsQuery
      : kind === 'notes'
        ? notesQuery
        : bookmarksQuery;

  const handleEndReached = (): void => {
    if (kind === 'sessions' && sessionsQuery.hasNextPage) {
      void sessionsQuery.fetchNextPage();
    }
    if (kind === 'notes' && notesQuery.hasNextPage) {
      void notesQuery.fetchNextPage();
    }
    if (kind === 'bookmarks' && bookmarksQuery.hasNextPage) {
      void bookmarksQuery.fetchNextPage();
    }
  };

  const hasNextPage =
    (kind === 'sessions' && sessionsQuery.hasNextPage) ||
    (kind === 'notes' && notesQuery.hasNextPage) ||
    (kind === 'bookmarks' && bookmarksQuery.hasNextPage);
  const isFetchingNextPage =
    (kind === 'sessions' && sessionsQuery.isFetchingNextPage) ||
    (kind === 'notes' && notesQuery.isFetchingNextPage) ||
    (kind === 'bookmarks' && bookmarksQuery.isFetchingNextPage);

  const handleItemPress = (item: ArchiveItem): void => {
    if (item.kind === 'sessions' && item.sessionId) {
      router.push(
        buildSessionDetailHref({
          sessionId: item.sessionId,
          childProfileId: proxyChildProfileId,
        }),
      );
      return;
    }

    if (item.subjectId && item.topicId) {
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: { subjectId: item.subjectId, topicId: item.topicId },
      } as Href);
      return;
    }

    if (item.sessionId) {
      router.push(
        buildSessionDetailHref({
          sessionId: item.sessionId,
          childProfileId: proxyChildProfileId,
        }),
      );
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID={`my-notes-list-${kind}`}
    >
      <FlatList
        testID="my-notes-flat-list"
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.45}
        ListHeaderComponent={
          <View>
            <View className="flex-row items-center mt-4">
              <Pressable
                onPress={() =>
                  router.replace({
                    pathname: '/(app)/my-notes',
                    params: { returnTo },
                  } as Href)
                }
                className="me-3 min-h-[44px] min-w-[44px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                testID="my-notes-list-back"
              >
                <Ionicons
                  name="arrow-back"
                  size={24}
                  color={colors.textPrimary}
                />
              </Pressable>
              <View className="flex-1">
                <Text className="text-h2 font-bold text-text-primary">
                  {titleForKind(kind, t)}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-0.5">
                  {subtitleForKind(kind, rawItems.length, t)}
                </Text>
              </View>
            </View>

            <View className="mt-5 rounded-card border border-border bg-surface px-3 py-2 flex-row items-center">
              <Ionicons
                name="search"
                size={18}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholderForKind(kind, t)}
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={t('library.myNotes.searchA11y', {
                  kind: titleForKind(kind, t).toLowerCase(),
                })}
                className="flex-1 text-body text-text-primary"
                testID="my-notes-search"
              />
            </View>

            <GroupToggle mode={groupMode} onChange={setGroupMode} />
          </View>
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text className="text-caption font-bold text-text-secondary mt-5 mb-2">
              {item.title}
            </Text>
          ) : (
            <ArchiveCard item={item.item} onPress={handleItemPress} />
          )
        }
        ListEmptyComponent={
          activeQuery.isLoading ? (
            <View className="items-center py-14" testID="my-notes-loading">
              <ActivityIndicator accessibilityLabel={t('common.loading')} />
            </View>
          ) : activeQuery.isError ? (
            <View className="items-center py-14" testID="my-notes-error">
              <Text className="text-body font-semibold text-text-primary">
                {kind === 'notes'
                  ? t('myNotes.loadErrorNotes')
                  : kind === 'bookmarks'
                    ? t('myNotes.loadErrorBookmarks')
                    : t('myNotes.loadErrorSessions')}
              </Text>
              <Pressable
                onPress={() => void activeQuery.refetch()}
                className="mt-4 rounded-button bg-primary px-5 py-3"
                accessibilityRole="button"
                accessibilityLabel={t('common.tryAgainAction')}
                testID="my-notes-retry"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('common.tryAgainAction')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-14" testID="my-notes-empty">
              <Text className="text-body font-semibold text-text-primary">
                {kind === 'notes'
                  ? t('myNotes.noneYetNotes')
                  : kind === 'bookmarks'
                    ? t('myNotes.noneYetBookmarks')
                    : t('myNotes.noneYetSessions')}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1 text-center">
                {t('myNotes.emptyHint')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator accessibilityLabel={t('common.loading')} />
            </View>
          ) : hasNextPage ? (
            <Pressable
              onPress={handleEndReached}
              className="my-3 rounded-button border border-border bg-surface px-5 py-3 items-center"
              accessibilityRole="button"
              accessibilityLabel={t('myNotes.loadMore')}
              testID="my-notes-load-more"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('myNotes.loadMore')}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
