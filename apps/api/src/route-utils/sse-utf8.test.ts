import { Hono } from 'hono';
import * as sentryModule from '../services/sentry';
import { streamSSEUtf8 } from './sse-utf8';

describe('streamSSEUtf8', () => {
  it('sets the UTF-8 SSE content type', async () => {
    const app = new Hono();
    app.get('/stream', (c) =>
      streamSSEUtf8(c, async (stream) => {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'done', exchangeCount: 1 }),
        });
      }),
    );

    const res = await app.request('/stream');

    expect(res.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    );
  });

  it('emits a JSON error frame when the stream callback throws before writing frames', async () => {
    const app = new Hono();
    app.get('/stream', (c) =>
      streamSSEUtf8(c, async () => {
        throw new Error('provider socket closed');
      }),
    );

    const res = await app.request('/stream');
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain(
      'data: {"type":"error","message":"Something went wrong while generating a reply. Please try again.","code":"STREAM_CALLBACK_ERROR"}',
    );
    expect(body).not.toContain('provider socket closed');
  });

  it('calls captureException when cb throws and no onError is provided', async () => {
    const captureExceptionSpy = jest
      .spyOn(sentryModule, 'captureException')
      .mockImplementation(() => undefined);
    const thrown = new Error('provider socket closed');
    const app = new Hono();
    app.get('/stream', (c) =>
      streamSSEUtf8(c, async () => {
        throw thrown;
      }),
    );

    try {
      await app.request('/stream');

      expect(captureExceptionSpy).toHaveBeenCalledWith(thrown, {
        extra: { context: 'sse-utf8.callback.threw' },
      });
    } finally {
      captureExceptionSpy.mockRestore();
    }
  });

  it('still emits a JSON error frame when captureException throws', async () => {
    const captureExceptionSpy = jest
      .spyOn(sentryModule, 'captureException')
      .mockImplementation(() => {
        throw new Error('sentry unavailable');
      });
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const app = new Hono();
    app.get('/stream', (c) =>
      streamSSEUtf8(c, async () => {
        throw new Error('provider socket closed');
      }),
    );

    try {
      const res = await app.request('/stream');
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(body).toContain(
        'data: {"type":"error","message":"Something went wrong while generating a reply. Please try again.","code":"STREAM_CALLBACK_ERROR"}',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      captureExceptionSpy.mockRestore();
    }
  });
});
