import {
  getProfileScopedTables,
  PROFILE_SCOPED_SCAN_EXCEPTIONS,
} from './profile-scoped-tables.js';

describe('getProfileScopedTables', () => {
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
