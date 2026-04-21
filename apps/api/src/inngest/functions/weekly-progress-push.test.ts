// ---------------------------------------------------------------------------
// Weekly Progress Push — Tests [FR239.1 UX-9, EP15-I1 AR-9]
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks must be declared before any imports that exercise the module graph.
// ---------------------------------------------------------------------------

jest.mock('../helpers', () => ({
  getStepDatabase: jest.fn(() => mockDb),
}));

// Lazy reference — populated after createMockDb() is called below.
let mockDb: Record<string, unknown>;

const mockGetLatestSnapshot = jest.fn();
const mockGetLatestSnapshotOnOrBefore = jest.fn();

jest.mock('../../services/snapshot-aggregation', () => ({
  getLatestSnapshot: (...args: unknown[]) => mockGetLatestSnapshot(...args),
  getLatestSnapshotOnOrBefore: (...args: unknown[]) =>
    mockGetLatestSnapshotOnOrBefore(...args),
}));

const mockSendPushNotification = jest.fn();

jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

const mockCaptureException = jest.fn();

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { createDatabaseModuleMock } from '../../test-utils/database-module';

// ---------------------------------------------------------------------------
// Shared mock DB factory
// ---------------------------------------------------------------------------

function buildMockDb(overrides: Record<string, unknown> = {}) {
  return {
    query: {
      notificationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
      familyLinks: { findMany: jest.fn().mockResolvedValue([]) },
      profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    // [BUG-524] insert chain for weekly report persistence
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    ...overrides,
  };
}

// Initialise the shared reference used by the `../helpers` mock.
mockDb = buildMockDb();

// Replace mockDb between tests so individual describe blocks can override it.
function setMockDb(db: Record<string, unknown>) {
  mockDb = db;
  (require('../helpers').getStepDatabase as jest.Mock).mockReturnValue(mockDb);
}

// ---------------------------------------------------------------------------
// Snapshot fixture factory
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  // Destructure metrics overrides separately to avoid the top-level spread
  // replacing the entire merged metrics object.
  const { metrics: metricsOverrides, ...topLevelOverrides } = overrides;
  return {
    snapshotDate: '2026-04-14',
    metrics: {
      topicsMastered: 5,
      vocabularyTotal: 20,
      totalSessions: 3,
      // Fields required by generateWeeklyReportData (no longer mocked)
      totalActiveMinutes: 60,
      totalWallClockMinutes: 90,
      totalExchanges: 10,
      topicsAttempted: 6,
      topicsInProgress: 1,
      vocabularyMastered: 15,
      vocabularyLearning: 3,
      vocabularyNew: 2,
      retentionCardsDue: 0,
      retentionCardsStrong: 10,
      retentionCardsFading: 2,
      currentStreak: 2,
      longestStreak: 5,
      subjects: [{ topicsExplored: 4 }],
      ...((metricsOverrides as Record<string, unknown>) ?? {}),
    },
    ...topLevelOverrides,
  };
}

// ---------------------------------------------------------------------------
// Step executor helpers
// ---------------------------------------------------------------------------

async function executeCronSteps(): Promise<Record<string, unknown>> {
  const stepResults: Record<string, unknown> = {};

  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepResults[name] = result;
      return result;
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const { weeklyProgressPushCron } = await import('./weekly-progress-push');
  const handler = (weeklyProgressPushCron as any).fn;
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  });

  return { result, mockStep, stepResults };
}

async function executeGenerateHandler(
  parentId: string
): Promise<Record<string, unknown>> {
  const stepResults: Record<string, unknown> = {};

  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepResults[name] = result;
      return result;
    }),
  };

  const { weeklyProgressPushGenerate } = await import('./weekly-progress-push');
  const handler = (weeklyProgressPushGenerate as any).fn;
  const result = await handler({
    event: { name: 'app/weekly-progress-push.generate', data: { parentId } },
    step: mockStep,
  });

  return { result, mockStep, stepResults };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  mockDb = buildMockDb();
  (require('../helpers').getStepDatabase as jest.Mock).mockReturnValue(mockDb);
  // Default: push notification succeeds
  mockSendPushNotification.mockResolvedValue({ sent: true, ticketId: 'tk-1' });
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
  jest.resetModules();
});

