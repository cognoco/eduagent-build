import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { cleanupScreen, renderScreen } from '../test-utils/screen-render';
import { ChangeEmail } from './change-email';

const mockCreateEmailAddress = jest.fn();
const mockPrepareVerification = jest.fn();
const mockAttemptVerification = jest.fn();
const mockUpdate = jest.fn();
const mockReload = jest.fn();
const mockDestroyOldEmail = jest.fn();
const mockSyncEmail = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: {
      createEmailAddress: mockCreateEmailAddress,
      primaryEmailAddress: {
        id: 'email-old',
        emailAddress: 'old@example.com',
        destroy: mockDestroyOldEmail,
      },
      reload: mockReload,
      update: mockUpdate,
    },
  }),
  useAuth: () => ({ getToken: jest.fn() }),
}));

jest.mock(
  '../lib/api-client' /* gc1-allow: transport-boundary — email sync route is covered by API tests; component test controls HTTP success/conflict responses */,
  () => ({
    useApiClient: () => ({
      account: {
        email: {
          $patch: mockSyncEmail,
        },
      },
    }),
  }),
);

function mockNewEmailResource(emailAddress = 'new@example.com') {
  return {
    id: 'email-new',
    emailAddress,
    prepareVerification: mockPrepareVerification,
    attemptVerification: mockAttemptVerification,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function submitEmailAndCode(): Promise<void> {
  fireEvent.changeText(
    screen.getByTestId('change-email-input'),
    'new@example.com',
  );
  fireEvent.press(screen.getByTestId('change-email-send-code'));
  await waitFor(() => {
    expect(mockPrepareVerification).toHaveBeenCalled();
  });
  fireEvent.changeText(screen.getByTestId('change-email-code'), '123456');
  fireEvent.press(screen.getByTestId('change-email-verify'));
}

describe('ChangeEmail', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.resetAllMocks();
    mockCreateEmailAddress.mockResolvedValue(mockNewEmailResource());
    mockPrepareVerification.mockResolvedValue({});
    mockAttemptVerification.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    mockReload.mockResolvedValue({});
    mockDestroyOldEmail.mockResolvedValue({});
    mockSyncEmail.mockResolvedValue(jsonResponse({ email: 'new@example.com' }));
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('[auth-2] verifies, promotes, syncs, and removes the old login email', async () => {
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      expect(mockCreateEmailAddress).toHaveBeenCalledWith({
        email: 'new@example.com',
      });
      expect(mockPrepareVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      });
      expect(mockAttemptVerification).toHaveBeenCalledWith({ code: '123456' });
      expect(mockUpdate).toHaveBeenCalledWith({
        primaryEmailAddressId: 'email-new',
      });
      expect(mockReload).toHaveBeenCalled();
      expect(mockSyncEmail).toHaveBeenCalledWith({
        json: { email: 'new@example.com' },
      });
      expect(mockDestroyOldEmail).toHaveBeenCalled();
      screen.getByText('Email updated');
    });
  });

  it('does not claim success or destroy the old email when server sync fails', async () => {
    mockSyncEmail.mockRejectedValue(new Error('Conflict'));
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      screen.getByText(/account record was not updated/i);
      expect(screen.queryByText('Email updated')).toBeNull();
      expect(mockDestroyOldEmail).not.toHaveBeenCalled();
    });
  });

  it('retries backend sync without reusing the verification code', async () => {
    mockSyncEmail
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(jsonResponse({ email: 'new@example.com' }));
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      screen.getByText(/account record was not updated/i);
      expect(mockAttemptVerification).toHaveBeenCalledTimes(1);
      expect(mockDestroyOldEmail).not.toHaveBeenCalled();
    });

    fireEvent.press(screen.getByTestId('change-email-retry-sync'));

    await waitFor(() => {
      expect(mockSyncEmail).toHaveBeenCalledTimes(2);
      expect(mockAttemptVerification).toHaveBeenCalledTimes(1);
      expect(mockDestroyOldEmail).toHaveBeenCalledTimes(1);
      screen.getByText('Email updated');
    });
  });

  it('does not claim success or destroy the old email when server sync returns a conflict', async () => {
    mockSyncEmail.mockResolvedValue(
      jsonResponse(
        {
          code: 'EMAIL_NOT_AVAILABLE',
          message: 'This email is already in use.',
        },
        409,
      ),
    );
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      screen.getByText(/already in use/i);
      expect(screen.queryByText('Email updated')).toBeNull();
      expect(mockDestroyOldEmail).not.toHaveBeenCalled();
    });
  });

  it('shows a non-blocking warning when old email removal fails', async () => {
    mockDestroyOldEmail.mockRejectedValue(new Error('destroy failed'));
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      expect(screen.getByText('Email updated').props.accessibilityRole).toBe(
        'alert',
      );
      expect(
        screen.getByText(/old email is still active/i).props.accessibilityRole,
      ).toBe('alert');
    });
  });

  it('surfaces duplicate email errors from Clerk', async () => {
    mockCreateEmailAddress.mockRejectedValue({
      errors: [{ longMessage: 'Email address is already taken.' }],
    });
    active = renderScreen(<ChangeEmail />);

    fireEvent.changeText(
      screen.getByTestId('change-email-input'),
      'new@example.com',
    );
    fireEvent.press(screen.getByTestId('change-email-send-code'));

    await waitFor(() => {
      screen.getByText('Email address is already taken.');
      expect(mockPrepareVerification).not.toHaveBeenCalled();
    });
  });

  it('surfaces invalid or expired verification codes', async () => {
    mockAttemptVerification.mockRejectedValue({
      errors: [{ longMessage: 'Verification code is invalid.' }],
    });
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      screen.getByText('Verification code is invalid.');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSyncEmail).not.toHaveBeenCalled();
    });
  });
});
