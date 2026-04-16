import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface LightBulbAnimationProps {
  /** Overall size in pixels (default: 48) */
  size?: number;
  /** Bulb outline color (default: theme muted gray) */
  color?: string;
  testID?: string;
}

// --- SVG paths (viewBox 0 0 64 64) ---
// Bulb silhouette
const BULB_OUTER =
  'M32 4 C18 4 8 16 8 28 C8 38 14 44 20 48 L20 52 L44 52 L44 48 C50 44 56 38 56 28 C56 16 46 4 32 4 Z';
// Screw base
const BASE_TOP = 'M22 52 L42 52 L42 56 L22 56 Z';
const BASE_MID = 'M24 56 L40 56 L40 60 L24 60 Z';
const BASE_BOT = 'M26 60 L38 60 L38 62 L26 62 Z';
// Filaments
const FILAMENT_1 = 'M28 36 C28 28 32 24 32 20';
const FILAMENT_2 = 'M36 36 C36 28 32 24 32 20';

// Glow color
const GLOW_COLOR = '#fbbf24';

// Ray lines — 6 directions radiating from bulb center (viewBox 0 0 64 64)
// Each ray is a short line from just outside the bulb outline outward.
const RAYS = [
  'M32 2 L32 -4', // top
  'M52 12 L58 6', // top-right
  'M58 28 L64 28', // right
  'M52 44 L58 50', // bottom-right
  'M12 12 L6 6', // top-left
  'M6 28 L0 28', // left
];
const RAY_LENGTH = 8;

/**
 * Cartoon light bulb that pulses with a warm glow.
 * Used as "AI is thinking" indicator in ChatShell.
 *
 * Core animation: pulsing Animated.View glow behind a static SVG bulb.
 * All animation uses useAnimatedStyle (Fabric-safe).
 */
export function LightBulbAnimation({
  size = 48,
  color = '#9ca3af',
  testID,
}: LightBulbAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  const showRays = size >= 80;
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.35);
  const rayDash = useSharedValue(RAY_LENGTH);

  useEffect(() => {
    if (reduceMotion) {
      glowScale.value = 1;
      glowOpacity.value = 0.35;
      rayDash.value = 0;
      return;
    }

    // Pulsing glow — the core animation users perceive at 48px
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Rays pulse in sync with glow (only rendered at >= 80px)
    if (showRays) {
      rayDash.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(RAY_LENGTH, {
            duration: 900,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      );
    }

    return () => {
      cancelAnimation(glowScale);
      cancelAnimation(glowOpacity);
      cancelAnimation(rayDash);
    };
  }, [reduceMotion, glowScale, glowOpacity, rayDash, showRays]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const rayProps = useAnimatedProps(() => ({
    strokeDashoffset: rayDash.value,
  }));

  const bulbR = size * 0.38;

  return (
    <View
      testID={testID}
      accessibilityLabel="Thinking"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Glow — Animated.View behind the SVG */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: bulbR * 2,
            height: bulbR * 2,
            borderRadius: bulbR,
            backgroundColor: GLOW_COLOR,
            left: size / 2 - bulbR,
            top: size * 0.18,
          },
          glowStyle,
        ]}
        pointerEvents="none"
      />
      {/* Bulb SVG — static shape */}
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Bulb body */}
        <Path
          d={BULB_OUTER}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Screw base */}
        <Path d={BASE_TOP} fill={color} opacity={0.6} />
        <Path d={BASE_MID} fill={color} opacity={0.5} />
        <Path d={BASE_BOT} fill={color} opacity={0.4} />
        {/* Filaments */}
        <Path
          d={FILAMENT_1}
          fill="none"
          stroke={GLOW_COLOR}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.8}
        />
        <Path
          d={FILAMENT_2}
          fill="none"
          stroke={GLOW_COLOR}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.8}
        />
        {/* Rays — only rendered at >= 80px */}
        {showRays &&
          RAYS.map((d, i) => (
            <AnimatedPath
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={RAY_LENGTH}
              animatedProps={rayProps}
              opacity={0.5}
            />
          ))}
      </Svg>
    </View>
  );
}
