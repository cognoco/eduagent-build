import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// Use the real lib/secure-storage (wraps expo-secure-store, which is globally
// mocked in test-setup.ts with an in-memory __store). Seed test state via
// jest.requireMock('expo-secure-store').__store instead of a local record.
const expoSecureStoreMock = jest.requireMock('expo-secure-store') as {
  __store: Map<string, string>;
};

const { BookmarkNudgeTooltip } = require('./BookmarkNudgeTooltip');

describe('BookmarkNudgeTooltip', () => {
  beforeEach(() => {
    // test-setup.ts already clears expoSecureStoreMock.__store before each test.
    jest.clearAllMocks();
  });

  it('renders nothing when profileId is missing', () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={5}
        isFirstSession
        profileId={undefined}
      />,
    );
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('renders nothing when not the first session', () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={5}
        isFirstSession={false}
        profileId="p1"
      />,
    );
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('renders nothing before threshold of 3 AI responses', () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={2}
        isFirstSession
        profileId="p1"
      />,
    );
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('renders tooltip when first session reaches 3 responses and no prior dismissal', async () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={3}
        isFirstSession
        profileId="p1"
      />,
    );

    await waitFor(() => {
      screen.getByTestId('bookmark-nudge-tooltip');
    });
  });

  it('stays hidden when SecureStore already records a dismissal for the profile', async () => {
    // sanitizeSecureStoreKey replaces ':' with '_', so the stored key uses underscore
    expoSecureStoreMock.__store.set('bookmark-nudge-shown_p1', 'true');

    render(
      <BookmarkNudgeTooltip
        aiResponseCount={3}
        isFirstSession
        profileId="p1"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('dismiss press hides tooltip and persists per-profile flag', async () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={3}
        isFirstSession
        profileId="p1"
      />,
    );

    const dismissBtn = await screen.findByTestId('bookmark-nudge-dismiss');
    fireEvent.press(dismissBtn);

    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
    await waitFor(() => {
      // sanitizeSecureStoreKey replaces ':' with '_'
      expect(expoSecureStoreMock.__store.get('bookmark-nudge-shown_p1')).toBe(
        'true',
      );
    });
  });

  // L3: onBookmarkNow prop tests
  it('secondary bookmark-now button is absent when onBookmarkNow is not provided [L3]', async () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={3}
        isFirstSession
        profileId="p1"
      />,
    );

    await waitFor(() => {
      screen.getByTestId('bookmark-nudge-tooltip');
    });

    expect(screen.queryByTestId('bookmark-nudge-bookmark-now')).toBeNull();
  });

  it('secondary bookmark-now button renders when onBookmarkNow is provided [L3]', async () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={3}
        isFirstSession
        profileId="p1"
        onBookmarkNow={jest.fn()}
      />,
    );

    await waitFor(() => {
      screen.getByTestId('bookmark-nudge-bookmark-now');
    });
  });

  it('pressing bookmark-now calls onBookmarkNow and hides the tooltip [L3]', async () => {
    const onBookmarkNow = jest.fn();
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={3}
        isFirstSession
        profileId="p1"
        onBookmarkNow={onBookmarkNow}
      />,
    );

    const bookmarkBtn = await screen.findByTestId(
      'bookmark-nudge-bookmark-now',
    );
    fireEvent.press(bookmarkBtn);

    expect(onBookmarkNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });
});
