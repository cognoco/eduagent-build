import { hapticLight, hapticMedium, hapticSuccess } from './haptics';

const mockImpactAsync = jest.fn();
const mockNotificationAsync = jest.fn();

jest.mock('expo-haptics', () => ({
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('haptics utilities', () => {
  it('hapticLight calls impactAsync with Light style', () => {
    hapticLight();
    expect(mockImpactAsync).toHaveBeenCalledWith('light');
  });

  it('hapticMedium calls impactAsync with Medium style', () => {
    hapticMedium();
    expect(mockImpactAsync).toHaveBeenCalledWith('medium');
  });

  it('hapticSuccess calls notificationAsync with Success type', () => {
    hapticSuccess();
    expect(mockNotificationAsync).toHaveBeenCalledWith('success');
  });
});
