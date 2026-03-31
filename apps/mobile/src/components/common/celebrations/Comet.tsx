import { Circle, Path } from 'react-native-svg';
import { CelestialCelebration } from './CelestialCelebration';

export function Comet({
  onComplete,
  testID = 'celebration-comet',
}: {
  onComplete?: () => void;
  testID?: string;
}) {
  return (
    <CelestialCelebration
      color="#34d399"
      accentColor="#a7f3d0"
      onComplete={onComplete}
      testID={testID}
    >
      <Path
        d="M34 122 C64 118, 94 96, 128 58"
        stroke="#6ee7b7"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="132" cy="54" r="16" fill="#d1fae5" opacity="0.95" />
    </CelestialCelebration>
  );
}
