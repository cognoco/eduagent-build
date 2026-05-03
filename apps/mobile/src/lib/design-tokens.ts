export type ColorScheme = 'light' | 'dark';

export interface ThemeTokens {
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    textPrimary: string;
    textSecondary: string;
    textInverse: string;
    primary: string;
    primarySoft: string;
    secondary: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    border: string;
    muted: string;
    retentionStrong: string;
    retentionFading: string;
    retentionWeak: string;
    retentionForgotten: string;
    coachingCard: string;
    coachBubble: string;
    homeworkLane: string;
  };
  radii: {
    card: string;
    button: string;
    input: string;
  };
  spacing: {
    cardPadding: string;
  };
}

/**
 * Canonical source of truth for all theme values.
 * These drive both NativeWind CSS variables (via `vars()`) and native color props.
 *
 * Values match the CSS variables previously defined in global.css.
 * To change a color: update it here — everything else follows automatically.
 */
export const tokens: Record<ColorScheme, ThemeTokens> = {
  light: {
    colors: {
      background: '#faf5ee',
      surface: '#ffffff',
      surfaceElevated: '#f3ede4',
      textPrimary: '#1a1a1a',
      textSecondary: '#525252',
      textInverse: '#fafafa',
      primary: '#0d9488',
      primarySoft: 'rgba(13, 148, 136, 0.10)',
      secondary: '#8b5cf6',
      accent: '#a78bfa',
      success: '#15803d',
      warning: '#a16207',
      danger: '#dc2626',
      info: '#38bdf8',
      border: '#e8e0d4',
      muted: '#a3a3a3',
      retentionStrong: '#15803d',
      retentionFading: '#a16207',
      retentionWeak: '#ea580c',
      retentionForgotten: '#737373',
      coachingCard: '#f3ede4',
      coachBubble: 'rgba(13, 148, 136, 0.08)',
      homeworkLane: '#d97706',
    },
    radii: { card: '16px', button: '12px', input: '10px' },
    spacing: { cardPadding: '24px' },
  },
  dark: {
    colors: {
      background: '#1a1a3e',
      surface: '#22224a',
      surfaceElevated: '#2a2a54',
      textPrimary: '#f5f5f5',
      textSecondary: '#94a3b8',
      textInverse: '#ffffff',
      primary: '#2dd4bf',
      primarySoft: 'rgba(45, 212, 191, 0.16)',
      secondary: '#a78bfa',
      accent: '#a78bfa',
      success: '#22c55e',
      warning: '#eab308',
      danger: '#ef4444',
      info: '#38bdf8',
      border: '#2a2a54',
      muted: '#94a3b8',
      retentionStrong: '#22c55e',
      retentionFading: '#eab308',
      retentionWeak: '#f97316',
      retentionForgotten: '#737373',
      coachingCard: '#2a2a54',
      coachBubble: 'rgba(45, 212, 191, 0.12)',
      homeworkLane: '#f59e0b',
    },
    radii: { card: '16px', button: '12px', input: '10px' },
    spacing: { cardPadding: '24px' },
  },
};

export const SUBJECT_TINT_PALETTE = {
  light: [
    { name: 'teal', solid: '#0f766e', soft: 'rgba(15,118,110,0.14)' },
    { name: 'purple', solid: '#7c3aed', soft: 'rgba(124,58,237,0.14)' },
    { name: 'amber', solid: '#b45309', soft: 'rgba(180,83,9,0.14)' },
    { name: 'blue', solid: '#2563eb', soft: 'rgba(37,99,235,0.14)' },
    { name: 'rose', solid: '#db2777', soft: 'rgba(219,39,119,0.14)' },
  ],
  dark: [
    { name: 'teal', solid: '#2dd4bf', soft: 'rgba(45,212,191,0.18)' },
    { name: 'purple', solid: '#a78bfa', soft: 'rgba(167,139,250,0.18)' },
    { name: 'amber', solid: '#eab308', soft: 'rgba(234,179,8,0.18)' },
    { name: 'blue', solid: '#60a5fa', soft: 'rgba(96,165,250,0.18)' },
    { name: 'rose', solid: '#f472b6', soft: 'rgba(244,114,182,0.18)' },
  ],
} as const;

export type SubjectTint =
  | (typeof SUBJECT_TINT_PALETTE)['light'][number]
  | (typeof SUBJECT_TINT_PALETTE)['dark'][number];

/** Accent color overrides — only the colors that shift with the user's choice. */
export interface AccentPreset {
  id: string;
  label: string;
  swatch: string;
  light: AccentColors;
  dark: AccentColors;
}

