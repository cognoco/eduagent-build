import { createContext, useContext, useMemo } from 'react';
import { vars } from 'nativewind';
import {
  tokens,
  tokensToCssVars,
  accentPresets,
  pickSubjectTint,
} from './design-tokens';
import type { ColorScheme, SubjectTint } from './design-tokens';

export interface ThemeContextValue {
  colorScheme: ColorScheme;
  setColorScheme: (cs: ColorScheme) => void;
  accentPresetId: string | null;
  setAccentPresetId: (id: string | null) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
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
 * Resolved color values for use in native props that require
 * string color values (e.g. tabBarActiveTintColor, placeholderTextColor,
 * ActivityIndicator color, RefreshControl tintColor).
 *
 * Single source of truth: reads from design-tokens.ts.
 * Applies accent preset overrides when a user has selected one.
 */
export type ThemeColors = (typeof tokens)[ColorScheme]['colors'];

export function useThemeColors(): ThemeColors {
  const { colorScheme, accentPresetId } = useTheme();
  return useMemo(() => {
    const base = tokens[colorScheme].colors;
    if (!accentPresetId) return base;

    const preset = accentPresets.find((p) => p.id === accentPresetId);
    if (!preset) return base;

    const overrides = preset[colorScheme];
    return { ...base, ...overrides };
  }, [colorScheme, accentPresetId]);
}

/**
 * Returns a NativeWind `vars()` style object that injects all CSS variables
 * for the current color scheme. Apply this to the root View in _layout.tsx.
 *
 * Applies accent preset overrides when a user has selected one.
 */
export function useSubjectTint(subjectId: string): SubjectTint {
  const { colorScheme } = useTheme();
  return useMemo(
    () => pickSubjectTint(subjectId, colorScheme),
    [subjectId, colorScheme]
  );
}

export function useTokenVars(): ReturnType<typeof vars> {
  const { colorScheme, accentPresetId } = useTheme();
  return useMemo(() => {
    const base = tokens[colorScheme];
    if (!accentPresetId) return vars(tokensToCssVars(base));

    const preset = accentPresets.find((p) => p.id === accentPresetId);
    if (!preset) return vars(tokensToCssVars(base));

    const overrides = preset[colorScheme];
    const merged = {
      ...base,
      colors: { ...base.colors, ...overrides },
    };
    return vars(tokensToCssVars(merged));
  }, [colorScheme, accentPresetId]);
}
