import type React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import IconLight from '../../assets/images/logo-icon-light.svg';
import IconDark from '../../assets/images/logo-icon-dark.svg';
import { useTheme } from '../lib/theme';

// ── Size presets ──────────────────────────────────────────────
const sizes = {
  sm: { icon: 48, font: 16, gap: 6 },
  md: { icon: 72, font: 22, gap: 8 },
  lg: { icon: 96, font: 28, gap: 10 },
} as const;

type Size = 'sm' | 'md' | 'lg';

type MentomateLogoProps = {
  size?: Size;
  orientation?: 'vertical' | 'horizontal';
};

/**
 * Brand-fixed wordmark colors matching the canonical SVGs
 * (logo-icon-light.svg, logo-icon-dark.svg) and AnimatedSplash.
 */
const BRAND = {
  light: {
    ment: '#1a1a3e', // dark navy (dark-mode bg flipped as text)
    circle: '#8b5cf6', // violet
    mate: '#0d9488', // teal
  },
  dark: {
    ment: '#faf5ee', // cream (light-mode bg flipped as text)
    circle: '#a78bfa', // light violet
    mate: '#5eead4', // light teal
  },
} as const;

/**
 * Mentomate brand logo — SVG icon + native Text wordmark.
 * Automatically picks light/dark variant based on the active theme.
 * Uses brand-fixed colors (not theme tokens) for consistent identity.
 */
export function MentomateLogo({
  size = 'md',
  orientation = 'vertical',
}: MentomateLogoProps): React.JSX.Element {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const s = sizes[size];
  const Icon = isDark ? IconDark : IconLight;

  const brand = BRAND[isDark ? 'dark' : 'light'];
  const mentColor = brand.ment;
  const mateColor = brand.mate;
  const circleColor = brand.circle;
  const isHorizontal = orientation === 'horizontal';
  const iconPx = isHorizontal ? Math.round(s.font * 1.6) : s.icon;
  const wordmarkOffset = isHorizontal
    ? { marginTop: 0, marginLeft: s.gap }
    : { marginTop: s.gap };

  return (
    <View
      style={isHorizontal ? styles.containerHorizontal : styles.container}
      accessibilityLabel="Mentomate"
      accessibilityRole="image"
    >
      <Icon width={iconPx} height={iconPx} />
      <View style={[styles.wordmark, wordmarkOffset]}>
        <Text style={[styles.text, { fontSize: s.font, color: mentColor }]}>
          ment
        </Text>
        <View
          style={[
            styles.circleO,
            {
              width: s.font * 0.5,
              height: s.font * 0.5,
              borderRadius: s.font * 0.25,
              borderWidth: s.font * 0.08,
              borderColor: circleColor,
              marginHorizontal: s.font * 0.02,
              marginBottom: s.font * 0.04,
            },
          ]}
        >
          <View
            style={{
              width: s.font * 0.18,
              height: s.font * 0.18,
              borderRadius: s.font * 0.09,
              backgroundColor: circleColor,
            }}
          />
        </View>
        <Text style={[styles.text, { fontSize: s.font, color: mateColor }]}>
          mate
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  containerHorizontal: {
    flexDirection: 'row',
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
});
