import { Dimensions, View } from 'react-native';

// [BUG-711 / ACC-8] On narrow devices (<380pt) the session header right row
// (timer | badge | dots | endButton) overflows. MilestoneDots is the
// lowest-priority indicator (the same milestone progress is conveyed by chat
// content + summary screen), so we drop it on narrow screens to keep the
// higher-priority controls (Timer / Badge / End-session) fully visible.
//
// Uses Dimensions.get rather than useWindowDimensions because the screen
// decision is set on mount and a rotation re-render of the parent will
// re-evaluate this. This keeps the helper testable without mocking the
// useWindowDimensions hook (which drags in the full RN module graph).
export const MILESTONE_DOTS_NARROW_BREAKPOINT_PT = 380;

interface MilestoneDotsProps {
  count: number;
}

export function MilestoneDots({ count }: MilestoneDotsProps) {
  if (count <= 0) return null;
  const { width } = Dimensions.get('window');
  if (width < MILESTONE_DOTS_NARROW_BREAKPOINT_PT) return null;

  // [BUG-645 / ACC-1] Bare colored dots are invisible to screen readers.
  // The aggregate View carries the label so VoiceOver/TalkBack reads
  // "3 milestones reached" instead of skipping the indicator entirely.
  const accessibilityLabel =
    count === 1 ? '1 milestone reached' : `${count} milestones reached`;

  return (
    <View
      className="ms-2 flex-row items-center gap-1"
      testID="milestone-dots"
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {Array.from({ length: Math.min(count, 6) }).map((_, index) => (
        <View
          key={index}
          className="w-2 h-2 rounded-full bg-primary"
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      ))}
    </View>
  );
}