interface AccentColors {
  primary: string;
  primarySoft: string;
  secondary: string;
  accent: string;
  coachBubble: string;
}

export const accentPresets: AccentPreset[] = [
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#0d9488',
    light: {
      primary: '#0d9488',
      primarySoft: 'rgba(13, 148, 136, 0.10)',
      secondary: '#8b5cf6',
      accent: '#a78bfa',
      coachBubble: 'rgba(13, 148, 136, 0.08)',
    },
    dark: {
      primary: '#2dd4bf',
      primarySoft: 'rgba(45, 212, 191, 0.16)',
      secondary: '#a78bfa',
      accent: '#a78bfa',
      coachBubble: 'rgba(45, 212, 191, 0.12)',
    },
  },
  {
    id: 'electric',
    label: 'Electric Blue',
    swatch: '#2563eb',
    light: {
      primary: '#2563eb',
      primarySoft: 'rgba(37, 99, 235, 0.10)',
      secondary: '#3b82f6',
      accent: '#60a5fa',
      coachBubble: 'rgba(37, 99, 235, 0.08)',
    },
    dark: {
      primary: '#3b82f6',
      primarySoft: 'rgba(59, 130, 246, 0.15)',
      secondary: '#60a5fa',
      accent: '#60a5fa',
      coachBubble: 'rgba(59, 130, 246, 0.12)',
    },
  },
  {
    id: 'hotpink',
    label: 'Pink',
    swatch: '#f472b6',
    light: {
      primary: '#f472b6',
      primarySoft: 'rgba(244, 114, 182, 0.10)',
      secondary: '#ec4899',
      accent: '#f9a8d4',
      coachBubble: 'rgba(244, 114, 182, 0.08)',
    },
    dark: {
      primary: '#f9a8d4',
      primarySoft: 'rgba(249, 168, 212, 0.15)',
      secondary: '#fbcfe8',
      accent: '#fbcfe8',
      coachBubble: 'rgba(249, 168, 212, 0.12)',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#059669',
    light: {
      primary: '#059669',
      primarySoft: 'rgba(5, 150, 105, 0.10)',
      secondary: '#10b981',
      accent: '#34d399',
      coachBubble: 'rgba(5, 150, 105, 0.08)',
    },
    dark: {
      primary: '#10b981',
      primarySoft: 'rgba(16, 185, 129, 0.15)',
      secondary: '#34d399',
      accent: '#34d399',
      coachBubble: 'rgba(16, 185, 129, 0.12)',
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#d97706',
    light: {
      primary: '#d97706',
      primarySoft: 'rgba(217, 119, 6, 0.10)',
      secondary: '#f59e0b',
      accent: '#fbbf24',
      coachBubble: 'rgba(217, 119, 6, 0.08)',
    },
    dark: {
      primary: '#f59e0b',
      primarySoft: 'rgba(245, 158, 11, 0.15)',
      secondary: '#fbbf24',
      accent: '#fbbf24',
      coachBubble: 'rgba(245, 158, 11, 0.12)',
    },
  },
];

/** Convert tokens to CSS variable dictionary for NativeWind vars() */
export function tokensToCssVars(t: ThemeTokens): Record<`--${string}`, string> {
  return {
    '--color-background': t.colors.background,
    '--color-surface': t.colors.surface,
    '--color-surface-elevated': t.colors.surfaceElevated,
    '--color-text-primary': t.colors.textPrimary,
    '--color-text-secondary': t.colors.textSecondary,
    '--color-text-inverse': t.colors.textInverse,
    '--color-primary': t.colors.primary,
    '--color-primary-soft': t.colors.primarySoft,
    '--color-secondary': t.colors.secondary,
    '--color-accent': t.colors.accent,
    '--color-success': t.colors.success,
    '--color-warning': t.colors.warning,
    '--color-danger': t.colors.danger,
    '--color-info': t.colors.info,
    '--color-border': t.colors.border,
    '--color-muted': t.colors.muted,
    '--color-retention-strong': t.colors.retentionStrong,
    '--color-retention-fading': t.colors.retentionFading,
    '--color-retention-weak': t.colors.retentionWeak,
    '--color-retention-forgotten': t.colors.retentionForgotten,
    '--color-coaching-card': t.colors.coachingCard,
    '--color-coach-bubble': t.colors.coachBubble,
    '--color-homework-lane': t.colors.homeworkLane,
    '--radius-card': t.radii.card,
    '--radius-button': t.radii.button,
    '--radius-input': t.radii.input,
    '--spacing-card-padding': t.spacing.cardPadding,
  };
}
