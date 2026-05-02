// Jest globals — no import needed
import {
  curriculumTopics,
  bookSuggestions,
  topicSuggestions,
} from './subjects.js';

describe('curriculumTopics schema', () => {
  it('has filedFrom column', () => {
    expect(curriculumTopics).toHaveProperty('filedFrom');
  });

  it('has sessionId column', () => {
    expect(curriculumTopics).toHaveProperty('sessionId');
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
