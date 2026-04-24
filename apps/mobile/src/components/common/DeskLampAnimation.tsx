import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';

interface DeskLampAnimationProps {
  /** Overall size in pixels (default: 96) */
  size?: number;
  /** Lamp silhouette color (default: theme muted gray) */
  color?: string;
  testID?: string;
}

// Warm amber for the light cone and glow effects
const WARM_COLOR = '#fbbf24';

// Lamp geometry (viewBox 0 0 64 64)
const BASE = 'M24 57 L40 57 L40 60 L24 60 Z';
const STEM = 'M32 57 L32 44';
const ARM = 'M32 44 C34 38, 38 32, 42 26';
const SHADE = 'M30 18 L50 18 L52 26 L28 26 Z';
const SHADE_RIM = 'M29 26 L51 26';
const LIGHT_CONE = 'M29 26 L22 56 L54 56 L51 26 Z';
const DESK_LINE = 'M16 60 L48 60';

/**
 * Desk lamp that slowly lights up the space underneath.
 * Used as "AI is thinking" indicator — replaces LightBulbAnimation.
 *
 * The lamp silhouette is always visible. The light cone underneath the
 * shade pulses warm amber: dim → bright → dim, creating a gentle
 * "thinking" rhythm.
 *
 * 48px: basic lamp + light pulse
 * 80px+: desk surface glow, brighter bulb dot
 */
export function DeskLampAnimation({
  size = 96,
  color = '#9ca3af',
  testID,
}: DeskLampAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const showEnhanced = size >= 48;

  const lightOp = useSharedValue(reduceMotion ? 0.3 : 0.06);
  const deskGlowOp = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      lightOp.value = 0.3;
      return;
    }

    // Gentle warm pulsing — slow "thinking" rhythm
    lightOp.value = withRepeat(
      withSequence(
        withTiming(0.45, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.06, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      true
    );

    // Desk surface glow — slightly delayed echo (80px+ only)
    if (showEnhanced) {
      deskGlowOp.value = withRepeat(
        withSequence(
          withTiming(0.2, {
            duration: 1300,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.03, {
            duration: 1300,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      );
    }

    return () => {
      cancelAnimation(lightOp);
      cancelAnimation(deskGlowOp);
    };
  }, [reduceMotion, lightOp, deskGlowOp, showEnhanced]);

  const lightStyle = useAnimatedStyle(() => ({
    opacity: lightOp.value,
  }));

  const deskGlowStyle = useAnimatedStyle(() => ({
    opacity: deskGlowOp.value,
  }));

  return (
    <View
      testID={testID}
      accessibilityLabel="Thinking"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Light cone layer — behind the lamp silhouette */}
      <Animated.View
        style={[
          { position: 'absolute', width: size, height: size },
          lightStyle,
          { pointerEvents: 'none' },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {/* Bulb glow halo — soft, larger outer ring */}
          <Circle cx={40} cy={24} r={7} fill={WARM_COLOR} opacity={0.35} />
          {/* Bulb glow core — bigger and brighter so the lamp reads as "lit" */}
          <Circle cx={40} cy={24} r={4.5} fill={WARM_COLOR} opacity={0.95} />
          {/* Main light cone */}
          <Path d={LIGHT_CONE} fill={WARM_COLOR} />
        </Svg>
      </Animated.View>

      {/* Desk surface glow (80px+ only) */}
      {showEnhanced && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: size * 0.06,
              left: size * 0.2,
              width: size * 0.6,
              height: size * 0.06,
              borderRadius: size * 0.03,
              backgroundColor: WARM_COLOR,
            },
            deskGlowStyle,
            { pointerEvents: 'none' },
          ]}
        />
      )}

      {/* Lamp silhouette — static, always visible */}
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Base */}
        <Path d={BASE} fill={color} opacity={0.7} />
        {/* Stem */}
        <Path
          d={STEM}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
        />
        {/* Arm joint */}
        <Circle cx={32} cy={44} r={2} fill={color} opacity={0.6} />
        {/* Arm */}
        <Path
          d={ARM}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        {/* Shade */}
        <Path d={SHADE} fill={color} opacity={0.9} />
        {/* Shade rim */}
        <Path
          d={SHADE_RIM}
          stroke={color}
          strokeWidth={1}
          opacity={0.4}
          fill="none"
        />
        {/* Desk surface line */}
        <Path
          d={DESK_LINE}
          stroke={color}
          strokeWidth={0.5}
          opacity={0.2}
          fill="none"
        />
      </Svg>
    </View>
  );
}
