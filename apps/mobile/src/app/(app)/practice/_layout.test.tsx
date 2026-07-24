import { render } from '@testing-library/react-native';
import { ThemeContext } from '../../../lib/theme';
import { tokens } from '../../../lib/design-tokens';
import PracticeLayout, { unstable_settings } from './_layout';

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

describe('practice nested layout', () => {
  beforeEach(() => {
    mockStackScreenOptions = undefined;
  });

  it('seeds the index route for cross-stack pushes', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });

  it.each(['dark', 'light'] as const)(
    'uses the active %s semantic background for pushed practice scenes',
    (colorScheme) => {
      render(
        <ThemeContext.Provider
          value={{
            colorScheme,
            setColorScheme: jest.fn(),
            accentPresetId: null,
            setAccentPresetId: jest.fn(),
          }}
        >
          <PracticeLayout />
        </ThemeContext.Provider>,
      );

      expect(mockStackScreenOptions).toMatchObject({
        headerShown: false,
        contentStyle: {
          backgroundColor: tokens[colorScheme].colors.background,
        },
      });
    },
  );
});
