import { render, waitFor } from '@testing-library/react-native';
import BillingManageLanding from './manage';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSwitchProfile = jest.fn();
let mockPayerPersonId = '00000000-0000-7000-a000-000000000001';
let mockActiveProfile = {
  id: '00000000-0000-7000-a000-000000000002',
  isOwner: false,
};
let mockProfiles = [
  mockActiveProfile,
  { id: mockPayerPersonId, isOwner: true },
];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ payerPersonId: mockPayerPersonId }),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock(
  /* gc1-allow: route test pins profile states; ProfileProvider switching is covered by lib/profile.test.tsx */
  '../../../lib/profile',
  () => ({
    useProfile: () => ({
      activeProfile: mockActiveProfile,
      profiles: mockProfiles,
      switchProfile: mockSwitchProfile,
    }),
  }),
);

describe('BillingManageLanding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPayerPersonId = '00000000-0000-7000-a000-000000000001';
    mockActiveProfile = {
      id: '00000000-0000-7000-a000-000000000002',
      isOwner: false,
    };
    mockProfiles = [
      mockActiveProfile,
      { id: mockPayerPersonId, isOwner: true },
    ];
    mockSwitchProfile.mockResolvedValue({ success: true });
  });

  it('switches a child-active device to the canonical payer before seeding the full ancestor chain', async () => {
    render(<BillingManageLanding />);

    await waitFor(() =>
      expect(mockSwitchProfile).toHaveBeenCalledWith(mockPayerPersonId),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/more/account');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/subscription');
  });

  it('does not switch when the canonical payer is already active', async () => {
    mockActiveProfile = { id: mockPayerPersonId, isOwner: true };
    mockProfiles = [mockActiveProfile];

    render(<BillingManageLanding />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/more'),
    );
    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/more/account');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/subscription');
  });

  it('routes to profile selection when the payer is not available on this account', async () => {
    mockProfiles = [mockActiveProfile];

    render(<BillingManageLanding />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profiles'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('rejects an available non-owner id from a tampered billing link', async () => {
    mockProfiles = [
      mockActiveProfile,
      { id: mockPayerPersonId, isOwner: false },
    ];

    render(<BillingManageLanding />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profiles'));
    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
