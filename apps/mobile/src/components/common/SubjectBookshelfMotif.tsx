import { View } from 'react-native';

import type { LearningSubjectTint } from '../../lib/subject-tints';
import { withOpacity } from '../../lib/color-opacity';

// Hoisted to module scope — geometry/opacity only, no theme or prop dependencies.
// Stable reference prevents FlatList row remounts on parent re-renders.
const SPINE_STYLES = [
  { height: 25, width: 7, opacity: 0.72, marginTop: 10 },
  { height: 34, width: 9, opacity: 1, marginTop: 1 },
  { height: 28, width: 8, opacity: 0.84, marginTop: 7, rotate: '-5deg' },
  { height: 31, width: 8, opacity: 0.92, marginTop: 4 },
];

export function SubjectBookshelfMotif({
  testID,
  tint,
}: {
  testID?: string;
  tint: LearningSubjectTint;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="bg-surface/72"
      style={{
        width: 52,
        height: 44,
        borderRadius: 13,
        borderColor: withOpacity(tint.solid, 0.2),
        borderWidth: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 7,
        paddingBottom: 6,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 4,
          height: 34,
        }}
      >
        {SPINE_STYLES.map((spine, index) => (
          <View
            key={index}
            style={{
              width: spine.width,
              height: spine.height,
              marginTop: spine.marginTop,
              borderRadius: 3,
              backgroundColor: tint.solid,
              opacity: spine.opacity,
              transform: spine.rotate ? [{ rotate: spine.rotate }] : undefined,
            }}
          >
            <View
              className="bg-surface/42"
              style={{
                width: 2,
                height: Math.max(10, spine.height - 14),
                borderRadius: 999,
                alignSelf: 'center',
                marginTop: 6,
              }}
            />
          </View>
        ))}
      </View>
      <View
        style={{
          height: 3,
          borderRadius: 999,
          backgroundColor: tint.solid,
          opacity: 0.62,
          marginTop: 3,
        }}
      />
    </View>
  );
}
