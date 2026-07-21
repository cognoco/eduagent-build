import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import {
  mentorNoticeNudgeStatusEnum,
  mentorNoticeRecheckOutcomeEnum,
  mentorNoticeStatusEnum,
  mentorNotices,
} from './mentor-notices.js';
import * as schema from './index.js';

// Renders an index's `where` predicate to plain text (column names + raw SQL)
// so it can be asserted without tripping on the circular table refs embedded
// in drizzle's SQL chunk objects.
function renderPredicate(where: SQL): string {
  return where.queryChunks
    .map((chunk) => {
      const column = chunk as Partial<PgColumn>;
      if (
        column &&
        typeof column === 'object' &&
        'name' in column &&
        'columnType' in column
      ) {
        return `<${column.name}>`;
      }
      const raw = chunk as { value?: string[] };
      if (raw && Array.isArray(raw.value)) return raw.value.join('');
      return '';
    })
    .join('');
}

describe('mentor notices schema', () => {
  it('exports the profile-scoped lifecycle table and enums', () => {
    expect(schema).toHaveProperty('mentorNotices');
    expect(schema).toHaveProperty('mentorNoticeStatusEnum');
    expect(mentorNoticeStatusEnum.enumValues).toEqual([
      'open',
      'locked_in',
      'dismissed',
      'faded',
    ]);
    expect(mentorNoticeNudgeStatusEnum.enumValues).toEqual([
      'pending',
      'sent',
      'skipped',
      'suppressed',
    ]);
    expect(mentorNoticeRecheckOutcomeEnum.enumValues).toEqual([
      'locked_in',
      'not_yet',
      'dismissed',
      'deferred',
    ]);
  });

  it('pins one notice per source session and indexed ownership paths', () => {
    const config = getTableConfig(mentorNotices);

    expect(config.name).toBe('mentor_notices');
    expect(mentorNotices).toHaveProperty('profileId');
    expect(mentorNotices).toHaveProperty('subjectId');
    expect(mentorNotices).toHaveProperty('topicId');
    expect(mentorNotices).toHaveProperty('sourceSessionId');
    expect(mentorNotices).toHaveProperty('lastDeferredAt');
    expect(config.indexes.map((item) => item.config.name)).toEqual(
      expect.arrayContaining([
        'mentor_notices_source_session_answer_event_uq',
        'mentor_notices_source_session_null_evidence_uq',
        'mentor_notices_profile_status_created_idx',
        'mentor_notices_subject_status_created_idx',
        'mentor_notices_topic_id_idx',
        'mentor_notices_last_offered_session_id_idx',
      ]),
    );

    const answerEventUq = config.indexes.find(
      (item) =>
        item.config.name === 'mentor_notices_source_session_answer_event_uq',
    );
    const nullEvidenceUq = config.indexes.find(
      (item) =>
        item.config.name === 'mentor_notices_source_session_null_evidence_uq',
    );

    expect(answerEventUq?.config.unique).toBe(true);
    expect(answerEventUq?.config.columns.map((column) => column.name)).toEqual([
      'source_session_id',
      'answer_event_id',
    ]);
    expect(renderPredicate(answerEventUq!.config.where as SQL)).toBe(
      '<answer_event_id> IS NOT NULL',
    );

    expect(nullEvidenceUq?.config.unique).toBe(true);
    expect(nullEvidenceUq?.config.columns.map((column) => column.name)).toEqual(
      ['source_session_id'],
    );
    expect(renderPredicate(nullEvidenceUq!.config.where as SQL)).toBe(
      '<answer_event_id> IS NULL',
    );
  });
});
