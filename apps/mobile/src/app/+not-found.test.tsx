import { render, fireEvent } from '@testing-library/react-native';

import NotFoundScreen from './+not-found';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(false);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-i18next', () => {
  const en = require('../i18n/locales/en.json');
  function resolveDotPath(
    obj: Record<string, unknown>,
    path: string,
  ): string | undefined {
    return path
      .split('.')
      .reduce<unknown>(
        (acc, k) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[k]
            : undefined,
        obj,
      ) as string | undefined;
  }
  return {
    useTranslation: () => ({
      t: (key: string) => resolveDotPath(en, key) ?? key,
      i18n: { language: 'en' },
    }),
  };
});

describe('+not-found.tsx — UX recovery affordances', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockReset().mockReturnValue(false);
  });

  it('renders a primary "Go Home" action and a secondary "Go Back" action — the user is never stranded', () => {
    const { getByTestId } = render(<NotFoundScreen />);
    expect(getByTestId('not-found-fallback')).toBeTruthy();
    expect(getByTestId('not-found-go-home')).toBeTruthy();
    expect(getByTestId('not-found-go-back')).toBeTruthy();
  });

  it('primary action navigates to home', () => {
    const { getByTestId } = render(<NotFoundScreen />);
    fireEvent.press(getByTestId('not-found-go-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('secondary action falls back to home replace when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<NotFoundScreen />);
    fireEvent.press(getByTestId('not-found-go-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('secondary action uses router.back when history is available', () => {
    mockCanGoBack.mockReturnValue(true);
    const { getByTestId } = render(<NotFoundScreen />);
    fireEvent.press(getByTestId('not-found-go-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
