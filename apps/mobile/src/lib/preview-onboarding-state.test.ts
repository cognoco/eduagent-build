import * as SecureStore from './secure-storage';
import {
  getPreviewState,
  setPreviewState,
  clearPreviewState,
  PREVIEW_INTENT_KEY,
  PREVIEW_TTL_MS,
  type PreviewOnboardingStateV0,
} from './preview-onboarding-state';

describe('preview-onboarding-state', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(
      () => undefined,
    );
    clearPreviewState();
  });

  const baseState: PreviewOnboardingStateV0 = {
    intent: 'self',
    path: 'learner_value_prop',
    topicText: 'algebra basics',
    createdAt: new Date().toISOString(),
  };

  it('returns null when no state set', async () => {
    expect(await getPreviewState()).toBeNull();
  });

  it('writes in-memory and to SecureStore', async () => {
    await setPreviewState(baseState);
    expect(await getPreviewState()).toEqual(baseState);
    const raw = await SecureStore.getItemAsync(PREVIEW_INTENT_KEY);
    expect(raw).not.toBeNull();
  });

  it('hydrates from SecureStore when memory empty (cold-start)', async () => {
    await setPreviewState(baseState);
    clearPreviewState(); // simulate process restart: memory wiped, key intact

    // Re-write the key directly to simulate the cold-start path
    await SecureStore.setItemAsync(
      PREVIEW_INTENT_KEY,
      JSON.stringify({ ...baseState, savedAt: Date.now() }),
    );

    const result = await getPreviewState();
    expect(result?.intent).toBe('self');
  });

  it('treats expired key as absent', async () => {
    const stale = {
      ...baseState,
      savedAt: Date.now() - (PREVIEW_TTL_MS + 1000),
    };
    await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(stale));
    clearPreviewState();

    expect(await getPreviewState()).toBeNull();
  });

  it('treats warm in-memory state as expired after the TTL', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    await setPreviewState(baseState);

    jest.setSystemTime(Date.now() + PREVIEW_TTL_MS + 1000);

    await expect(getPreviewState()).resolves.toBeNull();
    expect(await SecureStore.getItemAsync(PREVIEW_INTENT_KEY)).toBeNull();
  });

  it('clearPreviewState wipes memory AND SecureStore', async () => {
    await setPreviewState(baseState);
    await clearPreviewState();

    expect(await getPreviewState()).toBeNull();
    expect(await SecureStore.getItemAsync(PREVIEW_INTENT_KEY)).toBeNull();
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});
