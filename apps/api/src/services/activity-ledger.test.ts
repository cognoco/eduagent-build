const mockCaptureException = jest.fn();
jest.mock('./sentry' /* gc1-allow: Sentry is an external boundary */, () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

const mockLoggerError = jest.fn();
jest.mock('./logger' /* gc1-allow: logger observability boundary */, () => {
  const actual = jest.requireActual('./logger') as typeof import('./logger');
  return {
    ...actual,
    createLogger: () => ({
      error: (...args: unknown[]) => mockLoggerError(...args),
    }),
  };
});

import { mentorActivityLedger } from '@eduagent/database';

import { markMomentSurfaced, writeActivityMoment } from './activity-ledger';

function insertDb(values: jest.Mock) {
  return {
    insert: jest.fn((table) => {
      expect(table).toBe(mentorActivityLedger);
      return { values };
    }),
  };
}

describe('activity ledger service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes ledger moments as self-visible only', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const db = insertDb(values);

    await writeActivityMoment({
      db: db as never,
      profileId: 'profile-1',
      actorJob: 'auto-file-session',
      kind: 'session_filed',
      templateKey: 'ledger.session_filed.default',
    });

    expect(values).toHaveBeenCalledWith({
      profileId: 'profile-1',
      actorJob: 'auto-file-session',
      kind: 'session_filed',
      templateKey: 'ledger.session_filed.default',
      params: {},
      visibility: 'self',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('captures insert failures but never throws', async () => {
    const boom = new Error('db down');
    const values = jest.fn().mockRejectedValue(boom);

    await expect(
      writeActivityMoment({
        db: insertDb(values) as never,
        profileId: 'profile-1',
        actorJob: 'auto-file-session',
        kind: 'session_filed',
        templateKey: 'ledger.session_filed.default',
        params: { topicTitle: 'Gravity' },
      }),
    ).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][0]).toBe(boom);
    expect(mockCaptureException.mock.calls[0][1].extra).toMatchObject({
      surface: 'activity-ledger.write',
      kind: 'session_filed',
      actorJob: 'auto-file-session',
      profileId: 'profile-1',
    });
  });

  it('does not issue an update when there are no surfaced ids', async () => {
    const db = { update: jest.fn() };

    await markMomentSurfaced(db as never, 'profile-1', []);

    expect(db.update).not.toHaveBeenCalled();
  });
});
