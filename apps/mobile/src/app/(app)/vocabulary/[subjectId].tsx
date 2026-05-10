import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { ErrorFallback } from '../../../components/common/ErrorFallback';
import type { Vocabulary } from '@eduagent/schemas';

function TypeBadge({ type }: { type: 'word' | 'chunk' }) {
  const { t } = useTranslation();
  return (
    <View
      className={
        type === 'word'
          ? 'bg-primary/10 rounded-full px-2 py-0.5'
          : 'bg-accent/10 rounded-full px-2 py-0.5'
      }
    >
      <Text className="text-caption text-text-secondary">
        {type === 'word'
          ? t('vocabulary.typeWord')
          : t('vocabulary.typePhrase')}
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
  const { t } = useTranslation();
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
        accessibilityLabel={t('vocabulary.deleteAccessibilityLabel', {
          term: item.term,
        })}
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
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const vocabularyQuery = useVocabulary(subjectId ?? '');
  const deleteVocabulary = useDeleteVocabulary(subjectId ?? '');
  const subjectsQuery = useSubjects();

  const subjectName =
    subjectsQuery.data?.find((s) => s.id === subjectId)?.name ??
    t('vocabulary.fallbackTitle');

  const handleDelete = (vocabularyId: string) => {
    platformAlert(
      t('vocabulary.deleteDialog.title'),
      t('vocabulary.deleteDialog.message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteVocabulary.mutate(vocabularyId, {
              onError: (err) => {
                platformAlert(
                  t('vocabulary.deleteDialog.errorTitle'),
                  err instanceof Error
                    ? err.message
                    : t('vocabulary.deleteDialog.errorFallback'),
                  [{ text: t('common.ok') }],
                );
              },
            });
          },
        },
      ],
    );
  };

  // UX-DE-M10: better contextual parent for deep-link entry
  const goBack = () =>
    goBackOrReplace(router, '/(app)/progress/vocabulary' as const);

  if (!subjectId) {
    // [BUG-921] Vocabulary is normally entered from a subject's progress
    // page (`/progress/[subjectId]`). Direct-URL or stale-deep-link arrivals
    // land here with no subjectId param and previously hit a terse "No
    // subject selected." dead-end. Per UX Resilience Rules, give an
    // explanation plus a forward path — Library to pick a subject — in
    // addition to the existing "Back to progress" return path.
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ErrorFallback
          variant="centered"
          title={t('vocabulary.noSubject.title')}
          message={t('vocabulary.noSubject.message')}
          primaryAction={{
            label: t('vocabulary.noSubject.openLibrary'),
            onPress: () => router.replace('/(app)/library' as const),
            testID: 'vocabulary-empty-library',
          }}
          secondaryAction={{
            label: t('vocabulary.noSubject.backToProgress'),
            onPress: () => router.replace('/(app)/progress' as never),
            testID: 'vocabulary-empty-back',
          }}
          testID="vocabulary-no-subject"
        />
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
          accessibilityLabel={t('common.goBack')}
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
          <Text className="text-body-sm text-text-secondary">
            {t('vocabulary.screenSubtitle')}
          </Text>
        </View>
      </View>

      {vocabularyQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : vocabularyQuery.isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-body text-text-secondary text-center mb-4">
            {t('vocabulary.loadError')}
          </Text>
          <Pressable
            onPress={() => void vocabularyQuery.refetch()}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            testID="vocabulary-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.retry')}
            </Text>
          </Pressable>
          <Pressable
            onPress={goBack}
            className="bg-surface rounded-button px-6 py-3 min-h-[48px] items-center justify-center border border-border"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="vocabulary-error-back"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('common.back')}
            </Text>
          </Pressable>
        </View>
      ) : !vocabularyQuery.data?.length ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {t('vocabulary.empty.title')}
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            {t('vocabulary.empty.message')}
          </Text>
          <Pressable
            onPress={goBack}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="vocabulary-empty-back"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.back')}
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
