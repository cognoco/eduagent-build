import { Circle, Path } from 'react-native-svg';
import { CelestialCelebration } from './CelestialCelebration';

export function OrionsBelt({
  onComplete,
  testID = 'celebration-orions-belt',
}: {
  onComplete?: () => void;
  testID?: string;
}) {
  return (
    <CelestialCelebration
      color="#c4b5fd"
      accentColor="#ede9fe"
      onComplete={onComplete}
      testID={testID}
    >
      <Circle cx="58" cy="88" r="12" fill="#ddd6fe" opacity="0.92" />
      <Circle cx="90" cy="90" r="12" fill="#f5f3ff" opacity="0.92" />
      <Circle cx="122" cy="92" r="12" fill="#ddd6fe" opacity="0.92" />
      <Path d="M58 88 L122 92" stroke="#ede9fe" strokeWidth="5" />
    </CelestialCelebration>
  );
}
