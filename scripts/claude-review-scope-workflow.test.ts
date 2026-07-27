import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

interface ReviewComment {
  created_at: string;
  body: string;
  user: { login: string; type: string };
}

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface RunReviewOptions {
  tamperManifestPaths?: string[];
}

const INCIDENT_HEAD = 'a9d5f5ed6524d503f953844fce3cd5f96a816a7f';
const INCIDENT_CHANGED_PATHS = [
  '.workitem-artifacts/WI-2838/completion-summary.md',
  '.workitem-artifacts/WI-2838/evidence.json',
  '.workitem-artifacts/WI-2838/red-green.md',
  '.workitem-artifacts/WI-2838/verification.md',
  '.workitem-artifacts/WI-2838/workitem.json',
  'apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts',
  'apps/mobile/e2e-web/helpers/held-now-request.test.ts',
  'apps/mobile/e2e-web/helpers/held-now-request.ts',
];

const BASE_ONLY_PATH =
  'apps/api/src/services/persisted-learning-text-guard.guard.test.ts';

function workflowStep(name: string): string {
  const workflow = parse(
    readFileSync('.github/workflows/claude-code-review.yml', 'utf8'),
  ) as {
    jobs: { 'claude-review': { steps: WorkflowStep[] } };
  };
  const step = workflow.jobs['claude-review'].steps.find(
    (candidate) => candidate.name === name,
  );
  if (!step?.run) throw new Error(`Missing workflow run step: ${name}`);
  return step.run;
}

function reviewBody({
  head = INCIDENT_HEAD,
  verdict,
  paths,
}: {
  head?: string;
  verdict: 'APPROVED' | 'CHANGES_REQUESTED';
  paths: string[];
}): string {
  const shouldFix = verdict === 'CHANGES_REQUESTED' ? paths.length : 0;
  const rows = paths
    .map((path) => `| \`${path}\` | L1 | issue | rule | fix |`)
    .join('\n');
  const findings = rows
    ? `\n### SHOULD FIX\n\n| File | Line | Issue | Rule | Suggested Fix |\n|------|------|-------|------|---------------|\n${rows}\n`
    : '';
  return [
    `## Claude Code Review: ${verdict}`,
    findings,
    '<details><summary>Review metadata</summary>',
    '',
    `- Verdict: ${verdict}`,
    `- Reviewed head SHA: ${head}`,
    '- Must-fix count: 0',
    `- Should-fix count: ${shouldFix}`,
    '- Consider count: 0',
    '',
    '</details>',
  ].join('\n');
}

function trustedComment(
  body: string,
  createdAt = '2026-07-26T23:28:40Z',
): ReviewComment {
  return {
    created_at: createdAt,
    body,
    user: { login: 'claude[bot]', type: 'Bot' },
  };
}

function runReviewSteps(
  comments: ReviewComment[],
  { tamperManifestPaths }: RunReviewOptions = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'claude-review-scope-'));
  const fixturePath = join(root, 'github-fixture.json');
  const manifestPath = join(root, 'changed-files.json');
  const artifactPath = join(root, 'verdict.json');
  const ghPath = join(root, 'gh');
  writeFileSync(
    fixturePath,
    JSON.stringify({
      pull: { head: { sha: INCIDENT_HEAD } },
      files: INCIDENT_CHANGED_PATHS.map((filename) => ({ filename })),
      comments,
      // Models the unrelated files introduced into the checkout/history by the
      // normal main merge. GitHub's pull-files endpoint does not return these.
      baseOnlyPaths: [
        BASE_ONLY_PATH,
        'apps/api/src/services/learner-profile.ts',
      ],
    }),
  );
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"/pulls/"* && "$*" == *".head.sha"* ]]; then
  jq -r '.pull.head.sha' "$GH_FIXTURE"
  exit 0
fi
case "$*" in
  *"/files"*) jq -c '.files[]' "$GH_FIXTURE" ;;
  *"/comments"*) jq -c '.comments[]' "$GH_FIXTURE" ;;
  *"/pulls/"*) jq -c '.pull' "$GH_FIXTURE" ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 64 ;;
