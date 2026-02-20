# Homework Camera Capture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-screen camera capture component for homework mode with on-device OCR, wired into the existing session flow.

**Architecture:** `expo-camera` CameraView with custom overlay for capture, `@react-native-ml-kit/text-recognition` v2 for on-device OCR. A pure `useReducer` state machine manages UI phases (permission → viewfinder → preview → processing → result → error). A `useHomeworkOcr` hook isolates OCR logic. The camera is a hidden tab route at `(learner)/homework/camera.tsx`, navigating to the existing session screen with `router.replace`.

**Tech Stack:** Expo SDK 54, expo-camera, @react-native-ml-kit/text-recognition, expo-image-manipulator, expo-file-system, NativeWind 4.2.1, Jest 30

**Design doc:** `docs/plans/2026-02-19-homework-camera-capture-design.md`

**Working directory:** `.worktrees/homework-camera` (branch `feature/homework-camera-capture`)

---

## Task 1: Install Dependencies & Configure Expo

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`

**Step 1: Install new packages**

Run (from worktree root):
```bash
cd apps/mobile && pnpm add expo-camera @react-native-ml-kit/text-recognition expo-image-manipulator expo-file-system
```

Note: `expo-image-manipulator` and `expo-file-system` may already be available via `expo` but adding them explicitly ensures version compatibility.

**Step 2: Add expo-camera plugin to app.json**

In `apps/mobile/app.json`, add to the `plugins` array:

```json
["expo-camera", {
  "cameraPermission": "EduAgent needs camera access to photograph your homework."
}]
```

The full plugins array becomes:
```json
"plugins": [
  [
    "expo-splash-screen",
    {
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 200,
      "resizeMode": "contain",
      "backgroundColor": "#0f0f0f"
    }
  ],
  ["expo-router", { "root": "./src/app" }],
  ["expo-camera", {
    "cameraPermission": "EduAgent needs camera access to photograph your homework."
  }]
]
```

**Step 3: Verify install**

Run:
```bash
pnpm exec nx run @eduagent/mobile:test 2>&1 | tail -5
```
Expected: All existing tests still pass. New deps don't break anything.

**Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json pnpm-lock.yaml
git commit -m "feat(mobile): add expo-camera and ML Kit OCR dependencies (Story 2.5)"
```

---

## Task 2: Camera State Machine Reducer

Pure function with zero dependencies. Most testable piece — do this first.

**Files:**
- Create: `apps/mobile/src/app/(learner)/homework/camera-reducer.ts`
- Create: `apps/mobile/src/app/(learner)/homework/camera-reducer.test.ts`

**Step 1: Write the failing tests**

Create `apps/mobile/src/app/(learner)/homework/camera-reducer.test.ts`:

