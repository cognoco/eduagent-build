import { renderHook, act } from '@testing-library/react-native';
import * as SecureStore from '../lib/secure-storage';
import { useDictationPreferences } from './use-dictation-preferences';

jest.mock(
  '../lib/secure-storage' /* gc1-allow: native-boundary; expo-secure-store is unavailable in Jest, while sanitizeSecureStoreKey stays real */,
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);
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
    mockGet.mockImplementation(async (key: string) => {
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

  // [BUG-530] Break test: stale state must not be visible on profile switch
  it('resets pace and punctuation to defaults immediately on profileId change before async read resolves', async () => {
    // Profile A has pace=fast stored
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'dictation-pace-profile-A') return 'fast';
      if (key === 'dictation-punctuation-profile-A') return 'false';
      // Profile B has nothing stored — reads resolve to null (default)
      return null;
    });

    const { result, rerender } = renderHook(
      ({ profileId }: { profileId: string }) =>
        useDictationPreferences(profileId),
      { initialProps: { profileId: 'profile-A' } },
    );

    // Let profile A's reads complete
    await act(() => Promise.resolve());
    expect(result.current.pace).toBe('fast');
    expect(result.current.punctuationReadAloud).toBe(false);

    // Switch to profile B; reads are async, but state must reset synchronously
    rerender({ profileId: 'profile-B' });

    // Before any microtasks — defaults must be visible immediately
    expect(result.current.pace).toBe('slow');
    expect(result.current.punctuationReadAloud).toBe(true);

    // After profile B's reads complete — still defaults (nothing stored for B)
    await act(() => Promise.resolve());
    expect(result.current.pace).toBe('slow');
    expect(result.current.punctuationReadAloud).toBe(true);
  });

  // [BUG-530] Race guard: an older in-flight read must not overwrite the reset
  it('ignores results from reads cancelled by a profileId change', async () => {
    let resolveProfileA!: (value: string | null) => void;
    const profileAPromise = new Promise<string | null>((res) => {
      resolveProfileA = res;
    });

    mockGet.mockImplementation(async (key: string) => {
      if (key === 'dictation-pace-profile-A') return profileAPromise;
      return null;
    });

    const { result, rerender } = renderHook(
      ({ profileId }: { profileId: string }) =>
        useDictationPreferences(profileId),
      { initialProps: { profileId: 'profile-A' } },
    );

    // Switch to profile B before profile A's read resolves
    rerender({ profileId: 'profile-B' });

    // Reset is visible
    expect(result.current.pace).toBe('slow');

    // Now resolve profile A's stale read with 'fast'
    await act(async () => {
      resolveProfileA('fast');
      await Promise.resolve();
    });

    // Stale result must be ignored — pace stays at default 'slow'
    expect(result.current.pace).toBe('slow');
  });
});
