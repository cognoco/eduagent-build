// Jest globals — no import needed
import {
  curriculumTopics,
  bookSuggestions,
  topicSuggestions,
} from './subjects.js';

describe('curriculumTopics schema', () => {
  it('has filedFrom column', () => {
    expect(curriculumTopics.filedFrom).toBeDefined();
  });

  it('has sessionId column', () => {
    expect(curriculumTopics.sessionId).toBeDefined();
  });
});

describe('bookSuggestions schema', () => {
  it('has required columns', () => {
    expect(bookSuggestions.id).toBeDefined();
    expect(bookSuggestions.subjectId).toBeDefined();
    expect(bookSuggestions.title).toBeDefined();
    expect(bookSuggestions.emoji).toBeDefined();
    expect(bookSuggestions.description).toBeDefined();
    expect(bookSuggestions.pickedAt).toBeDefined();
  });
});

describe('topicSuggestions schema', () => {
  it('has required columns', () => {
    expect(topicSuggestions.id).toBeDefined();
    expect(topicSuggestions.bookId).toBeDefined();
    expect(topicSuggestions.title).toBeDefined();
    expect(topicSuggestions.usedAt).toBeDefined();
  });
});
