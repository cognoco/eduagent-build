import { render, waitFor } from '@testing-library/react-native';
import BillingManageLanding from './manage';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSwitchProfile = jest.fn();
let mockShowBilling = false;
let mockPayerPersonId = '00000000-0000-7000-a000-000000000001';
let mockParentProfile: { id: string } | null = { id: mockPayerPersonId };
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

// prettier-ignore
jest.mock(/* gc1-allow: profile seam */ '../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
    profiles: mockProfiles,
    switchProfile: mockSwitchProfile,
  }),
}));

// prettier-ignore
jest.mock(/* gc1-allow: route capability seam */ '../../../hooks/use-navigation-contract', () => ({
  useNavigationContract: () => ({ gates: { showBilling: mockShowBilling } }),
}));

// prettier-ignore
jest.mock(/* gc1-allow: canonical payer identity seam */ '../../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({ parentProfile: mockParentProfile }),
}));

describe('BillingManageLanding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowBilling = false;
    mockPayerPersonId = '00000000-0000-7000-a000-000000000001';
    mockParentProfile = { id: mockPayerPersonId };
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
    const rendered = render(<BillingManageLanding />);

    await waitFor(() =>
      expect(mockSwitchProfile).toHaveBeenCalledWith(mockPayerPersonId),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    mockActiveProfile = { id: mockPayerPersonId, isOwner: true };
    mockShowBilling = true;
    rendered.rerender(<BillingManageLanding />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/more'),
    );
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/more/account');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/subscription');
  });

  it('does not switch when the canonical payer is already active', async () => {
    mockActiveProfile = { id: mockPayerPersonId, isOwner: true };
    mockProfiles = [mockActiveProfile];
    mockShowBilling = true;

    render(<BillingManageLanding />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/more'),
    );
    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/more/account');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/subscription');
  });

  it('routes to profile selection when the payer is not available on this account', async () => {
    mockParentProfile = null;

    render(<BillingManageLanding />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profiles'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('rejects a tampered payer id that does not match the canonical owner', async () => {
    mockParentProfile = { id: '00000000-0000-7000-a000-000000000003' };

    render(<BillingManageLanding />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profiles'));
    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes to profile selection when switching to the payer rejects', async () => {
    mockSwitchProfile.mockRejectedValue(new Error('network unavailable'));

    render(<BillingManageLanding />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profiles'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
