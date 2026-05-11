import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import {
  ParentTransitionNotice,
  parentHomeSeenKey,
} from './ParentTransitionNotice';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();

jest.mock(
  '../../lib/secure-storage' /* gc1-allow: SecureStore wraps expo-secure-store which has no JSDOM implementation */,
  () => ({
    getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
    setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
    sanitizeSecureStoreKey: (raw: string) =>
      raw.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);

describe('ParentTransitionNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
  });

  it('returns null when profileId is undefined', async () => {
    render(<ParentTransitionNotice profileId={undefined} />);

    await waitFor(() => {
      expect(screen.queryByTestId('parent-transition-notice')).toBeNull();
    });
  });

  it('shows notice when SecureStore has no value for the key', async () => {
    mockGetItemAsync.mockResolvedValue(null);

    render(<ParentTransitionNotice profileId="profile-abc" />);

    await waitFor(() => {
      screen.getByTestId('parent-transition-notice');
    });

    screen.getByText("You're a parent now too");
  });

  it('hides notice when SecureStore has true for the key', async () => {
    mockGetItemAsync.mockResolvedValue('true');

    render(<ParentTransitionNotice profileId="profile-abc" />);

    await waitFor(() => {
      expect(screen.queryByTestId('parent-transition-notice')).toBeNull();
    });
  });

  it('dismiss button writes to SecureStore and hides the notice', async () => {
    mockGetItemAsync.mockResolvedValue(null);

    render(<ParentTransitionNotice profileId="profile-abc" />);

    await waitFor(() => {
      screen.getByTestId('parent-transition-notice-dismiss');
    });

    fireEvent.press(screen.getByTestId('parent-transition-notice-dismiss'));

    await waitFor(() => {
      expect(screen.queryByTestId('parent-transition-notice')).toBeNull();
    });

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      parentHomeSeenKey('profile-abc'),
      'true',
    );
  });

  it('parentHomeSeenKey returns sanitized key', () => {
    const key = parentHomeSeenKey('abc-123');
    expect(key).toBe('mentomate_parent_home_seen_abc-123');
  });
});
