// WI-1157 regression test — the watcher's parse step reads the quartet.review_result.v1
// envelope structurally and extracts the correct disposition + findings, for each of the
// four disposition values, with no string-matching against prose.

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseReviewEnvelope,
  readReviewEnvelope,
  type ReviewDisposition,
} from './review-envelope.ts';

function envelopeFixture(
  disposition: ReviewDisposition,
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify({
    schema: 'quartet.review_result.v1',
    wi: 'WI-1157',
    workstream: 'WS-23',
    reviewerRuntime: 'codex-reviewer-loop',
    disposition,
    evidence: ['tests pass', 'CI green'],
    commandsRun: ['bun test'],
    cosmoMutations: ['Stage: Executing -> Reviewing'],
    overridesApplied: [],
    findings: [`${disposition}-finding`],
    followUps: [],
    timestamp: '2026-07-05T12:00:00.000Z',
    ...overrides,
  });
}

describe('parseReviewEnvelope — one disposition value at a time', () => {
  for (const disposition of [
    'approve',
    'bounce',
    'blocked',
    'manual',
  ] as const) {
    test(`extracts disposition="${disposition}" and its findings structurally`, () => {
      const envelope = parseReviewEnvelope(envelopeFixture(disposition));
      expect(envelope).not.toBeNull();
      expect(envelope!.disposition).toBe(disposition);
      expect(envelope!.findings).toEqual([`${disposition}-finding`]);
      expect(envelope!.cosmoMutations).toEqual([
        'Stage: Executing -> Reviewing',
      ]);
    });
  }

  test('reads the disposition off the structured field, not by scanning prose for keywords', () => {
    // Every disposition word appears somewhere in prose-like array fields here — a
    // prose-scraping approach that just looked for "bounce"/"approve"/etc. anywhere in
    // the text would be fooled. The structured `disposition` field is unambiguous.
    const envelope = parseReviewEnvelope(
      envelopeFixture('approve', {
        evidence: [
          'this could look like a bounce or blocked or manual case in prose, but is not',
        ],
        findings: [
          'no findings — evidence mentions bounce/blocked/manual only as decoys',
        ],
      }),
    );
    expect(envelope).not.toBeNull();
    expect(envelope!.disposition).toBe('approve');
  });

  test('rejects a missing/wrong schema tag', () => {
    expect(
      parseReviewEnvelope(JSON.stringify({ disposition: 'approve' })),
    ).toBeNull();
    expect(
      parseReviewEnvelope(
        JSON.stringify({ schema: 'something.else.v1', disposition: 'approve' }),
      ),
    ).toBeNull();
  });

  test('rejects an unknown disposition value', () => {
    expect(
      parseReviewEnvelope(
        JSON.stringify({
          schema: 'quartet.review_result.v1',
          disposition: 'maybe',
        }),
      ),
    ).toBeNull();
  });

  test('rejects unparseable JSON', () => {
    expect(parseReviewEnvelope('not json at all')).toBeNull();
  });
});

describe('readReviewEnvelope — file-backed, with the AC-required absent-envelope fallback', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    while (cleanupDirs.length)
      rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  });

  test('reads and parses a real envelope file written to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi1157-envelope-'));
    cleanupDirs.push(dir);
    const path = join(dir, 'WI-1157.ws23.envelope.json');
    writeFileSync(path, envelopeFixture('bounce'));
    const envelope = readReviewEnvelope(path, (p) => readFileSync(p, 'utf8'));
    expect(envelope).not.toBeNull();
    expect(envelope!.disposition).toBe('bounce');
  });

  test('falls back to null (caller logs as manual) when the envelope file is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi1157-envelope-'));
    cleanupDirs.push(dir);
    const path = join(dir, 'never-written.envelope.json');
    const envelope = readReviewEnvelope(path, (p) => readFileSync(p, 'utf8'));
    expect(envelope).toBeNull();
  });

  test('falls back to null when the file exists but is not a valid envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi1157-envelope-'));
    cleanupDirs.push(dir);
    const path = join(dir, 'garbage.envelope.json');
    writeFileSync(path, 'this is not json');
    const envelope = readReviewEnvelope(path, (p) => readFileSync(p, 'utf8'));
    expect(envelope).toBeNull();
  });
});
