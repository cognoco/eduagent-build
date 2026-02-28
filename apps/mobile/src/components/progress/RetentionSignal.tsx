import { View, Text } from 'react-native';

export type RetentionStatus = 'strong' | 'fading' | 'weak' | 'forgotten';

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
    dotColor: 'bg-retention-forgotten',
    textColor: 'text-retention-forgotten',
  },
};

export function RetentionSignal({ status, compact }: RetentionSignalProps) {
  const { label, dotColor, textColor } = CONFIG[status];

  return (
    <View
      className="flex-row items-center"
      testID={`retention-signal-${status}`}
      accessibilityLabel={`Retention: ${label}`}
      accessibilityRole="text"
    >
      <View
        className={`w-2.5 h-2.5 rounded-full ${dotColor} ${
          compact ? '' : 'me-1.5'
        }`}
      />
      {!compact && (
        <Text className={`text-caption font-medium ${textColor}`}>{label}</Text>
      )}
    </View>
  );
}