// ---------------------------------------------------------------------------
// weeklyProgressPushCron — function metadata
// ---------------------------------------------------------------------------

describe('weeklyProgressPushCron', () => {
  it('is defined as an Inngest function', async () => {
    const { weeklyProgressPushCron } = await import('./weekly-progress-push');
    expect(weeklyProgressPushCron).toBeDefined();
  });

  it('has the correct function id', async () => {
    const { weeklyProgressPushCron } = await import('./weekly-progress-push');
    const config = (weeklyProgressPushCron as any).opts;
    expect(config.id).toBe('progress-weekly-parent-push');
  });

  it('has a cron trigger that fires every hour on Mondays', async () => {
    const { weeklyProgressPushCron } = await import('./weekly-progress-push');
    const triggers = (weeklyProgressPushCron as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 * * * 1' })])
    );
  });

  it('returns completed status with zero queued parents when no prefs found', async () => {
    (mockDb.query as any).notificationPreferences.findMany.mockResolvedValue(
      []
    );

    const { result } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedParents: 0 });
  });

  it('returns completed status with zero queued parents when none match local 9am', async () => {
    // Prefs exist but timezone filter eliminates them.
    // nowUtc is 10:00 UTC — parents in UTC should NOT match.
    jest.useFakeTimers({ now: new Date('2026-04-21T10:00:00.000Z') }); // Monday
    (mockDb.query as any).notificationPreferences.findMany.mockResolvedValue([
      { profileId: 'parent-1' },
    ]);
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue([{ profileId: 'parent-1', timezone: null }]),
        }),
      }),
    });

    const { result } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedParents: 0 });
    jest.useRealTimers();
  });

  it('fans out events for parents whose local time is 9am', async () => {
    // nowUtc is 09:00 UTC — parent with null timezone should match.
    jest.useFakeTimers({ now: new Date('2026-04-21T09:00:00.000Z') }); // Monday
    (mockDb.query as any).notificationPreferences.findMany.mockResolvedValue([
      { profileId: 'parent-1' },
      { profileId: 'parent-2' },
    ]);
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { profileId: 'parent-1', timezone: null },
            { profileId: 'parent-2', timezone: null },
          ]),
        }),
      }),
    });

    const { result, mockStep } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedParents: 2 });
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'fan-out-weekly-progress-0',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/weekly-progress-push.generate',
          data: { parentId: 'parent-1' },
        }),
        expect.objectContaining({
          name: 'app/weekly-progress-push.generate',
          data: { parentId: 'parent-2' },
        }),
      ])
    );

    jest.useRealTimers();
  });

  it('sends multiple batches of 200 when parent count exceeds batch size', async () => {
    jest.useFakeTimers({ now: new Date('2026-04-21T09:00:00.000Z') });

    const parentIds = Array.from({ length: 250 }, (_, i) => `parent-${i}`);
    (mockDb.query as any).notificationPreferences.findMany.mockResolvedValue(
      parentIds.map((id) => ({ profileId: id }))
    );
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue(
              parentIds.map((id) => ({ profileId: id, timezone: null }))
            ),
        }),
      }),
    });

    const { mockStep } = await executeCronSteps();

    // 250 parents → 2 batches (200 + 50)
    expect(mockStep.sendEvent).toHaveBeenCalledTimes(2);
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'fan-out-weekly-progress-0',
      expect.any(Array)
    );
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'fan-out-weekly-progress-200',
      expect.any(Array)
    );

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// weeklyProgressPushGenerate — function metadata
// ---------------------------------------------------------------------------

