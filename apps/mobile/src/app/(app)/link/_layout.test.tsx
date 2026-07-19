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

  // [WI-2188] AC-4 flags-off/V0/V1 preservation: the V2 gate must stay
  // independent of V0/V1 state in either direction — the WI-2188 in-app-exit
  // fix must not change this gate's behavior for any flag combination.
  describe('V2 gate is independent of V0/V1 (WI-2188 preservation)', () => {
    let originalV0: boolean;
    let originalV1: boolean;

    beforeEach(() => {
      originalV0 = FEATURE_FLAGS.MODE_NAV_V0_ENABLED;
      originalV1 = FEATURE_FLAGS.MODE_NAV_V1_ENABLED;
    });

    afterEach(() => {
      (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
        originalV0;
      (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
        originalV1;
    });

    it('redirects to home when V0=on, V1=on, but V2=off', () => {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        false;
      (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
        true;
      (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
        true;

      render(<LinkLayout />);

      screen.getByTestId('redirect-/(app)/home');
      expect(screen.queryByTestId('stack')).toBeNull();
    });

    it('redirects to home when V0=off, V1=off, V2=off (fully flags-off baseline)', () => {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        false;
      (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
        false;
      (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
        false;

      render(<LinkLayout />);

      screen.getByTestId('redirect-/(app)/home');
      expect(screen.queryByTestId('stack')).toBeNull();
    });
  });
});
