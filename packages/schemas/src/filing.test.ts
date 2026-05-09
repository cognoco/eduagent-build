import {
  filingRequestSchema,
  filingLlmOutputSchema,
  filedFromSchema,
} from './filing.js';

describe('filingRequestSchema', () => {
  it('accepts pre-session filing (rawInput)', () => {
    const result = filingRequestSchema.safeParse({
      rawInput: 'Danube',
      selectedSuggestion: 'European Rivers',
    });
    expect(result.success).toBe(true);
  });

  it('accepts post-session filing (transcript)', () => {
    const result = filingRequestSchema.safeParse({
      sessionTranscript: 'We talked about rivers...',
      sessionMode: 'freeform',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty request', () => {
    const result = filingRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('filingLlmOutputSchema', () => {
  it('accepts new entities', () => {
    const result = filingLlmOutputSchema.safeParse({
      shelf: { name: 'Geography' },
      book: { name: 'Europe', emoji: '🌍', description: 'European geography' },
      chapter: { name: 'Rivers' },
      topic: { title: 'Danube', description: 'The Danube river' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts existing entity references', () => {
    const result = filingLlmOutputSchema.safeParse({
      shelf: { id: '019012ab-cdef-7000-8000-000000000001' },
      book: { id: '019012ab-cdef-7000-8000-000000000002' },
      chapter: { existing: 'Rivers' },
      topic: { title: 'Danube', description: 'The Danube river' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts post-session variant with extracted field', () => {
    const result = filingLlmOutputSchema.safeParse({
      extracted: 'European rivers and the Danube',
      shelf: { name: 'Geography' },
      book: { name: 'Europe', emoji: '🌍', description: 'European geography' },
      chapter: { name: 'Rivers' },
      topic: { title: 'Danube', description: 'The Danube river' },
    });
    expect(result.success).toBe(true);
  });
});

describe('filedFromSchema', () => {
  it('accepts valid values', () => {
    expect(filedFromSchema.safeParse('pre_generated').success).toBe(true);
    expect(filedFromSchema.safeParse('session_filing').success).toBe(true);
    expect(filedFromSchema.safeParse('freeform_filing').success).toBe(true);
  });

  it('rejects invalid value', () => {
    expect(filedFromSchema.safeParse('unknown').success).toBe(false);
  });
});
