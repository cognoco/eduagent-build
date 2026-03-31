import { Path } from 'react-native-svg';
import { CelestialCelebration } from './CelestialCelebration';

export function PolarStar({
  onComplete,
  testID = 'celebration-polar-star',
}: {
  onComplete?: () => void;
  testID?: string;
}) {
  return (
    <CelestialCelebration
      color="#f7c948"
      accentColor="#fce588"
      onComplete={onComplete}
      testID={testID}
    >
      <Path
        d="M90 28 L97 70 L132 90 L97 110 L90 152 L83 110 L48 90 L83 70 Z"
        fill="#fff7cc"
        opacity="0.92"
      />
    </CelestialCelebration>
  );
}
