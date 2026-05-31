import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import * as SecureStore from '../lib/secure-storage';
import { platformAlert } from '../lib/platform-alert';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { useGuardianNotificationAsk } from './use-guardian-notification-ask';

jest.mock(
  '../lib/platform-alert' /* gc1-allow: native-boundary; platformAlert wraps React Native Alert/web globals */,
  () => ({
    platformAlert: jest.fn(),
  }),
);

jest.mock(
  '../lib/secure-storage' /* gc1-allow: native-boundary; SecureStore is controlled per test */,
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);

jest.mock(
  '../lib/sentry' /* gc1-allow: observability boundary; lib/sentry initializes native transports on import */,
  () => ({
    Sentry: { addBreadcrumb: jest.fn(), captureException: jest.fn() },
  }),
);

const mockSecureGet = SecureStore.getItemAsync as jest.Mock;
const mockSecureSet = SecureStore.setItemAsync as jest.Mock;
const mockGetPerm = Notifications.getPermissionsAsync as jest.Mock;
const mockReqPerm = Notifications.requestPermissionsAsync as jest.Mock;
const mockAlert = platformAlert as jest.Mock;

const guardian = createTestProfile({
  id: 'guardian-profile',
  displayName: 'Alex Parent',
  isOwner: true,
  birthYear: 2012,
});

const child = createTestProfile({
  id: 'child-profile',
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2014,
});

const soloOwner = createTestProfile({
  id: 'solo-owner',
  displayName: 'Solo Owner',
  isOwner: true,
});

function renderGuardianAsk({
  activeProfile = guardian,
  profiles = [guardian, child],
  isExplicitProxyMode = false,
}: {
  activeProfile?: typeof guardian | null;
  profiles?: (typeof guardian)[];
  isExplicitProxyMode?: boolean;
} = {}): void {
  const { wrapper } = createHookWrapper({
    activeProfile,
    profiles,
    isExplicitProxyMode,
  });
  renderHook(() => useGuardianNotificationAsk(), { wrapper });
}

async function waitForPermissionCheck(): Promise<void> {
  await waitFor(() => {
    expect(mockGetPerm).toHaveBeenCalled();
  });
}

async function advancePastPrimerDelay(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
}

describe('useGuardianNotificationAsk', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSecureGet.mockResolvedValue(null);
    mockSecureSet.mockResolvedValue(undefined);
    mockGetPerm.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    mockReqPerm.mockResolvedValue({ status: 'granted' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prompts only an owner with linked children without using age as eligibility', async () => {
    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockSecureGet).toHaveBeenCalledWith(
      expect.stringContaining('guardianNotificationAskShown_guardian-profile'),
    );

    jest.clearAllMocks();
    renderGuardianAsk({ activeProfile: soloOwner, profiles: [soloOwner] });
    await advancePastPrimerDelay();

    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();

    jest.clearAllMocks();
    renderGuardianAsk({ activeProfile: child, profiles: [guardian, child] });
    await advancePastPrimerDelay();

    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('skips the guardian ask in parent-proxy mode', async () => {
    renderGuardianAsk({ isExplicitProxyMode: true });

    await advancePastPrimerDelay();

    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockGetPerm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('deduplicates with a dedicated guardian key', async () => {
    mockSecureGet.mockResolvedValue('true');

    renderGuardianAsk();

    await waitFor(() => {
      expect(mockSecureGet).toHaveBeenCalledWith(
        expect.stringContaining(
          'guardianNotificationAskShown_guardian-profile',
        ),
      );
    });
    await advancePastPrimerDelay();

    expect(mockGetPerm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockSecureGet).not.toHaveBeenCalledWith(
      expect.stringContaining('notificationFirstAskShown_guardian-profile'),
    );
  });

  it('does not let the learner primer key suppress the guardian ask', async () => {
    mockSecureGet.mockImplementation(async (key: string) =>
      key.includes('notificationFirstAskShown_') ? 'true' : null,
    );

    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const cancelButton = buttons.find((button) => button.style === 'cancel');

    act(() => {
      cancelButton?.onPress?.();
    });

    expect(mockSecureSet).toHaveBeenCalledWith(
      expect.stringContaining('guardianNotificationAskShown_guardian-profile'),
      'true',
    );
    expect(mockSecureSet).not.toHaveBeenCalledWith(
      expect.stringContaining('notificationFirstAskShown_guardian-profile'),
      'true',
    );
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it('marks seen after Allow requests OS permission', async () => {
    renderGuardianAsk();

    await waitForPermissionCheck();
    await advancePastPrimerDelay();

    const buttons = mockAlert.mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const allowButton = buttons.find((button) => button.style !== 'cancel');

    await act(async () => {
      allowButton?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReqPerm).toHaveBeenCalledTimes(1);
    });
    expect(mockSecureSet).toHaveBeenCalledWith(
      expect.stringContaining('guardianNotificationAskShown_guardian-profile'),
      'true',
    );
  });

  it('marks seen without prompting when permission is already granted or cannot ask again', async () => {
    mockGetPerm.mockResolvedValue({ status: 'granted', canAskAgain: true });
    renderGuardianAsk();

    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining(
          'guardianNotificationAskShown_guardian-profile',
        ),
        'true',
      );
    });
    expect(mockAlert).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockSecureGet.mockResolvedValue(null);
    mockSecureSet.mockResolvedValue(undefined);
    mockGetPerm.mockResolvedValue({ status: 'denied', canAskAgain: false });
    renderGuardianAsk();

    await waitFor(() => {
      expect(mockSecureSet).toHaveBeenCalledWith(
        expect.stringContaining(
          'guardianNotificationAskShown_guardian-profile',
        ),
        'true',
      );
    });
    expect(mockAlert).not.toHaveBeenCalled();
  });
});
