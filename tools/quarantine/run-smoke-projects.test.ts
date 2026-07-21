import { describe, expect, it } from '@jest/globals';
import {
  buildPlaywrightArgs,
  resolveLaneProjects,
} from './run-smoke-projects.cjs';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const FUTURE = '2026-08-01T00:00:00.000Z';

describe('[WI-2458] run-smoke project runner', () => {
  it('selects core and advisory projects from the resolver', () => {
    const entries = [
      {
        id: 'smoke-parent-flaky',
        project: 'smoke-parent',
        owner: 'playwright-lane-owner',
        wi: 'WI-2458',
        reason: 'stability-window fixture',
        expires: FUTURE,
      },
    ];

    expect(resolveLaneProjects('advisory', NOW, entries)).toEqual([
      'smoke-parent',
    ]);
    expect(resolveLaneProjects('core', NOW, entries)).not.toContain(
      'smoke-parent',
    );
  });

  it('rejects an unknown lane instead of running an unscoped suite', () => {
    expect(() => resolveLaneProjects('all', NOW, [])).toThrow(
      /lane must be "core" or "advisory"/,
    );
  });

  it('returns no command for an empty lane so bare Playwright never runs', () => {
    expect(buildPlaywrightArgs([])).toBeNull();
  });

  it('builds one project flag per selected project', () => {
    expect(buildPlaywrightArgs(['smoke-auth', 'smoke-learner'])).toEqual([
      'exec',
      'playwright',
      'test',
      '-c',
      'apps/mobile/playwright.config.ts',
      '--project=smoke-auth',
      '--project=smoke-learner',
    ]);
  });
});
