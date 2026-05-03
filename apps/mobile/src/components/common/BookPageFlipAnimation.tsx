import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  Rect as SvgRect,
  LinearGradient,
  Stop,
} from 'react-native-svg';

interface BookPageFlipAnimationProps {
  size?: number;
  color?: string;
  testID?: string;
}

const TEAL = '#2dd4bf';
const PURPLE = '#a855f7';
const PURPLE_DARK = '#581c87';
const DARK_BLUE = '#07111f';
const INK = '#1e293b';
const PAGE_LIGHT = '#f8f1df';
const PAGE_DARK = '#2a2520';
const PAGE_EDGE_LIGHT = '#d9c7a2';
const PAGE_EDGE_DARK = '#1e1a17';
const PAGE_ALT_LIGHT = '#f4ead2';
const PAGE_ALT_DARK = '#241f1b';
const GLOW_COLOR = '#fbbf24';

const FLIP_SEG_MS = 560;
const STAGGER_MS = 300;
const ISO_HALF_MS = 1500;
const MOTE_PERIOD_MS = 2700;

function PageTextLines({
  w,
  h,
  dark,
}: {
  w: number;
  h: number;
  dark: boolean;
}) {
  const c = dark ? '#64748b' : INK;
  return (
    <>
      {[0.18, 0.28, 0.39, 0.5, 0.66, 0.77].map((frac, i) => (
        <View
          key={frac}
          style={{
            position: 'absolute',
            top: h * frac,
            left: w * 0.14,
            width: w * (0.6 + (i % 2) * 0.1),
            height: Math.max(1.5, w * 0.04),
            borderRadius: w * 0.02,
            backgroundColor: c,
            opacity: i % 2 ? 0.25 : 0.35,
          }}
        />
      ))}
    </>
  );
}

function TurningPage({
  flip,
  shadow,
  pw,
  ph,
  pl,
  pt,
  dark,
  z,
}: {
  flip: SharedValue<number>;
  shadow: SharedValue<number>;
  pw: number;
  ph: number;
  pl: number;
  pt: number;
  dark: boolean;
  z: number;
}) {
  const pageC = dark ? PAGE_DARK : PAGE_LIGHT;
  const edgeC = dark ? PAGE_EDGE_DARK : PAGE_EDGE_LIGHT;

  const flipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -pw / 2 },
      { perspective: 800 },
      { rotateY: `${flip.value}deg` },
      { translateX: pw / 2 },
    ],
  }));

  const frontOp = useAnimatedStyle(() => ({
    opacity: Math.abs(flip.value) <= 90 ? 1 : 0,
  }));

  const backOp = useAnimatedStyle(() => ({
    opacity: Math.abs(flip.value) > 90 ? 1 : 0,
  }));

  const shadowOp = useAnimatedStyle(() => ({
    opacity: shadow.value,
  }));

  const r = Math.max(2, pw * 0.06);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: pl,
          top: pt,
          width: pw,
          height: ph,
          zIndex: z,
        },
        flipStyle,
        { pointerEvents: 'none' },
      ]}
    >
      {/* Back face (mirrored so text reads correctly when flipped) */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: pw,
            height: ph,
            borderTopLeftRadius: r,
            borderBottomLeftRadius: r,
            borderTopRightRadius: 2,
            borderBottomRightRadius: 2,
            overflow: 'hidden',
            transform: [{ scaleX: -1 }],
          },
          backOp,
        ]}
      >
        <View style={{ flex: 1, backgroundColor: edgeC }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '70%',
              height: '100%',
              backgroundColor: pageC,
            }}
          />
        </View>
        <PageTextLines w={pw} h={ph} dark={dark} />
      </Animated.View>

      {/* Front face */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: pw,
            height: ph,
            borderTopLeftRadius: 2,
            borderBottomLeftRadius: 2,
            borderTopRightRadius: r,
            borderBottomRightRadius: r,
            overflow: 'hidden',
          },
          frontOp,
        ]}
      >
        <View style={{ flex: 1, backgroundColor: pageC }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '30%',
              height: '100%',
              backgroundColor: edgeC,
            }}
          />
        </View>
        <PageTextLines w={pw} h={ph} dark={dark} />
      </Animated.View>

      {/* Shadow cast during turn */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: pw,
            height: ph,
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: 3,
          },
          shadowOp,
        ]}
      />
    </Animated.View>
  );
}

