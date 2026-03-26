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
        primary: '#6d28d9',
        primarySoft: 'rgba(109, 40, 217, 0.10)',
        secondary: '#8b5cf6',
        accent: '#a855f7',
        success: '#15803d',
        warning: '#a16207',
        danger: '#dc2626',
        info: '#38bdf8',
        border: '#e5e5e5',
        muted: '#a3a3a3',
        retentionStrong: '#15803d',
        retentionFading: '#a16207',
        retentionWeak: '#ea580c',
        retentionForgotten: '#737373',
        coachingCard: '#f5f5f5',
        coachBubble: 'rgba(139, 92, 246, 0.08)',
        homeworkLane: '#d97706',
      },
      radii: { card: '16px', button: '12px', input: '10px' },
      spacing: { cardPadding: '24px' },
    },
    dark: {
      colors: {
        background: '#18181b',
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
        retentionWeak: '#f97316',
        retentionForgotten: '#737373',
        coachingCard: '#262626',
        coachBubble: 'rgba(139, 92, 246, 0.12)',
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
        success: '#15803d',
        warning: '#a16207',
        danger: '#dc2626',
        info: '#0ea5e9',
        border: '#e7e5e4',
        muted: '#a8a29e',
        retentionStrong: '#15803d',
        retentionFading: '#a16207',
        retentionWeak: '#ea580c',
        retentionForgotten: '#737373',
        coachingCard: '#f5f5f4',
        coachBubble: 'rgba(79, 70, 229, 0.06)',
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
        retentionWeak: '#fb923c',
        retentionForgotten: '#6b7280',
        coachingCard: '#1e293b',
        coachBubble: 'rgba(129, 140, 248, 0.10)',
        homeworkLane: '#fbbf24',
      },
      radii: { card: '12px', button: '10px', input: '8px' },
      spacing: { cardPadding: '16px' },
    },
  },
  parent: {
    light: {
      colors: {
        background: '#fdfcfb',
        surface: '#f8fafc',
        surfaceElevated: '#f1f5f9',
        textPrimary: '#0f172a',
        textSecondary: '#5c6b82',
        textInverse: '#ffffff',
        primary: '#0d9488',
        primarySoft: 'rgba(13, 148, 136, 0.08)',
        secondary: '#0f766e',
        accent: '#14b8a6',
        success: '#15803d',
        warning: '#a16207',
        danger: '#b91c1c',
        info: '#0284c7',
        border: '#e2e8f0',
        muted: '#94a3b8',
        retentionStrong: '#15803d',
        retentionFading: '#a16207',
        retentionWeak: '#c2410c',
        retentionForgotten: '#737373',
        coachingCard: '#f0fdfa',
        coachBubble: 'rgba(13, 148, 136, 0.05)',
        homeworkLane: '#b45309',
      },
      radii: { card: '12px', button: '10px', input: '8px' },
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
        primary: '#2dd4bf',
        primarySoft: 'rgba(45, 212, 191, 0.12)',
        secondary: '#5eead4',
        accent: '#5eead4',
        success: '#4ade80',
        warning: '#facc15',
        danger: '#f87171',
        info: '#38bdf8',
        border: '#374151',
        muted: '#64748b',
        retentionStrong: '#4ade80',
        retentionFading: '#facc15',
        retentionWeak: '#fb923c',
        retentionForgotten: '#6b7280',
        coachingCard: '#1e293b',
        coachBubble: 'rgba(45, 212, 191, 0.08)',
        homeworkLane: '#d97706',
      },
      radii: { card: '12px', button: '10px', input: '8px' },
      spacing: { cardPadding: '16px' },
    },
  },
};

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

