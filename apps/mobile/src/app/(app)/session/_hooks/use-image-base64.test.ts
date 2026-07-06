import { renderHook, waitFor, act } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system';

import { useImageBase64 } from './use-image-base64';

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
}));

const mockReadAsStringAsync = jest.mocked(FileSystem.readAsStringAsync);

describe('useImageBase64', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  it('reads an allowed image URI and resolves the supplied MIME type', async () => {
    mockReadAsStringAsync.mockResolvedValueOnce('base64-image');

    const { result } = renderHook(() =>
      useImageBase64('file:///cache/homework-photo.jpg', 'image/webp'),
    );

    await waitFor(() => {
      expect(result.current.imageAttachmentStatus).toBe('ready');
    });

    expect(mockReadAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/homework-photo.jpg',
      { encoding: 'base64' },
    );
    expect(result.current.imageBase64Ref.current).toBe('base64-image');
    expect(result.current.imageMimeTypeRef.current).toBe('image/webp');
  });

  it('rejects image URIs outside the cache/document allowlist without reading', async () => {
    const { result } = renderHook(() =>
      useImageBase64('file:///etc/hosts', 'image/jpeg'),
    );

    await waitFor(() => {
      expect(result.current.imageAttachmentStatus).toBe('failed');
    });

    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    expect(result.current.imageBase64Ref.current).toBeNull();
    expect(result.current.imageMimeTypeRef.current).toBeNull();
  });

  it('marks the attachment failed and clears refs when the file read rejects', async () => {
    mockReadAsStringAsync.mockRejectedValueOnce(new Error('read failed'));

    const { result } = renderHook(() =>
      useImageBase64('file:///cache/homework-photo.png', undefined),
    );

    await waitFor(() => {
      expect(result.current.imageAttachmentStatus).toBe('failed');
    });

    expect(result.current.imageBase64Ref.current).toBeNull();
    expect(result.current.imageMimeTypeRef.current).toBeNull();
  });

  it('times out after 2500ms without keeping stale refs from a previous image', async () => {
    jest.useFakeTimers();
    mockReadAsStringAsync.mockResolvedValueOnce('first-base64');

    let resolveSecondRead: (value: string) => void = () => undefined;
    mockReadAsStringAsync.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSecondRead = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ uri }: { uri: string }) => useImageBase64(uri, 'image/jpeg'),
      { initialProps: { uri: 'file:///cache/first.jpg' } },
    );

    await waitFor(() => {
      expect(result.current.imageAttachmentStatus).toBe('ready');
    });
    expect(result.current.imageBase64Ref.current).toBe('first-base64');

    rerender({ uri: 'file:///cache/second.jpg' });

    expect(result.current.imageAttachmentStatus).toBe('loading');
    expect(result.current.imageBase64Ref.current).toBeNull();
    expect(result.current.imageMimeTypeRef.current).toBeNull();

    act(() => {
      jest.advanceTimersByTime(2_499);
    });
    expect(result.current.imageAttachmentStatus).toBe('loading');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.imageAttachmentStatus).toBe('timeout');
    expect(result.current.imageBase64Ref.current).toBeNull();
    expect(result.current.imageMimeTypeRef.current).toBeNull();

    await act(async () => {
      resolveSecondRead('second-base64-too-late');
    });

    expect(result.current.imageAttachmentStatus).toBe('timeout');
    expect(result.current.imageBase64Ref.current).toBeNull();
    expect(result.current.imageMimeTypeRef.current).toBeNull();
  });
});
