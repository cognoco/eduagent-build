import { Text, View } from 'react-native';

interface ChapterDividerProps {
  name: string;
}

export function ChapterDivider({ name }: ChapterDividerProps) {
  return (
    <View className="px-4 pt-4 pb-1">
      <Text className="text-caption font-medium tracking-wide text-text-secondary uppercase">
        {name}
      </Text>
    </View>
  );
}