export const accentPresets: Record<Persona, AccentPreset[]> = {
  teen: [
    {
      id: 'violet',
      label: 'Violet',
      swatch: '#6d28d9',
      light: {
        primary: '#6d28d9',
        primarySoft: 'rgba(109, 40, 217, 0.10)',
        secondary: '#8b5cf6',
        accent: '#a855f7',
        coachBubble: 'rgba(139, 92, 246, 0.08)',
      },
      dark: {
        primary: '#8b5cf6',
        primarySoft: 'rgba(139, 92, 246, 0.15)',
        secondary: '#a78bfa',
        accent: '#a855f7',
        coachBubble: 'rgba(139, 92, 246, 0.12)',
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
  ],
  learner: [
    {
      id: 'indigo',
      label: 'Indigo',
      swatch: '#4f46e5',
      light: {
        primary: '#4f46e5',
        primarySoft: 'rgba(79, 70, 229, 0.1)',
        secondary: '#818cf8',
        accent: '#818cf8',
        coachBubble: 'rgba(79, 70, 229, 0.06)',
      },
      dark: {
        primary: '#818cf8',
        primarySoft: 'rgba(129, 140, 248, 0.15)',
        secondary: '#a5b4fc',
        accent: '#a5b4fc',
        coachBubble: 'rgba(129, 140, 248, 0.10)',
      },
    },
    {
      id: 'teal',
      label: 'Teal',
      swatch: '#0d9488',
      light: {
        primary: '#0d9488',
        primarySoft: 'rgba(13, 148, 136, 0.10)',
        secondary: '#14b8a6',
        accent: '#14b8a6',
        coachBubble: 'rgba(13, 148, 136, 0.06)',
      },
      dark: {
        primary: '#2dd4bf',
        primarySoft: 'rgba(45, 212, 191, 0.15)',
        secondary: '#5eead4',
        accent: '#5eead4',
        coachBubble: 'rgba(45, 212, 191, 0.10)',
      },
    },
    {
      id: 'rose',
      label: 'Rose',
      swatch: '#e11d48',
      light: {
        primary: '#e11d48',
        primarySoft: 'rgba(225, 29, 72, 0.10)',
        secondary: '#f43f5e',
        accent: '#fb7185',
        coachBubble: 'rgba(225, 29, 72, 0.06)',
      },
      dark: {
        primary: '#fb7185',
        primarySoft: 'rgba(251, 113, 133, 0.15)',
        secondary: '#fda4af',
        accent: '#fda4af',
        coachBubble: 'rgba(251, 113, 133, 0.10)',
      },
    },
    {
      id: 'sky',
      label: 'Sky',
      swatch: '#0284c7',
      light: {
        primary: '#0284c7',
        primarySoft: 'rgba(2, 132, 199, 0.10)',
        secondary: '#0ea5e9',
        accent: '#38bdf8',
        coachBubble: 'rgba(2, 132, 199, 0.06)',
      },
      dark: {
        primary: '#38bdf8',
        primarySoft: 'rgba(56, 189, 248, 0.15)',
        secondary: '#7dd3fc',
        accent: '#7dd3fc',
        coachBubble: 'rgba(56, 189, 248, 0.10)',
      },
    },
    {
      id: 'purple',
      label: 'Purple',
      swatch: '#6d28d9',
      light: {
        primary: '#6d28d9',
        primarySoft: 'rgba(109, 40, 217, 0.10)',
        secondary: '#8b5cf6',
        accent: '#a78bfa',
        coachBubble: 'rgba(124, 58, 237, 0.06)',
      },
      dark: {
        primary: '#a78bfa',
        primarySoft: 'rgba(167, 139, 250, 0.15)',
        secondary: '#c4b5fd',
        accent: '#c4b5fd',
        coachBubble: 'rgba(167, 139, 250, 0.10)',
      },
    },
  ],
  parent: [
    {
      id: 'teal',
      label: 'Teal',
      swatch: '#0d9488',
      light: {
        primary: '#0d9488',
        primarySoft: 'rgba(13, 148, 136, 0.08)',
        secondary: '#0f766e',
        accent: '#14b8a6',
        coachBubble: 'rgba(13, 148, 136, 0.05)',
      },
      dark: {
        primary: '#2dd4bf',
        primarySoft: 'rgba(45, 212, 191, 0.12)',
        secondary: '#5eead4',
        accent: '#5eead4',
        coachBubble: 'rgba(45, 212, 191, 0.08)',
      },
    },
    {
      id: 'indigo',
      label: 'Indigo',
      swatch: '#4f46e5',
      light: {
        primary: '#4f46e5',
        primarySoft: 'rgba(79, 70, 229, 0.08)',
        secondary: '#6366f1',
        accent: '#6366f1',
        coachBubble: 'rgba(79, 70, 229, 0.05)',
      },
      dark: {
        primary: '#818cf8',
        primarySoft: 'rgba(129, 140, 248, 0.12)',
        secondary: '#a5b4fc',
        accent: '#a5b4fc',
        coachBubble: 'rgba(129, 140, 248, 0.08)',
      },
    },
    {
      id: 'slate',
      label: 'Slate',
      swatch: '#475569',
      light: {
        primary: '#475569',
        primarySoft: 'rgba(71, 85, 105, 0.08)',
        secondary: '#64748b',
        accent: '#64748b',
        coachBubble: 'rgba(71, 85, 105, 0.05)',
      },
      dark: {
        primary: '#94a3b8',
        primarySoft: 'rgba(148, 163, 184, 0.12)',
        secondary: '#cbd5e1',
        accent: '#cbd5e1',
        coachBubble: 'rgba(148, 163, 184, 0.08)',
      },
    },
    {
      id: 'emerald',
      label: 'Emerald',
      swatch: '#059669',
      light: {
        primary: '#059669',
        primarySoft: 'rgba(5, 150, 105, 0.08)',
        secondary: '#10b981',
        accent: '#10b981',
        coachBubble: 'rgba(5, 150, 105, 0.05)',
      },
      dark: {
        primary: '#34d399',
        primarySoft: 'rgba(52, 211, 153, 0.12)',
        secondary: '#6ee7b7',
        accent: '#6ee7b7',
        coachBubble: 'rgba(52, 211, 153, 0.08)',
      },
    },
    {
      id: 'navy',
      label: 'Navy',
      swatch: '#1e40af',
      light: {
        primary: '#1e40af',
        primarySoft: 'rgba(30, 64, 175, 0.08)',
        secondary: '#3b82f6',
        accent: '#3b82f6',
        coachBubble: 'rgba(30, 64, 175, 0.05)',
      },
      dark: {
        primary: '#60a5fa',
        primarySoft: 'rgba(96, 165, 250, 0.12)',
        secondary: '#93c5fd',
        accent: '#93c5fd',
        coachBubble: 'rgba(96, 165, 250, 0.08)',
      },
    },
  ],
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
    '--color-coach-bubble': t.colors.coachBubble,
    '--color-homework-lane': t.colors.homeworkLane,
    '--radius-card': t.radii.card,
    '--radius-button': t.radii.button,
    '--radius-input': t.radii.input,
    '--spacing-card-padding': t.spacing.cardPadding,
  };
}
