import {
  extractedInterviewSignalsSchema,
  sessionMessageSchema,
} from './sessions.js';

describe('sessionMessageSchema', () => {
  it('accepts a message with image fields', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'What is this diagram?',
      imageBase64: 'iVBORw0KGgoAAAANS==',
      imageMimeType: 'image/jpeg',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a message without image fields', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'Hello',
    });
    expect(result.success).toBe(true);
  });

  it('rejects imageBase64 without imageMimeType', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'Hello',
      imageBase64: 'iVBORw0KGgoAAAANS==',
    });
    expect(result.success).toBe(false);
  });

  it('rejects imageMimeType without imageBase64', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'Hello',
      imageMimeType: 'image/jpeg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid imageMimeType', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'Hello',
      imageBase64: 'iVBORw0KGgoAAAANS==',
      imageMimeType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });
});

describe('extractedInterviewSignalsSchema — fast-path fields', () => {
  it('accepts interestContext as a record of label to context', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['football'],
      interestContext: { football: 'free_time' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts analogyFraming as one of three values', () => {
    for (const value of ['concrete', 'abstract', 'playful'] as const) {
      const parsed = extractedInterviewSignalsSchema.safeParse({
        goals: [],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        analogyFraming: value,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects an invalid analogyFraming value', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      analogyFraming: 'sarcastic',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts paceHint as density and chunkSize', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      paceHint: { density: 'low', chunkSize: 'short' },
    });
    expect(parsed.success).toBe(true);
  });

  it('all new fields are optional — minimal payload still parses', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
    });
    expect(parsed.success).toBe(true);
  });
});
