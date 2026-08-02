import { Pressable, Text, View } from 'react-native';

export function FamilyJoinDecisionCard({
  title,
  description,
  selected,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={title}
      accessibilityHint={description}
      className={`min-h-[72px] rounded-card border px-4 py-3 ${
        selected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
      }`}
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border ${
            selected ? 'border-primary bg-primary' : 'border-text-secondary'
          }`}
          accessibilityElementsHidden
        >
          {selected ? (
            <View className="h-2 w-2 rounded-full bg-text-inverse" />
          ) : null}
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-body font-semibold text-text-primary">
            {title}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
