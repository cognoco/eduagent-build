// Jest globals — no import needed
import {
  curriculumTopics,
  bookSuggestions,
  topicSuggestions,
  topicConnections,
} from './subjects.js';

describe('curriculumTopics schema', () => {
  it('has filedFrom column', () => {
    expect(curriculumTopics).toHaveProperty('filedFrom');
  });

  it('has sessionId column', () => {
    expect(curriculumTopics).toHaveProperty('sessionId');
  });

  it('has nullable sourceChildProfileId provenance column', () => {
    expect(curriculumTopics).toHaveProperty('sourceChildProfileId');
  });
});

describe('bookSuggestions schema', () => {
  it('has required columns', () => {
    expect(bookSuggestions).toHaveProperty('id');
    expect(bookSuggestions).toHaveProperty('subjectId');
    expect(bookSuggestions).toHaveProperty('title');
    expect(bookSuggestions).toHaveProperty('emoji');
    expect(bookSuggestions).toHaveProperty('description');
    expect(bookSuggestions).toHaveProperty('pickedAt');
  });
});

describe('topicSuggestions schema', () => {
  it('has required columns', () => {
    expect(topicSuggestions).toHaveProperty('id');
    expect(topicSuggestions).toHaveProperty('bookId');
    expect(topicSuggestions).toHaveProperty('title');
    expect(topicSuggestions).toHaveProperty('usedAt');
  });
});

// [BUG-226 / P3] topic_connections has NO profileId column today; ownership
// is enforced TRANSITIVELY via the parent chain (topic → book → subject →
// profileId). Pin the current shape so a half-finished refactor that adds a
// `profileId` column without also enabling RLS and a same-profile check
// constraint will fail this assertion and force a full migration plan.
describe('topicConnections schema (BUG-226)', () => {
  it('has the documented columns (id + topicAId + topicBId + createdAt)', () => {
    expect(topicConnections).toHaveProperty('id');
    expect(topicConnections).toHaveProperty('topicAId');
    expect(topicConnections).toHaveProperty('topicBId');
    expect(topicConnections).toHaveProperty('createdAt');
  });

  it('does NOT carry a profileId column (parent-chain ownership only)', () => {
    // If a future commit adds profileId without also (a) backfilling, (b)
    // enabling RLS, (c) adding a same-profile check constraint, this test
    // should flip to require all three at once — see the comment block
    // above the table definition in subjects.ts.
    expect(topicConnections).not.toHaveProperty('profileId');
  });
});
