import {
  findEmbeddedEnvelopeTailStart,
  stripEmbeddedEnvelopeTail,
} from './envelope';

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

// ---------------------------------------------------------------------------
// Top-level reply-key scanner.
//
// The original implementation matched the FIRST /"reply"\s*:/ occurrence
// anywhere in the raw stream — including one nested inside an earlier object
// (`{"x":{"reply":"AAA"},"reply":"BBB"}` streamed "AAA"), while the
// completion-time parseEnvelope persisted the TOP-LEVEL "BBB". The learner
// could see live text that never matched the transcript/export/parent view.
//
// This scanner is JSON-aware: it tracks object/array depth plus string and
// escape state, and only arms on a string key `reply` at depth 1 followed by
// `:`. Text before the first `{` (markdown fences, stray prose) is skipped
// without string semantics. Malformed output keeps the documented graceful
// degradation — the scanner simply never matches and the caller parses the
// full accumulated text at close.
// ---------------------------------------------------------------------------

// Keys are short; cap capture so a huge depth-1 string VALUE cannot grow the
// buffer. A truncated capture can never equal 'reply', which is all we need.
const MAX_KEY_CAPTURE_CHARS = 64;

interface TopLevelReplyKeyScanner {
  /**
   * Feed the next raw chunk. Returns the index in `input` immediately AFTER
   * the colon of the top-level `"reply":` key when it completes during this
   * push, or -1 when not (yet) found. State persists across pushes, so keys
   * and their colons may arrive split across chunks.
   */
  push(input: string): number;
}

function createTopLevelReplyKeyScanner(): TopLevelReplyKeyScanner {
  // 0 = before the envelope's opening `{`; 1 = inside the top-level object.
  let depth = 0;
  let inString = false;
  let escaped = false;
  // Non-null while capturing a depth-1 string that could be a key.
  let capturedKey: string | null = null;
  // Set when a depth-1 string just closed; the next non-whitespace char
  // decides whether it was a key (`:`) or a value (`,`/`}`/…).
  let closedString: string | null = null;

  return {
    push(input: string): number {
      for (let i = 0; i < input.length; i += 1) {
        const ch = input[i] as string;

        // Skip everything before the first `{` without string semantics —
        // pre-envelope prose/fences have no JSON quoting rules.
        if (depth === 0) {
          if (ch === '{') depth = 1;
          continue;
        }

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
            if (capturedKey !== null) {
              closedString = capturedKey;
              capturedKey = null;
            }
            continue;
          }
          if (
            capturedKey !== null &&
            capturedKey.length < MAX_KEY_CAPTURE_CHARS
          ) {
            capturedKey += ch;
          }
          continue;
        }

        if (closedString !== null) {
          if (/\s/.test(ch)) continue;
          const isReplyKey = ch === ':' && closedString === 'reply';
          closedString = null;
          if (isReplyKey) return i + 1;
          if (ch === ':') continue; // a different key — keep scanning
          // Not a colon: the string was a value; fall through and treat the
          // current char structurally.
        }

        if (ch === '"') {
          inString = true;
          // Only depth-1 strings can be top-level keys.
          capturedKey = depth === 1 ? '' : null;
          continue;
        }
        if (ch === '{' || ch === '[') {
          depth += 1;
          continue;
        }
        if (ch === '}' || ch === ']') {
          if (depth > 0) depth -= 1;
          continue;
        }
      }
      return -1;
    },
  };
}

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
  let tailPending: string | null = null;
  let stopped = false;
  const maxTailPendingChars = 512;

  return {
    push(input: string): string {
      if (stopped || input.length === 0) return '';

      if (tailPending !== null) {
        tailPending += input;
        const stripped = stripEmbeddedEnvelopeTail(tailPending);
        if (stripped !== tailPending) {
          stopped = true;
          tailPending = null;
          return stripped;
        }
        if (tailPending.length > maxTailPendingChars) {
          const out = tailPending;
          tailPending = null;
          return out;
        }
        return '';
      }

      pending += input;
      const tailStart = findEmbeddedEnvelopeTailStart(pending);
      if (tailStart >= 0) {
        const beforeTail = pending.slice(0, tailStart);
        tailPending = pending.slice(tailStart);
        pending = '';
        const stripped = stripEmbeddedEnvelopeTail(tailPending);
        if (stripped !== tailPending) {
          stopped = true;
          tailPending = null;
          return beforeTail + stripped;
        }
        return beforeTail;
      }

      const prefixStart = findPotentialTailStarterPrefixStart(pending);
      if (prefixStart >= 0) {
        const emit = pending.slice(0, prefixStart);
        pending = pending.slice(prefixStart);
        return emit;
      }

      const out = pending;
      pending = '';
      return out;
    },
    flush(): string {
      if (stopped) return '';
      const out =
        (tailPending === null ? '' : stripEmbeddedEnvelopeTail(tailPending)) +
        pending;
      tailPending = null;
      pending = '';
      return out;
    },
  };
}

function findPotentialTailStarterPrefixStart(text: string): number {
  const lookbehind = Math.min(text.length, 32);
  const start = text.length - lookbehind;
  for (let i = start; i < text.length; i += 1) {
    if (isTailStarterPrefix(text.slice(i))) return i;
  }
  return -1;
}

function isTailStarterPrefix(value: string): boolean {
  let index = 0;
  if (!isQuote(value[index])) return false;
  index += 1;
  index = skipSpaces(value, index);
  if (index >= value.length) return true;
  if (value[index] !== ',') return false;
  index += 1;
  index = skipSpaces(value, index);
  if (index >= value.length) return true;
  if (!isQuote(value[index])) return false;
  index += 1;

  const rest = value.slice(index);
  const keyPart = rest.match(/^[A-Za-z_]*/)?.[0] ?? '';
  if (keyPart.length !== rest.length) return false;
  return ['signals', 'ui_hints', 'private_sources', 'confidence'].some((key) =>
    key.startsWith(keyPart),
  );
}

function skipSpaces(value: string, start: number): number {
  let index = start;
  while (value[index] === ' ' || value[index] === '\t') index += 1;
  return index;
}

function isQuote(value: string | undefined): boolean {
  return value === '"' || value === '\u201c' || value === '\u201d';
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
  const replyKeyScanner = createTopLevelReplyKeyScanner();

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
        // The scanner is incremental (state persists across pushes), so the
        // consumed buffer can be discarded whether or not the key was found.
        const afterColonIndex = replyKeyScanner.push(buffer);
        if (afterColonIndex < 0) {
          buffer = '';
          break;
        }
        buffer = buffer.slice(afterColonIndex);
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
