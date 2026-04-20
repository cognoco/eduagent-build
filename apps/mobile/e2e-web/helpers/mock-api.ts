import type { Page, Request, Route } from '@playwright/test';

type PathMatcher = string | RegExp;

interface JsonMockResponse {
  body: unknown;
  headers?: Record<string, string>;
  status?: number;
}

interface SseMockResponse {
  headers?: Record<string, string>;
  status?: number;
  events: Array<
    | { type: 'chunk'; content: string }
    | { type: 'done'; payload: Record<string, unknown> }
  >;
}

function matchesPathname(pathname: string, matcher: PathMatcher): boolean {
  return typeof matcher === 'string'
    ? pathname === matcher
    : matcher.test(pathname);
}

function matchesRequest(
  request: Request,
  method: string,
  matcher: PathMatcher
): boolean {
  const url = new URL(request.url());
  return request.method() === method && matchesPathname(url.pathname, matcher);
}

function buildSseBody(
  events: SseMockResponse['events'],
  appendDoneSentinel = true
): string {
  const chunks = events.map((event) =>
    event.type === 'chunk'
      ? `data: ${JSON.stringify({ type: 'chunk', content: event.content })}\n\n`
      : `data: ${JSON.stringify({ type: 'done', ...event.payload })}\n\n`
  );

  if (appendDoneSentinel) {
    chunks.push('data: [DONE]\n\n');
  }

  return chunks.join('');
}

async function fulfillJson(route: Route, response: JsonMockResponse) {
  await route.fulfill({
    status: response.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...response.headers,
    },
    body: JSON.stringify(response.body),
  });
}

async function fulfillSse(route: Route, response: SseMockResponse) {
  await route.fulfill({
    status: response.status ?? 200,
    headers: {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      ...response.headers,
    },
    body: buildSseBody(response.events),
  });
}

async function fulfillExhaustedMock(
  route: Route,
  method: string,
  matcher: PathMatcher
) {
  const label = typeof matcher === 'string' ? matcher : matcher.toString();
  await route.fulfill({
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
    body: `No mock responses left for ${method} ${label}`,
  });
}

export async function mockJsonSequence(
  page: Page,
  options: {
    method?: string;
    pathname: PathMatcher;
    responses: JsonMockResponse[];
  }
): Promise<void> {
  const method = options.method ?? 'GET';
  const queue = [...options.responses];

  await page.route('**/*', async (route) => {
    if (!matchesRequest(route.request(), method, options.pathname)) {
      await route.fallback();
      return;
    }

    const next = queue.shift();
    if (!next) {
      await fulfillExhaustedMock(route, method, options.pathname);
      return;
    }

    await fulfillJson(route, next);
  });
}

export async function mockJson(
  page: Page,
  options: {
    method?: string;
    pathname: PathMatcher;
    response: JsonMockResponse;
  }
): Promise<void> {
  await mockJsonSequence(page, {
    method: options.method,
    pathname: options.pathname,
    responses: [options.response],
  });
}

export async function mockJsonForever(
  page: Page,
  options: {
    method?: string;
    pathname: PathMatcher;
    response: JsonMockResponse;
  }
): Promise<void> {
  const method = options.method ?? 'GET';

  await page.route('**/*', async (route) => {
    if (!matchesRequest(route.request(), method, options.pathname)) {
      await route.fallback();
      return;
    }

    await fulfillJson(route, options.response);
  });
}

export async function mockSseSequence(
  page: Page,
  options: {
    method?: string;
    pathname: PathMatcher;
    responses: SseMockResponse[];
  }
): Promise<void> {
  const method = options.method ?? 'POST';
  const queue = [...options.responses];

  await page.route('**/*', async (route) => {
    if (!matchesRequest(route.request(), method, options.pathname)) {
      await route.fallback();
      return;
    }

    const next = queue.shift();
    if (!next) {
      await fulfillExhaustedMock(route, method, options.pathname);
      return;
    }

    await fulfillSse(route, next);
  });
}

export async function mockSse(
  page: Page,
  options: {
    method?: string;
    pathname: PathMatcher;
    response: SseMockResponse;
  }
): Promise<void> {
  await mockSseSequence(page, {
    method: options.method,
    pathname: options.pathname,
    responses: [options.response],
  });
}

export async function mockSseForever(
  page: Page,
  options: {
    method?: string;
    pathname: PathMatcher;
    response: SseMockResponse;
  }
): Promise<void> {
  const method = options.method ?? 'POST';

  await page.route('**/*', async (route) => {
    if (!matchesRequest(route.request(), method, options.pathname)) {
      await route.fallback();
      return;
    }

    await fulfillSse(route, options.response);
  });
}
