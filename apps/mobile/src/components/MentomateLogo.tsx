import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { useTheme } from '../lib/theme';

// ── Brand colors ──────────────────────────────────────────────
const light = {
  violet: '#8b5cf6',
  teal: '#0d9488',
  pink: '#f472b6',
  ltViolet: '#a78bfa',
  mint: '#5eead4',
  lavender: '#f3e8ff',
  ltMint: '#ccfbf1',
  gradStart: '#a78bfa',
  gradEnd: '#14b8a6',
  textDark: '#1c1917',
  textTeal: '#0d9488',
  circleO: '#8b5cf6',
} as const;

const dark = {
  violet: '#8b5cf6',
  teal: '#14b8a6',
  pink: '#f9a8d4',
  ltViolet: '#c4b5fd',
  mint: '#99f6e4',
  lavender: '#f3e8ff',
  ltMint: '#ccfbf1',
  gradStart: '#c4b5fd',
  gradEnd: '#5eead4',
  textDark: '#f1f5f9',
  textTeal: '#5eead4',
  circleO: '#a78bfa',
} as const;

// ── Size presets ──────────────────────────────────────────────
const sizes = {
  sm: { icon: 32, font: 14, circleR: 3.5, circleStroke: 1.2, dotR: 1, gap: 6 },
  md: { icon: 56, font: 20, circleR: 5, circleStroke: 1.6, dotR: 1.5, gap: 10 },
  lg: { icon: 80, font: 28, circleR: 7, circleStroke: 1.8, dotR: 2, gap: 14 },
} as const;

type Variant = 'icon' | 'horizontal' | 'stacked';
type Size = 'sm' | 'md' | 'lg';

type MentomateLogoProps = {
  variant?: Variant;
  size?: Size;
  /** Override automatic light/dark detection */
  colorScheme?: 'light' | 'dark';
};

/** Static Mentomate brand logo — icon only, horizontal lockup, or stacked lockup. */
export function MentomateLogo({
  variant = 'stacked',
  size = 'md',
  colorScheme: colorSchemeProp,
}: MentomateLogoProps) {
  const { colorScheme: appScheme } = useTheme();
  const scheme = colorSchemeProp ?? appScheme ?? 'light';
  const c = scheme === 'dark' ? dark : light;
  const s = sizes[size];
  const gradId = `logo-grad-${size}`;

  const icon = (
    <Svg width={s.icon} height={s.icon} viewBox="-5 -15 130 130">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0%" stopColor={c.gradStart} />
          <Stop offset="100%" stopColor={c.gradEnd} />
        </LinearGradient>
      </Defs>

      {/* Growth arc */}
      <Path
        d="M20,100 C20,55 100,55 100,10"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={4}
        strokeLinecap="round"
      />

      {/* Stepping stones */}
      <Circle cx={33} cy={73} r={4} fill={c.pink} opacity={0.55} />
      <Circle cx={60} cy={55} r={5} fill={c.ltViolet} opacity={0.6} />
      <Circle cx={88} cy={37} r={6} fill={c.mint} opacity={0.7} />

      {/* Student node */}
      <Circle cx={20} cy={100} r={15} fill={c.violet} />
      <Circle cx={20} cy={100} r={6.5} fill={c.lavender} />

      {/* Achievement ring */}
      <Circle
        cx={100}
        cy={10}
        r={22}
        fill="none"
        stroke={c.teal}
        strokeWidth={1.5}
        opacity={0.18}
      />

      {/* Mentor node */}
      <Circle cx={100} cy={10} r={17} fill={c.teal} />
      <Circle cx={100} cy={10} r={7} fill={c.ltMint} />
    </Svg>
  );

  if (variant === 'icon') return icon;

  const wordmark = (
    <View style={styles.wordmark}>
      <Text style={[styles.text, { fontSize: s.font, color: c.textDark }]}>
        ment
      </Text>
      <View
        style={[
          styles.circleO,
          {
            width: s.circleR * 2,
            height: s.circleR * 2,
            borderRadius: s.circleR,
            borderWidth: s.circleStroke,
            borderColor: c.circleO,
            marginHorizontal: s.gap * 0.15,
            marginBottom: s.font * 0.06,
          },
        ]}
      >
        <View
          style={[
            styles.circleODot,
            {
              width: s.dotR * 2,
              height: s.dotR * 2,
              borderRadius: s.dotR,
              backgroundColor: c.circleO,
            },
          ]}
        />
      </View>
      <Text style={[styles.text, { fontSize: s.font, color: c.textTeal }]}>
        mate
      </Text>
    </View>
  );

  if (variant === 'horizontal') {
    return (
      <View style={[styles.horizontal, { gap: s.gap }]}>
        {icon}
        {wordmark}
      </View>
    );
  }

  // stacked (default)
  return (
    <View style={styles.stacked}>
      {icon}
      <View style={{ height: s.gap * 0.8 }} />
      {wordmark}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stacked: {
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: 'AtkinsonHyperlegible_700Bold',
    letterSpacing: -0.5,
  },
  circleO: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleODot: {},
});
