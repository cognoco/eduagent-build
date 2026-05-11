import { Text, View } from 'react-native';

export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View className="bg-background rounded-card p-4 flex-1">
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}
