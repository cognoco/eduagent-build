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

export function cameraReducer(
  state: CameraState,
  action: CameraAction
): CameraState {
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
