import { stripEmbeddedEnvelopeTail } from './envelope';

// ---------------------------------------------------------------------------
// streamEnvelopeReply — incremental extractor that emits only the characters
// inside the `reply` string of a streaming LLM envelope. The provider stream
// yields raw envelope JSON chunks like `{"reply":"Hello\nWorld", "signals":…`,
// but the mobile SSE consumer expects readable text chunks. This helper is
// the bridge.
//
// Non-goals:
// - Not a general JSON parser. It assumes the LLM follows the envelope shape
//   (reply first, as a string). Malformed output degrades gracefully — the
//   helper stops emitting and the caller falls back to the full-response
//   parseEnvelope at close.
// - Does not validate structure beyond `"reply"` key + string value. Signals
//   and ui_hints are parsed at close via parseEnvelope against the full text.
// ---------------------------------------------------------------------------

const REPLY_KEY_RE = /"reply"\s*:/;

// ---------------------------------------------------------------------------
// Literal-escape normalizer — defensive guard for the streaming path.
//
// Some LLMs emit `\\n` inside the JSON `reply` string when they meant a real
// newline. After our JSON-spec-correct decode (`tryDecodeEscape`), `\\n`
// becomes literal backslash + `n` in the yielded chunk, which then leaks to
// the rendered chat bubble as visible "\n". This normalizer mirrors the
// non-streaming `normalizeReplyText` in envelope.ts but operates on streaming
// chunks: a trailing `\` from chunk N must be deferred so it can be paired
// with the leading char of chunk N+1.
//
// Sequences handled (post-JSON-decode): `\n`, `\r\n`, `\r`, `\t`. Every other
// `\X` is left alone — those are legitimate text (backslashes in code, etc).
// ---------------------------------------------------------------------------

interface LiteralEscapeNormalizer {
  /** Feed a decoded chunk; returns the chunk with literal escapes resolved. */
  push(input: string): string;
  /** Flush any deferred trailing `\` once the source has drained. */
  flush(): string;
}

interface EmbeddedEnvelopeTailFilter {
  push(input: string): string;
  flush(): string;
}

function createEmbeddedEnvelopeTailFilter(): EmbeddedEnvelopeTailFilter {
  let pending = '';
  let stopped = false;
  const holdChars = 48;

  return {
    push(input: string): string {
      if (stopped || input.length === 0) return '';

      pending += input;
      const stripped = stripEmbeddedEnvelopeTail(pending);
      if (stripped !== pending) {
        stopped = true;
        pending = '';
        return stripped;
      }

      if (pending.length <= holdChars) return '';
      const emit = pending.slice(0, -holdChars);
      pending = pending.slice(-holdChars);
      return emit;
    },
    flush(): string {
      if (stopped) return '';
      const out = stripEmbeddedEnvelopeTail(pending);
      pending = '';
      return out;
    },
  };
}

function createLiteralEscapeNormalizer(): LiteralEscapeNormalizer {
  // True when the previous push ended on a lone `\` whose pair (n/r/t) may
  // still arrive in the next chunk. Deferring it preserves real-text
  // backslashes when the partner is a different char.
  let pendingBackslash = false;

  return {
    push(input: string): string {
      let out = '';
      let i = 0;

      if (pendingBackslash && input.length > 0) {
        const c = input[0];
        if (c === 'n' || c === 'r') {
          out += '\n';
          i = 1;
        } else if (c === 't') {
          out += '\t';
          i = 1;
        } else {
          // Lone backslash — emit it and let the main loop handle the next
          // char (which may itself start a new escape).
          out += '\\';
        }
        pendingBackslash = false;
      }

      while (i < input.length) {
        const ch = input[i];
        if (ch === '\\') {
          if (i === input.length - 1) {
            pendingBackslash = true;
            i++;
            break;
          }
          const next = input[i + 1];
          if (next === 'n' || next === 'r') {
            out += '\n';
            i += 2;
          } else if (next === 't') {
            out += '\t';
            i += 2;
          } else {
            out += '\\';
            i++;
          }
        } else {
          out += ch;
          i++;
        }
      }

      return out;
    },
    flush(): string {
      if (pendingBackslash) {
        pendingBackslash = false;
        return '\\';
      }
      return '';
    },
  };
}

type StreamState =
  | 'find_reply_key'
  | 'find_reply_value_start'
  | 'in_reply_value'
  | 'after_reply';

/**
 * Decode one JSON escape sequence starting with `\`. Returns null when more
 * characters are still needed (callers accumulate until decode succeeds or
 * the sequence exceeds the max length of `\uXXXX`).
 */
function tryDecodeEscape(seq: string): string | null {
  if (seq.length < 2) return null;
  const c = seq[1];
  switch (c) {
    case '"':
      return '"';
    case '\\':
      return '\\';
    case '/':
      return '/';
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case 'r':
      return '\r';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'u': {
      if (seq.length < 6) return null;
      const code = parseInt(seq.slice(2, 6), 16);
      if (Number.isNaN(code)) return null;
      return String.fromCharCode(code);
    }
    default:
      // Unknown escape — emit as literal (defensive; JSON spec would reject)
      return c ?? '';
  }
}

/**
 * Stream only the decoded characters of the envelope's `reply` string.
 * Everything before the `"reply":"…"` value is skipped. Everything after
 * the closing quote (signals, ui_hints, etc.) is discarded by this stream —
 * the caller must parse the full accumulated response separately for
 * non-reply fields.
 */
