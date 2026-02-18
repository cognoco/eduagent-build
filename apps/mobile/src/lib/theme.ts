import { createContext, useContext, useMemo } from 'react';
import { vars } from 'nativewind';
import { tokens, tokensToCssVars } from './design-tokens';
import type { ColorScheme } from './design-tokens';

export type Persona = 'teen' | 'learner' | 'parent';

export interface ThemeContextValue {
  persona: Persona;
  setPersona: (p: Persona) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  persona: 'teen',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setPersona: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Resolved color values per persona for use in native props that require
 * string color values (e.g. tabBarActiveTintColor, placeholderTextColor,
 * ActivityIndicator color, RefreshControl tintColor).
 *
 * Single source of truth: reads from design-tokens.ts.
 */
export type ThemeColors = (typeof tokens)[Persona][ColorScheme]['colors'];

export function useThemeColors(): ThemeColors {
  const { persona } = useTheme();
  return useMemo(() => tokens[persona].light.colors, [persona]);
}

/**
 * Returns a NativeWind `vars()` style object that injects all CSS variables
 * for the current persona. Apply this to the root View in _layout.tsx.
 *
 * This replaces the CSS-class-based theme switching (.theme-learner, .theme-parent)
 * with runtime injection, enabling future dark mode via `useColorScheme()`.
 */
export function useTokenVars(): ReturnType<typeof vars> {
  const { persona } = useTheme();
  return useMemo(() => vars(tokensToCssVars(tokens[persona].light)), [persona]);
}
