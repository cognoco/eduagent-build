import { render } from '@testing-library/react-native';
import { ThemeContext } from '../../../lib/theme';
import { tokens } from '../../../lib/design-tokens';
import AccountLayout, {
  unstable_settings,
  ACCOUNT_PRESENTATION,
} from './_layout';

interface StackScreenOptions {
  headerShown?: boolean;
  headerStyle?: { backgroundColor?: string };
  headerTintColor?: string;
  headerShadowVisible?: boolean;
  presentation?: string;
  contentStyle?: { backgroundColor?: string };
}

let mockStackScreenOptions: StackScreenOptions | undefined;
const mockStackScreens = new Map<
  string,
  StackScreenOptions & { title?: string }
>();

jest.mock('expo-router', () => ({
  Stack: Object.assign(
    ({
      screenOptions,
      children,
    }: {
      screenOptions: StackScreenOptions;
      children?: React.ReactNode;
    }) => {
      mockStackScreenOptions = screenOptions;
      return children ?? null;
    },
    {
      Screen: ({
        name,
        options,
      }: {
        name: string;
        options: StackScreenOptions & { title?: string };
      }) => {
        mockStackScreens.set(name, options);
        return null;
      },
    },
  ),
}));

describe('account nested layout', () => {
  beforeEach(() => {
    mockStackScreenOptions = undefined;
    mockStackScreens.clear();
  });

  it('seeds the index route and presents the account surface modally', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
    expect(ACCOUNT_PRESENTATION).toBe('modal');
  });

  it.each(['dark', 'light'] as const)(
    'uses the active %s semantic background for the pushed account modal',
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
          <AccountLayout />
        </ThemeContext.Provider>,
      );

      expect(mockStackScreenOptions).toMatchObject({
        presentation: ACCOUNT_PRESENTATION,
        headerStyle: { backgroundColor: tokens[colorScheme].colors.background },
        headerTintColor: tokens[colorScheme].colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: tokens[colorScheme].colors.background,
        },
      });
      expect(mockStackScreenOptions?.headerShown).toBeUndefined();
      expect(mockStackScreens.get('index')).toMatchObject({
        headerShown: false,
      });
      expect(mockStackScreens.get('profiles')?.title).toBe('Profiles');
      expect(mockStackScreens.get('notifications')?.title).toBe(
        'Notifications',
      );
      expect(mockStackScreens.get('privacy')?.title).toBe('Privacy & data');
    },
  );
});
