import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  mentorNoticeNudgeStatusEnum,
  mentorNoticeRecheckOutcomeEnum,
  mentorNoticeStatusEnum,
  mentorNotices,
} from './mentor-notices.js';
import * as schema from './index.js';

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
      // [WI-2503] delivery claim taken by the nudge reserve step
      'reserved',
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
    expect(config.uniqueConstraints.map((item) => item.name)).toContain(
      'mentor_notices_source_session_unique',
    );
    expect(config.indexes.map((item) => item.config.name)).toEqual(
      expect.arrayContaining([
        'mentor_notices_profile_status_created_idx',
        'mentor_notices_subject_status_created_idx',
        'mentor_notices_topic_id_idx',
        'mentor_notices_last_offered_session_id_idx',
      ]),
    );
  });
});
