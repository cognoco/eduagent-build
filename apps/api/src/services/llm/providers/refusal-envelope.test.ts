import { normalizeModelRefusal } from './refusal-envelope';
import { parseEnvelope } from '../envelope';

describe('normalizeModelRefusal', () => {
  it('returns null for a normal envelope string (no rewrite)', () => {
    expect(
      normalizeModelRefusal('{"reply":"Sure!","signals":{}}', 'en'),
    ).toBeNull();
  });

  it('rewrites a bare OpenAI refusal object into a parseable safe envelope', () => {
    const out = normalizeModelRefusal('{"type":"refusal"}', 'pl');
    expect(out).not.toBeNull();
    const result = parseEnvelope(out!);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a parseable envelope');
    expect(typeof result.envelope.reply).toBe('string');
    expect(result.envelope.reply.length).toBeGreaterThan(0);
    expect(result.envelope.signals?.crisis_redirect).toBe(false);
  });

  it('rewrites a bare top-level refusal string with no reply', () => {
    const out = normalizeModelRefusal(
      '{"refusal":"I cannot help with that"}',
      'en',
    );
    expect(out).not.toBeNull();
    expect(parseEnvelope(out!).ok).toBe(true);
  });

  it('localizes the decline by conversationLanguage, English fallback', () => {
    const plOut = normalizeModelRefusal('{"type":"refusal"}', 'pl');
    const enOut = normalizeModelRefusal('{"type":"refusal"}', 'en');
    const pl = parseEnvelope(plOut!);
    const en = parseEnvelope(enOut!);
    if (!pl.ok || !en.ok) throw new Error('expected parseable envelopes');
    expect(pl.envelope.reply).not.toBe(en.envelope.reply); // a Polish decline exists
  });

  it('returns null for non-refusal, non-envelope content (normal fallback handles it)', () => {
    expect(normalizeModelRefusal('not json at all', 'en')).toBeNull();
    expect(normalizeModelRefusal('{"foo":"bar"}', 'en')).toBeNull();
  });
});