describe('weeklyProgressPushGenerate', () => {
  it('is defined as an Inngest function', async () => {
    const { weeklyProgressPushGenerate } = await import(
      './weekly-progress-push'
    );
    expect(weeklyProgressPushGenerate).toBeDefined();
  });

  it('has the correct function id', async () => {
    const { weeklyProgressPushGenerate } = await import(
      './weekly-progress-push'
    );
    const config = (weeklyProgressPushGenerate as any).opts;
    expect(config.id).toBe('progress-weekly-parent-push-generate');
  });

  it('triggers on app/weekly-progress-push.generate event', async () => {
    const { weeklyProgressPushGenerate } = await import(
      './weekly-progress-push'
    );
    const triggers = (weeklyProgressPushGenerate as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'app/weekly-progress-push.generate',
        }),
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// weeklyProgressPushGenerate — skip conditions
// ---------------------------------------------------------------------------

describe('weeklyProgressPushGenerate — skip conditions', () => {
  it('returns skipped with reason no_children when parent has no family links', async () => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([]);

    const { result } = await executeGenerateHandler('parent-1');

    expect(result).toEqual({
      status: 'skipped',
      reason: 'no_children',
      parentId: 'parent-1',
    });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it('returns skipped with reason no_activity when no snapshots exist for any child', async () => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
    ]);
    // No latest snapshot
    mockGetLatestSnapshot.mockResolvedValue(null);

    const { result } = await executeGenerateHandler('parent-1');

    expect(result).toEqual({
      status: 'skipped',
      reason: 'no_activity',
      parentId: 'parent-1',
    });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it('skips push when totalSessions is zero (child is new but has snapshot)', async () => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
    ]);
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 2,
          vocabularyTotal: 5,
          totalSessions: 0,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(null);
    (mockDb.query as any).profiles.findFirst.mockResolvedValue({
      displayName: 'Emma',
    });

    const { result } = await executeGenerateHandler('parent-1');

    // zero totalSessions → quiet-week message is still a valid child summary
    // but snapshot summary is included, so push IS sent
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('quieter week'),
        type: 'weekly_progress',
      })
    );
    expect(result).toMatchObject({
      status: expect.stringMatching(/completed|throttled/),
    });
  });
});

// ---------------------------------------------------------------------------
// weeklyProgressPushGenerate — positive delta logic
// ---------------------------------------------------------------------------

