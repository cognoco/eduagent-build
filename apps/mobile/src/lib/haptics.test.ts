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

const platformOS = { current: 'ios' as 'ios' | 'android' | 'web' };
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platformOS.current;
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  platformOS.current = 'ios';
});

describe('haptics utilities (native)', () => {
  it('hapticLight calls impactAsync with Light style', () => {
    const { hapticLight } = require('./haptics');
    hapticLight();
    expect(mockImpactAsync).toHaveBeenCalledWith('light');
  });
  it('hapticMedium calls impactAsync with Medium style', () => {
    const { hapticMedium } = require('./haptics');
    hapticMedium();
    expect(mockImpactAsync).toHaveBeenCalledWith('medium');
  });
  it('hapticSuccess calls notificationAsync with Success type', () => {
    const { hapticSuccess } = require('./haptics');
    hapticSuccess();
    expect(mockNotificationAsync).toHaveBeenCalledWith('success');
  });
  it('hapticError calls notificationAsync with Error type', () => {
    const { hapticError } = require('./haptics');
    hapticError();
    expect(mockNotificationAsync).toHaveBeenCalledWith('error');
  });
});

describe('haptics web platform guard [BUG-778]', () => {
  beforeEach(() => {
    platformOS.current = 'web';
  });
  it('hapticLight is a no-op on web', () => {
    const { hapticLight } = require('./haptics');
    hapticLight();
    expect(mockImpactAsync).not.toHaveBeenCalled();
  });
  it('hapticMedium is a no-op on web', () => {
    const { hapticMedium } = require('./haptics');
    hapticMedium();
    expect(mockImpactAsync).not.toHaveBeenCalled();
  });
  it('hapticSuccess is a no-op on web', () => {
    const { hapticSuccess } = require('./haptics');
    hapticSuccess();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });
  it('hapticError is a no-op on web', () => {
    const { hapticError } = require('./haptics');
    hapticError();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });
});
