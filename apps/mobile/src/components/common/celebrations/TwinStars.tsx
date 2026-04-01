import { Circle, Path } from 'react-native-svg';
import { CelestialCelebration } from './CelestialCelebration';

export function TwinStars({
  onComplete,
  testID = 'celebration-twin-stars',
}: {
  onComplete?: () => void;
  testID?: string;
}) {
  return (
    <CelestialCelebration
      color="#7dd3fc"
      accentColor="#bae6fd"
      onComplete={onComplete}
      testID={testID}
    >
      <Circle cx="66" cy="84" r="18" fill="#e0f2fe" opacity="0.92" />
      <Circle cx="114" cy="96" r="18" fill="#f0f9ff" opacity="0.9" />
      <Path d="M70 86 L108 94" stroke="#e0f2fe" strokeWidth="6" />
    </CelestialCelebration>
  );
}
