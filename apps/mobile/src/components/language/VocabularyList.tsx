import { View, Text, Pressable } from 'react-native';
import type { Vocabulary } from '@eduagent/schemas';

interface VocabularyListProps {
  items: Vocabulary[];
  onReview?: (item: Vocabulary) => void;
}

export function VocabularyList({ items, onReview }: VocabularyListProps) {
  if (items.length === 0) {
    return (
      <View className="bg-surface rounded-2xl p-4">
        <Text className="text-text-secondary">No vocabulary yet.</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {items.map((item) => (
        <View key={item.id} className="bg-surface rounded-2xl p-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pe-3">
              <Text className="text-body font-semibold text-text-primary">
                {item.term}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {item.translation}
              </Text>
              <Text className="text-caption text-text-secondary mt-2">
                {item.type === 'chunk' ? 'Chunk' : 'Word'}
                {item.cefrLevel ? ` • ${item.cefrLevel}` : ''}
                {item.mastered ? ' • Mastered' : ' • In progress'}
              </Text>
            </View>
            {onReview ? (
              <Pressable
                onPress={() => onReview(item)}
                className="rounded-full bg-primary/10 px-3 py-2"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Review
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
