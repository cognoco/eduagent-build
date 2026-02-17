import { createContext, useContext } from 'react';

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
