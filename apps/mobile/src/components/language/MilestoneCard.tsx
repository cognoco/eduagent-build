import { View, Text } from 'react-native';

interface MilestoneCardProps {
  currentLevel: string;
  currentSublevel: string;
  milestoneTitle: string;
  wordsMastered: number;
  wordsTarget: number;
  chunksMastered: number;
  chunksTarget: number;
  milestoneProgress: number;
}

export function MilestoneCard(props: MilestoneCardProps) {
  const {
    currentLevel,
    currentSublevel,
    milestoneTitle,
    wordsMastered,
    wordsTarget,
    chunksMastered,
    chunksTarget,
    milestoneProgress,
  } = props;

  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-primary font-bold text-lg">
          {currentLevel}.{currentSublevel}
        </Text>
        <Text className="text-text-secondary text-sm">
          {Math.round(milestoneProgress * 100)}%
        </Text>
      </View>
      <Text className="text-text-primary font-semibold mb-2">
        {milestoneTitle}
      </Text>
      <View className="bg-surface-elevated rounded-full h-2 mb-2 overflow-hidden">
        <View
          className="bg-primary rounded-full h-2"
          style={{ width: `${Math.min(100, milestoneProgress * 100)}%` }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-text-secondary text-xs">
          {wordsMastered}/{wordsTarget} words
        </Text>
        <Text className="text-text-secondary text-xs">
          {chunksMastered}/{chunksTarget} chunks
        </Text>
      </View>
    </View>
  );
}