```typescript
import {
  cameraReducer,
  initialCameraState,
  type CameraState,
  type CameraAction,
} from './camera-reducer';

describe('cameraReducer', () => {
  it('starts in permission phase', () => {
    expect(initialCameraState.phase).toBe('permission');
    expect(initialCameraState.imageUri).toBeNull();
    expect(initialCameraState.ocrText).toBeNull();
    expect(initialCameraState.errorMessage).toBeNull();
    expect(initialCameraState.failCount).toBe(0);
  });

  it('transitions permission → viewfinder on PERMISSION_GRANTED', () => {
    const state = cameraReducer(initialCameraState, { type: 'PERMISSION_GRANTED' });
    expect(state.phase).toBe('viewfinder');
  });

  it('transitions viewfinder → preview on PHOTO_TAKEN', () => {
    const viewfinder: CameraState = { ...initialCameraState, phase: 'viewfinder' };
    const state = cameraReducer(viewfinder, {
      type: 'PHOTO_TAKEN',
      uri: 'file:///cache/homework-123.jpg',
    });
    expect(state.phase).toBe('preview');
    expect(state.imageUri).toBe('file:///cache/homework-123.jpg');
  });

  it('transitions preview → processing on CONFIRM_PHOTO', () => {
    const preview: CameraState = {
      ...initialCameraState,
      phase: 'preview',
      imageUri: 'file:///cache/homework-123.jpg',
    };
    const state = cameraReducer(preview, { type: 'CONFIRM_PHOTO' });
    expect(state.phase).toBe('processing');
    expect(state.imageUri).toBe('file:///cache/homework-123.jpg');
  });

  it('transitions processing → result on OCR_SUCCESS', () => {
    const processing: CameraState = {
      ...initialCameraState,
      phase: 'processing',
      imageUri: 'file:///cache/homework-123.jpg',
    };
    const state = cameraReducer(processing, {
      type: 'OCR_SUCCESS',
      text: 'Solve for x: 2x + 5 = 13',
    });
    expect(state.phase).toBe('result');
    expect(state.ocrText).toBe('Solve for x: 2x + 5 = 13');
  });

  it('transitions processing → error on OCR_ERROR and increments failCount', () => {
    const processing: CameraState = {
      ...initialCameraState,
      phase: 'processing',
      imageUri: 'file:///cache/homework-123.jpg',
    };
    const state = cameraReducer(processing, {
      type: 'OCR_ERROR',
      message: "Couldn't make that out",
    });
    expect(state.phase).toBe('error');
    expect(state.errorMessage).toBe("Couldn't make that out");
    expect(state.failCount).toBe(1);
  });

  it('transitions error → processing on RETRY_OCR without resetting failCount', () => {
    const error: CameraState = {
      ...initialCameraState,
      phase: 'error',
      imageUri: 'file:///cache/homework-123.jpg',
      failCount: 1,
      errorMessage: "Couldn't make that out",
    };
    const state = cameraReducer(error, { type: 'RETRY_OCR' });
    expect(state.phase).toBe('processing');
    expect(state.failCount).toBe(1); // NOT reset
    expect(state.errorMessage).toBeNull(); // Cleared for new attempt
  });

  it('accumulates failCount across retry → error cycles', () => {
    let state: CameraState = {
      ...initialCameraState,
      phase: 'processing',
      imageUri: 'file:///cache/homework-123.jpg',
      failCount: 0,
    };

    // First failure
    state = cameraReducer(state, { type: 'OCR_ERROR', message: 'fail 1' });
    expect(state.failCount).toBe(1);

    // Retry (does NOT reset failCount)
    state = cameraReducer(state, { type: 'RETRY_OCR' });
    expect(state.failCount).toBe(1);

    // Second failure — now at threshold
    state = cameraReducer(state, { type: 'OCR_ERROR', message: 'fail 2' });
    expect(state.failCount).toBe(2);
  });

  it('resets failCount on RETAKE (new photo attempt)', () => {
    const error: CameraState = {
      ...initialCameraState,
      phase: 'error',
      failCount: 2,
      imageUri: 'file:///cache/homework-123.jpg',
      errorMessage: 'failed',
    };
    const state = cameraReducer(error, { type: 'RETAKE' });
    expect(state.phase).toBe('viewfinder');
    expect(state.failCount).toBe(0);
    expect(state.imageUri).toBeNull();
    expect(state.ocrText).toBeNull();
    expect(state.errorMessage).toBeNull();
  });

  it('allows RETAKE from result state', () => {
    const result: CameraState = {
      ...initialCameraState,
      phase: 'result',
      ocrText: 'x = 5',
      imageUri: 'file:///cache/homework-123.jpg',
    };
    const state = cameraReducer(result, { type: 'RETAKE' });
    expect(state.phase).toBe('viewfinder');
    expect(state.imageUri).toBeNull();
    expect(state.ocrText).toBeNull();
  });

  it('returns same state for unknown actions', () => {
    const state = cameraReducer(initialCameraState, {
      type: 'UNKNOWN' as CameraAction['type'],
    });
    expect(state).toBe(initialCameraState);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="camera-reducer"
```
Expected: FAIL — module `./camera-reducer` not found.

**Step 3: Write the reducer**

Create `apps/mobile/src/app/(learner)/homework/camera-reducer.ts`:

