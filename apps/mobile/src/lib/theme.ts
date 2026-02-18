import { createContext, useContext, useMemo } from 'react';

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

export function getThemeClass(persona: Persona): string {
  switch (persona) {
    case 'learner':
      return 'theme-learner';
    case 'parent':
      return 'theme-parent';
    default:
      return '';
  }
}

/**
 * Resolved color values per persona for use in native props that require
 * string color values (e.g. tabBarActiveTintColor, placeholderTextColor,
 * ActivityIndicator color, RefreshControl tintColor).
 *
 * These values MUST match the CSS variables defined in global.css.
 */
const PERSONA_COLORS = {
  teen: {
    background: '#0f0f0f',
    surface: '#1a1a1a',
    surfaceElevated: '#262626',
    textPrimary: '#f5f5f5',
    textSecondary: '#a3a3a3',
    textInverse: '#0f0f0f',
    primary: '#7c3aed',
    accent: '#a855f7',
    border: '#262626',
    muted: '#525252',
    danger: '#ef4444',
    success: '#22c55e',
  },
  learner: {
    background: '#fafaf9',
    surface: '#ffffff',
    surfaceElevated: '#f5f5f4',
    textPrimary: '#1c1917',
    textSecondary: '#78716c',
    textInverse: '#fafaf9',
    primary: '#6366f1',
    accent: '#818cf8',
    border: '#e7e5e4',
    muted: '#a8a29e',
    danger: '#dc2626',
    success: '#16a34a',
  },
  parent: {
    background: '#ffffff',
    surface: '#f8fafc',
    surfaceElevated: '#f1f5f9',
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    textInverse: '#ffffff',
    primary: '#4f46e5',
    accent: '#6366f1',
    border: '#e2e8f0',
    muted: '#94a3b8',
    danger: '#b91c1c',
    success: '#15803d',
  },
} as const;

export type ThemeColors = (typeof PERSONA_COLORS)[Persona];

/**
 * Returns resolved color strings for the current persona.
 * Use this for native component props that cannot accept CSS variables
 * (e.g. `placeholderTextColor`, `ActivityIndicator color`,
 * `tabBarActiveTintColor`, `RefreshControl tintColor`).
 */
export function useThemeColors(): ThemeColors {
  const { persona } = useTheme();
  return useMemo(() => PERSONA_COLORS[persona], [persona]);
}