/**
 * Tee a source stream into:
 *  - a cleanReplyStream that yields only envelope-reply characters (ready
 *    for the mobile SSE consumer)
 *  - a rawResponsePromise that resolves with the full accumulated raw text
 *    after the source drains (used by onComplete to parseEnvelope for
 *    signals + ui_hints).
 *
 * The raw promise only settles after the caller fully consumes
 * cleanReplyStream — callers MUST drain cleanReplyStream before awaiting
 * rawResponsePromise to avoid deadlock.
 */
export function teeEnvelopeStream(source: AsyncIterable<string>): {
  cleanReplyStream: AsyncIterable<string>;
  rawResponsePromise: Promise<string>;
} {
  let raw = '';
  let resolveRaw!: (s: string) => void;
  let rejectRaw!: (e: unknown) => void;
  const rawResponsePromise = new Promise<string>((res, rej) => {
    resolveRaw = res;
    rejectRaw = rej;
  });

  async function* accumulatedSource(): AsyncGenerator<string> {
    // [BUG-628] Use try/catch/finally so rawResponsePromise ALWAYS settles —
    // either resolving with whatever was accumulated before early termination,
    // or rejecting on a source error. Without finally, if the caller stops
    // consuming cleanReplyStream before the source is exhausted (e.g. client
    // disconnect, SSE write error), the generator suspends forever and
    // rawResponsePromise never settles — causing the Cloudflare Worker request
    // to time out.
    try {
      for await (const chunk of source) {
        raw += chunk;
        yield chunk;
      }
    } catch (err) {
      rejectRaw(err);
      throw err;
    } finally {
      // Resolve with whatever was accumulated. If we already called rejectRaw
      // above, this resolve is a no-op (Promise settlement is idempotent).
      resolveRaw(raw);
    }
  }

  const cleanReplyStream = streamEnvelopeReply(accumulatedSource());
  return { cleanReplyStream, rawResponsePromise };
}

export async function* streamEnvelopeReply(
  source: AsyncIterable<string>,
): AsyncGenerator<string> {
  let buffer = '';
  let state: StreamState = 'find_reply_key';
  let pendingEscape = '';
  // Defensive normalizer — removes literal `\n`/`\r`/`\t` leaks from
  // double-escaping LLMs before the chunk reaches the SSE consumer.
  const normalizer = createLiteralEscapeNormalizer();
  const embeddedTailFilter = createEmbeddedEnvelopeTailFilter();

  function emit(text: string): string {
    return embeddedTailFilter.push(normalizer.push(text));
  }

  for await (const chunk of source) {
    buffer += chunk;

    // Advance the state machine over the current buffer. Each branch either
    // consumes a prefix of buffer and updates state, or breaks out to wait
    // for more chunks.
    while (buffer.length > 0) {
      if (state === 'find_reply_key') {
        const match = REPLY_KEY_RE.exec(buffer);
        if (!match) break;
        buffer = buffer.slice(match.index + match[0].length);
        state = 'find_reply_value_start';
        continue;
      }

      if (state === 'find_reply_value_start') {
        let i = 0;
        while (i < buffer.length && /\s/.test(buffer[i] ?? '')) i++;
        if (i >= buffer.length) {
          buffer = '';
          break;
        }
        if (buffer[i] !== '"') {
          // Value is not a string — cannot extract reply. Skip envelope entirely.
          state = 'after_reply';
          break;
        }
        buffer = buffer.slice(i + 1);
        state = 'in_reply_value';
        continue;
      }

      if (state === 'in_reply_value') {
        let out = '';
        let i = 0;

        // Finish any escape sequence carried over from a prior chunk.
        while (pendingEscape.length > 0 && i < buffer.length) {
          pendingEscape += buffer[i];
          i++;
          const decoded = tryDecodeEscape(pendingEscape);
          if (decoded !== null) {
            out += decoded;
            pendingEscape = '';
            break;
          }
          if (pendingEscape.length > 7) {
            // Give up — malformed escape; emit literally so the user sees something.
            out += pendingEscape;
            pendingEscape = '';
            break;
          }
        }
        if (pendingEscape.length > 0) {
          buffer = '';
          if (out) {
            const normalized = emit(out);
            if (normalized) yield normalized;
          }
          break;
        }

        while (i < buffer.length) {
          const ch = buffer[i];
          if (ch === '\\') {
            pendingEscape = '\\';
            i++;
            while (i < buffer.length && pendingEscape.length < 7) {
              pendingEscape += buffer[i];
              i++;
              const decoded = tryDecodeEscape(pendingEscape);
              if (decoded !== null) {
                out += decoded;
                pendingEscape = '';
                break;
              }
            }
            continue;
          }
          if (ch === '"') {
            i++;
            state = 'after_reply';
            break;
          }
          out += ch;
          i++;
        }

        buffer = buffer.slice(i);
        if (out) {
          const normalized = emit(out);
          if (normalized) yield normalized;
        }
        if (state === 'after_reply') break;
        // Otherwise need more chunks.
        break;
      }

      if (state === 'after_reply') {
        buffer = '';
        break;
      }
    }
  }

  if (pendingEscape.length > 0) {
    const normalized = emit(pendingEscape);
    if (normalized) yield normalized;
  }
  const normalizedFlush = normalizer.flush();
  const filteredFlush = embeddedTailFilter.push(normalizedFlush);
  if (filteredFlush) yield filteredFlush;
  const flushed = embeddedTailFilter.flush();
  if (flushed) yield flushed;
}
