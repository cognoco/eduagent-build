import { withSafetyPreamble } from './router';
import type { ChatMessage } from './types';

// WI-1779: withSafetyPreamble prepends a session-stable preamble to the system
// message and must shift the cache-boundary offset (cachePrefixLength) past it,
// so the downstream cache_control breakpoint still lands at the underlying
// stable/volatile split. These are pure-function tests (no provider/fetch).

describe('withSafetyPreamble — cache boundary shift (WI-1779)', () => {
  const STABLE = 'STABLE RULES BLOCK';
  const VOLATILE = 'VOLATILE PER-TURN STATE';
  const original = `${STABLE}\n\n${VOLATILE}`;

  it('shifts the boundary so it lands exactly at the stable/volatile split', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: original, cachePrefixLength: STABLE.length },
      { role: 'user', content: 'hi' },
    ];

    const [merged] = withSafetyPreamble(messages, 'adult');
    const content = merged?.content as string;

    // The preamble is prepended; the caller's system prompt is preserved intact.
    expect(content.endsWith(original)).toBe(true);
    expect(typeof merged?.cachePrefixLength).toBe('number');

    // The strongest check: the cached region ends exactly at the STABLE end and
    // the remainder is precisely the volatile suffix. This ties the offset to
    // the actual string boundary and fails on any join/shift separator drift —
    // no hardcoded separator length.
    const offset = merged?.cachePrefixLength as number;
    expect(content.slice(0, offset).endsWith(STABLE)).toBe(true);
    expect(content.slice(offset)).toBe(`\n\n${VOLATILE}`);

    // Equivalent derived-from-separator form: prepended length is everything
    // before the caller's original content.
    const prependedLen = content.length - original.length;
    expect(offset).toBe(prependedLen + STABLE.length);
  });

  it('leaves cachePrefixLength absent when the incoming message has none', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'plain system prompt' },
      { role: 'user', content: 'hi' },
    ];

    const [merged] = withSafetyPreamble(messages, 'adult');
    expect(merged?.role).toBe('system');
    expect(merged?.content).toContain('plain system prompt');
    expect(merged?.cachePrefixLength).toBeUndefined();
  });

  it('sets no boundary when there is no leading system message', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

    const result = withSafetyPreamble(messages, 'adult');
    // A fresh system preamble is prepended; it carries no cache boundary.
    expect(result[0]?.role).toBe('system');
    expect(result[0]?.cachePrefixLength).toBeUndefined();
  });
});
