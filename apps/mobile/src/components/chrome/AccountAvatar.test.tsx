import { render } from '@testing-library/react-native';
import { fireEvent } from '@testing-library/react-native';

import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
  createScreenWrapper,
} from '../../test-utils/screen-render';
import { AccountAvatar } from './AccountAvatar';

// ─── Boundary mocks (external runtime only) ────────────────────────────
// useProfile runs against the REAL ProfileContext supplied by the harness.

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
let mockPathname = '/mentor';

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

describe('AccountAvatar', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.clearAllMocks();
    mockPathname = '/mentor';
  });

  it('renders the avatar image when the active profile has an avatarUrl', () => {
    active = renderScreen(<AccountAvatar />, {
      profile: createTestProfile({
        displayName: 'Alex Brown',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      }),
    });

    const button = active.result.getByTestId('account-avatar-button');
    // The avatar-URL branch renders an <Image> with the profile uri and no
    // initials fallback text.
    const images = active.result.UNSAFE_root.findAllByType(
      require('react-native').Image,
    );
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images[0]?.props.source).toEqual({
      uri: 'https://cdn.example.com/avatar.png',
    });
    // Initials must NOT render in the image branch.
    expect(active.result.queryByText('AB')).toBeNull();
    expect(button).toBeTruthy();
  });

  it('renders initials fallback when the active profile has no avatarUrl', () => {
    active = renderScreen(<AccountAvatar />, {
      profile: createTestProfile({
        displayName: 'Alex Brown',
        avatarUrl: null,
      }),
    });

    // Two-word name → first letter of the first two words, uppercased.
    active.result.getByText('AB');
    // No <Image> in the initials branch.
    const images = active.result.UNSAFE_root.findAllByType(
      require('react-native').Image,
    );
    expect(images).toHaveLength(0);
  });

  it('names the exact active profile in the Account entry label', () => {
    active = renderScreen(<AccountAvatar />, {
      profile: createTestProfile({
        displayName: 'Test Parent',
        avatarUrl: null,
      }),
    });

    expect(
      active.result.getByTestId('account-avatar-button').props
        .accessibilityLabel,
    ).toBe('Open account settings for Test Parent');
  });

  it('renders a "?" placeholder when the display name is empty', () => {
    active = renderScreen(<AccountAvatar />, {
      profile: createTestProfile({
        displayName: '   ',
        avatarUrl: null,
      }),
    });

    active.result.getByText('?');
  });

  it('uses only the first two words for initials of a long name', () => {
    active = renderScreen(<AccountAvatar />, {
      profile: createTestProfile({
        displayName: 'Mary Jane Watson',
        avatarUrl: null,
      }),
    });

    active.result.getByText('MJ');
  });

  it.each([
    ['/mentor', 'mentor'],
    ['/subjects', 'subjects'],
    ['/journal', 'journal'],
  ] as const)(
    'routes from %s to Account with the initiating-tab return token',
    (pathname, returnTo) => {
      mockPathname = pathname;
      active = renderScreen(<AccountAvatar />, {
        profile: createTestProfile({ displayName: 'Sam', avatarUrl: null }),
      });

      fireEvent.press(active.result.getByTestId('account-avatar-button'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/account',
        params: { returnTo },
      });
    },
  );

  it('renders nothing when there is no active profile', () => {
    const { wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
    });
    const { toJSON, queryByTestId } = render(<AccountAvatar />, { wrapper });

    expect(queryByTestId('account-avatar-button')).toBeNull();
    expect(toJSON()).toBeNull();
  });
});
