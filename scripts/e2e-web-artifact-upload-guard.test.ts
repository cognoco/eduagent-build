// WI-2594 forward-only guard: e2e-web.yml must never publish
// credential-bearing Playwright artifacts (playwright-report* or
// test-results*) via actions/upload-artifact. Both trees record
// fill-step values — including seeded staging login credentials — in
// clear text (WI-2593, review-steward:codex:global). The "Upload V2
// Playwright artifacts" and "Upload legacy Playwright artifacts" steps
// that used to publish them were removed outright; this test fails if
// either comes back, or if a new upload-artifact step republishes either
// tree under a different step name.
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

// The two trees that record Playwright fill-step values (screenshots,
// traces, videos, and the HTML report's embedded base64 payload) in clear
// text. Matched by path-segment prefix so `test-results-legacy` and
// `playwright-report-legacy` are caught alongside the base names.
const FORBIDDEN_BASENAME_PREFIXES = ['playwright-report', 'test-results'];

function isForbiddenPath(pathLine: string): boolean {
  const basename = pathLine.trim().split(/[\\/]/).pop() ?? '';
  return FORBIDDEN_BASENAME_PREFIXES.some((prefix) =>
    basename.startsWith(prefix),
  );
}

function uploadArtifactSteps(
  jobs: Record<string, Job>,
): Array<{ jobName: string; step: Step }> {
  const found: Array<{ jobName: string; step: Step }> = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    for (const step of job.steps ?? []) {
      if (String(step.uses ?? '').startsWith('actions/upload-artifact@')) {
        found.push({ jobName, step });
      }
    }
  }
  return found;
}

describe('[WI-2594] e2e-web.yml never republishes credential-bearing Playwright artifacts', () => {
  const workflow = loadWorkflow(WORKFLOW_FILE);
  const jobs = workflow.jobs;

  it('declares no Upload Playwright artifacts step at all', () => {
    // WI-2594 removed both "Upload V2 Playwright artifacts" and "Upload
    // legacy Playwright artifacts" outright — the simplest correct fix,
    // since neither tree has a values-free form today. If this assertion
    // ever fails, some upload-artifact step for Playwright output came
    // back; the path check below decides whether it is safe.
    const playwrightUploadSteps = uploadArtifactSteps(jobs).filter(({ step }) =>
      String(step.name ?? '')
        .toLowerCase()
        .includes('playwright'),
    );
    expect(playwrightUploadSteps).toHaveLength(0);
  });

  it('no upload-artifact step in any job publishes a playwright-report* or test-results* path', () => {
    const offenders: string[] = [];
    for (const { jobName, step } of uploadArtifactSteps(jobs)) {
      const rawPath = String(step.with?.path ?? '');
      const lines = rawPath
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (isForbiddenPath(line)) {
          offenders.push(`job "${jobName}" step "${step.name}": ${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
