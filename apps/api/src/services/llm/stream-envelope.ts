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
    try {
      for await (const chunk of source) {
        raw += chunk;
        yield chunk;
      }
      resolveRaw(raw);
    } catch (err) {
      rejectRaw(err);
      throw err;
    }
  }

  const cleanReplyStream = streamEnvelopeReply(accumulatedSource());
  return { cleanReplyStream, rawResponsePromise };
}

export async function* streamEnvelopeReply(
  source: AsyncIterable<string>
): AsyncGenerator<string> {
  let buffer = '';
  let state: StreamState = 'find_reply_key';
  let pendingEscape = '';

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
          if (out) yield out;
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
        if (out) yield out;
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
    yield pendingEscape;
  }
}
