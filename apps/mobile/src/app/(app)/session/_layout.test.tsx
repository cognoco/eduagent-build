// WI-283: session/_layout.tsx proxy-mode explainer fallback.
//
// The layout has a <Redirect> fast path for proxy users. This test mocks
// Redirect to a no-op and verifies the explainer fallback View still renders
// so the user never sees a blank screen if the redirect fires after mount.

import { render, screen } from '@testing-library/react-native';

jest.mock('react-i18next' /* gc1-allow: i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock Redirect as a no-op so the screen body can render past it.
jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  Redirect: () => null,
  Stack: () => null,
}));

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires app context; layout test only needs the blocked/non-blocked branch */,
  () => ({
    useThemeColors: () => ({ background: '#ffffff' }),
  }),
);

jest.mock(
  '../../../lib/feature-flags' /* gc1-allow: compile-time constant; test pins it to match current default */,
  () => ({
    FEATURE_FLAGS: { MODE_NAV_V1_ENABLED: false },
  }),
);

// ---------------------------------------------------------------------------
// isParentProxy drives the `blocked` flag under V0 (MODE_NAV_V1_ENABLED=false).
// isExplicitProxyMode is read DIRECTLY from useProfile() for immediate updates.
// ---------------------------------------------------------------------------

let mockIsParentProxy = false;
let mockIsExplicitProxyMode = false;

jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: contract hook requires app provider tree */,
  () => ({
    useNavigationContract: () => ({
      isParentProxy: mockIsParentProxy,
      canEnter: () => !mockIsParentProxy,
      gates: {},
    }),
  }),
);

jest.mock(
  '../../../lib/profile' /* gc1-allow: profile context requires app provider setup */,
  () => ({
    useProfile: () => ({
      isExplicitProxyMode: mockIsExplicitProxyMode,
      activeProfile: null,
      profiles: [],
      isLoading: false,
    }),
  }),
);

const SessionLayout = require('./_layout').default as React.ComponentType;

describe('SessionLayout — proxy fallback (WI-283)', () => {
  afterEach(() => {
    mockIsParentProxy = false;
    mockIsExplicitProxyMode = false;
    jest.clearAllMocks();
  });

  it('[WI-283] renders the Stack normally when not in proxy mode', () => {
    render(<SessionLayout />);

    expect(screen.queryByTestId('session-proxy-fallback')).toBeNull();
  });

  it('[WI-283] renders the explainer fallback even when Redirect is a no-op (proxy mode)', () => {
    mockIsParentProxy = true;
    mockIsExplicitProxyMode = true;

    render(<SessionLayout />);

    screen.getByTestId('session-proxy-fallback');
  });

  it('[WI-283] fallback shows the proxy.readOnly.hint text', () => {
    mockIsParentProxy = true;
    mockIsExplicitProxyMode = true;

    render(<SessionLayout />);

    screen.getByText('proxy.readOnly.hint');
  });

  it('[WI-371] isExplicitProxyMode alone does not block — blocked is contract-driven', () => {
    // WI-371: blocked is now driven solely by navigationContract.isParentProxy.
    // When isParentProxy=false but isExplicitProxyMode=true, the screen renders
    // normally (no redirect, no proxy fallback). This is the regression guard for
    // the migration away from raw isExplicitProxyMode reads in session/_layout.tsx.
    mockIsParentProxy = false;
    mockIsExplicitProxyMode = true;

    render(<SessionLayout />);

    expect(screen.queryByTestId('session-proxy-fallback')).toBeNull();
  });
});
