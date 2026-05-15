import { View } from 'react-native';
import type { ViewStyle } from 'react-native';

interface ProgressBarProps {
  value: number;
  max: number;
  fillClassName?: string;
  fillColor?: string;
  testID?: string;
}

export function ProgressBar({
  value,
  max,
  fillClassName = 'bg-primary',
  fillColor,
  testID,
}: ProgressBarProps): React.ReactElement {
  const safeMax = Math.max(1, max);
  const widthPct = Math.max(
    0,
    Math.min(100, Math.round((value / safeMax) * 100)),
  );

  return (
    <View
      className="h-2 rounded-full bg-border overflow-hidden"
      testID={testID}
    >
      <View
        className={`h-full rounded-full ${fillClassName}`}
        style={
          {
            width: `${widthPct}%`,
            ...(fillColor ? { backgroundColor: fillColor } : {}),
          } as ViewStyle
        }
      />
    </View>
  );
}
