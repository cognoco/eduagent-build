import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const secureStore: Record<string, string> = {};
jest.mock('../../lib/secure-storage', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStore[key] ?? null)
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStore[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete secureStore[key];
    return Promise.resolve();
  }),
  sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

const { BookmarkNudgeTooltip } = require('./BookmarkNudgeTooltip');

describe('BookmarkNudgeTooltip', () => {
  beforeEach(() => {
    for (const key of Object.keys(secureStore)) {
      delete secureStore[key];
    }
    jest.clearAllMocks();
  });

  it('renders nothing when profileId is missing', () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={5}
        isFirstSession
        profileId={undefined}
      />
    );
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('renders nothing when not the first session', () => {
    render(
      <BookmarkNudgeTooltip
        aiResponseCount={5}
        isFirstSession={false}
        profileId="p1"
      />
    );
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('renders nothing before threshold of 3 AI responses', () => {
    render(
      <BookmarkNudgeTooltip aiResponseCount={2} isFirstSession profileId="p1" />
    );
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('renders tooltip when first session reaches 3 responses and no prior dismissal', async () => {
    render(
      <BookmarkNudgeTooltip aiResponseCount={3} isFirstSession profileId="p1" />
    );

    await waitFor(() => {
      screen.getByTestId('bookmark-nudge-tooltip');
    });
  });

  it('stays hidden when SecureStore already records a dismissal for the profile', async () => {
    // sanitizeSecureStoreKey replaces ':' with '_', so the stored key uses underscore
    secureStore['bookmark-nudge-shown_p1'] = 'true';

    render(
      <BookmarkNudgeTooltip aiResponseCount={3} isFirstSession profileId="p1" />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });

  it('dismiss press hides tooltip and persists per-profile flag', async () => {
    render(
      <BookmarkNudgeTooltip aiResponseCount={3} isFirstSession profileId="p1" />
    );

    const dismissBtn = await screen.findByTestId('bookmark-nudge-dismiss');
    fireEvent.press(dismissBtn);

    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
    await waitFor(() => {
      // sanitizeSecureStoreKey replaces ':' with '_'
      expect(secureStore['bookmark-nudge-shown_p1']).toBe('true');
    });
  });

  // L3: onBookmarkNow prop tests
  it('secondary bookmark-now button is absent when onBookmarkNow is not provided [L3]', async () => {
    render(
      <BookmarkNudgeTooltip aiResponseCount={3} isFirstSession profileId="p1" />
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
      />
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
      />
    );

    const bookmarkBtn = await screen.findByTestId(
      'bookmark-nudge-bookmark-now'
    );
    fireEvent.press(bookmarkBtn);

    expect(onBookmarkNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('bookmark-nudge-tooltip')).toBeNull();
  });
});