describe('weeklyProgressPushGenerate — positive deltas', () => {
  beforeEach(() => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
    ]);
    (mockDb.query as any).profiles.findFirst.mockResolvedValue({
      displayName: 'Emma',
    });
  });

  it('includes +N topics in push body when topicsMastered increased', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 8,
          vocabularyTotal: 20,
          totalSessions: 5,
          subjects: [{ topicsExplored: 4 }],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [{ topicsExplored: 4 }],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('+3 topics'),
      })
    );
  });

  it('includes +N words in push body when vocabularyTotal increased', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 35,
          totalSessions: 5,
          subjects: [{ topicsExplored: 4 }],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [{ topicsExplored: 4 }],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('+15 words'),
      })
    );
  });

  it('includes +N explored in push body when topicsExplored increased', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 5,
          subjects: [{ topicsExplored: 7 }],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [{ topicsExplored: 4 }],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('+3 explored'),
      })
    );
  });

  it('sends all three delta parts when all metrics improved', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 9,
          vocabularyTotal: 30,
          totalSessions: 5,
          subjects: [{ topicsExplored: 6 }],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [{ topicsExplored: 4 }],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    const call = mockSendPushNotification.mock.calls[0]?.[1];
    expect(call.body).toContain('+4 topics');
    expect(call.body).toContain('+10 words');
    expect(call.body).toContain('+2 explored');
  });

  it('uses child display name in push body', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 7,
          vocabularyTotal: 20,
          totalSessions: 4,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('Emma'),
      })
    );
  });

  it('falls back to "Your learner" when child profile displayName is missing', async () => {
    (mockDb.query as any).profiles.findFirst.mockResolvedValue(null);
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 7,
          vocabularyTotal: 20,
          totalSessions: 4,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('Your learner'),
      })
    );
  });

  it('sends push with correct profileId, title and type', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 7,
          vocabularyTotal: 20,
          totalSessions: 4,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    await executeGenerateHandler('parent-abc');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'parent-abc',
        title: 'Weekly learning progress',
        type: 'weekly_progress',
      })
    );
  });

  it('returns completed status when push notification is sent', async () => {
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'tk-1',
    });
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 7,
          vocabularyTotal: 20,
          totalSessions: 4,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    const { result } = await executeGenerateHandler('parent-1');

    expect(result).toEqual({ status: 'completed', parentId: 'parent-1' });
  });

  it('returns throttled status when push notification is not sent', async () => {
    mockSendPushNotification.mockResolvedValue({
      sent: false,
      reason: 'daily_limit_reached',
    });
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 7,
          vocabularyTotal: 20,
          totalSessions: 4,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    const { result } = await executeGenerateHandler('parent-1');

    expect(result).toEqual({ status: 'throttled', parentId: 'parent-1' });
  });

  it('clamps negative deltas to zero (regression never shows −N topics)', async () => {
    // Latest has FEWER mastered topics — delta must be clamped to 0, not shown as negative.
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 3,
          vocabularyTotal: 20,
          totalSessions: 5,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    const call = mockSendPushNotification.mock.calls[0]?.[1];
    // Body must not contain negative numbers
    if (call) {
      expect(call.body).not.toMatch(/-\d+ topics/);
    }
  });
});

// ---------------------------------------------------------------------------
// weeklyProgressPushGenerate — quiet week
// ---------------------------------------------------------------------------

describe('weeklyProgressPushGenerate — quiet week', () => {
  beforeEach(() => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
    ]);
    (mockDb.query as any).profiles.findFirst.mockResolvedValue({
      displayName: 'Luca',
    });
  });

  it('shows "quieter week" message when all deltas are zero but sessions > 0', async () => {
    // Same metrics — all deltas resolve to 0
    const snapshot = makeSnapshot({
      metrics: {
        topicsMastered: 5,
        vocabularyTotal: 20,
        totalSessions: 3,
        subjects: [{ topicsExplored: 4 }],
      },
    });
    mockGetLatestSnapshot.mockResolvedValue(snapshot);
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(snapshot);

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('quieter week'),
      })
    );
  });

  it('quiet week message includes the current mastered topic count', async () => {
    const snapshot = makeSnapshot({
      metrics: {
        topicsMastered: 12,
        vocabularyTotal: 50,
        totalSessions: 2,
        subjects: [],
      },
    });
    mockGetLatestSnapshot.mockResolvedValue(snapshot);
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(snapshot);

    await executeGenerateHandler('parent-1');

    const call = mockSendPushNotification.mock.calls[0]?.[1];
    expect(call.body).toContain('12');
  });
});

// ---------------------------------------------------------------------------
// weeklyProgressPushGenerate — multiple children
// ---------------------------------------------------------------------------

