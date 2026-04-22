import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import type { Bookmark } from '@eduagent/schemas';
import { useBookmarks, useDeleteBookmark } from '../../../hooks/use-bookmarks';
import { platformAlert } from '../../../lib/platform-alert';

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString();
}

function BookmarkRow({
  bookmark,
  onDelete,
}: {
  bookmark: Bookmark;
  onDelete: (bookmark: Bookmark) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      className="bg-surface rounded-card p-4 mb-3"
      accessibilityRole="button"
      accessibilityLabel={`Saved bookmark from ${bookmark.subjectName}`}
      testID={`bookmark-row-${bookmark.id}`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pe-3">
          <Text className="text-body-sm font-semibold text-primary">
            {bookmark.subjectName}
            {bookmark.topicTitle ? ` · ${bookmark.topicTitle}` : ''}
          </Text>
          <Text className="text-caption text-text-tertiary mt-0.5">
            {formatRelativeDate(bookmark.createdAt)}
          </Text>
        </View>
        <Pressable
          onPress={() => onDelete(bookmark)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove bookmark"
          testID={`bookmark-delete-${bookmark.id}`}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            className="text-text-tertiary"
          />
        </Pressable>
      </View>

      <View className="mt-3">
        {expanded ? (
          <Markdown>{bookmark.content}</Markdown>
        ) : (
          <Text className="text-body text-text-primary" numberOfLines={5}>
            {bookmark.content}
          </Text>
        )}
      </View>

      {!expanded && bookmark.content.length > 180 ? (
        <Text className="text-body-sm text-primary mt-2">Tap to expand</Text>
      ) : null}
    </Pressable>
  );
}

export default function SavedBookmarksScreen() {
  const router = useRouter();
  const bookmarksQuery = useBookmarks();
  const deleteBookmark = useDeleteBookmark();

  const bookmarks = useMemo(
    () =>
      bookmarksQuery.data?.pages.flatMap((page) => page.bookmarks ?? []) ?? [],
    [bookmarksQuery.data]
  );

  const handleDelete = useCallback(
    (bookmark: Bookmark) => {
      platformAlert(
        'Remove bookmark?',
        'This saved explanation will be removed.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void deleteBookmark.mutateAsync(bookmark.id).catch((error) => {
                platformAlert(
                  'Could not remove bookmark',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
            },
          },
        ]
      );
    },
    [deleteBookmark]
  );

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          testID="saved-back"
        >
          <Ionicons name="arrow-back" size={24} className="text-text-primary" />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary ml-3">Saved</Text>
      </View>

      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookmarkRow bookmark={item} onDelete={handleDelete} />
        )}
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
          bookmarksQuery.isLoading ? null : (
            <View className="items-center justify-center py-14 px-6">
              <Ionicons
                name="bookmark-outline"
                size={48}
                className="text-text-tertiary mb-4"
              />
              <Text className="text-body text-text-secondary text-center">
                Nothing saved yet. Tap the bookmark icon on any response during
                a session to save it here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          bookmarksQuery.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator />
            </View>
          ) : null
        }
        testID="saved-bookmarks-list"
      />
    </View>
  );
}
