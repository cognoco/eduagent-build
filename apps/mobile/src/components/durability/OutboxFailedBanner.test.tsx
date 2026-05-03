import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { OutboxFailedBanner } from './OutboxFailedBanner';
import {
  listPermanentlyFailed,
  deletePermanentlyFailed,
} from '../../lib/message-outbox';
import * as Clipboard from 'expo-clipboard';

jest.mock('../../lib/message-outbox', () => ({
  listPermanentlyFailed: jest.fn(),
  deletePermanentlyFailed: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

const mockListPermanentlyFailed = listPermanentlyFailed as jest.MockedFunction<
  typeof listPermanentlyFailed
>;
const mockDeletePermanentlyFailed =
  deletePermanentlyFailed as jest.MockedFunction<
    typeof deletePermanentlyFailed
  >;
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
        "Copy them or send them to support so your progress isn't lost."
      )
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
      'e-1'
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
      />
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
      />
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
