import { renderHook, act } from '@testing-library/react-native';
import * as SecureStore from '../lib/secure-storage';
import { useDictationPreferences } from './use-dictation-preferences';

jest.mock('../lib/secure-storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));
const mockGet = jest.mocked(SecureStore.getItemAsync);
const mockSet = jest.mocked(SecureStore.setItemAsync);

describe('useDictationPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
  });

  it('returns default pace "slow" when nothing stored', async () => {
    const { result } = renderHook(() => useDictationPreferences('profile-123'));

    await act(() => Promise.resolve());

    expect(result.current.pace).toBe('slow');
  });

  it('returns default punctuationReadAloud true when nothing stored', async () => {
    const { result } = renderHook(() => useDictationPreferences('profile-123'));

    await act(() => Promise.resolve());

    expect(result.current.punctuationReadAloud).toBe(true);
  });

  it('loads stored pace from SecureStore', async () => {
    mockGet.mockImplementation(async (key) => {
      if (key === 'dictation-pace-profile-123') return 'fast';
      if (key === 'dictation-punctuation-profile-123') return 'false';
      return null;
    });

    const { result } = renderHook(() => useDictationPreferences('profile-123'));

    await act(() => Promise.resolve());

    expect(result.current.pace).toBe('fast');
    expect(result.current.punctuationReadAloud).toBe(false);
  });

  it('setPace writes to SecureStore and updates state', async () => {
    mockSet.mockResolvedValue();

    const { result } = renderHook(() => useDictationPreferences('profile-123'));

    await act(() => Promise.resolve());
    await act(async () => {
      result.current.setPace('normal');
    });

    expect(mockSet).toHaveBeenCalledWith(
      'dictation-pace-profile-123',
      'normal',
    );
    expect(result.current.pace).toBe('normal');
  });

  it('togglePunctuation flips state and writes to SecureStore', async () => {
    mockSet.mockResolvedValue();

    const { result } = renderHook(() => useDictationPreferences('profile-123'));

    await act(() => Promise.resolve());

    // Default is true; toggling should flip to false
    await act(async () => {
      result.current.togglePunctuation();
    });

    expect(result.current.punctuationReadAloud).toBe(false);
    expect(mockSet).toHaveBeenCalledWith(
      'dictation-punctuation-profile-123',
      'false',
    );
  });

  // RF-05: cyclePace must follow slow → normal → fast → slow cycle
  it('cyclePace follows slow → normal → fast → slow cycle', async () => {
    mockSet.mockResolvedValue();

    const { result } = renderHook(() => useDictationPreferences('profile-123'));

    await act(() => Promise.resolve());

    // Starts at 'slow'
    expect(result.current.pace).toBe('slow');

    await act(async () => {
      result.current.cyclePace();
    });
    expect(result.current.pace).toBe('normal');

    await act(async () => {
      result.current.cyclePace();
    });
    expect(result.current.pace).toBe('fast');

    await act(async () => {
      result.current.cyclePace();
    });
    expect(result.current.pace).toBe('slow');
  });

  it('does not write to SecureStore when profileId is undefined', async () => {
    mockSet.mockResolvedValue();

    const { result } = renderHook(() => useDictationPreferences(undefined));

    await act(() => Promise.resolve());
    await act(async () => {
      result.current.setPace('fast');
    });

    expect(mockSet).not.toHaveBeenCalled();
  });
});
