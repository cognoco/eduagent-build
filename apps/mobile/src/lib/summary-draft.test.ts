import * as ExpoSecureStore from 'expo-secure-store';
import {
  writeSummaryDraft,
  readSummaryDraft,
  clearSummaryDraft,
  DRAFT_TTL_MS,
} from './summary-draft';

jest.mock('expo-secure-store');
jest.mock('./sentry', () => ({
  Sentry: {
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  },
}));

const mockGet = jest.mocked(ExpoSecureStore.getItemAsync);
const mockSet = jest.mocked(ExpoSecureStore.setItemAsync);
const mockDelete = jest.mocked(ExpoSecureStore.deleteItemAsync);

const PROFILE = 'profile-123';
const SESSION = 'session-abc';
const KEY = `summary-draft-${PROFILE}-${SESSION}`;

describe('summary-draft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockDelete.mockResolvedValue();
  });

  it('writes draft payload under a profile+session scoped key', async () => {
    await writeSummaryDraft(PROFILE, SESSION, 'hello world');

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, value] = mockSet.mock.calls[0] ?? [];
    expect(key).toBe(KEY);
    const parsed = JSON.parse(value as string);
    expect(parsed.content).toBe('hello world');
    expect(parsed.profileId).toBe(PROFILE);
    expect(parsed.sessionId).toBe(SESSION);
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('readSummaryDraft returns null when nothing stored', async () => {
    await expect(readSummaryDraft(PROFILE, SESSION)).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledWith(KEY);
  });

  it('readSummaryDraft round-trips a fresh draft', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        profileId: PROFILE,
        sessionId: SESSION,
        content: 'partial reflection',
        updatedAt: new Date().toISOString(),
      })
    );

    const draft = await readSummaryDraft(PROFILE, SESSION);
    expect(draft?.content).toBe('partial reflection');
  });

  it('readSummaryDraft rejects draft from a different profile', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        profileId: 'other-profile',
        sessionId: SESSION,
        content: 'leaked text',
        updatedAt: new Date().toISOString(),
      })
    );

    await expect(readSummaryDraft(PROFILE, SESSION)).resolves.toBeNull();
  });

  it('readSummaryDraft discards drafts older than TTL and clears them', async () => {
    const now = Date.now();
    const stale = new Date(now - DRAFT_TTL_MS - 1000).toISOString();
    mockGet.mockResolvedValue(
      JSON.stringify({
        profileId: PROFILE,
        sessionId: SESSION,
        content: 'stale text',
        updatedAt: stale,
      })
    );

    const draft = await readSummaryDraft(PROFILE, SESSION, now);
    expect(draft).toBeNull();
    await Promise.resolve();
    expect(mockDelete).toHaveBeenCalledWith(KEY);
  });

  it('clearSummaryDraft deletes under the scoped key', async () => {
    await clearSummaryDraft(PROFILE, SESSION);
    expect(mockDelete).toHaveBeenCalledWith(KEY);
  });

  it('swallows SecureStore read errors (never throws into caller)', async () => {
    mockGet.mockRejectedValue(new Error('keychain locked'));
    await expect(readSummaryDraft(PROFILE, SESSION)).resolves.toBeNull();
  });

  it('swallows SecureStore write errors (never throws into caller)', async () => {
    mockSet.mockRejectedValue(new Error('keychain locked'));
    await expect(
      writeSummaryDraft(PROFILE, SESSION, 'x')
    ).resolves.toBeUndefined();
  });
});
