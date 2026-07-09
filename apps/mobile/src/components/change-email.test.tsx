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

jest.mock('@clerk/expo', () => ({
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
  // [CRITICAL-2b] useReverification wraps a sensitive action and, if the Clerk
  // instance requires step-up, prompts + retries. In tests it is a passthrough
  // so the wrapped action runs directly and assertions stay on the real call.
  useReverification: (fn: (...args: unknown[]) => unknown) => fn,
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

  it('[auth-2] verifies, promotes the new email to primary, and syncs the server', async () => {
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
      screen.getByText('Email updated');
    });
  });

  it('[CRITICAL-2c] never destroys the old email — it is kept as a recovery address', async () => {
    active = renderScreen(<ChangeEmail />);

    await submitEmailAndCode();

    await waitFor(() => {
      screen.getByText('Email updated');
    });
    // The old address must remain a valid, verified recovery identifier so a
    // mistaken or hostile email change cannot strip the owner of their last
    // out-of-band way back in.
    expect(mockDestroyOldEmail).not.toHaveBeenCalled();
  });

  it('does not claim success when server sync fails (old email untouched)', async () => {
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
    });

    fireEvent.press(screen.getByTestId('change-email-retry-sync'));

    await waitFor(() => {
      expect(mockSyncEmail).toHaveBeenCalledTimes(2);
      expect(mockAttemptVerification).toHaveBeenCalledTimes(1);
      expect(mockDestroyOldEmail).not.toHaveBeenCalled();
      screen.getByText('Email updated');
    });
  });

  it('does not claim success when server sync returns a conflict', async () => {
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
