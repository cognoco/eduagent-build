// [BUG-804] The Mobile CI workflow (.github/workflows/mobile-ci.yml) exposes a
// `workflow_dispatch` input `profile` whose options drive the `build-manual`
// job's `eas build --profile <profile>`. That job has NO `environment:` gate,
// so offering `production` here let a manual dispatch ship a store build while
// bypassing the approval gate (and, with skip_tests, skipping lint+test too).
//
// Production mobile builds must go only through deploy.yml's gated
// `mobile-confirm-production` (environment: production) path. This guard locks
// in the fix: mobile-ci.yml must not offer a production build option, and the
// legitimate gated path in deploy.yml must still exist (so the fix cannot be
// "undone" by simply re-adding production to the ungated workflow).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const repoRoot = join(__dirname, '..');

function loadWorkflow(rel: string): Record<string, unknown> {
  return parse(readFileSync(join(repoRoot, rel), 'utf8')) as Record<
    string,
    unknown
  >;
}

// `yaml@2` parses with the YAML 1.2 core schema, where `on` is a plain string
// key (not the 1.1 boolean `true`). Read it defensively in case that changes.
function workflowOn(doc: Record<string, unknown>): Record<string, unknown> {
  const on = (doc.on ?? (doc as Record<string, unknown>)['true']) as
    | Record<string, unknown>
    | undefined;
  if (!on) throw new Error('workflow `on:` block not found');
  return on;
}

describe('mobile-ci.yml manual build profile options', () => {
  const mobileCi = loadWorkflow('.github/workflows/mobile-ci.yml');
  const dispatch = workflowOn(mobileCi).workflow_dispatch as Record<
    string,
    Record<string, Record<string, { options?: unknown }>>
  >;
  const profileOptions = dispatch.inputs.profile.options as unknown;

  test('profile options parse to a non-empty list with the non-store profiles', () => {
    expect(Array.isArray(profileOptions)).toBe(true);
    expect(profileOptions).toContain('development');
    expect(profileOptions).toContain('preview');
  });

  test('does NOT offer a production build (gated path is deploy.yml only)', () => {
    expect(profileOptions).not.toContain('production');
  });
});

describe('deploy.yml retains the gated production mobile path', () => {
  const deploy = loadWorkflow('.github/workflows/deploy.yml');
  const jobs = deploy.jobs as Record<string, { environment?: unknown }>;

  test('mobile-confirm-production job is gated by environment: production', () => {
    const job = jobs['mobile-confirm-production'];
    expect(job).toBeDefined();
    expect(job.environment).toBe('production');
  });
});
