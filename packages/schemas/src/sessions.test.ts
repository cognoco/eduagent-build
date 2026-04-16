import { sessionMessageSchema } from './sessions.js';

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
