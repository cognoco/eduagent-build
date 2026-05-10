import {
  extractedInterviewSignalsSchema,
  firstCurriculumSessionStartSchema,
  learnerRecapResponseSchema,
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

describe('firstCurriculumSessionStartSchema', () => {
  it('accepts an explicit topicId override', () => {
    const result = firstCurriculumSessionStartSchema.safeParse({
      topicId: '00000000-0000-7000-8000-000000000001',
      inputMode: 'text',
    });
    expect(result.success).toBe(true);
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

describe('learnerRecapResponseSchema [BUG-1011]', () => {
  const validRecap = {
    closingLine: 'Great session today!',
    takeaways: ['Learned about loops', 'Practiced recursion'],
    nextTopicReason: 'Builds on recursion concepts',
  };

  it('accepts a valid recap with closingLine, takeaways, and nextTopicReason', () => {
    const result = learnerRecapResponseSchema.safeParse(validRecap);
    expect(result.success).toBe(true);
  });

  it('accepts nullable nextTopicReason', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      nextTopicReason: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts 1 takeaway (minimum)', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      takeaways: ['Single takeaway'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts 4 takeaways (maximum)', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      takeaways: ['One', 'Two', 'Three', 'Four'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty closingLine', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      closingLine: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects closingLine exceeding 150 characters', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      closingLine: 'x'.repeat(151),
    });
    expect(result.success).toBe(false);
  });

  it('rejects 0 takeaways (too few)', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      takeaways: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 takeaways', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      takeaways: ['One', 'Two', 'Three', 'Four', 'Five'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a takeaway exceeding 200 characters', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      takeaways: ['y'.repeat(201)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty takeaway string', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      takeaways: [''],
    });
    expect(result.success).toBe(false);
  });

  it('rejects nextTopicReason exceeding 120 characters', () => {
    const result = learnerRecapResponseSchema.safeParse({
      ...validRecap,
      nextTopicReason: 'z'.repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(learnerRecapResponseSchema.safeParse({}).success).toBe(false);
    expect(
      learnerRecapResponseSchema.safeParse({ closingLine: 'Hi' }).success,
    ).toBe(false);
    expect(
      learnerRecapResponseSchema.safeParse({ takeaways: ['A'] }).success,
    ).toBe(false);
  });
});
