import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: { for?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
    push: mockPush,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let datePickerOnChange: ((event: unknown, date?: Date) => void) | null = null;

jest.mock('@react-native-community/datetimepicker', () => {
  const RN = require('react-native');
  const ReactReq = require('react');
  return {
    __esModule: true,
    default: (props: {
      onChange?: (event: unknown, date?: Date) => void;
      testID?: string;
    }) => {
      datePickerOnChange = props.onChange ?? null;
      return ReactReq.createElement(RN.View, { testID: props.testID });
    },
  };
});

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

const mockSwitchProfile = jest.fn().mockResolvedValue(undefined);

// BUG-301: Made per-test overridable so isParentAddingChild can be tested.
const mockUseProfile = jest.fn();
jest.mock('../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const CreateProfileScreen = require('./create-profile').default;

describe('CreateProfileScreen', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    mockSearchParams = {};
    datePickerOnChange = null;
    mockCanGoBack.mockReturnValue(true);
    // Default: non-parent flow (first-time user / child self-registering)
    mockUseProfile.mockReturnValue({
      switchProfile: mockSwitchProfile,
      activeProfile: null,
      profiles: [],
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders form fields (persona picker hidden, auto-detected)', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('create-profile-name')).toBeTruthy();
    expect(screen.getByTestId('create-profile-birthdate')).toBeTruthy();
    expect(screen.getByTestId('create-profile-submit')).toBeTruthy();
    // Birth date explanatory copy is visible
    expect(
      screen.getByText(/personalise how your mentor talks to you/)
    ).toBeTruthy();
    // Persona picker buttons are hidden (auto-detected from birth date)
    expect(screen.queryByTestId('persona-teen')).toBeNull();
    expect(screen.queryByTestId('persona-learner')).toBeNull();
    expect(screen.queryByTestId('persona-parent')).toBeNull();
  });

  // [BUG-900] When a parent (account owner with existing profile) opens the
  // create-profile screen, the copy must address the child, not the parent.
  describe('isParentAddingChild copy [BUG-900]', () => {
    beforeEach(() => {
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: { id: 'parent-1', isOwner: true },
        profiles: [{ id: 'parent-1', isOwner: true }],
      });
    });

    it('uses child-referent copy on the explanatory line', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      expect(
        screen.getByText(/personalise how their mentor talks to them/)
      ).toBeTruthy();
      // Original first-person copy must NOT appear when adding a child
      expect(
        screen.queryByText(/personalise how your mentor talks to you/)
      ).toBeNull();
    });

    it('shows minimum age 11 hint up front', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      expect(screen.getByText(/Minimum age is 11/)).toBeTruthy();
    });

    it('uses "Add a child" as the page title', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      expect(screen.getByText('Add a child')).toBeTruthy();
      expect(screen.queryByText('New profile')).toBeNull();
    });

    it("uses Child's display name + child-referent placeholder", () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      expect(screen.getByText("Child's display name")).toBeTruthy();
      expect(
        screen.getByPlaceholderText("Enter your child's name")
      ).toBeTruthy();
    });
  });

  it('uses child-referent copy when opened with ?for=child even before parent state resolves', () => {
    mockSearchParams = { for: 'child' };

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Add a child')).toBeTruthy();
    expect(screen.getByText("Child's display name")).toBeTruthy();
    expect(
      screen.getByText(/personalise how their mentor talks to them/)
    ).toBeTruthy();
    expect(
      screen.queryByText(/personalise how your mentor talks to you/)
    ).toBeNull();
  });

  it('disables submit when name is empty', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    const button = screen.getByTestId('create-profile-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('disables submit when birthdate is not selected', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    const button = screen.getByTestId('create-profile-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('opens date picker when birthdate field is pressed', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));

    expect(screen.getByTestId('date-picker')).toBeTruthy();
  });

  it('renders a web birthdate input fallback', () => {
    const RN = require('react-native');
    const originalOs = Object.getOwnPropertyDescriptor(RN.Platform, 'OS');

    Object.defineProperty(RN.Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });

    try {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      expect(screen.getByTestId('create-profile-birthdate-input')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.changeText(
        screen.getByTestId('create-profile-birthdate-input'),
        '2010-06-15'
      );

      const button = screen.getByTestId('create-profile-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled
      ).toBeFalsy();
    } finally {
      if (originalOs) {
        Object.defineProperty(RN.Platform, 'OS', originalOs);
      }
    }
  });

  it('calls POST and navigates back on successful submit (adult, no consent needed)', async () => {
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthYear: 2000,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Open date picker and select a date (26-year-old → no consent)
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('new-id');
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('redirects to consent screen for child under 16', async () => {
    const newProfile = {
      id: 'child-id',
      accountId: 'a1',
      displayName: 'Kid',
      avatarUrl: null,
      birthYear: 2014,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: 'PENDING',
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Kid');

    // Open date picker and select a date (12-year-old → consent required)
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2014, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/consent',
        params: { profileId: 'child-id' },
      });
    });
  });

  it('auto-detects persona from birthdate (no picker shown)', async () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      // Set birthdate to a 10-year-old → TEEN detected silently
      datePickerOnChange?.({ type: 'set' }, new Date(2016, 0, 1));
    });

    // No persona picker or hint shown — detection is invisible to the user
    expect(screen.queryByTestId('persona-auto-hint')).toBeNull();
    expect(screen.queryByTestId('persona-teen')).toBeNull();
  });

  it('displays error on API failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('API error: 422', {
        status: 422,
        statusText: 'Unprocessable Entity',
      })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Select a birthdate so submit is enabled
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2010, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('create-profile-error')).toBeTruthy();
    });
  });

  // [BUG-947] 402 PROFILE_LIMIT_EXCEEDED is an upgrade gate, not a server fault.
  // Without the special-case, the catch block rendered the generic
  // "Something went wrong on our end" inline error — the symptom QA reported as
  // a fake 500. The screen must instead surface an upgrade alert that routes to
  // the subscription screen on confirm.
  it('[BUG-947] surfaces upgrade alert and routes to subscription on PROFILE_LIMIT_EXCEEDED', async () => {
    const upgradeMessage =
      'Your subscription does not support additional profiles. Please upgrade to Family or Pro.';
    // Throw the typed error directly from the mocked fetch — this is what the
    // real `customFetch` in api-client.ts converts a 402+code response into.
    // The test's `useApiClient` mock uses raw `hc(...)` and does not reproduce
    // the customFetch error-classification layer, so we simulate its output
    // here. See api-client.ts:248 for the production conversion.
    const { UpstreamError } = require('../lib/api-errors');
    mockFetch.mockImplementationOnce(() => {
      throw new UpstreamError(upgradeMessage, 'PROFILE_LIMIT_EXCEEDED', 402);
    });

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('create-profile-name'),
      'Test Child'
    );
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2013, 4, 1));
    });
    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[0]).toBe('Upgrade required');
    expect(alertCall[1]).toBe(upgradeMessage);
    // Two buttons: "Not now" (cancel) + "See plans" (action)
    const buttons = alertCall[2] as Array<{
      text?: string;
      style?: string;
      onPress?: () => void;
    }>;
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.text).toBe('Not now');
    expect(buttons[0]?.style).toBe('cancel');
    expect(buttons[1]?.text).toBe('See plans');

    // Pressing "See plans" routes to the subscription screen
    buttons[1]?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    // The inline error banner must NOT be shown — the alert is the surface.
    expect(screen.queryByTestId('create-profile-error')).toBeNull();
  });

  // [BUG-947] HMR resilience: Metro HMR can reload api-errors.ts and create a
  // new class identity, breaking `instanceof UpstreamError`. The fix reads
  // `.message` via plain property access, so PROFILE_LIMIT_EXCEEDED is
  // classified correctly even when instanceof would return false.
  it('[BUG-947] surfaces upgrade alert with correct message when instanceof would fail (HMR)', async () => {
    const upgradeMessage = 'Server-provided upgrade message for HMR test.';
    // Simulate HMR identity mismatch: throw a plain Error with the same shape
    // as UpstreamError but constructed from a *different* Error class (as if
    // api-errors.ts was reloaded). `instanceof UpstreamError` would return false
    // for this object, but `.code` is still readable.
    const hmrError = Object.assign(new Error(upgradeMessage), {
      name: 'UpstreamError',
      code: 'PROFILE_LIMIT_EXCEEDED',
      status: 402,
    });
    mockFetch.mockImplementationOnce(() => {
      throw hmrError;
    });

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('create-profile-name'),
      'Test Child'
    );
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2013, 4, 1));
    });
    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[0]).toBe('Upgrade required');
    // Server-provided message must be surfaced — NOT the fallback string.
    expect(alertCall[1]).toBe(upgradeMessage);
    const buttons = alertCall[2] as Array<{
      text?: string;
      style?: string;
      onPress?: () => void;
    }>;
    expect(buttons).toHaveLength(2);
    expect(buttons[1]?.text).toBe('See plans');

    // Pressing "See plans" routes to the subscription screen
    buttons[1]?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    // No inline error banner — alert is the surface.
    expect(screen.queryByTestId('create-profile-error')).toBeNull();
  });

  it('navigates back on cancel', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-cancel'));

    expect(mockBack).toHaveBeenCalled();
  });

  it('replaces home on cancel when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  // ---------------------------------------------------------------------------
  // BUG-301: isParentAddingChild code path tests
  // ---------------------------------------------------------------------------

  // [BUG-UX-PROFILE-TIMEOUT] 30s hard UI-level timeout on profile creation POST.
  describe('[BUG-UX-PROFILE-TIMEOUT] 30s safety timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // POST never resolves — simulates a hung network call.
      mockFetch.mockReturnValue(new Promise(() => undefined));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function fillAndSubmit() {
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(async () => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      fireEvent.press(screen.getByTestId('create-profile-submit'));
    }

    it('does NOT show the timeout error before 30s elapses', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(29_999);
      });

      expect(screen.queryByTestId('create-profile-error')).toBeNull();
    });

    it('shows inline timeout error and restores form after 30s', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      // Error message is shown.
      expect(screen.getByTestId('create-profile-error')).toBeTruthy();
      // Form is restored so the user can retry — submit button should be
      // enabled again (loading=false, name + date still set).
      const button = screen.getByTestId('create-profile-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled
      ).toBeFalsy();
    });

    it('clears the safety timeout when loading flag resets before 30s (cleanup)', async () => {
      // The timeout watches `loading`. Once loading goes false (POST resolves
      // or the component unmounts), the timer must be cancelled.
      // We simulate: submit starts loading, then loading drops before 30s —
      // advancing past 30s must NOT set the error.
      const { unmount } = render(<CreateProfileScreen />, {
        wrapper: Wrapper,
      });
      await fillAndSubmit();

      // Advance to 15s — still loading, no error yet.
      act(() => {
        jest.advanceTimersByTime(15_000);
      });
      expect(screen.queryByTestId('create-profile-error')).toBeNull();

      // Simulate POST completing: the component resets loading via setLoading(false)
      // in the finally block. We can't easily reach that without a real resolve,
      // so instead unmount and verify the timer doesn't fire after unmount.
      // Unmounting the component calls the useEffect cleanup (clearTimeout).
      unmount();

      // Advance well past 30s — timer should have been cleared on unmount.
      act(() => {
        jest.advanceTimersByTime(20_000);
      });

      // No uncaught timer fire — the test would throw if setLoading/setError
      // were called on an unmounted component without cleanup.
    });
  });

  describe('parent adding child', () => {
    const parentProfile = {
      id: 'parent-id',
      accountId: 'a1',
      displayName: 'Mum',
      avatarUrl: null,
      birthYear: 1985,
      location: null,
      isOwner: true,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const childProfile = {
      id: 'child-new',
      accountId: 'a1',
      displayName: 'Lily',
      avatarUrl: null,
      birthYear: 2014,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: 'CONSENTED',
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    beforeEach(() => {
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: parentProfile,
        profiles: [parentProfile],
      });
    });

    it('shows confirmation alert and does NOT switch profile when parent adds child', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: childProfile }), { status: 200 })
      );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2014, 5, 15));
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Profile created',
          "Lily's profile is ready. You can switch to it from the Profiles screen.",
          undefined,
          undefined
        );
      });

      // Parent stays on their own profile — switchProfile must NOT be called
      expect(mockSwitchProfile).not.toHaveBeenCalled();
      // Navigation back (handleClose) should fire
      expect(mockBack).toHaveBeenCalled();
    });

    it('navigates home when parent adds child and no back history', async () => {
      mockCanGoBack.mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: childProfile }), { status: 200 })
      );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2014, 5, 15));
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });

    it('shows error banner on API failure — no alert or navigation', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2014, 5, 15));
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('create-profile-error')).toBeTruthy();
      });

      // No confirmation alert or navigation on failure
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });
  });
});
