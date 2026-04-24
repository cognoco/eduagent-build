import { normalizeStopReason } from './stop-reason';

describe('normalizeStopReason', () => {
  describe('anthropic', () => {
    it('maps "max_tokens" to "length"', () => {
      expect(normalizeStopReason('anthropic', 'max_tokens')).toBe('length');
    });
    it('maps "end_turn" to "stop"', () => {
      expect(normalizeStopReason('anthropic', 'end_turn')).toBe('stop');
    });
    it('maps "stop_sequence" to "stop"', () => {
      expect(normalizeStopReason('anthropic', 'stop_sequence')).toBe('stop');
    });
    it('maps "tool_use" to "tool_use"', () => {
      expect(normalizeStopReason('anthropic', 'tool_use')).toBe('tool_use');
    });
    it('maps unknown anthropic reasons to "unknown"', () => {
      expect(normalizeStopReason('anthropic', 'refusal')).toBe('unknown');
    });
  });

  describe('openai', () => {
    it('maps "length" to "length"', () => {
      expect(normalizeStopReason('openai', 'length')).toBe('length');
    });
    it('maps "stop" to "stop"', () => {
      expect(normalizeStopReason('openai', 'stop')).toBe('stop');
    });
    it('maps "content_filter" to "filter"', () => {
      expect(normalizeStopReason('openai', 'content_filter')).toBe('filter');
    });
    it('maps "tool_calls" to "tool_use"', () => {
      expect(normalizeStopReason('openai', 'tool_calls')).toBe('tool_use');
    });
    it('maps "function_call" to "tool_use"', () => {
      expect(normalizeStopReason('openai', 'function_call')).toBe('tool_use');
    });
    it('maps unknown openai reasons to "unknown"', () => {
      expect(normalizeStopReason('openai', 'weird')).toBe('unknown');
    });
  });

  describe('gemini', () => {
    it('maps "MAX_TOKENS" to "length"', () => {
      expect(normalizeStopReason('gemini', 'MAX_TOKENS')).toBe('length');
    });
    it('maps "STOP" to "stop"', () => {
      expect(normalizeStopReason('gemini', 'STOP')).toBe('stop');
    });
    it('maps "SAFETY" to "filter"', () => {
      expect(normalizeStopReason('gemini', 'SAFETY')).toBe('filter');
    });
    it('maps "RECITATION" to "filter"', () => {
      expect(normalizeStopReason('gemini', 'RECITATION')).toBe('filter');
    });
    it('is case-insensitive for gemini', () => {
      expect(normalizeStopReason('gemini', 'max_tokens')).toBe('length');
      expect(normalizeStopReason('gemini', 'stop')).toBe('stop');
    });
  });

  describe('fallbacks', () => {
    it('returns "unknown" for undefined', () => {
      expect(normalizeStopReason('openai', undefined)).toBe('unknown');
      expect(normalizeStopReason('anthropic', undefined)).toBe('unknown');
      expect(normalizeStopReason('gemini', undefined)).toBe('unknown');
    });
    it('returns "unknown" for null', () => {
      expect(normalizeStopReason('openai', null)).toBe('unknown');
    });
    it('returns "unknown" for empty string', () => {
      expect(normalizeStopReason('anthropic', '')).toBe('unknown');
    });
  });
});
