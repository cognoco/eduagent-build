import { View, Text } from 'react-native';

type RetentionStatus = 'strong' | 'fading' | 'weak' | 'forgotten';

interface RetentionSignalProps {
  status: RetentionStatus;
  compact?: boolean;
}

const CONFIG: Record<
  RetentionStatus,
  { label: string; dotColor: string; textColor: string }
> = {
  strong: {
    label: 'Strong',
    dotColor: 'bg-retention-strong',
    textColor: 'text-retention-strong',
  },
  fading: {
    label: 'Fading',
    dotColor: 'bg-retention-fading',
    textColor: 'text-retention-fading',
  },
  weak: {
    label: 'Weak',
    dotColor: 'bg-retention-weak',
    textColor: 'text-retention-weak',
  },
  forgotten: {
    label: 'Forgotten',
    dotColor: 'bg-[#737373]',
    textColor: 'text-[#737373]',
  },
};

export function RetentionSignal({ status, compact }: RetentionSignalProps) {
  const { label, dotColor, textColor } = CONFIG[status];

  return (
    <View className="flex-row items-center">
      <View className={`w-2.5 h-2.5 rounded-full ${dotColor} mr-1.5`} />
      {!compact && (
        <Text className={`text-caption font-medium ${textColor}`}>{label}</Text>
      )}
    </View>
  );
}
