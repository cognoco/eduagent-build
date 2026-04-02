import { renderHook, act } from '@testing-library/react-native';

import { useRatingPrompt } from './use-rating-prompt';

const mockRequestReview = jest.fn().mockResolvedValue(undefined);
const mockIsAvailableAsync = jest.fn().mockResolvedValue(true);

jest.mock('expo-store-review', () => ({
  requestReview: () => mockRequestReview(),
  isAvailableAsync: () => mockIsAvailableAsync(),
}));

const secureStore: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStore[key] ?? null)
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStore[key] = value;
    return Promise.resolve();
  }),
}));

const mockProfile = {
  id: 'profile-1',
  personaType: 'LEARNER',
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
};

jest.mock('../lib/profile', () => ({
  useProfile: () => ({ activeProfile: mockProfile }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
});

describe('useRatingPrompt', () => {
  it('does not prompt when recall count is below threshold', async () => {
    // Only 1 recall
    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('prompts after 5 successful recalls', async () => {
    // Pre-set count to 4 (next call will be the 5th)
    secureStore['rating-recall-success-count-profile-1'] = '4';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });

  it('does not prompt parent persona', async () => {
    mockProfile.personaType = 'PARENT';
    secureStore['rating-recall-success-count-profile-1'] = '10';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
    mockProfile.personaType = 'LEARNER'; // restore
  });

  it('does not prompt when prompted recently (within 90 days)', async () => {
    secureStore['rating-recall-success-count-profile-1'] = '10';
    secureStore['rating-last-prompt-profile-1'] = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString(); // 30 days ago

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('does not prompt for new profiles (< 7 days old)', async () => {
    mockProfile.createdAt = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString(); // 3 days ago
    secureStore['rating-recall-success-count-profile-1'] = '10';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
    // restore
    mockProfile.createdAt = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
  });
});
