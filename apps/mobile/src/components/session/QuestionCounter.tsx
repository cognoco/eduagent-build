import { View, Text } from 'react-native';

interface QuestionCounterProps {
  count: number;
}

export function QuestionCounter({ count }: QuestionCounterProps) {
  if (count < 1) return null;

  return (
    <View
      className="mt-2 items-center py-2"
      testID="question-counter"
      accessibilityLabel={`Question ${count}`}
    >
      <Text className="text-caption text-text-secondary font-medium">
        Question {count}
      </Text>
    </View>
  );
}