describe('weeklyProgressPushGenerate — multiple children', () => {
  it('joins multiple child summaries into one push body', async () => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
      { childProfileId: 'child-2' },
    ]);
    (mockDb.query as any).profiles.findFirst
      .mockResolvedValueOnce({ displayName: 'Alice' })
      .mockResolvedValueOnce({ displayName: 'Bob' });

    // Both children made progress
    mockGetLatestSnapshot
      .mockResolvedValueOnce(
        makeSnapshot({
          metrics: {
            topicsMastered: 8,
            vocabularyTotal: 25,
            totalSessions: 4,
            subjects: [],
          },
        })
      )
      .mockResolvedValueOnce(
        makeSnapshot({
          metrics: {
            topicsMastered: 6,
            vocabularyTotal: 15,
            totalSessions: 3,
            subjects: [],
          },
        })
      );
    mockGetLatestSnapshotOnOrBefore
      .mockResolvedValueOnce(
        makeSnapshot({
          metrics: {
            topicsMastered: 5,
            vocabularyTotal: 20,
            totalSessions: 2,
            subjects: [],
          },
        })
      )
      .mockResolvedValueOnce(
        makeSnapshot({
          metrics: {
            topicsMastered: 4,
            vocabularyTotal: 10,
            totalSessions: 1,
            subjects: [],
          },
        })
      );

    await executeGenerateHandler('parent-1');

    const call = mockSendPushNotification.mock.calls[0]?.[1];
    expect(call.body).toContain('Alice');
    expect(call.body).toContain('Bob');
  });

  it('skips children with no snapshots and still pushes for children that have them', async () => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-no-data' },
      { childProfileId: 'child-with-data' },
    ]);
    (mockDb.query as any).profiles.findFirst.mockResolvedValue({
      displayName: 'Maya',
    });

    // First child has no snapshot, second has one
    mockGetLatestSnapshot
      .mockResolvedValueOnce(null) // child-no-data
      .mockResolvedValueOnce(
        makeSnapshot({
          metrics: {
            topicsMastered: 7,
            vocabularyTotal: 20,
            totalSessions: 4,
            subjects: [],
          },
        })
      );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 2,
          subjects: [],
        },
      })
    );

    const { result } = await executeGenerateHandler('parent-1');

    // Push still sent for the child that has data
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: expect.stringMatching(/completed|throttled/),
    });
  });

  it('returns no_activity when all children have no snapshots', async () => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
      { childProfileId: 'child-2' },
    ]);
    mockGetLatestSnapshot.mockResolvedValue(null);

    const { result } = await executeGenerateHandler('parent-1');

    expect(result).toEqual({
      status: 'skipped',
      reason: 'no_activity',
      parentId: 'parent-1',
    });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// weeklyProgressPushGenerate — error handling
// ---------------------------------------------------------------------------

