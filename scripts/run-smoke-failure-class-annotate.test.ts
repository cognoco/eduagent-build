// [WI-2452] Run-smoke failure-class annotation unit tests.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  bucketFor,
  formatAnnotation,
  readFailureClass,
} from './run-smoke-failure-class-annotate.cjs';

const SCRIPT_PATH = join(__dirname, 'run-smoke-failure-class-annotate.cjs');

describe('[WI-2452] bucketFor', () => {
  it.each([
    'success',
    'cancellation',
    'product',
    'infra-signalled',
    'unknown',
    'not-run',
  ])('has a label and meaning for classifier kind %s', (kind) => {
    const bucket = bucketFor(kind);
    expect(bucket.label).toBeTruthy();
    expect(bucket.meaning).toBeTruthy();
  });

  it('falls back gracefully for an unrecognized kind', () => {
    const bucket = bucketFor('totally-made-up');
    expect(bucket.label).toBe('Unrecognized');
    expect(bucket.meaning).toContain('totally-made-up');
  });
});

describe('[WI-2452] formatAnnotation', () => {
  it('names the lane and the bucket label in the notice line', () => {
    const { noticeLine } = formatAnnotation({ lane: 'core', kind: 'product' });
    expect(noticeLine).toContain('::notice');
    expect(noticeLine).toContain('core lane');
    expect(noticeLine).toContain('Product bug');
  });

  it('includes the raw kind and the bucket meaning in the summary', () => {
    const { summaryMarkdown } = formatAnnotation({
      lane: 'advisory',
      kind: 'infra-signalled',
    });
    expect(summaryMarkdown).toContain('advisory lane');
    expect(summaryMarkdown).toContain('`infra-signalled`');
    expect(summaryMarkdown).toContain('Ambient staging infra');
  });
});

describe('[WI-2452] readFailureClass', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-smoke-annotate-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the state file is missing', () => {
    expect(readFailureClass(join(dir, 'absent.state'))).toBeNull();
  });

  it('parses FAILURE_CLASS from a well-formed state file', () => {
    const file = join(dir, 'classification.state');
    writeFileSync(file, 'FAILURE_CLASS=product\n');
    expect(readFailureClass(file)).toBe('product');
  });

  it('returns null when the state file has no FAILURE_CLASS line', () => {
    const file = join(dir, 'other.state');
    writeFileSync(file, 'SOMETHING_ELSE=1\n');
    expect(readFailureClass(file)).toBeNull();
  });
});

describe('[WI-2452] CLI', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-smoke-annotate-cli-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 and prints a neutral line when the state file is absent', () => {
    const result = spawnSync(
      'node',
      [SCRIPT_PATH, 'core', join(dir, 'absent.state')],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('not classified');
  });

  it('exits 0 and prints a notice when the state file is present', () => {
    const file = join(dir, 'classification.state');
    writeFileSync(file, 'FAILURE_CLASS=infra-signalled\n');
    const result = spawnSync('node', [SCRIPT_PATH, 'advisory', file], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::notice');
    expect(result.stdout).toContain('Ambient staging infra');
  });

  it('appends to GITHUB_STEP_SUMMARY when set', () => {
    const stateFile = join(dir, 'classification.state');
    writeFileSync(stateFile, 'FAILURE_CLASS=product\n');
    const summaryFile = join(dir, 'summary.md');
    writeFileSync(summaryFile, '# existing summary\n');
    const result = spawnSync('node', [SCRIPT_PATH, 'core', stateFile], {
      encoding: 'utf-8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
    });
    expect(result.status).toBe(0);
    const summary = require('node:fs').readFileSync(summaryFile, 'utf8');
    expect(summary).toContain('# existing summary');
    expect(summary).toContain('Run-smoke failure class — core lane');
  });

  it('exits 2 with usage when called without arguments', () => {
    const result = spawnSync('node', [SCRIPT_PATH], { encoding: 'utf-8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage:');
  });
});
