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
      expect(screen.getByTestId('bookmark-nudge-tooltip')).toBeTruthy();
    });
  });

  it('stays hidden when SecureStore already records a dismissal for the profile', async () => {
    secureStore['bookmark-nudge-shown:p1'] = 'true';

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
      expect(secureStore['bookmark-nudge-shown:p1']).toBe('true');
    });
  });
});
