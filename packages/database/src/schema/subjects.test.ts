// Jest globals — no import needed
import { curriculumTopics } from './subjects.js';

describe('curriculumTopics schema', () => {
  it('has filedFrom column', () => {
    expect(curriculumTopics.filedFrom).toBeDefined();
  });

  it('has sessionId column', () => {
    expect(curriculumTopics.sessionId).toBeDefined();
  });
});
