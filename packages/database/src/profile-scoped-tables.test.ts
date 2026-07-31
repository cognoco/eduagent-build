import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  getProfileScopedTables,
  PROFILE_SCOPED_SCAN_EXCEPTIONS,
} from './profile-scoped-tables.js';

describe('getProfileScopedTables', () => {
  it('documents the explicit public subpath instead of the eager root barrel', () => {
    const source = readFileSync(
      join(__dirname, 'profile-scoped-tables.ts'),
      'utf8',
    );

    expect(source).toContain('@eduagent/database/profile-scoped-tables');
    expect(source).not.toContain('Exported via the package barrel');
  });

  it('keeps the Node-only scanner out of the native ESM runtime barrel', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        "await import('@eduagent/database')",
      ],
      { cwd: join(__dirname, '../../..'), encoding: 'utf8' },
    );

    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'ReferenceError: __dirname is not defined',
    );
    expect(result.status).toBe(0);
  });

  it('detects real profile-column declarations across scoped table shapes', () => {
    const tables = getProfileScopedTables();

    expect(tables).toEqual(
      expect.arrayContaining([
        'subjects',
        'nudges',
        'feedback_retry_queue',
        'mentor_activity_ledger',
      ]),
    );
    expect(tables.length).toBeGreaterThanOrEqual(15);
  });

  it('ignores profile_id text that appears only in comments after a pgTable block', () => {
    const tables = getProfileScopedTables();

    expect(tables).not.toContain('topic_connections');
    expect(PROFILE_SCOPED_SCAN_EXCEPTIONS).not.toHaveProperty(
      'topic_connections',
    );
  });

  it('does not treat post-cutover person_id columns as profile-scoped ownership', () => {
    const tables = getProfileScopedTables();

    expect(tables).not.toContain('subscription_payers');
    expect(tables).not.toContain('consent_request');
  });

  it('keeps exceptions specific to real profile-like non-ownership declarations', () => {
    const tables = getProfileScopedTables();

    expect(tables).toContain('curriculum_topics');
    expect(PROFILE_SCOPED_SCAN_EXCEPTIONS.curriculum_topics).toContain(
      'source_child_profile_id',
    );
  });
});
