import { fireEvent, render, screen } from '@testing-library/react-native';
import { LibraryPrompt } from './LibraryPrompt';
import { FEATURE_FLAGS } from '../../lib/feature-flags';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// react-i18next is globally mocked in test-setup.ts.

describe('LibraryPrompt', () => {
  let originalV2: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
  });

  afterEach(() => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      originalV2;
  });

  it('navigates to library when V2 nav is off [WI-2467]', () => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      false;

    render(<LibraryPrompt />);

    fireEvent.press(screen.getByTestId('session-library-link'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
  });

  it('navigates to V2 Subjects when V2 nav is on [WI-2467]', () => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;

    render(<LibraryPrompt />);

    fireEvent.press(screen.getByTestId('session-library-link'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/subjects');
  });
});
