import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Bookmark } from '@eduagent/schemas';
import {
  ErrorFallback,
  ThemedMarkdown,
  TimeoutLoader,
} from '../../../components/common';
import { useBookmarks, useDeleteBookmark } from '../../../hooks/use-bookmarks';
import { platformAlert } from '../../../lib/platform-alert';
import { formatApiError } from '../../../lib/format-api-error';
import { goBackOrReplace } from '../../../lib/navigation';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { useRelativeDate } from '../../../hooks/use-time-format';

function BookmarkRow({
  bookmark,
  onDelete,
  canDelete,
}: {
  bookmark: Bookmark;
  onDelete: (bookmark: Bookmark) => void;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const relativeDate = useRelativeDate();
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      className="bg-surface rounded-card p-4 mb-3"
      accessibilityRole="button"
      accessibilityLabel={t('progress.saved.bookmarkLabel', {
        subject: bookmark.subjectName,
      })}
      testID={`bookmark-row-${bookmark.id}`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pe-3">
          <Text className="text-body-sm font-semibold text-primary">
            {bookmark.subjectName}
            {bookmark.topicTitle ? ` · ${bookmark.topicTitle}` : ''}
          </Text>
          <Text className="text-caption text-text-tertiary mt-0.5">
            {relativeDate(bookmark.createdAt)}
          </Text>
        </View>
        {canDelete && (
          <Pressable
            onPress={() => onDelete(bookmark)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('progress.saved.removeBookmark')}
            testID={`bookmark-delete-${bookmark.id}`}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              className="text-text-tertiary"
            />
          </Pressable>
        )}
      </View>

      <View className="mt-3">
        {expanded ? (
          <ThemedMarkdown>{bookmark.content}</ThemedMarkdown>
        ) : (
          <Text className="text-body text-text-primary" numberOfLines={5}>
            {bookmark.content}
          </Text>
        )}
      </View>

      {!expanded && bookmark.content.length > 180 ? (
        <Text className="text-body-sm text-primary mt-2">
          {t('progress.saved.tapToExpand')}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function SavedBookmarksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ subjectId?: string }>();
  const subjectId = Array.isArray(params.subjectId)
    ? params.subjectId[0]
    : params.subjectId;
  const navigationContract = useNavigationContract();
  const canDelete = navigationContract.gates.showLearningActions;
  const bookmarksQuery = useBookmarks({ subjectId });
  const deleteBookmark = useDeleteBookmark();

  const bookmarks = useMemo(
    () =>
      bookmarksQuery.data?.pages.flatMap((page) => page.bookmarks ?? []) ?? [],
    [bookmarksQuery.data],
  );

  const handleDelete = useCallback(
    (bookmark: Bookmark) => {
      platformAlert(
        t('progress.saved.deleteTitle'),
        t('progress.saved.deleteMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('progress.saved.deleteConfirm'),
            style: 'destructive',
            onPress: () => {
              void deleteBookmark.mutateAsync(bookmark.id).catch((error) => {
                platformAlert(
                  t('progress.saved.deleteErrorTitle'),
                  formatApiError(error),
                );
              });
            },
          },
        ],
      );
    },
    [deleteBookmark, t],
  );

  const keyExtractor = useCallback((item: Bookmark) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Bookmark }) => (
      <BookmarkRow
        bookmark={item}
        onDelete={handleDelete}
        canDelete={canDelete}
      />
    ),
    [handleDelete, canDelete],
  );

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          hitSlop={8}
          testID="saved-back"
        >
          <Ionicons name="arrow-back" size={24} className="text-text-primary" />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary ml-3">
          {subjectId
            ? t('progress.saved.subjectPageTitle')
            : t('progress.saved.pageTitle')}
        </Text>
      </View>
      {subjectId ? (
        <Text className="px-4 pb-2 text-body-sm text-text-secondary">
          {t('progress.saved.subjectSubtitle')}
        </Text>
      ) : null}

      <FlatList
        data={bookmarks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
        }}
        onEndReached={() => {
          if (
            bookmarksQuery.hasNextPage &&
            !bookmarksQuery.isFetchingNextPage
          ) {
            void bookmarksQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          bookmarksQuery.isLoading ? (
            <View className="py-14 px-6">
              <TimeoutLoader
                isLoading
                testID="saved-loading"
                loadingLabel={t('common.loading')}
                title={t('progress.saved.errorLoad')}
                message={t('errors.generic')}
                primaryAction={{
                  label: t('common.tryAgain'),
                  onPress: () => void bookmarksQuery.refetch(),
                  testID: 'saved-timeout-retry',
                }}
                secondaryAction={{
                  label: t('common.goBack'),
                  onPress: () =>
                    goBackOrReplace(router, '/(app)/progress' as const),
                  testID: 'saved-timeout-back',
                }}
              />
            </View>
          ) : bookmarksQuery.isError ? (
            <View className="py-14 px-6">
              <ErrorFallback
                variant="card"
                title={t('progress.saved.errorLoad')}
                message={formatApiError(bookmarksQuery.error)}
                primaryAction={{
                  label: t('progress.saved.retryLabel'),
                  onPress: () => void bookmarksQuery.refetch(),
                  testID: 'saved-retry',
                }}
                secondaryAction={{
                  label: t('common.goBack'),
                  onPress: () =>
                    goBackOrReplace(router, '/(app)/progress' as const),
                  testID: 'saved-error-back',
                }}
                testID="saved-error"
              />
            </View>
          ) : (
            <View className="items-center justify-center py-14 px-6">
              <Ionicons
                name="bookmark-outline"
                size={48}
                className="text-text-tertiary mb-4"
              />
              <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
                {t('progress.saved.emptyTitle')}
              </Text>
              <Text className="text-body text-text-secondary text-center mb-6">
                {t('progress.saved.emptySubtitle')}
              </Text>
              <Pressable
                // [LEARN-24] CTA copy says "Go to Library" — use a direct replace
                // so the user always lands on Library regardless of navigation history.
                // goBackOrReplace would pick router.back() when canGoBack() is true,
                // returning the user to Progress instead of Library.
                onPress={() => router.replace('/(app)/library')}
                className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('progress.saved.goToLibrary')}
                testID="saved-empty-library-cta"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('progress.saved.goToLibrary')}
                </Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          bookmarksQuery.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator accessibilityLabel={t('common.loading')} />
            </View>
          ) : null
        }
        testID="saved-bookmarks-list"
      />
    </View>
  );
}
