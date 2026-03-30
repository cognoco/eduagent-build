import type React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import IconLight from '../../assets/images/logo-icon-light.svg';
import IconDark from '../../assets/images/logo-icon-dark.svg';
import { useTheme, useThemeColors } from '../lib/theme';

// ── Size presets ──────────────────────────────────────────────
const sizes = {
  sm: { icon: 48, font: 16, gap: 6 },
  md: { icon: 72, font: 22, gap: 8 },
  lg: { icon: 96, font: 28, gap: 10 },
} as const;

type Size = 'sm' | 'md' | 'lg';

type MentomateLogoProps = {
  size?: Size;
};

/**
 * Mentomate brand logo — SVG icon + native Text wordmark.
 * Automatically picks light/dark variant based on the active theme.
 * Uses useThemeColors() for persona-aware, accent-preset-aware colors.
 */
export function MentomateLogo({
  size = 'md',
}: MentomateLogoProps): React.JSX.Element {
  const { colorScheme } = useTheme();
  const colors = useThemeColors();
  const isDark = colorScheme === 'dark';
  const s = sizes[size];
  const Icon = isDark ? IconDark : IconLight;

  const mentColor = colors.accent;
  const mateColor = colors.secondary;
  const circleColor = colors.accent;

  return (
    <View
      style={styles.container}
      accessibilityLabel="Mentomate"
      accessibilityRole="image"
    >
      <Icon width={s.icon} height={s.icon} />
      <View style={[styles.wordmark, { marginTop: s.gap }]}>
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
