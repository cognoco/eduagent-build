import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SubjectCardProps {
  subjectId: string;
  name: string;
  hint: string;
  progress: number;
  tintSolid: string;
  tintSoft: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  testID: string;
}

export function SubjectCard({
  name,
  hint,
  progress,
  tintSolid,
  tintSoft,
  icon,
  onPress,
  testID,
}: SubjectCardProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityLabel={`${name}. ${hint}`}
      accessibilityRole="button"
      className="w-[142px] rounded-2xl bg-surface border border-border p-3.5 pb-4"
      style={{ gap: 10 }}
    >
      <View
        testID={`${testID}-icon`}
        className="w-[38px] h-[38px] rounded-xl items-center justify-center"
        style={{ backgroundColor: tintSoft }}
      >
        <Ionicons name={icon} size={20} color={tintSolid} />
      </View>
      <View>
        <Text className="text-[15px] font-bold text-text-primary">{name}</Text>
        <Text className="text-[11px] text-text-tertiary mt-1" numberOfLines={2}>
          {hint}
        </Text>
      </View>
      <View className="mt-auto">
        <View className="h-1 rounded-full bg-surface-elevated overflow-hidden flex-row">
          <View
            testID={`${testID}-progress`}
            className="h-full rounded-full"
            style={{ flex: progress, backgroundColor: tintSolid }}
          />
          <View style={{ flex: 1 - progress }} />
        </View>
      </View>
    </Pressable>
  );
}
