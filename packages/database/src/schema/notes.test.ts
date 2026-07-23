import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { topicNotes } from './notes.js';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../apps/api/drizzle/0153_strong_quicksilver.sql',
  ),
  'utf8',
);

describe('topicNotes rollout compatibility', () => {
  it('keeps artifact_source nullable while legacy Workers still write NULL', () => {
    expect(topicNotes.artifactSource.notNull).toBe(false);
    expect(topicNotes.artifactSource.hasDefault).toBe(true);
  });

  it('backfills rollout-era rows without contracting to NOT NULL', () => {
    expect(migration).toContain(
      `UPDATE "topic_notes" SET "artifact_source" = 'learner_authored_note' WHERE "artifact_source" IS NULL`,
    );
    expect(migration).not.toContain(
      'ALTER COLUMN "artifact_source" SET NOT NULL',
    );
  });

  it('allows the complete typed learner-source evidence-link directions', () => {
    expect(migration).toContain(`"from_kind" IN ('artifact', 'exchange')`);
    expect(migration).toContain(
      `"to_kind" IN ('note', 'bookmark', 'transcript_excerpt', 'homework_ocr')`,
    );
  });
});