```typescript
export type CameraPhase =
  | 'permission'
  | 'viewfinder'
  | 'preview'
  | 'processing'
  | 'result'
  | 'error';

export type CameraState = {
  phase: CameraPhase;
  imageUri: string | null;
  ocrText: string | null;
  errorMessage: string | null;
  failCount: number;
};

export type CameraAction =
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PHOTO_TAKEN'; uri: string }
  | { type: 'CONFIRM_PHOTO' }
  | { type: 'RETAKE' }
  | { type: 'OCR_SUCCESS'; text: string }
  | { type: 'OCR_ERROR'; message: string }
  | { type: 'RETRY_OCR' };

export const initialCameraState: CameraState = {
  phase: 'permission',
  imageUri: null,
  ocrText: null,
  errorMessage: null,
  failCount: 0,
};

export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  switch (action.type) {
    case 'PERMISSION_GRANTED':
      return { ...state, phase: 'viewfinder' };

    case 'PHOTO_TAKEN':
      return { ...state, phase: 'preview', imageUri: action.uri };

    case 'CONFIRM_PHOTO':
      return { ...state, phase: 'processing' };

    case 'RETAKE':
      return {
        ...initialCameraState,
        phase: 'viewfinder',
      };

    case 'OCR_SUCCESS':
      return { ...state, phase: 'result', ocrText: action.text };

    case 'OCR_ERROR':
      return {
        ...state,
        phase: 'error',
        errorMessage: action.message,
        failCount: state.failCount + 1,
      };

    case 'RETRY_OCR':
      return { ...state, phase: 'processing', errorMessage: null };

    default:
      return state;
  }
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="camera-reducer"
```
Expected: 10 tests PASS.

**Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/homework/camera-reducer.ts apps/mobile/src/app/\(learner\)/homework/camera-reducer.test.ts
git commit -m "feat(mobile): add camera state machine reducer with tests (Story 2.5)"
```

---

## Task 3: useHomeworkOcr Hook

Isolated OCR hook with mocked ML Kit for testing.

**Files:**
- Create: `apps/mobile/src/hooks/use-homework-ocr.ts`
- Create: `apps/mobile/src/hooks/use-homework-ocr.test.ts`

**Step 1: Write the failing tests**

Create `apps/mobile/src/hooks/use-homework-ocr.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useHomeworkOcr } from './use-homework-ocr';