esac
`,
  );
  chmodSync(ghPath, 0o755);

  const env = {
    ...process.env,
    PATH: `${root}:${process.env.PATH ?? ''}`,
    GH_FIXTURE: fixturePath,
    CHANGED_FILES_MANIFEST: manifestPath,
    VERDICT_ARTIFACT: artifactPath,
    HEAD_SHA: INCIDENT_HEAD,
    PR_NUMBER: '2664',
    REPO: 'cognoco/eduagent-build',
    REVIEW_RUN_STARTED_AT: '2026-07-26T23:20:00Z',
  };
  const manifest = spawnSync(
    'bash',
    ['-euo', 'pipefail', '-c', workflowStep('Capture authoritative PR files')],
    { cwd: root, encoding: 'utf8', env },
  );
  if (manifest.status !== 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`manifest step failed: ${manifest.stderr}`);
  }
  if (tamperManifestPaths) {
    writeFileSync(
      manifestPath,
      JSON.stringify({ head_sha: INCIDENT_HEAD, paths: tamperManifestPaths }),
    );
    const refresh = spawnSync(
      'bash',
      [
        '-euo',
        'pipefail',
        '-c',
        workflowStep('Refresh authoritative PR files'),
      ],
      { cwd: root, encoding: 'utf8', env },
    );
    if (refresh.status !== 0) {
      rmSync(root, { recursive: true, force: true });
      throw new Error(`manifest refresh failed: ${refresh.stderr}`);
    }
  }
  const evaluation = spawnSync(
    'bash',
    ['-uo', 'pipefail', '-c', workflowStep('Evaluate review verdict')],
    { cwd: root, encoding: 'utf8', env },
  );
  const artifact = existsSync(artifactPath)
    ? (JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<
        string,
        unknown
      >)
    : undefined;
  const manifestJson = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    head_sha: string;
    paths: string[];
  };
  rmSync(root, { recursive: true, force: true });
  return { artifact, evaluation, manifest: manifestJson };
}

describe('Claude review authoritative-diff scope', () => {
  it('fails closed after a normal main merge when a fresh verdict cites only a base-only path', () => {
    const result = runReviewSteps([
      trustedComment(
        reviewBody({ verdict: 'CHANGES_REQUESTED', paths: [BASE_ONLY_PATH] }),
      ),
    ]);

    expect(result.manifest).toEqual({
      head_sha: INCIDENT_HEAD,
      paths: INCIDENT_CHANGED_PATHS,
    });
    expect(result.evaluation.status).not.toBe(0);
    expect(result.artifact).toMatchObject({
      status: 'REVIEW_SCOPE_CORRUPTION',
      merge_eligible: false,
      head_sha: INCIDENT_HEAD,
      out_of_scope_paths: [BASE_ONLY_PATH],
    });
  });

  it('refreshes the manifest after writable reviewer tampering', () => {
    const result = runReviewSteps(
      [
        trustedComment(
          reviewBody({
            verdict: 'CHANGES_REQUESTED',
            paths: [BASE_ONLY_PATH],
          }),
        ),
      ],
      {
        tamperManifestPaths: [...INCIDENT_CHANGED_PATHS, BASE_ONLY_PATH],
      },
    );

    expect(result.manifest).toEqual({
      head_sha: INCIDENT_HEAD,
      paths: INCIDENT_CHANGED_PATHS,
    });
    expect(result.evaluation.status).not.toBe(0);
    expect(result.artifact).toMatchObject({
      status: 'REVIEW_SCOPE_CORRUPTION',
      merge_eligible: false,
      out_of_scope_paths: [BASE_ONLY_PATH],
    });
  });

  it('keeps a real changed-path finding valid without authorizing the verdict', () => {
    const changedPath = INCIDENT_CHANGED_PATHS.at(-1)!;
    const result = runReviewSteps([
      trustedComment(
        reviewBody({ verdict: 'CHANGES_REQUESTED', paths: [changedPath] }),
      ),
    ]);

    expect(result.evaluation.status).toBe(0);
    expect(result.artifact).toMatchObject({
      status: 'REVIEW_COMPLETED',
      merge_eligible: false,
      scope_valid: true,
      finding_paths: [changedPath],
    });
  });

  it('keeps a no-finding approval merge-eligible', () => {
    const result = runReviewSteps([
      trustedComment(reviewBody({ verdict: 'APPROVED', paths: [] })),
    ]);

    expect(result.evaluation.status).toBe(0);
    expect(result.artifact).toMatchObject({
      status: 'REVIEW_COMPLETED',
      merge_eligible: true,
      scope_valid: true,
      finding_paths: [],
    });
  });

  it('lets an unchanged-head rerun recover with the latest fresh verdict', () => {
    const result = runReviewSteps([
      trustedComment(
        reviewBody({ verdict: 'CHANGES_REQUESTED', paths: [BASE_ONLY_PATH] }),
        '2026-07-26T23:10:00Z',
      ),
      trustedComment(
        reviewBody({ verdict: 'CHANGES_REQUESTED', paths: [BASE_ONLY_PATH] }),
        '2026-07-26T23:25:00Z',
      ),
      trustedComment(
        reviewBody({ verdict: 'APPROVED', paths: [] }),
        '2026-07-26T23:30:00Z',
      ),
    ]);

    expect(result.evaluation.status).toBe(0);
    expect(result.artifact).toMatchObject({
      verdict: 'APPROVED',
      merge_eligible: true,
      head_sha: INCIDENT_HEAD,
    });
  });

  it('does not authorize malformed verdict metadata', () => {
    const malformed = trustedComment(
      `## Claude Code Review: APPROVED\n\n- Reviewed head SHA: ${INCIDENT_HEAD}`,
    );
    const result = runReviewSteps([malformed]);

    expect(result.artifact).toMatchObject({
      merge_eligible: false,
      metadata_complete: false,
    });
  });

  it('fails when no fresh exact-head trusted verdict exists', () => {
    const stale = trustedComment(
      reviewBody({ verdict: 'APPROVED', paths: [] }),
      '2026-07-26T23:10:00Z',
    );
    const result = runReviewSteps([stale]);

    expect(result.evaluation.status).not.toBe(0);
    expect(result.artifact).toBeUndefined();
  });
});
