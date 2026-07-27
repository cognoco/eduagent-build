import { render } from '@testing-library/react-native';
import { ThemeContext } from '../../../../lib/theme';
import { tokens } from '../../../../lib/design-tokens';
import SubjectHubLayout, { unstable_settings } from './_layout';

interface StackScreenOptions {
  headerShown?: boolean;
  contentStyle?: { backgroundColor?: string };
}

let mockStackScreenOptions: StackScreenOptions | undefined;

jest.mock('expo-router', () => ({
  Stack: ({ screenOptions }: { screenOptions: StackScreenOptions }) => {
    mockStackScreenOptions = screenOptions;
    return null;
  },
}));

function renderWithTheme(colorScheme: 'light' | 'dark') {
  return render(
    <ThemeContext.Provider
      value={{
        colorScheme,
        setColorScheme: jest.fn(),
        accentPresetId: null,
        setAccentPresetId: jest.fn(),
      }}
    >
      <SubjectHubLayout />
    </ThemeContext.Provider>,
  );
}

describe('subject hub nested layout', () => {
  beforeEach(() => {
    mockStackScreenOptions = undefined;
  });

  it('seeds the index route for cross-stack pushes', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });

  it('uses the active app theme behind fixed V2 chrome on pushed subject-hub scenes', () => {
    const view = renderWithTheme('dark');

    expect(mockStackScreenOptions?.contentStyle).toEqual({
      backgroundColor: tokens.dark.colors.background,
    });

    view.rerender(
      <ThemeContext.Provider
        value={{
          colorScheme: 'light',
          setColorScheme: jest.fn(),
          accentPresetId: null,
          setAccentPresetId: jest.fn(),
        }}
      >
        <SubjectHubLayout />
      </ThemeContext.Provider>,
    );

    expect(mockStackScreenOptions?.contentStyle).toEqual({
      backgroundColor: tokens.light.colors.background,
    });
  });
});
