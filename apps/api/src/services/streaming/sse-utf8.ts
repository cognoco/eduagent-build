import type { Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { streamErrorFrameSchema } from '@eduagent/schemas';

const DEFAULT_STREAM_ERROR_MESSAGE =
  'Something went wrong while generating a reply. Please try again.';

async function emitJsonErrorFrame(stream: SSEStreamingApi): Promise<void> {
  await stream.writeSSE({
    data: JSON.stringify(
      streamErrorFrameSchema.parse({
        type: 'error',
        code: 'STREAM_CALLBACK_ERROR',
        message: DEFAULT_STREAM_ERROR_MESSAGE,
      }),
    ),
  });
}

/**
 * [BUG-881] Wrapper around Hono's `streamSSE` that ensures the response
 * `Content-Type` declares `charset=utf-8`.
 *
 * **Why this exists:** Hono 4.x sets `Content-Type: text/event-stream`
 * without a charset. React Native's `XMLHttpRequest` (used by the mobile
 * SSE consumer in `apps/mobile/src/lib/sse.ts` since `response.body` is
 * null on Hermes) decodes `responseText` using the response's declared
 * charset; without one, iOS NSURLSession and Android HttpURLConnection
 * fall back to Latin-1 (ISO-8859-1) for `text/*` types per the legacy
 * HTTP/1.1 default, even though the bytes are UTF-8. The result is
 * mojibake — `é` becomes `Ã©`, em-dash becomes `â€"`, etc. This also
 * cascades into envelope-parse failures (closing `}` of the JSON envelope
 * gets corrupted before the parser sees it), which fires the
 * `malformed_envelope` fallback and leaves the client in a "Failed to
 * save / Try Again" dead-end (the BUG-882 symptom).
 *
 * **Why a wrapper instead of `c.header()` before the call:** `streamSSE`
 * itself calls `c.header('Content-Type', 'text/event-stream')` after our
 * code runs, so any pre-call header is overwritten. The Response object
 * `streamSSE` returns is built synchronously with the wrong header — but
 * its `headers` is a mutable `Headers` object, so we can patch it after
 * the fact. The TransformStream-backed body has not started flushing yet.
 *
 * Use in place of `streamSSE` in every API route that streams to the
 * mobile client (sessions, interview, future per-message-tool routes).
 */
export function streamSSEUtf8(
  c: Context,
  cb: (stream: SSEStreamingApi) => Promise<void>,
  onError?: (e: Error, stream: SSEStreamingApi) => Promise<void>,
): Response {
  const guardedCallback = async (stream: SSEStreamingApi): Promise<void> => {
    try {
      await cb(stream);
    } catch (caught) {
      const error =
        caught instanceof Error ? caught : new Error(String(caught));
      if (onError) {
        try {
          await onError(error, stream);
        } catch (onErrorCaught) {
          console.error(onErrorCaught);
        }
      }
      await emitJsonErrorFrame(stream);
    }
  };

  const res = streamSSE(c, guardedCallback);
  res.headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  return res;
}
