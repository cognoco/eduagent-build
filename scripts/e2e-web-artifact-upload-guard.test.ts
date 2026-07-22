// WI-2594 forward-only guard: e2e-web.yml must never publish
// credential-bearing Playwright artifacts (playwright-report* or
// test-results*) via actions/upload-artifact. Both trees record
// fill-step values — including seeded staging login credentials — in
// clear text (WI-2593, review-steward:codex:global). The "Upload V2
// Playwright artifacts" and "Upload legacy Playwright artifacts" steps
// that used to publish them were removed outright; this test fails if
// either comes back, or if a new upload-artifact step republishes either
// tree under a different step name or through a parent/glob path. No
// redaction or secret-scan proof exists today, so the safe structural policy
// is stricter: this workflow may not contain an upload-artifact action at all.
//
// Style matches the sibling workflow-structure tests in this directory
// (e2e-web-cleanup.test.ts, e2e-ci-injection-and-smoke-gate.test.ts):
// parse the committed YAML with the `yaml` package and assert on
// structure. No fixtures, no mocks — the committed workflow file is the
// system under test.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = join(__dirname, '..');
const WORKFLOW_FILE = 'e2e-web.yml';

type Step = {
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type Job = {
  steps?: Step[];
};

function loadWorkflow(name: string): { jobs: Record<string, Job> } {
  const filePath = join(repoRoot, '.github', 'workflows', name);
  return parseYaml(readFileSync(filePath, 'utf8')) as {
    jobs: Record<string, Job>;
  };
}

function uploadArtifactSteps(
  jobs: Record<string, Job>,
): Array<{ jobName: string; step: Step }> {
  const found: Array<{ jobName: string; step: Step }> = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    for (const step of job.steps ?? []) {
      const action = String(step.uses ?? '').trim();
      if (action.toLowerCase().includes('upload-artifact')) {
        found.push({ jobName, step });
      }
    }
  }
  return found;
}

describe('[WI-2594] e2e-web.yml never republishes credential-bearing Playwright artifacts', () => {
  const workflow = loadWorkflow(WORKFLOW_FILE);
  const jobs = workflow.jobs;

  it('recognizes upload-artifact actions despite casing, wrappers, parent paths, or globs', () => {
    const syntheticJobs: Record<string, Job> = {
      probe: {
        steps: [
          {
            name: 'parent directory',
            uses: 'actions/upload-artifact@v4',
            with: { path: 'apps/mobile/e2e-web' },
          },
          {
            name: 'case-variant glob',
            uses: 'Actions/Upload-Artifact@v4',
            with: { path: 'apps/mobile/e2e-web/playwright-*' },
          },
          {
            name: 'local wrapper brace glob',
            uses: './.github/actions/upload-artifact',
            with: {
              path: 'apps/mobile/e2e-web/{playwright-report,test-results}',
            },
          },
          {
            name: 'wrapper suffix',
            uses: './.github/actions/upload-artifact-wrapper',
            with: { path: 'apps/mobile/e2e-web/*' },
          },
          {
            name: 'wrapper trailing slash',
            uses: './.github/actions/upload-artifact/',
            with: { path: 'apps/mobile/e2e-web' },
          },
        ],
      },
    };

    expect(
      uploadArtifactSteps(syntheticJobs).map(({ step }) => step.name),
    ).toEqual([
      'parent directory',
      'case-variant glob',
      'local wrapper brace glob',
      'wrapper suffix',
      'wrapper trailing slash',
    ]);
  });

  it('declares no upload-artifact action while no redaction or secret-scan proof exists', () => {
    const offenders = uploadArtifactSteps(jobs).map(
      ({ jobName, step }) => `job "${jobName}" step "${step.name}"`,
    );
    expect(offenders).toEqual([]);
  });
});
