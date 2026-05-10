import { assertOk, type ApiResponseError } from './assert-ok';

function makeResponse(
  status: number,
  body: string | object,
  init: { contentType?: string } = {},
): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'Content-Type': init.contentType ?? 'application/json' },
  });
}

describe('assertOk', () => {
  it('returns the response untouched on a 2xx', async () => {
    const res = makeResponse(200, { ok: 1 });
    const okRes = await assertOk(res);
    expect(okRes).toBe(res);
    expect(okRes.ok).toBe(true);
  });

  it('returns a 204 No Content response untouched without reading the body', async () => {
    const res = new Response(null, { status: 204 });
    const okRes = await assertOk(res);
    expect(okRes).toBe(res);
    expect(okRes.status).toBe(204);
    // Body must remain readable by the caller — assertOk must not consume it.
    expect(okRes.bodyUsed).toBe(false);
  });

  it('returns a 201 Created response with empty body untouched', async () => {
    const res = new Response('', {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const okRes = await assertOk(res);
    expect(okRes).toBe(res);
    expect(okRes.status).toBe(201);
    expect(okRes.bodyUsed).toBe(false);
  });

  it('throws an ApiResponseError on a 4xx with structured body', async () => {
    const res = makeResponse(400, {
      code: 'INVALID_INPUT',
      message: 'Field is required',
      details: { field: 'name' },
    });
    await expect(assertOk(res)).rejects.toMatchObject({
      name: 'ApiResponseError',
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Field is required',
    });
  });

  it('falls back to a generic message on a 5xx without body', async () => {
    const res = new Response(null, { status: 500 });
    await expect(assertOk(res)).rejects.toMatchObject({
      name: 'ApiResponseError',
      status: 500,
      message: 'Request failed (500)',
    });
  });

  it('uses raw text for short non-JSON bodies', async () => {
    const res = new Response('upstream timeout', {
      status: 504,
      headers: { 'Content-Type': 'text/plain' },
    });
    await expect(assertOk(res)).rejects.toMatchObject({
      status: 504,
      message: 'upstream timeout',
    });
  });

  it('preserves the bodyText on the thrown error for downstream classification', async () => {
    const res = makeResponse(409, { code: 'CONFLICT', message: 'taken' });
    try {
      await assertOk(res);
      throw new Error('expected throw');
    } catch (err) {
      const apiErr = err as ApiResponseError;
      expect(apiErr.bodyText).toContain('CONFLICT');
      expect(apiErr.code).toBe('CONFLICT');
    }
  });

  // [BUG-982 / CCR-PR127-M-9] The fix for this bug encodes the
  // success-narrowing in the return type so callers can use the value
  // directly without a cast. This test pins the narrowing behaviour for a
  // discriminated union, matching the Hono RPC client response shape:
  //
  //   ClientResponse<{session: ...}, 200> | ClientResponse<{error: ...}, 400>
  //
  // Without the narrowing, .json() on the union returns the union body,
  // forcing every callsite to add `as { session: ... }`.
  it('[BUG-982] return type narrows a Hono-style discriminated response union to the success branch', async () => {
    type SuccessBody = { session: { id: string } };
    type ErrorBody = { error: string };
    type SuccessMember = Omit<Response, 'json'> & {
      ok: true;
      status: 200;
      json(): Promise<SuccessBody>;
    };
    type ErrorMember = Omit<Response, 'json'> & {
      ok: false;
      status: 400;
      json(): Promise<ErrorBody>;
    };
    type FakeUnion = SuccessMember | ErrorMember;

    const real = makeResponse(200, {
      session: { id: 's-1' },
    }) as unknown as FakeUnion;
    const okRes = await assertOk(real);

    // okRes is narrowed: TS now knows json() returns SuccessBody, no cast.
    const body = await okRes.json();
    expect(body).toEqual({ session: { id: 's-1' } });

    // Compile-time pin: assigning okRes.json()'s value to SuccessBody must
    // typecheck without a cast. This will fail at `tsc --noEmit` if the
    // narrowing regresses.
    const typed: SuccessBody = body;
    expect(typed.session.id).toBe('s-1');
  });
});
