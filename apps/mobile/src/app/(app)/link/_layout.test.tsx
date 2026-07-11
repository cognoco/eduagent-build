// [WI-1137] link/_layout.tsx gates the whole visibility-link-ceremony stack
// behind MODE_NAV_V2_ENABLED — off-flag visits redirect to home instead of
// reaching the ceremony screens.

import { render, screen } from '@testing-library/react-native';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import LinkLayout from './_layout';

jest.mock('expo-router', () => ({
  Stack: ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="stack">{children}</View>;
  },
  Redirect: ({ href }: { href: string }) => {
    const { View } = require('react-native');
    return <View testID={`redirect-${href}`} />;
  },
}));

describe('link/_layout.tsx — MODE_NAV_V2_ENABLED gate', () => {
  let originalV2: boolean;

  beforeEach(() => {
    originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
  });

  afterEach(() => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      originalV2;
  });

  it('redirects to home when MODE_NAV_V2_ENABLED is off', () => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      false;

    render(<LinkLayout />);

    screen.getByTestId('redirect-/(app)/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });

  it('renders the Stack when MODE_NAV_V2_ENABLED is on', () => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;

    render(<LinkLayout />);

    screen.getByTestId('stack');
    expect(screen.queryByTestId('redirect-/(app)/home')).toBeNull();
  });
});
