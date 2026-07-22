import {
  classifyMaestroHealth,
  isMaestroJob,
  runExecutedMaestro,
  type WorkflowJob,
  type WorkflowRun,
} from './check-maestro-main-health';

const NOW = new Date('2026-07-22T12:00:00Z');

function job(name: string, conclusion: string | null): WorkflowJob {
  return { name, conclusion };
}

/** 4 Maestro shard jobs with the given conclusions, plus a non-Maestro job. */
function maestroShards(...conclusions: Array<string | null>): WorkflowJob[] {
  return [
    job('Determine E2E scope', 'success'),
    ...conclusions.map((c, i) => job(`Mobile Maestro E2E Tests (${i + 1})`, c)),
  ];
}

function run(overrides: Partial<WorkflowRun>): WorkflowRun {
  return {
    id: 1,
    headSha: 'a'.repeat(40),
    headBranch: 'main',
    event: 'workflow_run',
    createdAt: '2026-07-22T09:00:00Z',
    jobs: maestroShards('success', 'success', 'success', 'success'),
    ...overrides,
  };
}

describe('isMaestroJob / runExecutedMaestro', () => {
  it('recognises the sharded Maestro job names', () => {
    expect(isMaestroJob(job('Mobile Maestro E2E Tests (3)', 'failure'))).toBe(
      true,
    );
    expect(isMaestroJob(job('Determine E2E scope', 'success'))).toBe(false);
  });

  it('treats skipped/null shards as NOT executed (change-class-skipped or running)', () => {
    expect(
      runExecutedMaestro(
        run({
          jobs: maestroShards('skipped', 'skipped', 'skipped', 'skipped'),
        }),
      ),
    ).toBe(false);
    expect(
      runExecutedMaestro(run({ jobs: maestroShards(null, null, null, null) })),
    ).toBe(false);
    expect(
      runExecutedMaestro(
        run({
          jobs: maestroShards('success', 'skipped', 'skipped', 'skipped'),
        }),
      ),
    ).toBe(true);
  });
});

describe('classifyMaestroHealth', () => {
  it('GREEN when the most recent executed run passed every shard', () => {
    const result = classifyMaestroHealth(
      [run({ id: 100, createdAt: '2026-07-22T09:00:00Z' })],
      { now: NOW },
    );
    expect(result.verdict).toBe('green');
    expect(result.lastExecutedRun?.id).toBe(100);
    expect(result.failingShards).toEqual([]);
  });

  it('RED when the most recent executed run has a failing shard', () => {
    const result = classifyMaestroHealth(
      [
        run({
          id: 200,
          headSha: 'ba6c01b28'.padEnd(40, '0'),
          createdAt: '2026-07-22T09:00:00Z',
          jobs: maestroShards('success', 'failure', 'failure', 'success'),
        }),
      ],
      { now: NOW },
    );
    expect(result.verdict).toBe('red');
    expect(result.failingShards).toEqual([
      'Mobile Maestro E2E Tests (2)',
      'Mobile Maestro E2E Tests (3)',
    ]);
  });

  it('ignores change-class-skipped runs and reads the most recent EXECUTED run', () => {
    // Newest run skipped Maestro (API-only commit); the older run actually ran it and was red.
    const result = classifyMaestroHealth(
      [
        run({
          id: 301,
          createdAt: '2026-07-22T11:00:00Z',
          jobs: maestroShards('skipped', 'skipped', 'skipped', 'skipped'),
        }),
        run({
          id: 300,
          createdAt: '2026-07-22T08:00:00Z',
          jobs: maestroShards('success', 'failure', 'success', 'success'),
        }),
      ],
      { now: NOW },
    );
    expect(result.verdict).toBe('red');
    expect(result.lastExecutedRun?.id).toBe(300);
  });

  it('STALE when no fetched run executed Maestro at all', () => {
    const result = classifyMaestroHealth(
      [
        run({
          id: 400,
          jobs: maestroShards('skipped', 'skipped', 'skipped', 'skipped'),
        }),
      ],
      { now: NOW },
    );
    expect(result.verdict).toBe('stale');
    expect(result.lastExecutedRun).toBeUndefined();
  });

  it('STALE when the last executed run is older than the freshness window', () => {
    // Executed run 40h before NOW, window is 30h ⇒ nightly likely stopped running.
    const result = classifyMaestroHealth(
      [run({ id: 500, createdAt: '2026-07-20T20:00:00Z' })],
      { now: NOW, staleAfterHours: 30 },
    );
    expect(result.verdict).toBe('stale');
    expect(result.lastExecutedRun?.id).toBe(500);
  });

  it('does not go stale when the last executed run is within the window', () => {
    const result = classifyMaestroHealth(
      [run({ id: 501, createdAt: '2026-07-22T00:00:00Z' })],
      { now: NOW, staleAfterHours: 30 },
    );
    expect(result.verdict).toBe('green');
  });

  it('filters out runs whose head branch is not main', () => {
    const result = classifyMaestroHealth(
      [
        run({
          id: 600,
          headBranch: 'some-feature-branch',
          createdAt: '2026-07-22T11:00:00Z',
          jobs: maestroShards('failure', 'failure', 'failure', 'failure'),
        }),
        run({ id: 601, headBranch: 'main', createdAt: '2026-07-22T09:00:00Z' }),
      ],
      { now: NOW },
    );
    // The red non-main run is ignored; the green main run wins.
    expect(result.verdict).toBe('green');
    expect(result.lastExecutedRun?.id).toBe(601);
  });
});
