import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { OutboxFailedBanner } from './OutboxFailedBanner';
import { ensureI18nReady } from '../../i18n';
import * as MessageOutboxModule from '../../lib/message-outbox';
import * as Clipboard from 'expo-clipboard';

// Real lib/message-outbox: AsyncStorage and expo-crypto are globally mocked in
// test-setup.ts, so the real module runs against in-memory storage.
// Spy on the functions under test so each test can control their return values.
const mockListPermanentlyFailed = jest.spyOn(
  MessageOutboxModule,
  'listPermanentlyFailed',
);
const mockDeletePermanentlyFailed = jest.spyOn(
  MessageOutboxModule,
  'deletePermanentlyFailed',
);

// expo-clipboard is a native module stubbed
// globally in test-setup.ts; the bare-specifier mock is already in place.
const mockSetStringAsync = Clipboard.setStringAsync as jest.MockedFunction<
  typeof Clipboard.setStringAsync
>;

const ENTRY = {
  id: 'e-1',
  flow: 'session' as const,
  surfaceKey: 'chat',
  content: 'Hello world',
  createdAt: '2026-05-01T00:00:00Z',
  attempts: 3,
  lastAttemptAt: '2026-05-01T00:01:00Z',
  status: 'permanently-failed' as const,
};

// Pin the i18n init so this suite cannot regress to rendering raw keys if
// test-setup.ts ordering ever changes. Matches the pattern in
// format-api-error.test.ts.
beforeAll(async () => {
  await ensureI18nReady();
});

beforeEach(() => jest.clearAllMocks());

describe('OutboxFailedBanner', () => {
  it('renders nothing when no permanently failed entries exist', async () => {
    mockListPermanentlyFailed.mockResolvedValue([]);

    render(<OutboxFailedBanner profileId="p-1" flow="session" />);

    await waitFor(() => {
      expect(screen.queryByTestId('outbox-failed-banner')).toBeNull();
    });
  });

  it('renders banner with entry content when entries exist', async () => {
    mockListPermanentlyFailed.mockResolvedValue([ENTRY]);

    render(<OutboxFailedBanner profileId="p-1" flow="session" />);

    await waitFor(() => {
      screen.getByTestId('outbox-failed-banner');
    });

    screen.getByText('Some messages could not be sent');
    expect(
      screen.getByText(
        "Copy them or send them to support so your progress isn't lost.",
      ),
    ).toBeTruthy();
    screen.getByText('Hello world');
    screen.getByTestId('outbox-copy-e-1');
  });

  it('calls Clipboard.setStringAsync with entry content, then deletePermanentlyFailed, then refreshes', async () => {
    mockListPermanentlyFailed.mockResolvedValue([ENTRY]);
    mockSetStringAsync.mockResolvedValue(true);
    mockDeletePermanentlyFailed.mockResolvedValue(undefined);

    render(<OutboxFailedBanner profileId="p-1" flow="session" />);

    await waitFor(() => {
      screen.getByTestId('outbox-copy-e-1');
    });

    mockListPermanentlyFailed.mockResolvedValue([]);
    fireEvent.press(screen.getByTestId('outbox-copy-e-1'));

    await waitFor(() => {
      expect(mockSetStringAsync).toHaveBeenCalledWith('Hello world');
    });

    expect(mockDeletePermanentlyFailed).toHaveBeenCalledWith(
      'p-1',
      'session',
      'e-1',
    );

    await waitFor(() => {
      expect(mockListPermanentlyFailed).toHaveBeenCalledTimes(2);
    });
  });

  it('renders escalate button when onEscalate prop is provided', async () => {
    mockListPermanentlyFailed.mockResolvedValue([ENTRY]);

    render(
      <OutboxFailedBanner
        profileId="p-1"
        flow="session"
        onEscalate={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      screen.getByTestId('outbox-escalate-button');
    });
  });

  it('does not render escalate button when onEscalate prop is undefined', async () => {
    mockListPermanentlyFailed.mockResolvedValue([ENTRY]);

    render(<OutboxFailedBanner profileId="p-1" flow="session" />);

    await waitFor(() => {
      screen.getByTestId('outbox-failed-banner');
    });

    expect(screen.queryByTestId('outbox-escalate-button')).toBeNull();
  });

  it('calls onEscalate and refreshes the list when escalate button is pressed', async () => {
    mockListPermanentlyFailed.mockResolvedValue([ENTRY]);
    const onEscalate = jest.fn().mockResolvedValue(undefined);

    render(
      <OutboxFailedBanner
        profileId="p-1"
        flow="session"
        onEscalate={onEscalate}
      />,
    );

    await waitFor(() => {
      screen.getByTestId('outbox-escalate-button');
    });

    mockListPermanentlyFailed.mockResolvedValue([]);
    fireEvent.press(screen.getByTestId('outbox-escalate-button'));

    await waitFor(() => {
      expect(onEscalate).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockListPermanentlyFailed).toHaveBeenCalledTimes(2);
    });
  });
});