// Mock ML Kit
const mockRecognize = jest.fn();
jest.mock('@react-native-ml-kit/text-recognition', () => ({
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
      { format: 'jpeg', compress: 0.8 },
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
      .mockResolvedValueOnce({ text: '' })  // First process — fail
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
      .mockResolvedValueOnce({ text: '' })               // First — fail
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
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="use-homework-ocr"
```
Expected: FAIL — module `./use-homework-ocr` not found.

**Step 3: Write the hook**

Create `apps/mobile/src/hooks/use-homework-ocr.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export type OcrStatus = 'idle' | 'processing' | 'done' | 'error';

export interface UseHomeworkOcrResult {
  text: string | null;
  status: OcrStatus;
  error: string | null;
  failCount: number;
  process: (uri: string) => Promise<void>;
  retry: () => Promise<void>;
}

async function copyToCache(tempUri: string): Promise<string> {
  const stableUri = `${FileSystem.cacheDirectory}homework-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: tempUri, to: stableUri });
  return stableUri;
}

async function resizeImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { format: SaveFormat.JPEG, compress: 0.8 },
  );
  return result.uri;
}

async function recognizeText(imageUri: string): Promise<string | null> {
  const resizedUri = await resizeImage(imageUri);
  const result = await TextRecognition.recognize(resizedUri);
  const text = result.text?.trim();
  return text || null;
}

export function useHomeworkOcr(): UseHomeworkOcrResult {
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const currentUriRef = useRef<string | null>(null);

  const runOcr = useCallback(async (uri: string, isRetry: boolean) => {
    setStatus('processing');
    setError(null);
    if (!isRetry) {
      setText(null);
      setFailCount(0);
    }

    try {
      const recognized = await recognizeText(uri);
      if (!recognized) {
        setFailCount((prev) => prev + 1);
        setError("Couldn't read any text from the image");
        setStatus('error');
        return;
      }
      setText(recognized);
      setStatus('done');
    } catch {
      setFailCount((prev) => prev + 1);
      setError('Something went wrong reading that');
      setStatus('error');
    }
  }, []);

  const process = useCallback(
    async (uri: string) => {
      const stableUri = await copyToCache(uri);
      currentUriRef.current = stableUri;
      await runOcr(stableUri, false);
    },
    [runOcr],
  );

  const retry = useCallback(async () => {
    if (!currentUriRef.current) return;
    await runOcr(currentUriRef.current, true);
  }, [runOcr]);

  return { text, status, error, failCount, process, retry };
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="use-homework-ocr"
```
Expected: 9 tests PASS.

**Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-homework-ocr.ts apps/mobile/src/hooks/use-homework-ocr.test.ts
git commit -m "feat(mobile): add useHomeworkOcr hook with ML Kit integration (Story 2.5)"
```

---

## Task 4: Camera Screen Component

The main UI component connecting the reducer and OCR hook.

**Files:**
- Create: `apps/mobile/src/app/(learner)/homework/camera.tsx`
- Create: `apps/mobile/src/app/(learner)/homework/camera.test.tsx`

**Step 1: Write the failing tests**

Create `apps/mobile/src/app/(learner)/homework/camera.test.tsx`:

```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import CameraScreen from './camera';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

// Mock expo-camera
const mockTakePictureAsync = jest.fn();
jest.mock('expo-camera', () => ({
  CameraView: jest.fn().mockImplementation(({ children, ref: _ref, ...props }) => {
    const { View } = require('react-native');
    return <View testID="camera-view" {...props}>{children}</View>;
  }),
  useCameraPermissions: jest.fn(),
}));

// Mock OCR hook
const mockProcess = jest.fn();
const mockRetry = jest.fn();
jest.mock('../../../hooks/use-homework-ocr', () => ({
  useHomeworkOcr: jest.fn().mockReturnValue({
    text: null,
    status: 'idle',
    error: null,
    failCount: 0,
    process: (...args: unknown[]) => mockProcess(...args),
    retry: (...args: unknown[]) => mockRetry(...args),
  }),
}));

// Import mocks after jest.mock declarations
const { useCameraPermissions } = require('expo-camera');
const { useHomeworkOcr } = require('../../../hooks/use-homework-ocr');

const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue(mockRouter);
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    subjectId: 'sub-123',
    subjectName: 'Mathematics',
  });
  useCameraPermissions.mockReturnValue([
    { granted: true },
    jest.fn(),
  ]);
});

