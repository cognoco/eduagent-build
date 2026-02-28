import type { Persona } from './theme';

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
export const tokens: Record<Persona, Record<ColorScheme, ThemeTokens>> = {
  teen: {
    light: {
      colors: {
        background: '#fafafa',
        surface: '#ffffff',
        surfaceElevated: '#f5f5f5',
        textPrimary: '#1a1a1a',
        textSecondary: '#525252',
        textInverse: '#fafafa',
        primary: '#7c3aed',
        primarySoft: 'rgba(124, 58, 237, 0.10)',
        secondary: '#8b5cf6',
        accent: '#a855f7',
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
        info: '#38bdf8',
        border: '#e5e5e5',
        muted: '#a3a3a3',
        retentionStrong: '#22c55e',
        retentionFading: '#eab308',
        retentionWeak: '#ef4444',
        retentionForgotten: '#737373',
        coachingCard: '#f5f5f5',
        homeworkLane: '#d97706',
      },
      radii: { card: '16px', button: '12px', input: '10px' },
      spacing: { cardPadding: '24px' },
    },
    dark: {
      colors: {
        background: '#0f0f0f',
        surface: '#1a1a1a',
        surfaceElevated: '#262626',
        textPrimary: '#f5f5f5',
        textSecondary: '#a3a3a3',
        textInverse: '#ffffff',
        primary: '#8b5cf6',
        primarySoft: 'rgba(139, 92, 246, 0.15)',
        secondary: '#a78bfa',
        accent: '#a855f7',
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
        info: '#38bdf8',
        border: '#262626',
        muted: '#525252',
        retentionStrong: '#22c55e',
        retentionFading: '#eab308',
        retentionWeak: '#ef4444',
        retentionForgotten: '#737373',
        coachingCard: '#262626',
        homeworkLane: '#f59e0b',
      },
      radii: { card: '16px', button: '12px', input: '10px' },
      spacing: { cardPadding: '24px' },
    },
  },
  learner: {
    light: {
      colors: {
        background: '#fafaf9',
        surface: '#ffffff',
        surfaceElevated: '#f5f5f4',
        textPrimary: '#1c1917',
        textSecondary: '#6b6560',
        textInverse: '#fafaf9',
        primary: '#4f46e5',
        primarySoft: 'rgba(79, 70, 229, 0.1)',
        secondary: '#818cf8',
        accent: '#818cf8',
        success: '#16a34a',
        warning: '#ca8a04',
        danger: '#dc2626',
        info: '#0ea5e9',
        border: '#e7e5e4',
        muted: '#a8a29e',
        retentionStrong: '#16a34a',
        retentionFading: '#ca8a04',
        retentionWeak: '#dc2626',
        retentionForgotten: '#737373',
        coachingCard: '#f5f5f4',
        homeworkLane: '#f59e0b',
      },
      radii: { card: '12px', button: '10px', input: '8px' },
      spacing: { cardPadding: '16px' },
    },
    dark: {
      colors: {
        background: '#0f172a',
        surface: '#1e293b',
        surfaceElevated: '#334155',
        textPrimary: '#f1f5f9',
        textSecondary: '#a8b8cc',
        textInverse: '#0f172a',
        primary: '#818cf8',
        primarySoft: 'rgba(129, 140, 248, 0.15)',
        secondary: '#a5b4fc',
        accent: '#a5b4fc',
        success: '#4ade80',
        warning: '#facc15',
        danger: '#f87171',
        info: '#38bdf8',
        border: '#334155',
        muted: '#64748b',
        retentionStrong: '#4ade80',
        retentionFading: '#facc15',
        retentionWeak: '#f87171',
        retentionForgotten: '#6b7280',
        coachingCard: '#1e293b',
        homeworkLane: '#fbbf24',
      },
      radii: { card: '12px', button: '10px', input: '8px' },
      spacing: { cardPadding: '16px' },
    },
  },
  parent: {
    light: {
      colors: {
        background: '#ffffff',
        surface: '#f8fafc',
        surfaceElevated: '#f1f5f9',
        textPrimary: '#0f172a',
        textSecondary: '#5c6b82',
        textInverse: '#ffffff',
        primary: '#4f46e5',
        primarySoft: 'rgba(79, 70, 229, 0.08)',
        secondary: '#6366f1',
        accent: '#6366f1',
        success: '#15803d',
        warning: '#a16207',
        danger: '#b91c1c',
        info: '#0284c7',
        border: '#e2e8f0',
        muted: '#94a3b8',
        retentionStrong: '#15803d',
        retentionFading: '#a16207',
        retentionWeak: '#b91c1c',
        retentionForgotten: '#737373',
        coachingCard: '#f1f5f9',
        homeworkLane: '#b45309',
      },
      radii: { card: '10px', button: '8px', input: '6px' },
      spacing: { cardPadding: '16px' },
    },
    dark: {
      colors: {
        background: '#111827',
        surface: '#1f2937',
        surfaceElevated: '#374151',
        textPrimary: '#f1f5f9',
        textSecondary: '#a8b8cc',
        textInverse: '#111827',
        primary: '#818cf8',
        primarySoft: 'rgba(129, 140, 248, 0.12)',
        secondary: '#a5b4fc',
        accent: '#a5b4fc',
        success: '#4ade80',
        warning: '#facc15',
        danger: '#f87171',
        info: '#38bdf8',
        border: '#374151',
        muted: '#64748b',
        retentionStrong: '#4ade80',
        retentionFading: '#facc15',
        retentionWeak: '#f87171',
        retentionForgotten: '#6b7280',
        coachingCard: '#1f2937',
        homeworkLane: '#d97706',
      },
      radii: { card: '10px', button: '8px', input: '6px' },
      spacing: { cardPadding: '16px' },
    },
  },
};

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
    '--color-homework-lane': t.colors.homeworkLane,
    '--radius-card': t.radii.card,
    '--radius-button': t.radii.button,
    '--radius-input': t.radii.input,
    '--spacing-card-padding': t.spacing.cardPadding,
  };
}
