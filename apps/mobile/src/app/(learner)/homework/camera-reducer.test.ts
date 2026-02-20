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
    const state = cameraReducer(initialCameraState, {
      type: 'PERMISSION_GRANTED',
    });
    expect(state.phase).toBe('viewfinder');
  });

  it('transitions viewfinder → preview on PHOTO_TAKEN', () => {
    const viewfinder: CameraState = {
      ...initialCameraState,
      phase: 'viewfinder',
    };
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

  it('allows RETAKE from preview state', () => {
    const preview: CameraState = {
      ...initialCameraState,
      phase: 'preview',
      imageUri: 'file:///cache/homework-123.jpg',
    };
    const state = cameraReducer(preview, { type: 'RETAKE' });
    expect(state.phase).toBe('viewfinder');
    expect(state.imageUri).toBeNull();
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