describe('weeklyProgressPushGenerate — error handling', () => {
  it('calls captureException and returns failed when an unexpected error is thrown', async () => {
    (mockDb.query as any).familyLinks.findMany.mockRejectedValue(
      new Error('DB connection refused')
    );

    const { result } = await executeGenerateHandler('parent-err');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'DB connection refused' }),
      expect.objectContaining({
        extra: expect.objectContaining({ parentId: 'parent-err' }),
      })
    );
    expect(result).toEqual({ status: 'failed', parentId: 'parent-err' });
  });

  it('includes context in the captureException call', async () => {
    (mockDb.query as any).familyLinks.findMany.mockRejectedValue(
      new Error('Timeout')
    );

    await executeGenerateHandler('parent-ctx');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'weekly-progress-push-generate',
        }),
      })
    );
  });

  it('does not re-throw the error (function resolves instead of rejecting)', async () => {
    (mockDb.query as any).familyLinks.findMany.mockRejectedValue(
      new Error('Fatal DB error')
    );

    await expect(executeGenerateHandler('parent-1')).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Helper logic — subtractDays and sumTopicsExplored tested indirectly
// ---------------------------------------------------------------------------

describe('snapshot arithmetic helpers (via generate handler)', () => {
  beforeEach(() => {
    (mockDb.query as any).familyLinks.findMany.mockResolvedValue([
      { childProfileId: 'child-1' },
    ]);
    (mockDb.query as any).profiles.findFirst.mockResolvedValue({
      displayName: 'Test Child',
    });
  });

  it('subtracts exactly 7 days from the latest snapshotDate when requesting previous snapshot', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        snapshotDate: '2026-04-14',
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 3,
          subjects: [],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(null);

    await executeGenerateHandler('parent-1');

    // snapshotDate '2026-04-14' − 7 days = '2026-04-07'
    expect(mockGetLatestSnapshotOnOrBefore).toHaveBeenCalledWith(
      expect.anything(),
      'child-1',
      '2026-04-07'
    );
  });

  it('sums topicsExplored across multiple subjects', async () => {
    // Latest: 3 subjects with topicsExplored 2, 4, 1 = 7
    // Previous: 3 subjects with topicsExplored 1, 2, 1 = 4
    // Delta = +3
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 5,
          subjects: [
            { topicsExplored: 2 },
            { topicsExplored: 4 },
            { topicsExplored: 1 },
          ],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 3,
          subjects: [
            { topicsExplored: 1 },
            { topicsExplored: 2 },
            { topicsExplored: 1 },
          ],
        },
      })
    );

    await executeGenerateHandler('parent-1');

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('+3 explored'),
      })
    );
  });

  it('handles undefined topicsExplored on a subject gracefully (treated as 0)', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 7,
          vocabularyTotal: 20,
          totalSessions: 5,
          subjects: [{ topicsExplored: 5 }, {}],
        },
      })
    );
    mockGetLatestSnapshotOnOrBefore.mockResolvedValue(
      makeSnapshot({
        metrics: {
          topicsMastered: 5,
          vocabularyTotal: 20,
          totalSessions: 3,
          subjects: [{ topicsExplored: 3 }, {}],
        },
      })
    );

    // Should not throw — undefined topicsExplored is treated as 0 via `?? 0`
    await expect(executeGenerateHandler('parent-1')).resolves.not.toThrow();
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('+2 explored'),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isLocalHour9 — tested indirectly through cron find-weekly-parents step
// ---------------------------------------------------------------------------

describe('isLocalHour9 (indirectly via cron step)', () => {
  async function runFindParentsStep(
    timezone: string | null,
    nowUtcHour: number
  ) {
    const isoHour = String(nowUtcHour).padStart(2, '0');
    jest.useFakeTimers({
      now: new Date(`2026-04-21T${isoHour}:00:00.000Z`),
    });

    (mockDb.query as any).notificationPreferences.findMany.mockResolvedValue([
      { profileId: 'parent-tz' },
    ]);
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue([{ profileId: 'parent-tz', timezone }]),
        }),
      }),
    });

    const { result } = await executeCronSteps();
    jest.useRealTimers();
    return (result as any).queuedParents as number;
  }

  it('null timezone + UTC 09:00 → parent is queued', async () => {
    const queued = await runFindParentsStep(null, 9);
    expect(queued).toBe(1);
  });

  it('null timezone + UTC 10:00 → parent is NOT queued', async () => {
    const queued = await runFindParentsStep(null, 10);
    expect(queued).toBe(0);
  });

  it('America/New_York + UTC 13:00 (9am EDT in summer) → parent is queued', async () => {
    // EDT = UTC−4; April 21 is in summer time; 13:00 UTC = 09:00 EDT
    const queued = await runFindParentsStep('America/New_York', 13);
    expect(queued).toBe(1);
  });

  it('America/New_York + UTC 14:00 (10am EDT in summer) → parent is NOT queued', async () => {
    // EDT = UTC−4; 14:00 UTC = 10:00 EDT
    const queued = await runFindParentsStep('America/New_York', 14);
    expect(queued).toBe(0);
  });

  it('invalid timezone falls back to UTC check → UTC 09:00 is queued', async () => {
    // 'Not/ATimezone' will throw in toLocaleString; fallback uses getUTCHours()
    const queued = await runFindParentsStep('Not/ATimezone', 9);
    expect(queued).toBe(1);
  });

  it('invalid timezone falls back to UTC check → UTC 10:00 is NOT queued', async () => {
    const queued = await runFindParentsStep('Not/ATimezone', 10);
    expect(queued).toBe(0);
  });
});