export function BookPageFlipAnimation({
  size = 140,
  color,
  testID,
}: BookPageFlipAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const isDark = useColorScheme() === 'dark';

  // Colors
  const pageC = isDark ? PAGE_DARK : PAGE_LIGHT;
  const edgeC = isDark ? PAGE_EDGE_DARK : PAGE_EDGE_LIGHT;
  const altC = isDark ? PAGE_ALT_DARK : PAGE_ALT_LIGHT;
  void color;

  // Layout (fractions of size)
  const coverW = size * 0.38;
  const coverH = size * 0.5;
  const coverTop = size * 0.3;
  const leftX = size * 0.12;
  const rightX = size * 0.52;
  const spineX = size * 0.49;
  const spineW = size * 0.05;
  const spineH = size * 0.54;
  const spineTop = size * 0.28;
  const blockX = size * 0.2;
  const blockTop = size * 0.28;
  const blockW = size * 0.6;
  const blockH = size * 0.5;
  const pgTop = size * 0.3;
  const pgH = size * 0.46;
  const pgW = size * 0.28;
  const pgLeftX = size * 0.22;
  const pgRightX = size * 0.52;
  const coverR = Math.max(4, size * 0.06);
  const moteSize = Math.max(3, size * 0.028);

  // Glow behind spine
  const glowW = spineW * 5;
  const glowH = coverH * 0.8;
  const glowX = spineX - glowW / 2 + spineW / 2;
  const glowTop = coverTop + coverH * 0.1;

  // Shared values
  const isoX = useSharedValue(reduceMotion ? 44 : 42);
  const isoY = useSharedValue(reduceMotion ? 5 : 6);
  const flip1 = useSharedValue(0);
  const flip2 = useSharedValue(0);
  const flip3 = useSharedValue(0);
  const shd1 = useSharedValue(0);
  const shd2 = useSharedValue(0);
  const shd3 = useSharedValue(0);
  const glowOp = useSharedValue(reduceMotion ? 0.15 : 0.1);
  const mote1 = useSharedValue(0);
  const mote2 = useSharedValue(0);
  const mote3 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      isoX.value = 44;
      isoY.value = 5;
      glowOp.value = 0.15;
      return;
    }

    const ease = Easing.inOut(Easing.ease);

    // Isometric breathing
    isoX.value = withRepeat(
      withSequence(
        withTiming(46, { duration: ISO_HALF_MS, easing: ease }),
        withTiming(42, { duration: ISO_HALF_MS, easing: ease })
      ),
      -1,
      false
    );
    isoY.value = withRepeat(
      withSequence(
        withTiming(4, { duration: ISO_HALF_MS, easing: ease }),
        withTiming(6, { duration: ISO_HALF_MS, easing: ease })
      ),
      -1,
      false
    );

    // Page flips (staggered, each page has own cycle for organic drift)
    const mkFlip = (delay: number) =>
      withRepeat(
        withSequence(
          ...(delay > 0 ? [withTiming(0, { duration: delay })] : []),
          withTiming(-60, { duration: FLIP_SEG_MS, easing: ease }),
          withTiming(-140, { duration: FLIP_SEG_MS, easing: ease }),
          withTiming(-180, { duration: FLIP_SEG_MS, easing: ease }),
          withTiming(-180, { duration: FLIP_SEG_MS }),
          withTiming(0, { duration: FLIP_SEG_MS, easing: ease })
        ),
        -1,
        false
      );

    const mkShadow = (delay: number) =>
      withRepeat(
        withSequence(
          ...(delay > 0 ? [withTiming(0, { duration: delay })] : []),
          withTiming(0.25, { duration: FLIP_SEG_MS }),
          withTiming(0.5, { duration: FLIP_SEG_MS }),
          withTiming(0.15, { duration: FLIP_SEG_MS }),
          withTiming(0, { duration: FLIP_SEG_MS }),
          withTiming(0, { duration: FLIP_SEG_MS })
        ),
        -1,
        false
      );

    flip1.value = mkFlip(0);
    flip2.value = mkFlip(STAGGER_MS);
    flip3.value = mkFlip(STAGGER_MS * 2);
    shd1.value = mkShadow(0);
    shd2.value = mkShadow(STAGGER_MS);
    shd3.value = mkShadow(STAGGER_MS * 2);

    // Glow synced with page flips
    glowOp.value = withRepeat(
      withSequence(
        withTiming(0.45, {
          duration: FLIP_SEG_MS + STAGGER_MS,
          easing: ease,
        }),
        withTiming(0.1, {
          duration: FLIP_SEG_MS * 3,
          easing: ease,
        })
      ),
      -1,
      false
    );

    // Dust motes
    mote1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: MOTE_PERIOD_MS }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    mote2.value = withRepeat(
      withSequence(
        withDelay(
          MOTE_PERIOD_MS * 0.35,
          withTiming(1, { duration: MOTE_PERIOD_MS * 1.1 })
        ),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    mote3.value = withRepeat(
      withSequence(
        withDelay(
          MOTE_PERIOD_MS * 0.65,
          withTiming(1, { duration: MOTE_PERIOD_MS * 0.9 })
        ),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(isoX);
      cancelAnimation(isoY);
      cancelAnimation(flip1);
      cancelAnimation(flip2);
      cancelAnimation(flip3);
      cancelAnimation(shd1);
      cancelAnimation(shd2);
      cancelAnimation(shd3);
      cancelAnimation(glowOp);
      cancelAnimation(mote1);
      cancelAnimation(mote2);
      cancelAnimation(mote3);
    };
  }, [
    reduceMotion,
    isoX,
    isoY,
    flip1,
    flip2,
    flip3,
    shd1,
    shd2,
    shd3,
    glowOp,
    mote1,
    mote2,
    mote3,
  ]);

  // Styles
  const isoStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateX: `${isoX.value}deg` },
      { rotateY: `${isoY.value}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
  }));

  const MOTE_RISE = size * 0.28;
  const mote1Style = useAnimatedStyle(() => ({
    opacity: (1 - mote1.value) * 0.7,
    transform: [
      { translateY: -MOTE_RISE * mote1.value },
      { translateX: mote1.value * size * 0.06 },
    ],
  }));
  const mote2Style = useAnimatedStyle(() => ({
    opacity: (1 - mote2.value) * 0.6,
    transform: [
      { translateY: -MOTE_RISE * mote2.value },
      { translateX: -mote2.value * size * 0.05 },
    ],
  }));
  const mote3Style = useAnimatedStyle(() => ({
    opacity: (1 - mote3.value) * 0.65,
    transform: [
      { translateY: -MOTE_RISE * mote3.value },
      { translateX: mote3.value * size * 0.04 },
    ],
  }));

  const staticIso = {
    transform: [
      { perspective: 1000 as number },
      { rotateX: '44deg' },
      { rotateY: '5deg' },
    ],
  };

  return (
    <View
      testID={testID}
      accessibilityLabel="Loading content"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Isometric wrapper */}
      <Animated.View
        style={[
          { position: 'absolute', left: 0, top: 0, width: size, height: size },
          !reduceMotion ? isoStyle : staticIso,
          { pointerEvents: 'none' },
        ]}
      >
        {/* Left cover (dark blue → purple dark) */}
        <View
          style={{
            position: 'absolute',
            left: leftX,
            top: coverTop,
            width: coverW,
            height: coverH,
            borderTopLeftRadius: coverR,
            borderBottomLeftRadius: coverR,
            overflow: 'hidden',
          }}
        >
          <Svg width={coverW} height={coverH}>
            <Defs>
              <LinearGradient id="blc" x1="0" y1="0" x2="0.7" y2="0.9">
                <Stop offset="0" stopColor={DARK_BLUE} />
                <Stop offset="1" stopColor={PURPLE_DARK} />
              </LinearGradient>
            </Defs>
            <SvgRect
              x={0}
              y={0}
              width={coverW}
              height={coverH}
              fill="url(#blc)"
            />
          </Svg>
        </View>

        {/* Page block (stacked pages visible between covers) */}
        <View
          style={{
            position: 'absolute',
            left: blockX,
            top: blockTop,
            width: blockW,
            height: blockH,
            borderRadius: 4,
            overflow: 'hidden',
            backgroundColor: edgeC,
          }}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: i * blockH * 0.007,
                width: blockW,
                height: blockH,
                backgroundColor: i % 2 ? pageC : altC,
                opacity: 0.92 - i * 0.015,
                transform: [{ translateX: i * 0.7 }],
              }}
            />
          ))}
        </View>

        {/* Spine (teal → purple gradient) */}
        <View
          style={{
            position: 'absolute',
            left: spineX,
            top: spineTop,
            width: spineW,
            height: spineH,
            overflow: 'hidden',
          }}
        >
          <Svg width={spineW} height={spineH}>
            <Defs>
              <LinearGradient id="bsp" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={TEAL} />
                <Stop offset="1" stopColor={PURPLE} />
              </LinearGradient>
            </Defs>
            <SvgRect
              x={0}
              y={0}
              width={spineW}
              height={spineH}
              fill="url(#bsp)"
            />
          </Svg>
        </View>

        {/* Right cover (purple → dark blue) */}
        <View
          style={{
            position: 'absolute',
            left: rightX,
            top: spineTop,
            width: coverW,
            height: coverH,
            borderTopRightRadius: coverR,
            borderBottomRightRadius: coverR,
            overflow: 'hidden',
          }}
        >
          <Svg width={coverW} height={coverH}>
            <Defs>
              <LinearGradient id="brc" x1="0" y1="0" x2="0.7" y2="0.9">
                <Stop offset="0" stopColor={PURPLE} />
                <Stop offset="1" stopColor={DARK_BLUE} />
              </LinearGradient>
            </Defs>
            <SvgRect
              x={0}
              y={0}
              width={coverW}
              height={coverH}
              fill="url(#brc)"
            />
          </Svg>
        </View>

        {/* Static left page */}
        <View
          style={{
            position: 'absolute',
            left: pgLeftX,
            top: pgTop,
            width: pgW,
            height: pgH,
            borderTopLeftRadius: 6,
            borderBottomLeftRadius: 6,
            borderTopRightRadius: 2,
            borderBottomRightRadius: 2,
            overflow: 'hidden',
          }}
        >
          <View style={{ flex: 1, backgroundColor: edgeC }}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '70%',
                height: '100%',
                backgroundColor: pageC,
              }}
            />
          </View>
          <PageTextLines w={pgW} h={pgH} dark={isDark} />
        </View>

        {/* Static right page */}
        <View
          style={{
            position: 'absolute',
            left: pgRightX,
            top: pgTop,
            width: pgW,
            height: pgH,
            borderTopLeftRadius: 2,
            borderBottomLeftRadius: 2,
            borderTopRightRadius: 6,
            borderBottomRightRadius: 6,
            overflow: 'hidden',
          }}
        >
          <View style={{ flex: 1, backgroundColor: pageC }}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '30%',
                height: '100%',
                backgroundColor: edgeC,
              }}
            />
          </View>
          <PageTextLines w={pgW} h={pgH} dark={isDark} />
        </View>

        {/* Turning pages */}
        {!reduceMotion && (
          <>
            <TurningPage
              flip={flip3}
              shadow={shd3}
              pw={pgW}
              ph={pgH}
              pl={pgRightX}
              pt={pgTop}
              dark={isDark}
              z={20}
            />
            <TurningPage
              flip={flip2}
              shadow={shd2}
              pw={pgW}
              ph={pgH}
              pl={pgRightX}
              pt={pgTop}
              dark={isDark}
              z={25}
            />
            <TurningPage
              flip={flip1}
              shadow={shd1}
              pw={pgW}
              ph={pgH}
              pl={pgRightX}
              pt={pgTop}
              dark={isDark}
              z={30}
            />
          </>
        )}
      </Animated.View>

      {/* Warm glow behind spine */}
      {!reduceMotion && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: glowX,
              top: glowTop,
              width: glowW,
              height: glowH,
              borderRadius: glowH / 2,
              backgroundColor: GLOW_COLOR,
            },
            glowStyle,
            { pointerEvents: 'none' },
          ]}
        />
      )}

      {/* Dust motes */}
      {!reduceMotion && (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: spineX + spineW * 0.2,
                top: coverTop + coverH * 0.55,
                width: moteSize,
                height: moteSize,
                borderRadius: moteSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              mote1Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: spineX + spineW * 0.6,
                top: coverTop + coverH * 0.45,
                width: moteSize * 0.85,
                height: moteSize * 0.85,
                borderRadius: moteSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              mote2Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: spineX - spineW * 0.2,
                top: coverTop + coverH * 0.65,
                width: moteSize * 0.7,
                height: moteSize * 0.7,
                borderRadius: moteSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              mote3Style,
              { pointerEvents: 'none' },
            ]}
          />
        </>
      )}
    </View>
  );
}
