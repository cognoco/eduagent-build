/**
 * Unit tests for parseJson — API response body boundary validator.
 *
 * [WI-1059] These tests must assert the error TYPE (instanceof ApiResponseShapeError),
 * not string-match, per AGENTS.md "Classify errors before formatting."
 */
import { z } from 'zod';
import { ApiResponseShapeError } from '@eduagent/schemas';
import { parseJson } from './parse-json';

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const testSchema = z.object({ id: z.string(), count: z.number() });

describe('parseJson', () => {
  it('returns typed data when response body matches schema', async () => {
    const res = makeResponse({ id: 'abc', count: 3 });
    const data = await parseJson(res, testSchema);
    expect(data.id).toBe('abc');
    expect(data.count).toBe(3);
  });

  it('throws ApiResponseShapeError when body has wrong field types', async () => {
    const res = makeResponse({ id: 123, count: 'not-a-number' });
    await expect(parseJson(res, testSchema)).rejects.toBeInstanceOf(
      ApiResponseShapeError,
    );
  });

  it('throws ApiResponseShapeError when body is missing required fields', async () => {
    const res = makeResponse({ id: 'abc' }); // missing count
    await expect(parseJson(res, testSchema)).rejects.toBeInstanceOf(
      ApiResponseShapeError,
    );
  });

  it('thrown ApiResponseShapeError carries schemaIssues for debugging', async () => {
    const res = makeResponse({ id: 99, count: 'bad' });
    let caught: unknown;
    try {
      await parseJson(res, testSchema);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiResponseShapeError);
    const shapeErr = caught as ApiResponseShapeError;
    // schemaIssues should carry zod issue list — not empty
    expect(shapeErr.schemaIssues).toBeDefined();
    // errorCode identifies the boundary error class without string-matching message
    expect(shapeErr.errorCode).toBe('API_RESPONSE_SHAPE_ERROR');
  });

  it('optional context string appears in error message', async () => {
    const res = makeResponse({ wrong: true });
    let caught: unknown;
    try {
      await parseJson(res, testSchema, 'GET /sessions/:id');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiResponseShapeError);
    expect((caught as Error).message).toContain('GET /sessions/:id');
  });

  it('throws ApiResponseShapeError (not SyntaxError) when 2xx body is not valid JSON', async () => {
    // Regression guard for the bounced finding: res.json() was outside try/catch,
    // so a 2xx non-JSON response (e.g. HTML error page) threw a raw SyntaxError
    // instead of the typed ApiResponseShapeError. This test must be RED before the
    // fix and GREEN after.
    const res = new Response('not valid json <!DOCTYPE html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    await expect(parseJson(res, testSchema)).rejects.toBeInstanceOf(
      ApiResponseShapeError,
    );
  });
});
