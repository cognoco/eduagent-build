import { renderHook } from '@testing-library/react-native';
import React from 'react';
import { tokens, accentPresets } from './design-tokens';
import { ThemeContext, useTheme, useThemeColors, useTokenVars } from './theme';
import type { ThemeContextValue } from './theme';

// NativeWind's `vars()` returns {} in Jest because the runtime isn't active.
// Mock it as a pass-through so we can verify the underlying token logic.
jest.mock('nativewind', () => ({
  vars: (input: Record<string, string>) => input,
}));

function createWrapper(value: ThemeContextValue) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ThemeContext.Provider, { value }, children);
  };
}

describe('useTheme', () => {
  it('returns the current theme context value', () => {
    const ctx: ThemeContextValue = {
      persona: 'learner',
      setPersona: jest.fn(),
      colorScheme: 'dark',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useTheme(), {
      wrapper: createWrapper(ctx),
    });

    expect(result.current.persona).toBe('learner');
    expect(result.current.colorScheme).toBe('dark');
    expect(result.current.accentPresetId).toBeNull();
  });

  it('returns default context values when no provider wraps it', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.persona).toBe('teen');
    expect(result.current.colorScheme).toBe('light');
    expect(result.current.accentPresetId).toBeNull();
  });
});

describe('useThemeColors', () => {
  it('returns color tokens for the current persona and color scheme', () => {
    const ctx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useThemeColors(), {
      wrapper: createWrapper(ctx),
    });

    expect(result.current).toEqual(tokens.teen.light.colors);
  });

  it('returns dark color tokens when colorScheme is dark', () => {
    const ctx: ThemeContextValue = {
      persona: 'learner',
      setPersona: jest.fn(),
      colorScheme: 'dark',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useThemeColors(), {
      wrapper: createWrapper(ctx),
    });

    expect(result.current).toEqual(tokens.learner.dark.colors);
  });

  it('applies accent preset overrides when accentPresetId is set', () => {
    const presetId = accentPresets.teen[1]?.id;
    if (!presetId) {
      // Skip if no second preset exists
      return;
    }

    const ctx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: presetId,
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useThemeColors(), {
      wrapper: createWrapper(ctx),
    });

    const preset = accentPresets.teen.find((p) => p.id === presetId)!;
    expect(result.current.primary).toBe(preset.light.primary);
  });

  it('falls back to base colors when accentPresetId does not match', () => {
    const ctx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: 'nonexistent-preset',
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useThemeColors(), {
      wrapper: createWrapper(ctx),
    });

    expect(result.current).toEqual(tokens.teen.light.colors);
  });

  it('returns parent persona colors correctly', () => {
    const ctx: ThemeContextValue = {
      persona: 'parent',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useThemeColors(), {
      wrapper: createWrapper(ctx),
    });

    expect(result.current).toEqual(tokens.parent.light.colors);
  });
});

describe('useTokenVars', () => {
  it('returns a vars() style object for the current persona', () => {
    const ctx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const { result } = renderHook(() => useTokenVars(), {
      wrapper: createWrapper(ctx),
    });

    // vars() returns an object — the exact shape depends on NativeWind internals,
    // but it should be truthy and be an object
    expect(result.current).toBeTruthy();
    expect(typeof result.current).toBe('object');
  });

  it('returns different vars for dark vs light scheme', () => {
    const lightCtx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const darkCtx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'dark',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const { result: lightResult } = renderHook(() => useTokenVars(), {
      wrapper: createWrapper(lightCtx),
    });
    const { result: darkResult } = renderHook(() => useTokenVars(), {
      wrapper: createWrapper(darkCtx),
    });

    // Light and dark should produce different var objects
    expect(lightResult.current).not.toEqual(darkResult.current);
  });

  it('applies accent preset overrides to CSS vars', () => {
    const presetId = accentPresets.teen[1]?.id;
    if (!presetId) return;

    const baseCtx: ThemeContextValue = {
      persona: 'teen',
      setPersona: jest.fn(),
      colorScheme: 'light',
      setColorScheme: jest.fn(),
      accentPresetId: null,
      setAccentPresetId: jest.fn(),
    };

    const presetCtx: ThemeContextValue = {
      ...baseCtx,
      accentPresetId: presetId,
    };

    const { result: baseResult } = renderHook(() => useTokenVars(), {
      wrapper: createWrapper(baseCtx),
    });
    const { result: presetResult } = renderHook(() => useTokenVars(), {
      wrapper: createWrapper(presetCtx),
    });

    // With an accent preset, the vars should differ from the base
    expect(presetResult.current).not.toEqual(baseResult.current);
  });
});
