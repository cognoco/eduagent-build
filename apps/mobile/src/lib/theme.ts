import { createContext, useContext, useMemo } from 'react';
import { vars } from 'nativewind';
import { tokens, tokensToCssVars, accentPresets } from './design-tokens';
import type { ColorScheme } from './design-tokens';

export type Persona = 'teen' | 'learner' | 'parent';

export interface ThemeContextValue {
  persona: Persona;
  setPersona: (p: Persona) => void;
  colorScheme: ColorScheme;
  setColorScheme: (cs: ColorScheme) => void;
  accentPresetId: string | null;
  setAccentPresetId: (id: string | null) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  persona: 'teen',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setPersona: () => {},
  colorScheme: 'light',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setColorScheme: () => {},
  accentPresetId: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setAccentPresetId: () => {},
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
 * Applies accent preset overrides when a user has selected one.
 */
export type ThemeColors = (typeof tokens)[Persona][ColorScheme]['colors'];

export function useThemeColors(): ThemeColors {
  const { persona, colorScheme, accentPresetId } = useTheme();
  return useMemo(() => {
    const base = tokens[persona][colorScheme].colors;
    if (!accentPresetId) return base;

    const preset = accentPresets[persona]?.find((p) => p.id === accentPresetId);
    if (!preset) return base;

    const overrides = preset[colorScheme];
    return { ...base, ...overrides };
  }, [persona, colorScheme, accentPresetId]);
}

/**
 * Returns a NativeWind `vars()` style object that injects all CSS variables
 * for the current persona. Apply this to the root View in _layout.tsx.
 *
 * This replaces the CSS-class-based theme switching (.theme-learner, .theme-parent)
 * with runtime injection, enabling future dark mode via `useColorScheme()`.
 *
 * Applies accent preset overrides when a user has selected one.
 */
export function useTokenVars(): ReturnType<typeof vars> {
  const { persona, colorScheme, accentPresetId } = useTheme();
  return useMemo(() => {
    const base = tokens[persona][colorScheme];
    if (!accentPresetId) return vars(tokensToCssVars(base));

    const preset = accentPresets[persona]?.find((p) => p.id === accentPresetId);
    if (!preset) return vars(tokensToCssVars(base));

    const overrides = preset[colorScheme];
    const merged = {
      ...base,
      colors: { ...base.colors, ...overrides },
    };
    return vars(tokensToCssVars(merged));
  }, [persona, colorScheme, accentPresetId]);
}
