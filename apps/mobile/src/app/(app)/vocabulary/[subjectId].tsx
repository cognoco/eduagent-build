import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useVocabulary,
  useDeleteVocabulary,
} from '../../../hooks/use-vocabulary';
import { useSubjects } from '../../../hooks/use-subjects';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import type { Vocabulary } from '@eduagent/schemas';

function TypeBadge({ type }: { type: 'word' | 'chunk' }) {
  return (
    <View
      className={
        type === 'word'
          ? 'bg-primary/10 rounded-full px-2 py-0.5'
          : 'bg-accent/10 rounded-full px-2 py-0.5'
      }
    >
      <Text className="text-caption text-text-secondary">
        {type === 'word' ? 'word' : 'phrase'}
      </Text>
    </View>
  );
}

function CefrBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  return (
    <View className="bg-surface-elevated rounded-full px-2 py-0.5">
      <Text className="text-caption font-semibold text-text-secondary">
        {level}
      </Text>
    </View>
  );
}

function VocabularyRow({
  item,
  onDelete,
  isDeleting,
  colors,
}: {
  item: Vocabulary;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      className="bg-surface rounded-card px-4 py-3 mb-2 flex-row items-center"
      testID={`vocab-item-${item.id}`}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-body font-semibold text-text-primary">
            {item.term}
          </Text>
          {item.mastered && (
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={colors.primary}
            />
          )}
        </View>
        <Text className="text-body-sm text-text-secondary mt-0.5">
          {item.translation}
        </Text>
        <View className="flex-row gap-2 mt-1.5">
          <TypeBadge type={item.type} />
          <CefrBadge level={item.cefrLevel} />
        </View>
      </View>
      <Pressable
        onPress={() => onDelete(item.id)}
        disabled={isDeleting}
        className="p-2 min-w-[44px] min-h-[44px] items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.term}`}
        testID={`vocab-delete-${item.id}`}
      >
        {isDeleting ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Ionicons name="trash-outline" size={20} color={colors.muted} />
        )}
      </Pressable>
    </View>
  );
}

export default function VocabularyListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const vocabularyQuery = useVocabulary(subjectId ?? '');
  const deleteVocabulary = useDeleteVocabulary(subjectId ?? '');
  const subjectsQuery = useSubjects();

  const subjectName =
    subjectsQuery.data?.find((s) => s.id === subjectId)?.name ?? 'Vocabulary';

  const handleDelete = (vocabularyId: string) => {
    platformAlert('Delete word', 'Remove this word from your vocabulary?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteVocabulary.mutate(vocabularyId, {
            onError: (err) => {
              platformAlert(
                'Could not delete',
                err instanceof Error
                  ? err.message
                  : 'Something went wrong. Try again.',
                [{ text: 'OK' }]
              );
            },
          });
        },
      },
    ]);
  };

  const goBack = () => goBackOrReplace(router, '/(app)/progress' as never);

  if (!subjectId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          No subject selected.
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/progress' as never)}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back to progress"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Back to progress
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 mt-4 mb-3">
        <Pressable
          onPress={goBack}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="vocabulary-back"
        >
          <Text className="text-body font-semibold text-primary">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {subjectName}
          </Text>
          <Text className="text-body-sm text-text-secondary">Vocabulary</Text>
        </View>
      </View>

      {vocabularyQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : vocabularyQuery.isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-body text-text-secondary text-center mb-4">
            Could not load vocabulary. Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => void vocabularyQuery.refetch()}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
            accessibilityRole="button"
            accessibilityLabel="Retry"
            testID="vocabulary-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Retry
            </Text>
          </Pressable>
          <Pressable
            onPress={goBack}
            className="bg-surface rounded-button px-6 py-3 min-h-[48px] items-center justify-center border border-border"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="vocabulary-error-back"
          >
            <Text className="text-body font-semibold text-text-primary">
              Go back
            </Text>
          </Pressable>
        </View>
      ) : !vocabularyQuery.data?.length ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            No vocabulary yet
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            Complete a language session to start building your word list.
          </Text>
          <Pressable
            onPress={goBack}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="vocabulary-empty-back"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Go back
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={vocabularyQuery.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 24,
          }}
          renderItem={({ item }) => (
            <VocabularyRow
              item={item}
              onDelete={handleDelete}
              isDeleting={
                deleteVocabulary.isPending &&
                deleteVocabulary.variables === item.id
              }
              colors={colors}
            />
          )}
          testID="vocabulary-list"
        />
      )}
    </View>
  );
}
