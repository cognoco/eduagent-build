import {
  transcriptResponseSchema,
  type LiveTranscriptResponse,
} from '@eduagent/schemas';
import type { Page, Response } from '@playwright/test';

export interface ExpectedTranscriptExchange {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExpectedSeededTranscript {
  sessionId: string;
  exchanges: readonly ExpectedTranscriptExchange[];
}

function isTranscriptResponse(response: Response, sessionId: string): boolean {
  const request = response.request();
  const url = new URL(response.url());
  return (
    request.method() === 'GET' &&
    url.pathname.endsWith(`/sessions/${sessionId}/transcript`)
  );
}

async function inspectTranscriptResponse(
  responsePromise: Promise<Response>,
  expected: ExpectedSeededTranscript,
): Promise<LiveTranscriptResponse> {
  let response: Response;
  try {
    response = await responsePromise;
  } catch (cause) {
    throw new Error(
      `[transcript:transport] No exact transcript response arrived for session ${expected.sessionId}`,
      { cause },
    );
  }

  if (!response.ok()) {
    throw new Error(
      `[transcript:transport] Transcript request for session ${expected.sessionId} returned ${response.status()}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new Error(
      `[transcript:api-payload] Transcript response for session ${expected.sessionId} was not JSON`,
      { cause },
    );
  }

  const parsed = transcriptResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.archived) {
    const detail = parsed.success
      ? 'returned an archived transcript'
      : parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(
      `[transcript:api-payload] Transcript response for session ${expected.sessionId} was invalid: ${detail}`,
    );
  }

  const transcript = parsed.data;
  if (transcript.session.sessionId !== expected.sessionId) {
    throw new Error(
      `[transcript:api-payload] Expected session ${expected.sessionId}, received ${transcript.session.sessionId}`,
    );
  }
  if (transcript.exchanges.length !== expected.exchanges.length) {
    throw new Error(
      `[transcript:api-payload] Expected ${expected.exchanges.length} persisted exchanges for session ${expected.sessionId}, received ${transcript.exchanges.length}`,
    );
  }

  expected.exchanges.forEach((expectedExchange, index) => {
    const actual = transcript.exchanges[index];
    if (!actual || actual.role !== expectedExchange.role) {
      throw new Error(
        `[transcript:api-payload] Expected ${expectedExchange.role} exchange at index ${index} for session ${expected.sessionId}`,
      );
    }
    if (!actual.eventId) {
      throw new Error(
        `[transcript:api-payload] Persisted ${expectedExchange.role} exchange at index ${index} has no event identity`,
      );
    }
    if (actual.content !== expectedExchange.content) {
      throw new Error(
        `[transcript:transformed-content] Expected ${expectedExchange.role} content ${JSON.stringify(expectedExchange.content)}, received ${JSON.stringify(actual.content)}`,
      );
    }
  });

  if (transcript.exchanges[0]?.eventId === transcript.exchanges[1]?.eventId) {
    throw new Error(
      '[transcript:api-payload] Persisted user and assistant exchanges share an event identity',
    );
  }

  return transcript;
}

/** Arm this observation before the action that starts transcript navigation. */
export function observeSeededTranscript(
  page: Page,
  expected: ExpectedSeededTranscript,
): Promise<LiveTranscriptResponse> {
  const responsePromise = page.waitForResponse((response) =>
    isTranscriptResponse(response, expected.sessionId),
  );
  return inspectTranscriptResponse(responsePromise, expected);
}