describe('CameraScreen', () => {
  it('shows permission request when camera not granted', () => {
    useCameraPermissions.mockReturnValue([
      { granted: false },
      jest.fn(),
    ]);

    const { getByText } = render(<CameraScreen />);
    expect(getByText(/camera access/i)).toBeTruthy();
  });

  it('shows camera viewfinder when permission granted', () => {
    const { getByTestID } = render(<CameraScreen />);
    expect(getByTestID('camera-view')).toBeTruthy();
    expect(getByTestID('capture-button')).toBeTruthy();
  });

  it('shows close button that calls router.back()', () => {
    const { getByTestID } = render(<CameraScreen />);
    fireEvent.press(getByTestID('close-button'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('navigates to session with correct params on confirm', () => {
    // Set hook to return detected text
    (useHomeworkOcr as jest.Mock).mockReturnValue({
      text: 'Solve for x: 2x + 5 = 13',
      status: 'done',
      error: null,
      failCount: 0,
      process: mockProcess,
      retry: mockRetry,
    });

    // Render in result phase — we need to set reducer state.
    // Since the component uses useReducer internally, we test via the
    // integrated flow: the hook returning done status triggers result UI.
    const { getByTestID } = render(<CameraScreen />);

    // The component should show result phase when hook has text
    fireEvent.press(getByTestID('confirm-button'));

    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/(learner)/session',
      params: expect.objectContaining({
        mode: 'homework',
        subjectId: 'sub-123',
        subjectName: 'Mathematics',
        problemText: 'Solve for x: 2x + 5 = 13',
      }),
    });
  });

  it('shows type-instead fallback after 2 failures', () => {
    (useHomeworkOcr as jest.Mock).mockReturnValue({
      text: null,
      status: 'error',
      error: 'Failed',
      failCount: 2,
      process: mockProcess,
      retry: mockRetry,
    });

    const { getByText, getByTestID } = render(<CameraScreen />);
    expect(getByText(/type it out/i)).toBeTruthy();
    expect(getByTestID('manual-input')).toBeTruthy();
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="homework/camera.test"
```
Expected: FAIL — module `./camera` not found.

**Step 3: Write the camera screen**

Create `apps/mobile/src/app/(learner)/homework/camera.tsx`:

```tsx
import { useReducer, useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHomeworkOcr } from '../../../hooks/use-homework-ocr';
import {
  cameraReducer,
  initialCameraState,
} from './camera-reducer';

export default function CameraScreen() {
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [state, dispatch] = useReducer(cameraReducer, initialCameraState);
  const ocr = useHomeworkOcr();

  const [manualText, setManualText] = useState('');
  const [editedText, setEditedText] = useState('');

  // Sync permission state with reducer
  useEffect(() => {
    if (permission?.granted && state.phase === 'permission') {
      dispatch({ type: 'PERMISSION_GRANTED' });
    }
  }, [permission?.granted, state.phase]);

  // Sync OCR results with reducer
  useEffect(() => {
    if (ocr.status === 'done' && ocr.text) {
      dispatch({ type: 'OCR_SUCCESS', text: ocr.text });
      setEditedText(ocr.text);
    } else if (ocr.status === 'error' && ocr.error) {
      dispatch({ type: 'OCR_ERROR', message: ocr.error });
    }
  }, [ocr.status, ocr.text, ocr.error]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync();
    if (photo?.uri) {
      dispatch({ type: 'PHOTO_TAKEN', uri: photo.uri });
    }
  }, []);

  const handleConfirmPhoto = useCallback(async () => {
    dispatch({ type: 'CONFIRM_PHOTO' });
    if (state.imageUri) {
      await ocr.process(state.imageUri);
    }
  }, [state.imageUri, ocr]);

  const handleRetake = useCallback(() => {
    dispatch({ type: 'RETAKE' });
  }, []);

  const handleRetryOcr = useCallback(async () => {
    dispatch({ type: 'RETRY_OCR' });
    await ocr.retry();
  }, [ocr]);

  const handleConfirmText = useCallback(
    (text: string) => {
      router.replace({
        pathname: '/(learner)/session',
        params: {
          mode: 'homework',
          subjectId: subjectId ?? '',
          subjectName: subjectName ?? '',
          problemText: text,
          imageUri: state.imageUri ?? '',
        },
      });
    },
    [router, subjectId, subjectName, state.imageUri],
  );

  // Permission request screen
  if (!permission?.granted) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-h2 font-bold text-text-primary text-center mb-3">
          Camera access needed
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          EduAgent needs camera access to photograph your homework so we can help you work through it.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="bg-primary rounded-button py-3 px-8"
          testID="grant-permission-button"
          accessibilityLabel="Grant camera permission"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Allow camera
          </Text>
        </Pressable>
      </View>
    );
  }

  // Viewfinder
  if (state.phase === 'viewfinder') {
    return (
      <View className="flex-1 bg-black">
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          testID="camera-view"
        >
          {/* Capture guide overlay */}
          <View className="flex-1 items-center justify-center">
            <View
              className="w-[85%] aspect-[3/4] border-2 border-dashed border-primary/60 rounded-card items-center justify-center"
              testID="capture-guide"
            >
              <Text className="text-white/70 text-body-sm text-center">
                Center your homework
              </Text>
            </View>
          </View>

          {/* Bottom controls */}
          <View
            className="absolute bottom-0 left-0 right-0 flex-row items-center justify-between px-8"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Pressable
              onPress={() => router.back()}
              className="w-12 h-12 items-center justify-center"
              testID="close-button"
              accessibilityLabel="Close camera"
              accessibilityRole="button"
            >
              <Text className="text-white text-h2">✕</Text>
            </Pressable>

            <Pressable
              onPress={handleCapture}
              className="w-16 h-16 rounded-full bg-primary items-center justify-center border-4 border-white/30"
              testID="capture-button"
              accessibilityLabel="Take photo"
              accessibilityRole="button"
            >
              <View className="w-12 h-12 rounded-full bg-primary" />
            </Pressable>

            {/* Spacer to balance layout */}
            <View className="w-12 h-12" />
          </View>
        </CameraView>
      </View>
    );
  }

  // Preview
  if (state.phase === 'preview') {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <View className="bg-surface-elevated rounded-card w-full aspect-[3/4] items-center justify-center mb-6">
          <Text className="text-text-secondary text-body-sm">
            Photo captured
          </Text>
        </View>
        <View className="flex-row gap-4 w-full">
          <Pressable
            onPress={handleRetake}
            className="flex-1 bg-surface rounded-button py-3 items-center"
            testID="retake-button"
            accessibilityLabel="Retake photo"
            accessibilityRole="button"
          >
            <Text className="text-text-primary text-body font-medium">Retake</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirmPhoto}
            className="flex-1 bg-primary rounded-button py-3 items-center"
            testID="use-photo-button"
            accessibilityLabel="Use this photo"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">Use this</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Processing
  if (state.phase === 'processing') {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <View className="bg-surface-elevated/50 rounded-card w-full aspect-[3/4] items-center justify-center mb-6">
          <ActivityIndicator size="large" />
        </View>
        <View className="w-full gap-2 mb-4">
          <View className="h-4 bg-surface-elevated rounded-full w-full" />
          <View className="h-4 bg-surface-elevated rounded-full w-4/5" />
          <View className="h-4 bg-surface-elevated rounded-full w-3/5" />
        </View>
        <Text className="text-text-secondary text-body">
          Reading your {subjectName ?? 'homework'}...
        </Text>
      </View>
    );
  }

  // Result — OCR text detected
  if (state.phase === 'result') {
    return (
      <View
        className="flex-1 bg-background px-6"
        style={{ paddingTop: insets.top + 16 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="mb-6"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-medium">← Back</Text>
        </Pressable>

        <Text className="text-text-secondary text-body mb-3">
          Here's what I see:
        </Text>
        <TextInput
          value={editedText}
          onChangeText={setEditedText}
          multiline
          className="bg-surface rounded-card p-4 text-text-primary text-body min-h-[120px]"
          textAlignVertical="top"
          testID="ocr-result-input"
          accessibilityLabel="Detected text, tap to edit"
        />

        <View className="flex-row gap-4 mt-6">
          <Pressable
            onPress={handleRetake}
            className="flex-1 bg-surface rounded-button py-3 items-center"
            testID="retake-button"
            accessibilityLabel="Retake photo"
            accessibilityRole="button"
          >
            <Text className="text-text-primary text-body font-medium">Retake</Text>
          </Pressable>
          <Pressable
            onPress={() => handleConfirmText(editedText)}
            className="flex-1 bg-primary rounded-button py-3 items-center"
            testID="confirm-button"
            accessibilityLabel="Continue with this text"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">Let's go</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Error state
  if (state.phase === 'error') {
    const showTypeInstead = ocr.failCount >= 2;

    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {showTypeInstead
            ? "I'm having trouble reading that"
            : "Couldn't make that out"}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {showTypeInstead
            ? 'Want to type it out instead?'
            : 'Same photo — try again, or retake with better lighting?'}
        </Text>

        {showTypeInstead && (
          <TextInput
            value={manualText}
            onChangeText={setManualText}
            multiline
            placeholder="Type your problem here..."
            placeholderTextColor="#999"
            className="bg-surface rounded-card p-4 text-text-primary text-body min-h-[120px] w-full mb-4"
            textAlignVertical="top"
            testID="manual-input"
            accessibilityLabel="Type your homework problem"
          />
        )}

        <View className="w-full gap-3">
          {!showTypeInstead && (
            <Pressable
              onPress={handleRetryOcr}
              className="bg-primary rounded-button py-3 items-center w-full"
              testID="retry-button"
              accessibilityLabel="Try reading again"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Try again
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleRetake}
            className="bg-surface rounded-button py-3 items-center w-full"
            testID="retake-button"
            accessibilityLabel="Take a new photo"
            accessibilityRole="button"
          >
            <Text className="text-text-primary text-body font-medium">
              {showTypeInstead ? 'Try camera again' : 'Retake photo'}
            </Text>
          </Pressable>

          {showTypeInstead && manualText.trim() && (
            <Pressable
              onPress={() => handleConfirmText(manualText.trim())}
              className="bg-primary rounded-button py-3 items-center w-full"
              testID="confirm-manual-button"
              accessibilityLabel="Continue with typed text"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Continue
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // Fallback — should not reach here
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="homework/camera.test"
```
Expected: 5 tests PASS. Note: the integrated test for confirm navigation depends on the reducer+hook wiring. If tests need adjustment for the useEffect sync pattern, adapt mock return values to trigger the correct reducer phase.

**Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/homework/camera.tsx apps/mobile/src/app/\(learner\)/homework/camera.test.tsx
git commit -m "feat(mobile): add HomeworkCameraCapture screen (Story 2.5)"
```

---

## Task 5: Layout Registration

Wire the homework route into the tab navigator as a hidden tab (no tab bar visible).

**Files:**
- Modify: `apps/mobile/src/app/(learner)/_layout.tsx:86-99`

**Step 1: Add homework tab entry**

In `apps/mobile/src/app/(learner)/_layout.tsx`, add before the closing `</Tabs>` tag (after the `subscription` screen entry around line 98):

```tsx
<Tabs.Screen
  name="homework"
  options={{
    href: null,
    tabBarStyle: { display: 'none' },
  }}
/>
```

**Step 2: Run tests to verify no breakage**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="(learner)"
```
Expected: All existing learner tests pass. No layout test exists for `_layout.tsx` (it's tested indirectly through screen tests).

**Step 3: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/_layout.tsx
git commit -m "feat(mobile): register homework route as hidden tab (Story 2.5)"
```

---

## Task 6: Home Screen Homework Entry

Add per-subject homework buttons to the home screen subject list.

**Files:**
- Modify: `apps/mobile/src/app/(learner)/home.tsx:186-210`
- Modify: `apps/mobile/src/app/(learner)/home.test.tsx` (if exists, add test)

**Step 1: Check if home.test.tsx exists**

Run:
```bash
ls apps/mobile/src/app/\(learner\)/home.test.tsx 2>/dev/null
```

If it exists, add a test for the homework button. If not, create one.

**Step 2: Add homework button to subject cards**

In `apps/mobile/src/app/(learner)/home.tsx`, replace the subject card `<Pressable>` (lines ~189-209) with a version that includes a homework action:

Replace the `subjects.map` block with:

```tsx
{subjects.map(
  (subject: { id: string; name: string; status: string }) => (
    <View
      key={subject.id}
      className="flex-row items-center bg-surface rounded-card px-4 py-3 mb-2"
    >
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(learner)/onboarding/curriculum-review',
            params: { subjectId: subject.id },
          } as never)
        }
        className="flex-1 flex-row items-center justify-between"
        accessibilityLabel={`Open ${subject.name}`}
        accessibilityRole="button"
        testID={`home-subject-${subject.id}`}
      >
        <Text className="text-body font-medium text-text-primary">
          {subject.name}
        </Text>
        <RetentionSignal
          status={subjectRetention.get(subject.id) ?? 'strong'}
        />
      </Pressable>
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(learner)/homework/camera',
            params: {
              subjectId: subject.id,
              subjectName: subject.name,
            },
          } as never)
        }
        className="ml-3 bg-primary/10 rounded-button w-10 h-10 items-center justify-center"
        accessibilityLabel={`Homework help for ${subject.name}`}
        accessibilityRole="button"
        testID={`homework-button-${subject.id}`}
      >
        <Text className="text-primary text-body">HW</Text>
      </Pressable>
    </View>
  )
)}
```

**Step 3: Run tests**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="home"
```
Expected: All home screen tests pass (the new button doesn't break existing subject card tests since we preserved the same `testID`s).

**Step 4: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/home.tsx
git commit -m "feat(mobile): add per-subject homework button on home screen (Story 2.5)"
```

---

## Task 7: Session Screen Integration

Wire `problemText` param into the session screen so camera-captured text auto-sends as the first user message.

**Files:**
- Modify: `apps/mobile/src/app/(learner)/session/index.tsx:32-54`

**Step 1: Add problemText to params**

In `apps/mobile/src/app/(learner)/session/index.tsx`, add `problemText` and `imageUri` to the `useLocalSearchParams` destructuring (line ~33):

```typescript
const {
  mode,
  subjectId,
  subjectName,
  sessionId: routeSessionId,
  topicId,
  problemText,
  imageUri: _imageUri,   // Available for future use (photo display in session)
} = useLocalSearchParams<{
  mode?: string;
  subjectId?: string;
  subjectName?: string;
  sessionId?: string;
  topicId?: string;
  problemText?: string;
  imageUri?: string;
}>();
```

**Step 2: Auto-send problemText as first user message**

After the session starts, if `problemText` exists, automatically send it as the first user message. Add a `useEffect` after the existing `ensureSession` definition (around line ~96):

```typescript
const hasAutoSentRef = useRef(false);

useEffect(() => {
  if (problemText && !hasAutoSentRef.current) {
    hasAutoSentRef.current = true;
    // Short delay so the opening AI message renders first
    const timer = setTimeout(() => {
      handleSend(problemText);
    }, 500);
    return () => clearTimeout(timer);
  }
}, [problemText, handleSend]);
```

**Step 3: Update opening message for homework mode with problemText**

The existing `OPENING_MESSAGES.homework` should be used when there's no `problemText` (e.g., text-only entry). When `problemText` exists, the AI greeting is shorter since the problem follows immediately:

Replace the `openingContent` derivation:

```typescript
const openingContent = problemText
  ? "Got it. Let's work through this together."
  : (OPENING_MESSAGES[effectiveMode] ?? OPENING_MESSAGES.freeform);
```

**Step 4: Run tests**

Run:
```bash
pnpm exec nx test @eduagent/mobile -- --testPathPattern="session"
```
Expected: Existing session tests pass. The `problemText` param is optional, so existing tests that don't provide it are unaffected.

**Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/session/index.tsx
git commit -m "feat(mobile): wire problemText auto-send in homework session (Story 2.5)"
```

---

## Task 8: Integration Smoke Test

Run full test suite to verify everything works together.

**Step 1: Run all mobile tests**

Run:
```bash
pnpm exec nx test @eduagent/mobile
```
Expected: All tests pass (existing 202 + new ~24 tests).

**Step 2: Run full workspace tests**

Run:
```bash
pnpm exec nx run-many -t test
```
Expected: All 6 projects pass.

**Step 3: Commit any remaining changes**

If any lint/format changes were auto-fixed:
```bash
git add -A && git commit -m "chore: lint/format cleanup for homework camera feature"
```

---

## Summary

| Task | Files | Tests | Commits |
|------|-------|-------|---------|
| 1. Install deps + config | package.json, app.json | 0 (verify existing pass) | 1 |
| 2. Camera reducer | camera-reducer.ts | 10 | 1 |
| 3. useHomeworkOcr hook | use-homework-ocr.ts | 9 | 1 |
| 4. Camera screen | camera.tsx | 5 | 1 |
| 5. Layout registration | _layout.tsx | 0 (verify existing pass) | 1 |
| 6. Home screen entry | home.tsx | 0-1 | 1 |
| 7. Session integration | session/index.tsx | 0 (verify existing pass) | 1 |
| 8. Integration smoke | — | Full suite | 0-1 |
| **Total** | **8 files** | **~24 new tests** | **7-8 commits** |
