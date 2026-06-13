import type React from 'react';
import { Fragment } from 'react';
import Svg, {
  Circle,
  Ellipse,
  Path,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import {
  MASCOT_COLORS,
  MASCOT_HERO,
  MASCOT_BADGE,
} from './mentor-mascot-geometry';

type MentorMascotProps = {
  /** Rendered width in px; height follows the pose's aspect ratio. Default 160. */
  size?: number;
  /**
   * hero: full eight-arm sprawl (ceremonies, ≥120px).
   * badge: compact tucked-arm crop (small surfaces ~48–96px).
   */
  pose?: 'hero' | 'badge';
  testID?: string;
};

/**
 * The Mentor — static render of the brand mascot (ceremony character).
 *
 * Brand-fixed colors by design; geometry shared with BrandCelebration via
 * mentor-mascot-geometry.ts. For the animated celebration use BrandCelebration;
 * this component is the still portrait.
 */
export function MentorMascot({
  size = 160,
  pose = 'hero',
  testID,
}: MentorMascotProps): React.JSX.Element {
  const g = pose === 'hero' ? MASCOT_HERO : MASCOT_BADGE;
  const height = Math.round((size * g.height) / g.width);
  const gradId = `mascot-body-${pose}`;

  return (
    <Svg
      width={size}
      height={height}
      viewBox={g.viewBox}
      testID={testID}
      accessibilityLabel="Your mentor"
      accessibilityRole="image"
    >
      <Defs>
        <LinearGradient
          id={gradId}
          x1="0"
          y1={g.gradient.y1}
          x2="0"
          y2={g.gradient.y2}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={MASCOT_COLORS.tealBright} />
          <Stop offset="100%" stopColor={MASCOT_COLORS.tealDeep} />
        </LinearGradient>
      </Defs>

      {/* arms (tucked under the body) */}
      {g.arms.map((arm) => (
        <Path key={arm.d} d={arm.d} fill={arm.fill} />
      ))}

      {/* body: head + skirt sharing one userSpaceOnUse gradient (seamless) */}
      <Circle
        cx={g.head.cx}
        cy={g.head.cy}
        r={g.head.r}
        fill={`url(#${gradId})`}
      />
      <Ellipse
        cx={g.skirt.cx}
        cy={g.skirt.cy}
        rx={g.skirt.rx}
        ry={g.skirt.ry}
        fill={`url(#${gradId})`}
      />

      {/* beanie */}
      <Path d={g.beanie.dome} fill={MASCOT_COLORS.beanie} />
      <Rect
        x={g.beanie.band.x}
        y={g.beanie.band.y}
        width={g.beanie.band.width}
        height={g.beanie.band.height}
        rx={g.beanie.band.rx}
        fill={MASCOT_COLORS.beanieBand}
      />

      {/* suckers (hero pose only — unreadable at badge sizes) */}
      {pose === 'hero'
        ? MASCOT_HERO.suckers.map((s) => (
            <Ellipse
              key={`${s.cx}-${s.cy}`}
              cx={s.cx}
              cy={s.cy}
              rx={s.rx}
              ry={s.ry}
              fill={MASCOT_COLORS.mint}
              opacity={0.9}
            />
          ))
        : null}

      {/* eyes: white ball, low pupil, flat skin-gradient lid + crease */}
      {([g.eyes.left, g.eyes.right] as const).map((eye) => (
        <Fragment key={eye.cx}>
          <Circle
            cx={eye.cx}
            cy={g.eyes.cy}
            r={g.eyes.r}
            fill={MASCOT_COLORS.white}
          />
          <Circle
            cx={eye.cx}
            cy={g.eyes.pupilCy}
            r={g.eyes.pupilR}
            fill={MASCOT_COLORS.navy}
          />
          <Path d={eye.lid} fill={`url(#${gradId})`} />
          <Path
            d={eye.crease}
            stroke={MASCOT_COLORS.crease}
            strokeWidth={g.eyes.creaseWidth}
            strokeLinecap="round"
          />
        </Fragment>
      ))}

      {/* smirk */}
      <Path
        d={g.smirk.d}
        fill="none"
        stroke={MASCOT_COLORS.navy}
        strokeWidth={g.smirk.width}
        strokeLinecap="round"
      />
    </Svg>
  );
}
