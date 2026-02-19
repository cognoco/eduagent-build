import { renderHook, act } from '@testing-library/react-native';
import { useHomeworkOcr } from './use-homework-ocr';

// Mock ML Kit
const mockRecognize = jest.fn();
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: {
    recognize: (...args: unknown[]) => mockRecognize(...args),
  },
}));

// Mock expo-image-manipulator
const mockManipulateAsync = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/resized.jpg' });
});

describe('useHomeworkOcr', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useHomeworkOcr());
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.failCount).toBe(0);
  });

  it('processes image and returns OCR text on success', async () => {
    mockRecognize.mockResolvedValue({ text: 'Solve for x: 2x + 5 = 13' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Solve for x: 2x + 5 = 13');
    expect(result.current.failCount).toBe(0);
  });

  it('resizes image to 1024px width before OCR', async () => {
    mockRecognize.mockResolvedValue({ text: 'some text' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockManipulateAsync).toHaveBeenCalledWith(
      expect.any(String),
      [{ resize: { width: 1024 } }],
      { format: 'jpeg', compress: 0.8 }
    );
  });

  it('treats empty OCR result as error', async () => {
    mockRecognize.mockResolvedValue({ text: '' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe("Couldn't read any text from the image");
    expect(result.current.failCount).toBe(1);
  });

  it('treats whitespace-only OCR result as error', async () => {
    mockRecognize.mockResolvedValue({ text: '   \n  ' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.failCount).toBe(1);
  });

  it('handles ML Kit exception as error', async () => {
    mockRecognize.mockRejectedValue(new Error('ML Kit crash'));

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Something went wrong reading that');
    expect(result.current.failCount).toBe(1);
  });

  it('retry() does NOT reset failCount', async () => {
    mockRecognize
      .mockResolvedValueOnce({ text: '' }) // First process — fail
      .mockResolvedValueOnce({ text: '' }); // Retry — fail again

    const { result } = renderHook(() => useHomeworkOcr());

    // First attempt
    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });
    expect(result.current.failCount).toBe(1);

    // Retry same image — failCount must NOT reset
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.failCount).toBe(2);
  });

  it('process(newUri) DOES reset failCount', async () => {
    mockRecognize
      .mockResolvedValueOnce({ text: '' }) // First — fail
      .mockResolvedValueOnce({ text: 'new text found' }); // Second — success

    const { result } = renderHook(() => useHomeworkOcr());

    // Fail first image
    await act(async () => {
      await result.current.process('file:///tmp/photo1.jpg');
    });
    expect(result.current.failCount).toBe(1);

    // Process new image — failCount resets
    await act(async () => {
      await result.current.process('file:///tmp/photo2.jpg');
    });
    expect(result.current.failCount).toBe(0);
    expect(result.current.text).toBe('new text found');
  });

  it('retry() is a no-op when no image has been processed', async () => {
    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe('idle');
    expect(mockRecognize).not.toHaveBeenCalled();
  });
});
